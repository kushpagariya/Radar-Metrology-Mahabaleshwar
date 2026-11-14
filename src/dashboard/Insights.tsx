import { useEffect, useMemo, useState } from 'react';
import { MapPin, X } from 'lucide-react';
import { Histogram, TimeSeries } from '../charts';
import {
  beamHeight,
  demoScan,
  histogram,
  rainRate,
  scanStats,
  TIMES,
  utcClock,
  valueAt,
  type ArchiveCatalog,
  type Scan,
} from '../data';
import { dayOf, isDay, type ViewState } from './state';

export default function Insights({
  state,
  set,
  scan,
  transform,
  units,
  catalog,
}: {
  state: ViewState;
  set: (patch: Partial<ViewState>) => void;
  scan: Scan | null;
  transform: (v: number) => number;
  units: string;
  catalog: ArchiveCatalog | null;
}) {
  const demo = state.source === 'demo';
  const stats = useMemo(() => (scan ? scanStats(scan, state.threshold) : null), [scan, state.threshold]);
  const bins = useMemo(() => (scan ? histogram(scan) : []), [scan]);
  const day = isDay(state.source) && catalog ? dayOf(state.source) : null;
  const [daySeries, setDaySeries] = useState<{ key: string; dbz: (number | null)[]; times: string[] } | null>(
    null,
  );
  const pinKey = day && state.pin ? `${day}|${state.pin.az}|${state.pin.range}` : '';
  useEffect(() => {
    if (!pinKey) return;
    const controller = new AbortController();
    fetch(`/api/archive/${day}/gate?az=${state.pin!.az}&range_km=${state.pin!.range}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDaySeries({ key: pinKey, dbz: d.dbz, times: d.times }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [pinKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const series = useMemo(() => {
    if (!state.pin || !scan) return [];
    if (day) {
      if (!daySeries || daySeries.key !== pinKey) return [];
      return daySeries.dbz.map((v, i) => ({
        label: utcClock(daySeries.times[i]),
        value: v === null ? null : transform(v),
      }));
    }
    const scans = demo ? TIMES.map((_, i) => demoScan(i, state.elevation)) : [scan];
    return scans.map((s, i) => {
      const v = valueAt(s, state.pin!);
      return { label: demo ? TIMES[i] : 'This scan', value: v === null ? null : transform(v) };
    });
  }, [state.pin, state.elevation, scan, demo, transform, day, daySeries, pinKey]);

  const peakRate = stats ? rainRate(stats.max, state.a, state.b) : null;

  return (
    <>
      <div className="scan-summary">
        <div>
          <span>Scan timestamp</span>
          <strong>{scan?.timestamp.replace('T', ' ').replace('Z', ' UTC') || '—'}</strong>
        </div>
        <div>
          <span>Maximum reflectivity</span>
          <strong>
            {stats?.max.toFixed(1) ?? '—'} <small>dBZ</small>
          </strong>
        </div>
        <div>
          <span>Peak rain rate</span>
          <strong>
            {peakRate?.toFixed(1) ?? '—'}{' '}
            <small>
              mm/hr · Z={state.a}R^{state.b}
            </small>
          </strong>
        </div>
        <div>
          <span>{state.threshold !== null ? `Echo area ≥ ${state.threshold} dBZ` : 'Valid gates'}</span>
          <strong>
            {state.threshold !== null ? (
              <>
                {Math.round(stats?.areaKm2 ?? 0).toLocaleString()} <small>km²</small>
              </>
            ) : (
              (stats?.count.toLocaleString() ?? '—')
            )}
          </strong>
        </div>
      </div>
      <div className="insight-grid">
        <section className="insight-card" aria-labelledby="pin-title">
          <header>
            <h2 id="pin-title">
              <MapPin size={15} /> Pinned gate
            </h2>
            {state.pin && (
              <button
                className="icon-button"
                aria-label="Clear pinned gate"
                onClick={() => set({ pin: null })}
              >
                <X size={14} />
              </button>
            )}
          </header>
          {state.pin && scan ? (
            <>
              <p className="insight-meta">
                {state.pin.az.toFixed(1)}° / {state.pin.range.toFixed(1)} km · beam{' '}
                {beamHeight(state.pin.range, scan.elevation).toFixed(2)} km above antenna
              </p>
              {day && <p className="insight-meta">Whole day · lowest-sweep product (0.5°, 1° × 600 m)</p>}
              {demo || day ? (
                <TimeSeries
                  points={series}
                  units={units}
                  current={state.time}
                  onSelect={(time) => set({ time })}
                />
              ) : (
                <p className="insight-empty">
                  {series[0]?.value == null ? 'No data' : `${series[0].value.toFixed(1)} ${units}`} in this
                  scan. A time series needs a timestamped sequence of co-registered scans.
                </p>
              )}
            </>
          ) : (
            <p className="insight-empty">
              Click the plot (or focus it and press Enter) to pin a gate. You will see how its{' '}
              {units === 'dBZ' ? 'reflectivity' : 'rain rate'} changes through time, and the cross-section
              will follow its azimuth.
            </p>
          )}
        </section>
        <section className="insight-card" aria-labelledby="dist-title">
          <header>
            <h2 id="dist-title">Reflectivity distribution</h2>
            <span className="insight-meta">5 dBZ bins</span>
          </header>
          {scan ? (
            <Histogram bins={bins} threshold={state.threshold} />
          ) : (
            <p className="insight-empty">No scan.</p>
          )}
          <p className="insight-meta">
            Mean {stats?.mean.toFixed(1) ?? '—'} dBZ · {stats?.coverage.toFixed(0) ?? '—'}% of gates carry
            echo
          </p>
        </section>
      </div>
    </>
  );
}
