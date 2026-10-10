import { AD_STATUSES, COUNTERS, isObject } from './model.js';

const idValue = value => ['string', 'number'].includes(typeof value) && String(value).length > 0;
const integer = value => Number.isInteger(value) && value >= 0;
function validPage(data) {
  const p = data?.pagination;
  return isObject(data) && Array.isArray(data.items) && isObject(p) && integer(p.page) && p.page >= 1 && integer(p.limit) && p.limit >= 1 && integer(p.total) && integer(p.totalPages);
}
function validAd(data) { return isObject(data) && idValue(data.id) && typeof data.status === 'string' && Object.hasOwn(AD_STATUSES, data.status) && typeof data.body === 'string'; }
function validInfo(data) {
  return isObject(data) && ['authorized', 'active', 'is_super_admin', 'identity_required'].every(key => typeof data[key] === 'boolean')
    && isObject(data.permissions) && ['can_manage_all', 'can_override_advertiser', 'can_edit_identity'].every(key => typeof data.permissions[key] === 'boolean')
    && (data.profile == null || isObject(data.profile)) && (data.merchant == null || isObject(data.merchant));
}
function validStats(data) {
  const keys = COUNTERS.map(([key]) => key);
  const counters = row => isObject(row) && keys.every(key => typeof row[key] === 'number' && Number.isFinite(row[key]) && row[key] >= 0);
  return counters(data) && Array.isArray(data.daily) && data.daily.every(row => counters(row) && /^\d{4}-\d{2}-\d{2}$/.test(row.date));
}
const validators = {
  info: validInfo,
  profile: data => data === null || (isObject(data) && (data.profile === null || typeof data.display_name === 'string')),
  ads: data => validPage(data) && data.items.every(validAd),
  ad: validAd,
  stats: validStats,
  audit: data => validPage(data) && data.items.every(row => isObject(row) && idValue(row.id) && typeof row.action === 'string' && typeof row.created_at === 'string'),
  merchants: data => validPage(data) && data.items.every(row => isObject(row) && idValue(row.id) && ['active', 'suspended'].includes(row.status) && typeof row.display_name === 'string'),
};
export function createMerchantAPI({ base = '', fetcher = (...args) => fetch(...args), getToken = () => '', isCurrentSession = () => true, timeoutMs = 30000 } = {}) {
  const controllers = new Set();
  const cleanBase = String(base).replace(/\/$/, '');
  if (cleanBase && !/^https?:\/\//.test(cleanBase)) throw new Error('商家 API 地址无效。');
  const assertSession = () => { if (!isCurrentSession()) { const error = new Error('账户会话已切换，已忽略旧账户响应。'); error.name = 'AbortError'; throw error; } };
  async function request(path, { method = 'GET', body, signal, shape, upload = false } = {}) {
    assertSession();
    if (signal?.aborted) throw new DOMException('请求已取消', 'AbortError');
    const controller = new AbortController();
    controllers.add(controller);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, upload ? Math.max(timeoutMs, 90000) : timeoutMs);
    try {
      const headers = { Accept: 'application/json' };
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body !== undefined && !upload) headers['Content-Type'] = 'application/json';
      const response = await fetcher(`${cleanBase}${path}`, { method, headers, credentials: 'include', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal, ...(body !== undefined ? { body: upload ? body : JSON.stringify(body) } : {}) });
      assertSession();
      if (controller.signal.aborted) throw new DOMException('请求已取消', 'AbortError');
      let data = null;
      if (response.status !== 204) {
        try { data = await response.json(); }
        catch { throw new Error(method === 'GET' ? '服务器响应无法解析，请手动重试。' : '服务器响应无法解析；操作结果未确认，请先重新读取数据。'); }
      }
      assertSession();
      if (controller.signal.aborted) throw new DOMException('请求已取消', 'AbortError');
      if (!response.ok) {
        const fallback = response.status === 401 ? '登录已过期，请重新登录。' : response.status === 403 ? '当前账户没有此操作权限。' : `请求失败（${response.status}）。`;
        const error = new Error(typeof data?.error === 'string' ? data.error : fallback);
        error.status = response.status;
        error.code = data?.code || '';
        throw error;
      }
      if (shape && !validators[shape](data)) throw new Error('服务器响应与商家接口契约不一致，请重新读取并联系维护者。');
      if (!shape && data !== null && !isObject(data)) throw new Error('服务器操作响应无效；请重新读取数据确认结果。');
      return data;
    } catch (error) {
      if (timedOut) throw new Error(method === 'GET' ? '请求超时，请手动重试。' : '请求超时；操作可能已受理，请重新读取数据确认结果。');
      if (error instanceof TypeError) throw new Error('网络连接失败，请检查连接后手动重试。');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      controllers.delete(controller);
    }
  }
  const root = '/api/merchant';
  const id = value => {
    if (!idValue(value)) throw new Error('记录 ID 无效。');
    return encodeURIComponent(String(value));
  };
  const query = params => {
    const values = new URLSearchParams();
    for (const [key, value] of Object.entries(params || {})) if (value !== '' && value != null) values.set(key, String(value));
    return values.size ? `?${values}` : '';
  };
  const read = (path, shape, options) => request(`${root}${path}`, { ...options, shape });
  const write = (path, method, body, options) => request(`${root}${path}`, { ...options, method, body });
  return {
    info: (options) => read('/info', 'info', options),
    profile: (options) => read('/profile', 'profile', options),
    activate: (body, options) => write('/activate', 'POST', body, options),
    identity: (body, options) => write('/identity', 'POST', body, options),
    updateProfile: (body, options) => write('/profile', 'PATCH', body, options),
    ads: (params, options) => read(`/ads${query(params)}`, 'ads', options),
    ad: (adId, options) => read(`/ads/${id(adId)}`, 'ad', options),
    createAd: (body, options) => write('/ads', 'POST', body, options),
    updateAd: (adId, body, options) => write(`/ads/${id(adId)}`, 'PATCH', body, options),
    cloneAd: (adId, options) => write(`/ads/${id(adId)}/clone`, 'POST', {}, options),
    archiveAd: (adId, options) => write(`/ads/${id(adId)}`, 'DELETE', {}, options),
    stats: (params, options) => read(`/stats${query(params)}`, 'stats', options),
    audit: (params, options) => read(`/audit${query(params)}`, 'audit', options),
    merchants: (params, options) => read(`/merchants${query(params)}`, 'merchants', options),
    merchantStatus: (merchantId, status, options) => write(`/merchants/${id(merchantId)}/status`, 'PATCH', { status }, options),
    async upload(file, options) {
      if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file?.type) || !file.size || file.size > 10 * 1024 * 1024) throw new Error('请上传不超过 10MB 的 JPG、PNG、GIF 或 WebP 图片。');
      const body = new FormData(); body.append('file', file);
      const data = await request('/api/images/upload', { ...options, method: 'POST', body, upload: true });
      if (typeof data?.url !== 'string' || !/^https:\/\//.test(data.url)) throw new Error('上传未返回有效的 HTTPS 图片地址。');
      return data.url;
    },
    abortAll: () => controllers.forEach(controller => controller.abort()),
  };
}
