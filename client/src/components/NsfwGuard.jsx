import { useState, useRef, useCallback, useEffect } from 'react';
import { useNsfw } from '../contexts/NsfwContext';

export default function NsfwGuard({ src, backendNsfw, className, style, onClick, onLoad: onLoadProp, onError: onErrorProp, alt, loading }) {
  const { classify, loaded: modelReady, blurEnabled } = useNsfw();
  const [nsfw, setNsfw] = useState(false);
  const [checking, setChecking] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const imgRef = useRef(null);
  const triedRef = useRef(false);

  // 后端标记优先
  useEffect(() => {
    if (backendNsfw === true) {
      setNsfw(true);
      setChecking(false);
    }
  }, [backendNsfw]);

  // 无后端标记 + 模型就绪 → 客户端检测
  useEffect(() => {
    if (backendNsfw !== undefined || triedRef.current || !modelReady) return;
    const img = imgRef.current;
    if (!img || !img.complete || !img.naturalWidth) return;

    triedRef.current = true;
    setChecking(true);
    classify(img).then(score => {
      if (score != null && score >= 0.3) setNsfw(true);
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
        classify(img).then(score => {
          if (score != null && score >= 0.3) setNsfw(true);
          setChecking(false);
        }).catch(() => setChecking(false));
      }
    }
  }, [onLoadProp, backendNsfw, modelReady, classify]);

  const handleError = useCallback(() => {
    onErrorProp?.();
    setChecking(false);
  }, [onErrorProp]);

  // 是否显示模糊：检测为敏感 + 开关开启 + 用户未手动揭示
  const showBlur = nsfw && blurEnabled && !revealed;

  return (
    <div style={{ position: 'relative', display: 'contents' }}>
      <img
        ref={imgRef}
        src={src}
        alt={alt || ''}
        loading={loading}
        className={className}
        style={{
          ...style,
          filter: showBlur ? 'blur(24px)' : undefined,
          transition: 'filter 0.3s ease',
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
            gap: '8px',
            background: 'rgba(0,0,0,0.35)',
            borderRadius: 'inherit',
            zIndex: 10,
            cursor: 'default',
          }}
          onClick={e => e.stopPropagation()}
        >
          <i className="fa-solid fa-shield-halved" style={{ fontSize: '1.2rem', color: '#fff' }} />
          <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.9)', textAlign: 'center', lineHeight: 1.3 }}>
            可能包含敏感内容
          </span>
          <button
            onClick={e => { e.stopPropagation(); setRevealed(true); }}
            style={{
              fontSize: '0.65rem',
              padding: '4px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.5)',
              background: 'rgba(255,255,255,0.15)',
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
