import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  CloudRain,
  FileCheck2,
  Layers,
  Menu,
  Moon,
  Move,
  Radar,
  Radio,
  ScanEye,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react';
import { Brand } from '../Brand';
import { PALETTE } from '../data';
import StormReplay, { loadReplay, type ReplaySource } from './StormReplay';
import '../landing.css';

const DopplerRadarScene = lazy(() => import('../DopplerRadarScene'));
type Theme = 'light' | 'dark';
const THEME_KEY = 'rm-theme';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage unavailable */
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="lp-stage-loading">
        <Radar size={44} strokeWidth={1} />
        <span>3D view unavailable on this device</span>
      </div>
    ) : (
      this.props.children
    );
  }
}

/** Small illustrative glyphs for the "three ways" cards, drawn with the data palette. */
function Glyph({ kind }: { kind: 'space' | 'height' | 'time' }) {
  if (kind === 'space')
    return (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        {[52, 39, 26, 13].map((r) => (
          <circle key={r} cx="60" cy="60" r={r} className="g-ring" />
        ))}
        {Array.from({ length: 26 }, (_, i) => {
          const a = (i / 26) * Math.PI * 1.1 + 3.6,
            r = 18 + (i % 5) * 7;
          return (
            <circle
              key={i}
              cx={60 + Math.cos(a) * r}
              cy={60 + Math.sin(a) * r}
              r={4 + (i % 3)}
              fill={PALETTE[3 + (i % 8)]}
              opacity="0.9"
            />
          );
        })}
        <circle cx="60" cy="60" r="2.5" className="g-dot" />
      </svg>
    );
  if (kind === 'height')
    return (
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <line x1="10" y1="104" x2="112" y2="104" className="g-ring" />
        {[0.05, 0.16, 0.3, 0.5].map((s, k) =>
          Array.from({ length: 10 }, (_, i) => {
            const x = 14 + i * 9.6,
              y = 104 - (x - 10) * s - 4;
            const v = Math.max(0, 9 - Math.abs(i - 5) * 1.6 - k * 1.4);
            return (
              <rect
                key={`${k}-${i}`}
                x={x}
                y={y - 4 - k * 1.2}
                width="8.6"
                height={6 + k * 1.4}
                fill={PALETTE[Math.round(v)]}
                rx="1"
              />
            );
          }),
        )}
      </svg>
    );
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <line x1="8" y1="96" x2="112" y2="96" className="g-ring" />
      {Array.from({ length: 24 }, (_, i) => {
        const h = 8 + 60 * Math.exp(-(((i - 14) / 4.5) ** 2)) + 10 * Math.exp(-(((i - 4) / 2.5) ** 2));
        return (
          <rect
            key={i}
            x={10 + i * 4.2}
            y={96 - h}
            width="3"
            height={h}
            rx="1"
            fill={PALETTE[Math.min(11, Math.round(h / 7))]}
          />
        );
      })}
      <line x1="72" y1="20" x2="72" y2="100" className="g-cursor" />
    </svg>
  );
}

