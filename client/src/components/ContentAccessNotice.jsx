import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { withAuthHeader } from '../utils/authHeaders.js';
import { contentAccess, isEssentialContentPath, VERIFICATION_PATH } from '../contentAccess.js';

export function useContentAccessGate(pathname) {
  const { loading, contentAccessSessionKey } = useAuth();
  const snapshot = useSyncExternalStore(contentAccess.subscribe, contentAccess.getSnapshot, contentAccess.getSnapshot);
  useEffect(() => {
    if (loading) return;
    const request = (path, options) => fetch(path, { ...options, headers: withAuthHeader(options.headers) });
    const check = () => void contentAccess.load(contentAccessSessionKey, request);
    check();
    const timer = window.setInterval(check, 60_000);
    const visible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); contentAccess.reset(); };
  }, [loading, contentAccessSessionKey]);
  if (isEssentialContentPath(pathname)) return null;
  if (loading || snapshot.key !== contentAccessSessionKey) return { state: 'pending', message: '正在确认内容访问权限…' };
  return snapshot.state === 'open' ? null : snapshot;
}

export default function ContentAccessNotice({ access }) {
  const pending = access.state === 'pending';
  return <main className="container mx-auto px-5 py-6" style={{ maxWidth: 600, minHeight: '70vh', display: 'grid', alignContent: 'center', gap: 18, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>
    <section role={pending ? 'status' : 'alert'} aria-live="polite" style={{ padding: 24, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 20 }}>
      <h1 className="text-xl font-bold">{pending ? '正在确认访问权限' : access.state === 'baby_verification_required' ? '需要宝宝认证' : '内容暂时无法访问'}</h1>
      <p style={{ margin: '16px 0' }}>{access.message}</p>
      {!pending && <div className="flex gap-4 flex-wrap"><a href={VERIFICATION_PATH} style={{ color: 'var(--primary)' }}>前往宝宝认证</a><a href="/account" style={{ color: 'var(--primary)' }}>账户与安全</a><a href="/sponsors" style={{ color: 'var(--primary)' }}>赞助与订单</a><button type="button" onClick={() => window.location.reload()} style={{ color: 'var(--primary)' }}>重新确认</button></div>}
    </section>
  </main>;
}
