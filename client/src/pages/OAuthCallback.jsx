import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const wrap = { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.75rem', boxSizing: 'border-box' };
const box = { width: '100%', maxWidth: 520, textAlign: 'center' };

export default function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const [tried, setTried] = useState(false);
  const [failed, setFailed] = useState(false);

  const code = searchParams.get('code');
  const state = searchParams.get('state') || '';
  const error = searchParams.get('error');

  /* 跳过开场动画 */
  useEffect(() => {
    try { sessionStorage.setItem('intro_played', '1'); } catch {}
    const ph = document.getElementById('intro-placeholder');
    if (ph) ph.remove();
    const overlay = document.getElementById('intro-overlay');
    if (overlay) overlay.remove();
  }, []);

  const [customSchemeUrl, setCustomSchemeUrl] = useState('');
  const [appName, setAppName] = useState('应用');

  useEffect(() => {
    const storedScheme = sessionStorage.getItem('oauth_redirect_scheme') || 'abdl-space';
    sessionStorage.removeItem('oauth_redirect_scheme');
    setCustomSchemeUrl(`${storedScheme}://callback?${searchParams.toString()}`);
    if (storedScheme.startsWith('moshidon')) setAppName('Moshidon');
    else if (storedScheme.startsWith('abdl-space')) setAppName('ABDL Space');
    else setAppName(storedScheme);
  }, [searchParams]);

  // Try to open app immediately
  useEffect(() => {
    if (error || !code) return;
    const timer = setTimeout(() => { setFailed(true); }, 2500);
    window.location.href = customSchemeUrl;
    const handleVisibility = () => {
      if (document.hidden) { clearTimeout(timer); setTried(true); }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', handleVisibility); };
  }, [code, error, customSchemeUrl]);

  if (error) {
    return (
      <div style={wrap}>
        <div className="card" style={{ ...box, padding: '2rem 1rem' }}>
          <i className="fa-solid fa-circle-xmark text-3xl mb-3" style={{ color: 'var(--danger)', display: 'block' }} />
          <p className="font-semibold">{error === 'access_denied' ? '你拒绝了授权请求' : '授权失败'}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>请返回应用重试</p>
        </div>
      </div>
    );
  }

  if (!code) {
    return (
      <div style={wrap}>
        <div className="card" style={{ ...box, padding: '2rem 1rem' }}>
          <i className="fa-solid fa-triangle-exclamation text-3xl mb-3" style={{ color: 'var(--warning)', display: 'block' }} />
          <p className="font-semibold">缺少授权码</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>请返回应用重新发起授权</p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={box}>
        {!tried && (
          <div className="card" style={{ marginBottom: '0.75rem', padding: '2rem 1rem' }}>
            <i className="fa-solid fa-spinner fa-spin text-2xl mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>正在尝试打开 {appName}...</p>
          </div>
        )}

        {failed && (
          <>
            <div className="card" style={{ marginBottom: '0.75rem', padding: '1.5rem 1rem' }}>
              <i className="fa-solid fa-mobile-screen text-3xl mb-3" style={{ color: 'var(--primary-dark)' }} />
              <p className="font-semibold mb-2">授权已完成</p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                点击下方按钮打开应用完成登录
              </p>
              <a href={customSchemeUrl} className="btn btn-primary w-full"
                onClick={() => { setTimeout(() => setFailed(true), 2000); }}>
                <i className="fa-solid fa-arrow-up-right-from-square mr-2" />
                打开 {appName}
              </a>
            </div>

            <div className="card" style={{ padding: '1rem' }}>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>如果无法打开应用，请手动复制授权码：</p>
              <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--input-bg)' }}>
                <code className="text-xs flex-1 break-all" style={{ color: 'var(--text)' }}>{code}</code>
                <button className="btn btn-sm btn-outline" onClick={() => { navigator.clipboard.writeText(code); }}>
                  <i className="fa-solid fa-copy" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
