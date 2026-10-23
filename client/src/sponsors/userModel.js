import { identifier, integer, required, validateConfig } from './adminModel.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[0-9a-f]{64}$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const MAX_SECONDS = 8640000000000;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}必须是对象`);
  return value;
}
function array(value, label, max = Number.MAX_SAFE_INTEGER, min = 0) {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${label}数量必须为 ${min} 至 ${max}`);
  return value;
}
function boolean(value, label) {
  if (typeof value !== 'boolean') throw new Error(`${label}必须为布尔值`);
  return value;
}
function text(value, label, max) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${label}必须是最多 ${max} 个字符的文本`);
  return value;
}
function seconds(value, label, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_SECONDS) throw new Error(`${label}必须是有效的秒时间戳`);
  return value;
}
function color(value, label) {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) throw new Error(`${label}必须为六位十六进制颜色`);
  return value;
}
function unique(items, key, label) {
  if (new Set(items.map(item => key ? item[key] : item)).size !== items.length) throw new Error(`${label}不能重复`);
  return items;
}

function catalogPlan(value) {
  const plan = { ...object(value, '套餐') };
  plan.id = identifier(plan.id, '套餐标识');
  plan.version = integer(plan.version, '套餐版本', 1, 2147483647);
  plan.name = required(plan.name, '套餐名称', 100);
  plan.description = text(plan.description, '套餐说明', 2000);
  plan.price_minor = integer(plan.price_minor, '价格（分）', 0, 100000000);
  if (plan.currency !== 'CNY') throw new Error('套餐币种必须为 CNY');
  if (!['day', 'month', 'permanent'].includes(plan.duration_unit)) throw new Error('套餐时长单位无效');
  plan.duration_count = integer(plan.duration_count, '时长数量', plan.duration_unit === 'permanent' ? 0 : 1, plan.duration_unit === 'permanent' ? 0 : plan.duration_unit === 'month' ? 120 : 3650);
  plan.sort_order = integer(plan.sort_order, '套餐排序', -10000, 10000);
  plan.enabled = boolean(plan.enabled, '套餐启用状态');
  // 展示数据不等于购买授权；空链接或不安全的映射只会使购买入口不可用。
  plan.purchase_url = text(plan.purchase_url, '购买链接', 8192);
  plan.afdian_plan_id = text(plan.afdian_plan_id, '商品映射', 64).trim();
  plan.afdian_sku_id = text(plan.afdian_sku_id, '规格映射', 64).trim();
  return plan;
}

export function validateCatalog(data) {
  const result = { ...object(data, '赞助目录') };
  const config = { ...object(result.config, '赞助配置') };
  config.enabled = boolean(config.enabled, '赞助中心启用状态');
  config.default_color_key = identifier(config.default_color_key, '默认颜色标识');
  config.colors = array(config.colors, '颜色', 20, 1).map(value => {
    const item = { ...object(value, '颜色') };
    item.permanent_only = boolean(item.permanent_only, '永久专属颜色状态');
    return item;
  });
  config.benefits = array(config.benefits, '权益', 30).map(value => {
    const item = { ...object(value, '权益') };
    item.description = text(item.description, '权益说明', 1000);
    return item;
  });
  result.config = validateConfig(config);
  result.plans = unique(array(result.plans, '套餐', 200).map(catalogPlan), 'id', '套餐标识');
  return result;
}

