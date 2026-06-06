import { useEffect, useRef } from 'react';

export default function PageLayout({ hero, children }) {
  const containerRef = useRef(null);

  // 滚动触发入场动画 — MIUI 12 风格
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            // 使用元素在视口中的位置计算延迟，营造自然的交错感
            const rect = el.getBoundingClientRect();
            const viewportCenter = window.innerHeight / 2;
            const distFromCenter = Math.abs(rect.top - viewportCenter);
            const delay = Math.min(distFromCenter * 0.0003, 0.15);
            el.style.animationDelay = `${delay}s`;
            el.classList.add('miui-card-in');
            observer.unobserve(el);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );

    // 观察所有 .card 子元素
    const cards = container.querySelectorAll('.card');
    cards.forEach(card => {
      // 首屏内的卡片立即动画，其余等滚动触发
      const rect = card.getBoundingClientRect();
      if (rect.top < window.innerHeight + 50) {
        const idx = Array.from(cards).indexOf(card);
        card.style.animationDelay = `${idx * 0.05}s`;
        card.classList.add('miui-card-in');
      } else {
        card.style.opacity = '0';
        observer.observe(card);
      }
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="miui-page-in">
      {hero && (
        <div className="hero-card">
          <div className="flex items-center gap-3 relative z-10">
            {hero.icon && (
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl"
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
      <div className="page-container">
        {children}
      </div>
    </div>
  );
}
