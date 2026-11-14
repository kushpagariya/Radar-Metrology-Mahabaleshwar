import { useEffect, useMemo, useRef, useState } from 'react';
import { CloudRain, GitCompare, LoaderCircle, Map, Play, Radar, Rows3, Square } from 'lucide-react';
import Plot from '../Plot';
import { CrossSection } from '../charts';
import {
  accumulate,
  DEMO_ELEVATIONS,
  demoScan,
  differenceScan,
  DIVERGING,
  PALETTE,
  steppedGradient,
  TIMES,
  type Scan,
} from '../data';
import type { View, ViewState } from './state';
import type { Uploaded } from './useBackend';

const TABS: { id: View; label: string; icon: typeof Radar }[] = [
  { id: 'ppi', label: 'PPI', icon: Radar },
  { id: 'map', label: 'Regional map', icon: Map },
  { id: 'section', label: 'Cross-section', icon: Rows3 },
  { id: 'compare', label: 'Compare', icon: GitCompare },
  { id: 'accum', label: 'Accumulation', icon: CloudRain },
];

export const ACCUM_SCALE = { min: 0, max: 24 };
export const DIFF_SCALE = { min: -20, max: 20 };

export type Accumulation = { scan: Scan; engine: 'python' | 'browser'; gaps: number; periodHours: number };

/** Total rainfall over the demonstration sequence; uses the Python service when available. */
function useAccumulation(enabled: boolean, elevation: number, a: number, b: number, service: boolean) {
  const [result, setResult] = useState<Accumulation | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const scans = TIMES.map((_, i) => demoScan(i, elevation));
    const base = scans[scans.length - 1];
    const make = (
      values: (number | null)[][],
      engine: Accumulation['engine'],
      gaps: number,
      periodHours: number,
    ) =>
      setResult({
        scan: {
          ...base,
          id: `accum-${elevation}-${a}-${b}`,
          timestamp: `${scans[0].timestamp} – ${base.timestamp}`,
          values,
          field: 'accumulation',
          units: 'mm',
        },
        engine,
        gaps,
        periodHours,
      });
    const browser = () => {
      const r = accumulate(scans, a, b);
      make(r.values, 'browser', r.gaps.length, r.periodHours);
    };
    if (!service) {
      browser();
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const rate = (v: number | null) => (v === null ? 0 : Math.pow(Math.pow(10, v / 10) / a, 1 / b));
    fetch('/api/accumulation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        samples: scans.map((s) => ({ timestamp: s.timestamp, rates: s.values.flat().map(rate) })),
        max_gap_minutes: 15,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('accumulation failed'))))
      .then((data: { accumulated_mm: (number | null)[]; excluded_gaps: unknown[]; period_hours: number }) => {
        const cols = base.ranges.length;
        const values = base.azimuths.map((_, ai) =>
          base.ranges.map((_, ri) => {
            const v = data.accumulated_mm[ai * cols + ri];
            return v === null || v < 0.01 ? null : Math.round(v * 100) / 100;
          }),
        );
        make(values, 'python', data.excluded_gaps.length, data.period_hours);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') browser();
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [enabled, elevation, a, b, service]);
  return { result: enabled ? result : null, loading };
}