export function validateMe(data) {
  const result = { ...object(data, '赞助账户数据') };
  const sponsor = { ...object(result.sponsor, '赞助状态') };
  sponsor.active = boolean(sponsor.active, '赞助生效状态');
  sponsor.permanent = boolean(sponsor.permanent, '永久赞助状态');
  sponsor.expires_at = seconds(sponsor.expires_at, '赞助到期时间', true);
  sponsor.plan_name = sponsor.plan_name === null ? null : text(sponsor.plan_name, '套餐名称', 100);
  sponsor.color_key = sponsor.color_key === null ? null : identifier(sponsor.color_key, '颜色标识');
  sponsor.color_light = sponsor.color_light === null ? null : color(sponsor.color_light, '浅色主题颜色');
  sponsor.color_dark = sponsor.color_dark === null ? null : color(sponsor.color_dark, '深色主题颜色');
  result.sponsor = sponsor;
  const quota = { ...object(result.quota, '每日额度') };
  for (const key of ['limit', 'used', 'remaining']) quota[key] = integer(quota[key], '每日额度');
  if (quota.remaining !== Math.max(0, quota.limit - quota.used)) throw new Error('每日剩余额度必须与上限和已用额度一致');
  quota.resets_at = seconds(quota.resets_at, '额度重置时间');
  if (quota.resets_at === 0) throw new Error('额度重置时间必须大于零');
  if (typeof quota.day_key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(quota.day_key) || quota.day_key.startsWith('0000') || !Number.isFinite(Date.parse(`${quota.day_key}T00:00:00Z`)) || new Date(`${quota.day_key}T00:00:00Z`).toISOString().slice(0, 10) !== quota.day_key) throw new Error('额度日期必须是有效的 YYYY-MM-DD 日期');
  result.quota = quota;
  result.config_version = integer(result.config_version, '配置版本', 1, 2147483647);
  result.notice_required = boolean(result.notice_required, '须知确认状态');
  result.claimed_benefit_ids = unique(array(result.claimed_benefit_ids, '已领取权益', 30).map(value => identifier(value, '已领取权益标识')), null, '已领取权益标识');
  if (Object.hasOwn(result, 'album_quota') && result.album_quota !== null) {
    const album = { ...object(result.album_quota, '相册额度') };
    for (const key of ['limit_bytes', 'used_bytes', 'reserved_bytes', 'remaining_bytes']) album[key] = integer(album[key], '相册字节额度');
    if (album.remaining_bytes > album.limit_bytes) throw new Error('相册剩余额度不能超过上限');
    album.tier = identifier(album.tier, '相册额度等级');
    album.sponsor_active = boolean(album.sponsor_active, '相册赞助生效状态');
    album.original_upload_allowed = boolean(album.original_upload_allowed, '原图上传状态');
    result.album_quota = album;
  }
  if (Object.hasOwn(result, 'message')) result.message = text(result.message, '操作提示', 3000);
  return result;
}

export function validateHistory(data) {
  const result = { ...object(data, '兑换历史') };
  result.total = integer(result.total, '兑换历史总数');
  result.items = unique(array(result.items, '兑换历史').map(value => {
    const item = { ...object(value, '兑换记录') };
    item.id = required(item.id, '兑换记录标识', 200);
    item.plan_name = required(item.plan_name, '历史套餐名称', 100);
    item.redeemed_at = seconds(item.redeemed_at, '兑换时间');
    item.expires_at = seconds(item.expires_at, '历史到期时间', true);
    item.permanent = boolean(item.permanent, '历史永久状态');
    return item;
  }), 'id', '兑换记录标识');
  if (result.items.length > result.total) throw new Error('兑换历史数量不能超过总数');
  return result;
}

export function isActiveSponsor(sponsor, nowSeconds = Date.now() / 1000) {
  return sponsor?.active === true && typeof nowSeconds === 'number' && Number.isFinite(nowSeconds)
    && (sponsor.permanent === true || (sponsor.permanent === false && typeof sponsor.expires_at === 'number' && Number.isFinite(sponsor.expires_at) && sponsor.expires_at > nowSeconds));
}