export default function Landing() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [menu, setMenu] = useState(false);
  const [replay, setReplay] = useState<ReplaySource | null>(null);
  const [still, setStill] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 700px)').matches,
  );
  const [xray, setXray] = useState(false);
  const [scanEl, setScanEl] = useState<number | null>(null);
  const [stageVisible, setStageVisible] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const rotation = useRef(0),
    pulse = useRef(-10000),
    drag = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* storage unavailable */
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'dark' ? '#0b1418' : '#f5f6f3');
    // Match the page canvas (overscroll, behind the nav) to the theme; cleared when leaving the landing.
    document.body.style.backgroundColor = theme === 'dark' ? '#0a1317' : '#f4f6f2';
  }, [theme]);

  useEffect(
    () => () => {
      document.body.style.backgroundColor = '';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f5f6f3');
    },
    [],
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce), (max-width: 700px)');
    const change = () => setStill(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadReplay(controller.signal)
      .then(setReplay)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el || !('IntersectionObserver' in window)) {
      setStageVisible(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setStageVisible(entry.isIntersecting), {
      rootMargin: '120px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Reveal-on-scroll for sections (skipped for reduced motion).
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>('.lp [data-reveal]');
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('IntersectionObserver' in window)
    ) {
      items.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.15 },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const exploreLink = replay?.link ?? '#/dashboard';
  const close = () => setMenu(false);

  return (
    <div className="lp" data-theme={theme}>
      <a className="skip-link" href="#lp-main">
        Skip to content
      </a>
      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <a href="#/" aria-label="Radar Metrology home" className="lp-brand">
            <Brand />
          </a>
          <nav className={menu ? 'open' : ''} aria-label="Main navigation">
            <a href="#replay" onClick={close}>
              Storm replay
            </a>
            <a href="#ways" onClick={close}>
              Analysis
            </a>
            <a href="#instrument" onClick={close}>
              Instrument
            </a>
            <a href="#why" onClick={close}>
              Why it matters
            </a>
          </nav>
          <div className="lp-nav-actions">
            <button
              className="lp-icon-btn lp-theme"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <a className="lp-btn lp-btn-ghost lp-hide-sm" href="#/dashboard">
              Open workspace <ArrowUpRight size={15} />
            </a>
            <button
              className="lp-icon-btn lp-menu"
              aria-label={menu ? 'Close navigation' : 'Open navigation'}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      <main id="lp-main">
        <section className="lp-hero" id="replay">
          <div className="lp-aurora" aria-hidden="true" />
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-copy">
              <span className="lp-eyebrow">
                <i /> Weather radar research · Mahabaleshwar, Western Ghats
              </span>
              <h1>
                Monsoon radar,
                <br />
                <span className="lp-grad">made legible.</span>
              </h1>
              <p>
                Watch real X-band scans of storms over the Western Ghats, then take them apart: across space,
                up through the atmosphere and through the day. Every number leaves with its method attached.
              </p>
              <div className="lp-cta">
                <a className="lp-btn lp-btn-primary" href={exploreLink}>
                  {replay?.observed ? 'Explore this storm' : 'Open the workspace'} <ArrowUpRight size={17} />
                </a>
                <a className="lp-btn lp-btn-ghost" href="#ways">
                  See what you can do <ArrowDown size={16} />
                </a>
              </div>
              <dl className="lp-stats">
                <div>
                  <dt>Elevation sweeps</dt>
                  <dd>11</dd>
                </div>
                <div>
                  <dt>Gate spacing</dt>
                  <dd>150 m</dd>
                </div>
                <div>
                  <dt>Volume cadence</dt>
                  <dd>10 min</dd>
                </div>
              </dl>
            </div>
            <StormReplay source={replay} theme={theme} />
          </div>
        </section>

        <div className="lp-ticker" aria-label="Instrument facts">
          <div className="lp-ticker-track">
            {[0, 1].map((k) => (
              <span key={k} aria-hidden={k === 1}>
                MBL-RADAR <b>·</b> X-band 9.46 GHz <b>·</b> dual polarisation <b>·</b> 0.95° beam <b>·</b> 11
                elevations from 0.5° to 89° <b>·</b> 150 m gates <b>·</b> 170 km range <b>·</b> 1410 m above
                sea level <b>·</b> volumes every 10 minutes <b>·</b>
              </span>
            ))}
          </div>
        </div>

        <section className="lp-section lp-wrap" id="ways">
          <div className="lp-head" data-reveal>
            <span className="lp-kicker">Analysis</span>
            <h2>See a storm three ways.</h2>
            <p>
              One workspace for where rain is, how tall it grows and how it evolves, with no switching tools.
            </p>
          </div>
          <div className="lp-cards">
            {[
              {
                kind: 'space' as const,
                title: 'Space',
                body: 'Plan view at any of 11 elevations, a regional map, and the change between two scans.',
                view: 'ppi',
              },
              {
                kind: 'height' as const,
                title: 'Height',
                body: 'Range–height cross-sections built from every sweep, with the beam height under each gate.',
                view: 'section',
              },
              {
                kind: 'time' as const,
                title: 'Time',
                body: 'Replay a whole day, follow one pinned point through time and total the rain over any window.',
                view: 'accum',
              },
            ].map((c, i) => (
              <a
                key={c.kind}
                className="lp-card"
                href={`#/dashboard?view=${c.view}`}
                data-reveal
                style={{ transitionDelay: `${i * 90}ms` }}
              >
                <div className="lp-card-art">
                  <Glyph kind={c.kind} />
                </div>
                <h3>{c.title}</h3>
                <p>{c.body}</p>
                <span className="lp-link">
                  Open {c.title.toLowerCase()} view <ArrowRight size={15} />
                </span>
              </a>
            ))}
          </div>
        </section>

        <section className="lp-section lp-instrument" id="instrument">
          <div className="lp-wrap lp-instrument-grid">
            <div
              ref={stage}
              className="lp-stage"
              data-reveal
              onPointerDown={(e) => {
                // Capturing the pointer would retarget the click away from controls inside the stage.
                if ((e.target as HTMLElement).closest('button, a')) return;
                if (!still) {
                  drag.current = e.clientX;
                  e.currentTarget.setPointerCapture(e.pointerId);
                }
              }}
              onPointerMove={(e) => {
                if (drag.current !== null && !still) {
                  rotation.current += (e.clientX - drag.current) * 0.006;
                  drag.current = e.clientX;
                }
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              role="img"
              aria-label="Representative model of a radome-housed X-band Doppler weather radar. Drag to rotate."
            >
              <SceneBoundary>
                <Suspense
                  fallback={
                    <div className="lp-stage-loading">
                      <Radar size={44} strokeWidth={1} />
                    </div>
                  }
                >
                  <DopplerRadarScene
                    rotation={rotation}
                    pulse={pulse}
                    xray={xray}
                    still={still}
                    paused={!stageVisible}
                    dark={theme === 'dark'}
                    onElevation={setScanEl}
                  />
                </Suspense>
              </SceneBoundary>
              <div className="lp-stage-top">
                <span className="lp-stage-note">Representative model · radome-housed X-band DWR</span>
                {!still && scanEl !== null && (
                  <span className="lp-chip live" aria-live="off">
                    <i /> Scanning {scanEl.toFixed(1)}°
                  </span>
                )}
              </div>
              <div className="lp-stage-controls">
                {!still && (
                  <span>
                    <Move size={14} /> Drag to rotate
                  </span>
                )}
                <div className="lp-stage-buttons">
                  <button
                    className="lp-btn lp-btn-ghost lp-btn-sm"
                    aria-pressed={xray}
                    onClick={() => setXray(!xray)}
                  >
                    <ScanEye size={14} /> {xray ? 'Show radome' : 'Look inside'}
                  </button>
                  {!still && (
                    <button
                      className="lp-btn lp-btn-ghost lp-btn-sm"
                      onClick={() => (pulse.current = performance.now())}
                    >
                      <Radio size={14} /> Send a pulse
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="lp-instrument-copy" data-reveal>
              <span className="lp-kicker">The instrument</span>
              <h2>A radar on the ridge.</h2>
              <p>
                At 1410 m on the Mahabaleshwar plateau, an X-band dual-polarisation radar scans eleven
                elevations every ten minutes, from the monsoon rain bands over the Konkan coast to the storms
                over the Deccan.
              </p>
              <dl className="lp-specs">
                <div>
                  <dt>Frequency</dt>
                  <dd>9.46 GHz · X-band</dd>
                </div>
                <div>
                  <dt>Beamwidth</dt>
                  <dd>0.95°</dd>
                </div>
                <div>
                  <dt>Sweeps</dt>
                  <dd>0.5° → 89°</dd>
                </div>
                <div>
                  <dt>Moments</dt>
                  <dd>Z, ZDR, KDP, ρhv, V</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        <section className="lp-section lp-wrap" id="why">
          <div className="lp-head" data-reveal>
            <span className="lp-kicker">Why it matters</span>
            <h2>Built for rain that mountains make.</h2>
            <p>
              The Ghats lift monsoon air into some of India’s heaviest rainfall. Generic viewers show a flat
              picture; this workspace is built to ask where, how high and how fast.
            </p>
          </div>
          <ul className="lp-values">
            {[
              {
                icon: Layers,
                title: 'Space, height and time',
                body: 'PPI, cross-section, time series and scan comparison in one place.',
              },
              {
                icon: FileCheck2,
                title: 'Method travels with data',
                body: 'Exports carry source, Z–R coefficients, display settings and version.',
              },
              {
                icon: CloudRain,
                title: 'Monsoon-aware rainfall',
                body: 'Stratiform, convective and tropical Z–R relations, side by side.',
              },
              {
                icon: ShieldCheck,
                title: 'Your files stay local',
                body: 'Read by a Python service on your machine. Nothing goes to a cloud.',
              },
            ].map(({ icon: Icon, title, body }, i) => (
              <li key={title} data-reveal style={{ transitionDelay: `${i * 70}ms` }}>
                <span className="lp-value-icon">
                  <Icon size={19} strokeWidth={1.6} />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="lp-section lp-wrap">
          <div className="lp-banner" data-reveal>
            <div>
              <h2>Open a storm in under a minute.</h2>
              <p>Bring CfRadial volumes, then explore them across space, height and time.</p>
            </div>
            <div className="lp-banner-actions">
              <a className="lp-btn lp-btn-primary" href={exploreLink}>
                Enter the workspace <ArrowUpRight size={17} />
              </a>
              <a className="lp-btn lp-btn-ghost" href="#/dashboard/methods">
                Read the methodology
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <Brand />
          <span>
            Independent research prototype · radar estimates are not gauge-validated · 3D model is
            representative
          </span>
          <a className="lp-link" href="#/dashboard/methods">
            Data & methodology <ArrowUpRight size={14} />
          </a>
        </div>
      </footer>
    </div>
  );
}
