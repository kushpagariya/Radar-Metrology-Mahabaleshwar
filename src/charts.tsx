import { useEffect, useRef, useState } from 'react';
import { BEAMWIDTH_DEG, beamHeight, colorFor, formatDistance, nearestGate, PALETTE, type Scan } from './data';

/**
 * Range–height cross-section along one azimuth, assembled from the available PPI sweeps.
 * Each gate is drawn as its beam volume (centre ± half the assumed beamwidth) under the 4/3 Earth model.
 */
export function CrossSection({
  sweeps,
  azimuth,
  range,
  min,
  max,
  transform,
  units,
  pinRange,
  beamwidth = BEAMWIDTH_DEG,
  canvasRef,
}: {
  sweeps: Scan[];
  azimuth: number;
  range: number;
  min: number;
  max: number;
  transform: (v: number) => number;
  units: string;
  pinRange?: number | null;
  beamwidth?: number;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
}) {
  const own = useRef<HTMLCanvasElement>(null),
    ref = canvasRef || own;
  const [probe, setProbe] = useState<{ r: number; h: number; v: number | null; el: number } | null>(null);
  const topKm = Math.min(
    16,
    Math.max(4, Math.ceil(Math.max(...sweeps.map((s) => beamHeight(range, s.elevation + beamwidth / 2))))),
  );
  const pad = { l: 52, r: 18, t: 18, b: 64 };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const w = canvas.clientWidth,
        h = canvas.clientHeight,
        dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#f8faf8';
      ctx.fillRect(0, 0, w, h);
      const pw = w - pad.l - pad.r,
        ph = h - pad.t - pad.b;
      const X = (r: number) => pad.l + (r / range) * pw,
        Y = (km: number) => pad.t + ph - (km / topKm) * ph;

      // Grid
      ctx.strokeStyle = '#dfe6dd';
      ctx.lineWidth = 1;
      ctx.font = '11px "DM Sans", sans-serif';
      ctx.fillStyle = '#5c6a64';
      for (let k = 0; k <= topKm; k += topKm > 8 ? 2 : 1) {
        ctx.beginPath();
        ctx.moveTo(pad.l, Y(k));
        ctx.lineTo(w - pad.r, Y(k));
        ctx.stroke();
        ctx.textAlign = 'right';
        ctx.fillText(`${k} km`, pad.l - 8, Y(k) + 4);
      }
      ctx.textAlign = 'center';
      for (let i = 0; i <= 4; i++) {
        const r = (range * i) / 4;
        ctx.fillText(formatDistance(r), X(r), h - pad.b + 18);
      }

      const placed: [number, number][] = [];
      for (const s of sweeps) {
        const idx = nearestGate(s, { az: azimuth, range: s.ranges[0] });
        if (!idx) continue;
        const row = s.values[idx.ai];
        const lo = s.elevation - beamwidth / 2,
          hi = s.elevation + beamwidth / 2;
        s.ranges.forEach((r, ri) => {
          const v = row[ri];
          if (v == null || r > range) return;
          const r0 = ri ? (s.ranges[ri - 1] + r) / 2 : Math.max(0, r - (s.ranges[1] - r) / 2);
          const r1 = Math.min(range, ri < s.ranges.length - 1 ? (r + s.ranges[ri + 1]) / 2 : r);
          ctx.beginPath();
          ctx.moveTo(X(r0), Y(beamHeight(r0, lo)));
          // Half-pixel overlap hides anti-aliasing seams between adjacent gates.
          ctx.lineTo(X(r1) + 0.5, Y(beamHeight(r1, lo)));
          ctx.lineTo(X(r1) + 0.5, Y(beamHeight(r1, hi)));
          ctx.lineTo(X(r0), Y(beamHeight(r0, hi)));
          ctx.closePath();
          ctx.fillStyle = colorFor(transform(v), min, max, PALETTE);
          ctx.fill();
        });
        // Beam centre line and elevation label
        ctx.strokeStyle = '#2f4f4c55';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        for (let r = 0; r <= range; r += range / 60) {
          r === 0
            ? ctx.moveTo(X(r), Y(beamHeight(r, s.elevation)))
            : ctx.lineTo(X(r), Y(beamHeight(r, s.elevation)));
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#35514d';
        ctx.textAlign = 'left';
        // Label where the beam centre leaves the plot (right edge or top), skipping overlaps.
        const hEnd = beamHeight(range, s.elevation);
        let lx = w - pad.r - 30,
          ly = Y(hEnd) - 4;
        if (hEnd > topKm) {
          let r = range;
          while (r > 0 && beamHeight(r, s.elevation) > topKm) r -= range / 200;
          lx = Math.min(w - pad.r - 30, X(r) + 4);
          ly = pad.t + 10;
        }
        if (!placed.some(([px, py]) => Math.abs(px - lx) < 30 && Math.abs(py - ly) < 12)) {
          ctx.fillText(`${s.elevation.toFixed(1)}°`, lx, ly);
          placed.push([lx, ly]);
        }
      }
      if (pinRange != null && pinRange <= range) {
        ctx.strokeStyle = '#1e3f3f';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(X(pinRange), pad.t);
        ctx.lineTo(X(pinRange), pad.t + ph);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = '#9fb0a8';
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t + ph);
      ctx.lineTo(w - pad.r, pad.t + ph);
      ctx.stroke();
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [sweeps, azimuth, range, min, max, transform, topKm, pinRange, ref, beamwidth]);

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const pw = box.width - pad.l - pad.r,
      ph = box.height - pad.t - pad.b;
    const r = ((e.clientX - box.left - pad.l) / pw) * range,
      km = ((pad.t + ph - (e.clientY - box.top)) / ph) * topKm;
    if (r < 0 || r > range || km < 0) return setProbe(null);
    for (const s of sweeps) {
      if (
        km >= beamHeight(r, s.elevation - beamwidth / 2) &&
        km <= beamHeight(r, s.elevation + beamwidth / 2)
      ) {
        const idx = nearestGate(s, { az: azimuth, range: r });
        const raw = idx ? s.values[idx.ai][idx.ri] : null;
        return setProbe({ r, h: km, v: raw == null ? null : transform(raw), el: s.elevation });
      }
    }
    setProbe({ r, h: km, v: null, el: NaN });
  }

  return (
    <div className="radar-plot cross-section">
      <canvas
        ref={ref}
        onPointerMove={move}
        onPointerLeave={() => setProbe(null)}
        aria-label={`Range–height cross-section at azimuth ${azimuth.toFixed(1)} degrees from ${sweeps.length} sweeps.`}
      />
      <div className="plot-readout" aria-live="polite">
        {probe ? (
          <>
            <span>
              {probe.v !== null
                ? `${probe.v.toFixed(1)} ${units}`
                : Number.isFinite(probe.el)
                  ? 'No echo'
                  : 'Between beams · not sampled'}
            </span>
            <span>
              {probe.r.toFixed(1)} km · {probe.h.toFixed(2)} km height
              {Number.isFinite(probe.el) && ` · ${probe.el.toFixed(1)}° sweep`}
            </span>
          </>
        ) : (
          <>
            <span>
              Azimuth {azimuth.toFixed(1)}° · {sweeps.length} sweep{sweeps.length === 1 ? '' : 's'}
            </span>
            <span>
              4/3 Earth beam model · {beamwidth}° {beamwidth === BEAMWIDTH_DEG ? 'assumed' : 'file'} beamwidth
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/** Small accessible line chart for a gate's value through time. */
export function TimeSeries({
  points,
  units,
  current,
  onSelect,
}: {
  points: { label: string; value: number | null }[];
  units: string;
  current: number;
  onSelect?: (i: number) => void;
}) {
  const W = 320,
    H = 140,
    pad = { l: 34, r: 22, t: 12, b: 24 };
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null);
  const hi = Math.max(10, Math.ceil((Math.max(...vals, 0) + 2) / 10) * 10);
  const X = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - v / hi) * (H - pad.t - pad.b);
  const segments: string[] = [];
  let seg = '';
  points.forEach((p, i) => {
    if (p.value === null) {
      if (seg) segments.push(seg);
      seg = '';
    } else seg += `${seg ? 'L' : 'M'}${X(i)},${Y(p.value)}`;
  });
  if (seg) segments.push(seg);
  return (
    <svg
      className="mini-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={
        points.length > 24
          ? `Values at the pinned gate for ${points.length} times; peak ${Math.max(...vals, 0).toFixed(1)} ${units}`
          : `Values at the pinned gate: ${points.map((p) => `${p.label} ${p.value === null ? 'no data' : p.value.toFixed(1) + ' ' + units}`).join(', ')}`
      }
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={pad.l} x2={W - pad.r} y1={Y(hi * f)} y2={Y(hi * f)} className="grid" />
          <text x={pad.l - 6} y={Y(hi * f) + 3} textAnchor="end">
            {(hi * f).toFixed(0)}
          </text>
        </g>
      ))}
      {segments.map((d, i) => (
        <path key={i} d={d} className="line" />
      ))}
      {points.map((p, i) => {
        const dense = points.length > 24;
        const step = Math.ceil(points.length / 6);
        const slot = (W - pad.l - pad.r) / Math.max(1, points.length - 1);
        return (
          <g key={i} onClick={() => onSelect?.(i)} className={onSelect ? 'clickable' : undefined}>
            <rect x={X(i) - slot / 2} y={pad.t} width={slot} height={H - pad.t - pad.b} fill="transparent" />
            {p.value !== null && (!dense || i === current) && (
              <circle
                cx={X(i)}
                cy={Y(p.value)}
                r={i === current ? 4.5 : 3}
                className={i === current ? 'dot current' : 'dot'}
              />
            )}
            {(!dense || i % step === 0) && (
              <text
                x={X(i)}
                y={H - 6}
                textAnchor="middle"
                className={i === current && !dense ? 'current' : ''}
              >
                {p.label}
              </text>
            )}
          </g>
        );
      })}
      {points.length > 24 && points[current] && (
        <line x1={X(current)} x2={X(current)} y1={pad.t} y2={H - pad.b} className="cursor" />
      )}
    </svg>
  );
}

