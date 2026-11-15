/**
 * 媒体缩略图地址工具：与后端 buildMediaPreviewUrl / buildAvatarPreviewUrl（src/lib/media-preview.ts）同一规则，
 * 也与 App 端优先使用小图地址、仅不可信来源退回原图的逻辑一致。
 *
 * 可信来源（自有图床 + 自有 COS 桶）统一走 Worker 的 v3 端点：Photon 现算缩放，产物按 colo 落
 * caches.default 共享 30 天。这样浏览器不再直连 COS 原图，也不必用腾讯云源站图片处理（按次计费）。
 */
const MEDIA_PREVIEW_PATH = '/api/v1/media/preview/v3/';
const AVATAR_PREVIEW_PATH = '/api/v1/media/avatar/v3/';
const PREVIEW_PATH_PREFIXES = [MEDIA_PREVIEW_PATH, AVATAR_PREVIEW_PATH];

// 与后端 TRUSTED_MEDIA_HOSTS 保持一致：自有图床 + 自有 COS 桶（公共读，未配 CDN）。
const TRUSTED_MEDIA_HOSTS = new Set([
  'img.abdl-space.top',
  'cloudflare-imgbed-790.pages.dev',
  'abdl-1339643562.cos.ap-shanghai.myqcloud.com',
]);

function encodeSource(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeSource(value) {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

const OWN_MEDIA_ORIGINS = new Set(['https://api.abdl-space.top', 'https://abdl-space-api.zhx589.workers.dev']);
const V3_PREVIEW = /^\/api\/v1\/media\/(?:preview|avatar)\/v3\/[A-Za-z0-9_-]+$/;

// Only exact, credential-free own v3 preview URLs become same-origin cookie-authenticated Pages requests.
export function firstPartyMediaPreviewUrl(source) {
  if (typeof source !== 'string' || !source) return source;
  if (V3_PREVIEW.test(source)) return source;
  try {
    const url = new URL(source);
    if (!OWN_MEDIA_ORIGINS.has(url.origin) || url.username || url.password || url.port || url.search || url.hash || !V3_PREVIEW.test(url.pathname)) return source;
    return url.pathname;
  } catch { return source; }
}

export function isFirstPartyMediaPreview(source) {
  return typeof source === 'string' && V3_PREVIEW.test(firstPartyMediaPreviewUrl(source));
}

function isTrustedSource(source) {
  try {
    return TRUSTED_MEDIA_HOSTS.has(new URL(source).hostname);
  } catch {
    return false;
  }
}

function previewUrlFor(source, path) {
  if (!source || !isTrustedSource(source)) return firstPartyMediaPreviewUrl(source);
  return `${path}${encodeSource(source)}`;
}

/**
 * 把图片原地址改写为缩略图地址；不可信来源原样返回。
 * @param {string} source 原图地址
 * @returns {string} 缩略图地址（不可用场景返回原地址）
 */
export function buildMediaPreviewUrl(source) {
  return previewUrlFor(source, MEDIA_PREVIEW_PATH);
}

/**
 * 头像缩略图地址：与内容图同一套边缘缓存，长边压到 160px（列表里实际显示 24–80px）。
 * 结果走同源 Pages 代理以携带 Cookie 与可信来源证明，重复调用仍幂等。
 * @param {string} source 头像原地址
 * @returns {string} 头像缩略图地址（不可用场景返回原地址）
 */
export function buildAvatarPreviewUrl(source) {
  return previewUrlFor(source, AVATAR_PREVIEW_PATH);
}

/**
 * 还原被 buildMediaPreviewUrl / buildAvatarPreviewUrl 改写过的地址，得到原始地址。
 * 提交给后端的字段必须先用它还原，否则会把派生地址写进库。
 * @param {string} source 可能是缩略图地址
 * @returns {string} 原始地址（未改写过则原样返回）
 */
export function originalMediaUrl(source) {
  if (!source) return source;
  const firstParty = firstPartyMediaPreviewUrl(source);
  if (!V3_PREVIEW.test(firstParty)) return source;
  const url = new URL(firstParty, 'https://abdl-space.top');
  const prefix = PREVIEW_PATH_PREFIXES.find((path) => url.pathname.startsWith(path));
  if (!prefix) return source;
  const encoded = url.pathname.slice(prefix.length);
  if (!encoded || encoded.includes('/')) return source;
  return decodeSource(encoded) || source;
}

const AVATAR_KEYS = new Set(['avatar', 'avatar_static']);

/**
 * 递归把接口响应里的头像字段换成缩略图地址，让所有渲染点（顶栏、帖子、私信、搜索结果…）不必各自改写。
 * 只改 avatar/avatar_static 两个展示字段，不碰 avatar_url 等可编辑字段，避免改坏要提交给后端的数据。
 * @param {*} value 接口返回的 JSON
 * @returns {*} 头像已改写为缩略图地址的副本
 */
export function withAvatarPreviews(value) {
  if (Array.isArray(value)) return value.map(withAvatarPreviews);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = AVATAR_KEYS.has(key) && typeof item === 'string'
      ? buildAvatarPreviewUrl(item)
      : ['preview_url', 'previewUrl'].includes(key) && typeof item === 'string' ? firstPartyMediaPreviewUrl(item) : withAvatarPreviews(item);
  }
  return result;
}
