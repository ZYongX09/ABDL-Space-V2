/**
 * 媒体缩略图地址工具：与后端 buildMediaPreviewUrl（src/lib/media-preview.ts）保持同一规则，
 * 也与 App 端优先使用小图地址、仅非图床来源退回原图的逻辑一致。
 *
 * 网页端展示一律用它取图：预览地址（后端下发的 preview_url）→ 按来源规则拼缩略图 → 原图。
 * - COS 直连对象（未配 CDN）：走源站图片处理，长边 720 的 WebP，不放大。
 * - 图床来源：走 GET /api/v1/media/preview/v3/:source，后端 Worker 按需缩放，非法来源 302 回原图。
 */
const MEDIA_PREVIEW_PATH = '/api/v1/media/preview/v3/';
const TRUSTED_MEDIA_HOSTS = new Set([
  'img.abdl-space.top',
  'cloudflare-imgbed-790.pages.dev',
]);
const COS_MEDIA_HOST_SUFFIX = '.myqcloud.com';
const COS_THUMBNAIL_QUERY = 'imageMogr2/thumbnail/720x720>/format/webp/quality/80';
const ANIMATED_MEDIA_EXTENSIONS = ['.gif'];

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
 * 腾讯云 COS 源站缩略图地址；返回 null 表示该对象不适用，调用方应回退到原地址。
 * 动态图（GIF）经 imageMogr2 只剩静态首帧，故不改写；已带查询串的对象可能是签名 URL，改写会破坏签名。
 */
function buildCosThumbnailUrl(source) {
  let url;
  try {
    url = new URL(source);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (!url.hostname.toLowerCase().endsWith(COS_MEDIA_HOST_SUFFIX)) return null;
  if (url.search) return null;
  const path = url.pathname.toLowerCase();
  if (ANIMATED_MEDIA_EXTENSIONS.some((ext) => path.endsWith(ext))) return null;
  return `${source}?${COS_THUMBNAIL_QUERY}`;
}

/**
 * 把图片原地址改写为缩略图地址；COS 走源站处理，可信图床走后端预览端点，其余原样返回。
 * @param {string} source 原图地址
 * @returns {string} 缩略图地址（不可用场景返回原地址）
 */
export function buildMediaPreviewUrl(source) {
  if (!source) return source;
  const cosThumbnail = buildCosThumbnailUrl(source);
  if (cosThumbnail) return cosThumbnail;
  let hostname;
  try {
    hostname = new URL(source).hostname;
  } catch {
    return source;
  }
  if (!TRUSTED_MEDIA_HOSTS.has(hostname)) return source;
  return `${mediaApiOrigin()}${MEDIA_PREVIEW_PATH}${encodeSource(source)}`;
}
