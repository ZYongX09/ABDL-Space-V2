// 两端共享校验：业务内容、套餐和额度只来自后端，不提供本地种子。
export function integer(value, label, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!['string', 'number'].includes(typeof value) || !/^-?\d+$/.test(String(value))) throw new Error(`${label}必须填写整数`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label}必须是 ${min} 至 ${max} 的整数`);
  return n;
}
export function required(value, label, max = 2000) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`请填写${label}`);
  if (value.length > max) throw new Error(`${label}最多 ${max} 个字符`);
  return value.trim();
}
export const reasonText = value => required(value, '操作理由', 500);
export function identifier(value, label = '标识') {
  const id = required(value, label, 64);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`${label}只能包含字母、数字、下划线和连字符`);
  return id;
}
export function parsePrice(value) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('价格请填写非负金额，最多两位小数，不支持科学计数法');
  const [whole, fraction = ''] = value.trim().split('.');
  return integer(Number(whole) * 100 + Number(fraction.padEnd(2, '0')), '价格（分）', 0, 100000000);
}
export function formatPrice(minor, currency = 'CNY') {
  return Number.isSafeInteger(minor) && currency === 'CNY' ? `¥${(minor / 100).toFixed(2)}` : '价格待核查';
}
export function validateTemplate(value) {
  if (typeof value !== 'string') throw new Error('提示文案必须是文本');
  if (/[{}]/.test(value.replace(/\{(x|y|a|reset)\}/g, ''))) throw new Error('提示文案仅支持 {x}、{y}、{a}、{reset} 占位符，花括号必须配对');
  return value;
}
export function renderTemplate(value, values) {
  return validateTemplate(value).replace(/\{(x|y|a|reset)\}/g, (_, key) => String(values[key] ?? '—'));
}
export function safePurchaseURL(value, plan) {
  try {
    if (typeof value !== 'string' || /[<>\s\\]/.test(value)) return null;
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'ifdian.net' || url.port || url.username || url.password || url.hash || url.pathname !== '/order/create') return null;
    const allowed = new Set(['plan_id', 'sku', 'product_type']);
    for (const key of url.searchParams.keys()) if (!allowed.has(key) || url.searchParams.getAll(key).length !== 1) return null;
    if (plan) {
      if (!/^[0-9a-f]{32}$/i.test(plan.afdian_plan_id) || !/^[0-9a-f]{32}$/i.test(plan.afdian_sku_id)) return null;
      if (url.searchParams.get('plan_id') !== plan.afdian_plan_id || url.searchParams.get('product_type') !== '1') return null;
      const skus = JSON.parse(url.searchParams.get('sku'));
      if (!Array.isArray(skus) || skus.length !== 1 || skus[0]?.sku_id !== plan.afdian_sku_id || skus[0]?.count !== 1 || Object.keys(skus[0]).some(k => !['sku_id', 'count'].includes(k))) return null;
    }
    return url.href;
  } catch { return null; }
}
export function validatePlan(draft) {
  const plan = { ...draft };
  plan.id = identifier(plan.id, '套餐标识');
  plan.name = required(plan.name, '套餐名称', 100);
  plan.description = String(plan.description || '');
  if (plan.description.length > 2000) throw new Error('套餐说明最多 2000 个字符');
  plan.price_minor = integer(plan.price_minor, '价格（分）', 0, 100000000);
  if (plan.currency !== 'CNY') throw new Error('目前仅支持 CNY');
  if (!['day', 'month', 'permanent'].includes(plan.duration_unit)) throw new Error('请选择有效的时长单位');
  plan.duration_count = integer(plan.duration_count, '时长数量', plan.duration_unit === 'permanent' ? 0 : 1, plan.duration_unit === 'permanent' ? 0 : plan.duration_unit === 'month' ? 120 : 3650);
  plan.sort_order = integer(plan.sort_order, '排序', -10000, 10000);
  plan.version = integer(plan.version, '套餐版本', 1, 2147483647);
  plan.purchase_url = String(plan.purchase_url || '').trim();
  plan.afdian_plan_id = String(plan.afdian_plan_id || '').trim();
  plan.afdian_sku_id = String(plan.afdian_sku_id || '').trim();
  if ((plan.purchase_url || plan.afdian_plan_id || plan.afdian_sku_id) && !safePurchaseURL(plan.purchase_url, plan)) throw new Error('购买链接必须为 ifdian.net 的 HTTPS 下单地址，商品与规格需为匹配的 32 位标识，不能包含重复或额外参数');
  plan.enabled = plan.enabled === true;
  return plan;
}
export function validateConfig(draft, initial) {
  if (!Array.isArray(draft.colors) || draft.colors.length < 1 || draft.colors.length > 20 || !Array.isArray(draft.benefits) || draft.benefits.length > 30) throw new Error('请配置 1–20 个颜色、最多 30 项权益');
  const config = { ...draft, colors: draft.colors.map(c => ({ ...c })), benefits: draft.benefits.map(b => ({ ...b })) };
  for (const key of ['version', 'notice_version']) config[key] = integer(config[key], key === 'version' ? '配置版本' : '须知版本', 1, 2147483647);
  config.free_daily_limit = integer(config.free_daily_limit, '普通用户额度', 0, 100000);
  config.sponsor_daily_limit = integer(config.sponsor_daily_limit, '赞助者额度', config.free_daily_limit, 100000);
  config.minimum_read_seconds = integer(config.minimum_read_seconds, '最低阅读秒数', 5, 300);
  if (config.timezone !== 'Asia/Shanghai') throw new Error('额度时区必须为 Asia/Shanghai');
  for (const key of ['center_title', 'notice_title', 'notice_body', 'exhausted_title', 'exhausted_body', 'sponsor_exhausted_body', 'purchase_title']) config[key] = validateTemplate(required(config[key], '标题或提示文案', key.endsWith('title') ? 100 : 3000));
  if (initial && (config.notice_version < initial.notice_version || (['notice_title', 'notice_body', 'free_daily_limit', 'sponsor_daily_limit'].some(k => config[k] !== initial[k]) && config.notice_version <= initial.notice_version))) throw new Error('须知或额度已变更，请在「基础设置」提高须知版本后保存');
  if (!Array.isArray(config.purchase_steps) || !config.purchase_steps.length || config.purchase_steps.length > 20) throw new Error('请填写 1–20 条购买步骤');
  config.purchase_steps = config.purchase_steps.map(step => validateTemplate(required(step, '购买步骤', 1000)));
  const keys = new Set();
  for (const color of config.colors) {
    color.key = identifier(color.key, '颜色标识'); color.name = required(color.name, '颜色名称', 40);
    if (keys.has(color.key)) throw new Error('颜色标识不能重复');
    keys.add(color.key);
    for (const mode of ['light', 'dark']) if (!/^#[0-9a-fA-F]{6}$/.test(color[mode])) throw new Error('颜色值必须为六位十六进制格式');
    color.permanent_only = color.permanent_only === true;
  }
  if (!config.colors.some(c => c.key === config.default_color_key && !c.permanent_only)) throw new Error('默认颜色必须允许非永久赞助者使用');
  const ids = new Set();
  for (const benefit of config.benefits) {
    benefit.id = identifier(benefit.id, '权益标识'); benefit.title = required(benefit.title, '权益标题', 80);
    benefit.description = String(benefit.description || '');
    if (benefit.description.length > 1000) throw new Error('权益说明最多 1000 个字符');
    benefit.sort_order = integer(benefit.sort_order, '权益排序', -10000, 10000);
    if (ids.has(benefit.id)) throw new Error('权益标识不能重复'); ids.add(benefit.id);
    if (!['automatic', 'available', 'coming_soon'].includes(benefit.status) || !['none', 'color', 'original', 'claim'].includes(benefit.action)) throw new Error('权益状态或操作无效');
    if ((benefit.status === 'coming_soon' && benefit.action !== 'none') || (['claim', 'color'].includes(benefit.action) && benefit.status !== 'available') || (benefit.action === 'original' && benefit.status !== 'automatic')) throw new Error('权益状态与操作不匹配：即将推出不允许操作，原图自动生效，颜色及领取需可使用');
  }
  config.enabled = config.enabled === true;
  return config;
}
export function expirySeconds(value, now = Date.now()) {
  if (!value) return undefined;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms) || ms <= now) throw new Error('到期时间必须晚于当前时间');
  return Math.floor(ms / 1000);
}
export function validateStock(draft) {
  const setting = { enabled: draft.enabled === true, low_water: integer(draft.low_water, '低水位', 0, 199), target_stock: integer(draft.target_stock, '目标库存', 1, 200), batch_size: integer(draft.batch_size, '单批数量', 1, 200), check_interval_seconds: integer(draft.check_interval_seconds, '检查间隔（秒）', 300, 86400) };
  if (setting.target_stock <= setting.low_water) throw new Error('目标库存必须高于低水位');
  return setting;
}
export function formatTime(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  return new Date(seconds * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}
export function statusText(state) {
  return ({ active: '可用', disabled: '已停用', expired: '已过期', redeemed: '已兑换', prepared: '已准备', sending: '发送中', confirmed: '已确认', unknown: '结果未知，须对账', rejected: '已拒绝' })[state] || '未知状态，须人工核查';
}
export function operationKeeper(randomUUID = () => crypto.randomUUID()) {
  const pending = new Map();
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return {
    get(key, body) {
      const payload = JSON.stringify(canonical(body));
      const prior = pending.get(key);
      if (prior) {
        if (prior.payload !== payload) throw new Error('上次操作尚未确认，请恢复原表单重试或先核查服务器状态；不能更换理由或数量后重复发送');
        return prior.id;
      }
      const id = randomUUID(); pending.set(key, { payload, id }); return id;
    },
    done(key) { pending.delete(key); },
  };
}
