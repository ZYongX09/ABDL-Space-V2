import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { adminAccessState, adminSessionKey } from './access.js';
import { ConfirmProvider } from './ui.jsx';
import { watchAdminTheme } from './theme.js';
import './admin.css';

/** 在路由层阻止数据页面挂载，不仅隐藏已经发请求的页面内容。 */
export function AdminRouteBoundary({ user, loading, children }) {
  const state = adminAccessState(user, loading);
  if (state === 'allowed') return children;
  return <div className="admin-console ac-access-state" role={state === 'loading' ? 'status' : undefined} aria-live="polite">
    {state === 'loading' ? <><i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /><span>正在验证管理员身份…</span></> : <div className="ac-access-card">
      <span className="ac-access-icon"><i className="fa-solid fa-lock" aria-hidden="true" /></span>
      <h1>{state === 'anonymous' ? '请先登录管理员账号' : '仅管理员可访问'}</h1>
      <p>{state === 'anonymous' ? '登录后才能验证管理后台权限。' : '当前账户没有管理后台权限。'}</p>
      {state === 'anonymous' && <Link className="ac-btn primary" to="/login">前往登录</Link>}{' '}
      <Link className="ac-btn" to="/">返回前台</Link>
    </div>}
  </div>;
}

export default function AdminRouteGate() {
  const { user, loading, accounts, refreshUser } = useAuth();
  const token = accounts?.find(account => String(account.id) === String(user?.id))?.token || '';
  const sessionKey = adminSessionKey(user, token);
  const [blockedSession, setBlockedSession] = useState(null);
  const currentSession = useRef(sessionKey);
  currentSession.current = sessionKey;
  useEffect(() => { setBlockedSession(null); }, [sessionKey]);
  useEffect(() => {
    const reject = event => {
      if (event.detail?.sessionKey !== currentSession.current) return;
      setBlockedSession(currentSession.current);
      refreshUser();
    };
    window.addEventListener('admin-session-rejected', reject);
    return () => window.removeEventListener('admin-session-rejected', reject);
  }, [refreshUser]);
  const { theme } = useTheme();
  useLayoutEffect(() => {
    const cleanup = watchAdminTheme(theme);
    document.body.classList.add('admin-mode');
    return () => { cleanup(); document.body.classList.remove('admin-mode'); };
  }, [theme]);
  return <AdminRouteBoundary user={blockedSession === sessionKey ? null : user} loading={loading}><ConfirmProvider key={sessionKey}><Outlet /></ConfirmProvider></AdminRouteBoundary>;
}

export function AdminUnknownRoute() {
  return <div className="admin-console ac-access-state"><div className="ac-access-card"><h1>管理页面不存在</h1><p>未加载任何管理数据，请返回安全入口。</p><Link className="ac-btn primary" to="/admin">返回管理概览</Link>{' '}<Link className="ac-btn" to="/">返回前台</Link></div></div>;
}
