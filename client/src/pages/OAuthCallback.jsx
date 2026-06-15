import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageLayout from '../components/PageLayout';

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

  // Build the custom scheme URL from the original redirect_uri or detect from params
  // The authorize page passes the original redirect URL's scheme
  const [customSchemeUrl, setCustomSchemeUrl] = useState('');

  useEffect(() => {
    // Try to detect the scheme from the state or build it
    // The authorize page may have stored the original scheme
    const storedScheme = sessionStorage.getItem('oauth_redirect_scheme') || 'abdl-space';
    sessionStorage.removeItem('oauth_redirect_scheme');
    setCustomSchemeUrl(`${storedScheme}://callback?${searchParams.toString()}`);
  }, [searchParams]);

  // Try to open app immediately
  useEffect(() => {
    if (error || !code) return;

    const timer = setTimeout(() => {
      setFailed(true);
    }, 2500);

    // Attempt to open the app
    window.location.href = customSchemeUrl;

    // If the page is still visible after 2.5s, the app didn't open
    const handleVisibility = () => {
      if (document.hidden) {
        clearTimeout(timer);
        setTried(true);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [code, error, customSchemeUrl]);

  // Error from OAuth server
  if (error) {
    return (
      <PageLayout hero={{ icon: 'fa-circle-xmark', title: '授权失败', subtitle: '' }}>
        <div className="card max-w-md mx-auto text-center py-8">
          <i className="fa-solid fa-circle-xmark text-3xl mb-3" style={{ color: 'var(--danger)' }} />
          <p className="font-semibold">{error === 'access_denied' ? '你拒绝了授权请求' : '授权失败'}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>请返回应用重试</p>
        </div>
      </PageLayout>
    );
  }

  // No code
  if (!code) {
    return (
      <PageLayout hero={{ icon: 'fa-triangle-exclamation', title: '无效回调', subtitle: '' }}>
        <div className="card max-w-md mx-auto text-center py-8">
          <i className="fa-solid fa-triangle-exclamation text-3xl mb-3" style={{ color: 'var(--warning)' }} />
          <p className="font-semibold">缺少授权码</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>请返回应用重新发起授权</p>
        </div>
      </PageLayout>
    );
  }

  // Has code — show "open app" fallback
  return (
    <PageLayout hero={{ icon: 'fa-mobile-screen', title: '打开应用', subtitle: '授权成功，请返回应用继续' }}>
      <div className="max-w-md mx-auto text-center">
        {!tried && (
          <div className="card mb-4 py-8">
            <i className="fa-solid fa-spinner fa-spin text-2xl mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>正在尝试打开应用...</p>
          </div>
        )}

        {failed && (
          <>
            <div className="card mb-4 py-6">
              <i className="fa-solid fa-mobile-screen text-3xl mb-3" style={{ color: 'var(--primary-dark)' }} />
              <p className="font-semibold mb-2">授权已完成</p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                点击下方按钮打开应用完成登录
              </p>
              <a
                href={customSchemeUrl}
                className="btn btn-primary w-full"
                onClick={() => {
                  // Fallback: if still can't open, show the code
                  setTimeout(() => setFailed(true), 2000);
                }}
              >
                <i className="fa-solid fa-arrow-up-right-from-square mr-2" />
                打开 ABDL Space 应用
              </a>
            </div>

            {/* Copy code fallback */}
            <div className="card py-4">
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>如果无法打开应用，请手动复制授权码：</p>
              <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--input-bg)' }}>
                <code className="text-xs flex-1 break-all" style={{ color: 'var(--text)' }}>{code}</code>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    navigator.clipboard.writeText(code);
                  }}
                >
                  <i className="fa-solid fa-copy" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}
