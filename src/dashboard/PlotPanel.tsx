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
  utcClock,
  type ArchiveCatalog,
  type Scan,
} from '../data';
import DayStrip from './DayStrip';
import { dayOf, isDay, type View, type ViewState } from './state';
import type { Uploaded } from './useBackend';

const TABS: { id: View; label: string; icon: typeof Radar }[] = [
  { id: 'ppi', label: 'PPI', icon: Radar },
  { id: 'map', label: 'Regional map', icon: Map },
  { id: 'section', label: 'Cross-section', icon: Rows3 },
  { id: 'compare', label: 'Compare', icon: GitCompare },
  { id: 'accum', label: 'Accumulation', icon: CloudRain },
];
export const DIFF_SCALE = { min: -20, max: 20 };
export const ACCUM_WINDOWS = [1, 3, 6, 24];

/** Accumulation colour scale: 12 equal steps up to a round maximum that fits the data. */
export function accumScale(scan: Scan | null) {
  let top = 0;
  scan?.values.forEach((row) => row.forEach((v) => (v !== null && v > top ? (top = v) : 0)));
  const steps = [12, 24, 48, 96, 192, 384];
  return { min: 0, max: steps.find((s) => s >= top * 0.9) ?? 384 };
}

type Accum = { scan: Scan; engine: 'python' | 'browser'; gaps: number; periodHours: number; label: string };

function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  return fetch(url, { signal }).then(async (r) => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || `Request failed (${r.status})`);
    return r.json();
  });
}

/** Demonstration accumulation: Python service when connected, browser otherwise. */
function demoAccumulation(
  elevation: number,
  a: number,
  b: number,
  service: boolean,
  signal: AbortSignal,
): Promise<Accum> {
  const scans = TIMES.map((_, i) => demoScan(i, elevation));
  const base = scans[scans.length - 1];
  const wrap = (
    values: (number | null)[][],
    engine: Accum['engine'],
    gaps: number,
    periodHours: number,
  ): Accum => ({
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
    label: `${TIMES.length} illustrative scans`,
  });
  const browser = () => {
    const r = accumulate(scans, a, b);
    return wrap(r.values, 'browser', r.gaps.length, r.periodHours);
  };
  if (!service) return Promise.resolve(browser());
  const rate = (v: number | null) => (v === null ? 0 : Math.pow(Math.pow(10, v / 10) / a, 1 / b));
  return fetch('/api/accumulation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
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
      return wrap(values, 'python', data.excluded_gaps.length, data.period_hours);
    })
    .catch((e) => (e.name === 'AbortError' ? Promise.reject(e) : browser()));
}

type ArchiveAccum = Scan & {
  accumulation: {
    period_hours: number;
    excluded_gaps: unknown[];
    start: string;
    end: string;
    max_mm: number;
  };
};

/** Runs an async loader for the current inputs; keeps the last good result while the next one loads. */
function useLoader<T>(enabled: boolean, key: string, load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ key: string; value: T | null; error: string; loading: boolean }>({
    key: '',
    value: null,
    error: '',
    loading: false,
  });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: '' }));
    load(controller.signal)
      .then((value) => setState({ key, value, error: '', loading: false }))
      .catch((e) => {
        if (e.name !== 'AbortError')
          setState((s) => ({ ...s, error: e.message || String(e), loading: false }));
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);
  return {
    value: enabled ? state.value : null,
    fresh: state.key === key,
    error: state.error,
    loading: state.loading,
  };
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
  catalog: ArchiveCatalog | null;
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
  /** Reports the scan actually on screen when it differs from the source scan (difference, accumulation). */
  onDisplayed: (s: Scan | null) => void;
  onSweeps: (s: Scan[]) => void;
  /** True while the active view is still loading; playback waits for it. */
  onBusy: (busy: boolean) => void;
};

