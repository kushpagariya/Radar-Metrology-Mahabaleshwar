import { ArrowUpRight } from 'lucide-react';
import { BEAMWIDTH_DEG, formatDay, ZR_PRESETS, type ArchiveDaySummary } from '../data';

export default function Methods({
  service,
  archiveDays,
}: {
  service: boolean;
  archiveDays: ArchiveDaySummary[];
}) {
  return (
    <div className="methods-layout">
      <article>
        <h2>A demonstration with explicit boundaries.</h2>
        <p>
          This is an independent research prototype for Radar Metrology – Mahabaleshwar. Its purpose is to
          demonstrate the experience and scientific processing approach before a production database or
          authentication system is introduced.
        </p>
        <h3>Demonstration data</h3>
        <p>
          The six scans and four elevation settings are synthetic, deterministic examples. Their dates, echoes
          and values are illustrative; echoes weaken with beam height so the cross-section shows a plausible
          vertical structure. The location uses an approximate HACPL reference at 17.92° N, 73.60° E; it is
          not a verified antenna coordinate. The 82.5 km demonstration range is a design setting, not an
          instrument specification.
        </p>
        <h3>MBL-RADAR archive</h3>
        <p>
          Observed days come from MBL-RADAR, an X-band (9.46 GHz) dual-polarisation radar at 17.925° N,
          73.660° E, 1410 m, recorded by Sigmet IRIS and converted to CfRadial-1.4 by RadxConvert. Each
          volume, about every 10 minutes, holds 11 PPI sweeps at 0.5, 1, 1.5, 3, 6, 9, 12, 30, 45, 60 and 89°
          with 150 m gates (to 170 km at low elevations) and 15 fields, including DBZ, DBZ_TOT, VEL, ZDR, KDP,
          RHOHV and HCLASS. The 0.5° sweep holds 339 rays, leaving a sector without data that is shown as a
          gap, never filled.
        </p>
        <p>
          The pipeline (<code>backend/pipeline.py</code>) reads volumes directly from the zip archives, checks
          each against the observed scan profile, records gaps and failures, and writes a per-day catalog. For
          playback, comparison, gate time series and accumulation it builds a co-registered lowest-sweep
          product: DBZ screened with RHOHV ≥ 0.7, averaged in linear Z over four gates (600 m, at least two
          valid) and assigned to 1° azimuth bins from the nearest ray within ±0.75°. Full-resolution sweeps
          are read on demand from the original volume and displayed with every sixth gate (0.9 km). No
          attenuation, clutter, beam-blockage or calibration correction is applied beyond the IRIS processing
          already in DBZ.
        </p>
        {archiveDays.length > 0 && (
          <table className="methods-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>Volumes</th>
                <th>Gaps</th>
                <th>Peak</th>
              </tr>
            </thead>
            <tbody>
              {archiveDays.map((d) => (
                <tr key={d.date}>
                  <td>{formatDay(d.date)}</td>
                  <td>
                    {d.volume_count}/{d.expected_volumes}
                  </td>
                  <td>
                    {d.gaps.map((g) => `${g.after.slice(11, 16)}–${g.before.slice(11, 16)} UTC`).join(', ') ||
                      'None'}
                  </td>
                  <td>{d.summary.peak_dbz ?? '—'} dBZ</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h3>NetCDF inspection</h3>
        <p>
          The local API inspects groups, dimensions, variables, units and attributes. Supported polar scans
          must provide interpretable azimuth and range coordinates and a reflectivity field in dBZ.
          Unsupported geometry or units produce an explicit error. Original files are not modified and never
          leave this machine. Uploads are temporary and are cleared on backend shutdown.
        </p>
        <h3>Reflectivity and rainfall</h3>
        <p>
          Linear reflectivity is Z = 10^(dBZ / 10), in mm⁶ m⁻³. Rainfall rate is R = (Z / a)^(1 / b), in
          mm/hr. The default a = 200 and b = 1.6 follow the{' '}
          <a
            className="link"
            href="https://glossary.ametsoc.org/wiki/marshall-palmer-relation/"
            target="_blank"
            rel="noreferrer"
          >
            Marshall–Palmer relationship
          </a>
          . Presets are offered because no single Z–R relation fits every rain regime; orographic monsoon rain
          in the Western Ghats is often dominated by warm-rain processes. None of the presets has been
          validated for this site.
        </p>
        <table className="methods-table">
          <thead>
            <tr>
              <th>Preset</th>
              <th>a</th>
              <th>b</th>
              <th>Typical use</th>
            </tr>
          </thead>
          <tbody>
            {ZR_PRESETS.filter((p) => p.id !== 'custom').map((p) => (
              <tr key={p.id}>
                <td>{p.label}</td>
                <td>{p.a}</td>
                <td>{p.b}</td>
                <td>{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>Beam height and cross-sections</h3>
        <p>
          Beam-centre height uses the standard 4/3 effective-Earth-radius model: h = √(r² + (kₑa)² + 2 r kₑa
          sin θ) − kₑa, with kₑ = 4/3 and a = 6371 km. Height is relative to the antenna, not sea level. The
          cross-section draws each sweep along one azimuth as a beam volume of {BEAMWIDTH_DEG}° (an assumed
          beamwidth, not an instrument specification). Gaps between sweeps are left empty rather than
          interpolated.
        </p>
        <h3>Time, accumulation and comparison</h3>
        <p>
          Accumulation integrates consecutive rainfall rates trapezoidally in hours and excludes intervals
          longer than 15 minutes. When the Python service is connected it performs the integration; otherwise
          the browser runs the same method. In the demonstration, gates with no echo are treated as zero rain.
          For archive days it uses the lowest-sweep product, treats sampled gates below 10 dBZ as no rain and
          excludes unsampled rays; totals are radar estimates, not gauge-adjusted, and X-band attenuation in
          heavy rain will cause underestimates behind intense cells. Scan comparisons subtract co-registered
          gates (later minus earlier); they are only offered for scans that share identical polar geometry.
        </p>
        <h3>Map and interpretation</h3>
        <p>
          The regional view is schematic and works offline. Its contours, coastline and place markers are
          approximate and illustrative; it is not a surveyed basemap. A source-file PPI retains the file’s
          polar geometry. This prototype does not calculate terrain blockage, attenuation correction or a
          validated geographic observation footprint.
        </p>
        <h3>Scientific limits</h3>
        <p>
          Radar samples a volume aloft. Clutter, attenuation, calibration, beam height, terrain and
          precipitation type affect interpretation. No rain-gauge ingestion, gauge validation, operational
          warnings or forecast accuracy claims are included.
        </p>
      </article>
      <aside className="methods-aside">
        <h3>Prototype status</h3>
        <dl>
          <div>
            <dt>Persistence</dt>
            <dd>Session only</dd>
          </div>
          <div>
            <dt>Database</dt>
            <dd>Not connected</dd>
          </div>
          <div>
            <dt>Authentication</dt>
            <dd>Not required</dd>
          </div>
          <div>
            <dt>Python service</dt>
            <dd>{service ? 'Connected' : 'Start locally'}</dd>
          </div>
        </dl>
        <h3>Included in exports</h3>
        <ul>
          <li>Source and synthetic-data flag</li>
          <li>Scan time, elevation and view</li>
          <li>Field, units and coordinates</li>
          <li>Z–R preset, coefficients and threshold</li>
          <li>Pinned gate and processing version</li>
        </ul>
        <a href="#/" className="link">
          Return to the exhibition <ArrowUpRight size={14} />
        </a>
      </aside>
    </div>
  );
}
