import { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { beamHeight, colorFor, formatDistance, nearestGate, PALETTE, type Gate, type Scan } from './data';

type Props = {
  scan: Scan;
  /** Maps a stored gate value to the displayed quantity (e.g. dBZ → mm/hr). */
  transform?: (v: number) => number;
  units?: string;
  palette?: string[];
  range?: number;
  min?: number;
  max?: number;
  map?: boolean;
  rings?: boolean;
  compact?: boolean;
  /** Raw stored values below this are faded. */
  threshold?: number | null;
  pin?: Gate | null;
  onPin?: (gate: Gate | null) => void;
  label?: string;
  canvasRef?: React.RefObject<HTMLCanvasElement | null>;
};

/** Approximate town coordinates (°N, °E) for schematic context only; not a surveyed basemap. */
const PLACES: [string, number, number][] = [
  ['Mahabaleshwar', 17.9237, 73.6586],
  ['Pune', 18.5204, 73.8567],
  ['Satara', 17.6805, 74.0183],
  ['Wai', 17.9524, 73.8916],
  ['Mahad', 18.0836, 73.4166],
  ['Ratnagiri', 16.9902, 73.312],
  ['Kolhapur', 16.705, 74.2433],
];
/** Equirectangular offset in km (east, north) from the radar; adequate within ~200 km. */
const offsetKm = (lat0: number, lon0: number, lat: number, lon: number) =>
  [(lon - lon0) * 111.32 * Math.cos((lat0 * Math.PI) / 180), (lat - lat0) * 110.57] as const;

const identity = (v: number) => v;

export default function Plot({
  scan,
  transform = identity,
  units = 'dBZ',
  palette = PALETTE,
  range = 82.5,
  min = 0,
  max = 60,
  map = false,
  rings = true,
  compact = false,
  threshold = null,
  pin = null,
  onPin,
  label,
  canvasRef,
}: Props) {
  const ownRef = useRef<HTMLCanvasElement>(null),
    ref = canvasRef || ownRef;
  const [probe, setProbe] = useState<Gate | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 }),
    [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);
  const keyboardProbe = useRef(false);

  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, [range, map]);

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
      const cx = w / 2 + pan.x,
        cy = h / 2 + pan.y,
        radius = Math.min(w, h) * 0.405 * zoom,
        scale = radius / range;
      const km = (east: number, north: number) => [cx + east * scale, cy - north * scale] as const;
      ctx.fillStyle = map ? '#edf0e9' : '#f8faf8';
      ctx.fillRect(0, 0, w, h);

      if (map) {
        // Illustrative Ghats escarpment contours and sea, positioned in km from the radar so they follow pan/zoom.
        ctx.strokeStyle = '#cfd7cc';
        ctx.lineWidth = 1;
        for (let k = -8; k < 16; k++) {
          ctx.beginPath();
          for (let north = -260; north <= 260; north += 4) {
            const east = -12 + k * 9 + Math.sin(north / 38 + k * 0.3) * 8 + Math.sin(north / 15) * 3;
            const [x, y] = km(east, north);
            north === -260 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.fillStyle = '#dce8e5';
        ctx.beginPath();
        for (let north = 260; north >= -260; north -= 4) {
          const [x, y] = km(-70 + Math.sin(north / 22) * 5 + Math.sin(north / 9) * 2, north);
          north === 260 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.lineTo(-10, km(0, -260)[1]);
        ctx.lineTo(-10, km(0, 260)[1]);
        ctx.closePath();
        ctx.fill();
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      for (let ai = 0; ai < scan.azimuths.length; ai++) {
        const az = scan.azimuths[ai],
          next =
            ai < scan.azimuths.length - 1 ? scan.azimuths[ai + 1] : az + (az - scan.azimuths[ai - 1] || 1);
        // Limit each ray to its actual angular sampling; never fill missing sectors.
        const width = (Math.min(3, Math.abs(next - az) || 1) * Math.PI) / 180;
        const angle = (az * Math.PI) / 180 - Math.PI / 2;
        scan.ranges.forEach((r, ri) => {
          const raw = scan.values[ai]?.[ri];
          if (raw == null || r > range) return;
          const inner =
            (ri ? (scan.ranges[ri - 1] + r) / 2 : Math.max(0, r - (scan.ranges[1] - r) / 2)) * scale;
          const outer =
            (ri < scan.ranges.length - 1
              ? (r + scan.ranges[ri + 1]) / 2
              : r + (r - scan.ranges[ri - 1]) / 2) * scale;
          ctx.beginPath();
          ctx.arc(cx, cy, outer, angle - width / 2, angle + width / 2 + 0.003);
          ctx.arc(cx, cy, inner, angle + width / 2 + 0.003, angle - width / 2, true);
          ctx.closePath();
          ctx.fillStyle = colorFor(transform(raw), min, max, palette);
          const faded = threshold !== null && raw < threshold;
          ctx.globalAlpha = faded ? 0.14 : map ? 0.78 : 0.94;
          ctx.fill();
        });
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      if (rings) {
        ctx.strokeStyle = '#657f7c50';
        ctx.lineWidth = 0.7;
        for (let i = 1; i <= 4; i++) {
          ctx.beginPath();
          ctx.arc(cx, cy, (radius * i) / 4, 0, Math.PI * 2);
          ctx.stroke();
          if (!compact) {
            ctx.fillStyle = '#4f6563';
            ctx.font = '12px "DM Sans", sans-serif';
            ctx.fillText(formatDistance((range * i) / 4), cx + 8, cy - (radius * i) / 4 + 14);
          }
        }
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(cx - radius, cy);
        ctx.lineTo(cx + radius, cy);
        ctx.moveTo(cx, cy - radius);
        ctx.lineTo(cx, cy + radius);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = '#254c4d';
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
      ctx.fill();

      const marker = (g: Gate, style: 'pin' | 'probe') => {
        const t = (g.az * Math.PI) / 180;
        const x = cx + Math.sin(t) * g.range * scale,
          y = cy - Math.cos(t) * g.range * scale;
        if (style === 'pin') {
          ctx.strokeStyle = '#1e3f3f';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.sin(t) * radius, cy - Math.cos(t) * radius);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineWidth = 2;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(x, y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.strokeStyle = '#1e3f3f';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x - 8, y);
          ctx.lineTo(x + 8, y);
          ctx.moveTo(x, y - 8);
          ctx.lineTo(x, y + 8);
          ctx.stroke();
        }
      };
      if (pin && pin.range <= range) marker(pin, 'pin');
      if (keyboardProbe.current && probe) marker(probe, 'probe');

      if (!compact) {
        ctx.font = '12px "DM Sans", sans-serif';
        ctx.fillStyle = '#49635e';
        ctx.textAlign = 'center';
        ctx.fillText('N', cx, cy - radius - 15);
        ctx.fillText('S', cx, cy + radius + 22);
        ctx.fillText('W', cx - radius - 18, cy + 4);
        ctx.fillText('E', cx + radius + 18, cy + 4);
        ctx.textAlign = 'left';
        if (map && Number.isFinite(scan.latitude) && Number.isFinite(scan.longitude)) {
          PLACES.forEach(([name, lat, lon]) => {
            const [east, north] = offsetKm(scan.latitude, scan.longitude, lat, lon);
            const [x, y] = km(east, north);
            if (x < -80 || x > w + 10 || y < 0 || y > h + 10) return;
            ctx.fillStyle = '#51625b';
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f5f7f1e0';
            ctx.fillRect(x + 5, y - 14, ctx.measureText(name).width + 8, 19);
            ctx.fillStyle = '#51625b';
            ctx.fillText(name, x + 9, y);
          });
        }
      }
    };
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [scan, transform, palette, range, min, max, map, rings, compact, pan, zoom, ref, threshold, pin, probe]);

  function locate(e: React.PointerEvent<HTMLCanvasElement>): Gate {
    const box = e.currentTarget.getBoundingClientRect(),
      x = e.clientX - box.left - box.width / 2 - pan.x,
      y = e.clientY - box.top - box.height / 2 - pan.y;
    return {
      range: (Math.hypot(x, y) / (Math.min(box.width, box.height) * 0.405 * zoom)) * range,
      az: ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360,
    };
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    keyboardProbe.current = false;
    if (drag.current) {
      const dx = e.clientX - drag.current.x,
        dy = e.clientY - drag.current.y;
      if (Math.hypot(dx, dy) > 4) drag.current.moved = true;
      if (map && drag.current.moved) {
        setPan({ x: drag.current.px + dx, y: drag.current.py + dy });
        return;
      }
    }
    const g = locate(e);
    setProbe(g.range > range ? null : g);
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    const wasClick = drag.current && !drag.current.moved;
    drag.current = null;
    if (wasClick && onPin) {
      const g = locate(e);
      onPin(
        g.range > range ? null : { az: Math.round(g.az * 10) / 10, range: Math.round(g.range * 100) / 100 },
      );
    }
  }
  function key(e: React.KeyboardEvent<HTMLCanvasElement>) {
    const step = scan.ranges[1] - scan.ranges[0] || 1;
    const current = probe ?? pin ?? { az: 0, range: Math.min(range / 2, scan.ranges.at(-1) ?? range / 2) };
    let next: Gate | null = null;
    if (e.key === 'ArrowLeft') next = { ...current, az: (current.az - 2 + 360) % 360 };
    else if (e.key === 'ArrowRight') next = { ...current, az: (current.az + 2) % 360 };
    else if (e.key === 'ArrowUp') next = { ...current, range: Math.min(range, current.range + step) };
    else if (e.key === 'ArrowDown') next = { ...current, range: Math.max(0, current.range - step) };
    else if ((e.key === 'Enter' || e.key === ' ') && onPin) {
      e.preventDefault();
      onPin(current);
      return;
    } else if (e.key === 'Escape') {
      setProbe(null);
      onPin?.(null);
      return;
    }
    if (next) {
      e.preventDefault();
      keyboardProbe.current = true;
      setProbe(next);
    }
  }

  const readout = probe ?? pin;
  const idx = readout ? nearestGate(scan, readout) : null;
  const raw = idx ? (scan.values[idx.ai]?.[idx.ri] ?? null) : null;
  const height = readout && scan.field !== 'accumulation' ? beamHeight(readout.range, scan.elevation) : null;

  return (
    <div className={`radar-plot ${compact ? 'compact' : ''}`}>
      <canvas
        ref={ref}
        tabIndex={compact ? -1 : 0}
        aria-label={`${label ?? (scan.synthetic ? 'Illustrative' : 'Uploaded')} PPI, elevation ${scan.elevation} degrees. Use arrow keys to inspect gates, Enter to pin a gate, Escape to clear.`}
        onPointerMove={move}
        onPointerLeave={() => {
          setProbe(null);
          drag.current = null;
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false };
        }}
        onPointerUp={up}
        onKeyDown={key}
        onBlur={() => {
          if (keyboardProbe.current) setProbe(null);
        }}
        style={{ cursor: map ? 'grab' : onPin ? 'crosshair' : undefined }}
      />
      {!compact && map && (
        <>
          <span className="map-qualifier">Schematic regional context · approximate places</span>
          <div className="map-zoom">
            <button aria-label="Zoom in on radar map" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
              +
            </button>
            <button
              aria-label="Zoom out on radar map"
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            >
              −
            </button>
            <button
              aria-label="Reset map view"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </>
      )}
      {!compact && (
        <div className="plot-readout" aria-live="polite">
          {readout ? (
            <>
              <span>
                {!probe && pin ? 'Pinned · ' : ''}
                {raw === null ? 'No data' : `${transform(raw).toFixed(1)} ${units}`}
              </span>
              <span>
                {readout.az.toFixed(1)}° / {readout.range.toFixed(1)} km
                {height !== null && ` · beam ${height.toFixed(2)} km`}
              </span>
            </>
          ) : (
            <>
              <span>{label ?? (scan.synthetic ? 'Illustrative scan' : 'Source-file scan')}</span>
              <span>
                {map
                  ? 'Drag to pan · click to pin a gate'
                  : onPin
                    ? 'Hover to inspect · click to pin a gate'
                    : 'Hover to inspect'}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
