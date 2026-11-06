import { parsePrice, reasonText } from './adminModel.js';

export const ALIPAY_MERCHANT_STATUSES = ['unknown', 'pending_review', 'restricted_allowed', 'approved', 'rejected'];
export const ALIPAY_MONTHLY_MODES = ['unknown', 'limited', 'unlimited_verified'];
export const ALIPAY_MERCHANT_LABELS = { unknown: '未知 / 未登记', pending_review: '审核中（未确认受限收款许可）', restricted_allowed: '受限收款已获允许（人工确认）', approved: '审核通过（人工登记）', rejected: '审核未通过' };
export const ALIPAY_MONTHLY_LABELS = { unknown: '未知（禁止新购）', limited: '有月上限（人工核实）', unlimited_verified: '已核实无月上限（人工登记）' };
const REASONS = { disabled: '新购开关或部署级许可未开启', merchant_not_ready: '商家审核状态尚不允许新购', limits_unverified: '适用额度尚未完整核实', not_configured: '部署级策略或支付配置未就绪', daily_exhausted: '本系统账本的上海日额度已占满', monthly_exhausted: '本系统账本的上海月额度已占满', budget_unavailable: '预算上下文或账本暂不可用', configuration_changed: '策略已变化，请重新读取后核查' };
const SETTINGS_KEYS = ['purchase_enabled', 'merchant_status', 'limits_verified', 'per_transaction_minor', 'daily_minor', 'monthly_mode', 'monthly_minor'];
const safeInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const nullableInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => value === null || safeInt(value, min, max);
const timestamp = value => safeInt(value, 0, 8640000000000);
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const contractError = () => new Error('支付宝门禁响应与管理契约不一致，暂不可用；未确认保存成功，请重新读取并联系维护者');

