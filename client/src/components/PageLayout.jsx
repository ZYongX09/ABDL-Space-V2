import { useEffect, useRef } from 'react';

export default function PageLayout({ hero, children }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const cards = container.querySelectorAll('.card');
    cards.forEach((card, i) => {
      card.style.animationDelay = `${i * 0.05}s`;
      card.classList.add('miui-card-in');
    });
    return () => {
      cards.forEach(card => {
        card.classList.remove('miui-card-in');
        card.style.animationDelay = '';
      });
    };
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
      {children}
    </div>
  );
}
