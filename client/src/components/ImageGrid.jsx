import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

function ImageItem({ url, onClick, overlay }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  return (
    <div className="img-grid-item" onClick={onClick}>
      {!loaded && !error && (
        <div className="img-grid-loading">
          <div className="img-grid-loading-spinner" />
        </div>
      )}
      {error && (
        <div className="img-grid-error">
          <i className="fa-solid fa-image" />
        </div>
      )}
      <img
        src={url}
        alt=""
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        style={{ opacity: loaded ? 1 : 0 }}
      />
      {overlay}
    </div>
  );
}

function MobileLightbox({ urls, index, onClose, onNavigate }) {
  const imgRef = useRef(null);
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const touchRef = useRef({
    initialDistance: 0,
    initialScale: 1,
    lastX: 0,
    lastY: 0,
    startX: 0,
    isPinching: false,
    isSwiping: false,
  });

  const resetTransform = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // 切换图片时重置缩放
  useEffect(() => {
    resetTransform();
  }, [index, resetTransform]);

  // 双指缩放
  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchRef.current.initialDistance = Math.hypot(dx, dy);
      touchRef.current.initialScale = scale;
      touchRef.current.isPinching = true;
    } else if (e.touches.length === 1 && scale <= 1) {
      touchRef.current.startX = e.touches[0].clientX;
      touchRef.current.lastX = e.touches[0].clientX;
      touchRef.current.isSwiping = true;
    }
  }, [scale]);

  const handleTouchMove = useCallback((e) => {
    const t = touchRef.current;
    if (t.isPinching && e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.hypot(dx, dy);
      const newScale = Math.max(1, Math.min(5, t.initialScale * (distance / t.initialDistance)));
      setScale(newScale);
    } else if (t.isSwiping && e.touches.length === 1 && scale <= 1) {
      const dx = e.touches[0].clientX - t.lastX;
      t.lastX = e.touches[0].clientX;
      setTranslate(prev => ({ ...prev, x: prev.x + dx }));
    }
  }, [scale]);

  const handleTouchEnd = useCallback((e) => {
    const t = touchRef.current;
    if (t.isPinching) {
      t.isPinching = false;
      if (scale < 1.1) {
        resetTransform();
      }
    }
    if (t.isSwiping && scale <= 1) {
      t.isSwiping = false;
      const totalDx = t.lastX - t.startX;
      if (Math.abs(totalDx) > 80) {
        if (totalDx > 0) {
          onNavigate(-1); // 左滑 → 上一张
        } else {
          onNavigate(1); // 右滑 → 下一张
        }
      }
      resetTransform();
    }
  }, [scale, onNavigate, resetTransform]);

  // 双击缩放
  const lastTapRef = useRef(0);
  const handleDoubleTap = useCallback((e) => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      e.preventDefault();
      if (scale > 1) {
        resetTransform();
      } else {
        setScale(2.5);
      }
    }
    lastTapRef.current = now;
  }, [scale, resetTransform]);

  // 捏合缩放（PC 触控板/鼠标滚轮）
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(1, Math.min(5, prev * delta)));
  }, []);

  return (
    <div
      ref={containerRef}
      className="lightbox-mobile"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleDoubleTap}
      onWheel={handleWheel}
    >
      {/* 关闭按钮 */}
      <button className="lightbox-mobile-close" onClick={(e) => { e.stopPropagation(); onClose(); }}>
        <i className="fa-solid fa-xmark" />
      </button>

      {/* 计数器 */}
      {urls.length > 1 && (
        <div className="lightbox-mobile-counter">
          {index + 1} / {urls.length}
        </div>
      )}

      {/* 图片 */}
      <img
        ref={imgRef}
        src={urls[index]}
        alt=""
        draggable={false}
        style={{
          transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
          transition: touchRef.current.isPinching ? 'none' : 'transform 0.2s ease',
          touchAction: 'none',
        }}
      />

      {/* 提示 */}
      {scale <= 1 && (
        <div className="lightbox-mobile-hint">
          双指缩放 · 双击放大 · 左右滑动切换
        </div>
      )}
    </div>
  );
}

export default function ImageGrid({ images = [] }) {
  const [lightbox, setLightbox] = useState(null);
  if (!images.length) return null;

  const urls = images.map(img => typeof img === 'string' ? img : img?.image_url || img?.src || '');
  const count = Math.min(urls.length, 4);
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const gridClass = count === 1 ? 'img-grid-1'
    : count === 2 ? 'img-grid-2'
    : count === 3 ? 'img-grid-3'
    : 'img-grid-4';

  const handleNavigate = (dir) => {
    setLightbox(prev => {
      const next = prev + dir;
      if (next < 0) return urls.length - 1;
      if (next >= urls.length) return 0;
      return next;
    });
  };

  return (
    <>
      <div className={`img-grid ${gridClass}`}>
        {urls.slice(0, 4).map((url, i) => (
          <ImageItem
            key={i}
            url={url}
            onClick={() => setLightbox(i)}
            overlay={
              i === 3 && urls.length > 4
                ? <div className="img-grid-more">+{urls.length - 4}</div>
                : null
            }
          />
        ))}
      </div>

      {lightbox !== null && createPortal(
        isMobile ? (
          <MobileLightbox
            urls={urls}
            index={lightbox}
            onClose={() => setLightbox(null)}
            onNavigate={handleNavigate}
          />
        ) : (
          <div className="img-lightbox" onClick={() => setLightbox(null)}>
            <button className="img-lightbox-close" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
              <i className="fa-solid fa-xmark" />
            </button>
            <img src={urls[lightbox]} alt="" />
            {urls.length > 1 && (
              <div className="img-lightbox-nav">
                <button onClick={e => { e.stopPropagation(); handleNavigate(-1); }}>
                  <i className="fa-solid fa-chevron-left" />
                </button>
                <span>{lightbox + 1} / {urls.length}</span>
                <button onClick={e => { e.stopPropagation(); handleNavigate(1); }}>
                  <i className="fa-solid fa-chevron-right" />
                </button>
              </div>
            )}
          </div>
        ),
        document.body
      )}
    </>
  );
}
