"""Explicit, independently testable formula and polar NetCDF handling.

This adapter supports common polar layouts, not every radar convention.
No correction, geospatial validation or gauge calibration is implied.
"""
from datetime import datetime
import math
import numpy as np
from netCDF4 import Dataset

VERSION = 'radar-metrology-prototype-0.1.0'


def rainfall(dbz, a=200.0, b=1.6):
    values = np.array([np.nan if v is None else v for v in dbz], dtype=float)
    if not math.isfinite(a) or not math.isfinite(b) or a <= 0 or b <= 0:
        raise ValueError('Z–R coefficients must be finite and positive.')
    valid = np.isfinite(values)
    if np.any((values[valid] < -80) | (values[valid] > 100)):
        raise ValueError('Reflectivity must be between -80 and 100 dBZ for this prototype.')
    with np.errstate(over='ignore', invalid='ignore'):
        rates = (10.0 ** (values / 10.0) / a) ** (1.0 / b)
    if np.any(~np.isfinite(rates[valid])):
        raise ValueError('The selected coefficients produce an unrepresentable rainfall rate.')
    return [float(v) if math.isfinite(v) else None for v in rates]


def integrate(samples, max_gap_minutes=15):
    if len(samples) < 2:
        raise ValueError('Accumulation requires at least two timestamped rate samples.')
    times, arrays = [], []
    for sample in samples:
        try:
            t = datetime.fromisoformat(sample['timestamp'].replace('Z', '+00:00'))
        except (ValueError, TypeError):
            raise ValueError('Each timestamp must be a valid ISO 8601 datetime.')
        if t.tzinfo is None or t.utcoffset() is None:
            raise ValueError('Timestamps must include a timezone or Z suffix.')
        times.append(t)
        row = np.array([np.nan if v is None else v for v in sample['rates']], dtype=float)
        if not len(row) or np.any(np.isinf(row)) or np.any(row[np.isfinite(row)] < 0):
            raise ValueError('Rates must be non-negative finite values or null masks.')
        arrays.append(row)
    if len({row.shape for row in arrays}) != 1:
        raise ValueError('All samples must have the same number of co-registered gates.')
    if sum(len(row) for row in arrays) > 1_000_000:
        raise ValueError('This prototype accepts at most 1,000,000 rate values per integration.')
    total = np.zeros_like(arrays[0]); covered = np.zeros_like(arrays[0]); gaps = []
    for i in range(len(times) - 1):
        hours = (times[i + 1] - times[i]).total_seconds() / 3600.0
        if hours <= 0:
            raise ValueError('Timestamps must be strictly increasing; remove duplicates.')
        if hours * 60 > max_gap_minutes:
            gaps.append({'start': samples[i]['timestamp'], 'end': samples[i + 1]['timestamp'], 'minutes': hours * 60})
            continue
        valid = np.isfinite(arrays[i]) & np.isfinite(arrays[i + 1])
        total[valid] += (arrays[i][valid] + arrays[i + 1][valid]) / 2 * hours
        covered[valid] += hours
    return {'accumulated_mm': [float(v) if covered[i] > 0 else None for i, v in enumerate(total)],
            'covered_hours': covered.tolist(), 'excluded_gaps': gaps,
            'period_hours': (times[-1] - times[0]).total_seconds() / 3600,
            'method': 'Trapezoidal integration; intervals above gap threshold excluded',
            'max_gap_minutes': max_gap_minutes, 'requires_coregistered_gates': True, 'version': VERSION}


def _groups(group, prefix=''):
    yield prefix, group
    for name, child in group.groups.items():
        yield from _groups(child, f'{prefix}/{name}')


def _attribute(value):
    if isinstance(value, np.ndarray):
        return [_attribute(v) for v in value.ravel()[:32]]
    if isinstance(value, (float, np.floating)):
        return float(value) if math.isfinite(value) else None
    if isinstance(value, (int, np.integer)):
        return int(value)
    return str(value)[:1000]


def _find(group, candidates):
    current = group
    while current is not None:
        keys = {name.lower(): var for name, var in current.variables.items()}
        for name in candidates:
            if name.lower() in keys:
                return keys[name.lower()]
        current = current.parent
    return None


def _sweeps(group):
    start = _find(group, ['sweep_start_ray_index'])
    if start is not None:
        return int(start.size)
    az = _find(group, ['azimuth', 'azi', 'radialAzim'])
    if az is not None and az.ndim == 2:
        return int(az.shape[0])
    for name in ['sweep', 'sweeps', 'elevation']:
        if name in group.dimensions:
            return len(group.dimensions[name])
    return 1


