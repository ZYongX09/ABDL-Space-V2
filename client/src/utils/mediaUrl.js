/**
 * 媒体缩略图地址工具：与后端 buildMediaPreviewUrl（src/lib/media-preview.ts）保持同一规则，
 * 也与 App 端优先使用小图地址、仅非图床来源退回原图的逻辑一致。
 *
 * 网页端展示一律用它取图：预览地址（后端下发的 preview_url）→ 按 CDN 规则拼缩略图 → 原图。
 * 端点 GET /api/v1/media/preview/v3/:source 由后端 Worker 提供，读到非法来源时 302 回原图。
 */
const MEDIA_PREVIEW_PATH = '/api/v1/media/preview/v3/';
const TRUSTED_MEDIA_HOSTS = new Set([
  'img.abdl-space.top',
  'cloudflare-imgbed-790.pages.dev',
]);

function encodeSource(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function mediaApiOrigin() {
  const base = import.meta.env?.VITE_API_BASE?.replace(/\/+$/, '');
  return base || 'https://api.abdl-space.top';
}

/**
 * 把图片原地址改写为缩略图地址；仅在图片来自可信图床时改写，其余情况原样返回。
 * @param {string} source 原图地址
 * @returns {string} 缩略图地址（不可用场景返回原地址）
 */
export function buildMediaPreviewUrl(source) {
  if (!source) return source;
  let hostname;
  try {
    hostname = new URL(source).hostname;
  } catch {
    return source;
  }
  if (!TRUSTED_MEDIA_HOSTS.has(hostname)) return source;
  return `${mediaApiOrigin()}${MEDIA_PREVIEW_PATH}${encodeSource(source)}`;
}