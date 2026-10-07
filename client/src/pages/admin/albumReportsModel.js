/**
 * 相册举报管理 — 纯逻辑模型（无 React / DOM 依赖，node --test 可测）。
 * 契约：GET /api/admin/album-reports?status=open|resolved|all&limit&offset -> { reports, total }
 *      GET /api/admin/album-reports/:id -> report + photos[{ id, admin_blocked, preview_url, width, height, description }]
 *      POST /api/admin/album-reports/:id/block { photo_ids, operation_id } -> { blocked_photo_ids }（幂等全量期望状态）
 *      POST /api/admin/album-reports/:id/resolve {} -> 已处理
 * 安全边界：管理端只允许展示 preview_url；hd/original 等任何其他地址字段一律剥离，绝不进入组件状态。
 */

export const PAGE_SIZE = 20;
export const REPORT_STATUSES = ['open', 'resolved', 'all'];

/** 屏蔽照片的本地占位资源（client/public/violation.png，随构建打包）。 */
export const VIOLATION_PLACEHOLDER = '/violation.png';

const asString = (v) => (typeof v === 'string' ? v : (v == null ? '' : String(v)));
const asCount = (v) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
};

/** status 归一化；未知值回退 'open'（列表默认待处理）。 */
export function normalizeStatus(value) {
  return REPORT_STATUSES.includes(value) ? value : 'open';
}

/** 列表/分页计算：offset = (page-1)*PAGE_SIZE，页码夹取到有效范围。 */
export function paginationState(total, page) {
  const safeTotal = asCount(total);
  const totalPages = Math.max(1, Math.ceil(safeTotal / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, Math.floor(Number(page)) || 1), totalPages);
  return { page: safePage, totalPages, total: safeTotal, offset: (safePage - 1) * PAGE_SIZE };
}

/**
 * 报告行归一化：只保留白名单字段，避免服务端未来新增字段（如相册直链）意外进入渲染层。
 */
export function normalizeReport(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: raw.id != null ? asString(raw.id) : '',
    album_id: raw.album_id != null ? asString(raw.album_id) : '',
    album_name: asString(raw.album_name),
    owner_id: raw.owner_id != null ? asString(raw.owner_id) : '',
    reporter_id: raw.reporter_id != null ? asString(raw.reporter_id) : '',
    reason: asString(raw.reason),
    detail: asString(raw.detail),
    created_at: asString(raw.created_at),
    resolved_at: asString(raw.resolved_at),
    status: raw.status === 'resolved' ? 'resolved' : 'open',
    blocked_photo_count: asCount(raw.blocked_photo_count),
    album_photo_count: asCount(raw.album_photo_count),
    download_protected: raw.download_protected === true || raw.download_protected === 1,
  };
}

/**
 * 仅接受 http(s) 绝对地址或站内相对路径；其余（data:/javascript:/blob: 等）一律视为不可展示。
 * 这是“只展示预览图”防泄漏的最后一道闸。
 */
export function safePreviewUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (/^https:\/\//i.test(value) || /^http:\/\//i.test(value)) return value;
  return null;
}

/**
 * 照片归一化：白名单之外的字段（hd_url / original_url / signed 原图等）直接丢弃，
 * 已屏蔽或预览地址非法的照片一律回退本地违规占位图。
 */
export function normalizePhoto(raw) {
  if (!raw || typeof raw !== 'object' || raw.id == null) return null;
  const adminBlocked = raw.admin_blocked === true || raw.admin_blocked === 1;
  return {
    id: asString(raw.id),
    admin_blocked: adminBlocked,
    preview_url: adminBlocked ? null : safePreviewUrl(raw.preview_url),
    width: asCount(raw.width),
    height: asCount(raw.height),
    description: asString(raw.description),
  };
}

/** 组件渲染用的图片地址：屏蔽或无预览 -> 本地占位资源。 */
export function photoDisplayUrl(photo) {
  return photo && !photo.admin_blocked && photo.preview_url ? photo.preview_url : VIOLATION_PLACEHOLDER;
}

/** photos 数组归一化（丢弃非法项并去重）。 */
export function normalizePhotos(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const photo = normalizePhoto(item);
    if (!photo || seen.has(photo.id)) continue;
    seen.add(photo.id);
    out.push(photo);
  }
  return out;
}

/** 生成幂等操作标识 UUID（无 crypto.randomUUID 的旧环境用 getRandomValues 兜底）。 */
export function newOperationId(cryptoObj = globalThis.crypto) {
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') cryptoObj.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}

/**
 * 计算全量期望屏蔽集合：勾选 = 期望屏蔽（含当前已屏蔽），未勾选 = 期望解除。
 * POST /block 只接收该全量集合，天然幂等且支持“同端点解除”。
 */
export function desiredBlockedIds(photos, checkedOverrides = {}) {
  const desired = new Set();
  for (const photo of photos || []) {
    const checked = checkedOverrides[photo.id];
    const shouldBlock = typeof checked === 'boolean' ? checked : photo.admin_blocked;
    if (shouldBlock) desired.add(photo.id);
  }
  return [...desired];
}

/** 与服务器当前状态对比，得到将要屏蔽/解除的增量，用于按钮可用性与提示。 */
export function diffBlockedState(photos, checkedOverrides = {}) {
  const toBlock = [];
  const toUnblock = [];
  for (const photo of photos || []) {
    const checked = checkedOverrides[photo.id];
    const shouldBlock = typeof checked === 'boolean' ? checked : photo.admin_blocked;
    if (shouldBlock && !photo.admin_blocked) toBlock.push(photo.id);
    if (!shouldBlock && photo.admin_blocked) toUnblock.push(photo.id);
  }
  return { toBlock, toUnblock, hasChanges: toBlock.length > 0 || toUnblock.length > 0 };
}
