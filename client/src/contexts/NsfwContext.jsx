import { createContext, useContext, useState, useCallback, useRef } from 'react';

const NsfwContext = createContext({
  model: null,
  loading: false,
  loaded: false,
  error: null,
  blurEnabled: true,
  loadModel: async () => {},
  classify: async () => null,
  classifyFile: async () => null,
  toggleBlur: () => {},
});

const STORAGE_KEY = 'abdl_nsfw_blur';
const NSFW_LABELS = ['Porn', 'Hentai', 'Sexy'];

export function NsfwProvider({ children }) {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [blurEnabled, setBlurEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'false'; } catch { return true; }
  });
  const queueRef = useRef([]);
  const runningRef = useRef(0);
  const MAX_CONCURRENT = 2;

  const toggleBlur = useCallback(() => {
    setBlurEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  // 加载模型（上传图片时自动调用）
  const loadModel = useCallback(async () => {
    if (model || loading) return;
    setLoading(true);
    setError(null);
    try {
      await import('@tensorflow/tfjs');
      const nsfwjs = await import('nsfwjs');
      const loadedModel = await nsfwjs.load();
      setModel(loadedModel);
      setLoaded(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [model, loading]);

  // 分类队列处理
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

  // 对已加载的 <img> 元素分类
  const classify = useCallback((imgElement) => {
    if (!model) return Promise.resolve(null);
    return new Promise(resolve => {
      queueRef.current.push({ imgElement, resolve });
      processQueue();
    });
  }, [model, processQueue]);

  // 对 File 对象分类（上传时用）
  const classifyFile = useCallback((file) => {
    if (!model) return Promise.resolve(null);
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = async () => {
        try {
          const predictions = await model.classify(img);
          const nsfwScore = predictions
            .filter(p => NSFW_LABELS.includes(p.className))
            .reduce((sum, p) => sum + p.probability, 0);
          resolve(nsfwScore >= 0.6);
        } catch {
          resolve(null);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }, [model]);

  return (
    <NsfwContext.Provider value={{ model, loading, loaded, error, blurEnabled, loadModel, classify, classifyFile, toggleBlur }}>
      {children}
    </NsfwContext.Provider>
  );
}

export function useNsfw() {
  return useContext(NsfwContext);
}
