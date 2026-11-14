import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { colorFor, makeDemoScan, PALETTE, steppedGradient, TIMES, utcClock, type Scan } from '../data';

export type ReplaySource = {
  observed: boolean;
  title: string;
  frames: { label: string; scan: Scan }[];
  link: string;
};

/** Up to `count` frames around the busiest volume of the busiest processed day, or the synthetic demo. */
export async function loadReplay(signal: AbortSignal, count = 10): Promise<ReplaySource> {
  const demo = (): ReplaySource => ({
    observed: false,
    title: 'Illustrative volume · synthetic',
    frames: TIMES.map((t, i) => ({ label: `${t} UTC`, scan: makeDemoScan(i, 0.5) })),
    link: '#/dashboard',
  });
  try {
    const days = await fetch('/api/archive', { signal }).then((r) => (r.ok ? r.json() : []));
    if (!Array.isArray(days) || !days.length) return demo();
    const day = days.reduce((a: any, b: any) =>
      b.summary.max_area_35_km2 > a.summary.max_area_35_km2 ? b : a,
    );
    const catalog = await fetch(`/api/archive/${day.date}`, { signal }).then((r) => r.json());
    const vols = catalog.volumes as { start: string; stats: { area_35_km2: number } }[];
    const busiest = vols.reduce((b, v, i) => (v.stats.area_35_km2 > vols[b].stats.area_35_km2 ? i : b), 0);
    const start = Math.max(0, Math.min(vols.length - count, busiest - Math.floor(count * 0.7)));
    const idx = Array.from({ length: Math.min(count, vols.length) }, (_, k) => start + k);
    const scans: Scan[] = await Promise.all(
      idx.map((i) =>
        fetch(`/api/archive/${day.date}/volumes/${i}/product`, { signal }).then((r) => r.json()),
      ),
    );
    return {
      observed: true,
      title: `${catalog.site.name} · Mahabaleshwar`,
      frames: scans.map((scan, k) => ({ label: `${utcClock(vols[idx[k]].start)} UTC`, scan })),
      link: `#/dashboard?src=day%3A${day.date}&t=${busiest}&range=120`,
    };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    return demo();
  }
}

/** Renders a polar scan to an ImageData-backed canvas once, so playback is just image swaps. */
function rasterise(scan: Scan, size: number, rangeKm: number, background: [number, number, number, number]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rgb = PALETTE.map((c) => [
    parseInt(c.slice(1, 3), 16),
    parseInt(c.slice(3, 5), 16),
    parseInt(c.slice(5, 7), 16),
  ]);
  const lookup = new Map(PALETTE.map((c, i) => [c, rgb[i]]));
  const nAz = scan.azimuths.length;
  const azStep = nAz > 1 ? (scan.azimuths[nAz - 1] - scan.azimuths[0]) / (nAz - 1) : 1;
  const r0 = scan.ranges[0],
    dr = scan.ranges[1] - scan.ranges[0];
  const half = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = x - half + 0.5,
        dy = half - y - 0.5;
      const rKm = (Math.hypot(dx, dy) / half) * rangeKm;
      const o = (y * size + x) * 4;
      if (rKm > rangeKm) {
        img.data[o + 3] = 0;
        continue;
      }
      const az = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      const ai = Math.round((az - scan.azimuths[0]) / azStep);
      const ri = Math.round((rKm - r0) / dr);
      const v = scan.values[(ai + nAz) % nAz]?.[ri];
      if (v == null) {
        img.data.set(background, o);
      } else {
        const [r, g, b] = lookup.get(colorFor(v, 0, 60))!;
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export default function StormReplay({
  source,
  theme,
}: {
  source: ReplaySource | null;
  theme: 'light' | 'dark';
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [frame, setFrame] = useState(0);
  const reduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [playing, setPlaying] = useState(!reduced);
  const [images, setImages] = useState<HTMLCanvasElement[]>([]);
  const RANGE = 120;

  useEffect(() => {
    if (!source) return;
    const bg: [number, number, number, number] = theme === 'dark' ? [9, 22, 27, 255] : [246, 249, 246, 255];
    // Rasterise progressively so the first frame appears immediately.
    let cancelled = false;
    const out: HTMLCanvasElement[] = [];
    const step = (i: number) => {
      if (cancelled || i >= source.frames.length) return;
      out.push(rasterise(source.frames[i].scan, 560, RANGE, bg));
      setImages([...out]);
      setTimeout(() => step(i + 1), 0);
    };
    step(0);
    return () => {
      cancelled = true;
    };
  }, [source, theme]);

  useEffect(() => {
    if (!playing || images.length < 2) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % images.length), 900);
    return () => clearInterval(t);
  }, [playing, images.length]);

  useEffect(() => {
    const canvas = ref.current;
    const img = images[Math.min(frame, images.length - 1)];
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = canvas.height = 560;
    ctx.clearRect(0, 0, 560, 560);
    ctx.drawImage(img, 0, 0);
    // Range rings and cardinal ticks
    ctx.strokeStyle = theme === 'dark' ? 'rgba(170,210,210,0.22)' : 'rgba(40,80,80,0.22)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      ctx.beginPath();
      ctx.arc(280, 280, (280 * i) / 4 - 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.moveTo(0, 280);
    ctx.lineTo(560, 280);
    ctx.moveTo(280, 0);
    ctx.lineTo(280, 560);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = theme === 'dark' ? '#e6efec' : '#1f3534';
    ctx.beginPath();
    ctx.arc(280, 280, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }, [frame, images, theme]);

  const current = source?.frames[Math.min(frame, (source?.frames.length ?? 1) - 1)];
  return (
    <figure className="lp-replay" aria-label="Radar reflectivity replay">
      <div className="lp-replay-head">
        <span className={`lp-chip ${source?.observed ? 'live' : ''}`}>
          <i />
          {source ? (source.observed ? 'Observed data' : 'Synthetic demo') : 'Loading'}
        </span>
        <span className="lp-replay-title">{source?.title ?? 'Preparing replay…'}</span>
      </div>
      <div className="lp-scope">
        <canvas ref={ref} role="img" aria-label={`Reflectivity PPI, ${current?.label ?? ''}`} />
        {!reduced && <div className="lp-sweep" aria-hidden="true" />}
        <span className="lp-scope-n">N</span>
        <span className="lp-scope-range">{RANGE} km</span>
      </div>
      <figcaption className="lp-replay-foot">
        <button
          className="lp-icon-btn"
          onClick={() => setPlaying(!playing)}
          aria-label={playing ? 'Pause replay' : 'Play replay'}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <div className="lp-replay-time">
          <strong>{current?.label ?? '—'}</strong>
          <span>0.5° reflectivity</span>
        </div>
        <div className="lp-replay-scale">
          <div style={{ background: steppedGradient() }} />
          <span>
            <span>0</span>
            <span>30</span>
            <span>60 dBZ</span>
          </span>
        </div>
      </figcaption>
      <div className="lp-replay-dots" aria-hidden="true">
        {source?.frames.map((f, i) => (
          <i key={f.label} className={i === frame ? 'on' : ''} />
        ))}
      </div>
    </figure>
  );
}
