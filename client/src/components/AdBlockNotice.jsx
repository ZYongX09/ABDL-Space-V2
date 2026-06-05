import { useState, useEffect } from 'react';

export default function AdBlockNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('adblock_detected') === '1') {
        const dismissed = sessionStorage.getItem('adblock_dismissed');
        if (!dismissed) setShow(true);
      }
    } catch {}
  }, []);

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100000,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '12px', padding: '10px 16px',
      background: 'var(--primary, #A8D8F0)', color: '#fff',
      fontSize: '13px', fontWeight: 500,
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
    }}>
      <span style={{ flex: 1 }}>
        <i className="fa-solid fa-shield-halved" style={{ marginRight: 8 }} />
        检测到广告拦截器，部分功能（统计、字体图标）可能无法正常使用。建议将本站加入白名单。
      </span>
      <button
        onClick={() => { setShow(false); try { sessionStorage.setItem('adblock_dismissed', '1'); } catch {} }}
        style={{
          flexShrink: 0, width: 28, height: 28,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, border: 'none',
          background: 'rgba(255,255,255,0.15)', color: '#fff',
          cursor: 'pointer', fontSize: 14,
        }}
      >
        <i className="fa-solid fa-xmark" />
      </button>
    </div>
  );
}
