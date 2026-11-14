import { useState } from 'react';
import { ArrowUpRight, Check, Download, FileText, LoaderCircle, Search, Trash2, Upload } from 'lucide-react';
import { download, TIMES } from '../data';
import type { Uploaded } from './useBackend';

const DEMO_FILES = TIMES.map((t, i) => ({ t, i, name: `illustrative_volume_${t.replace(':', '')}.nc` }));

export default function Library({
  uploads,
  busy,
  service,
  onUpload,
  onChoose,
  onOpenUpload,
  onRemoveUpload,
  onOpenDemo,
}: {
  uploads: Uploaded[];
  busy: boolean;
  service: boolean;
  onUpload: (file: File) => void;
  onChoose: () => void;
  onOpenUpload: (u: Uploaded) => void;
  onRemoveUpload: (u: Uploaded) => void;
  onOpenDemo: (time: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [dragging, setDragging] = useState(false);
  const q = query.trim().toLowerCase();
  const files = uploads.filter((u) => u.name.toLowerCase().includes(q));
  const demos = DEMO_FILES.filter((d) => d.name.includes(q));

  return (
    <>
      <div
        className={`library-import ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files[0]) onUpload(e.dataTransfer.files[0]);
        }}
      >
        <div className="upload-symbol">
          {busy ? <LoaderCircle className="spin" size={24} /> : <Upload size={24} strokeWidth={1.4} />}
        </div>
        <div>
          <h2>Bring your radar data</h2>
          <p>
            Drop a NetCDF file here, or choose a file. It is read on this machine by the local Python service
            and never leaves it.
          </p>
          <span>
            .nc files · up to 64 MiB ·{' '}
            {service ? 'Python service connected' : 'start the Python service with npm run backend'}
          </span>
        </div>
        <button className="btn btn-outline" disabled={busy} onClick={onChoose}>
          {busy ? 'Inspecting…' : 'Choose a file'}
        </button>
      </div>
      <div className="library-heading">
        <h2>
          Radar files <span>{DEMO_FILES.length + uploads.length}</span>
        </h2>
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Search radar files"
            placeholder="Search files…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
      </div>
      <div className="file-table-wrap">
        <table className="file-table">
          <thead>
            <tr>
              <th>File name</th>
              <th>Scan time</th>
              <th>Type</th>
              <th>Status</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {files.map((u) => (
              <tr key={u.id}>
                <td>
                  <FileText size={17} />
                  <div>
                    <strong>{u.name}</strong>
                    <span>
                      {(u.size / 1048576).toFixed(2)} MiB · {u.fields.length} reflectivity field
                      {u.fields.length === 1 ? '' : 's'} · {u.sweeps} sweep{u.sweeps === 1 ? '' : 's'}
                    </span>
                  </div>
                </td>
                <td>From file</td>
                <td>NetCDF</td>
                <td>
                  <span className="ready-state">
                    <Check size={12} />
                    Inspected
                  </span>
                </td>
                <td>
                  <button className="text-button" disabled={!u.fields.length} onClick={() => onOpenUpload(u)}>
                    Explore <ArrowUpRight size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${u.name}`}
                    onClick={() => onRemoveUpload(u)}
                  >
                    <Trash2 size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Export metadata for ${u.name}`}
                    onClick={() => download(`${u.name}.metadata.json`, JSON.stringify(u, null, 2))}
                  >
                    <Download size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {demos.map(({ t, i, name }) => (
              <tr key={t}>
                <td>
                  <FileText size={17} />
                  <div>
                    <strong>{name}</strong>
                    <span>15 July 2026 · synthetic volume · 4 sweeps</span>
                  </div>
                </td>
                <td>{t}:00 UTC</td>
                <td>Illustrative</td>
                <td>
                  <span className="ready-state">
                    <Check size={12} />
                    Ready to explore
                  </span>
                </td>
                <td>
                  <button className="text-button" onClick={() => onOpenDemo(i)}>
                    Explore <ArrowUpRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!files.length && !demos.length && (
          <div className="empty-search">
            <Search size={24} />
            <h3>No matching files</h3>
            <p>Try a different filename or clear your search.</p>
            <button className="btn btn-outline" onClick={() => setQuery('')}>
              Clear search
            </button>
          </div>
        )}
      </div>
      <p className="workspace-footnote">
        Demonstration entries are generated in the browser; they are not original NetCDF files. Uploaded files
        are temporary: they survive a page refresh but are removed when the backend stops.
      </p>
    </>
  );
}
