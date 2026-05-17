import { useState, useRef, useCallback } from 'react';

const THRESHOLD = 60;
const MAX_PULL = 120;

export default function PullToRefresh({ onRefresh, children }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef(null);

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const handleTouchStart = useCallback((e) => {
    if (refreshing) return;
    const el = containerRef.current;
    if (el && el.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, [refreshing]);

  const handleTouchMove = useCallback((e) => {
    if (!pulling.current || refreshing) return;
    const el = containerRef.current;
    if (el && el.scrollTop > 0) {
      pulling.current = false;
      setPullDistance(0);
      return;
    }
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) {
      // Rubber-band effect
      const dist = Math.min(dy * 0.5, MAX_PULL);
      setPullDistance(dist);
      if (dist > 10) e.preventDefault();
    }
  }, [refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (pullDistance >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullDistance(THRESHOLD * 0.6);
      try {
        await onRefresh?.();
      } catch { /* ignore */ }
      setRefreshing(false);
    }
    setPullDistance(0);
  }, [pullDistance, refreshing, onRefresh]);

  if (!isMobile) return <>{children}</>;

  const progress = Math.min(pullDistance / THRESHOLD, 1);
  const rotation = pullDistance * 3; // rotate based on pull distance

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ position: 'relative' }}
    >
      {/* Pull indicator */}
      <div
        style={{
          position: 'absolute',
          top: -40,
          left: 0,
          right: 0,
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translateY(${pullDistance}px)`,
          transition: pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          opacity: progress,
          zIndex: 5,
        }}
      >
        {refreshing ? (
          <div className="spinner" style={{ width: 24, height: 24, borderWidth: 2 }} />
        ) : (
          <i
            className="fa-solid fa-arrow-down"
            style={{
              color: 'var(--primary-dark)',
              fontSize: '1rem',
              transform: `rotate(${rotation}deg)`,
              transition: pullDistance === 0 ? 'transform 0.3s ease' : 'none',
            }}
          />
        )}
      </div>

      {/* Content */}
      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : 'translateY(0)',
          transition: pullDistance === 0 ? 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
}
