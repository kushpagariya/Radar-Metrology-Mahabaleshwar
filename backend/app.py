from contextlib import asynccontextmanager
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import RLock
from uuid import uuid4
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from .science import VERSION, inspect_netcdf, integrate, rainfall, read_scan

MAX_FILE = 64 * 1024 * 1024
MAX_SESSION = 384 * 1024 * 1024
records: dict = {}
netcdf_lock = RLock()


@asynccontextmanager
async def lifespan(app):
    with TemporaryDirectory(prefix='radar-metrology-') as directory:
        app.state.upload_directory = Path(directory)
        yield
        records.clear()


app = FastAPI(title='Radar Metrology local prototype', version='0.2.0', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:4173'], allow_methods=['GET', 'POST', 'DELETE'], allow_headers=['Content-Type'])


class FormulaRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    dbz: list[float | None] = Field(min_length=1, max_length=100000)
    a: float = Field(default=200, ge=1, le=2000)
    b: float = Field(default=1.6, ge=0.5, le=3)


class RateSample(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    timestamp: str = Field(max_length=80)
    rates: list[Annotated[float, Field(ge=0, le=1e8)] | None] = Field(min_length=1, max_length=100000)


class AccumulationRequest(BaseModel):
    samples: list[RateSample] = Field(min_length=2, max_length=1000)
    max_gap_minutes: float = Field(default=15, gt=0, le=1440, allow_inf_nan=False)


@app.get('/api/health')
def health():
    return {'status': 'ok', 'mode': 'local session prototype', 'database': False, 'version': VERSION}


@app.post('/api/rainfall')
def calculate_rainfall(body: FormulaRequest):
    try:
        rates = rainfall(body.dbz, body.a, body.b)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    return {'rates': rates, 'units': 'mm/hr', 'a': body.a, 'b': body.b, 'method': 'Z = 10^(dBZ/10); R = (Z/a)^(1/b)', 'version': VERSION, 'gauge_validated': False}


@app.post('/api/accumulation')
def calculate_accumulation(body: AccumulationRequest):
    try:
        return integrate([sample.model_dump() for sample in body.samples], body.max_gap_minutes)
    except (ValueError, OverflowError) as exc:
        raise HTTPException(422, str(exc))


@app.post('/api/files')
def upload_file(file: UploadFile = File(...)):
    name = (file.filename or '').replace('\\', '/').split('/')[-1]
    if not name.lower().endswith('.nc'):
        raise HTTPException(415, 'Choose a NetCDF file with the .nc extension.')
    file_id = uuid4().hex
    path = app.state.upload_directory / f'{file_id}.nc'
    size = 0; digest = sha256()
    try:
        with path.open('wb') as output:
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE:
                    raise HTTPException(413, 'File exceeds the 64 MiB prototype limit.')
                if size + sum(r['size'] for r in records.values()) > MAX_SESSION:
                    raise HTTPException(413, 'Session storage is full. Remove an imported file and try again.')
                digest.update(chunk); output.write(chunk)
        with path.open('rb') as source:
            magic = source.read(8)
        if not (magic.startswith(b'CDF') or magic == b'\x89HDF\r\n\x1a\n'):
            raise HTTPException(415, 'The file does not have a supported NetCDF/HDF5 signature.')
        with netcdf_lock:
            inspection = inspect_netcdf(path)
            record = {'id': file_id, 'name': name, 'size': size, 'checksum_sha256': digest.hexdigest(), **inspection}
            records[file_id] = {**record, '_path': path}
        return record
    except HTTPException:
        path.unlink(missing_ok=True); raise
    except Exception:
        path.unlink(missing_ok=True)
        raise HTTPException(422, 'This file could not be decoded as a supported NetCDF dataset. Check the format and file integrity.')
    finally:
        file.file.close()


@app.get('/api/files')
def list_files():
    """Files held in this backend session, so a browser refresh can recover them."""
    with netcdf_lock:
        return [{k: v for k, v in record.items() if k != '_path'} for record in records.values()]


@app.get('/api/files/{file_id}/scan')
def get_scan(file_id: str, field: str, sweep: int = 0):
    with netcdf_lock:
        record = records.get(file_id)
        if not record:
            raise HTTPException(404, 'File not found in this local session. Import it again.')
        if field not in [f['name'] for f in record['fields']]:
            raise HTTPException(422, 'Choose a dBZ reflectivity field reported by inspection.')
        try:
            result = read_scan(record['_path'], field, sweep)
        except ValueError as exc:
            raise HTTPException(422, str(exc))
        except Exception:
            raise HTTPException(422, 'This scan layout needs another radar-format adapter. Metadata inspection remains available.')
    return {**result, 'id': file_id, 'name': record['name'], 'checksum_sha256': record['checksum_sha256']}


@app.delete('/api/files/{file_id}')
def delete_file(file_id: str):
    with netcdf_lock:
        record = records.pop(file_id, None)
        if not record:
            raise HTTPException(404, 'File not found in this local session.')
        record['_path'].unlink(missing_ok=True)
    return {'removed': file_id}
