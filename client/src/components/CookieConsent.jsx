import { useState, useEffect } from 'react';
import { loadBaiduAnalytics } from '../utils/baiduAnalytics';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) {
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    } else {
      // 已有同意记录，加载百度统计
      try {
        const data = JSON.parse(consent);
        if (data.accepted) loadBaiduAnalytics();
      } catch {}
    }
  }, []);

  const accept = () => {
    localStorage.setItem('cookie_consent', JSON.stringify({ accepted: true, date: new Date().toISOString() }));
    loadBaiduAnalytics();
    setVisible(false);
  };

  const reject = () => {
    localStorage.setItem('cookie_consent', JSON.stringify({ accepted: false, date: new Date().toISOString() }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="cookie-consent-overlay"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 110,
        padding: '0 16px 16px',
        paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px))',
        animation: 'slideUp 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 600,
          margin: '0 auto',
          background: 'var(--bg-card)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '20px',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.1)',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <i className="fa-solid fa-cookie-bite" style={{ color: 'var(--primary-dark)', fontSize: '1.2rem', marginTop: 2, flexShrink: 0 }} />
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>
              Cookie 使用申请
            </h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-light)', lineHeight: 1.6, margin: 0 }}>
              本站使用 Cookie 及 localStorage 存储技术来保障基本功能（登录、主题偏好），
              并使用百度统计来了解网站访问情况以改进服务。
              您可以选择接受或拒绝非必要的 Cookie。
              详情请查阅我们的{' '}
              <a href="/cookies" style={{ color: 'var(--primary-dark)', textDecoration: 'underline' }}>Cookie 政策</a>。
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={reject}
            style={{ fontSize: '0.82rem', padding: '7px 18px' }}
          >
            拒绝
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={accept}
            style={{ fontSize: '0.82rem', padding: '7px 18px' }}
          >
            <i className="fa-solid fa-check mr-1" /> 接受
          </button>
        </div>
      </div>
    </div>
  );
}
