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

  // 初始化：用 cookie 恢复登录
  useEffect(() => {
    (async () => {
      try {
        if (USE_API) {
          const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            const u = data.user || data;
            setUser(u);
            setActiveAccountId(u.id);
            // 更新保存的账户信息
            const saved = getSavedAccounts();
            const exists = saved.findIndex(a => a.id === u.id);
            let updated;
            if (exists >= 0) {
              updated = saved.map(a => a.id === u.id ? { ...a, username: u.username, avatar: u.avatar, role: u.role } : a);
            } else {
              updated = [...saved, { id: u.id, username: u.username, avatar: u.avatar, role: u.role }];
            }
            saveAccounts(updated);
            setAccounts(updated);
          } else {
            // cookie 无效，清除本地状态
            saveAccounts([]);
            setAccounts([]);
            setActiveAccountId(null);
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
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '登录失败');

      const u = data.user;

      // 添加/更新已保存账户
      const saved = getSavedAccounts();
      const exists = saved.findIndex(a => a.id === u.id);
      const entry = { id: u.id, username: u.username, avatar: u.avatar, role: u.role, token: data.token };
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
  const register = useCallback(async ({ username, email, password, code, captchaToken, inviteCode }) => {
    const headers = { 'Content-Type': 'application/json' };
    if (captchaToken) headers['X-Captcha-Token'] = captchaToken;
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, username, code, invite_code: inviteCode }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '注册失败');

    const u = data.user;

    const saved = getSavedAccounts();
    saved.push({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      role: u.role,
      is_beta_user: u.is_beta_user,
      token: data.token,
    });
    saveAccounts(saved);
    setAccounts(saved);
    setActiveAccountId(u.id);
    setUser(u);
    return data;
  }, []);

  // 内测预注册（调用 /api/auth/beta-register，后端会额外写入 is_beta_user / beta_joined_at）
  const betaRegister = useCallback(async ({ username, email, password, code, captchaToken, inviteCode }) => {
    const headers = { 'Content-Type': 'application/json' };
    if (captchaToken) headers['X-Captcha-Token'] = captchaToken;
    const res = await fetch(`${API_BASE}/api/auth/beta-register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, username, code, invite_code: inviteCode }),
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '注册失败');

    const u = data.user;

    const saved = getSavedAccounts();
    saved.push({
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      role: u.role,
      is_beta_user: u.is_beta_user,
      token: data.token,
    });
    saveAccounts(saved);
    setAccounts(saved);
    setActiveAccountId(u.id);
    setUser(u);
    return data;
  }, []);

  // 移除保存的账户
  const removeAccount = useCallback((accountId) => {
    const saved = getSavedAccounts().filter(a => a.id !== accountId);
    saveAccounts(saved);
    setAccounts(saved);

    // 如果移除的是当前账户，需要退出登录
    if (user?.id === accountId) {
      fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {}).finally(() => {
        if (window.__apiCache) window.__apiCache.clear();
        setUser(null);
        setActiveAccountId(null);
        lsDel('abdl_currentUser');
        // 如果还有其他保存的账户，跳转登录页让用户选择
        if (saved.length > 0) {
          toast.info('请重新登录其他账户');
        }
        window.location.href = '/login';
      });
    }
  }, [user]);

  // 切换账户（用保存的 token 恢复会话）
  const switchAccount = useCallback(async (accountId) => {
    const saved = getSavedAccounts();
    const target = saved.find(a => a.id === accountId);
    if (!target) throw new Error('账户不存在');
    if (!target.token) throw new Error('该账户需要重新登录（无保存的 token）');

    // 用保存的 token 调 /me 端点，后端会同时设置 cookie
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${target.token}` },
      credentials: 'include',
    });
    if (!res.ok) {
      // token 失效，移除该账户
      removeAccount(accountId);
      throw new Error('该账户登录已过期，请重新登录');
    }
    const u = await res.json();
    setActiveAccountId(u.id);
    setUser(u);
    // 更新保存的信息（token 保留）
    const idx = saved.findIndex(a => a.id === u.id);
    if (idx >= 0) {
      saved[idx] = { ...saved[idx], id: u.id, username: u.username, avatar: u.avatar, role: u.role };
      saveAccounts(saved);
      setAccounts(saved);
    }
  }, [removeAccount]);

  // 退出当前账户（不删除保存的账户）
  const logout = useCallback(async () => {
    // 清除后端 cookie（确保请求完成）
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
    // 清除内存缓存
    if (window.__apiCache) window.__apiCache.clear();
    const saved = getSavedAccounts().filter(a => a.id !== user?.id);
    saveAccounts(saved);
    setAccounts(saved);
    setUser(null);
    setActiveAccountId(null);
    lsDel('abdl_currentUser');
    // 强制刷新确保状态干净
    window.location.href = '/';
  }, [user]);

  // 退出所有账户
  const logoutAll = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
    if (window.__apiCache) window.__apiCache.clear();
    saveAccounts([]);
    setAccounts([]);
    setActiveAccountId(null);
    setUser(null);
    lsDel('abdl_currentUser');
    window.location.href = '/';
  }, []);

  // 同意状态管理
  const CONSENT_KEY = 'abdl_consent';

  const getConsentStatus = useCallback(() => {
    if (!user) return { privacy: false, terms: false, date: null };
    const all = lsGet(CONSENT_KEY) || {};
    const c = all[user.id];
    return c || { privacy: false, terms: false, date: null };
  }, [user]);

  const saveConsent = useCallback(({ privacy, terms, userId }) => {
    const uid = userId || user?.id;
    if (!uid) return;
    const all = lsGet(CONSENT_KEY) || {};
    all[uid] = {
      privacy: privacy || all[uid]?.privacy || false,
      terms: terms || all[uid]?.terms || false,
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
      const res = await fetch(`${API_BASE}/api/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

  const refreshUser = useCallback(async () => {
    if (!USE_API) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const u = data.user || data;
        setUser(u);
        // 同步更新已保存账户列表（修复 NBW 登录后未出现在账户列表的问题）
        setActiveAccountId(u.id);
        const saved = getSavedAccounts();
        const exists = saved.findIndex(a => a.id === u.id);
        let updated;
        if (exists >= 0) {
          updated = saved.map(a => a.id === u.id ? { ...a, username: u.username, avatar: u.avatar, role: u.role } : a);
        } else {
          updated = [...saved, { id: u.id, username: u.username, avatar: u.avatar, role: u.role }];
        }
        saveAccounts(updated);
        setAccounts(updated);
      }
    } catch {}
  }, []);

  return (

    <AuthContext.Provider value={{
      user, loading, accounts,
      login, register, betaRegister, logout, logoutAll,
      switchAccount, removeAccount, updateProfile,
      getConsentStatus, saveConsent, withdrawConsent,
      refreshUser,
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
