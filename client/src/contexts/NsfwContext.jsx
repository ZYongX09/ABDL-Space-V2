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
  const modelRef = useRef(null);
  const loadPromiseRef = useRef(null); // 用于等待加载完成
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

  // 加载模型 — 使用 promise 缓存避免重复加载
  const loadModel = useCallback(async () => {
    // 已加载
    if (modelRef.current) return modelRef.current;
    // 正在加载 — 等待同一个 promise
    if (loadPromiseRef.current) return loadPromiseRef.current;

    const promise = (async () => {
      setLoading(true);
      setError(null);
      try {
        await import('@tensorflow/tfjs');
        const nsfwjs = await import('nsfwjs');
        const loadedModel = await nsfwjs.load();
        modelRef.current = loadedModel;
        setModel(loadedModel);
        setLoaded(true);
        return loadedModel;
      } catch (e) {
        setError(e.message);
        throw e;
      } finally {
        setLoading(false);
        loadPromiseRef.current = null;
      }
    })();

    loadPromiseRef.current = promise;
    return promise;
  }, []);

  // 分类队列处理
  const processQueue = useCallback(async () => {
    if (runningRef.current >= MAX_CONCURRENT || queueRef.current.length === 0) return;
    runningRef.current++;
    const { imgElement, resolve } = queueRef.current.shift();
    try {
      const m = modelRef.current;
      if (!m) { resolve(null); return; }
      const predictions = await m.classify(imgElement);
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
  }, []);

  // 对已加载的 <img> 元素分类
  const classify = useCallback((imgElement) => {
    const m = modelRef.current;
    if (!m) return Promise.resolve(null);
    return new Promise(resolve => {
      queueRef.current.push({ imgElement, resolve });
      processQueue();
    });
  }, [processQueue]);

  // 对 File 对象分类（上传时用）
  const classifyFile = useCallback((file) => {
    const m = modelRef.current;
    if (!m) return Promise.resolve(null);
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = async () => {
        try {
          const predictions = await m.classify(img);
          console.log('[NSFW] 分类结果:', file.name, predictions.map(p => `${p.className}: ${p.probability.toFixed(3)}`).join(', '));
          const nsfwScore = predictions
            .filter(p => NSFW_LABELS.includes(p.className))
            .reduce((sum, p) => sum + p.probability, 0);
          console.log('[NSFW] 敏感分数:', nsfwScore.toFixed(3), '阈值: 0.3', nsfwScore >= 0.3 ? '→ 敏感' : '→ 安全');
          resolve(nsfwScore >= 0.3);
        } catch (e) {
          console.error('[NSFW] 分类失败:', e);
          resolve(null);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }, []);

  return (
    <NsfwContext.Provider value={{ model, loading, loaded, error, blurEnabled, loadModel, classify, classifyFile, toggleBlur }}>
      {children}
    </NsfwContext.Provider>
  );
}

export function useNsfw() {
  return useContext(NsfwContext);
}