export function safeSponsorPurchaseURL(plan) {
  try {
    const value = plan?.purchase_url;
    if (typeof value !== 'string' || /[<>\s\\\x00-\x1f\x7f#]/.test(value) || !/^https:\/\/ifdian\.net\/order\/create\?/i.test(value)) return null;
    if (typeof plan.afdian_plan_id !== 'string' || typeof plan.afdian_sku_id !== 'string' || !/^[0-9a-f]{32}$/i.test(plan.afdian_plan_id) || !/^[0-9a-f]{32}$/i.test(plan.afdian_sku_id)) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'ifdian.net' || url.port || url.username || url.password || url.hash || url.pathname !== '/order/create') return null;
    const allowed = new Set(['product_type', 'plan_id', 'sku', 'viokrz_ex']);
    const parts = url.search.slice(1).split('&');
    // 不接受解析器可能忽略的空参数、编码参数名、重复参数或额外参数。
    if (parts.some(part => !allowed.has(part.slice(0, part.indexOf('='))))) return null;
    for (const key of url.searchParams.keys()) if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) return null;
    if (url.searchParams.get('product_type') !== '1' || url.searchParams.get('plan_id') !== plan.afdian_plan_id || (url.searchParams.has('viokrz_ex') && url.searchParams.get('viokrz_ex') !== '0')) return null;
    const skuText = url.searchParams.get('sku');
    const skus = JSON.parse(skuText);
    if (!Array.isArray(skus) || skus.length !== 1 || !skus[0] || typeof skus[0] !== 'object' || Array.isArray(skus[0]) || Object.keys(skus[0]).length !== 2 || skus[0].sku_id !== plan.afdian_sku_id || skus[0].count !== 1) return null;
    // JSON.parse 会覆盖重复成员，故额外拒绝 SKU 对象内的重复键。
    if ((skuText.match(/"(?:[^"\\]|\\.)*"\s*:/g) || []).length !== 2) return null;
    return url.href;
  } catch { return null; }
}

export function planDuration(plan) {
  if (plan?.duration_unit === 'permanent' && plan.duration_count === 0) return '永久';
  const max = plan?.duration_unit === 'day' ? 3650 : plan?.duration_unit === 'month' ? 120 : 0;
  if (!Number.isSafeInteger(plan?.duration_count) || plan.duration_count < 1 || plan.duration_count > max) return '—';
  return `${plan.duration_count} ${plan.duration_unit === 'day' ? '天' : '个月'}`;
}

export function formatBytes(n) {
  if (!Number.isSafeInteger(n) || n < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = n === 0 ? 0 : Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${Number((n / 1024 ** index).toFixed(2))} ${units[index]}`;
}

export function formatSponsorTime(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_SECONDS) return '—';
  return new Date(value * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export async function redemptionOperation(scope, code, options = {}) {
  const normalizedScope = required(scope, '账户范围', 2000);
  if (typeof code !== 'string') throw new Error('兑换码必须是文本');
  const normalizedCode = code.replace(/\s+/gu, '').toUpperCase();
  if (!normalizedCode) throw new Error('请填写兑换码');
  if (normalizedCode.length > 100) throw new Error('兑换码最多 100 个字符');
  let storage;
  let cryptoImpl;
  try {
    storage = options.storage === undefined ? globalThis.localStorage : options.storage;
    cryptoImpl = options.cryptoImpl === undefined ? globalThis.crypto : options.cryptoImpl;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error();
  } catch { throw new Error('无法读取浏览器存储，尚未提交兑换，请恢复存储后重试'); }
  let scopeHash;
  let codeHash;
  try {
    const hash = async value => {
      const bytes = new Uint8Array(await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(value)));
      if (bytes.length !== 32) throw new Error();
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    };
    [scopeHash, codeHash] = await Promise.all([hash(normalizedScope), hash(normalizedCode)]);
  } catch { throw new Error('无法安全生成兑换操作，尚未提交兑换，请检查浏览器加密功能'); }
  const key = `sponsor:redemption:v1:${scopeHash}`;
  let previous;
  try {
    const saved = storage.getItem(key);
    if (saved !== null) {
      previous = JSON.parse(saved);
      if (!previous || typeof previous !== 'object' || Array.isArray(previous) || Object.keys(previous).length !== 2 || !HASH.test(previous.code_hash) || typeof previous.operation_id !== 'string' || !UUID.test(previous.operation_id)) throw new Error();
    }
  } catch { throw new Error('无法核验已保存的兑换操作，尚未提交兑换；请恢复存储并核查上次结果'); }
  if (previous?.code_hash === codeHash) return { code: normalizedCode, operation_id: previous.operation_id };
  let operationID;
  try {
    operationID = cryptoImpl.randomUUID();
    if (typeof operationID !== 'string' || !UUID.test(operationID)) throw new Error();
  } catch { throw new Error('无法安全生成兑换操作标识，尚未提交兑换'); }
  const saved = JSON.stringify({ code_hash: codeHash, operation_id: operationID });
  try {
    storage.setItem(key, saved);
    if (storage.getItem(key) !== saved) throw new Error();
  } catch { throw new Error('无法持久保存兑换操作，尚未提交兑换；请恢复存储后重试'); }
  return { code: normalizedCode, operation_id: operationID };
}

export function createForegroundReadTimer({ now = () => performance.now(), requiredSeconds } = {}) {
  if (typeof now !== 'function' || typeof requiredSeconds !== 'number' || !Number.isFinite(requiredSeconds) || requiredSeconds < 0) throw new Error('请提供有效的阅读时长和单调时钟');
  let accumulated = 0;
  let activeSince = null;
  let lastTime = -Infinity;
  const clock = () => {
    const value = now();
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('阅读计时器时钟无效');
    lastTime = Math.max(lastTime, value);
    return lastTime;
  };
  const elapsedSeconds = () => (accumulated + (activeSince === null ? 0 : clock() - activeSince)) / 1000;
  return {
    setActive(active) {
      if (typeof active !== 'boolean') throw new Error('阅读前台状态必须为布尔值');
      if (active && activeSince === null) activeSince = clock();
      else if (!active && activeSince !== null) {
        accumulated += clock() - activeSince;
        activeSince = null;
      }
    },
    elapsedSeconds,
    complete: () => elapsedSeconds() >= requiredSeconds,
    // 重置已读时长，保留当前的前台/后台状态。
    reset() { accumulated = 0; if (activeSince !== null) activeSince = clock(); },
  };
}