def inspect_netcdf(path):
    with Dataset(path, 'r') as ds:
        fields, groups = [], []
        for prefix, group in _groups(ds):
            variables = []
            for name, var in group.variables.items():
                units = str(getattr(var, 'units', '')).strip()
                full = f'{prefix}/{name}'.lstrip('/')
                variables.append({'name': name, 'shape': list(var.shape), 'dimensions': list(var.dimensions),
                                  'dtype': str(var.dtype), 'attributes': {attr: _attribute(var.getncattr(attr)) for attr in var.ncattrs()}})
                packed = var.ndim == 1 and _find(group, ['ray_start_index']) is not None and _find(group, ['ray_n_gates']) is not None and var.dimensions[0] == 'n_points'
                if units.lower() in ('dbz', 'dbzh') and (var.ndim >= 2 or packed):
                    fields.append({'name': full, 'units': units, 'sweeps': _sweeps(group)})
            groups.append({'path': prefix or '/', 'dimensions': {k: len(v) for k, v in group.dimensions.items()}, 'variables': variables})
        return {'fields': fields, 'sweeps': max((f['sweeps'] for f in fields), default=1),
                'metadata': {'global_attributes': {a: _attribute(ds.getncattr(a)) for a in ds.ncattrs()},
                             'groups': groups, 'processing_version': VERSION}}


def _scalar(group, names, fallback=None):
    var = _find(group, names)
    if var is not None:
        values = np.ma.asarray(var[:]).compressed()
        if len(values):
            return float(values[0])
    for name in names:
        if name in group.ncattrs():
            try:
                return float(group.getncattr(name))
            except (TypeError, ValueError):
                pass
    return fallback


