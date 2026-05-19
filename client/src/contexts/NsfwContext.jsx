import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const NsfwContext = createContext({
  model: null,
  loading: false,
  enabled: false,
  error: null,
  classify: async () => null,
  toggle: () => {},
});

const STORAGE_KEY = 'abdl_nsfw_enabled';
const NSFW_LABELS = ['Porn', 'Hentai', 'Sexy'];

export function NsfwProvider({ children }) {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });
  const [error, setError] = useState(null);
  const queueRef = useRef([]);
  const runningRef = useRef(0);
  const MAX_CONCURRENT = 2;

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  // Load model when enabled
  useEffect(() => {
    if (!enabled || model) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Dynamic import TF.js + NSFWJS
        const tf = await import('@tensorflow/tfjs');
        const nsfwjs = await import('nsfwjs');
        if (cancelled) return;
        const loaded = await nsfwjs.load();
        if (cancelled) return;
        setModel(loaded);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, model]);

  // Process classification queue
  const processQueue = useCallback(async () => {
    if (runningRef.current >= MAX_CONCURRENT || queueRef.current.length === 0) return;
    runningRef.current++;
    const { imgElement, resolve } = queueRef.current.shift();
    try {
      if (!model) { resolve(null); return; }
      const predictions = await model.classify(imgElement);
      const nsfwScore = predictions
        .filter(p => NSFW_LABELS.includes(p.className))
        .reduce((sum, p) => sum + p.probability, 0);
      resolve(nsfwScore);
    } catch {
      resolve(null);
    } finally {
      runningRef.current--;
      processQueue();
    }
  }, [model]);

  const classify = useCallback((imgElement) => {
    if (!model || !enabled) return Promise.resolve(null);
    return new Promise(resolve => {
      queueRef.current.push({ imgElement, resolve });
      processQueue();
    });
  }, [model, enabled, processQueue]);

  return (
    <NsfwContext.Provider value={{ model, loading, enabled, error, classify, toggle }}>
      {children}
    </NsfwContext.Provider>
  );
}

export function useNsfw() {
  return useContext(NsfwContext);
}