export default function PlotPanel(props: Props) {
  const {
    state,
    set,
    scan,
    upload,
    catalog,
    busy,
    service,
    transform,
    units,
    playing,
    setPlaying,
    canvasRef,
  } = props;
  const demo = state.source === 'demo';
  const day = isDay(state.source) && catalog ? dayOf(state.source) : null;
  const sequence = demo || !!day;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const available = (v: View) => sequence || (v !== 'compare' && v !== 'accum');
  const field = props.sourceField || 'DBZ';

  // --- Cross-section sweeps -------------------------------------------------------------------------
  const demoSweeps = useMemo(
    () => (demo && state.view === 'section' ? DEMO_ELEVATIONS.map((e) => demoScan(state.time, e)) : []),
    [demo, state.view, state.time],
  );
  const remoteSweeps = useLoader<Scan[]>(
    !demo && state.view === 'section' && (!!day || (!!upload && !!props.sourceField)),
    day ? `day|${day}|${state.time}|${field}` : `up|${upload?.id}|${props.sourceField}`,
    (signal) => {
      const urls = day
        ? catalog!.fixed_angles.map(
            (_, i) => `/api/archive/${day}/volumes/${state.time}/sweep?field=${field}&sweep=${i}`,
          )
        : Array.from(
            { length: Math.min(12, upload!.sweeps) },
            (_, i) =>
              `/api/files/${upload!.id}/scan?field=${encodeURIComponent(props.sourceField)}&sweep=${i}`,
          );
      return Promise.all(
        urls.map((u) =>
          fetchJson<Scan>(u, signal).catch((e) => (e.name === 'AbortError' ? Promise.reject(e) : null)),
        ),
      ).then((all) => (all.filter(Boolean) as Scan[]).sort((x, y) => x.elevation - y.elevation));
    },
  );
  const sweeps = demo ? demoSweeps : (remoteSweeps.value ?? []);
  const { onSweeps, onDisplayed, onBusy } = props;
  useEffect(() => onSweeps(state.view === 'section' ? sweeps : []), [sweeps, state.view, onSweeps]);

  // --- Comparison ------------------------------------------------------------------------------------
  const compareTime = day ? Math.min(state.compareTime, catalog!.volumes.length - 1) : state.compareTime;
  const products = useLoader<[Scan, Scan]>(
    state.view === 'compare' && !!day,
    `${day}|${compareTime}|${state.time}`,
    (signal) =>
      Promise.all([
        fetchJson<Scan>(`/api/archive/${day}/volumes/${compareTime}/product`, signal),
        fetchJson<Scan>(`/api/archive/${day}/volumes/${state.time}/product`, signal),
      ]),
  );
  const pair: [Scan, Scan] | null =
    demo && state.view === 'compare'
      ? [demoScan(compareTime, state.elevation), scan!]
      : (products.value ?? null);
  const diff = useMemo(
    () => (pair && state.compareMode === 'diff' ? differenceScan(pair[0], pair[1]) : null),
    [pair?.[0], pair?.[1], state.compareMode],
  ); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Accumulation ----------------------------------------------------------------------------------
  const accWindow = useMemo(() => {
    if (!day) return null;
    const vols = catalog!.volumes;
    const end = Math.max(1, state.time);
    const from = Date.parse(vols[end].start) - state.win * 3600000;
    let start = state.win >= 24 ? 0 : vols.findIndex((v) => Date.parse(v.start) >= from - 60000);
    if (start < 0 || start >= end) start = end - 1;
    return { start, end };
  }, [day, catalog, state.time, state.win]);
  const accum = useLoader<Accum>(
    state.view === 'accum' && sequence,
    day
      ? `day|${day}|${accWindow?.start}|${accWindow?.end}|${state.a}|${state.b}`
      : `demo|${state.elevation}|${state.a}|${state.b}|${service}`,
    (signal) =>
      day
        ? fetchJson<ArchiveAccum>(
            `/api/archive/${day}/accumulation?a=${state.a}&b=${state.b}&start=${accWindow!.start}&end=${accWindow!.end}`,
            signal,
          ).then((s) => ({
            scan: s,
            engine: 'python' as const,
            gaps: s.accumulation.excluded_gaps.length,
            periodHours: s.accumulation.period_hours,
            label: `${utcClock(s.accumulation.start)}–${utcClock(s.accumulation.end)} UTC, ${accWindow!.end - accWindow!.start + 1} volumes`,
          }))
        : demoAccumulation(state.elevation, state.a, state.b, service, signal),
  );

  const displayed =
    state.view === 'accum'
      ? (accum.value?.scan ?? null)
      : state.view === 'compare' && state.compareMode === 'diff'
        ? diff
        : null;
  useEffect(() => onDisplayed(displayed), [displayed, onDisplayed]);

  const sectionAz = state.pin?.az ?? 270;
  const fieldLabel = state.field === 'reflectivity' ? 'Reflectivity' : 'Rainfall rate';
  const timeLabel = (i: number) => (day ? `${utcClock(catalog!.volumes[i].start)} UTC` : `${TIMES[i]} UTC`);

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

  const loading =
    busy ||
    (state.view === 'section' && remoteSweeps.loading && !remoteSweeps.value) ||
    (state.view === 'accum' && accum.loading && !accum.value) ||
    (state.view === 'compare' && products.loading && !products.value);
  const viewBusy =
    (state.view === 'section' && remoteSweeps.loading) ||
    (state.view === 'accum' && accum.loading) ||
    (state.view === 'compare' && products.loading);
  useEffect(() => onBusy(viewBusy), [viewBusy, onBusy]);
  const error =
    state.view === 'section'
      ? remoteSweeps.error
      : state.view === 'accum'
        ? accum.error
        : state.view === 'compare'
          ? products.error
          : '';

  let body: React.ReactNode;
  let legend = { label: fieldLabel, units, min: state.min, max: state.max, palette: PALETTE };
  let footnote: React.ReactNode = null;

  if (loading) {
    body = (
      <div className="plot-empty">
        <LoaderCircle className="spin" size={26} />
        <h3>
          {state.view === 'accum'
            ? 'Integrating rainfall'
            : state.view === 'section'
              ? 'Reading every sweep in this volume'
              : 'Reading the selected sweep'}
        </h3>
        <p>
          {state.view === 'accum'
            ? 'Summing rates across the scan sequence.'
            : 'Decoding reflectivity from the source volume.'}
        </p>
      </div>
    );
  } else if (error) {
    body = (
      <div className="plot-empty">
        <Radar size={30} />
        <h3>This view could not be produced</h3>
        <p>{error}</p>
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
        beamwidth={catalog?.site.beamwidth_deg}
        canvasRef={canvasRef}
      />
    ) : (
      <div className="plot-empty">
        <Rows3 size={30} />
        <h3>No sweeps could be read</h3>
        <p>The cross-section needs at least one supported PPI sweep.</p>
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
        <p>
          Pin a gate on the PPI to choose the azimuth. Heights are above the antenna
          {catalog ? ` (${Math.round(catalog.site.altitude_m)} m above sea level)` : ''}.
        </p>
      </div>
    );
  } else if (state.view === 'compare' && pair) {
    const productNote = day ? ' · lowest-sweep product' : '';
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
          label={`Change ${timeLabel(compareTime)} → ${timeLabel(state.time)}${productNote}`}
          canvasRef={canvasRef}
        />
      );
    } else {
      body = (
        <div className="compare-grid">
          {[0, 1].map((k) => (
            <div key={k}>
              <span className="compare-label">
                {timeLabel(k ? state.time : compareTime)} · {k ? 'selected' : 'reference'}
              </span>
              <Plot
                scan={pair[k]}
                transform={transform}
                units={units}
                range={state.range}
                min={state.min}
                max={state.max}
                rings={state.rings}
                threshold={state.threshold}
                pin={state.pin}
                onPin={(pin) => set({ pin })}
                canvasRef={k ? canvasRef : undefined}
              />
            </div>
          ))}
        </div>
      );
    }
    footnote = (
      <div className="view-controls">
        <label>
          Compare with
          <select value={compareTime} onChange={(e) => set({ compareTime: Number(e.target.value) })}>
            {(day ? catalog!.volumes.map((_, i) => i) : TIMES.map((_, i) => i)).map((i) => (
              <option key={i} value={i}>
                {timeLabel(i)}
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
        {day && <p>Both scans use the co-registered lowest-sweep product (1° × 600 m, RHOHV-screened).</p>}
      </div>
    );
  } else if (state.view === 'accum' && accum.value) {
    const acc = accum.value;
    const scale = accumScale(acc.scan);
    legend = { label: 'Accumulation', units: 'mm', ...scale, palette: PALETTE };
    body = (
      <Plot
        scan={acc.scan}
        units="mm"
        {...scale}
        range={state.range}
        rings={state.rings}
        pin={state.pin}
        onPin={(pin) => set({ pin })}
        label={day ? 'Radar-estimated accumulation' : 'Illustrative accumulation'}
        canvasRef={canvasRef}
      />
    );
    footnote = (
      <>
        {day && (
          <div className="view-controls">
            <div
              className="segmented"
              role="group"
              aria-label="Accumulation window ending at the selected time"
            >
              {ACCUM_WINDOWS.map((h) => (
                <button key={h} aria-pressed={state.win === h} onClick={() => set({ win: h })}>
                  {h === 24 ? 'Since 00:00' : `${h} h`}
                </button>
              ))}
            </div>
            <p>
              Window ends at the selected scan time. Choose a later time on the timeline for a longer total.
            </p>
          </div>
        )}
        <div className="rainfall-method">
          <strong>
            {(acc.periodHours * 60).toFixed(0)}-minute total · {acc.label}.
          </strong>{' '}
          Trapezoidal integration of Z = {state.a} R<sup>{state.b}</sup> rates from the lowest sweep, computed{' '}
          {acc.engine === 'python'
            ? 'by the local Python service'
            : 'in the browser (Python service offline)'}
          . {acc.gaps ? `${acc.gaps} interval(s) longer than 15 min excluded.` : 'No gaps excluded.'} Not
          gauge-adjusted; X-band attenuation is not corrected.{' '}
          <button className="text-button" onClick={props.onMethods}>
            Read assumptions
          </button>
        </div>
      </>
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
        label={day ? `${catalog!.site.name} · ${timeLabel(state.time)}` : undefined}
        canvasRef={canvasRef}
      />
    );
  }

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
      {day && catalog ? (
        <DayStrip
          catalog={catalog}
          current={state.time}
          onSelect={(time) => set({ time })}
          playing={playing}
          setPlaying={setPlaying}
        />
      ) : (
        demo &&
        state.view !== 'accum' && (
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
        )
      )}
    </section>
  );
}
