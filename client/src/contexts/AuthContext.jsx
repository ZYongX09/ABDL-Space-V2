import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { nbwRegistrationFields } from '../utils/nbwOAuth.js';
import { buildAvatarPreviewUrl } from '../utils/mediaUrl';
import { getSiteAccess } from '../siteAccess.js';
import { syncSiteMediaAccess } from '../siteMediaAccess.js';

function notifySessionChanging() {
  syncSiteMediaAccess(null);
  window.dispatchEvent(new Event('auth-session-changing'));
}

const AuthContext = createContext();

const API_BASE = import.meta.env.VITE_API_BASE ?? '';
const USE_API = API_BASE !== undefined && API_BASE !== null;

const ACCOUNTS_KEY = 'abdl_accounts';
const ACTIVE_KEY = 'abdl_active_account';

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function lsSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function lsDel(key) { localStorage.removeItem(key); }

// 保存的账户格式: [{ id, username, token, avatar, role }]
// 头像在读取时归一化为 160px 预览地址：顶栏、账户切换、账户管理都直接渲染这里的值。
// 写回的是同一个（已归一化的）地址，而 buildAvatarPreviewUrl 是幂等的，所以反复读写不会叠加。
function getSavedAccounts() {
  return (lsGet(ACCOUNTS_KEY) || []).map(a => (a?.avatar ? { ...a, avatar: buildAvatarPreviewUrl(a.avatar) } : a));
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
  const [user, setRawUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState(getSavedAccounts);
  const refreshRequest = useRef(0);
  const sessionVersionRef = useRef(0);
  const sessionChangingRef = useRef(false);
  const userRef = useRef(null);
  const hydrationSessionRef = useRef(null);

  // 先同步媒体策略，再发布用户；函数式更新读取最新 ref，不在 React updater 中产生副作用。
  const setUser = useCallback((next) => {
    const value = typeof next === 'function' ? next(userRef.current) : next;
    const normalized = value ? { ...value, avatar: value.avatar ? buildAvatarPreviewUrl(value.avatar) : value.avatar } : value;
    syncSiteMediaAccess(normalized);
    userRef.current = normalized;
    setRawUser(normalized);
  }, []);
  const beginSessionChange = useCallback(() => {
    const version = ++sessionVersionRef.current;
    refreshRequest.current += 1;
    sessionChangingRef.current = true;
    notifySessionChanging();
    setUser(null);
    setActiveAccountId(null);
    return version;
  }, [setUser]);
  const currentSession = useRef(null);
  const activeToken = accounts.find(account => String(account.id) === String(user?.id))?.token || '';
  currentSession.current = JSON.stringify([user?.id, user?.role, Object.hasOwn(user || {}, 'is_super_admin'), user?.is_super_admin, activeToken]);

  // 初始化：用 cookie 恢复登录
  useEffect(() => {
    const sessionVersion = sessionVersionRef.current;
    let cancelled = false;
    (async () => {
      try {
        if (USE_API) {
          const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: 'include', cache: 'no-store' });
          if (cancelled || sessionVersion !== sessionVersionRef.current) return;
          if (res.ok) {
            const data = await res.json();
            if (cancelled || sessionVersion !== sessionVersionRef.current) return;
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
        if (!cancelled && sessionVersion === sessionVersionRef.current) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // 登录（添加账户到已保存列表）
  const login = useCallback(async ({ login: loginField, password, captchaToken }) => {
    const version = beginSessionChange();
    try {
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
      if (version !== sessionVersionRef.current) throw new Error('登录状态已变化，请重试');

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
    if (version !== sessionVersionRef.current) throw new Error('登录状态已变化，请重试');
    lsSet('abdl_currentUser', u);
    setUser({ ...u, passwordHash: undefined });
    return { token: 'local-' + u.id, user: { ...u, passwordHash: undefined } };
    } finally {
      if (version === sessionVersionRef.current) {
        sessionChangingRef.current = false;
        setLoading(false);
      }
    }
  }, [beginSessionChange, setUser]);

  // Token 登录（用于扫码登录等场景）
  const loginWithToken = useCallback(async ({ token, user: userData }) => {
    if (!userData || !token) throw new Error('登录响应无效');
    beginSessionChange();
    // 添加/更新已保存账户
    const saved = getSavedAccounts();
    const exists = saved.findIndex(a => a.id === userData.id);
    const entry = { id: userData.id, username: userData.username, avatar: userData.avatar, role: userData.role, token };
    if (exists >= 0) {
      saved[exists] = entry;
    } else {
      saved.push(entry);
    }
    saveAccounts(saved);
    setAccounts(saved);
    setActiveAccountId(userData.id);
    setUser(userData);
    sessionChangingRef.current = false;
    setLoading(false);
    return { token, user: userData };
  }, [beginSessionChange, setUser]);

  // 注册
  const register = useCallback(async ({ username, email, password, code, captchaToken, inviteCode, ...nbw }) => {
    const headers = { 'Content-Type': 'application/json' };
    if (captchaToken) headers['X-Captcha-Token'] = captchaToken;
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, username, code, invite_code: inviteCode, ...nbwRegistrationFields(nbw) }),
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

  // 内测预注册（调用 /api/beta/beta-register，后端会额外写入 is_beta_user / beta_joined_at）
  const betaRegister = useCallback(async ({ username, email, password, code, captchaToken, inviteCode }) => {
    const headers = { 'Content-Type': 'application/json' };
    if (captchaToken) headers['X-Captcha-Token'] = captchaToken;
    const res = await fetch(`${API_BASE}/api/beta/beta-register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password, username, code, inviteCode }),
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
      const version = beginSessionChange();
      fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {}).finally(() => {
        if (version !== sessionVersionRef.current) return;
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
  }, [user, beginSessionChange, setUser]);

  // 切换账户（用保存的 token 恢复会话）
  const switchAccount = useCallback(async (accountId) => {
    const saved = getSavedAccounts();
    const target = saved.find(a => a.id === accountId);
    if (!target) throw new Error('账户不存在');
    if (!target.token) throw new Error('该账户需要重新登录（无保存的 token）');
    const version = beginSessionChange();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${target.token}` },
        credentials: 'include', cache: 'no-store',
      });
      if (version !== sessionVersionRef.current) throw new Error('登录状态已变化，请重试');
      if (!res.ok) {
        const remaining = saved.filter(a => a.id !== accountId);
        saveAccounts(remaining);
        setAccounts(remaining);
        throw new Error('该账户登录已过期，请重新登录');
      }
      const data = await res.json();
      if (version !== sessionVersionRef.current) throw new Error('登录状态已变化，请重试');
      const u = data.user || data;
      setActiveAccountId(u.id);
      setUser(u);
      const updated = saved.map(a => a.id === u.id ? { ...a, username: u.username, avatar: u.avatar, role: u.role } : a);
      saveAccounts(updated);
      setAccounts(updated);
    } finally {
      if (version === sessionVersionRef.current) {
        sessionChangingRef.current = false;
        setLoading(false);
      }
    }
  }, [beginSessionChange, setUser]);

  // 退出当前账户（不删除保存的账户）
  const logout = useCallback(async () => {
    const version = beginSessionChange();
    // 清除后端 cookie（确保请求完成）
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
    if (version !== sessionVersionRef.current) return;
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
  }, [user, beginSessionChange, setUser]);

  // 退出所有账户
  const logoutAll = useCallback(async () => {
    const version = beginSessionChange();
    try {
      await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {}
    if (version !== sessionVersionRef.current) return;
    if (window.__apiCache) window.__apiCache.clear();
    saveAccounts([]);
    setAccounts([]);
    setActiveAccountId(null);
    setUser(null);
    lsDel('abdl_currentUser');
    window.location.href = '/';
  }, [beginSessionChange, setUser]);

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
    const version = sessionVersionRef.current;
    if (USE_API) {
      const res = await fetch(`${API_BASE}/api/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '更新失败');
      if (version !== sessionVersionRef.current || sessionChangingRef.current) throw new Error('登录状态已变化，请重试');
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
    if (!USE_API || sessionChangingRef.current) return;
    const request = ++refreshRequest.current;
    const session = currentSession.current;
    const version = sessionVersionRef.current;
    const current = () => request === refreshRequest.current && session === currentSession.current && version === sessionVersionRef.current && !sessionChangingRef.current;
    try {
      const token = JSON.parse(session)[4];
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: 'include', cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!current()) return;
      if (res.ok) {
        const data = await res.json();
        if (!current()) return;
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
      } else if (res.status === 401 || res.status === 403) {
        sessionVersionRef.current += 1;
        setUser(null);
        setActiveAccountId(null);
        if (window.__apiCache) window.__apiCache.clear();
      }
    } catch {}
  }, []);

  const mediaSessionKey = JSON.stringify([user?.id, activeToken, sessionVersionRef.current]);
  useEffect(() => {
    if (!USE_API || loading || user?.id == null || sessionChangingRef.current || getSiteAccess().status !== 'login') return;
    const version = sessionVersionRef.current;
    const session = currentSession.current;
    const refresh = () => {
      if (version === sessionVersionRef.current && session === currentSession.current && !sessionChangingRef.current
        && userRef.current?.id != null && getSiteAccess().status === 'login') void refreshUser();
    };
    // 缺少证书布尔值的登录响应只补全一次；失败后由定时/可见性刷新重试，不循环请求。
    if (typeof user.baby_verified !== 'boolean' && hydrationSessionRef.current !== mediaSessionKey) {
      hydrationSessionRef.current = mediaSessionKey;
      refresh();
    }
    const timer = window.setInterval(refresh, 60_000);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [mediaSessionKey, loading, refreshUser]);

  return (

    <AuthContext.Provider value={{
      user, loading, accounts,
      login, loginWithToken, register, betaRegister, logout, logoutAll,
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
