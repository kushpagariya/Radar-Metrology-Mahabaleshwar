import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  CircleHelp,
  Download,
  FileText,
  FolderOpen,
  Layers,
  Link2,
  Plus,
  Radar,
  X,
} from 'lucide-react';
import { Brand } from '../Brand';
import { demoScan, DEMO_RANGE_KM, differenceScan, rainRate, TIMES, type Scan } from '../data';
import ControlPanel from './ControlPanel';
import Insights from './Insights';
import Library from './Library';
import Methods from './Methods';
import PlotPanel, { ACCUM_SCALE, DIFF_SCALE, type Accumulation } from './PlotPanel';
import { exportCsv, exportJson, exportPng } from './exporters';
import { DEFAULTS, pageHash, parseRoute, readState, writeState, type Page, type ViewState } from './state';
import { useBackend, type Uploaded } from './useBackend';

const PAGES: { id: Page; label: string; icon: typeof Radar }[] = [
  { id: 'workspace', label: 'Radar workspace', icon: Radar },
  { id: 'library', label: 'Data library', icon: FolderOpen },
];
const PAGE_TITLES: Record<Page, string> = {
  workspace: 'Radar workspace',
  library: 'Data library',
  methods: 'Data & methodology',
};
const PAGE_INTROS: Record<Page, string> = {
  workspace: 'Reflectivity across space, height and time — every number with its method.',
  library: 'Inspect, select and manage your radar inputs. Files stay on this machine.',
  methods: 'Understand the inputs, methods and limits of this prototype.',
};

