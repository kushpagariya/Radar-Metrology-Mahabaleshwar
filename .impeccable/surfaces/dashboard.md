# Scientific workspace

Target: `src/Dashboard.tsx` workspace routes (`#/dashboard`, `#/dashboard/methods`). Related targets: `src/Plot.tsx`, `src/data.ts`, `src/styles.css`, `src/legibility.css`, `src/exhibition.css`.

Visitor mode: Operate / Read. Audience: radar researchers and meteorologists. Job: inspect reflectivity, select a source/elevation/time, explore formula-based rainfall and keep method assumptions visible. Primary tasks: explore a scan, inspect local NetCDF input, adjust scientific display controls and export the current view or data.

## Direction contract

THESIS: A formal, minimal scientific workspace keeps the observation and its controls central. The exhibition's spacious drama becomes compact analytical structure.

OWN-WORLD: Sage navigation, pale green-grey paper, white plots and forms, dark teal actions, Manrope titles and DM Sans scientific labels. Fine borders and modest corners establish panels; measured data supplies the broad colour range.

STORY: Select or import a source, inspect the PPI or schematic context, follow explicit methods and export traceable outputs. Synthetic and uploaded states remain distinguishable. Optional rainfall is derived from the selected scan, with a baseline method row beside the plot rather than a standalone calculator.

FIRST VIEWPORT: Desktop fixed sidebar, slim top bar, page title and export control, provenance strip, narrow scientific controls and a wide plot with view tabs, legend and timeline. Phone navigation moves above a stacked control/plot layout. Analysis remains primary at each size.

FORM: Formal minimal analysis workspace in the pinned Beam to Data family; no ordinal alternative is recorded. `seed:7f3f58dd80d7cb06`. Code-led execution; no approved composition image.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Implemented evidence

The primary navigation contains Radar workspace and Data library. Methodology is secondary; Overview and the standalone rainfall calculator have been removed. Plots carry value scales and units; readouts expose azimuth and range. Rainfall appears as a selected-scan product with the fixed Marshall–Palmer baseline and an assumptions link. The backend formula API retains configurable scientific parameters. Regional map context is explicitly schematic and not georeferenced. Inputs remain local and session-only. The local FastAPI service supplies temporary NetCDF processing and NumPy-based calculations; no database, authentication or account workflow is present.

Review evidence locations: `.qa/workspace-desktop.png`, `.qa/workspace-mobile.png`, `.qa/rainfall-desktop.png`. These are evidence targets being refreshed; this brief does not certify their final review outcome. Global tokens are recorded in `DESIGN.md`.

## Open boundaries

Production dataset validation, verified coordinates, geographic registration and domain validation remain future work. Supabase is deferred. Keep the source/synthetic distinction and the schematic-context qualifier visible; do not add operational or verified-data claims through visual presentation.
