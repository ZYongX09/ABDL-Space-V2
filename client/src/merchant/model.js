export const AD_STATUSES = { draft: '草稿', active: '投放中', paused: '已暂停', archived: '已归档' };
export const COUNTERS = [
  ['impressions', '曝光'], ['clicks', '点击总量'], ['link_clicks', '链接点击'],
  ['image_views', '图片查看'], ['ad_navigations', '广告跳转'],
];
export const CONTACT_FIELDS = ['description', 'contact_name', 'contact_email', 'website_url'];
export const EMPTY_AD = Object.freeze({ title: '', body: '', landing_url: '', image_url: '', status: 'draft', starts_at: '', ends_at: '', advertiser_name: '', advertiser_avatar_url: '' });
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const formatNumber = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN') : '—';
export function accessState(info) {
  if (!info) return 'loading';
  if (info.is_super_admin === true) return 'ready';
  const profile = info.profile || info.merchant;
  if (profile?.status === 'suspended') return 'suspended';
  if (info.identity_required === true) return 'identity';
  if (info.authorized !== true || info.active !== true) return profile ? 'inactive' : 'activate';
  return 'ready';
}
export function safeURL(value, httpsOnly = false) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    return (httpsOnly ? url.protocol === 'https:' : ['https:', 'http:'].includes(url.protocol)) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
export function safeMediaURL(value) {
  // 仅显式 fixture 模式将封闭域名素材映射到本机；生产构建消除此分支。
  if (import.meta.env?.MODE === 'merchant-fixture' && /^https:\/\/merchant-fixture\.invalid\/media\/[a-z-]+\.svg$/.test(value || '')) return String(value).replace('https://merchant-fixture.invalid/media/', '/__merchant-fixture/media/');
  return safeURL(value, true);
}
export function identityPayload(form, withCode = false) {
  const display_name = String(form.display_name || '').trim();
  const avatar_url = String(form.avatar_url || '').trim();
  if (!display_name || display_name.length > 120) throw new Error('请填写 1–120 字的企业名称。');
  if (!avatar_url || !safeURL(avatar_url, true)) throw new Error('请上传企业头像，或填写有效的 HTTPS 头像地址。');
  const payload = { display_name, avatar_url };
  if (withCode) {
    payload.code = String(form.code || '').trim();
    if (!payload.code) throw new Error('请填写商家注册码。');
  }
  return payload;
}
export function profilePayload(form, canEditIdentity = false) {
  const payload = Object.fromEntries(CONTACT_FIELDS.map(field => [field, String(form[field] || '').trim()]));
  if (payload.website_url && !safeURL(payload.website_url)) throw new Error('企业网站必须是有效的 HTTP 或 HTTPS 地址。');
  if (canEditIdentity) Object.assign(payload, identityPayload(form));
  return payload;
}
export function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return adjusted.toISOString().slice(0, 16);
}
export function adForm(ad = {}) {
  return { ...EMPTY_AD, ...Object.fromEntries(Object.keys(EMPTY_AD).map(key => [key, ad[key] ?? EMPTY_AD[key]])), starts_at: toLocalDateTime(ad.starts_at), ends_at: toLocalDateTime(ad.ends_at) };
}
export function adPayload(form, canOverride = false) {
  const payload = Object.fromEntries(['title', 'body', 'landing_url', 'image_url'].map(field => [field, String(form[field] || '').trim()]));
  if (!payload.body && !payload.image_url) throw new Error('请填写广告正文或上传广告图片。');
  if (!['draft', 'active', 'paused'].includes(form.status)) throw new Error('广告状态无效；归档请从广告列表操作。');
  if (payload.landing_url && !safeURL(payload.landing_url)) throw new Error('落地页必须是有效的 HTTP 或 HTTPS 地址。');
  if (payload.image_url && !safeURL(payload.image_url, true)) throw new Error('广告图片必须使用 HTTPS 地址。');
  if (payload.title.length < 1 || payload.title.length > 160) throw new Error('广告标题必须为 1–160 字。');
  if (payload.body.length > 2000) throw new Error('广告正文不能超过 2000 字。');
  payload.status = form.status;
  for (const key of ['starts_at', 'ends_at']) {
    if (!form[key]) payload[key] = null;
    else {
      const date = new Date(form[key]);
      if (!Number.isFinite(date.getTime())) throw new Error('广告排期无效。');
      payload[key] = date.toISOString();
    }
  }
  if (payload.starts_at && payload.ends_at && payload.starts_at >= payload.ends_at) throw new Error('结束时间必须晚于开始时间。');
  if (canOverride) {
    payload.advertiser_name = String(form.advertiser_name || '').trim();
    payload.advertiser_avatar_url = String(form.advertiser_avatar_url || '').trim();
    if (payload.advertiser_name.length > 120) throw new Error('企业名称不能超过 120 字。');
    if (payload.advertiser_avatar_url && !safeURL(payload.advertiser_avatar_url, true)) throw new Error('企业头像必须使用 HTTPS 地址。');
  }
  return payload;
}
export function defaultDateRange(now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const start = new Date(`${to}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 29);
  return { from: start.toISOString().slice(0, 10), to };
}
export function validateDateRange(from, to) {
  const parse = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!parse(from) || !parse(to)) throw new Error('请选择有效的开始和结束日期。');
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days < 1 || days > 93) throw new Error('统计范围必须是 1–93 天，包含起止日期（UTC）。');
  return { from, to };
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function statsCSV(daily) {
  const columns = [['date', '日期（UTC）'], ...COUNTERS];
  return '\uFEFF' + [columns.map(([, label]) => csvCell(label)).join(','), ...daily.map(row => columns.map(([key]) => csvCell(row[key])).join(','))].join('\r\n');
}
export function auditDetail(value) {
  if (value == null) return '—';
  try { return JSON.stringify(typeof value === 'string' ? JSON.parse(value) : value, null, 2); }
  catch { return String(value); }
}
export function sessionKey(user, token = '', origin = '') {
  return JSON.stringify([origin, user?.id ?? null, user?.role ?? null, user?.is_super_admin ?? null, token]);
}
