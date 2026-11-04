// NBW 公共发现与展示 URL 的唯一边界；不改稳定身份、正文或任意请求主机。
import { withAuthHeader } from './authHeaders.js';
export const NBW_PRIMARY_ORIGIN = 'https://www.newbabyworld.top';
export const NBW_BACKUP_ORIGIN = 'https://nbw.abdlcalendar.top';
export const NBW_ENDPOINTS_PATH = '/api/nbw/endpoints';
const FIELDS = ['schema_version', 'revision', 'mode', 'api_origin', 'authorize_origin', 'public_origin', 'media_origin', 'ttl_seconds', 'remote_mode'];
const API_BASE = import.meta.env?.VITE_API_BASE || '';
const MESSAGES = Object.freeze({
  NBW_ENDPOINTS_UNAVAILABLE: '宝宝新天地配置暂不可用，请稍后刷新重试。',
  NBW_INVALID_RESPONSE: '宝宝新天地配置格式异常，请刷新或联系管理员。',
  NBW_REMOTE_DISABLED: '当前模式暂不允许宝宝新天地授权或注册。',
  NBW_OAUTH_CONTEXT_INVALID: '授权信息无效，请从当前站点重新发起授权。',
  NBW_OAUTH_CONTEXT_EXPIRED: '授权已过期，请重新发起授权。',
  NBW_OAUTH_CONTEXT_CONSUMED: '授权已处理，请勿重复提交，请重新发起授权。',
  NBW_OAUTH_UNAVAILABLE: '宝宝新天地授权暂不可用，请稍后重新发起。',
  NBW_ENDPOINT_CHANGED: '宝宝新天地配置已更新，请重新打开此操作。',
});
export class NBWError extends Error {
  constructor(code = 'NBW_ENDPOINTS_UNAVAILABLE') {
    const safe = Object.hasOwn(MESSAGES, code) ? code : 'NBW_ENDPOINTS_UNAVAILABLE';
    super(MESSAGES[safe]); this.name = 'NBWError'; this.code = safe;
  }
}
export const exactNBWFields = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
export function readNBWEndpoints(data) {
  const origin = data?.mode === 'primary' ? NBW_PRIMARY_ORIGIN : data?.mode === 'backup' ? NBW_BACKUP_ORIGIN : null;
  if (!exactNBWFields(data, FIELDS) || data.schema_version !== 1 || !origin
    || typeof data.revision !== 'string' || !/^[\x21-\x7e]{1,96}$/.test(data.revision)
    || !['api_origin', 'authorize_origin', 'public_origin', 'media_origin'].every(key => data[key] === origin)
    || !Number.isInteger(data.ttl_seconds) || data.ttl_seconds < 1 || data.ttl_seconds > 30
    || !['full', 'read_only', 'local_only'].includes(data.remote_mode)) throw new NBWError('NBW_INVALID_RESPONSE');
  return Object.freeze(Object.fromEntries(FIELDS.map(key => [key, data[key]])));
}

// 有界读取，非 JSON/HTML、过大响应、重定向与错误正文均不透传到日志或 UI。
export async function fetchNBWJSON(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options, signal: controller.signal, credentials: 'include', cache: 'no-store', redirect: 'error',
      referrerPolicy: 'strict-origin-when-cross-origin',
      headers: options.method === 'POST' ? withAuthHeader({ Accept: 'application/json', ...options.headers }) : { Accept: 'application/json', ...options.headers },
    });
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) throw new NBWError('NBW_INVALID_RESPONSE');
    const length = response.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > 32768)) throw new NBWError('NBW_INVALID_RESPONSE');
    const reader = response.body?.getReader();
    if (!reader) throw new NBWError('NBW_INVALID_RESPONSE');
    let size = 0, text = ''; const decoder = new TextDecoder('utf-8', { fatal: true });
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 32768) throw new NBWError('NBW_INVALID_RESPONSE');
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { await reader.cancel().catch(() => {}); }
    let data;
    try { data = JSON.parse(text); } catch { throw new NBWError('NBW_INVALID_RESPONSE'); }
    if (!response.ok) throw new NBWError(data?.code);
    return data;
  } catch (error) {
    throw error instanceof NBWError ? error : new NBWError();
  } finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); }
}

