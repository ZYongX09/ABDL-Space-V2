/**
 * 读取当前登录账号的 JWT，用于必须走 Authorization 头的接口
 * （例如 /api/v1/* 的 Mastodon 兼容端点只认 Bearer，不认 httpOnly Cookie）。
 */
export function getActiveToken() {
  try {
    const accounts = JSON.parse(localStorage.getItem('abdl_accounts') || '[]');
    const activeId = localStorage.getItem('abdl_active_account');
    return accounts.find(account => String(account.id) === String(activeId))?.token || '';
  } catch {
    return '';
  }
}

export function withAuthHeader(headers = {}) {
  const token = getActiveToken();
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
}
