import { withAuthHeader } from './utils/authHeaders.js';

export const SCREENSHOT_GROUPS = [
  { id: 'community', label: '社区动态' },
  { id: 'rankings', label: '排行榜' },
  { id: 'reading', label: '小说阅读' },
];
export const SCREENSHOT_THEMES = [{ id: 'light', label: '浅色' }, { id: 'dark', label: '深色' }];
export const SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_SCREENSHOT_BYTES = 3 * 1024 * 1024;
const PUBLIC = '/api/app-download/screenshots';
const ADMIN = '/api/admin/app-clients/download-screenshots';
const REVISION = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SLOTS = new Set(SCREENSHOT_GROUPS.flatMap(({ id }) => SCREENSHOT_THEMES.map(theme => `${id}-${theme.id}`)));
const INVALID_RESPONSE = '截图服务的响应无效';

function parseSlot(row, prefix) {
  if (!SLOTS.has(row?.slot) || typeof row.revision !== 'string' || (row.revision !== '0' && !REVISION.test(row.revision))) throw new Error(INVALID_RESPONSE);
  if (row.image === null && prefix === ADMIN) return { slot: row.slot, revision: row.revision, image: null };
  const { width, height, url } = row.image || {};
  if (row.revision === '0' || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < width || height > 3200
    || width * height > 3600000 || url !== `${prefix}/${row.slot}/${row.revision}.webp`) throw new Error(INVALID_RESPONSE);
  return { slot: row.slot, revision: row.revision, image: { width, height, url } };
}

async function request(path, { headers, ...options } = {}) {
  const response = await fetch(path, {
    ...options, headers: withAuthHeader(headers || {}), credentials: 'same-origin', mode: 'same-origin',
    cache: 'no-store', redirect: 'error', referrerPolicy: 'origin',
  });
  if (!response.ok) {
    let message;
    if (response.headers.get('content-type')?.split(';')[0] === 'application/json') {
      const data = await response.json().catch(() => null);
      if (typeof data?.error === 'string') message = data.error;
    }
    throw Object.assign(new Error(message || `截图请求失败（${response.status}）`), { status: response.status });
  }
  return response;
}

async function manifest(prefix, signal) {
  const response = await request(prefix, { headers: { Accept: 'application/json' }, signal });
  const data = await response.json();
  if (!Array.isArray(data?.screenshots) || data.screenshots.length > SLOTS.size || (prefix === ADMIN && data.screenshots.length !== SLOTS.size)) throw new Error(INVALID_RESPONSE);
  const slots = Object.create(null);
  for (const value of data.screenshots) {
    const row = parseSlot(value, prefix);
    if (Object.hasOwn(slots, row.slot)) throw new Error(INVALID_RESPONSE);
    slots[row.slot] = row;
  }
  return slots;
}

export const getDownloadScreenshots = signal => manifest(PUBLIC, signal);
export const getAdminDownloadScreenshots = signal => manifest(ADMIN, signal);

export function chooseDownloadScreenshots(slots, feature, theme) {
  const primary = theme === 'light' ? 'light' : 'dark';
  const alternate = primary === 'light' ? 'dark' : 'light';
  return [slots?.[`${feature}-${primary}`]?.image, slots?.[`${feature}-${alternate}`]?.image].filter(Boolean);
}

export async function saveDownloadScreenshot(slot, revision, file, signal) {
  if (!SLOTS.has(slot) || typeof revision !== 'string' || (revision !== '0' && !REVISION.test(revision))) throw new Error('此槽位的版本无效，请重新加载');
  if (file && (!SCREENSHOT_TYPES.includes(file.type) || file.size < 1 || file.size > MAX_SCREENSHOT_BYTES)) throw new Error('请选择 3 MiB 内的 PNG、JPEG 或 WebP 图片');
  const response = await request(`${ADMIN}/${slot}?revision=${revision}`, {
    method: file ? 'PUT' : 'DELETE', body: file || undefined,
    headers: file ? { Accept: 'application/json', 'Content-Type': file.type } : { Accept: 'application/json' }, signal,
  });
  const row = parseSlot(await response.json(), ADMIN);
  if (row.slot !== slot) throw new Error(INVALID_RESPONSE);
  return row;
}

export async function getScreenshotBlob(url, signal) {
  const prefix = [PUBLIC, ADMIN].find(path => typeof url === 'string' && url.startsWith(`${path}/`));
  const [slot, filename, ...rest] = prefix ? url.slice(prefix.length + 1).split('/') : [];
  const revision = filename?.endsWith('.webp') ? filename.slice(0, -5) : '';
  if (!SLOTS.has(slot) || !REVISION.test(revision) || rest.length) throw new Error(INVALID_RESPONSE);
  const response = await request(url, { headers: { Accept: 'image/webp' }, signal });
  const type = response.headers.get('content-type')?.split(';')[0];
  const length = response.headers.get('content-length');
  if (type !== 'image/webp' || (length && Number(length) > MAX_SCREENSHOT_BYTES)) { void response.body?.cancel().catch(() => {}); throw new Error(INVALID_RESPONSE); }
  const blob = await response.blob();
  if (!blob.size || blob.size > MAX_SCREENSHOT_BYTES) throw new Error(INVALID_RESPONSE);
  return blob;
}