let state = Object.freeze({ endpoints: null, epoch: 0, expiresAt: 0, error: '' });
let requestId = 0, inflight = null;
const listeners = new Set();
const acquisitions = new WeakMap();
// 本地元数据不进入协议JSON，不给旧响应按写入时的current代次续租。
export function markNBWAcquisition(value, epoch) { if (value && typeof value === 'object') acquisitions.set(value, epoch); }
export function nbwAcquisitionEpoch(value) { return value && typeof value === 'object' ? acquisitions.get(value) : undefined; }
export const getNBWEndpointState = () => state;
export function subscribeNBWEndpoints(listener) { listeners.add(listener); return () => listeners.delete(listener); }
const publish = next => { state = Object.freeze(next); for (const listener of listeners) listener(); };
export function nbwEndpointKey(endpoints = state.endpoints) {
  return endpoints ? JSON.stringify(FIELDS.filter(key => key !== 'ttl_seconds').map(key => endpoints[key])) : '';
}
function accept(endpoints) {
  const changed = nbwEndpointKey(endpoints) !== nbwEndpointKey();
  publish({ endpoints, epoch: state.epoch + (changed ? 1 : 0), expiresAt: Date.now() + endpoints.ttl_seconds * 1000, error: '' });
  return endpoints;
}
// OAuth config 同样携带一次一致快照，压过较早发起但尚未返回的 discovery。
export function adoptNBWEndpoints(data) {
  const endpoints = readNBWEndpoints(data); requestId += 1; inflight = null;
  return accept(endpoints);
}
export async function refreshNBWEndpoints({ force = false } = {}) {
  if (!force && state.endpoints && Date.now() < state.expiresAt && !state.error) return state.endpoints;
  if (inflight) return inflight;
  const ticket = ++requestId;
  const request = (async () => {
    try {
      const endpoints = readNBWEndpoints(await fetchNBWJSON(NBW_ENDPOINTS_PATH));
      if (ticket !== requestId) {
        if (!state.endpoints || state.error) throw new NBWError('NBW_ENDPOINT_CHANGED');
        return state.endpoints;
      }
      return accept(endpoints);
    } catch (error) {
      if (ticket === requestId) publish({ endpoints: null, epoch: state.epoch + (state.endpoints ? 1 : 0), expiresAt: 0, error: error.message });
      throw error;
    } finally { if (ticket === requestId) inflight = null; }
  })();
  inflight = request;
  return request;
}

// 只接受字面两 origin；不把 WHATWG 的百分号主机、默认端口、userinfo、反斜杠归一化当可信。
// 返回原始后缀而非 URL.href，保持资源签名、path/query/hash 的逐字节语义。
export function nbwURLSuffix(value) {
  if (typeof value !== 'string' || value.length > 8192 || /[\x00-\x20\x7f\\]/.test(value)) return null;
  const match = /^(https:\/\/(?:www\.newbabyworld\.top|nbw\.abdlcalendar\.top))(?=\/|\?|#|$)(.*)$/.exec(value);
  return match ? match[2] : null;
}
export function isNBWSensitiveURL(value) {
  if (nbwURLSuffix(value) === null) return false;
  try {
    const url = new URL(value);
    let path = url.pathname;
    try { path = decodeURIComponent(path); } catch {}
    return /^\/oauth(?:\/|$)/i.test(path) || [...url.searchParams.keys()].some(key => /^(?:code|state|token|access_token|refresh_token|id_token|client_secret|oauth_context|nbw_token|nbw_code|nbw_oauth_context)$/i.test(key));
  } catch { return true; }
}
export function resolveNBWDisplayURL(value, endpoints = state.endpoints, kind = 'public') {
  const suffix = nbwURLSuffix(value);
  if (suffix === null) return value;
  // OAuth/code/token 是固定事务，不是可跨域投影的公开资源；媒体也不加载凭据URL。
  if (isNBWSensitiveURL(value)) return kind === 'media' ? undefined : value;
  // 冷启动先占位，不能把旧缓存 primary URL 当成当前 authority 并提前出站。
  if (!endpoints) return undefined;
  const origin = kind === 'media' ? endpoints.media_origin : endpoints.public_origin;
  if (![NBW_PRIMARY_ORIGIN, NBW_BACKUP_ORIGIN].includes(origin)) return value;
  return `${origin}${suffix}`;
}
// 只识别展示字段来隔离相关帖子缓存，不递归改写 JSON 或检查任意正文。
export function hasNBWDisplayData(value) {
  const image = item => typeof item === 'string' ? nbwURLSuffix(item) !== null : item && ['url', 'image_url', 'src', 'preview_url'].some(key => nbwURLSuffix(item[key]) !== null);
  const user = item => !!item && ['avatar', 'avatar_static'].some(key => nbwURLSuffix(item[key]) !== null);
  const post = item => !!item && (item.nbw_tid != null || item.source === 'nbw' || image(item.url) || user(item.user)
    || (Array.isArray(item.images) && item.images.some(image)) || user(item.repost?.user) || (Array.isArray(item.repost?.images) && item.repost.images.some(image)));
  if (post(value?.post) || post(value)) return true;
  return ['posts', 'comments'].some(key => Array.isArray(value?.[key]) && value[key].some(post));
}
export function registrationNBWURL(value, endpoints = state.endpoints) {
  if (!endpoints || nbwURLSuffix(value) === null || endpoints.remote_mode !== 'full') throw new NBWError('NBW_INVALID_RESPONSE');
  return resolveNBWDisplayURL(value, endpoints);
}
