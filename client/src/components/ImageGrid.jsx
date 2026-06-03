import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import NsfwGuard from './NsfwGuard';

function ImageItem({ url, onClick, overlay, isNsfw, nsfwType }) {
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
      <NsfwGuard
        src={url}
        backendNsfw={isNsfw}
        backendNsfwType={nsfwType}
        alt=""
        loading="lazy"
        style={{ opacity: loaded ? 1 : 0 }}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
      {overlay}
    </div>
  );
}

function MobileLightbox({ urls, index, onClose, onNavigate }) {
  const containerRef = useRef(null);
  const stateRef = useRef({
    scale: 1,
    x: 0,
    y: 0,
    // pinch
    initialDistance: 0,
    initialScale: 1,
    pinchMidX: 0,
    pinchMidY: 0,
    pinchStartX: 0,
    pinchStartY: 0,
    isPinching: false,
    // pan / swipe
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    isPanning: false,
    isSwiping: false,
    // velocity tracking
    velocityX: 0,
    velocityY: 0,
    lastMoveTime: 0,
    // double tap
    lastTapTime: 0,
    animFrame: null,
  });
  const [, forceUpdate] = useState(0);

  const applyTransform = useCallback(() => {
    forceUpdate(n => n + 1);
  }, []);

  const resetTransform = useCallback(() => {
    const s = stateRef.current;
    s.scale = 1;
    s.x = 0;
    s.y = 0;
    s.velocityX = 0;
    s.velocityY = 0;
    if (s.animFrame) { cancelAnimationFrame(s.animFrame); s.animFrame = null; }
    applyTransform();
  }, [applyTransform]);

  // 切换图片时重置
  useEffect(() => {
    resetTransform();
  }, [index, resetTransform]);

  // 惯性动画
  const startInertia = useCallback(() => {
    const s = stateRef.current;
    if (s.animFrame) cancelAnimationFrame(s.animFrame);
    const friction = 0.92;
    const minV = 0.5;
    const step = () => {
      s.velocityX *= friction;
      s.velocityY *= friction;
      s.x += s.velocityX;
      s.y += s.velocityY;
      applyTransform();
      if (Math.abs(s.velocityX) > minV || Math.abs(s.velocityY) > minV) {
        s.animFrame = requestAnimationFrame(step);
      } else {
        s.animFrame = null;
      }
    };
    s.animFrame = requestAnimationFrame(step);
  }, [applyTransform]);

  useEffect(() => {
    return () => {
      if (stateRef.current.animFrame) cancelAnimationFrame(stateRef.current.animFrame);
    };
  }, []);

  // Touch handlers via ref to avoid re-registering listeners
  const handleTouchStartRef = useRef(null);
  const handleTouchMoveRef = useRef(null);
  const handleTouchEndRef = useRef(null);

  handleTouchStartRef.current = (e) => {
    const s = stateRef.current;
    const now = Date.now();

    // 不阻止按钮的触摸事件
    if (e.target.closest('button')) return;

    e.preventDefault();

    if (e.touches.length === 2) {
      // Pinch start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      s.initialDistance = Math.hypot(dx, dy);
      s.initialScale = s.scale;
      s.pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      s.pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      s.pinchStartX = s.x;
      s.pinchStartY = s.y;
      s.isPinching = true;
      s.isSwiping = false;
      s.isPanning = false;
      if (s.animFrame) { cancelAnimationFrame(s.animFrame); s.animFrame = null; }
    } else if (e.touches.length === 1) {
      // Double tap detection
      if (now - s.lastTapTime < 300) {
        e.preventDefault();
        if (s.scale > 1) {
          resetTransform();
        } else {
          // Zoom to 2x at tap position
          const rect = containerRef.current?.getBoundingClientRect();
          const tapX = e.touches[0].clientX - (rect ? rect.left + rect.width / 2 : 0);
          const tapY = e.touches[0].clientY - (rect ? rect.top + rect.height / 2 : 0);
          s.scale = 2;
          s.x = -tapX;
          s.y = -tapY;
          applyTransform();
        }
        s.lastTapTime = 0;
        return;
      }
      s.lastTapTime = now;

      s.startX = e.touches[0].clientX;
      s.startY = e.touches[0].clientY;
      s.lastX = e.touches[0].clientX;
      s.lastY = e.touches[0].clientY;
      s.lastMoveTime = now;
      s.velocityX = 0;
      s.velocityY = 0;
      if (s.animFrame) { cancelAnimationFrame(s.animFrame); s.animFrame = null; }

      if (s.scale > 1) {
        s.isPanning = true;
        s.isSwiping = false;
      } else {
        s.isSwiping = true;
        s.isPanning = false;
      }
    }
  };

  handleTouchMoveRef.current = (e) => {
    e.preventDefault();
    const s = stateRef.current;

    if (s.isPinching && e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.hypot(dx, dy);
      const ratio = distance / s.initialDistance;
      const newScale = Math.max(1, Math.min(5, s.initialScale * ratio));

      // Center zoom on pinch midpoint
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = containerRef.current?.getBoundingClientRect();
      const containerMidX = rect ? rect.left + rect.width / 2 : 0;
      const containerMidY = rect ? rect.top + rect.height / 2 : 0;

      // Adjust translate to keep pinch midpoint stable
      const scaleRatio = newScale / s.initialScale;
      const fingerOffsetX = s.pinchMidX - containerMidX;
      const fingerOffsetY = s.pinchMidY - containerMidY;
      s.x = s.pinchStartX * scaleRatio + fingerOffsetX * (1 - scaleRatio) + (midX - s.pinchMidX);
      s.y = s.pinchStartY * scaleRatio + fingerOffsetY * (1 - scaleRatio) + (midY - s.pinchMidY);
      s.scale = newScale;
      applyTransform();
    } else if (s.isPanning && e.touches.length === 1) {
      const dx = e.touches[0].clientX - s.lastX;
      const dy = e.touches[0].clientY - s.lastY;
      const now = Date.now();
      const dt = now - s.lastMoveTime || 1;
      s.velocityX = dx / dt * 16; // normalize to ~60fps
      s.velocityY = dy / dt * 16;
      s.x += dx;
      s.y += dy;
      s.lastX = e.touches[0].clientX;
      s.lastY = e.touches[0].clientY;
      s.lastMoveTime = now;
      applyTransform();
    } else if (s.isSwiping && e.touches.length === 1) {
      const dx = e.touches[0].clientX - s.lastX;
      s.lastX = e.touches[0].clientX;
      s.lastY = e.touches[0].clientY;
      s.x += dx;
      applyTransform();
    }
  };

  handleTouchEndRef.current = (e) => {
    e.preventDefault();
    const s = stateRef.current;

    if (s.isPinching) {
      s.isPinching = false;
      if (s.scale < 1.1) {
        resetTransform();
      } else {
        applyTransform();
      }
      return;
    }

    if (s.isPanning) {
      s.isPanning = false;
      if (s.scale < 1.1) {
        resetTransform();
      } else {
        // Start inertia
        startInertia();
      }
      return;
    }

    if (s.isSwiping) {
      s.isSwiping = false;
      const totalDx = s.lastX - s.startX;
      if (Math.abs(totalDx) > 80) {
        onNavigate(totalDx > 0 ? -1 : 1);
      }
      resetTransform();
    }
  };

  // Register listeners with passive: false
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onStart = (e) => handleTouchStartRef.current?.(e);
    const onMove = (e) => handleTouchMoveRef.current?.(e);
    const onEnd = (e) => handleTouchEndRef.current?.(e);
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
    };
  }, []);

  // Wheel zoom for PC
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const s = stateRef.current;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    s.scale = Math.max(1, Math.min(5, s.scale * delta));
    if (s.scale <= 1.05) { s.x = 0; s.y = 0; s.scale = 1; }
    applyTransform();
  }, [applyTransform]);

  // BUG-674: Register wheel with passive: false (React onWheel is passive)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const s = stateRef.current;
  const isTransitioning = !s.isPinching && !s.isPanning && !s.isSwiping;

  return (
    <div
      ref={containerRef}
      className="lightbox-mobile"
      style={{ touchAction: 'none' }}
    >
      {/* 关闭按钮 */}
      <button className="lightbox-mobile-close" onPointerDown={(e) => { e.stopPropagation(); onClose(); }}>
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
        src={urls[index]}
        alt=""
        draggable={false}
        style={{
          transform: `translate(${s.x}px, ${s.y}px) scale(${s.scale})`,
          transition: isTransitioning ? 'transform 0.2s ease' : 'none',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      />

      {/* 提示 */}
      {s.scale <= 1 && (
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

  const imageItems = images.map(img => {
    if (typeof img === 'string') return { url: img, isNsfw: undefined, nsfwType: undefined };
    return { url: img?.image_url || img?.src || '', isNsfw: img?.is_nsfw, nsfwType: img?.nsfw_type };
  });
  const urls = imageItems.map(i => i.url);
  const count = Math.min(urls.length, 4);
  // BUG-679: Responsive isMobile using matchMedia
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 768px)');
    const handler = (e) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, []);

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
        {imageItems.slice(0, 4).map((item, i) => (
          <ImageItem
            key={i}
            url={item.url}
            isNsfw={item.isNsfw}
            nsfwType={item.nsfwType}
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
