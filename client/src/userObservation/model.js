import { isSuperAdmin } from '../pages/admin/access.js';

export const TIMEZONE = 'Asia/Shanghai';
export const MAX_RECORDS = 5000;
export const MAX_BYTES = 1024 * 1024;
export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
export const DEFAULT_POLICY = Object.freeze({ enabled: false, retention_days: 30, per_user_daily_limit: 2000, global_daily_limit: 5000, revision: '0' });
const STATUSES = ['active', 'disabled', 'expired', 'policy_disabled', 'not_configured'];
const invalid = label => { throw new Error(`${label}格式异常，请重新读取服务端状态`); };
export const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : invalid('响应');
function hasControlCharacter(value, allowTextWhitespace = false) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 127 || code < 32 && (!allowTextWhitespace || ![9, 10, 13].includes(code))) return true;
  }
  return false;
}
export function text(value, max = 500, label = '字段', empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.length) || hasControlCharacter(value, true)) invalid(label);
  return value;
}
export function integer(value, min, max, label = '数值') {
  if (!Number.isSafeInteger(value) || value < min || value > max) invalid(label);
  return value;
}
const bool = value => typeof value === 'boolean' ? value : invalid('开关');
// 与服务端一致的 opaque CAS：初始 0、UUID 和 legacy SHA-256；禁止数值转换。
export const revision = value => /^[A-Za-z\d_-]{1,128}$/u.test(text(value, 128, '版本')) ? value : invalid('版本');
export function userId(value) {
  const raw = String(value ?? '');
  if (!/^[1-9]\d{0,15}$/.test(raw)) invalid('用户 ID');
  return integer(Number(raw), 2, Number.MAX_SAFE_INTEGER, '普通用户 ID');
}
export function reason(value) {
  const result = text(value, 500, '操作理由');
  if (!result.trim() || hasControlCharacter(result)) throw new Error('请填写不含控制字符的明确理由（1–500 字）');
  return result.trim();
}
export function shanghaiDay(now = Date.now()) {
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
export function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) invalid('日期');
  return value;
}
export function formatTime(value, seconds = false) {
  if (value == null) return '—';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: TIMEZONE, dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date(seconds ? value * 1000 : value));
}
export function localExpiry(now = Date.now()) { return new Date(now + 7 * 86400000 + 8 * 3600000).toISOString().slice(0, 16); }
export function expirySeconds(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) invalid('到期时间');
  day(value.slice(0, 10));
  const parsed = Date.parse(`${value}:00+08:00`);
  if (!Number.isFinite(parsed) || new Date(parsed + 8 * 3600000).toISOString().slice(0, 16) !== value) invalid('到期时间');
  return parsed / 1000;
}
export function targetEligible(actor, target) {
  return isSuperAdmin(actor) && target?.role === 'user' && Number.isSafeInteger(Number(target.id)) && Number(target.id) > 1 && String(actor.id) !== String(target.id);
}
export function readUser(data) {
  const value = object(object(data).user);
  return { id: userId(value.id), role: text(value.role, 30), username: text(value.username, 100) };
}
export function policyInput(value) {
  object(value);
  return { enabled: bool(value.enabled), retention_days: integer(value.retention_days, 1, 30), per_user_daily_limit: integer(value.per_user_daily_limit, 1, 20000), global_daily_limit: integer(value.global_daily_limit, 1, 100000), revision: revision(value.revision), reason: reason(value.reason) };
}
export function targetInput(value, now = Date.now()) {
  object(value);
  const result = { observe_ip: bool(value.observe_ip), observe_requests: bool(value.observe_requests), reason: reason(value.reason), revision: revision(value.revision) };
  if (result.observe_ip || result.observe_requests) {
    result.expires_at = integer(value.expires_at ?? Math.floor(now / 1000) + 7 * 86400, Math.floor(now / 1000) + 1, Math.floor(now / 1000) + 30 * 86400, '到期时间（最长 30 天）');
  }
  return result;
}
export const reasonRevision = value => ({ reason: reason(value?.reason), revision: revision(value?.revision) });
export function filters(value = {}, { requireDay = true, allowDay = true, max = 200, requests = true } = {}) {
  const result = {};
  if (allowDay && (requireDay || value.day)) result.day = day(value.day);
  if (requests && value.method) { if (!METHODS.includes(value.method)) invalid('请求方法'); result.method = value.method; }
  if (requests && value.status !== '' && value.status != null) result.status = integer(value.status, 100, 599, 'HTTP 状态码');
  if (value.cursor) result.cursor = text(value.cursor, 4096, '游标');
  result.limit = integer(value.limit ?? 50, 1, max, '每页条数');
  return result;
}
const timestamp = value => integer(value, 0, 8640000000000000, '时间戳');
const seconds = value => integer(value, 0, 8640000000000, '秒时间戳');
const count = value => integer(value, 0, Number.MAX_SAFE_INTEGER, '计数');
const ipSource = value => ['edge', 'verified_proxy', 'unknown'].includes(value) ? value : invalid('IP 来源');
const timezone = value => value === TIMEZONE ? TIMEZONE : invalid('时区');
const cursor = value => value === null ? null : text(value, 4096, '响应游标');
export function readPolicy(data) {
  const p = object(object(data).policy);
  return { enabled: bool(p.enabled), retention_days: integer(p.retention_days, 1, 30), per_user_daily_limit: integer(p.per_user_daily_limit, 1, 20000), global_daily_limit: integer(p.global_daily_limit, 1, 100000), revision: revision(p.revision) };
}
export function readTarget(value) {
  const t = object(value);
  return { user_id: userId(t.user_id), observe_ip: bool(t.observe_ip), observe_requests: bool(t.observe_requests), expires_at: seconds(t.expires_at), reason: text(t.reason, 500, '目标理由', true), revision: revision(t.revision), updated_at: seconds(t.updated_at), updated_by: integer(t.updated_by, 1, Number.MAX_SAFE_INTEGER) };
}
export function readStatus(value) { return STATUSES.includes(value) ? value : invalid('目标状态'); }
export function readTargetDetail(data) {
  object(data); timezone(data.timezone);
  return { user: readUser(data), target: data.target === null ? null : readTarget(data.target), status: readStatus(data.status), policy_enabled: bool(data.policy_enabled), timezone: TIMEZONE };
}
export function readIP(value) {
  const r = object(value);
  return { day: day(r.day), ip: readIPAddress(r.ip), ip_source: ipSource(r.ip_source), first_seen_at: timestamp(r.first_seen_at), last_seen_at: timestamp(r.last_seen_at), count: count(r.count) };
}
export function readIPAddress(value) {
  const ip = text(value, 64, 'IP');
  if (!/^[0-9a-fA-F:.]+$/.test(ip) || !ip.includes('.') && !ip.includes(':')) invalid('IP');
  return ip;
}
export function readRequest(value) {
  const r = object(value);
  return { event_id: text(r.event_id, 160), user_id: userId(r.user_id), occurred_at: timestamp(r.occurred_at), method: METHODS.includes(r.method) ? r.method : invalid('方法'), endpoint_id: text(r.endpoint_id, 320), template: text(r.template, 500), business_note: text(r.business_note, 500, '业务注释', true), metadata_version: text(r.metadata_version, 100), status: integer(r.status, 100, 599), duration_ms: integer(r.duration_ms, 0, Number.MAX_SAFE_INTEGER), ip: r.ip === null ? null : readIPAddress(r.ip), ip_source: ipSource(r.ip_source) };
}
export function readDay(value) {
  const r = object(value);
  return { day: day(r.day), accepted_count: count(r.accepted_count), request_count: count(r.request_count), ip_count: count(r.ip_count), first_seen_at: r.first_seen_at === null ? null : timestamp(r.first_seen_at), last_seen_at: r.last_seen_at === null ? null : timestamp(r.last_seen_at), limit_reached: bool(r.limit_reached), coverage: ['recorded', 'limit_reached', 'disabled', 'unknown'].includes(r.coverage) ? r.coverage : invalid('当日覆盖状态') };
}
export function readGeneration(value) {
  const generation = object(value);
  return { target_revision: revision(generation.target_revision), policy_revision: revision(generation.policy_revision) };
}
export function readPage(data, reader, max = 200, withTimezone = true, withGeneration = false) {
  object(data);
  if (!Array.isArray(data.items) || data.items.length > max) invalid('有界列表');
  if (withTimezone) timezone(data.timezone);
  return { items: data.items.map(reader), next_cursor: cursor(data.next_cursor), ...(withTimezone ? { timezone: TIMEZONE } : {}), ...(withGeneration ? { generation: readGeneration(data.generation) } : {}) };
}
export function auditId(data) { return text(object(data).audit_id, 160, '审计标识'); }
export function readLegacy(data) {
  object(data);
  if (!Array.isArray(data.bans) || data.bans.length > 200) invalid('旧封禁列表');
  return { user_id: userId(data.user_id), tracking: bool(data.tracking), rule_revision: revision(data.rule_revision), bans: data.bans.map(b => ({ ip: readIPAddress(b.ip), reason: text(b.reason, 500, '旧封禁理由', true), created_at: seconds(b.created_at), created_by: b.created_by === null ? null : integer(b.created_by, 1, Number.MAX_SAFE_INTEGER) })), truncated: bool(data.truncated) };
}
export function readExport(data) {
  object(data);
  if (data.schema_version !== 1 || !['recorded', 'limit_reached', 'disabled', 'unknown'].includes(data.coverage)) invalid('导出覆盖状态');
  const page = readPage(data, readRequest);
  if (!Array.isArray(data.ips) || data.ips.length > 200) invalid('导出 IP 列表');
  return { schema_version: 1, user_id: userId(data.user_id), day: day(data.day), ...page, generated_at: seconds(data.generated_at), ips: data.ips.map(readIP), truncated: bool(data.truncated), coverage: data.coverage, audit_id: auditId(data) };
}
export function serializeExport(payload, format = 'json') {
  if (format === 'json') return JSON.stringify(payload, null, 2);
  if (format !== 'text') invalid('导出格式');
  // 一行一个白名单 JSON 对象，既可选中复制，又不会把控制字符当成指令或 TSV 公式。
  const { requests, ips, ...metadata } = payload;
  return [JSON.stringify(metadata), ...ips.map(ip => `IP ${JSON.stringify(ip)}`), ...requests.map(row => `REQUEST ${JSON.stringify(row)}`)].join('\n');
}
export const byteLength = value => new TextEncoder().encode(value).byteLength;
export function boundedExport({ requests = [], ips = [], ...meta }, format = 'json') {
  const total = ips.length + requests.length;
  const render = size => {
    const keptIPs = ips.slice(0, size), keptRequests = requests.slice(0, Math.max(0, size - ips.length));
    return serializeExport({ ...meta, truncated: !!meta.truncated || size < total, record_count: size, request_count: keptRequests.length, ip_count: keptIPs.length, ips: keptIPs, requests: keptRequests }, format);
  };
  if (byteLength(render(0)) > MAX_BYTES - 256) throw new Error('导出元信息超过 1 MiB，未生成输出');
  // 对有序前缀二分，避免 5000 次重串行化导致主线程长时间冻结。
  let low = 0, high = Math.min(MAX_RECORDS, total);
  while (low < high) { const middle = Math.ceil((low + high) / 2); if (byteLength(render(middle)) <= MAX_BYTES - 256) low = middle; else high = middle - 1; }
  return { text: render(low), count: low, truncated: !!meta.truncated || low < total };
}
