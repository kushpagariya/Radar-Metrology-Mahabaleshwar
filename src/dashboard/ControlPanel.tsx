import { CircleHelp, SlidersHorizontal } from 'lucide-react';
import { DEMO_ELEVATIONS, formatDistance, TIMES, ZR_PRESETS, type Field, type Scan } from '../data';
import type { ViewState } from './state';
import type { Uploaded } from './useBackend';

type Props = {
  state: ViewState;
  set: (patch: Partial<ViewState>) => void;
  scan: Scan | null;
  upload: Uploaded | undefined;
  sourceField: string;
  setSourceField: (v: string) => void;
  sweep: number;
  setSweep: (v: number) => void;
  activeRange: number;
  onReset: () => void;
};

export default function ControlPanel({
  state,
  set,
  scan,
  upload,
  sourceField,
  setSourceField,
  sweep,
  setSweep,
  activeRange,
  onReset,
}: Props) {
  const demo = state.source === 'demo';
  const preset = ZR_PRESETS.find((p) => p.id === state.zr) ?? ZR_PRESETS[0];
  const showsRain = state.field === 'rainfall' || state.view === 'accum';
  const fixedScale = state.view === 'accum' || (state.view === 'compare' && state.compareMode === 'diff');
  return (
    <aside className="control-panel" aria-label="Scan settings">
      <div className="control-title">
        <SlidersHorizontal size={16} />
        <h2>Scan settings</h2>
      </div>
      {!demo && (
        <>
          <label>
            Source reflectivity
            <select value={sourceField} onChange={(e) => setSourceField(e.target.value)}>
              {upload?.fields.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name} ({f.units})
                </option>
              ))}
            </select>
          </label>
          <label>
            Sweep
            <select value={sweep} onChange={(e) => setSweep(Number(e.target.value))}>
              {Array.from({ length: upload?.sweeps || 1 }, (_, i) => (
                <option key={i} value={i}>
                  Sweep {i + 1}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        Radar moment
        <select
          value={state.field}
          onChange={(e) => {
            const field = e.target.value as Field;
            set({ field, min: 0, max: field === 'rainfall' ? 50 : 60 });
          }}
        >
          <option value="reflectivity">Reflectivity · dBZ</option>
          <option value="rainfall">Rainfall rate · mm/hr</option>
        </select>
      </label>
      <label>
        Scan time <span className="control-unit">UTC</span>
        <select value={state.time} disabled={!demo} onChange={(e) => set({ time: Number(e.target.value) })}>
          {demo ? (
            TIMES.map((t, i) => (
              <option key={t} value={i}>
                {t}:00
              </option>
            ))
          ) : (
            <option value={state.time}>{scan?.timestamp || 'Reading file…'}</option>
          )}
        </select>
      </label>
      <label>
        Elevation angle
        <select
          value={state.elevation}
          disabled={!demo || state.view === 'section'}
          onChange={(e) => set({ elevation: Number(e.target.value) })}
        >
          {demo ? (
            DEMO_ELEVATIONS.map((e) => (
              <option value={e} key={e}>
                {e.toFixed(1)}°
              </option>
            ))
          ) : (
            <option value={state.elevation}>{scan?.elevation.toFixed(2) ?? '—'}°</option>
          )}
        </select>
      </label>
      <label>
        Display range <span className="control-unit">{formatDistance(state.range)}</span>
        <input
          type="range"
          min={Math.min(0.1, activeRange)}
          max={activeRange}
          step={activeRange < 1 ? 0.001 : 0.1}
          value={state.range}
          onChange={(e) => set({ range: Number(e.target.value) })}
        />
        <span className="range-labels">
          <span>Near</span>
          <span>Full scan</span>
        </span>
      </label>
      {showsRain && (
        <>
          <label>
            Z–R relation
            <select
              value={state.zr}
              onChange={(e) => {
                const p = ZR_PRESETS.find((x) => x.id === e.target.value)!;
                set(p.id === 'custom' ? { zr: p.id } : { zr: p.id, a: p.a, b: p.b });
              }}
            >
              {ZR_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <span className="field-note">
              a = {state.a}, b = {state.b} · {preset.note}
            </span>
          </label>
          {state.zr === 'custom' && (
            <div className="scale-inputs">
              <label>
                a
                <input
                  type="number"
                  value={state.a}
                  min={1}
                  max={2000}
                  step={10}
                  onChange={(e) => {
                    const a = Number(e.target.value);
                    if (a >= 1 && a <= 2000) set({ a });
                  }}
                />
              </label>
              <label>
                b
                <input
                  type="number"
                  value={state.b}
                  min={0.5}
                  max={3}
                  step={0.1}
                  onChange={(e) => {
                    const b = Number(e.target.value);
                    if (b >= 0.5 && b <= 3) set({ b });
                  }}
                />
              </label>
            </div>
          )}
        </>
      )}
      <div className="control-divider" />
      <div className="control-title">
        <h2>Display</h2>
      </div>
      {fixedScale ? (
        <p className="field-note scale-note">This view uses a fixed scale so results stay comparable.</p>
      ) : (
        <div className="scale-inputs">
          <label>
            Minimum
            <input
              type="number"
              value={state.min}
              min={-40}
              max={state.max - 1}
              onChange={(e) => set({ min: Math.min(Number(e.target.value), state.max - 1) })}
            />
          </label>
          <label>
            Maximum
            <input
              type="number"
              value={state.max}
              min={state.min + 1}
              max={state.field === 'rainfall' ? 500 : 100}
              onChange={(e) => set({ max: Math.max(Number(e.target.value), state.min + 1) })}
            />
          </label>
        </div>
      )}
      <label className="check-label">
        <input type="checkbox" checked={state.rings} onChange={(e) => set({ rings: e.target.checked })} />
        <span>Range rings</span>
      </label>
      <div className="threshold-row">
        <label className="check-label">
          <input
            type="checkbox"
            checked={state.threshold !== null}
            onChange={(e) => set({ threshold: e.target.checked ? 40 : null })}
          />
          <span>Highlight ≥</span>
        </label>
        <label className="inline-number">
          <span className="visually-hidden">Highlight threshold in dBZ</span>
          <input
            type="number"
            value={state.threshold ?? 40}
            disabled={state.threshold === null}
            min={-20}
            max={80}
            step={5}
            onChange={(e) => set({ threshold: Number(e.target.value) })}
          />
          <span className="control-unit">dBZ</span>
        </label>
      </div>
      <div className="control-help">
        <CircleHelp size={15} />
        <p>
          {demo
            ? 'These scans demonstrate the workflow. They are not observed weather.'
            : 'Only supported polar reflectivity fields are shown. Coordinate and unit checks run in Python.'}
        </p>
      </div>
      <button className="text-button reset-controls" onClick={onReset}>
        Reset settings
      </button>
    </aside>
  );
}
