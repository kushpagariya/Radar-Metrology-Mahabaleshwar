export type Field = 'reflectivity' | 'rainfall';
export type Scan = {
  id: string; name: string; timestamp: string; synthetic: boolean;
  latitude: number; longitude: number; elevation: number;
  azimuths: number[]; ranges: number[]; values: (number | null)[][];
  field: string; units: string; source: string; sweep: number;
};
export const TIMES = ['06:00', '06:08', '06:16', '06:24', '06:32', '06:40'];
export const PALETTE = ['#d7eced','#80c9de','#429fc1','#2778ae','#58ab8c','#8dc96b','#d4d965','#f1cb54','#efa348','#dc7044','#bd4246','#8d4168'];
export function colorFor(value: number, min = 0, max = 60) {
  return PALETTE[Math.max(0, Math.min(PALETTE.length - 1, Math.floor((value - min) / (max - min) * PALETTE.length)))];
}
export function rainRate(dbz: number, a: number, b: number) { return Math.pow(Math.pow(10, dbz / 10) / a, 1 / b); }
export function formatDistance(km:number) { return km<1?`${Math.round(km*1000)} m`:`${Number(km.toFixed(1))} km`; }
export function makeDemoScan(time = 2, elevation = 0.5): Scan {
  const azimuths = Array.from({ length: 180 }, (_, i) => i * 2);
  const ranges = Array.from({ length: 110 }, (_, i) => (i + 1) * 0.75);
  const values = azimuths.map((az, ai) => ranges.map((r, ri) => {
    const x = r * Math.sin(az * Math.PI / 180), y = r * Math.cos(az * Math.PI / 180);
    const drift = (time - 2) * 2.3;
    const band = 39 * Math.exp(-Math.pow((x + 23 - drift + 12 * Math.sin(y / 26)) / 18, 2) - Math.pow(y / 76, 2));
    const cells = 22 * Math.exp(-((x + 14 - drift) ** 2 + (y - 21) ** 2) / 185)
      + 26 * Math.exp(-((x - 35 - drift) ** 2 + (y + 20) ** 2) / 360)
      + 17 * Math.exp(-((x + 36 - drift) ** 2 + (y + 31) ** 2) / 290);
    const noise = 3 * Math.sin(ai * 12.9898 + ri * 78.233) + 2 * Math.sin(x * .52 + y * .34);
    const v = Math.max(0, Math.min(62, band + cells + noise - (elevation - .5) * 2));
    return v < 7 || r < 2 ? null : Math.round(v * 10) / 10;
  }));
  return { id: `demo-${time}`, name: `illustrative_volume_${TIMES[time].replace(':','')}.nc`, timestamp: `2026-07-15T${TIMES[time]}:00Z`, synthetic: true, latitude: 17.92, longitude: 73.60, elevation, azimuths, ranges, values, field: 'reflectivity', units: 'dBZ', source: 'Deterministic synthetic radar volume; approximate HACPL reference location', sweep: 0 };
}
export function download(name: string, data: string | Blob, type = 'application/json') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function scanStats(scan: Scan) {
  let max = -Infinity, sum = 0, count = 0;
  for (const row of scan.values) for (const v of row) if (v !== null && Number.isFinite(v)) { max = Math.max(max, v); sum += v; count++; }
  return { max: count ? max : 0, mean: count ? sum / count : 0, count, coverage: count / (scan.azimuths.length * scan.ranges.length) * 100 };
}
