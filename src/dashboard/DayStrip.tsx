import { Play, Square } from 'lucide-react';
import { colorFor, istClock, utcClock, type ArchiveCatalog } from '../data';

const W = 1000,
  H = 54,
  TOP = 6,
  BASE = 50;

/**
 * Day timeline for an archive day: one bar per volume at its time of day. Bar height = echo area ≥ 20 dBZ,
 * colour = the volume's maximum reflectivity. Missing volumes are shown as hatched gaps, never interpolated.
 */
export default function DayStrip({
  catalog,
  current,
  onSelect,
  playing,
  setPlaying,
}: {
  catalog: ArchiveCatalog;
  current: number;
  onSelect: (i: number) => void;
  playing: boolean;
  setPlaying: (v: boolean) => void;
}) {
  const vols = catalog.volumes;
  const dayStart = Date.parse(`${catalog.date}T00:00:00Z`);
  const X = (iso: string) => ((Date.parse(iso) - dayStart) / 86400000) * W;
  const top = Math.max(1, ...vols.map((v) => v.stats.area_20_km2));
  const bw = Math.max(2, (W / 144) * 0.72);
  const cur = vols[current];

  function nearest(clientX: number, el: SVGSVGElement) {
    const box = el.getBoundingClientRect();
    const t = dayStart + ((clientX - box.left) / box.width) * 86400000;
    let best = 0;
    vols.forEach((v, i) => {
      if (Math.abs(Date.parse(v.start) - t) < Math.abs(Date.parse(vols[best].start) - t)) best = i;
    });
    return best;
  }

  return (
    <div className="day-strip">
      <button
        className="play-button"
        aria-label={playing ? 'Pause playback' : 'Play through the day'}
        onClick={() => setPlaying(!playing)}
      >
        {playing ? <Square size={13} /> : <Play size={14} />}
      </button>
      <div className="day-strip-body">
        <div className="day-strip-head">
          <strong>
            {cur ? `${utcClock(cur.start)} UTC` : '—'}
            <span>{cur ? ` · ${istClock(cur.start)} IST` : ''}</span>
          </strong>
          <span>
            Volume {current + 1} of {vols.length} · bar height = echo area ≥ 20 dBZ
          </span>
        </div>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="slider"
          tabIndex={0}
          aria-label="Scan time"
          aria-valuemin={1}
          aria-valuemax={vols.length}
          aria-valuenow={current + 1}
          aria-valuetext={cur ? `${utcClock(cur.start)} UTC, ${istClock(cur.start)} IST` : undefined}
          onClick={(e) => onSelect(nearest(e.clientX, e.currentTarget))}
          onKeyDown={(e) => {
            const step =
              e.key === 'ArrowRight'
                ? 1
                : e.key === 'ArrowLeft'
                  ? -1
                  : e.key === 'PageUp'
                    ? 6
                    : e.key === 'PageDown'
                      ? -6
                      : 0;
            if (e.key === 'Home') onSelect(0);
            else if (e.key === 'End') onSelect(vols.length - 1);
            else if (step) onSelect(Math.max(0, Math.min(vols.length - 1, current + step)));
            else return;
            e.preventDefault();
          }}
        >
          <defs>
            <pattern
              id="gap-hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="6" stroke="#c9d2c6" strokeWidth="2" />
            </pattern>
          </defs>
          <line x1={0} x2={W} y1={BASE} y2={BASE} className="strip-axis" />
          {catalog.gaps.map((g) => (
            <rect
              key={g.after}
              x={X(g.after) + bw}
              y={TOP}
              width={Math.max(2, X(g.before) - X(g.after) - bw)}
              height={BASE - TOP}
              fill="url(#gap-hatch)"
            >
              <title>
                {g.missing_volumes} missing volume(s): {utcClock(g.after)}–{utcClock(g.before)} UTC
              </title>
            </rect>
          ))}
          {vols.map((v, i) => {
            const h = Math.max(1.5, (v.stats.area_20_km2 / top) * (BASE - TOP));
            return (
              <rect
                key={v.index}
                x={X(v.start) - bw / 2 + bw / 2}
                y={BASE - h}
                width={bw}
                height={h}
                rx={0.8}
                fill={v.stats.max_dbz === null ? '#dce2dc' : colorFor(v.stats.max_dbz, 0, 60)}
                opacity={i === current ? 1 : 0.82}
              >
                <title>
                  {utcClock(v.start)} UTC · max {v.stats.max_dbz ?? '—'} dBZ ·{' '}
                  {Math.round(v.stats.area_20_km2)} km² ≥ 20 dBZ
                </title>
              </rect>
            );
          })}
          {cur && (
            <line
              x1={X(cur.start) + bw / 2}
              x2={X(cur.start) + bw / 2}
              y1={0}
              y2={BASE + 3}
              className="strip-cursor"
            />
          )}
        </svg>
        <div className="day-strip-ticks" aria-hidden="true">
          {Array.from({ length: 9 }, (_, h) => (
            <span key={h}>{String(h * 3).padStart(2, '0')}:00</span>
          ))}
        </div>
      </div>
      <span className="utc-label">UTC</span>
    </div>
  );
}
