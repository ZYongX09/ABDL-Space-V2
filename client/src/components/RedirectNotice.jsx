import { useState, useEffect } from 'react';
import './RedirectNotice.css';

function isPhone() {
  return /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    && !/iPad|Tablet/i.test(navigator.userAgent);
}

function isDesktopOrTablet() {
  return !isPhone();
}

export default function RedirectNotice() {
  const [show, setShow] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [target, setTarget] = useState('');

  useEffect(() => {
    const host = window.location.hostname;
    const isMobileSite = host.startsWith('m.');
    const isMainSite = !isMobileSite;
    const path = window.location.pathname;

    // 这些路径必须留在主站处理，不跳转
    const skipPaths = ['/oauth/', '/auth/nbw/callback'];
    if (skipPaths.some(p => path.startsWith(p))) return;

    if (isMainSite && isPhone()) {
      setShow(true);
      setTarget('https://m.abdl-space.top' + window.location.pathname + window.location.search);
    } else if (isMobileSite && isDesktopOrTablet()) {
      setShow(true);
      setTarget('https://abdl-space.top' + window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    if (!show) return;
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(t);
          window.location.href = target;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [show, target]);

  if (!show) return null;

  const isPhoneUser = !window.location.hostname.startsWith('m.');

  return (
    <div className="redirect-overlay">
      <div className="redirect-modal">
        <div className="redirect-icon">
          <i className={`fa-solid ${isPhoneUser ? 'fa-mobile-screen' : 'fa-desktop'}`} />
        </div>
        <h2 className="redirect-title">
          {isPhoneUser ? '推荐使用移动版' : '推荐使用桌面版'}
        </h2>
        <p className="redirect-desc">
          {isPhoneUser
            ? '我们为您准备了专属移动版，在手机上浏览体验更佳。即将为您跳转…'
            : '您正在使用桌面设备，桌面版拥有更完整的功能和更好的体验。即将为您跳转…'}
        </p>
        <button className="redirect-btn" onClick={() => { window.location.href = target; }}>
          {isPhoneUser ? '立即前往移动版' : '立即前往桌面版'}
          <span className="redirect-countdown">{countdown}s</span>
        </button>
        <button className="redirect-btn" style={{ background: 'var(--input-bg)', color: 'var(--text)', marginTop: 8 }} onClick={() => setShow(false)}>
          留在当前版本
        </button>
        <p className="redirect-hint">
          {countdown} 秒后自动跳转
        </p>
      </div>
    </div>
  );
}
