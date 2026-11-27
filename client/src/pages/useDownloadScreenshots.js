import { useEffect, useState, useSyncExternalStore } from 'react';
import { chooseDownloadScreenshots, getDownloadScreenshots, getScreenshotBlob } from '../appDownloadScreenshots.js';
import { contentAccess } from '../contentAccess.js';
import { useAuth } from '../contexts/AuthContext';
import { getSiteAccess } from '../siteAccess.js';
import { shouldBlockSiteMedia } from '../siteMediaAccess.js';

function useSystemTheme() {
  const [theme, setTheme] = useState('dark');
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const change = () => setTheme(media.matches ? 'light' : 'dark');
    change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return theme;
}

function useScreenshotList() {
  const { user, loading, contentAccessSessionKey } = useAuth();
  const access = useSyncExternalStore(contentAccess.subscribe, contentAccess.getSnapshot, contentAccess.getSnapshot);
  const allowed = !loading && access.key === contentAccessSessionKey && access.state === 'open' && !shouldBlockSiteMedia(getSiteAccess(), user);
  const scope = allowed ? contentAccess.getEpoch() : null;
  const [state, setState] = useState(null);
  useEffect(() => {
    if (scope === null) return;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const timeout = window.setTimeout(cancel, 8000);
    window.addEventListener('auth-session-changing', cancel);
    getDownloadScreenshots(controller.signal).then(slots => {
      if (!controller.signal.aborted) setState({ scope, slots });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ scope, slots: null });
    }).finally(() => window.clearTimeout(timeout));
    return () => { cancel(); window.clearTimeout(timeout); window.removeEventListener('auth-session-changing', cancel); };
  }, [scope]);
  return { scope, slots: scope !== null && state?.scope === scope ? state.slots : null };
}

// 待验证的图片只加载一次，首屏、功能区、图廊与放大共用同一份 Blob URL。
function useScreenshot(slots, feature, theme, scope) {
  const [first, second] = chooseDownloadScreenshots(slots, feature, theme);
  const [ready, setReady] = useState(null);
  useEffect(() => {
    if (scope === null || !first) return;
    let stopped = false;
    let url;
    let pending;
    const release = () => { if (url) { URL.revokeObjectURL(url); url = undefined; } };
    const stop = () => { stopped = true; pending?.abort(); release(); };
    window.addEventListener('auth-session-changing', stop);
    async function load() {
      for (const image of [first, second]) {
        if (!image || stopped) break;
        const controller = new AbortController();
        pending = controller;
        const timeout = window.setTimeout(() => controller.abort(), 8000);
        try {
          const blob = await getScreenshotBlob(image.url, controller.signal);
          if (stopped) return;
          url = URL.createObjectURL(blob);
          const probe = new Image();
          probe.src = url;
          await probe.decode();
          if (stopped) return;
          if (controller.signal.aborted) { release(); continue; }
          setReady({ first, second, scope, image: { ...image, url } });
          return;
        } catch { release(); }
        finally { window.clearTimeout(timeout); pending = undefined; }
      }
    }
    void load();
    return () => { stop(); window.removeEventListener('auth-session-changing', stop); };
  }, [first, second, scope]);
  return scope !== null && ready?.scope === scope && ready.first === first && ready.second === second ? ready.image : null;
}

export function useDownloadScreenshots(theme) {
  const systemTheme = useSystemTheme();
  const effective = theme === 'system' ? systemTheme : theme;
  const { slots, scope } = useScreenshotList();
  const community = useScreenshot(slots, 'community', effective, scope);
  const rankings = useScreenshot(slots, 'rankings', effective, scope);
  const reading = useScreenshot(slots, 'reading', effective, scope);
  return { community, rankings, reading };
}