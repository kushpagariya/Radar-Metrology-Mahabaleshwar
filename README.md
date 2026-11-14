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

The API listens on http://127.0.0.1:8000 (set `API_PROXY` before `npm run dev` to point Vite at another backend address), with documentation at http://127.0.0.1:8000/docs. Vite forwards `/api` requests to it. Use the development server for the complete workflow; static preview does not proxy the backend.

## MBL-RADAR archive pipeline

Observed data from MBL-RADAR (X-band 9.46 GHz dual-pol, 17.925° N, 73.660° E, 1410 m) arrives as CfRadial-1.4 volumes (`cfrad.YYYYMMDD_HHMMSS…_MBL-RADAR_SUR.nc`), about one every 10 minutes, each with 11 PPI sweeps (0.5–89°), 150 m gates and 15 fields. Process one or more days, as zip archives or folders, with the backend virtual environment active:

```powershell
python -m backend.pipeline ingest "C:/data/day_one.zip" "C:/data/day_two.zip"
python -m backend.pipeline summary
```

The pipeline reads volumes directly from the zips (nothing is extracted), groups them by UTC day, validates each against the observed scan profile, and records gaps, failures and deviations instead of stopping. Per day it writes `data/archive/MBL-RADAR/<date>/catalog.json` and `low.npz`: a co-registered lowest-sweep product (DBZ screened with RHOHV ≥ 0.7, 4-gate linear-Z mean to 600 m, nearest ray into 1° azimuth bins, unsampled sectors kept empty). A day of volumes processes in about 20 seconds into a few MB of products. Set `RADAR_ARCHIVE_DIR` to store products elsewhere.

The catalog keeps the path of each source zip; full-resolution sweeps and cross-sections are read from there on demand, so keep the zips where they were ingested (or re-run the ingest after moving them). Processed days appear in the Data library. Each day gives a timeline strip, playback, all 11 elevations, DBZ / DBZ_TOT fields, real cross-sections, product-grid comparison, gate time series across the day and server-side accumulation windows (1, 3, 6 h or since 00:00 UTC).

API: `GET /api/archive`, `/api/archive/{date}`, `/api/archive/{date}/volumes/{i}/sweep?field=&sweep=`, `/api/archive/{date}/volumes/{i}/product`, `/api/archive/{date}/accumulation?a=&b=&start=&end=`, `/api/archive/{date}/gate?az=&range_km=`.

## Included

- Intact representative 3D radar, cursor steering, drag rotation, Send a pulse interaction and scroll-driven spatial sampling field.
- Simplified mobile and reduced-motion exhibition.
- Workspace views: PPI, schematic regional map (place markers and contours follow pan/zoom), range–height cross-section, scan comparison (side by side or difference) and rainfall accumulation over the demonstration sequence.
- Pinned gates: click the plot (or focus it and use the arrow keys, then Enter) to pin a gate. The readout shows beam height (4/3 Earth model); the insights row charts the gate through time and the cross-section follows its azimuth.
- Z–R presets (Marshall–Palmer, WSR-88D convective, Rosenfeld tropical, custom), an echo-threshold highlight with echo area, and a reflectivity histogram.
- Shareable links: every workspace setting lives in the URL (copy it with the link button in the top bar).
- Six synthetic scans × four elevations, playback, stepped colour legends that match the plotted colours.
- PNG view export, JSON provenance and CSV export of the displayed gates (or cross-section beams).
- Session-only NetCDF upload, metadata inspection, supported selected-sweep plotting and file removal. Uploaded files survive a page refresh (`GET /api/files`) and are cleared when the backend stops.
- Python rainfall conversion and timestamp-aware accumulation with gap reporting and masks. The accumulation view uses the Python service when it is connected and the same method in the browser otherwise.

## Boundaries

The radar is representative. Synthetic scans and dates are not observations. The map is an offline schematic, not surveyed terrain. Geographic registration, attenuation correction, beam-height analysis, forecasting and gauge validation are not implemented.

The NetCDF adapter supports rectangular polar fields and CF/Radial packed `n_points` fields with explicit coordinates. It discovers dBZ fields and applies NetCDF masking/scaling. Unsupported layouts return explicit errors. Display products are subsampled to at most 360 rays and 220 gates; strides are recorded in provenance. This display adapter is not a validated Py-ART pipeline.

Uploads are limited to 64 MiB each and 384 MiB per local session. Records exist in memory; orderly backend shutdown cleans up temporary files. Keep this unauthenticated demo on loopback. No production access controls are implied.

The reference portal is unchanged. Its inspected SUR sample reports a site near 23.57° N, 77.25° E; it is not treated as Mahabaleshwar data.

The scan-derived rainfall view uses `Z = 10^(dBZ/10)` and `R = (Z/a)^(1/b)`, with a declared [Marshall–Palmer baseline](https://glossary.ametsoc.org/wiki/marshall-palmer-relation/) of `a=200`, `b=1.6`. The backend accepts alternative coefficients. Accumulation requires co-registered gates and actual timestamps; it remains a backend method rather than a standalone calculator page.

## Verify

```powershell
npm run build
python -m unittest backend.test_science backend.test_pipeline -v
npx prettier --check "src/**/*.{ts,tsx,css}"
```

## Architecture

Vite + React + TypeScript provide (workspace components live in `src/dashboard/`, shared science helpers in `src/data.ts`, charts in `src/charts.tsx`, and all styles in `src/styles.css`) a simple local demonstration workflow. React Three Fiber/Three.js handle 3D, GSAP ScrollTrigger drives the exhibition, and FastAPI + NumPy + NetCDF4 provide scientific endpoints. No persistence dependency is installed. Later stages can add Supabase, validated Mahabaleshwar adapters, Py-ART, a geographic basemap and background workers.

Motion CSS comes from the local design-taste frontend skill. Icons are Lucide. Google Fonts supplies Manrope and DM Sans, with readable local fallbacks offline.
