import { formatTime, parsePrice, reasonText } from './adminModel.js';

// 赞助者概览 / 支付明细 / 支付宝退款的严格契约与纯格式化。
// 服务器金额一律为人民币分；页面只做展示换算，不回写、不缓存、不假造 0。
export const SPONSOR_LEDGER_PAGE_SIZE = 20;
export const SPONSOR_LEDGER_CHANNELS = ['alipay', 'afdian'];
export const SPONSOR_CHANNEL_LABELS = { alipay: '支付宝', afdian: '爱发电' };
export const SPONSOR_UNKNOWN_USERNAME = '未知用户';
export const SPONSOR_LEDGER_EMPTY_CHANNEL = '';
const MAX_TIME = 4102444800; // 2100-01-01T00:00:00Z（秒），拒绝毫秒值或明显伪造时间。
const exact = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const safeInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const safeMoney = value => safeInt(value, 0, 1000000000000);
const safeCount = value => safeInt(value, 0, 1000000000);
const timestamp = value => safeInt(value, 0, MAX_TIME);
const text = (value, max, { multiline = false } = {}) => typeof value === 'string' && value.trim().length > 0
  && value.length <= max && !value.includes('\u0000') && (multiline || !/[\r\n]/.test(value));
const optionalText = (value, max) => value === null || (typeof value === 'string' && value.length <= max && !value.includes('\u0000'));

export function sponsorLedgerContractError(detail = '赞助明细响应与管理契约不一致，暂不可用；未确认任何退款成功，请重新读取并联系维护者') {
  return new Error(detail);
}

// 头像只接受同源相对路径或 https 绝对地址；缺省/不安全值一律返回空串由纯色占位接管。
export function avatarSource(value) {
  return typeof value === 'string' && value === value.trim() && value.length <= 2048
    && (/^\/(?!\/)/.test(value) || /^https:\/\/[^\s]+$/i.test(value)) ? value : '';
}

function validIdentity(identity) {
  return exact(identity, ['username', 'avatar']) && text(identity.username, 64) && (identity.avatar === null || avatarSource(identity.avatar) !== '' || identity.avatar === '');
}

export function validateSponsorOverview(data) {
  if (!exact(data, ['schema_version', 'generated_at', 'channels']) || data.schema_version !== 1 || !timestamp(data.generated_at)
    || !exact(data.channels, ['alipay', 'afdian'])) throw sponsorLedgerContractError();
  const { alipay, afdian } = data.channels;
  if (!exact(alipay, ['month_income_minor', 'total_income_minor', 'total_count', 'month_count'])
    || !safeMoney(alipay.month_income_minor) || !safeMoney(alipay.total_income_minor)
    || !safeCount(alipay.total_count) || !safeCount(alipay.month_count)
    || !exact(afdian, ['month_income_minor', 'total_income_minor', 'total_count'])
    || !safeMoney(afdian.month_income_minor) || !safeMoney(afdian.total_income_minor) || !safeCount(afdian.total_count)) {
    throw sponsorLedgerContractError();
  }
  return data;
}

export function overviewSections(data) {
  validateSponsorOverview(data);
  return [
    {
      channel: 'alipay', label: SPONSOR_CHANNEL_LABELS.alipay,
      metrics: [
        ['当月收入', formatLedgerMoney(data.channels.alipay.month_income_minor)],
        ['总收入', formatLedgerMoney(data.channels.alipay.total_income_minor)],
        ['总人次', formatLedgerCount(data.channels.alipay.total_count)],
        ['当月人次', formatLedgerCount(data.channels.alipay.month_count)],
      ],
    },
    {
      channel: 'afdian', label: SPONSOR_CHANNEL_LABELS.afdian,
      metrics: [
        ['当月收入', formatLedgerMoney(data.channels.afdian.month_income_minor)],
        ['总收入', formatLedgerMoney(data.channels.afdian.total_income_minor)],
        ['总人次', formatLedgerCount(data.channels.afdian.total_count)],
      ],
    },
  ];
}

export function overviewIsEmpty(data) {
  validateSponsorOverview(data);
  return data.channels.alipay.total_count === 0 && data.channels.afdian.total_count === 0;
}

