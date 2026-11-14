"""Read-side access to pipeline products and on-demand full-resolution sweeps."""
from __future__ import annotations

import json
import math
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

import numpy as np

from .pipeline import DEFAULT_OUT, VolumeRef, accumulate, decode
from .science import read_scan

_lock = RLock()


class _LRU(OrderedDict):
    def __init__(self, size):
        super().__init__(); self.size = size

    def get_or(self, key, make):
        with _lock:
            if key in self:
                self.move_to_end(key); return self[key]
        value = make()
        with _lock:
            self[key] = value; self.move_to_end(key)
            while len(self) > self.size:
                self.popitem(last=False)
        return value


_cubes = _LRU(3)      # decoded day cubes (~60 MB each as float32)
_raw = _LRU(6)        # raw volume bytes (5–17 MB each)
_sweeps = _LRU(96)    # decoded display sweeps


class Archive:
    def __init__(self, root: Path | str = DEFAULT_OUT):
        self.root = Path(root)

    def _catalog_path(self, date):
        hits = sorted(self.root.glob(f'*/{date}/catalog.json'))
        if not hits:
            raise KeyError(date)
        return hits[0]

    def days(self):
        out = []
        for path in sorted(self.root.glob('*/*/catalog.json')):
            c = json.loads(path.read_text(encoding='utf-8'))
            out.append({k: c[k] for k in ('date', 'site', 'volume_count', 'expected_volumes', 'gaps', 'summary',
                                          'fixed_angles', 'profile_deviations', 'pipeline')})
        return out

    def catalog(self, date, public=True):
        c = json.loads(self._catalog_path(date).read_text(encoding='utf-8'))
        if public:  # local source paths are not needed by the browser
            for v in c['volumes']:
                v.pop('source', None)
        return c

    def cube(self, date):
        def load():
            with np.load(self._catalog_path(date).parent / 'low.npz') as z:
                return {'dbz': decode(z['cube']), 'sampled': z['sampled'], 'times': z['times'],
                        'ranges': z['ranges_km'].astype(float), 'azimuths': z['azimuths'].astype(float)}
        return _cubes.get_or(date, load)

    def _volume(self, date, index):
        c = self.catalog(date, public=False)
        if not 0 <= index < len(c['volumes']):
            raise IndexError(index)
        return c, c['volumes'][index]

    def sweep(self, date, index, field, sweep):
        def load():
            c, v = self._volume(date, index)
            if field not in v['fields']:
                raise ValueError(f'Field {field} is not in this volume.')
            src = v['source']
            ref = VolumeRef(src['path'], src['member'], datetime.fromisoformat(v['start']))
            try:
                raw = _raw.get_or((date, index), ref.read_bytes)
            except FileNotFoundError:
                raise FileNotFoundError('The original archive for this volume has moved. Re-run the pipeline ingest.')
            scan = read_scan(raw, field, sweep)
            scan.update({'id': f'{date}-{index}-{field}-{sweep}', 'name': v['name'], 'synthetic': False,
                         'fixed_angle': c['fixed_angles'][sweep],
                         'source': f"{c['site']['name']} CfRadial volume {v['volume_number']}; {field}; no attenuation correction"})
            return scan
        return _sweeps.get_or((date, index, field, sweep), load)

    def _grid_scan(self, date, values, name, field, units, timestamp, cube):
        site = self.catalog(date)['site']
        return {
            'id': name, 'name': name, 'timestamp': timestamp, 'synthetic': False,
            'latitude': site['latitude'], 'longitude': site['longitude'], 'elevation': 0.5, 'sweep': 0,
            'azimuths': cube['azimuths'].tolist(), 'ranges': cube['ranges'].tolist(),
            'values': [[None if not math.isfinite(x) else round(float(x), 2) for x in row] for row in values],
            'field': field, 'units': units,
            'source': f"{site['name']} lowest sweep product (1° × 600 m, RHOHV-screened)",
        }

    def product(self, date, index):
        cube = self.cube(date)
        if not 0 <= index < len(cube['times']):
            raise IndexError(index)
        t = datetime.fromtimestamp(float(cube['times'][index]), timezone.utc).isoformat().replace('+00:00', 'Z')
        return self._grid_scan(date, cube['dbz'][index], f'{date}-product-{index}', 'reflectivity', 'dBZ', t, cube)

    def accumulation(self, date, a, b, start=0, end=None, max_gap_minutes=15.0):
        cube = self.cube(date)
        end = len(cube['times']) - 1 if end is None else end
        if not 0 <= start < end < len(cube['times']):
            raise ValueError('Choose a start volume before the end volume.')
        sl = slice(start, end + 1)
        total, covered, gaps = accumulate(cube['dbz'][sl], cube['sampled'][sl], cube['times'][sl], a, b, max_gap_minutes)
        values = np.where((covered > 0) & (total >= 0.01), total, np.nan)
        iso = lambda i: datetime.fromtimestamp(float(cube['times'][i]), timezone.utc).isoformat().replace('+00:00', 'Z')
        scan = self._grid_scan(date, values, f'{date}-accum-{start}-{end}-{a}-{b}', 'accumulation', 'mm',
                               f'{iso(start)} – {iso(end)}', cube)
        span_h = (cube['times'][end] - cube['times'][start]) / 3600
        scan['accumulation'] = {
            'method': 'Trapezoidal integration of Z = a R^b rates; <10 dBZ = 0 mm/hr; unsampled rays excluded',
            'a': a, 'b': b, 'start': iso(start), 'end': iso(end), 'period_hours': round(float(span_h), 3),
            'excluded_gaps': [{**g, 'start': iso(start + g['start_index']), 'end': iso(start + g['end_index'])} for g in gaps],
            'max_gap_minutes': max_gap_minutes,
            'max_mm': round(float(np.nanmax(values)), 2) if np.isfinite(values).any() else 0.0,
        }
        return scan

    def gate_series(self, date, az, range_km):
        cube = self.cube(date)
        ai = int(np.floor(az % 360))
        ri = int(np.argmin(np.abs(cube['ranges'] - range_km)))
        half = (cube['ranges'][1] - cube['ranges'][0]) / 2
        inside = cube['ranges'][0] - half <= range_km <= cube['ranges'][-1] + half
        values = cube['dbz'][:, ai, ri] if inside else np.full(len(cube['times']), np.nan)
        sampled = cube['sampled'][:, ai]
        return {
            'azimuth_bin': [ai, ai + 1], 'range_km': round(float(cube['ranges'][ri]), 2),
            'times': [datetime.fromtimestamp(float(t), timezone.utc).isoformat().replace('+00:00', 'Z') for t in cube['times']],
            'dbz': [None if not (s and math.isfinite(v)) else round(float(v), 1) for v, s in zip(values, sampled)],
            'sampled': sampled.astype(bool).tolist(),
        }
