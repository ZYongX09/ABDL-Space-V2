import { useState, useRef, useCallback, useEffect } from 'react';
import { useNsfw } from '../contexts/NsfwContext';

export default function NsfwGuard({ src, backendNsfw, backendNsfwType, className, style, onClick, onLoad: onLoadProp, onError: onErrorProp, alt, loading }) {
  const { classify, loaded: modelReady, blurEnabled } = useNsfw();
  const [result, setResult] = useState(null); // { level, type, score }
  const [checking, setChecking] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const imgRef = useRef(null);
  const triedRef = useRef(false);

  // 后端标记优先
  useEffect(() => {
    if (backendNsfw === true) {
      setResult({ level: 'low', type: backendNsfwType || '敏感内容', score: 0 });
      setChecking(false);
    }
  }, [backendNsfw, backendNsfwType]);

  // 无后端标记 + 模型就绪 → 客户端检测
  useEffect(() => {
    if (backendNsfw !== undefined || triedRef.current || !modelReady) return;
    const img = imgRef.current;
    if (!img || !img.complete || !img.naturalWidth) return;
    triedRef.current = true;
    setChecking(true);
    classify(img).then(r => {
      if (r && r.level !== 'safe') setResult(r);
      setChecking(false);
    }).catch(() => setChecking(false));
  }, [backendNsfw, modelReady, classify]);

  const handleLoad = useCallback(() => {
    onLoadProp?.();
    if (backendNsfw === undefined && modelReady && !triedRef.current) {
      const img = imgRef.current;
      if (img && img.complete && img.naturalWidth) {
        triedRef.current = true;
        setChecking(true);
        classify(img).then(r => {
          if (r && r.level !== 'safe') setResult(r);
          setChecking(false);
        }).catch(() => setChecking(false));
      }
    }
  }, [onLoadProp, backendNsfw, modelReady, classify]);

  const handleError = useCallback(() => {
    onErrorProp?.();
    setChecking(false);
  }, [onErrorProp]);

  const isSensitive = result && result.level !== 'safe';
  const showBlur = isSensitive && blurEnabled && !revealed;
  const isLowSensitive = result?.level === 'low';

  return (
    <div style={{ position: 'relative', display: 'contents' }}>
      <img
        ref={imgRef}
        src={src}
        alt={alt || ''}
        loading={loading}
        crossOrigin="anonymous"
        className={className}
        style={{
          ...style,
          filter: showBlur ? 'blur(24px)' : undefined,
          boxShadow: (showBlur && isLowSensitive) ? '0 0 16px 4px rgba(255, 200, 0, 0.6), inset 0 0 16px 4px rgba(255, 200, 0, 0.3)' : undefined,
          borderRadius: style?.borderRadius || undefined,
          transition: 'filter 0.3s ease, box-shadow 0.3s ease',
        }}
        onLoad={handleLoad}
        onError={handleError}
        onClick={showBlur ? undefined : onClick}
      />
      {showBlur && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            background: 'rgba(0,0,0,0.4)',
            borderRadius: 'inherit',
            zIndex: 10,
            cursor: 'default',
          }}
          onClick={e => e.stopPropagation()}
        >
          <i className="fa-solid fa-shield-halved" style={{ fontSize: '1.1rem', color: '#fff' }} />
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 600,
            color: isLowSensitive ? 'rgba(255,220,100,0.95)' : 'rgba(255,255,255,0.9)',
            textAlign: 'center',
            lineHeight: 1.3,
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}>
            {result?.type || '敏感内容'}
          </span>
          <button
            onClick={e => { e.stopPropagation(); setRevealed(true); }}
            style={{
              fontSize: '0.6rem',
              padding: '3px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.12)',
              color: '#fff',
              cursor: 'pointer',
              backdropFilter: 'blur(4px)',
            }}
          >
            显示图片
          </button>
        </div>
      )}
      {checking && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            width: 14,
            height: 14,
            border: '2px solid rgba(255,255,255,0.3)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
            zIndex: 5,
          }}
        />
      )}
    </div>
  );
}