/** All sweeps of an uploaded file for the cross-section (at most 12). */
function useUploadSweeps(enabled: boolean, upload: Uploaded | undefined, field: string) {
  const [sweeps, setSweeps] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!enabled || !upload || !field) return;
    const controller = new AbortController();
    setLoading(true);
    const n = Math.min(12, upload.sweeps);
    Promise.all(
      Array.from({ length: n }, (_, i) =>
        fetch(`/api/files/${upload.id}/scan?field=${encodeURIComponent(field)}&sweep=${i}`, {
          signal: controller.signal,
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    )
      .then((all) => {
        if (!controller.signal.aborted)
          setSweeps((all.filter(Boolean) as Scan[]).sort((x, y) => x.elevation - y.elevation));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [enabled, upload, field]);
  return { sweeps, loading };
}

export function Colorbar({
  label,
  units,
  min,
  max,
  palette,
}: {
  label: string;
  units: string;
  min: number;
  max: number;
  palette: string[];
}) {
  const edges = palette.length / 2;
  return (
    <div className="colorbar-row">
      <span>{label}</span>
      <div className="colorbar-group">
        <div className="colorbar" style={{ background: steppedGradient(palette) }} />
        <div className="colorbar-ticks">
          {Array.from({ length: edges + 1 }, (_, i) => (
            <span key={i}>{Number((min + ((max - min) * i) / edges).toFixed(1))}</span>
          ))}
        </div>
      </div>
      <span>{units}</span>
    </div>
  );
}

type Props = {
  state: ViewState;
  set: (patch: Partial<ViewState>) => void;
  scan: Scan | null;
  upload: Uploaded | undefined;
  sourceField: string;
  busy: boolean;
  service: boolean;
  transform: (v: number) => number;
  units: string;
  playing: boolean;
  setPlaying: (v: boolean) => void;
  onUseDemo: () => void;
  onMethods: () => void;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onAccumulation: (a: Accumulation | null) => void;
  onSweeps: (s: Scan[]) => void;
};

export default function PlotPanel(props: Props) {
  const { state, set, scan, upload, busy, service, transform, units, playing, setPlaying, canvasRef } = props;
  const demo = state.source === 'demo';
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const available = (v: View) => demo || (v !== 'compare' && v !== 'accum');

  const demoSweeps = useMemo(
    () => (demo && state.view === 'section' ? DEMO_ELEVATIONS.map((e) => demoScan(state.time, e)) : []),
    [demo, state.view, state.time],
  );
  const uploadSweeps = useUploadSweeps(!demo && state.view === 'section', upload, props.sourceField);
  const sweeps = demo ? demoSweeps : uploadSweeps.sweeps;
  const accumulation = useAccumulation(
    demo && state.view === 'accum',
    state.elevation,
    state.a,
    state.b,
    service,
  );
  const { onAccumulation, onSweeps } = props;
  useEffect(() => onAccumulation(accumulation.result), [accumulation.result, onAccumulation]);
  useEffect(() => onSweeps(state.view === 'section' ? sweeps : []), [sweeps, state.view, onSweeps]);

  const other = demo && state.view === 'compare' ? demoScan(state.compareTime, state.elevation) : null;
  const diff = useMemo(
    () => (other && scan && state.compareMode === 'diff' ? differenceScan(other, scan) : null),
    [other, scan, state.compareMode],
  );

  const sectionAz = state.pin?.az ?? 270;
  const fieldLabel = state.field === 'reflectivity' ? 'Reflectivity' : 'Rainfall rate';

  function onTabKey(e: React.KeyboardEvent, i: number) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    let j = i;
    do j = (j + dir + TABS.length) % TABS.length;
    while (!available(TABS[j].id));
    set({ view: TABS[j].id });
    tabRefs.current[j]?.focus();
  }

  let body: React.ReactNode;
  let legend = { label: fieldLabel, units, min: state.min, max: state.max, palette: PALETTE };
  let footnote: React.ReactNode = null;

  if (
    busy ||
    (state.view === 'section' && uploadSweeps.loading) ||
    (state.view === 'accum' && accumulation.loading && !accumulation.result)
  ) {
    body = (
      <div className="plot-empty">
        <LoaderCircle className="spin" size={26} />
        <h3>{state.view === 'accum' ? 'Integrating rainfall' : 'Reading the selected sweep'}</h3>
        <p>
          {state.view === 'accum'
            ? 'Summing rates across the scan sequence.'
            : 'Inspecting coordinates and decoding reflectivity.'}
        </p>
      </div>
    );
  } else if (!scan) {
    body = (
      <div className="plot-empty">
        <Radar size={35} />
        <h3>No supported scan loaded</h3>
        <p>Choose another source field or return to the illustrative volume.</p>
        <button className="btn btn-outline" onClick={props.onUseDemo}>
          Use demonstration data
        </button>
      </div>
    );
  } else if (!available(state.view)) {
    body = (
      <div className="plot-empty">
        <GitCompare size={30} />
        <h3>Needs a co-registered scan sequence</h3>
        <p>
          Comparison and accumulation require several timestamped scans on the same polar grid. A single
          uploaded sweep cannot provide that.
        </p>
        <button className="btn btn-outline" onClick={() => set({ view: 'ppi' })}>
          Back to PPI
        </button>
      </div>
    );
  } else if (state.view === 'section') {
    body = sweeps.length ? (
      <CrossSection
        sweeps={sweeps}
        azimuth={sectionAz}
        range={state.range}
        min={state.min}
        max={state.max}
        transform={transform}
        units={units}
        pinRange={state.pin?.range}
        canvasRef={canvasRef}
      />
    ) : (
      <div className="plot-empty">
        <Rows3 size={30} />
        <h3>No sweeps could be read</h3>
        <p>The cross-section needs at least one supported PPI sweep from this file.</p>
      </div>
    );
    footnote = (
      <div className="view-controls">
        <label>
          Azimuth <span className="control-unit">{sectionAz.toFixed(1)}°</span>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={Math.round(sectionAz)}
            onChange={(e) =>
              set({ pin: { az: Number(e.target.value), range: state.pin?.range ?? state.range / 2 } })
            }
          />
        </label>
        <p>Pin a gate on the PPI to choose the azimuth. Heights are above the antenna.</p>
      </div>
    );
  } else if (state.view === 'compare' && other) {
    if (state.compareMode === 'diff' && diff) {
      legend = { label: 'Change', units: 'ΔdBZ', ...DIFF_SCALE, palette: DIVERGING };
      body = (
        <Plot
          scan={diff}
          units="ΔdBZ"
          palette={DIVERGING}
          {...DIFF_SCALE}
          range={state.range}
          rings={state.rings}
          pin={state.pin}
          onPin={(pin) => set({ pin })}
          label={`Change ${TIMES[state.compareTime]} → ${TIMES[state.time]}`}
          canvasRef={canvasRef}
        />
      );
    } else {
      body = (
        <div className="compare-grid">
          <div>
            <span className="compare-label">{TIMES[state.compareTime]} UTC · reference</span>
            <Plot
              scan={other}
              transform={transform}
              units={units}
              range={state.range}
              min={state.min}
              max={state.max}
              rings={state.rings}
              threshold={state.threshold}
              pin={state.pin}
              onPin={(pin) => set({ pin })}
            />
          </div>
          <div>
            <span className="compare-label">{TIMES[state.time]} UTC · selected</span>
            <Plot
              scan={scan}
              transform={transform}
              units={units}
              range={state.range}
              min={state.min}
              max={state.max}
              rings={state.rings}
              threshold={state.threshold}
              pin={state.pin}
              onPin={(pin) => set({ pin })}
              canvasRef={canvasRef}
            />
          </div>
        </div>
      );
    }
    footnote = (
      <div className="view-controls">
        <label>
          Compare with
          <select value={state.compareTime} onChange={(e) => set({ compareTime: Number(e.target.value) })}>
            {TIMES.map((t, i) => (
              <option key={t} value={i}>
                {t}:00 UTC
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" role="group" aria-label="Comparison mode">
          <button aria-pressed={state.compareMode === 'side'} onClick={() => set({ compareMode: 'side' })}>
            Side by side
          </button>
          <button aria-pressed={state.compareMode === 'diff'} onClick={() => set({ compareMode: 'diff' })}>
            Difference
          </button>
        </div>
      </div>
    );
  } else if (state.view === 'accum' && accumulation.result) {
    const acc = accumulation.result;
    legend = { label: 'Accumulation', units: 'mm', ...ACCUM_SCALE, palette: PALETTE };
    body = (
      <Plot
        scan={acc.scan}
        units="mm"
        {...ACCUM_SCALE}
        range={state.range}
        rings={state.rings}
        pin={state.pin}
        onPin={(pin) => set({ pin })}
        label="Illustrative accumulation"
        canvasRef={canvasRef}
      />
    );
    footnote = (
      <div className="rainfall-method">
        <strong>
          {(acc.periodHours * 60).toFixed(0)}-minute total from {TIMES.length} scans.
        </strong>{' '}
        Trapezoidal integration of Z = {state.a} R<sup>{state.b}</sup> rates, computed{' '}
        {acc.engine === 'python' ? 'by the local Python service' : 'in the browser (Python service offline)'}.{' '}
        {acc.gaps ? `${acc.gaps} interval(s) excluded as gaps.` : 'No gaps excluded.'}{' '}
        <button className="text-button" onClick={props.onMethods}>
          Read assumptions
        </button>
      </div>
    );
  } else {
    body = (
      <Plot
        scan={scan}
        transform={transform}
        units={units}
        range={state.range}
        min={state.min}
        max={state.max}
        map={state.view === 'map'}
        rings={state.rings}
        threshold={state.threshold}
        pin={state.pin}
        onPin={(pin) => set({ pin })}
        canvasRef={canvasRef}
      />
    );
  }

  const showsTimeline = demo && state.view !== 'accum';
  return (
    <section className="plot-panel" aria-label="Radar visualization">
      <div className="plot-toolbar">
        <div className="view-tabs" role="tablist" aria-label="Visualization">
          {TABS.map(({ id, label, icon: Icon }, i) => (
            <button
              key={id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              id={`tab-${id}`}
              role="tab"
              aria-selected={state.view === id}
              aria-controls="plot-tabpanel"
              tabIndex={state.view === id ? 0 : -1}
              disabled={!available(id)}
              title={available(id) ? undefined : 'Needs a co-registered scan sequence'}
              className={state.view === id ? 'selected' : ''}
              onClick={() => set({ view: id })}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        <span className="plot-tag">
          {state.view === 'accum' ? 'Accumulation' : fieldLabel}
          <span className="plot-tag-dot" />
          {state.view === 'section' ? `${sweeps.length} sweeps` : `${scan?.elevation.toFixed(1) ?? '—'}°`}
        </span>
      </div>
      <div id="plot-tabpanel" role="tabpanel" aria-labelledby={`tab-${state.view}`}>
        {body}
      </div>
      <Colorbar {...legend} />
      {footnote}
      {state.field === 'rainfall' && state.view !== 'accum' && (
        <div className="rainfall-method">
          <strong>Estimated from this scan.</strong> Z = {state.a} R<sup>{state.b}</sup>. Units: mm/hr. No
          attenuation correction or surface validation.{' '}
          <button className="text-button" onClick={props.onMethods}>
            Read assumptions
          </button>
        </div>
      )}
      {showsTimeline && (
        <div className="timeline">
          <button
            className="play-button"
            aria-label={playing ? 'Pause scan playback' : 'Play illustrative scans'}
            onClick={() => setPlaying(!playing)}
          >
            {playing ? <Square size={13} /> : <Play size={14} />}
          </button>
          <div className="timeline-track">
            {TIMES.map((t, i) => (
              <button
                key={t}
                className={state.time === i ? 'current' : ''}
                aria-current={state.time === i ? 'true' : undefined}
                onClick={() => set({ time: i })}
              >
                <span />
                {t}
              </button>
            ))}
          </div>
          <span className="utc-label">UTC</span>
        </div>
      )}
    </section>
  );
}
