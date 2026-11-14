import { DEMO_RANGE_KM, ZR_PRESETS, type Field, type Gate } from '../data';

export type Page = 'workspace' | 'library' | 'methods';
export type View = 'ppi' | 'map' | 'section' | 'compare' | 'accum';
export const VIEWS: View[] = ['ppi', 'map', 'section', 'compare', 'accum'];

export type ViewState = {
  source: string;
  time: number;
  elevation: number;
  field: Field;
  range: number;
  view: View;
  rings: boolean;
  min: number;
  max: number;
  zr: string;
  a: number;
  b: number;
  threshold: number | null;
  pin: Gate | null;
  compareTime: number;
  compareMode: 'side' | 'diff';
  /** Accumulation window in hours, ending at the selected volume (archive days only). */
  win: number;
};

export const DEFAULTS: ViewState = {
  source: 'demo',
  time: 2,
  elevation: 0.5,
  field: 'reflectivity',
  range: DEMO_RANGE_KM,
  view: 'ppi',
  rings: true,
  min: 0,
  max: 60,
  zr: 'mp',
  a: 200,
  b: 1.6,
  threshold: null,
  pin: null,
  compareTime: 0,
  compareMode: 'side',
  win: 24,
};

export function parseRoute(hash: string): { page: Page; params: URLSearchParams } {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const page: Page = path.endsWith('/methods')
    ? 'methods'
    : path.endsWith('/library')
      ? 'library'
      : 'workspace';
  return { page, params: new URLSearchParams(query) };
}

const num = (v: string | null, fallback: number, lo: number, hi: number) => {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/** Reads shareable view state from the URL, clamping anything malformed back to safe defaults. */
export function readState(params: URLSearchParams): ViewState {
  const field = params.get('field') === 'rainfall' ? 'rainfall' : 'reflectivity';
  const view = (VIEWS as string[]).includes(params.get('view') ?? '') ? (params.get('view') as View) : 'ppi';
  const preset = ZR_PRESETS.find((p) => p.id === params.get('zr')) ?? ZR_PRESETS[0];
  const elevation = num(params.get('el'), 0.5, 0, 90);
  const pinAz = params.get('az'),
    pinR = params.get('rg');
  const min = num(params.get('min'), 0, -40, 499);
  return {
    source: params.get('src') || 'demo',
    // Upper bounds depend on the source; the dashboard clamps once the source is known.
    time: Math.round(num(params.get('t'), DEFAULTS.time, 0, 1000)),
    elevation,
    field,
    range: num(params.get('range'), DEMO_RANGE_KM, 0.1, 2000),
    view,
    rings: params.get('rings') !== '0',
    min,
    max: num(params.get('max'), field === 'rainfall' ? 50 : 60, min + 1, 500),
    zr: preset.id,
    a: preset.id === 'custom' ? num(params.get('a'), 200, 1, 2000) : preset.a,
    b: preset.id === 'custom' ? num(params.get('b'), 1.6, 0.5, 3) : preset.b,
    threshold: params.has('thr') ? num(params.get('thr'), 40, -20, 80) : null,
    pin:
      pinAz !== null && pinR !== null ? { az: num(pinAz, 0, 0, 360), range: num(pinR, 10, 0, 2000) } : null,
    compareTime: Math.round(num(params.get('ct'), 0, 0, 1000)),
    compareMode: params.get('cm') === 'diff' ? 'diff' : 'side',
    win: [1, 3, 6, 24].includes(Number(params.get('win'))) ? Number(params.get('win')) : 24,
  };
}

/** Serialises only values that differ from defaults so shared links stay short. */
export function writeState(s: ViewState) {
  const p = new URLSearchParams();
  if (s.source !== 'demo') p.set('src', s.source);
  if (s.time !== DEFAULTS.time) p.set('t', String(s.time));
  if (s.elevation !== DEFAULTS.elevation) p.set('el', String(s.elevation));
  if (s.field !== DEFAULTS.field) p.set('field', s.field);
  if (s.range !== DEMO_RANGE_KM) p.set('range', String(Number(s.range.toFixed(2))));
  if (s.view !== DEFAULTS.view) p.set('view', s.view);
  if (!s.rings) p.set('rings', '0');
  const defaultMax = s.field === 'rainfall' ? 50 : 60;
  if (s.min !== 0) p.set('min', String(s.min));
  if (s.max !== defaultMax) p.set('max', String(s.max));
  if (s.zr !== 'mp') p.set('zr', s.zr);
  if (s.zr === 'custom') {
    p.set('a', String(s.a));
    p.set('b', String(s.b));
  }
  if (s.threshold !== null) p.set('thr', String(s.threshold));
  if (s.view === 'accum' && s.win !== 24) p.set('win', String(s.win));
  if (s.pin) {
    p.set('az', String(s.pin.az));
    p.set('rg', String(s.pin.range));
  }
  if (s.view === 'compare') {
    p.set('ct', String(s.compareTime));
    if (s.compareMode === 'diff') p.set('cm', 'diff');
  }
  return p.toString();
}

export function pageHash(page: Page, query: string) {
  const path = page === 'workspace' ? '#/dashboard' : `#/dashboard/${page}`;
  return query ? `${path}?${query}` : path;
}

export const isDay = (source: string) => source.startsWith('day:');
export const dayOf = (source: string) => source.slice(4);
