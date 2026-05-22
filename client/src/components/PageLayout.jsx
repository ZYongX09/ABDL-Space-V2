import { useEffect, useRef } from 'react';

export default function PageLayout({ hero, children }) {
  const containerRef = useRef(null);

  useEffect(() => {
    // 页面入场时给所有 .card 添加交错动画
    const container = containerRef.current;
    if (!container) return;

    const cards = container.querySelectorAll('.card');
    cards.forEach((card, i) => {
      card.style.animationDelay = `${i * 0.06}s`;
      card.classList.add('miui-card-in');
    });

    // 清理（卸载时移除动画类，避免切换页面时残留）
    return () => {
      cards.forEach(card => card.classList.remove('miui-card-in'));
    };
  }, []);

  return (
    <div ref={containerRef} className="miui-page-in">
      {hero && (
        <div className="hero-card miui-card-in" style={{ animationDelay: '0s' }}>
          <div className="flex items-center gap-3 relative z-10">
            {hero.icon && (
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl miui-float"
                style={{ background: 'rgba(255,255,255,0.3)', color: 'var(--hero-text)' }}
              >
                <i className={`fa-solid ${hero.icon}`} />
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--hero-text)' }}>{hero.title}</h2>
              {hero.subtitle && (
                <p className="text-sm mt-0.5" style={{ color: 'var(--hero-text)', opacity: 0.8 }}>{hero.subtitle}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