/** Distribution of gate values with the data palette. */
export function Histogram({
  bins,
  threshold,
}: {
  bins: { from: number; to: number; count: number }[];
  threshold: number | null;
}) {
  const W = 320,
    H = 140,
    pad = { l: 8, r: 8, t: 10, b: 24 };
  const top = Math.max(1, ...bins.map((b) => b.count));
  const bw = (W - pad.l - pad.r) / bins.length;
  return (
    <svg
      className="mini-chart"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Reflectivity distribution: ${bins.map((b) => `${b.from} to ${b.to} dBZ ${b.count} gates`).join(', ')}`}
    >
      {bins.map((b, i) => {
        const hgt = (b.count / top) * (H - pad.t - pad.b);
        const faded = threshold !== null && b.to <= threshold;
        return (
          <g key={b.from}>
            <rect
              x={pad.l + i * bw + 1}
              y={H - pad.b - hgt}
              width={bw - 2}
              height={hgt}
              rx={1.5}
              fill={colorFor(b.from + 0.01, 0, 60)}
              opacity={faded ? 0.25 : 1}
            >
              <title>
                {b.from}–{b.to} dBZ: {b.count.toLocaleString()} gates
              </title>
            </rect>
            {i % 2 === 0 && (
              <text x={pad.l + i * bw} y={H - 8}>
                {b.from}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
