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
  const [target, setTarget] = useState('');
  const [isPhoneUser, setIsPhoneUser] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    const isMobileSite = host.startsWith('m.');
    const isMainSite = !isMobileSite;
    const path = window.location.pathname;

    const skipPaths = ['/oauth/', '/auth/nbw/callback'];
    if (skipPaths.some(p => path.startsWith(p))) return;

    if (isMainSite && isPhone()) {
      setShow(true);
      setIsPhoneUser(true);
      setTarget('https://m.abdl-space.top' + window.location.pathname + window.location.search);
    } else if (isMobileSite && isDesktopOrTablet()) {
      setShow(true);
      setIsPhoneUser(false);
      setTarget('https://abdl-space.top' + window.location.pathname + window.location.search);
    }
  }, []);

  if (!show) return null;

  return (
    <div className="redirect-banner">
      <span className="redirect-banner-text">
        {isPhoneUser ? '推荐使用移动版，体验更佳' : '推荐使用桌面版，功能更完整'}
      </span>
      <div className="redirect-banner-actions">
        <a href={target} className="redirect-banner-link">
          {isPhoneUser ? '前往移动版' : '前往桌面版'} <i className="fa-solid fa-arrow-right" />
        </a>
        <button className="redirect-banner-close" onClick={() => setShow(false)}>
          <i className="fa-solid fa-xmark" />
        </button>
      </div>
    </div>
  );
}
