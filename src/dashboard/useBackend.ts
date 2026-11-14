import { useCallback, useEffect, useState } from 'react';

export type Uploaded = {
  id: string;
  name: string;
  size: number;
  fields: { name: string; units: string }[];
  sweeps: number;
  metadata: Record<string, unknown>;
};

const HEALTH_INTERVAL_MS = 15000;

/** Tracks the optional local Python service and the files it holds for this session. */
export function useBackend() {
  const [service, setService] = useState(false);
  const [uploads, setUploads] = useState<Uploaded[]>([]);

  const refreshUploads = useCallback(async () => {
    try {
      const r = await fetch('/api/files');
      if (r.ok) setUploads(await r.json());
    } catch {
      /* service offline: keep current list */
    }
  }, []);

  useEffect(() => {
    let active = true,
      wasUp = false;
    const check = async () => {
      try {
        const r = await fetch('/api/health');
        const up = r.ok && (await r.json()).status === 'ok';
        if (!active) return;
        setService(up);
        // Recover files after a page refresh, or when the service comes back.
        if (up && !wasUp) void refreshUploads();
        if (!up) setUploads([]);
        wasUp = up;
      } catch {
        if (!active) return;
        setService(false);
        wasUp = false;
      }
    };
    void check();
    const timer = setInterval(check, HEALTH_INTERVAL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshUploads]);

  return { service, setService, uploads, setUploads, refreshUploads };
}