export function validAlipayPolicySettings(settings) {
  return exact(settings, SETTINGS_KEYS) && typeof settings.purchase_enabled === 'boolean'
    && ALIPAY_MERCHANT_STATUSES.includes(settings.merchant_status) && typeof settings.limits_verified === 'boolean'
    && safeInt(settings.per_transaction_minor, 1, 5000) && safeInt(settings.daily_minor, 1, 100000)
    && ALIPAY_MONTHLY_MODES.includes(settings.monthly_mode)
    && (settings.monthly_mode === 'limited' ? safeInt(settings.monthly_minor, 1, 100000000) : settings.monthly_minor === null);
}
function validCycle(cycle, monthly) {
  if (!exact(cycle, ['cycle_key', 'reset_at', 'paid_minor', 'pending_minor', 'occupied_minor', 'remaining_minor']) || typeof cycle.cycle_key !== 'string') return false;
  const pattern = monthly ? /^\d{4}-(0[1-9]|1[0-2])$/ : /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (!pattern.test(cycle.cycle_key)) return false;
  if (!monthly && new Date(`${cycle.cycle_key}T00:00:00Z`).toISOString().slice(0, 10) !== cycle.cycle_key) return false;
  return timestamp(cycle.reset_at) && ['paid_minor', 'pending_minor', 'occupied_minor', 'remaining_minor'].every(key => nullableInt(cycle[key]));
}
export function validateAlipayPolicyResponse(data) {
  if (!exact(data, ['schema_version', 'version', 'revision', 'settings', 'platform_ceiling', 'effective', 'usage', 'updated_at', 'updated_by'])
    || data.schema_version !== 1 || !safeInt(data.version, 1) || typeof data.revision !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(data.revision)
    || !validAlipayPolicySettings(data.settings) || !timestamp(data.updated_at) || !(data.updated_by === null || typeof data.updated_by === 'string')) throw contractError();
  const ceiling = data.platform_ceiling, effective = data.effective, usage = data.usage;
  if (!exact(ceiling, ['per_transaction_minor', 'daily_minor', 'cycle_timezone']) || ceiling.per_transaction_minor !== 5000 || ceiling.daily_minor !== 100000 || ceiling.cycle_timezone !== 'Asia/Shanghai'
    || !exact(effective, ['purchase_available', 'reason', 'per_transaction_minor', 'daily_minor', 'monthly_minor', 'monthly_unlimited_verified', 'environment', 'master_configured', 'payment_configured'])
    || typeof effective.purchase_available !== 'boolean'
    || (effective.purchase_available ? effective.reason !== null : typeof effective.reason !== 'string' || !effective.reason.trim() || effective.reason.length > 200)
    || !nullableInt(effective.per_transaction_minor, 1, data.settings.per_transaction_minor) || !nullableInt(effective.daily_minor, 1, data.settings.daily_minor)
    || !nullableInt(effective.monthly_minor, 1) || typeof effective.monthly_unlimited_verified !== 'boolean'
    || ![null, 'sandbox', 'production'].includes(effective.environment) || typeof effective.master_configured !== 'boolean' || typeof effective.payment_configured !== 'boolean'
    || !exact(usage, ['scope', 'as_of', 'timezone', 'day', 'month']) || usage.scope !== 'this_system_ledger' || usage.timezone !== 'Asia/Shanghai'
    || !timestamp(usage.as_of) || !validCycle(usage.day, false) || !validCycle(usage.month, true)) throw contractError();
  if ((effective.monthly_unlimited_verified && (effective.monthly_minor !== null || data.settings.monthly_mode !== 'unlimited_verified'))
    || (data.settings.monthly_mode === 'limited' && effective.monthly_minor !== null && effective.monthly_minor > data.settings.monthly_minor)) throw contractError();
  // 未知 reason 可以向前兼容地展示“暂不可用”，但不能因此宣称新购可用。
  if (effective.purchase_available && (!data.settings.purchase_enabled || !['restricted_allowed', 'approved'].includes(data.settings.merchant_status)
    || !data.settings.limits_verified || data.settings.monthly_mode === 'unknown' || !effective.master_configured || !effective.payment_configured
    || effective.environment === null || effective.per_transaction_minor === null || effective.daily_minor === null
    || (effective.monthly_minor === null && !effective.monthly_unlimited_verified))) throw contractError();
  return data;
}
export function alipayPolicyDraft(settings) {
  if (!validAlipayPolicySettings(settings)) throw contractError();
  return { purchase_enabled: settings.purchase_enabled, merchant_status: settings.merchant_status, limits_verified: settings.limits_verified,
    per_transaction: (settings.per_transaction_minor / 100).toFixed(2), daily: (settings.daily_minor / 100).toFixed(2),
    monthly_mode: settings.monthly_mode, monthly: settings.monthly_minor === null ? '' : (settings.monthly_minor / 100).toFixed(2) };
}
export function alipayPolicyUpdate(draft, version, reason) {
  if (!safeInt(version, 1) || !draft || typeof draft.purchase_enabled !== 'boolean' || typeof draft.limits_verified !== 'boolean') throw new Error('请先读取有效的支付宝门禁设置');
  const settings = { purchase_enabled: draft.purchase_enabled, merchant_status: draft.merchant_status, limits_verified: draft.limits_verified,
    per_transaction_minor: parsePrice(draft.per_transaction), daily_minor: parsePrice(draft.daily), monthly_mode: draft.monthly_mode,
    monthly_minor: draft.monthly_mode === 'limited' ? parsePrice(draft.monthly) : null };
  if (!ALIPAY_MERCHANT_STATUSES.includes(settings.merchant_status) || !ALIPAY_MONTHLY_MODES.includes(settings.monthly_mode)) throw new Error('请选择合同支持的商家状态与月额度模式');
  if (!safeInt(settings.per_transaction_minor, 1, 5000)) throw new Error('单笔管理上限必须为 ¥0.01–¥50.00，不能提高平台硬上限');
  if (!safeInt(settings.daily_minor, 1, 100000)) throw new Error('上海日管理上限必须为 ¥0.01–¥1000.00，不能提高平台硬上限');
  if (settings.monthly_mode === 'limited' && !safeInt(settings.monthly_minor, 1, 100000000)) throw new Error('月管理上限必须为 ¥0.01–¥1000000.00');
  return { expected_version: version, settings, reason: reasonText(reason) };
}
export function validateAlipayPolicyUpdate(body) {
  if (!exact(body, ['expected_version', 'settings', 'reason']) || !safeInt(body.expected_version, 1) || !validAlipayPolicySettings(body.settings)) throw new Error('支付宝门禁写入必须仅含有效的 expected_version、完整 settings 与 reason');
  return { expected_version: body.expected_version, settings: Object.fromEntries(SETTINGS_KEYS.map(key => [key, body.settings[key]])), reason: reasonText(body.reason) };
}
export function alipayPolicyReason(reason) { return Object.hasOwn(REASONS, reason) ? REASONS[reason] : '暂不可用，请核查服务器策略'; }
export function alipayPolicyAvailability(data) {
  // 可购时 reason 必须严格为 null；未知禁用码绝不映射为可购。
  return data.effective.purchase_available === true && data.effective.reason === null;
}
export function alipayMoney(minor) { return minor === null ? '不可获取（不是 0）' : `¥${(minor / 100).toFixed(2)}`; }
export function alipayRemaining(data, monthly = false) {
  const remaining = data.usage[monthly ? 'month' : 'day'].remaining_minor;
  if (remaining !== null) return alipayMoney(remaining);
  return monthly && data.effective.monthly_unlimited_verified ? '已人工核实无月上限（不代表无限资金）' : '未知，不能视为可用余额或无限额';
}
const sameSettings = (a, b) => SETTINGS_KEYS.every(key => a[key] === b[key]);
export function verifyAlipayPolicySave(previous, submitted, receipt, latest) {
  validateAlipayPolicyResponse(receipt); validateAlipayPolicyResponse(latest);
  if (receipt.version !== previous.version + 1 || receipt.revision === previous.revision || !sameSettings(receipt.settings, submitted)
    || latest.version < receipt.version || (latest.version > receipt.version && latest.revision === receipt.revision)
    || (latest.version === receipt.version && (latest.revision !== receipt.revision || !sameSettings(latest.settings, receipt.settings)))) {
    throw new Error('保存回执或重读版本不能确认本次变更；草稿已保留，请重新读取核查，不要重复提交');
  }
  return latest.version === receipt.version ? 'confirmed' : 'concurrent';
}
export function alipayPolicySampleFresh(asOf, now = Date.now()) {
  const age = Math.floor(now / 1000) - asOf;
  return timestamp(asOf) && age >= -60 && age <= 120;
}
export function receiveAlipayPolicyRead(editor, data) {
  validateAlipayPolicyResponse(data);
  if (!editor.snapshot) return { ...editor, snapshot: data, latest: null, draft: alipayPolicyDraft(data.settings), reason: '', blocked: false, error: '', notice: '已读取服务器设置；表单改动尚未保存。' };
  const newest = editor.latest || editor.snapshot;
  if (data.version < newest.version || (data.version === newest.version && (data.revision !== newest.revision || !sameSettings(data.settings, newest.settings)))) throw new Error('服务器返回旧版本或不一致的 revision / 设置，草稿已保留；请重新读取核查');
  if (data.version > editor.snapshot.version) return { ...editor, latest: data, blocked: true, error: '', notice: `已读取服务器 v${data.version}，当前草稿仍基于 v${editor.snapshot.version}。请比较并明确采用最新基准；不会自动覆盖或重发。` };
  return { ...editor, snapshot: data, latest: null, blocked: false, error: '', notice: '已重新读取服务器；保留当前草稿及理由。请核查上次操作是否已受理，表单不代表已保存。' };
}
export function adoptAlipayPolicyLatest(editor) {
  if (!editor.latest) return editor;
  return { ...editor, snapshot: editor.latest, latest: null, blocked: false, error: '', notice: '已明确采用最新版本为基准，原草稿与理由保留但尚未保存；请逐项复核后再提交。' };
}
export function alipayPolicyError(error, saving = false) {
  const detail = error.status === 404 || error.status === 405 ? '管理接口尚未提供，支付宝门禁暂不可用。'
    : error.status === 409 ? '版本冲突：其他管理员可能已修改设置。请读取最新版本并人工比较，不能直接覆盖。'
      : error.message || '支付宝门禁请求失败，请核查服务器状态。';
  return `${detail}${saving ? ' 本次保存未获完整确认，草稿和理由已保留；请先读取核查，不会自动重试。' : ' 未获得新的有效样本，不能据此宣称当前可购。'}`;
}