function validAlipayRecord(item) {
  return exact(item, ['channel', 'order_no', 'paid_at', 'plan_name', 'amount_minor', 'username', 'avatar', 'refundable'])
    && item.channel === 'alipay' && text(item.order_no, 128) && timestamp(item.paid_at) && text(item.plan_name, 200)
    && safeMoney(item.amount_minor) && text(item.username, 64)
    && (item.avatar === null || item.avatar === '' || avatarSource(item.avatar) !== '')
    && typeof item.refundable === 'boolean';
}
function validAfdianRecord(item) {
  return exact(item, ['channel', 'order_no', 'paid_at', 'plan_name', 'amount_minor', 'message', 'redeemer'])
    && item.channel === 'afdian' && text(item.order_no, 128) && timestamp(item.paid_at) && text(item.plan_name, 200)
    && safeMoney(item.amount_minor) && optionalText(item.message, 1000)
    && (item.redeemer === null || validIdentity(item.redeemer));
}

export function validateSponsorPaymentRecords(data) {
  if (!exact(data, ['schema_version', 'items', 'total', 'limit', 'offset']) || data.schema_version !== 1
    || !Array.isArray(data.items) || !safeCount(data.total) || !safeInt(data.limit, 1, 100) || !safeInt(data.offset, 0)
    || data.items.length > data.limit || (data.items.length > 0 && data.offset + data.items.length > data.total)) throw sponsorLedgerContractError();
  for (const item of data.items) if (item?.channel === 'alipay') { if (!validAlipayRecord(item)) throw sponsorLedgerContractError(); }
  else if (item?.channel === 'afdian') { if (!validAfdianRecord(item)) throw sponsorLedgerContractError(); }
  else throw sponsorLedgerContractError();
  return data;
}

export function sponsorLedgerQuery({ channel = '', limit = SPONSOR_LEDGER_PAGE_SIZE, offset = 0 } = {}) {
  if (![SPONSOR_LEDGER_EMPTY_CHANNEL, ...SPONSOR_LEDGER_CHANNELS].includes(channel)) throw new Error('支付明细渠道筛选无效，请选择全部、支付宝或爱发电');
  if (!safeInt(limit, 1, 100)) throw new Error('每页条数必须为 1–100 的整数');
  if (!safeInt(offset, 0, 1000000000)) throw new Error('分页偏移必须为非负整数');
  return { ...(channel ? { channel } : {}), limit, offset };
}

export function ledgerPage(data) {
  validateSponsorPaymentRecords(data);
  const limit = data.limit, pages = Math.max(1, Math.ceil(data.total / limit));
  return {
    page: Math.floor(data.offset / limit) + 1, pages, limit, offset: data.offset, total: data.total,
    hasPrev: data.offset > 0, hasNext: data.offset + data.items.length < data.total,
    empty: data.items.length === 0,
  };
}

export function recordKey(record) {
  return `${record.channel}:${record.order_no}`;
}

export function ledgerUser(record) {
  if (record.channel === 'afdian') {
    if (record.redeemer === null) return { username: SPONSOR_UNKNOWN_USERNAME, avatar: '', known: false };
    return { username: record.redeemer.username, avatar: avatarSource(record.redeemer.avatar), known: true };
  }
  return { username: record.username, avatar: avatarSource(record.avatar), known: true };
}

export function isRefundable(record) {
  return record?.channel === 'alipay' && record.refundable === true;
}

export function formatLedgerMoney(minor) {
  return safeMoney(minor) ? `¥${(minor / 100).toFixed(2)}` : '金额待核查';
}

export function formatLedgerCount(count) {
  return safeCount(count) ? `${count} 人次` : '人次待核查';
}

export function formatLedgerTime(seconds) {
  return timestamp(seconds) ? formatTime(seconds) : '时间待核查';
}

export function ledgerEmptyText(channel = '') {
  return channel && SPONSOR_CHANNEL_LABELS[channel] ? `暂无${SPONSOR_CHANNEL_LABELS[channel]}支付记录` : '暂无支付记录';
}

export function ledgerMessage(record) {
  return record.channel === 'afdian' && typeof record.message === 'string' && record.message.trim() ? record.message : '';
}

// 退款请求只接受该订单可退、金额 1 分–实付金额、原因必填；全额退款为默认展示值。
export function fullRefundAmount(record) {
  if (!isRefundable(record)) throw new Error('当前订单不可退款或状态未确认');
  return (record.amount_minor / 100).toFixed(2);
}

