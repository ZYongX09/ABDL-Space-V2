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

// 分类结果: { level: 'safe'|'low'|'high', type: string|null, score: number }
// level: safe=安全, low=低敏感(模糊), high=高敏感(禁止)
function classifyPredictions(predictions) {
  const get = (name) => predictions.find(p => p.className === name)?.probability || 0;

  const porn = get('Porn');
  const hentai = get('Hentai');
  const sexy = get('Sexy');
  const neutral = get('Neutral');
  const drawing = get('Drawing');


  // 高敏感: Porn ≥ 0.7 → 禁止上传
  if (porn >= 0.7) {
    return { level: 'high', type: '色情内容', score: porn };
  }

  // 高敏感: Hentai ≥ 0.7 → 禁止上传
  if (hentai >= 0.7) {
    return { level: 'high', type: '成人动漫内容', score: hentai };
  }

  // 高敏感: Sexy ≥ 0.8 → 禁止上传
  if (sexy >= 0.8) {
    return { level: 'high', type: '擦边内容', score: sexy };
  }

  // 低敏感: Porn ≥ 0.5
  if (porn >= 0.5) {
    return { level: 'low', type: '疑似色情内容', score: porn };
  }

  // 低敏感: Hentai ≥ 0.5
  if (hentai >= 0.5) {
    return { level: 'low', type: '疑似成人动漫', score: hentai };
  }

  // 低敏感: Sexy ≥ 0.5
  if (sexy >= 0.5) {
    return { level: 'low', type: '擦边内容', score: sexy };
  }

  return { level: 'safe', type: null, score: 0 };
}

export function NsfwProvider({ children }) {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [blurEnabled, setBlurEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== 'false'; } catch { return true; }
  });
  const modelRef = useRef(null);
  const loadPromiseRef = useRef(null);
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

  const loadModel = useCallback(async () => {
    if (modelRef.current) return modelRef.current;
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

  const processQueue = useCallback(async () => {
    if (runningRef.current >= MAX_CONCURRENT || queueRef.current.length === 0) return;
    runningRef.current++;
    const { imgElement, resolve } = queueRef.current.shift();
    try {
      const m = modelRef.current;
      if (!m) { resolve(null); return; }
      const predictions = await m.classify(imgElement);
      resolve(classifyPredictions(predictions));
    } catch {
      resolve(null);
    } finally {
      runningRef.current--;
      processQueue();
    }
  }, []);

  const classify = useCallback((imgElement) => {
    const m = modelRef.current;
    if (!m) return Promise.resolve(null);
    return new Promise(resolve => {
      queueRef.current.push({ imgElement, resolve });
      processQueue();
    });
  }, [processQueue]);

  // 对 File 对象分类（上传时用）— 返回分级结果
  const classifyFile = useCallback((file) => {
    const m = modelRef.current;
    if (!m) return Promise.resolve(null);
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = async () => {
        try {
          const predictions = await m.classify(img);
          resolve(classifyPredictions(predictions));
        } catch (e) {
          console.log('[NSFW] 分类失败:', e);
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
