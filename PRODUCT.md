# Radar-Metrology-Mahabaleshwar

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Python-based scientific processing with Xarray, NetCDF4, and NumPy for large NetCDF (.nc) weather radar datasets. Visualization tools must support radar observations and dBZ reflectivity values.

The current stage is a local demonstration authorized on 10 November 2026. Frontend: Vite, React, TypeScript, React Three Fiber, Three.js and GSAP ScrollTrigger. Backend: FastAPI, NumPy and NetCDF4. No database, authentication or cloud deployment is required for this stage. Supabase remains a later production option. The reference portal provides scientific and engineering lessons only; its implementation is not copied.

## Users

Meteorologists, radar researchers, and technical teams working with weather radar observations.

## Product Purpose

Provide a weather radar research and analysis dashboard that processes and visualizes NetCDF radar data, with a primary focus on radar reflectivity (dBZ). Help users understand reflectivity variations across locations, altitudes, and time periods.

## Operating Context

Build the frontend first for presentation to a prospective stakeholder, then connect formula-based scientific endpoints and temporary NetCDF processing. The revised Beam to Data landing is a more expressive light-studio exhibition: the representative radar stays intact while an illustrative field of sampled gates rises around it. Scrolling reframes the instrument and spatial field; cursor steering, drag rotation and an explicit Send a pulse action invite exploration. Do not convert the instrument into a PPI panel. Mobile and reduced-motion versions use a static rendered poster. The dashboard opens directly on scan analysis, with Data Library and methodology; the redundant Overview and standalone calculator were explicitly removed at the user's request. Rainfall is a derived scan view with its method shown. Clearly label synthetic data and representative assets.

## Capabilities and Constraints

Confirmed intended capabilities, not claims of implemented functionality:

- Handle large weather radar datasets stored in NetCDF (.nc) files.
- Explore radar observations and analyze radar scans.
- Visualize reflectivity distributions and variations by location, altitude, and time.
- Use scientific Python libraries for reading and processing data.

The demonstration includes synthetic scans and common polar NetCDF adapters. Uploaded inputs remain local, session-only and immutable. Production dataset validation, verified antenna coordinates, range semantics, geospatial registration, processing infrastructure and hosting remain future decisions. Real Mahabaleshwar data is not established by the reference samples.

## Evidence on Hand

The repository initially contains only `README.md`, naming this project. The sample was located at `C:\Users\Office Pc\Downloads\RadarValidationPortal-main\RadarValidationPortal-main` and its source was inspected.

Verified source architecture: React 19 with Vite, Axios and React Leaflet; Express 5 with Mongoose/MongoDB and JWT authentication; Python subprocesses using Py-ART and Matplotlib. `get_variables.py` reads radar files with `pyart.io.read` and returns radar field names. `plot_service.py` generates static PPI/RHI PNG plots using the first sweep and a fixed -30 to 80 color range. The API also serves existing plot images. These are source observations, not proof of a successful runtime.

The sample contains eight NetCDF files, approximately 0.75 to 14.63 MB each (decimal units). Its upload endpoint caps each file at 50 MiB. Neither the sample sizes nor that cap establish suitability for the intended large datasets.

Initial startup attempts failed because Express and Vite were not installed. The default Python interpreter has NumPy, Xarray, and Matplotlib, but lacks Py-ART and NetCDF4. End-to-end behavior, radar metadata, performance, and scientific validation remain unverified.

## Product Principles

- Ground implementation decisions in the existing sample and actual radar datasets.
- Prioritize research workflows for understanding reflectivity across space, altitude, and time.
- Consider large-file processing when selecting the architecture.
- Preserve the distinction between intended capabilities and verified implementation.
- Follow the approved Beam to Data landing direction and keep the analytical workspace restrained.
- Defer database and accounts until the demonstration has been accepted.
