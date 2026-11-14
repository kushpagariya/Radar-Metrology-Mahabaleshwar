import { beamHeight, download, nearestGate, PALETTE, DIVERGING, VERSION, type Scan } from '../data';
import type { ViewState } from './state';

type ExportContext = {
  state: ViewState;
  scan: Scan;
  /** The scan actually displayed (accumulation or difference may replace the source scan). */
  displayed: Scan;
  sweeps: Scan[];
  transform: (v: number) => number;
  units: string;
  scale: { min: number; max: number };
  canvas: HTMLCanvasElement | null;
};

const VIEW_NAMES = {
  ppi: 'PPI',
  map: 'Regional map',
  section: 'Cross-section',
  compare: 'Comparison',
  accum: 'Accumulation',
};

function provenance(ctx: ExportContext) {
  const { state, scan, displayed, units, scale } = ctx;
  return {
    source: {
      name: scan.name,
      synthetic: scan.synthetic,
      timestamp: scan.timestamp,
      elevation_deg: scan.elevation,
      sweep: scan.sweep,
      latitude: scan.latitude,
      longitude: scan.longitude,
      description: scan.source,
    },
    view: VIEW_NAMES[state.view],
    displayed_field: displayed === ctx.scan ? state.field : displayed.field,
    units,
    display: { ...scale, range_km: state.range, threshold_dbz: state.threshold },
    rainfall_relation:
      state.field === 'rainfall' || state.view === 'accum'
        ? { method: 'Z = a R^b', preset: state.zr, a: state.a, b: state.b }
        : null,
    pinned_gate: state.pin,
    comparison:
      state.view === 'compare' ? { reference_time_index: state.compareTime, mode: state.compareMode } : null,
    link: window.location.href,
    software: VERSION,
    exported_at: new Date().toISOString(),
  };
}

export function exportJson(ctx: ExportContext) {
  download(
    `radar-${ctx.displayed.id}.json`,
    JSON.stringify(
      {
        provenance: provenance(ctx),
        azimuths: ctx.displayed.azimuths,
        ranges: ctx.displayed.ranges,
        values: ctx.displayed.values,
      },
      null,
      2,
    ),
  );
}

export function exportCsv(ctx: ExportContext) {
  const { state, displayed, transform, units, sweeps } = ctx;
  const rows: string[] = [];
  const tf = displayed === ctx.scan || state.view === 'section' ? transform : (v: number) => v;
  if (state.view === 'section') {
    rows.push('azimuth_deg,elevation_deg,range_km,beam_height_km,value,units');
    const az = state.pin?.az ?? 270;
    for (const s of sweeps) {
      const idx = nearestGate(s, { az, range: s.ranges[0] });
      if (!idx) continue;
      s.ranges.forEach((r, ri) => {
        if (r > state.range) return;
        const v = s.values[idx.ai][ri];
        rows.push(
          [
            s.azimuths[idx.ai],
            s.elevation,
            r,
            beamHeight(r, s.elevation).toFixed(3),
            v == null ? '' : tf(v),
            units,
          ].join(','),
        );
      });
    }
  } else {
    rows.push('timestamp,sweep,elevation_deg,azimuth_deg,range_km,value,units,synthetic,zr_a,zr_b');
    const rain = state.field === 'rainfall' || state.view === 'accum';
    displayed.azimuths.forEach((az, ai) =>
      displayed.ranges.forEach((r, ri) => {
        if (r > state.range) return;
        const v = displayed.values[ai]?.[ri];
        rows.push(
          [
            `"${displayed.timestamp}"`,
            displayed.sweep,
            displayed.elevation,
            az,
            r,
            v == null ? '' : tf(v),
            units,
            displayed.synthetic,
            rain ? state.a : '',
            rain ? state.b : '',
          ].join(','),
        );
      }),
    );
  }
  download(`radar-${displayed.id}-${state.view}.csv`, rows.join('\n'), 'text/csv');
}

export function exportPng(ctx: ExportContext) {
  const { canvas: source, state, scan, units, scale } = ctx;
  if (!source) return;
  // Text and margins scale with the canvas' device-pixel ratio so captions stay readable on high-DPI screens.
  const k = source.width / Math.max(1, source.clientWidth);
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height + 150 * k;
  const ctx2 = output.getContext('2d')!;
  ctx2.fillStyle = '#f8faf5';
  ctx2.fillRect(0, 0, output.width, output.height);
  ctx2.fillStyle = '#294c3e';
  ctx2.font = `${16 * k}px "DM Sans", sans-serif`;
  ctx2.fillText(
    `Radar Metrology · ${VIEW_NAMES[state.view]} · ${units} · ${scan.synthetic ? 'SYNTHETIC DATA' : 'Uploaded scan'}`,
    20 * k,
    28 * k,
  );
  ctx2.font = `${12 * k}px "DM Sans", sans-serif`;
  ctx2.fillText(
    `${ctx.displayed.timestamp} · elevation ${scan.elevation.toFixed(2)}° · range ${state.range.toFixed(1)} km`,
    20 * k,
    50 * k,
  );
  ctx2.drawImage(source, 0, 65 * k);
  const y = source.height + 85 * k;
  const palette = units === 'ΔdBZ' ? DIVERGING : PALETTE;
  const bw = (output.width - 40 * k) / palette.length;
  palette.forEach((c, i) => {
    ctx2.fillStyle = c;
    ctx2.fillRect(20 * k + i * bw, y, bw, 9 * k);
  });
  ctx2.fillStyle = '#496b3b';
  ctx2.font = `${11 * k}px "DM Sans", sans-serif`;
  const zr = state.field === 'rainfall' || state.view === 'accum' ? `Z = ${state.a} R^${state.b} · ` : '';
  ctx2.fillText(`${scale.min} — ${scale.max} ${units} · ${zr}Source: ${scan.name}`, 20 * k, y + 28 * k);
  ctx2.fillText(`Display product · no gauge validation · ${VERSION}`, 20 * k, y + 47 * k);
  output.toBlob((blob) => {
    if (blob) download(`radar-${ctx.displayed.id}-${state.view}.png`, blob);
  }, 'image/png');
}