def read_scan(path, field, sweep=0):
    with Dataset(path, 'r') as ds:
        parts = field.split('/'); group = ds
        for name in parts[:-1]:
            if name not in group.groups:
                raise ValueError('The selected field group does not exist.')
            group = group.groups[name]
        if parts[-1] not in group.variables:
            raise ValueError('Select a reflectivity field reported by file inspection.')
        var = group.variables[parts[-1]]
        if str(getattr(var, 'units', '')).strip().lower() not in ('dbz', 'dbzh'):
            raise ValueError('Only verified logarithmic reflectivity in dBZ is supported.')
        az_var = _find(group, ['azimuth', 'azi', 'radialAzim'])
        range_var = _find(group, ['range', 'distance', 'gate_range', 'radialDist'])
        if az_var is None or range_var is None:
            raise ValueError('This adapter needs explicit azimuth and range coordinates. This file requires another radar-format adapter.')
        az_units = str(getattr(az_var, 'units', '')).lower()
        if not ('deg' in az_units or az_units in ('degree', 'degrees')):
            raise ValueError('Azimuth coordinates must declare degree units.')
        if range_var.ndim != 1 or az_var.ndim not in (1, 2):
            raise ValueError('Unsupported coordinate layout: expected 1D range and 1D/2D azimuth.')
        start_var = _find(group, ['sweep_start_ray_index']); end_var = _find(group, ['sweep_end_ray_index'])
        if sweep < 0 or sweep >= _sweeps(group):
            raise ValueError('The selected sweep is outside this field’s available sweeps.')
        mode_var = _find(group, ['sweep_mode'])
        if mode_var is not None:
            raw_mode = mode_var[sweep]
            mode = raw_mode.tobytes().decode('utf-8', errors='ignore').strip('\x00 ') if hasattr(raw_mode, 'tobytes') else str(raw_mode)
            if 'rhi' in mode.lower() or 'vertical' in mode.lower():
                raise ValueError('This sweep is an RHI/vertical scan. The prototype PPI viewer supports azimuth sweeps only.')
        az_slice = slice(None)
        if start_var is not None:
            if end_var is None:
                raise ValueError('Sweep end-ray indices are required with start-ray indices.')
            az_slice = slice(int(start_var[sweep]), int(end_var[sweep]) + 1)
        range_dim = range_var.dimensions[0]; ray_dim = az_var.dimensions[-1]
        packed = var.ndim == 1 and var.dimensions[0] == 'n_points'
        if not packed and (range_dim not in var.dimensions or ray_dim not in var.dimensions or range_dim == ray_dim):
            raise ValueError('Reflectivity dimensions do not match the polar coordinates.')
        index = []
        remaining_dims = []
        for dim, length in ([] if packed else zip(var.dimensions, var.shape)):
            if dim == range_dim:
                index.append(slice(None)); remaining_dims.append(dim)
            elif dim == ray_dim:
                index.append(az_slice); remaining_dims.append(dim)
            elif az_var.ndim == 2 and dim == az_var.dimensions[0]:
                index.append(sweep)
            elif length == 1:
                index.append(0)
            else:
                raise ValueError(f'Unsupported additional dimension {dim}; an explicit adapter is required.')
        # Subset before decoding; render downsampled values only after selecting a sweep.
        if packed:
            starts = _find(group, ['ray_start_index']); counts = _find(group, ['ray_n_gates'])
            if starts is None or counts is None or az_var.ndim != 1:
                raise ValueError('Packed polar scans require ray start indices and gate counts.')
            selected_rays = np.arange(len(az_var))[az_slice]
            data = np.ma.masked_all((len(selected_rays), len(range_var)), dtype=float)
            origin = _find(group, ['ray_start_range']); spacing = _find(group, ['ray_gate_spacing'])
            range_native = np.asarray(range_var[:], dtype=float)
            for row, ray in enumerate(selected_rays):
                start, count = int(starts[ray]), int(counts[ray])
                if start < 0 or count < 0 or start + count > var.size or count > len(range_var):
                    raise ValueError('Packed ray indices or gate counts are invalid.')
                if origin is not None and spacing is not None and count:
                    expected = float(origin[ray]) + np.arange(count) * float(spacing[ray])
                    if not np.allclose(expected, range_native[:count], rtol=1e-5, atol=1e-3):
                        raise ValueError('Variable ray gate spacing requires a separate geometry adapter.')
                data[row, :count] = var[start:start+count]
        else:
            data = np.ma.asarray(var[tuple(index)], dtype=float)
        if data.ndim != 2:
            raise ValueError('The selected reflectivity field is not a two-dimensional polar sweep.')
        if not packed and remaining_dims.index(ray_dim) != 0:
            data = data.T
        az = np.ma.asarray(az_var[sweep, :] if az_var.ndim == 2 else az_var[az_slice], dtype=float)
        ranges = np.ma.asarray(range_var[:], dtype=float)
        if np.any(np.ma.getmaskarray(az)) or np.any(np.ma.getmaskarray(ranges)):
            raise ValueError('Coordinates contain missing values.')
        az, ranges = np.asarray(az), np.asarray(ranges)
        units = str(getattr(range_var, 'units', '')).lower().strip()
        if units in ('m', 'meter', 'meters', 'metre', 'metres'):
            ranges = ranges / 1000
        elif units not in ('km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'):
            raise ValueError('Range coordinates must declare metre or kilometre units.')
        if len(ranges) < 2 or len(az) < 2 or data.shape != (len(az), len(ranges)):
            raise ValueError('Insufficient or mismatched polar scan dimensions.')
        if not np.all(np.isfinite(ranges)) or np.any(np.diff(ranges) <= 0) or np.any(ranges < 0) or not np.all(np.isfinite(az)):
            raise ValueError('Range must increase and polar coordinates must be finite.')
        ray_step = max(1, math.ceil(len(az) / 360)); gate_step = max(1, math.ceil(len(ranges) / 220))
        data = data[::ray_step, ::gate_step]; az = az[::ray_step] % 360; ranges = ranges[::gate_step]
        order = np.argsort(az); az = az[order]; data = data[order]
        values = np.ma.filled(data, np.nan); values[(values < -80) | (values > 100)] = np.nan
        lat = _scalar(group, ['latitude', 'lat', 'radar_latitude'], _scalar(ds, ['latitude', 'lat', 'radar_latitude']))
        lon = _scalar(group, ['longitude', 'lon', 'radar_longitude'], _scalar(ds, ['longitude', 'lon', 'radar_longitude']))
        elevation_var = _find(group, ['elevation', 'fixed_angle', 'radialElev'])
        elevation = 0.0
        if elevation_var is not None:
            ev = np.ma.asarray(elevation_var[:])
            if ev.ndim == 2:
                ev = ev[sweep]
            elif ev.size == _sweeps(group):
                ev = ev[sweep:sweep+1]
            elif ev.size == az_var.size:
                ev = ev[az_slice]
            elevation = float(np.ma.median(ev))
        timestamp = str(getattr(ds, 'time_coverage_start', 'Not provided'))
        time_var = _find(group, ['time'])
        if time_var is not None and hasattr(time_var, 'units') and 'since' in time_var.units:
            from netCDF4 import num2date
            try:
                value = time_var[int(az_slice.start or 0)] if time_var.ndim else time_var[()]
                timestamp = num2date(value, time_var.units, calendar=getattr(time_var, 'calendar', 'standard')).isoformat() + 'Z'
            except (ValueError, IndexError, TypeError):
                pass
        return {'timestamp': timestamp, 'synthetic': False, 'latitude': lat, 'longitude': lon,
                'elevation': elevation, 'azimuths': az.tolist(), 'ranges': ranges.tolist(),
                'values': [[float(v) if math.isfinite(v) else None for v in row] for row in values],
                'field': field, 'units': 'dBZ', 'sweep': sweep,
                'source': 'Uploaded NetCDF; netCDF4 automatic mask/scale decoding; no attenuation correction',
                'processing': {'version': VERSION, 'ray_stride': ray_step, 'gate_stride': gate_step, 'display_subsampled': ray_step > 1 or gate_step > 1}}