export function validateAlipayRefundBody(body) {
  if (!exact(body, ['refund_amount', 'reason']) || !safeInt(body.refund_amount, 1, 100000000)
    || typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 500 || body.reason.includes('\u0000')) {
    throw new Error('退款必须仅含有效退款金额与必填原因（最多 500 字）');
  }
  return { refund_amount: body.refund_amount, reason: reasonText(body.reason) };
}

export function alipayRefundRequest(record, amountText, reason) {
  if (!isRefundable(record)) throw new Error('当前订单不可退款或状态未确认，请重新读取明细');
  let refundAmount;
  try { refundAmount = parsePrice(String(amountText ?? '').trim()); }
  catch { throw new Error('退款金额请填写非负金额，最多两位小数，不支持科学计数法'); }
  if (!safeInt(refundAmount, 1, record.amount_minor)) throw new Error(`退款金额必须大于 0 且不超过实付金额 ${formatLedgerMoney(record.amount_minor)}`);
  return validateAlipayRefundBody({ refund_amount: refundAmount, reason });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function validateIdempotencyKey(value) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('退款缺少有效的 Idempotency-Key，已停止发送');
  return value;
}

export function newIdempotencyKey(randomUUID = () => globalThis.crypto?.randomUUID?.()) {
  return validateIdempotencyKey(randomUUID());
}

// 退款回执必须只包含约定字段，且订单号/金额与本次请求一致，否则视为未确认成功。
export function validateSponsorRefundResponse(data) {
  if (!exact(data, ['order_no', 'refund_no', 'refund_amount_minor', 'status'])
    || !text(data.order_no, 128) || !text(data.refund_no, 128)
    || !safeInt(data.refund_amount_minor, 1, 100000000)
    || typeof data.status !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(data.status)) throw sponsorLedgerContractError('退款回执与管理契约不一致，未确认退款成功；请先核对订单，不要直接重复提交');
  return data;
}

export function verifySponsorRefundReceipt(receipt, orderNo, body) {
  validateSponsorRefundResponse(receipt);
  if (receipt.order_no !== orderNo || receipt.refund_amount_minor !== body.refund_amount) {
    throw new Error('退款回执的订单号或金额与本次请求不一致，未确认退款成功；请先核对订单，不要直接重复提交');
  }
  return receipt;
}

export function sponsorOverviewError(error) {
  if (!error) return '概览读取失败，请重新读取';
  if (error.status === 404 || error.status === 405) return '赞助者概览接口尚未提供，暂不可用。';
  if (error.status === 401) return '登录已过期，请重新登录；未获得新的概览数据。';
  if (error.status === 403) return '当前账户无管理员权限，或请求来源验证失败。';
  return `${error.message || '概览读取失败'} 未获得新的概览数据，不会自动重试。`;
}

export function sponsorLedgerError(error) {
  if (!error) return '支付明细读取失败，请重新读取';
  if (error.status === 404 || error.status === 405) return '赞助明细接口尚未提供，暂不可用。';
  if (error.status === 401) return '登录已过期，请重新登录；未获得新的支付明细。';
  if (error.status === 403) return '当前账户无管理员权限，或请求来源验证失败。';
  return `${error.message || '支付明细读取失败'} 未获得新的账本数据，不会自动重试。`;
}

export function refundErrorMessage(error) {
  if (!error) return '退款请求失败，未确认退款成功。';
  if (error.status === 404 || error.status === 405) return '支付宝退款接口尚未提供，当前不可退款。';
  if (error.status === 401) return '登录已过期，请重新登录；未确认退款结果。原退款原因已保留。';
  if (error.status === 403) return '当前账户无管理员权限，或请求来源验证失败；未确认退款结果。原退款原因已保留。';
  if (error.status === 409) return '退款操作冲突或订单状态已变化；未确认退款成功。请先核对订单与概览，不要直接重复提交。原退款原因已保留。';
  if (error.definitive === true) return `${error.message || '退款请求被拒绝'}；本次请求已明确失败，未退款。原退款原因已保留，请核对后重新发起。`;
  return `${error.message || '退款结果未知'} 退款可能已受理，未确认成功。请先核对订单与概览；确认需要重试时将复用同一操作标识，不会自动重试。原退款原因已保留。`;
}
