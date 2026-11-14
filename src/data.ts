export type Field = 'reflectivity' | 'rainfall';
export type PlotField = Field | 'difference';
export type Scan = {
  id: string;
  name: string;
  timestamp: string;
  synthetic: boolean;
  latitude: number;
  longitude: number;
  elevation: number;
  azimuths: number[];
  ranges: number[];
  values: (number | null)[][];
  field: string;
  units: string;
  source: string;
  sweep: number;
};
export type Gate = { az: number; range: number };

export const VERSION = 'radar-metrology-prototype-0.2.0';
export const TIMES = ['06:00', '06:08', '06:16', '06:24', '06:32', '06:40'];
export const DEMO_ELEVATIONS = [0.5, 1.5, 2.5, 3.5];
export const DEMO_RANGE_KM = 82.5;
/** Assumed half-power beamwidth for drawing beam volumes. Not an instrument specification. */
export const BEAMWIDTH_DEG = 1;

export const PALETTE = [
  '#d7eced',
  '#80c9de',
  '#429fc1',
  '#2778ae',
  '#58ab8c',
  '#8dc96b',
  '#d4d965',
  '#f1cb54',
  '#efa348',
  '#dc7044',
  '#bd4246',
  '#8d4168',
];
/** Diverging scale for scan differences: blue = weakening, red = strengthening. */
export const DIVERGING = [
  '#2b5d8c',
  '#4a86b4',
  '#7fb0d3',
  '#b8d6e8',
  '#e6eff2',
  '#f4ece4',
  '#f2cdb3',
  '#e49a76',
  '#cc6449',
  '#a23a33',
];

export function colorFor(value: number, min = 0, max = 60, palette = PALETTE) {
  const index = Math.floor(((value - min) / (max - min)) * palette.length);
  return palette[Math.max(0, Math.min(palette.length - 1, index))];
}

/** CSS gradient with hard stops so the legend matches the stepped colours drawn on the plot. */
export function steppedGradient(palette = PALETTE) {
  const step = 100 / palette.length;
  return `linear-gradient(to right, ${palette
    .map((c, i) => `${c} ${(i * step).toFixed(3)}% ${((i + 1) * step).toFixed(3)}%`)
    .join(', ')})`;
}

export function rainRate(dbz: number, a: number, b: number) {
  return Math.pow(Math.pow(10, dbz / 10) / a, 1 / b);
}

export type ZRPreset = { id: string; label: string; a: number; b: number; note: string };
export const ZR_PRESETS: ZRPreset[] = [
  { id: 'mp', label: 'Marshall–Palmer', a: 200, b: 1.6, note: 'Stratiform baseline' },
  { id: 'nexrad', label: 'WSR-88D convective', a: 300, b: 1.4, note: 'Deep convection default' },
  { id: 'tropical', label: 'Rosenfeld tropical', a: 250, b: 1.2, note: 'Warm-rain, maritime/monsoon' },
  { id: 'custom', label: 'Custom', a: 200, b: 1.6, note: 'User-defined coefficients' },
];