export default function Dashboard({ page }: { page: Page }) {
  const [state, setState] = useState<ViewState>(() => readState(parseRoute(window.location.hash).params));
  const set = useCallback((patch: Partial<ViewState>) => setState((s) => ({ ...s, ...patch })), []);
  const [playing, setPlaying] = useState(false);
  const { service, setService, uploads, setUploads } = useBackend();
  const [realScan, setRealScan] = useState<Scan | null>(null);
  const [sourceField, setSourceField] = useState('');
  const [sweep, setSweep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [accumulation, setAccumulation] = useState<Accumulation | null>(null);
  const [sweeps, setSweeps] = useState<Scan[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    exportMenu = useRef<HTMLDetailsElement>(null),
    request = useRef(0);

  const demo = state.source === 'demo';
  const currentUpload = uploads.find((u) => u.id === state.source);
  const scan = demo ? demoScan(state.time, state.elevation) : realScan;
  const activeRange = demo ? DEMO_RANGE_KM : scan?.ranges.at(-1) || state.range;

  const transform = useMemo(
    () => (state.field === 'rainfall' ? (v: number) => rainRate(v, state.a, state.b) : (v: number) => v),
    [state.field, state.a, state.b],
  );
  const units = state.field === 'rainfall' ? 'mm/hr' : 'dBZ';

  // Keep the URL in sync so any view can be shared or bookmarked.
  useEffect(() => {
    const hash = pageHash(page, writeState(state));
    if (window.location.hash !== hash) history.replaceState(null, '', hash);
  }, [state, page]);

  // Playback through the demonstration sequence.
  useEffect(() => {
    if (!playing || !demo) return;
    const timer = setInterval(() => setState((s) => ({ ...s, time: (s.time + 1) % TIMES.length })), 1100);
    return () => clearInterval(timer);
  }, [playing, demo]);

  // Recover an uploaded source named in the URL once the file list arrives.
  useEffect(() => {
    if (!demo && currentUpload && !sourceField) setSourceField(currentUpload.fields[0]?.name || '');
  }, [demo, currentUpload, sourceField]);

  // Fall back to the demonstration if a linked upload no longer exists on the backend.
  useEffect(() => {
    if (demo || !service) return;
    const t = setTimeout(() => {
      if (!uploads.some((u) => u.id === state.source)) {
        set({ source: 'demo', range: DEMO_RANGE_KM });
        setNotice(
          'That uploaded file is no longer in this backend session. Showing the demonstration volume.',
        );
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [demo, service, uploads, state.source, set]);

  // Read the selected sweep from an uploaded file.
  useEffect(() => {
    if (demo || !sourceField) return;
    const controller = new AbortController();
    const n = ++request.current;
    setBusy(true);
    setRealScan(null);
    fetch(`/api/files/${state.source}/scan?field=${encodeURIComponent(sourceField)}&sweep=${sweep}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).detail || 'Unable to read this scan.');
        return r.json();
      })
      .then((data: Scan) => {
        if (n !== request.current) return;
        setRealScan(data);
        const full = data.ranges[data.ranges.length - 1] || 80;
        setState((s) => ({ ...s, range: s.range > full || s.range === DEMO_RANGE_KM ? full : s.range }));
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setNotice(e.message);
      })
      .finally(() => {
        if (n === request.current) setBusy(false);
      });
    return () => controller.abort();
  }, [demo, state.source, sourceField, sweep]);

  const goTo = useCallback(
    (p: Page) => {
      setNotice('');
      setPlaying(false);
      window.location.hash = pageHash(p, writeState(state));
    },
    [state],
  );

  function selectDemo(time = state.time) {
    setRealScan(null);
    setSourceField('');
    set({ source: 'demo', time, range: DEMO_RANGE_KM });
  }

  function resetSettings() {
    setPlaying(false);
    set({ ...DEFAULTS, source: state.source, range: activeRange });
  }

  async function upload(file: File) {
    if (!file.name.toLowerCase().endsWith('.nc'))
      return setNotice('Choose a NetCDF file with the .nc extension.');
    if (file.size > 64 * 1024 * 1024) return setNotice('This local prototype accepts files up to 64 MiB.');
    setBusy(true);
    setNotice('');
    try {
      const form = new FormData();
      form.append('file', file);
      const r = await fetch('/api/files', { method: 'POST', body: form });
      let data;
      try {
        data = await r.json();
      } catch {
        throw new Error('Start the local Python service with npm run backend, then try again.');
      }
      if (!r.ok)
        throw new Error(typeof data.detail === 'string' ? data.detail : 'The file could not be inspected.');
      setUploads((prev) => [...prev, data]);
      setService(true);
      setNotice(`${file.name} inspected. Select Explore to view its reflectivity fields.`);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Start the Python service to inspect NetCDF files.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function openUpload(item: Uploaded) {
    setSourceField(item.fields[0]?.name || '');
    setSweep(0);
    setPlaying(false);
    const next = { ...state, source: item.id, view: 'ppi' as const, pin: null };
    setState(next);
    window.location.hash = pageHash('workspace', writeState(next));
  }

  async function removeUpload(item: Uploaded) {
    try {
      const r = await fetch(`/api/files/${item.id}`, { method: 'DELETE' });
      if (!r.ok && r.status !== 404) throw new Error('Could not remove this file.');
      setUploads((v) => v.filter((x) => x.id !== item.id));
      if (state.source === item.id) selectDemo();
      setNotice('File removed from this local session.');
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice('Link copied. It reopens this exact view: scan, settings and pinned gate.');
    } catch {
      setNotice(`Copy this link: ${window.location.href}`);
    }
  }

  const displayed = useMemo(() => {
    if (!scan) return null;
    if (state.view === 'accum' && accumulation) return accumulation.scan;
    if (state.view === 'compare' && state.compareMode === 'diff' && demo)
      return differenceScan(demoScan(state.compareTime, state.elevation), scan) ?? scan;
    return scan;
  }, [scan, state.view, state.compareMode, state.compareTime, state.elevation, accumulation, demo]);

  function exportData(format: 'png' | 'json' | 'csv') {
    if (!scan || !displayed) return;
    exportMenu.current?.removeAttribute('open');
    const isDiff = displayed.field === 'difference',
      isAccum = displayed.field === 'accumulation';
    const ctx = {
      state,
      scan,
      displayed,
      sweeps,
      transform,
      units: isDiff ? 'ΔdBZ' : isAccum ? 'mm' : units,
      scale: isDiff ? DIFF_SCALE : isAccum ? ACCUM_SCALE : { min: state.min, max: state.max },
      canvas: canvas.current,
    };
    if (format === 'png') exportPng(ctx);
    else if (format === 'json') exportJson(ctx);
    else exportCsv(ctx);
  }

  return (
    <div className="dashboard">
      <a className="skip-link" href="#workspace-content">
        Skip to workspace
      </a>
      <aside className="sidebar">
        <a href="#/" className="sidebar-brand" aria-label="Return to exhibition">
          <Brand />
        </a>
        <div className="sidebar-section-label">RESEARCH WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          {PAGES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={page === id ? 'active' : ''}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => goTo(id)}
            >
              <Icon size={18} strokeWidth={1.5} />
              {label}
              {id === 'library' && <span className="nav-count">{TIMES.length + uploads.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className={page === 'methods' ? 'active' : ''} onClick={() => goTo('methods')}>
            <BookOpen size={17} />
            Data & methodology
          </button>
          <a href="#/">
            <ArrowLeft size={17} />
            Back to exhibition
          </a>
          <div className="prototype-note">
            <span className="status-dot" /> Demonstration prototype
            <span>No account required. Files stay on this machine, in the local backend session.</span>
          </div>
        </div>
      </aside>
      <div className="dashboard-body">
        <header className="dashboard-topbar">
          <div>
            <span className="breadcrumb">Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <span>{PAGE_TITLES[page]}</span>
          </div>
          <div className="topbar-right">
            <span className="demo-badge">Prototype</span>
            {page === 'workspace' && (
              <button
                className="icon-button"
                aria-label="Copy link to this view"
                title="Copy link to this view"
                onClick={() => void copyLink()}
              >
                <Link2 size={18} />
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Read data and methodology"
              onClick={() => goTo('methods')}
            >
              <CircleHelp size={19} />
            </button>
            <span className="user-avatar" title="Guest researcher">
              R
            </span>
          </div>
        </header>
        <main id="workspace-content" className="dashboard-main">
          <div className="page-heading">
            <div>
              <h1>{PAGE_TITLES[page]}</h1>
              <p>{PAGE_INTROS[page]}</p>
            </div>
            {page === 'workspace' ? (
              <details className="export-menu" ref={exportMenu}>
                <summary className="btn btn-outline">
                  <Download size={15} />
                  Export <ChevronDown size={14} />
                </summary>
                <div>
                  <button disabled={!scan || busy} onClick={() => exportData('png')}>
                    Current view image (.png)
                  </button>
                  <button disabled={!scan || busy} onClick={() => exportData('json')}>
                    Data & provenance (.json)
                  </button>
                  <button disabled={!scan || busy} onClick={() => exportData('csv')}>
                    Displayed gates (.csv)
                  </button>
                </div>
              </details>
            ) : page === 'library' ? (
              <button className="btn btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>
                <Plus size={16} />
                Import NetCDF
              </button>
            ) : null}
          </div>
          <input
            type="file"
            accept=".nc"
            ref={fileInput}
            className="visually-hidden"
            aria-label="Upload a NetCDF radar file"
            onChange={(e) => {
              if (e.target.files?.[0]) void upload(e.target.files[0]);
            }}
          />
          {notice && (
            <div className="notice" role="status">
              <FileText size={17} />
              <span>{notice}</span>
              <button className="icon-button" aria-label="Dismiss message" onClick={() => setNotice('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {page === 'workspace' && (
            <>
              <div className="dataset-strip">
                <div className="dataset-icon">
                  <Layers size={19} />
                </div>
                <div>
                  <strong>
                    {demo ? 'Western Ghats · demonstration volume' : (currentUpload?.name ?? 'Uploaded file')}
                  </strong>
                  <span>
                    {demo
                      ? '15 July 2026 · 6 scans × 4 elevations · synthetic reflectivity'
                      : 'Uploaded NetCDF · local session · original file preserved'}
                  </span>
                </div>
                <span className={`data-badge ${demo ? '' : 'uploaded'}`}>
                  {demo ? 'Synthetic data' : 'Uploaded file'}
                </span>
                <button className="text-button" onClick={() => goTo('library')}>
                  Change dataset <ArrowRight size={14} />
                </button>
              </div>
              <div className="workspace-grid">
                <ControlPanel
                  state={state}
                  set={set}
                  scan={scan}
                  upload={currentUpload}
                  sourceField={sourceField}
                  setSourceField={setSourceField}
                  sweep={sweep}
                  setSweep={setSweep}
                  activeRange={activeRange}
                  onReset={resetSettings}
                />
                <PlotPanel
                  state={state}
                  set={set}
                  scan={scan}
                  upload={currentUpload}
                  sourceField={sourceField}
                  busy={busy}
                  service={service}
                  transform={transform}
                  units={units}
                  playing={playing}
                  setPlaying={setPlaying}
                  onUseDemo={() => selectDemo()}
                  onMethods={() => goTo('methods')}
                  canvasRef={canvas}
                  onAccumulation={setAccumulation}
                  onSweeps={setSweeps}
                />
              </div>
              <Insights state={state} set={set} scan={scan} transform={transform} units={units} />
              <p className="workspace-footnote">
                {state.view === 'map'
                  ? 'Regional context is schematic; place markers are approximate. Uploaded scans use source site metadata. '
                  : state.view === 'section'
                    ? 'Cross-sections join separate sweeps; gaps between beams are not interpolated. '
                    : 'PPI shows the selected elevation aloft; it is not a surface rainfall measurement. '}
                <button className="text-button" onClick={() => goTo('methods')}>
                  Read methodology <ArrowRight size={12} />
                </button>
              </p>
            </>
          )}
          {page === 'library' && (
            <Library
              uploads={uploads}
              busy={busy}
              service={service}
              onUpload={(f) => void upload(f)}
              onChoose={() => fileInput.current?.click()}
              onOpenUpload={openUpload}
              onRemoveUpload={(u) => void removeUpload(u)}
              onOpenDemo={(t) => {
                setRealScan(null);
                setSourceField('');
                const next = { ...state, source: 'demo', time: t, range: DEMO_RANGE_KM };
                setState(next);
                window.location.hash = pageHash('workspace', writeState(next));
              }}
            />
          )}
          {page === 'methods' && <Methods service={service} />}
        </main>
        <footer className="workspace-footer">
          <span>Radar Metrology · Mahabaleshwar</span>
          <span>
            <span className={`status-dot ${service ? 'connected' : ''}`} />
            {service ? 'Local Python service connected' : 'Browser demonstration'}
            <span className="footer-version">v0.2</span>
          </span>
        </footer>
      </div>
    </div>
  );
}
