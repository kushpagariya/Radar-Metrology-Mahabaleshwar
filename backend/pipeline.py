"""MBL-RADAR daily archive pipeline.

Ingests CfRadial-1.4 volumes (Sigmet IRIS via RadxConvert, packed ``n_points`` layout) from zip archives or
folders, validates each volume against the observed scan profile, and writes per-day products:

* ``catalog.json``  volume list, timing, per-volume statistics, profile checks and gaps.
* ``low.npz``       quality-controlled lowest-sweep reflectivity on a fixed 1° × 600 m polar grid (int8, 0.5 dB),
                    the co-registered cube used for playback, comparison, gate time series and accumulation.

Raw files are not copied. Full-resolution sweeps are read on demand from the original source.

Usage::

    python -m backend.pipeline ingest "C:/path/full_sweeps.zip" [more zips or folders] [--out data/archive]
    python -m backend.pipeline summary [--out data/archive]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import time
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from netCDF4 import chartostring

from .science import VERSION, open_dataset

PIPELINE_VERSION = 'mbl-archive-1'
DEFAULT_OUT = Path(os.environ.get('RADAR_ARCHIVE_DIR', Path(__file__).resolve().parent.parent / 'data' / 'archive'))

# Scan profile observed on 15, 18 and 23 September 2025. Deviations are recorded, not fatal.
PROFILE = {
    'instrument_name': 'MBL-RADAR',
    'fixed_angles': [0.5, 1.0, 1.5, 3.0, 6.0, 9.0, 12.0, 30.0, 45.0, 60.0, 89.0],
    'gate_spacing_m': 150.0,
    'required_fields': ['DBZ', 'DBZ_TOT', 'RHOHV'],
}

# Product grid: 360 one-degree azimuth bins × 600 m range bins (4 native 150 m gates) to 169.8 km.
AZ_BINS = 360
GATE_FACTOR = 4
QC = {'field': 'DBZ', 'rhohv_min': 0.7, 'min_valid_subgates': 2, 'max_az_offset_deg': 0.75}
ENCODE_SCALE = 2.0  # int8 storage: value = round(dBZ * 2), -128 = no data → range -63.5..63.5 dBZ
NODATA = -128
DEFAULT_ZR = (200.0, 1.6)
NAME_TIME = re.compile(r'cfrad\.(\d{8}_\d{6})')


@dataclass(frozen=True)
class VolumeRef:
    source: str          # zip archive or folder path
    member: str | None   # zip member name, or None for a plain file
    start: datetime      # from the CfRadial file name (UTC)

    @property
    def name(self):
        return (self.member or self.source).replace('\\', '/').split('/')[-1]

    def read_bytes(self) -> bytes:
        if self.member is None:
            return Path(self.source).read_bytes()
        with zipfile.ZipFile(self.source) as zf:
            return zf.read(self.member)


def _start_from_name(name):
    m = NAME_TIME.search(name)
    return datetime.strptime(m.group(1), '%Y%m%d_%H%M%S').replace(tzinfo=timezone.utc) if m else None


def discover(sources):
    """Find CfRadial volumes in zip archives, folders or single files."""
    refs = []
    for src in sources:
        p = Path(src)
        if p.is_file() and p.suffix.lower() == '.zip':
            with zipfile.ZipFile(p) as zf:
                for n in zf.namelist():
                    t = _start_from_name(n)
                    if n.lower().endswith('.nc') and t:
                        refs.append(VolumeRef(str(p.resolve()), n, t))
        elif p.is_dir():
            for f in sorted(p.rglob('*.nc')):
                t = _start_from_name(f.name)
                if t:
                    refs.append(VolumeRef(str(f.resolve()), None, t))
        elif p.is_file() and p.suffix.lower() == '.nc' and _start_from_name(p.name):
            refs.append(VolumeRef(str(p.resolve()), None, _start_from_name(p.name)))
        else:
            raise ValueError(f'Not a zip, folder or CfRadial .nc file: {src}')
    # De-duplicate identical volumes supplied twice, keep chronological order.
    unique = {}
    for r in refs:
        unique.setdefault((r.start, r.name), r)
    return sorted(unique.values(), key=lambda r: r.start)


def _text(var):
    return [str(s).strip() for s in np.atleast_1d(chartostring(var[:]))]


def _sweep_slice(ds, sweep):
    s0 = int(ds.variables['sweep_start_ray_index'][sweep]); s1 = int(ds.variables['sweep_end_ray_index'][sweep])
    return s0, s1 + 1


def _field_rays(ds, name, a, b):
    """Decode a packed field for rays [a, b) into a (rays, max_gates) masked array."""
    var = ds.variables[name]
    starts = ds.variables['ray_start_index'][a:b]; counts = ds.variables['ray_n_gates'][a:b]
    n = int(counts.max()) if len(counts) else 0
    lo, hi = int(starts[0]), int(starts[-1] + counts[-1])
    flat = np.ma.asarray(var[lo:hi], dtype=np.float32)
    out = np.ma.masked_all((b - a, n), dtype=np.float32)
    for i, (s, c) in enumerate(zip(starts, counts)):
        out[i, :c] = flat[int(s) - lo:int(s) - lo + int(c)]
    return out


def regrid_lowest_sweep(ds, sweep=0, qc=QC):
    """QC'd reflectivity on the fixed product grid.

    Returns (grid, sampled): float32 (360, n_bins) with NaN for no echo / failed QC, and a bool (360,) mask of
    azimuth bins that a ray actually sampled. Unsampled bins are missing data, not "no rain".
    """
    a, b = _sweep_slice(ds, sweep)
    dbz = _field_rays(ds, qc['field'], a, b)
    rho = _field_rays(ds, 'RHOHV', a, b)
    valid = ~np.ma.getmaskarray(dbz) & ~np.ma.getmaskarray(rho) & (np.ma.filled(rho, 0) >= qc['rhohv_min'])
    values = np.where(valid, np.ma.filled(dbz, np.nan), np.nan)
    # Range: average 4 native gates in linear Z, require ≥2 valid sub-gates.
    n_bins = values.shape[1] // GATE_FACTOR
    sub = values[:, :n_bins * GATE_FACTOR].reshape(values.shape[0], n_bins, GATE_FACTOR)
    with np.errstate(invalid='ignore'):
        lin = 10.0 ** (sub / 10.0)
        count = np.sum(np.isfinite(lin), axis=2)
        mean = np.nansum(lin, axis=2) / np.maximum(count, 1)
        binned = np.where(count >= qc['min_valid_subgates'], 10.0 * np.log10(np.maximum(mean, 1e-10)), np.nan)
    # Azimuth: nearest ray to each 1° bin centre within ±0.75°; uncovered bins stay empty (never filled).
    az = np.asarray(ds.variables['azimuth'][a:b], dtype=float) % 360
    centres = np.arange(AZ_BINS) + 0.5
    diff = np.abs((az[None, :] - centres[:, None] + 180) % 360 - 180)
    nearest = np.argmin(diff, axis=1)
    ok = diff[np.arange(AZ_BINS), nearest] <= qc['max_az_offset_deg']
    grid = np.full((AZ_BINS, n_bins), np.nan, dtype=np.float32)
    grid[ok] = binned[nearest[ok]]
    return grid, ok


def grid_ranges_km(n_bins, spacing_m=PROFILE['gate_spacing_m']):
    """Centre range (km) of each product bin; native gate 0 is centred at 0 m."""
    return (np.arange(n_bins) * GATE_FACTOR + (GATE_FACTOR - 1) / 2) * spacing_m / 1000.0


def rain_rate(dbz, a=DEFAULT_ZR[0], b=DEFAULT_ZR[1]):
    with np.errstate(invalid='ignore', over='ignore'):
        return (10.0 ** (dbz / 10.0) / a) ** (1.0 / b)


def grid_stats(grid, sampled, ranges_km, a=DEFAULT_ZR[0], b=DEFAULT_ZR[1]):
    """Areal statistics for one product grid (areas in km², rates in mm/hr)."""
    dr = ranges_km[1] - ranges_km[0]
    cell_area = ranges_km * dr * math.radians(1.0)  # per-bin area for 1° rays
    finite = np.isfinite(grid)
    area = lambda thr: float(np.sum(np.where(finite & (grid >= thr), cell_area[None, :], 0.0)))
    rates = np.where(finite & (grid >= 10), rain_rate(grid, a, b), 0.0)  # <10 dBZ treated as no rain
    covered = sampled
    return {
        'max_dbz': round(float(np.nanmax(grid)), 1) if finite.any() else None,
        'valid_bins': int(finite.sum()),
        'area_20_km2': round(area(20), 1),
        'area_35_km2': round(area(35), 1),
        'area_45_km2': round(area(45), 1),
        'mean_rate_mm_hr': round(float(np.sum(rates * cell_area[None, :]) / max(1e-9, np.sum(cell_area) * covered.sum())), 4),
        'azimuth_coverage': round(float(covered.mean()), 4),
    }


def check_profile(ds):
    issues = []
    name = str(getattr(ds, 'instrument_name', ''))
    if name != PROFILE['instrument_name']:
        issues.append(f'instrument_name {name!r} differs from {PROFILE["instrument_name"]}')
    fixed = [round(float(v), 2) for v in ds.variables['fixed_angle'][:]]
    if fixed != PROFILE['fixed_angles']:
        issues.append(f'fixed angles {fixed} differ from profile')
    spacing = np.unique(np.asarray(ds.variables['ray_gate_spacing'][:]))
    if spacing.size != 1 or abs(float(spacing[0]) - PROFILE['gate_spacing_m']) > 1e-3:
        issues.append(f'gate spacing {spacing.tolist()} differs from profile')
    fields = [v for v, var in ds.variables.items() if var.dimensions == ('n_points',)]
    missing = [f for f in PROFILE['required_fields'] if f not in fields]
    if missing:
        issues.append(f'missing fields {missing}')
    return issues, fixed, fields


def process_volume(ref: VolumeRef):
    raw = ref.read_bytes()
    with open_dataset(raw) as ds:
        issues, fixed, fields = check_profile(ds)
        if any(i.startswith('missing fields') for i in issues):
            raise ValueError('; '.join(issues))
        s0 = np.asarray(ds.variables['sweep_start_ray_index'][:]); s1 = np.asarray(ds.variables['sweep_end_ray_index'][:])
        rays = (s1 - s0 + 1).tolist()
        grid, sampled = regrid_lowest_sweep(ds, 0)
        meta = {
            'name': ref.name,
            'start': str(getattr(ds, 'time_coverage_start', ref.start.isoformat())).replace('Z', '+00:00'),
            'end': str(getattr(ds, 'time_coverage_end', '')).replace('Z', '+00:00'),
            'volume_number': int(ds.variables['volume_number'][...]),
            'scan_name': str(getattr(ds, 'scan_name', '')),
            'rays_per_sweep': rays,
            'fixed_angles': fixed,
            'fields': sorted(fields),
            'site': {
                'name': str(getattr(ds, 'instrument_name', '')),
                'latitude': float(ds.variables['latitude'][...]),
                'longitude': float(ds.variables['longitude'][...]),
                'altitude_m': float(ds.variables['altitude'][...]),
                'beamwidth_deg': float(ds.variables['radar_beam_width_h'][...]),
                'frequency_ghz': round(float(ds.variables['frequency'][0]) / 1e9, 4),
            },
            'issues': issues,
        }
    return meta, (grid, sampled), len(raw)


def encode(grid):
    out = np.full(grid.shape, NODATA, dtype=np.int8)
    ok = np.isfinite(grid)
    out[ok] = np.clip(np.round(grid[ok] * ENCODE_SCALE), -127, 127).astype(np.int8)
    return out


def decode(cube):
    return np.where(cube == NODATA, np.nan, cube.astype(np.float32) / ENCODE_SCALE)


def find_gaps(starts, expected_minutes=10, gap_minutes=15):
    gaps = []
    for t0, t1 in zip(starts, starts[1:]):
        minutes = (t1 - t0).total_seconds() / 60
        if minutes > gap_minutes:
            gaps.append({'after': t0.isoformat(), 'before': t1.isoformat(), 'minutes': round(minutes, 1),
                         'missing_volumes': max(0, round(minutes / expected_minutes) - 1)})
    return gaps


def ingest_day(day, refs, out_dir, log=print):
    t0 = time.perf_counter()
    metas, grids, masks, failures, total_bytes = [], [], [], [], 0
    for i, ref in enumerate(refs):
        try:
            meta, (grid, sampled), size = process_volume(ref)
        except Exception as exc:  # keep going; a single corrupt volume must not lose the day
            failures.append({'name': ref.name, 'error': str(exc)[:300]})
            continue
        meta['source'] = {'path': ref.source, 'member': ref.member}
        meta['index'] = len(metas)
        metas.append(meta); grids.append(grid); masks.append(sampled); total_bytes += size
        if (i + 1) % 24 == 0:
            log(f'  {day}: {i + 1}/{len(refs)} volumes')
    if not metas:
        raise ValueError(f'No readable volumes for {day}.')
    n_bins = min(g.shape[1] for g in grids)
    cube = np.stack([g[:, :n_bins] for g in grids]); sampled = np.stack(masks)
    ranges = grid_ranges_km(n_bins)
    for meta, grid, mask in zip(metas, cube, sampled):
        meta['stats'] = grid_stats(grid, mask, ranges)
    starts = [datetime.fromisoformat(m['start']) for m in metas]
    day_dir = Path(out_dir) / metas[0]['site']['name'] / day
    day_dir.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(day_dir / 'low.npz', cube=encode(cube), sampled=sampled,
                        times=np.array([s.timestamp() for s in starts]), ranges_km=ranges.astype(np.float32),
                        azimuths=(np.arange(AZ_BINS) + 0.5).astype(np.float32))
    peak = max((m['stats']['max_dbz'] for m in metas if m['stats']['max_dbz'] is not None), default=None)
    catalog = {
        'date': day,
        'site': metas[0]['site'],
        'fixed_angles': metas[0]['fixed_angles'],
        'fields': metas[0]['fields'],
        'scan_name': metas[0]['scan_name'],
        'volume_count': len(metas),
        'expected_volumes': 144,
        'gaps': find_gaps(starts),
        'failures': failures,
        'profile_deviations': sorted({i for m in metas for i in m['issues']}),
        'summary': {
            'peak_dbz': peak,
            'max_area_35_km2': max(m['stats']['area_35_km2'] for m in metas),
            'raw_megabytes': round(total_bytes / 1e6, 1),
        },
        'product': {
            'file': 'low.npz', 'sweep': 0, 'grid': f'{AZ_BINS} × {n_bins} (1° × {GATE_FACTOR * PROFILE["gate_spacing_m"]:.0f} m)',
            'qc': QC, 'encoding': 'int8, dBZ × 2, -128 = no data',
        },
        'pipeline': PIPELINE_VERSION, 'software': VERSION,
        'processed_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'processing_seconds': round(time.perf_counter() - t0, 1),
        'volumes': metas,
    }
    (day_dir / 'catalog.json').write_text(json.dumps(catalog, indent=1), encoding='utf-8')
    log(f'  {day}: {len(metas)} volumes, {len(catalog["gaps"])} gap(s), {len(failures)} failure(s), '
        f'peak {peak} dBZ, {catalog["processing_seconds"]} s -> {day_dir}')
    return catalog


def ingest(sources, out_dir=DEFAULT_OUT, log=print):
    refs = discover(sources)
    if not refs:
        raise ValueError('No CfRadial volumes found.')
    by_day = defaultdict(list)
    for r in refs:
        by_day[r.start.strftime('%Y-%m-%d')].append(r)
    log(f'Found {len(refs)} volumes across {len(by_day)} day(s): {", ".join(sorted(by_day))}')
    return [ingest_day(day, by_day[day], out_dir, log) for day in sorted(by_day)]


def accumulate(cube_dbz, sampled, times_s, a=DEFAULT_ZR[0], b=DEFAULT_ZR[1], max_gap_minutes=15.0, min_dbz=10.0):
    """Trapezoidal rainfall accumulation (mm) over a co-registered cube. Matches science.integrate.

    Gates below ``min_dbz`` or without echo count as zero rain where the ray was sampled; unsampled azimuth bins
    are missing. An interval contributes only where both ends were sampled. Intervals longer than the gap
    threshold are excluded and reported.
    """
    rates = np.where(np.isfinite(cube_dbz) & (cube_dbz >= min_dbz), rain_rate(cube_dbz, a, b), 0.0)
    rates = np.where(sampled[:, :, None], rates, np.nan)
    total = np.zeros(cube_dbz.shape[1:]); covered = np.zeros(cube_dbz.shape[1:]); gaps = []
    for i in range(len(times_s) - 1):
        hours = (times_s[i + 1] - times_s[i]) / 3600.0
        if hours <= 0:
            raise ValueError('Volume times must be strictly increasing.')
        if hours * 60 > max_gap_minutes:
            gaps.append({'start_index': i, 'end_index': i + 1, 'minutes': round(hours * 60, 1)})
            continue
        r0, r1 = rates[i], rates[i + 1]
        ok = np.isfinite(r0) & np.isfinite(r1)
        total[ok] += (r0[ok] + r1[ok]) / 2 * hours
        covered[ok] += hours
    return total, covered, gaps


def main(argv=None):
    parser = argparse.ArgumentParser(prog='python -m backend.pipeline', description=__doc__.split('\n\n')[0])
    sub = parser.add_subparsers(dest='command', required=True)
    p_ingest = sub.add_parser('ingest', help='Process zip archives or folders of CfRadial volumes.')
    p_ingest.add_argument('sources', nargs='+')
    p_ingest.add_argument('--out', default=str(DEFAULT_OUT))
    p_sum = sub.add_parser('summary', help='Print the processed archive.')
    p_sum.add_argument('--out', default=str(DEFAULT_OUT))
    args = parser.parse_args(argv)
    if args.command == 'ingest':
        ingest(args.sources, args.out)
    else:
        for cat in sorted(Path(args.out).glob('*/*/catalog.json')):
            c = json.loads(cat.read_text(encoding='utf-8'))
            print(f"{c['site']['name']} {c['date']}: {c['volume_count']}/{c['expected_volumes']} volumes, "
                  f"gaps {len(c['gaps'])}, peak {c['summary']['peak_dbz']} dBZ, deviations {len(c['profile_deviations'])}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
