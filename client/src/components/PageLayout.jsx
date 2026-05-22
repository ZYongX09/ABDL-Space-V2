export default function PageLayout({ hero, children }) {
  return (
    <div>
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
