import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const API_BASE = import.meta.env.VITE_API_BASE || '';



async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  
  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include', signal: controller.signal });
  clearTimeout(timeoutId);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(`服务器响应异常 (${res.status})`); }
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

export default function OAuthAuthorize() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();

  const [authData, setAuthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [showMobileOverlay, setShowMobileOverlay] = useState(false);

  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const scope = searchParams.get('scope') || 'profile';
  const state = searchParams.get('state') || '';
  const responseType = searchParams.get('response_type') || 'code';
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');

  /* 跳过开场动画 */
  useEffect(() => {
    try { sessionStorage.setItem('intro_played', '1'); } catch {}
    const ph = document.getElementById('intro-placeholder');
    if (ph) ph.remove();
    const overlay = document.getElementById('intro-overlay');
    if (overlay) overlay.remove();
  }, []);

  /* 检测移动端 → 重定向到 m.abdl-space.top */
  useEffect(() => {
    const isMobile = /Android|iPhone|iPod/i.test(navigator.userAgent) && !/iPad|Tablet/i.test(navigator.userAgent);
    if (!isMobile) return;
    // 已在移动端域名上，不重定向
    if (window.location.hostname === 'm.abdl-space.top') return;
    const mobileUrl = `https://m.abdl-space.top/oauth/authorize?${searchParams.toString()}`;
    // 立即重定向
    window.location.href = mobileUrl;
    // 兜底：2秒后如果还在当前页面，显示手动跳转弹窗
    const timer = setTimeout(() => setShowMobileOverlay(true), 2000);
    return () => clearTimeout(timer);
  }, [searchParams]);

  /* 未登录 → 跳转登录 */
  useEffect(() => {
    if (!authLoading && !user) {
      const currentUrl = window.location.pathname + window.location.search;
      navigate('/login', { state: { from: currentUrl } });
    }
  }, [user, authLoading, navigate]);

  /* 从 redirectUri 解析 scheme 存入 sessionStorage（供回调页使用） */
  useEffect(() => {
    if (!redirectUri) return;
    try {
      const parsed = new URL(redirectUri);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        sessionStorage.setItem('oauth_redirect_scheme', parsed.protocol.replace(':', ''));
      }
    } catch {}
  }, [redirectUri]);

  /* 加载授权信息 */
  useEffect(() => {
    if (!user || !clientId || !redirectUri) return;

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      state,
      response_type: responseType,
    });
    if (codeChallenge) params.set('code_challenge', codeChallenge);
    if (codeChallengeMethod) params.set('code_challenge_method', codeChallengeMethod);

    apiFetch(`/api/oauth/authorize?${params}`)
      .then(data => {
        setAuthData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [user, clientId, redirectUri, scope, state, responseType, codeChallenge, codeChallengeMethod]);

  /* 用户操作 */
  const handleDecision = useCallback(async (approved) => {
    setSubmitting(true);
    toast.info('正在发送授权请求...')
    try {
      const res = await apiFetch('/api/oauth/authorize', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
          approved,
        }),
      });
      if (res.redirect) {
        // BUG-780: Validate redirect URL (defense-in-depth)
        try {
          const url = new URL(res.redirect)
          // Allow http, https, and custom app schemes (e.g. Mastodon clients like abdl-space-auth://)
          const ALLOWED_PROTOCOLS = ['http:', 'https:', 'abdl-space:', 'abdl-space-auth:', 'moshidon-android-debug-auth:', 'moshidon-android-nightly-auth:']
          if (ALLOWED_PROTOCOLS.includes(url.protocol)) {
            // Custom schemes (e.g. abdl-space-auth://) can't be opened by mobile browsers.
            // Redirect through web callback page which tries to open the app.
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
              // Store the original scheme so the callback page can use it
              sessionStorage.setItem('oauth_redirect_scheme', url.protocol.replace(':', ''))
              const webCallbackUrl = `/oauth/callback?${url.searchParams.toString()}`
              window.location.href = webCallbackUrl
              return
            }
            console.log('[OAuth] Redirecting to:', res.redirect)
            toast.info(`跳转中: ${res.redirect}`)
            // Fallback: if navigation fails (e.g. target unreachable), reset button after 5s
            const fallbackTimer = setTimeout(() => {
              console.warn('[OAuth] Redirect may have failed, restoring button state')
              toast.error('跳转超时，请检查目标应用是否可用')
              setSubmitting(false)
            }, 5000)
            window.location.href = res.redirect
            // If navigation succeeds, the page unloads and the timer is irrelevant
            return
          } else {
            toast.error('无效的重定向地址')
            setSubmitting(false)
          }
        } catch {
          // Relative URL is OK
          toast.info(`跳转中: ${res.redirect}`)
          window.location.href = res.redirect
        }
      } else {
        console.error('[OAuth] No redirect in response:', res)
        toast.error('服务器未返回重定向地址')
        setSubmitting(false)
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        toast.error('请求超时，请检查网络或服务器状态')
      } else {
        toast.error(err.message);
      }
      setSubmitting(false);
    }
  }, [clientId, redirectUri, scope, state, codeChallenge, codeChallengeMethod, toast]);

  /* 参数校验 */
  if (!clientId || !redirectUri) {
    return (
      <PageLayout hero={{ icon: 'fa-shield-halved', title: '授权', subtitle: '' }}>
        <div className="card max-w-md mx-auto text-center py-8">
          <i className="fa-solid fa-triangle-exclamation text-3xl mb-3" style={{ color: 'var(--danger)' }} />
          <p className="font-semibold">无效的授权请求</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>缺少必要参数 (client_id / redirect_uri)</p>
        </div>
      </PageLayout>
    );
  }

  /* 移动端跳转覆盖层 */
  if (showMobileOverlay) {
    const mobileUrl = `https://m.abdl-space.top/oauth/authorize?${searchParams.toString()}`;
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'var(--bg, #000)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <i className="fa-solid fa-mobile-screen-button" style={{ fontSize: 48, color: 'var(--primary)', marginBottom: 24 }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text, #fff)', marginBottom: 8, textAlign: 'center' }}>请在移动端打开</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted, #aaa)', marginBottom: 32, textAlign: 'center', lineHeight: 1.6 }}>
          授权页面需要在移动端完成<br />请点击下方按钮跳转
        </p>
        <a href={mobileUrl} className="btn btn-primary" style={{ fontSize: '1rem', padding: '12px 32px', borderRadius: 12 }}>
          <i className="fa-solid fa-arrow-up-right-from-square mr-2" />前往移动端授权
        </a>
      </div>
    );
  }

  if (authLoading || loading) {
    return (
      <PageLayout hero={{ icon: 'fa-shield-halved', title: '授权', subtitle: '' }}>
        <div className="card max-w-md mx-auto text-center py-12">
          <i className="fa-solid fa-spinner fa-spin text-2xl" style={{ color: 'var(--text-muted)' }} />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout hero={{ icon: 'fa-shield-halved', title: '授权', subtitle: '' }}>
        <div className="card max-w-md mx-auto text-center py-8">
          <i className="fa-solid fa-circle-xmark text-3xl mb-3" style={{ color: 'var(--danger)' }} />
          <p className="font-semibold">授权请求失败</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div>
      </PageLayout>
    );
  }

  const { client, scopes } = authData;

  return (
    <PageLayout hero={{ icon: 'fa-shield-halved', title: '应用授权', subtitle: '授权第三方应用访问你的账号' }}>
      <div className="max-w-md mx-auto">

        {/* 应用信息卡 */}
        <div className="card mb-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--input-bg)', border: '1.5px solid var(--border)' }}>
              {client.logo_url ? (
                <img src={client.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover" />
              ) : (
                <i className="fa-solid fa-puzzle-piece text-xl" style={{ color: 'var(--primary-dark)' }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg truncate" style={{ color: 'var(--text)' }}>{client.name}</h2>
              {client.description && (
                <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{client.description}</p>
              )}
              {client.homepage_url && (
                <a href={client.homepage_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs mt-1 inline-block" style={{ color: 'var(--link-color)' }}>
                  {client.homepage_url} <i className="fa-solid fa-external-link text-[0.6rem] ml-0.5" />
                </a>
              )}
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t mb-4" style={{ borderColor: 'var(--border)' }} />

          {/* 用户信息 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden"
              style={{ background: 'var(--primary-dark)', color: '#fff' }}>
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                user?.username?.[0]?.toUpperCase() || '?'
              )}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{user?.username}</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>当前登录账号</p>
            </div>
          </div>

          {/* 请求权限 */}
          <div className="mb-2">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>
              <i className="fa-solid fa-key mr-1.5" style={{ color: 'var(--primary-dark)' }} />
              该应用请求以下权限：
            </p>
            <div className="space-y-2">
              {scopes.map(s => (
                <div key={s.value} className="flex items-start gap-2">
                  <i className="fa-solid fa-check-circle mt-0.5 text-xs" style={{ color: 'var(--success)' }} />
                  <div>
                    <span className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{s.value}</span>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-3 mb-3">
          <button
            className="btn btn-primary flex-1"
            onClick={() => handleDecision(true)}
            disabled={submitting}
          >
            {submitting ? '处理中...' : <><i className="fa-solid fa-check mr-1.5" />授权</>}
          </button>
          <button
            className="btn btn-outline flex-1"
            onClick={() => handleDecision(false)}
            disabled={submitting}
          >
            <i className="fa-solid fa-xmark mr-1.5" />拒绝
          </button>
        </div>

        {/* 安全提示 */}
        <div className="text-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-lock mr-1" />
            授权后你可以随时在设置中撤销权限
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