export function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${Number(km.toFixed(1))} km`;
}

/**
 * Height of the beam centre above the radar (km) using the standard 4/3 effective-Earth-radius model.
 * Assumes standard refraction; anomalous propagation is not modelled.
 */
export function beamHeight(rangeKm: number, elevationDeg: number) {
  const ke = (4 / 3) * 6371;
  const theta = (elevationDeg * Math.PI) / 180;
  return Math.sqrt(rangeKm ** 2 + ke ** 2 + 2 * rangeKm * ke * Math.sin(theta)) - ke;
}

export function makeDemoScan(time = 2, elevation = 0.5): Scan {
  const azimuths = Array.from({ length: 180 }, (_, i) => i * 2);
  const ranges = Array.from({ length: 110 }, (_, i) => (i + 1) * 0.75);
  const values = azimuths.map((az, ai) =>
    ranges.map((r, ri) => {
      const x = r * Math.sin((az * Math.PI) / 180),
        y = r * Math.cos((az * Math.PI) / 180);
      const h = beamHeight(r, elevation);
      const drift = (time - 2) * 2.3;
      // Stratiform band weakens above ~4 km; convective cells extend higher. Illustrative only.
      const band =
        39 *
        Math.exp(-Math.pow((x + 23 - drift + 12 * Math.sin(y / 26)) / 18, 2) - Math.pow(y / 76, 2)) *
        Math.exp(-Math.max(0, h - 4) / 1.5);
      const cells =
        (22 * Math.exp(-((x + 14 - drift) ** 2 + (y - 21) ** 2) / 185) +
          26 * Math.exp(-((x - 35 - drift) ** 2 + (y + 20) ** 2) / 360) +
          17 * Math.exp(-((x + 36 - drift) ** 2 + (y + 31) ** 2) / 290)) *
        Math.exp(-Math.max(0, h - 7) / 2);
      const noise = 3 * Math.sin(ai * 12.9898 + ri * 78.233) + 2 * Math.sin(x * 0.52 + y * 0.34);
      const v = Math.max(0, Math.min(62, band + cells + noise - (elevation - 0.5) * 2));
      return v < 7 || r < 2 ? null : Math.round(v * 10) / 10;
    }),
  );
  return {
    id: `demo-${time}-${elevation}`,
    name: `illustrative_volume_${TIMES[time].replace(':', '')}.nc`,
    timestamp: `2026-07-15T${TIMES[time]}:00Z`,
    synthetic: true,
    latitude: 17.92,
    longitude: 73.6,
    elevation,
    azimuths,
    ranges,
    values,
    field: 'reflectivity',
    units: 'dBZ',
    source: 'Deterministic synthetic radar volume; approximate HACPL reference location',
    sweep: DEMO_ELEVATIONS.indexOf(elevation),
  };
}

const demoCache = new Map<string, Scan>();
export function demoScan(time: number, elevation: number) {
  const key = `${time}-${elevation}`;
  let scan = demoCache.get(key);
  if (!scan) {
    scan = makeDemoScan(time, elevation);
    demoCache.set(key, scan);
  }
  return scan;
}

export function download(name: string, data: string | Blob, type = 'application/json') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function angularDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

/** Nearest sampled gate indices, or null when the location falls outside the sampled geometry. */
export function nearestGate(scan: Scan, gate: Gate) {
  let ai = 0;
  scan.azimuths.forEach((v, i) => {
    if (angularDistance(v, gate.az) < angularDistance(scan.azimuths[ai], gate.az)) ai = i;
  });
  let ri = 0;
  scan.ranges.forEach((v, i) => {
    if (Math.abs(v - gate.range) < Math.abs(scan.ranges[ri] - gate.range)) ri = i;
  });
  const next = scan.azimuths[ai + 1] ?? scan.azimuths[ai] + (scan.azimuths[ai] - scan.azimuths[ai - 1] || 1);
  const rayWidth = Math.min(3, Math.abs(next - scan.azimuths[ai]) || 1);
  const halfGate = Math.abs((scan.ranges[1] ?? scan.ranges[0]) - scan.ranges[0]) / 2;
  const inside =
    angularDistance(scan.azimuths[ai], gate.az) <= rayWidth / 2 + 1e-9 &&
    gate.range >= scan.ranges[0] - halfGate &&
    gate.range <= scan.ranges[scan.ranges.length - 1] + halfGate;
  return inside ? { ai, ri } : null;
}

export function valueAt(scan: Scan, gate: Gate) {
  const idx = nearestGate(scan, gate);
  return idx ? (scan.values[idx.ai]?.[idx.ri] ?? null) : null;
}

export function scanStats(scan: Scan, threshold: number | null = null) {
  let max = -Infinity,
    sum = 0,
    count = 0,
    area = 0;
  const dTheta = scan.azimuths.length > 1 ? Math.abs(scan.azimuths[1] - scan.azimuths[0]) || 1 : 1;
  const dr = scan.ranges.length > 1 ? scan.ranges[1] - scan.ranges[0] : 1;
  scan.values.forEach((row) =>
    row.forEach((v, ri) => {
      if (v === null || !Number.isFinite(v)) return;
      max = Math.max(max, v);
      sum += v;
      count++;
      if (threshold !== null && v >= threshold) area += scan.ranges[ri] * dr * ((dTheta * Math.PI) / 180);
    }),
  );
  return {
    max: count ? max : 0,
    mean: count ? sum / count : 0,
    count,
    coverage: (count / (scan.azimuths.length * scan.ranges.length)) * 100,
    areaKm2: area,
  };
}

export function histogram(scan: Scan, binSize = 5, lo = 0, hi = 65) {
  const bins = Array.from({ length: Math.ceil((hi - lo) / binSize) }, (_, i) => ({
    from: lo + i * binSize,
    to: lo + (i + 1) * binSize,
    count: 0,
  }));
  for (const row of scan.values)
    for (const v of row) {
      if (v === null || !Number.isFinite(v)) continue;
      const i = Math.max(0, Math.min(bins.length - 1, Math.floor((v - lo) / binSize)));
      bins[i].count++;
    }
  return bins;
}

/** Gate-by-gate difference (b − a). Requires identical polar geometry. */
export function differenceScan(a: Scan, b: Scan): Scan | null {
  if (
    a.azimuths.length !== b.azimuths.length ||
    a.ranges.length !== b.ranges.length ||
    a.azimuths.some((v, i) => Math.abs(v - b.azimuths[i]) > 1e-6) ||
    a.ranges.some((v, i) => Math.abs(v - b.ranges[i]) > 1e-6)
  )
    return null;
  return {
    ...b,
    id: `${a.id}-vs-${b.id}`,
    values: b.values.map((row, ai) =>
      row.map((v, ri) => {
        const u = a.values[ai][ri];
        // Treat no-echo as 0 dBZ so growth and decay at echo edges remain visible.
        if (v === null && u === null) return null;
        return Math.round(((v ?? 0) - (u ?? 0)) * 10) / 10;
      }),
    ),
    field: 'difference',
  };
}

/**
 * Browser implementation of the backend trapezoidal accumulation (backend/science.py `integrate`).
 * Intervals longer than maxGapMinutes are excluded rather than interpolated.
 */
export function accumulate(scans: Scan[], a: number, b: number, maxGapMinutes = 15) {
  const times = scans.map((s) => Date.parse(s.timestamp));
  const shape = scans[0].values;
  const total = shape.map((row) => row.map(() => 0));
  const covered = shape.map((row) => row.map(() => 0));
  const gaps: { start: string; end: string; minutes: number }[] = [];
  for (let i = 0; i < scans.length - 1; i++) {
    const hours = (times[i + 1] - times[i]) / 3600000;
    if (hours * 60 > maxGapMinutes) {
      gaps.push({ start: scans[i].timestamp, end: scans[i + 1].timestamp, minutes: hours * 60 });
      continue;
    }
    shape.forEach((row, ai) =>
      row.forEach((_, ri) => {
        const u = scans[i].values[ai][ri],
          v = scans[i + 1].values[ai][ri];
        const r0 = u === null ? 0 : rainRate(u, a, b),
          r1 = v === null ? 0 : rainRate(v, a, b);
        total[ai][ri] += ((r0 + r1) / 2) * hours;
        covered[ai][ri] += hours;
      }),
    );
  }
  return {
    values: total.map((row, ai) =>
      row.map((v, ri) => (covered[ai][ri] > 0 && v >= 0.01 ? Math.round(v * 100) / 100 : null)),
    ),
    gaps,
    periodHours: (times[times.length - 1] - times[0]) / 3600000,
  };
}

/* ---------- Processed MBL-RADAR archive (backend/pipeline.py) ---------- */

export type VolumeStats = {
  max_dbz: number | null;
  valid_bins: number;
  area_20_km2: number;
  area_35_km2: number;
  area_45_km2: number;
  mean_rate_mm_hr: number;
  azimuth_coverage: number;
};
export type ArchiveVolume = {
  index: number;
  name: string;
  start: string;
  end: string;
  volume_number: number;
  rays_per_sweep: number[];
  fixed_angles: number[];
  fields: string[];
  stats: VolumeStats;
  issues: string[];
};
export type ArchiveSite = {
  name: string;
  latitude: number;
  longitude: number;
  altitude_m: number;
  beamwidth_deg: number;
  frequency_ghz: number;
};
export type ArchiveGap = { after: string; before: string; minutes: number; missing_volumes: number };
export type ArchiveDaySummary = {
  date: string;
  site: ArchiveSite;
  volume_count: number;
  expected_volumes: number;
  gaps: ArchiveGap[];
  fixed_angles: number[];
  profile_deviations: string[];
  pipeline: string;
  summary: { peak_dbz: number | null; max_area_35_km2: number; raw_megabytes: number };
};
export type ArchiveCatalog = ArchiveDaySummary & {
  fields: string[];
  scan_name: string;
  failures: { name: string; error: string }[];
  product: { grid: string; qc: Record<string, unknown>; encoding: string };
  volumes: ArchiveVolume[];
};

export const DBZ_FIELDS: Record<string, string> = {
  DBZ: 'DBZ · filtered reflectivity',
  DBZ_TOT: 'DBZ_TOT · unfiltered',
  DBZV: 'DBZV · vertical channel',
  DBZE: 'DBZE · enhanced',
};

/** "12:00 UTC" from an ISO timestamp. */
export function utcClock(iso: string) {
  return new Date(iso).toISOString().slice(11, 16);
}
/** India Standard Time (UTC+05:30) clock for the same instant. */
export function istClock(iso: string) {
  return new Date(Date.parse(iso) + 5.5 * 3600000).toISOString().slice(11, 16);
}
export function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
