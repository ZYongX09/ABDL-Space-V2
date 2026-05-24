/**
 * NewBabyWorld OAuth 工具函数
 */

const NBW_CLIENT_ID = import.meta.env.VITE_NBW_CLIENT_ID || '';
const NBW_REDIRECT_URI = import.meta.env.VITE_NBW_REDIRECT_URI || '';

/** 是否已配置 NewBabyWorld OAuth */
export function isNBWConfigured() {
  return !!(NBW_CLIENT_ID && NBW_REDIRECT_URI);
}

/** 生成随机 state */
function generateState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 发起 NewBabyWorld OAuth 授权（登录/注册用） */
export function startNBWOAuth() {
  if (!isNBWConfigured()) return;

  const state = generateState();
  sessionStorage.setItem('nbw_oauth_state', state);

  const params = new URLSearchParams({
    client_id: NBW_CLIENT_ID,
    redirect_uri: NBW_REDIRECT_URI,
    response_type: 'code',
    state,
  });

  window.location.href = `https://www.newbabyworld.top/oauth/authorize.php?${params}`;
}

/** 发起 NewBabyWorld OAuth 绑定 */
export function startNBWBind() {
  if (!isNBWConfigured()) return;

  const state = 'bind_' + generateState();
  sessionStorage.setItem('nbw_oauth_state', state);

  const params = new URLSearchParams({
    client_id: NBW_CLIENT_ID,
    redirect_uri: NBW_REDIRECT_URI,
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
