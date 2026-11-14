import math
from pathlib import Path
import tempfile
import unittest
from fastapi.testclient import TestClient
from netCDF4 import Dataset
import numpy as np
from .app import app
from .science import inspect_netcdf, integrate, rainfall, read_scan


def write_fixture(path, packed=False):
    with Dataset(path, 'w') as ds:
        ds.createDimension('time', 8); ds.createDimension('range', 4); ds.createDimension('sweep', 2)
        az=ds.createVariable('azimuth','f4',('time',)); az.units='degrees'; az[:]=[0,90,180,270]*2
        ranges=ds.createVariable('range','f4',('range',)); ranges.units='meters'; ranges[:]=[100,200,300,400]
        ds.createVariable('elevation','f4',('time',))[:]=[.5]*4+[1.5]*4
        ds.createVariable('sweep_start_ray_index','i4',('sweep',))[:]=[0,4]
        ds.createVariable('sweep_end_ray_index','i4',('sweep',))[:]=[3,7]
        t=ds.createVariable('time','f8',('time',));t.units='seconds since 2026-07-15T00:00:00Z';t[:]=np.arange(8)*60
        ds.createVariable('latitude','f4')[:]=17.92;ds.createVariable('longitude','f4')[:]=73.6
        values=np.arange(32,dtype=float).reshape(8,4)
        if packed:
            ds.createDimension('n_points',32)
            ds.createVariable('ray_start_index','i4',('time',))[:]=np.arange(8)*4
            ds.createVariable('ray_n_gates','i4',('time',))[:]=4
            dims=('n_points',);values=values.ravel()
        else: dims=('time','range')
        dbz=ds.createVariable('DBZH','i2',dims,fill_value=-9999)
        dbz.units='dBZ';dbz.scale_factor=.5;dbz.add_offset=-10;dbz[:]=values


class ScienceTests(unittest.TestCase):
    def test_known_reflectivity(self):
        self.assertAlmostEqual(rainfall([10*math.log10(200)])[0],1.0)
    def test_null_is_masked(self): self.assertEqual(rainfall([None]),[None])
    def test_invalid_coefficients(self):
        with self.assertRaises(ValueError): rainfall([20],0,1.6)
    def test_timestamp_intervals(self):
        result=integrate([{'timestamp':'2026-07-15T00:00:00Z','rates':[2,None]},{'timestamp':'2026-07-15T00:30:00Z','rates':[4,2]}],60)
        self.assertEqual(result['accumulated_mm'],[1.5,None]);self.assertEqual(result['covered_hours'],[.5,0])
    def test_gaps_are_excluded(self):
        result=integrate([{'timestamp':'2026-07-15T00:00:00Z','rates':[2]},{'timestamp':'2026-07-15T01:00:00Z','rates':[4]}],15)
        self.assertEqual(result['accumulated_mm'],[None]);self.assertEqual(len(result['excluded_gaps']),1)
    def test_duplicates_rejected(self):
        with self.assertRaises(ValueError): integrate([{'timestamp':'2026-07-15T00:00:00Z','rates':[2]}]*2)
    def test_timezone_required(self):
        with self.assertRaises(ValueError): integrate([{'timestamp':'2026-07-15T00:00:00','rates':[2]}]*2)
    def test_coordinate_scaling_and_sweep(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'fixture.nc';write_fixture(path)
            self.assertEqual(inspect_netcdf(path)['fields'][0]['name'],'DBZH')
            scan=read_scan(path,'DBZH',1)
            self.assertAlmostEqual(scan['ranges'][0],.1);self.assertAlmostEqual(scan['elevation'],1.5)
            self.assertEqual(scan['values'][0],[16,17,18,19]);self.assertTrue(scan['timestamp'].startswith('2026-07-15T00:04:00'))
    def test_packed_ray_layout(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'packed.nc';write_fixture(path,True)
            self.assertEqual(len(inspect_netcdf(path)['fields']),1)
            self.assertEqual(read_scan(path,'DBZH',1)['values'][0],[16,17,18,19])
    def test_rhi_is_not_misrepresented_as_ppi(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'rhi.nc';write_fixture(path)
            with Dataset(path,'a') as ds:
                ds.createDimension('mode_chars',3)
                ds.createVariable('sweep_mode','S1',('sweep','mode_chars'))[:]=np.array([list('rhi'),list('rhi')],dtype='S1')
            with self.assertRaisesRegex(ValueError,'RHI'):
                read_scan(path,'DBZH',0)
    def test_unknown_range_units_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'bad_units.nc';write_fixture(path)
            with Dataset(path,'a') as ds: ds['range'].units='unknown'
            with self.assertRaisesRegex(ValueError,'Range coordinates'):
                read_scan(path,'DBZH',0)
    def test_api_masks_and_coefficients(self):
        with TestClient(app) as client:
            r=client.post('/api/rainfall',json={'dbz':[None,30],'a':200,'b':1.6})
            self.assertEqual(r.status_code,200);self.assertIsNone(r.json()['rates'][0]);self.assertAlmostEqual(r.json()['rates'][1],2.7343635285)
            self.assertEqual(client.post('/api/rainfall',json={'dbz':[30],'a':0}).status_code,422)
    def test_upload_scan_delete_lifecycle(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'fixture.nc';write_fixture(path)
            with TestClient(app) as client:
                r=client.post('/api/files',files={'file':('fixture.nc',path.read_bytes(),'application/octet-stream')})
                self.assertEqual(r.status_code,200,r.text);file_id=r.json()['id']
                result=client.get(f'/api/files/{file_id}/scan',params={'field':'DBZH','sweep':1})
                self.assertEqual(result.status_code,200,result.text);self.assertFalse(result.json()['synthetic'])
                listed=client.get('/api/files').json()
                self.assertEqual([f['id'] for f in listed],[file_id]);self.assertNotIn('_path',listed[0])
                self.assertEqual(client.delete(f'/api/files/{file_id}').status_code,200)
                self.assertEqual(client.get(f'/api/files/{file_id}/scan',params={'field':'DBZH'}).status_code,404)
                self.assertEqual(client.get('/api/files').json(),[])
    def test_fake_netcdf_rejected(self):
        with TestClient(app) as client:
            self.assertEqual(client.post('/api/files',files={'file':('fake.nc',b'not netcdf')}).status_code,415)

if __name__=='__main__': unittest.main()
