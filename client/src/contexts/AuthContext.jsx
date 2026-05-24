import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

const API_BASE = import.meta.env.VITE_API_BASE || '';
const USE_API = !!API_BASE;

const ACCOUNTS_KEY = 'abdl_accounts';
const ACTIVE_KEY = 'abdl_active_account';

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function lsDel(key) { localStorage.removeItem(key); }

// 保存的账户格式: [{ id, username, token, avatar, role }]
function getSavedAccounts() {
  return lsGet(ACCOUNTS_KEY) || [];
}
function saveAccounts(accounts) {
  lsSet(ACCOUNTS_KEY, accounts);
}
function getActiveAccountId() {
  return localStorage.getItem(ACTIVE_KEY);
}
function setActiveAccountId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}

// 离线模式密码哈希（SHA-256）
async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// localStorage 离线模式
function getOfflineUsers() { return lsGet('abdl_users') || {}; }
function getOfflineCurrentUser() { return lsGet('abdl_currentUser'); }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState(getSavedAccounts);

  // 初始化：从保存的账户恢复登录
  useEffect(() => {
    (async () => {
      try {
        if (USE_API) {
          const activeId = getActiveAccountId();
          const saved = getSavedAccounts();
          if (saved.length === 0) { setLoading(false); return; }

          // 尝试用活跃账户的 token
          const active = saved.find(a => String(a.id) === activeId) || saved[0];
          if (!active?.token) { setLoading(false); return; }

          const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${active.token}` },
          });
          if (res.ok) {
            const data = await res.json();
            const u = data.user || data;
            setUser(u);
            setActiveAccountId(u.id);
            // 更新保存的账户信息
            const updated = saved.map(a => a.id === u.id ? { ...a, username: u.username, avatar: u.avatar, role: u.role } : a);
            saveAccounts(updated);
            setAccounts(updated);
          } else {
            // token 失效，移除该账户
            const filtered = saved.filter(a => a.id !== active.id);
            saveAccounts(filtered);
            setAccounts(filtered);
            setActiveAccountId(filtered[0]?.id || null);
          }
        } else {
          const u = getOfflineCurrentUser();
          if (u) setUser({ ...u, passwordHash: undefined });
        }
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, []);

  // 登录（添加账户到已保存列表）
  const login = useCallback(async ({ login: loginField, password, captchaToken }) => {
    if (USE_API) {
      const headers = { 'Content-Type': 'application/json' };
      if (captchaToken) headers['X-Captcha-Token'] = captchaToken;
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ login: loginField, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登录失败');

      const u = data.user;
      const token = data.token;
      localStorage.setItem('token', token);

      // 添加/更新已保存账户
      const saved = getSavedAccounts();
      const exists = saved.findIndex(a => a.id === u.id);
      const entry = { id: u.id, username: u.username, avatar: u.avatar, role: u.role, token };
      if (exists >= 0) {
        saved[exists] = entry;
      } else {
        saved.push(entry);
      }
      saveAccounts(saved);
      setAccounts(saved);
      setActiveAccountId(u.id);
      setUser(u);
      return data;
    }
    // localStorage 模式
    const users = getOfflineUsers();
    const u = Object.values(users).find(uu => uu.username === loginField || uu.email === loginField) || users[loginField];
    if (!u) throw new Error('用户名或密码错误');
    const hash = await hashPassword(password);
    if (u.passwordHash !== hash) throw new Error('用户名或密码错误');
    lsSet('abdl_currentUser', u);
    setUser({ ...u, passwordHash: undefined });
    return { token: 'local-' + u.id, user: { ...u, passwordHash: undefined } };
  }, []);

  // 注册
  const register = useCallback(async ({ username, email, password, code, captchaToken }) => {
    const headers = { 'Content-Type': 'application/json' };
    if (captchaToken) headers['X-Captcha-Token'] = captchaToken;
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, username, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '注册失败');

    const u = data.user;
    const token = data.token;
    localStorage.setItem('token', token);

    const saved = getSavedAccounts();
    saved.push({ id: u.id, username: u.username, avatar: u.avatar, role: u.role, token });
    saveAccounts(saved);
    setAccounts(saved);
    setActiveAccountId(u.id);
    setUser(u);
    return data;
  }, []);

  // 切换账户
  const switchAccount = useCallback(async (accountId) => {
    const saved = getSavedAccounts();
    const target = saved.find(a => a.id === accountId);
    if (!target?.token) throw new Error('账户不存在或已失效');

    if (USE_API) {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${target.token}` },
      });
      if (!res.ok) {
        // token 失效，移除
        const filtered = saved.filter(a => a.id !== accountId);
        saveAccounts(filtered);
        setAccounts(filtered);
        throw new Error('登录已过期，请重新登录');
      }
      const data = await res.json();
      const u = data.user || data;
      localStorage.setItem('token', target.token);
      setActiveAccountId(accountId);
      setUser(u);
      // 更新账户信息
      const updated = saved.map(a => a.id === accountId ? { ...a, username: u.username, avatar: u.avatar, role: u.role } : a);
      saveAccounts(updated);
      setAccounts(updated);
      return u;
    }
    // localStorage 模式
    const users = getOfflineUsers();
    const u = Object.values(users).find(uu => uu.id === accountId);
    if (!u) throw new Error('用户不存在');
    lsSet('abdl_currentUser', u);
    setUser({ ...u, passwordHash: undefined });
    return { ...u, passwordHash: undefined };
  }, []);

  // 移除保存的账户
  const removeAccount = useCallback((accountId) => {
    const saved = getSavedAccounts().filter(a => a.id !== accountId);
    saveAccounts(saved);
    setAccounts(saved);

    // 如果移除的是当前账户，切换到第一个或退出
    if (user?.id === accountId) {
      if (saved.length > 0) {
        switchAccount(saved[0].id).catch(() => { setUser(null); setActiveAccountId(null); });
      } else {
        setUser(null);
        setActiveAccountId(null);
        localStorage.removeItem('token');
      }
    }
  }, [user, switchAccount]);

  // 退出当前账户（不删除保存的账户）
  const logout = useCallback(() => {
    const saved = getSavedAccounts().filter(a => a.id !== user?.id);
    saveAccounts(saved);
    setAccounts(saved);

    if (saved.length > 0) {
      // 自动切换到下一个保存的账户
      switchAccount(saved[0].id).catch(() => {
        setUser(null);
        setActiveAccountId(null);
        localStorage.removeItem('token');
      });
    } else {
      setUser(null);
      setActiveAccountId(null);
      localStorage.removeItem('token');
      lsDel('abdl_currentUser');
    }
  }, [user, switchAccount]);

  // 退出所有账户
  const logoutAll = useCallback(() => {
    saveAccounts([]);
    setAccounts([]);
    setActiveAccountId(null);
    setUser(null);
    localStorage.removeItem('token');
    lsDel('abdl_currentUser');
  }, []);

  // 同意状态管理
  const CONSENT_KEY = 'abdl_consent';

  const getConsentStatus = useCallback(() => {
    if (!user) return { privacy: false, terms: false, date: null };
    const all = lsGet(CONSENT_KEY) || {};
    const c = all[user.id];
    return c || { privacy: false, terms: false, date: null };
  }, [user]);

  const saveConsent = useCallback(({ privacy, terms }) => {
    if (!user) return;
    const all = lsGet(CONSENT_KEY) || {};
    all[user.id] = {
      privacy: privacy || all[user.id]?.privacy || false,
      terms: terms || all[user.id]?.terms || false,
      date: new Date().toISOString(),
    };
    lsSet(CONSENT_KEY, all);
  }, [user]);

  const withdrawConsent = useCallback(() => {
    if (!user) return;
    const all = lsGet(CONSENT_KEY) || {};
    delete all[user.id];
    lsSet(CONSENT_KEY, all);
    logout();
  }, [user, logout]);

  // 更新资料
  const updateProfile = useCallback(async (body) => {
    if (USE_API) {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失败');
      const u = data.user || data;
      setUser(u);
      // 同步更新已保存账户信息
      if (u.username || u.avatar) {
        const saved = getSavedAccounts().map(a => a.id === u.id ? { ...a, username: u.username, avatar: u.avatar } : a);
        saveAccounts(saved);
        setAccounts(saved);
      }
      return data;
    }
    const u = getOfflineCurrentUser();
    if (!u) throw new Error('未登录');
    const allowed = ['bio', 'region', 'age', 'weight', 'waist', 'hip', 'style_preference', 'avatar'];
    for (const key of allowed) {
      if (key in body) u[key] = body[key];
    }
    const users = getOfflineUsers();
    users[u.username] = u;
    lsSet('abdl_users', users);
    lsSet('abdl_currentUser', u);
    setUser({ ...u, passwordHash: undefined });
    return { user: { ...u, passwordHash: undefined } };
  }, []);

  return (
    <AuthContext.Provider value={{
      user, loading, accounts,
      login, register, logout, logoutAll,
      switchAccount, removeAccount, updateProfile,
      getConsentStatus, saveConsent, withdrawConsent,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
