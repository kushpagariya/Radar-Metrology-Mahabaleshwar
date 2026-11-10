# Radar Metrology — Mahabaleshwar

A local demonstration prototype with a light 3D radar exhibition, an interactive research workspace and a formula-based Python API. No database, accounts, Supabase project or cloud hosting is required.

## Run

Requires Node.js 22.12+ and Python 3.11+.

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite, normally http://127.0.0.1:5173. Select **Open workspace** to explore synthetic scans. The demonstration works without a backend.

For NetCDF uploads and Python calculations, open another terminal in this folder:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
npm run backend
```

The API listens on http://127.0.0.1:8000, with documentation at http://127.0.0.1:8000/docs. Vite forwards `/api` requests to it. Use the development server for the complete workflow; static preview does not proxy the backend.

## Included

- Intact representative 3D radar, cursor steering, drag rotation, Send a pulse interaction and scroll-driven spatial sampling field.
- Simplified mobile and reduced-motion exhibition.
- Direct PPI workspace, schematic regional map, Data Library and methodology. Overview and the standalone calculator were removed after user review.
- Six synthetic scans, four illustrative elevations, playback, gate inspection, colour limits, range selection and map pan/zoom.
- PNG view export, JSON provenance and CSV gate export.
- Session-only NetCDF upload, metadata inspection, supported selected-sweep plotting and file removal.
- Python rainfall conversion and timestamp-aware accumulation with gap reporting and masks.

## Boundaries

The radar is representative. Synthetic scans and dates are not observations. The map is an offline schematic, not surveyed terrain. Geographic registration, attenuation correction, beam-height analysis, forecasting and gauge validation are not implemented.

The NetCDF adapter supports rectangular polar fields and CF/Radial packed `n_points` fields with explicit coordinates. It discovers dBZ fields and applies NetCDF masking/scaling. Unsupported layouts return explicit errors. Display products are subsampled to at most 360 rays and 220 gates; strides are recorded in provenance. This display adapter is not a validated Py-ART pipeline.

Uploads are limited to 64 MiB each and 384 MiB per local session. Records exist in memory; orderly backend shutdown cleans up temporary files. Keep this unauthenticated demo on loopback. No production access controls are implied.

The reference portal is unchanged. Its inspected SUR sample reports a site near 23.57° N, 77.25° E; it is not treated as Mahabaleshwar data.

The scan-derived rainfall view uses `Z = 10^(dBZ/10)` and `R = (Z/a)^(1/b)`, with a declared [Marshall–Palmer baseline](https://glossary.ametsoc.org/wiki/marshall-palmer-relation/) of `a=200`, `b=1.6`. The backend accepts alternative coefficients. Accumulation requires co-registered gates and actual timestamps; it remains a backend method rather than a standalone calculator page.

## Verify

```powershell
npm run build
python -m unittest backend.test_science -v
```

## Architecture

Vite + React + TypeScript provide a simple local demonstration workflow. React Three Fiber/Three.js handle 3D, GSAP ScrollTrigger drives the exhibition, and FastAPI + NumPy + NetCDF4 provide scientific endpoints. No persistence dependency is installed. Later stages can add Supabase, validated Mahabaleshwar adapters, Py-ART, a geographic basemap and background workers.

Motion CSS comes from the local design-taste frontend skill. Icons are Lucide. Google Fonts supplies Manrope and DM Sans, with readable local fallbacks offline.
