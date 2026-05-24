/**
 * NewBabyWorld OAuth 工具函数
 */

let _nbwConfig = null;

/** 从后端获取 NBW OAuth 配置（运行时） */
async function getNBWConfig() {
  if (_nbwConfig) return _nbwConfig;
  const API_BASE = import.meta.env.VITE_API_BASE || '';
  try {
    const res = await fetch(`${API_BASE}/api/auth/nbw/config`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      _nbwConfig = { clientId: data.client_id, redirectUri: data.redirect_uri };
      return _nbwConfig;
    }
  } catch {}
  _nbwConfig = { clientId: '', redirectUri: '' };
  return _nbwConfig;
}

/** 是否已配置 NewBabyWorld OAuth */
export function isNBWConfigured() {
  return !!(_nbwConfig?.clientId && _nbwConfig?.redirectUri);
}

/** 获取配置加载 Promise（用于组件等待） */
let _configPromise = null;
export function whenNBWReady() {
  if (!_configPromise) _configPromise = getNBWConfig();
  return _configPromise;
}

/** 初始化 NBW 配置（应用启动时调用） */
export async function initNBWConfig() {
  await getNBWConfig();
}

/** 生成随机 state */
function generateState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 发起 NewBabyWorld OAuth 授权（登录/注册用） */
export async function startNBWOAuth() {
  const config = await getNBWConfig();
  if (!config.clientId || !config.redirectUri) return;

  const state = generateState();
  sessionStorage.setItem('nbw_oauth_state', state);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state,
  });

  window.location.href = `https://www.newbabyworld.top/oauth/authorize.php?${params}`;
}

/** 发起 NewBabyWorld OAuth 绑定 */
export async function startNBWBind() {
  const config = await getNBWConfig();
  if (!config.clientId || !config.redirectUri) return;

  const state = 'bind_' + generateState();
  sessionStorage.setItem('nbw_oauth_state', state);

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state,
  });

  window.location.href = `https://www.newbabyworld.top/oauth/authorize.php?${params}`;
}

/** 验证回调 state */
export function verifyNBWState(returnedState) {
  const saved = sessionStorage.getItem('nbw_oauth_state');
  sessionStorage.removeItem('nbw_oauth_state');
  return saved && returnedState && saved === returnedState;
}

/** 判断是否为绑定流程 */
export function isNBWBindState(state) {
  return state && state.startsWith('bind_');
}

/** 向后端发送 code 换取 token + 用户信息 */
export async function exchangeNBWCode(code) {
  const API_BASE = import.meta.env.VITE_API_BASE || '';
  const res = await fetch(`${API_BASE}/api/auth/nbw/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '授权失败');
  return data;
}

/** 绑定 NewBabyWorld 账户 */
export async function bindNBWAccount(code) {
  const API_BASE = import.meta.env.VITE_API_BASE || '';
  const res = await fetch(`${API_BASE}/api/auth/nbw/bind`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '绑定失败');
  return data;
}
