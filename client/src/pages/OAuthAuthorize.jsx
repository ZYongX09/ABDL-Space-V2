import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const API_BASE = import.meta.env.VITE_API_BASE || '';

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
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

/* 全屏居中容器 */
const wrap = { minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.75rem', boxSizing: 'border-box' };
const box = { width: '100%', maxWidth: 520 };

export default function OAuthAuthorize() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();

  const [authData, setAuthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

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

  /* 未登录 → 跳转登录 */
  useEffect(() => {
    if (!authLoading && !user) {
      const currentUrl = window.location.pathname + window.location.search;
      navigate('/login', { state: { from: currentUrl } });
    }
  }, [user, authLoading, navigate]);

  /* 从 redirectUri 解析 scheme 存入 sessionStorage */
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
      client_id: clientId, redirect_uri: redirectUri, scope, state, response_type: responseType,
    });
    if (codeChallenge) params.set('code_challenge', codeChallenge);
    if (codeChallengeMethod) params.set('code_challenge_method', codeChallengeMethod);
    apiFetch(`/api/oauth/authorize?${params}`)
      .then(data => { setAuthData(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [user, clientId, redirectUri, scope, state, responseType, codeChallenge, codeChallengeMethod]);

  /* 用户操作 */
  const handleDecision = useCallback(async (approved) => {
    setSubmitting(true);
    toast.info('正在发送授权请求...');
    try {
      const res = await apiFetch('/api/oauth/authorize', {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId, redirect_uri: redirectUri, scope, state,
          code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod, approved,
        }),
      });
      if (res.redirect) {
        try {
          const url = new URL(res.redirect);
          const ALLOWED_PROTOCOLS = ['http:', 'https:', 'abdl-space:', 'abdl-space-auth:', 'moshidon-android-debug-auth:', 'moshidon-android-nightly-auth:'];
          if (ALLOWED_PROTOCOLS.includes(url.protocol)) {
            if (url.protocol !== 'http:' && url.protocol !== 'https:') {
              sessionStorage.setItem('oauth_redirect_scheme', url.protocol.replace(':', ''));
              window.location.href = `/oauth/callback?${url.searchParams.toString()}`;
              return;
            }
            toast.info(`跳转中: ${res.redirect}`);
            const fallbackTimer = setTimeout(() => { toast.error('跳转超时'); setSubmitting(false); }, 5000);
            window.location.href = res.redirect;
            return;
          } else {
            toast.error('无效的重定向地址');
            setSubmitting(false);
          }
        } catch {
          toast.info(`跳转中: ${res.redirect}`);
          window.location.href = res.redirect;
        }
      } else {
        toast.error('服务器未返回重定向地址');
        setSubmitting(false);
      }
    } catch (err) {
      toast.error(err.name === 'AbortError' ? '请求超时' : err.message);
      setSubmitting(false);
    }
  }, [clientId, redirectUri, scope, state, codeChallenge, codeChallengeMethod, toast]);

  /* 参数校验 */
  if (!clientId || !redirectUri) {
    return (
      <div style={wrap}>
        <div className="card" style={{ ...box, textAlign: 'center', padding: '2rem 1rem' }}>
          <i className="fa-solid fa-triangle-exclamation text-3xl mb-3" style={{ color: 'var(--danger)', display: 'block' }} />
          <p className="font-semibold">无效的授权请求</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>缺少必要参数 (client_id / redirect_uri)</p>
        </div>
      </div>
    );
  }

  if (authLoading || loading) {
    return (
      <div style={wrap}>
        <i className="fa-solid fa-spinner fa-spin text-2xl" style={{ color: 'var(--text-muted)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={wrap}>
        <div className="card" style={{ ...box, textAlign: 'center', padding: '2rem 1rem' }}>
          <i className="fa-solid fa-circle-xmark text-3xl mb-3" style={{ color: 'var(--danger)', display: 'block' }} />
          <p className="font-semibold">授权请求失败</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{error}</p>
        </div>
      </div>
    );
  }

  const { client, scopes } = authData;

  return (
    <div style={wrap}>
      <div style={box}>

        {/* 应用信息卡 */}
        <div className="card" style={{ marginBottom: '0.75rem' }}>
          <div className="flex items-center gap-3" style={{ marginBottom: '1rem' }}>
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--input-bg)', border: '1.5px solid var(--border)' }}>
              {client.logo_url ? (
                <img src={client.logo_url} alt="" className="w-9 h-9 rounded-lg object-cover" />
              ) : (
                <i className="fa-solid fa-puzzle-piece text-lg" style={{ color: 'var(--primary-dark)' }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-base truncate" style={{ color: 'var(--text)' }}>{client.name}</h2>
              {client.description && (
                <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{client.description}</p>
              )}
              {client.homepage_url && (
                <a href={client.homepage_url} target="_blank" rel="noopener noreferrer"
                  className="text-xs mt-0.5 inline-block" style={{ color: 'var(--link-color)' }}>
                  {client.homepage_url} <i className="fa-solid fa-external-link text-[0.6rem] ml-0.5" />
                </a>
              )}
            </div>
          </div>

          {/* 分隔线 */}
          <div className="border-t" style={{ borderColor: 'var(--border)', marginBottom: '0.75rem' }} />

          {/* 用户信息 */}
          <div className="flex items-center gap-3" style={{ marginBottom: '0.75rem' }}>
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
          <p className="text-xs font-semibold" style={{ color: 'var(--text)', marginBottom: '0.5rem' }}>
            <i className="fa-solid fa-key mr-1.5" style={{ color: 'var(--primary-dark)' }} />
            该应用请求以下权限：
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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

        {/* 操作按钮 */}
        <div className="flex gap-3" style={{ marginBottom: '0.5rem' }}>
          <button className="btn btn-primary flex-1" onClick={() => handleDecision(true)} disabled={submitting}>
            {submitting ? '处理中...' : <><i className="fa-solid fa-check mr-1.5" />授权</>}
          </button>
          <button className="btn btn-outline flex-1" onClick={() => handleDecision(false)} disabled={submitting}>
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
    </div>
  );
}
