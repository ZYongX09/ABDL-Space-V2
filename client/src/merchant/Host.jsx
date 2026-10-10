import { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useTheme } from '../contexts/ThemeContext.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import { watchAdminTheme } from '../pages/admin/theme.js';
import { createMerchantAPI } from './api.js';
import { sessionKey } from './model.js';
import MerchantConsole from './Console.jsx';

export default function MerchantHost() {
  const { user, loading, accounts = [] } = useAuth();
  const { theme } = useTheme();
  const token = accounts.find(account => String(account.id) === String(user?.id))?.token || '';
  const key = sessionKey(user, token, window.location.origin);
  const current = useRef(key); current.current = key;
  const api = useMemo(() => createMerchantAPI({ base: import.meta.env.VITE_API_BASE ?? '', getToken: () => token, isCurrentSession: () => current.current === key }), [key, token]);
  useEffect(() => () => api.abortAll(), [api]);
  useEffect(() => {
    document.body.classList.add('merchant-mode');
    const cleanup = watchAdminTheme(theme);
    return () => { cleanup(); document.body.classList.remove('merchant-mode'); };
  }, [theme]);
  return <ErrorBoundary key={key}><MerchantConsole key={key} api={api} username={user?.username || user?.display_name || ''} loggedIn={!!user} authLoading={loading} /></ErrorBoundary>;
}
