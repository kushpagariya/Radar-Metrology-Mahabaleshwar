import json
import math
import tempfile
import unittest
import zipfile
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient
from netCDF4 import Dataset

from . import app as app_module
from .archive import Archive
from .pipeline import accumulate, decode, discover, encode, grid_ranges_km, ingest, regrid_lowest_sweep
from .science import integrate, open_dataset

N_RANGE = 16  # 16 native gates → 4 product bins


def write_volume(path, start='2025-09-15T00:00:08Z', dbz_value=40.0, rays=360, rhohv=0.95, gap_from=None):
    """Minimal packed CfRadial volume with two sweeps; optional azimuth gap in sweep 0."""
    az0 = [a + 0.5 for a in range(360) if gap_from is None or not gap_from <= a < gap_from + 20][:rays]
    az1 = [a + 0.5 for a in range(360)]
    az = az0 + az1
    n = len(az)
    with Dataset(path, 'w') as ds:
        ds.instrument_name = 'MBL-RADAR'; ds.time_coverage_start = start; ds.time_coverage_end = start; ds.scan_name = 'TEST'
        ds.createDimension('time', n); ds.createDimension('range', N_RANGE); ds.createDimension('sweep', 2)
        ds.createDimension('n_points', n * N_RANGE); ds.createDimension('frequency', 1)
        ds.createVariable('volume_number', 'i4')[...] = 1
        ds.createVariable('latitude', 'f8')[...] = 17.925; ds.createVariable('longitude', 'f8')[...] = 73.66
        ds.createVariable('altitude', 'f8')[...] = 1410.0; ds.createVariable('radar_beam_width_h', 'f4')[...] = 0.95
        ds.createVariable('frequency', 'f4', ('frequency',))[:] = [9.457e9]
        ds.createVariable('fixed_angle', 'f4', ('sweep',))[:] = [0.5, 1.0]
        ds.createVariable('sweep_start_ray_index', 'i4', ('sweep',))[:] = [0, len(az0)]
        ds.createVariable('sweep_end_ray_index', 'i4', ('sweep',))[:] = [len(az0) - 1, n - 1]
        a = ds.createVariable('azimuth', 'f4', ('time',)); a.units = 'degrees'; a[:] = az
        ds.createVariable('elevation', 'f4', ('time',))[:] = [0.5] * len(az0) + [1.0] * len(az1)
        r = ds.createVariable('range', 'f4', ('range',)); r.units = 'meters'; r[:] = np.arange(N_RANGE) * 150.0
        ds.createVariable('ray_start_index', 'i4', ('time',))[:] = np.arange(n) * N_RANGE
        ds.createVariable('ray_n_gates', 'i4', ('time',))[:] = [N_RANGE] * n
        ds.createVariable('ray_start_range', 'f4', ('time',))[:] = [0.0] * n
        ds.createVariable('ray_gate_spacing', 'f4', ('time',))[:] = [150.0] * n
        t = ds.createVariable('time', 'f8', ('time',)); t.units = f'seconds since {start}'; t[:] = np.arange(n) * 0.1
        dbz = np.full((n, N_RANGE), dbz_value, dtype=float)
        dbz[:, :4] = [30.0, 40.0, np.nan, np.nan]  # bin 0: linear mean of 30 and 40 dBZ
        dbz[:, 4:8] = [50.0, np.nan, np.nan, np.nan]  # bin 1: only one valid sub-gate → no data
        d = ds.createVariable('DBZ', 'i2', ('n_points',), fill_value=-32768); d.units = 'dBZ'; d.scale_factor = 0.01
        d[:] = np.ma.masked_invalid(dbz.ravel())
        ds.createVariable('DBZ_TOT', 'i2', ('n_points',), fill_value=-32768)[:] = 0
        rho = ds.createVariable('RHOHV', 'i2', ('n_points',), fill_value=-32768); rho.scale_factor = 0.001
        rv = np.full((n, N_RANGE), rhohv); rv[:, 12:] = 0.4  # last bin fails QC
        rho[:] = rv.ravel()


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_regrid_qc_and_averaging(self):
        p = self.dir / 'cfrad.20250915_000008.000_to_20250915_000600.000_MBL-RADAR_SUR.nc'
        write_volume(p, gap_from=100)
        with open_dataset(p.read_bytes()) as ds:
            grid, sampled = regrid_lowest_sweep(ds)
        self.assertEqual(grid.shape, (360, 4))
        expected = 10 * math.log10((10 ** 3 + 10 ** 4) / 2)
        self.assertAlmostEqual(float(grid[0, 0]), expected, places=2)
        self.assertTrue(np.isnan(grid[0, 1]))          # only one valid sub-gate
        self.assertAlmostEqual(float(grid[0, 2]), 40.0, places=2)
        self.assertTrue(np.isnan(grid[0, 3]))          # RHOHV below threshold
        self.assertFalse(sampled[110]); self.assertTrue(np.all(np.isnan(grid[110])))  # gap is missing, never filled
        self.assertEqual(int(sampled.sum()), 340)

    def test_encoding_round_trip(self):
        grid = np.array([[np.nan, -10.25, 0.0, 63.5]], dtype=np.float32)
        out = decode(encode(grid))
        self.assertTrue(np.isnan(out[0, 0])); np.testing.assert_allclose(out[0, 1:], [-10.0, 0.0, 63.5])

    def test_accumulation_matches_science_integrate(self):
        times = np.array([0.0, 600.0, 1200.0, 3000.0])  # last interval is a 30-minute gap
        dbz = np.array([30.0, 40.0, 35.0, 45.0]).reshape(4, 1, 1)
        sampled = np.ones((4, 1), dtype=bool)
        total, covered, gaps = accumulate(dbz, sampled, times)
        rates = [((10 ** (v / 10)) / 200) ** (1 / 1.6) for v in [30, 40, 35, 45]]
        ref = integrate([{'timestamp': f'2025-09-15T00:{int(t // 60):02d}:00Z', 'rates': [r]} for t, r in zip(times, rates)], 15)
        self.assertAlmostEqual(float(total[0, 0]), ref['accumulated_mm'][0], places=6)
        self.assertEqual(len(gaps), 1); self.assertEqual(len(ref['excluded_gaps']), 1)

    def test_unsampled_rays_are_not_zero_rain(self):
        dbz = np.full((2, 2, 1), np.nan); sampled = np.array([[True, True], [True, False]])
        total, covered, _ = accumulate(dbz, sampled, np.array([0.0, 600.0]))
        self.assertEqual(covered[0, 0], 600 / 3600); self.assertEqual(covered[1, 0], 0)

    def test_ingest_zip_and_archive_api(self):
        zpath = self.dir / 'day.zip'
        with zipfile.ZipFile(zpath, 'w') as zf:
            for hhmm, value in [('0000', 30.0), ('0010', 40.0), ('0040', 45.0)]:  # 00:20 and 00:30 missing
                name = f'cfrad.20250915_{hhmm}08.000_to_20250915_{hhmm}59.000_MBL-RADAR_SUR.nc'
                p = self.dir / name
                write_volume(p, start=f'2025-09-15T{hhmm[:2]}:{hhmm[2:]}:08Z', dbz_value=value)
                zf.write(p, f'full_sweeps/{name}')
        self.assertEqual(len(discover([zpath])), 3)
        out = self.dir / 'archive'
        [catalog] = ingest([str(zpath)], out, log=lambda *_: None)
        self.assertEqual(catalog['volume_count'], 3)
        self.assertEqual(catalog['gaps'][0]['missing_volumes'], 2)
        self.assertTrue(any('fixed angles' in d for d in catalog['profile_deviations']))
        self.assertTrue((out / 'MBL-RADAR' / '2025-09-15' / 'low.npz').exists())

        archive = Archive(out)
        self.assertEqual(archive.days()[0]['date'], '2025-09-15')
        self.assertNotIn('source', archive.catalog('2025-09-15')['volumes'][0])
        product = archive.product('2025-09-15', 1)
        self.assertEqual(len(product['azimuths']), 360); self.assertEqual(len(product['ranges']), 4)
        acc = archive.accumulation('2025-09-15', 200, 1.6)
        self.assertEqual(len(acc['accumulation']['excluded_gaps']), 1)
        series = archive.gate_series('2025-09-15', 10.0, float(grid_ranges_km(4)[2]))
        self.assertEqual(series['dbz'], [30.0, 40.0, 45.0])
        sweep = archive.sweep('2025-09-15', 0, 'DBZ', 1)
        self.assertEqual(sweep['fixed_angle'], 1.0); self.assertFalse(sweep['synthetic'])

        original = app_module.archive
        app_module.archive = archive
        try:
            with TestClient(app_module.app) as client:
                self.assertEqual(client.get('/api/archive').status_code, 200)
                self.assertEqual(client.get('/api/archive/2025-09-16').status_code, 404)
                self.assertEqual(client.get('/api/archive/2025-09-15/volumes/9/product').status_code, 404)
                r = client.get('/api/archive/2025-09-15/accumulation', params={'a': 250, 'b': 1.2})
                self.assertEqual(r.status_code, 200); self.assertEqual(r.json()['accumulation']['a'], 250)
                self.assertEqual(client.get('/api/archive/2025-09-15/volumes/0/sweep', params={'field': 'VEL'}).status_code, 422)
        finally:
            app_module.archive = original


if __name__ == '__main__':
    unittest.main()
