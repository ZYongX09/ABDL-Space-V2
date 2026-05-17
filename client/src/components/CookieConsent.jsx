import { useState, useEffect } from 'react';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('cookie_consent')) {
      // Small delay so it doesn't flash on instant navigations
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const accept = () => {
    localStorage.setItem('cookie_consent', JSON.stringify({ accepted: true, date: new Date().toISOString() }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 90,
        padding: '0 16px 16px',
        animation: 'slideUp 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 600,
          margin: '0 auto',
          background: 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.4)',
          borderRadius: 'var(--radius)',
          padding: '16px 20px',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <i className="fa-solid fa-cookie-bite" style={{ color: 'var(--primary-dark)', fontSize: '1.1rem', flexShrink: 0 }} />
          <p style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-light)', lineHeight: 1.5, margin: 0, minWidth: 180 }}>
            我们使用 Cookie 来改善您的浏览体验。继续使用即表示您同意我们的{' '}
            <a href="/cookies" style={{ color: 'var(--primary-dark)', textDecoration: 'underline' }}>Cookie 政策</a>。
          </p>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <a
              href="/cookies"
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              了解更多
            </a>
            <button
              className="btn btn-primary btn-sm"
              onClick={accept}
              style={{ fontSize: '0.8rem', padding: '6px 14px' }}
            >
              接受
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
