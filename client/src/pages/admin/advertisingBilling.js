import { MAX_BILLING_MINOR } from '../../merchant/billing.js';

const positive = value => Number.isSafeInteger(value) && value > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const maskPattern = /^MB-[A-F0-9]{4}…[A-F0-9]{4}$/;
const codePattern = /^MB-[A-F0-9]{40}$/;

export const parseBillingPermission = data => data?.settings?.can_manage_billing === true;
export const BILLING_STATUS_LABELS = { unlaunched: '未开放', live: '运行中', paused: '已暂停' };

export function parseBillingStatus(data) {
  if (!Object.hasOwn(BILLING_STATUS_LABELS, data?.status)) throw new Error('无法确认平台计费状态。');
  return { status: data.status, updated_at: data.updated_at };
}

function parseCodeRow(row) {
  if (!positive(row?.id) || typeof row.code_mask !== 'string' || !maskPattern.test(row.code_mask)
    || !positive(row.amount_minor) || row.amount_minor > MAX_BILLING_MINOR || !validTime(row.created_at)
    || (row.redeemed_at != null && !validTime(row.redeemed_at))
    || (row.redeemed_by_merchant_id != null && !positive(row.redeemed_by_merchant_id))) throw new Error('充值码列表响应不完整。');
  const { id, code_mask, amount_minor, created_at, redeemed_at, redeemed_by_merchant_id } = row;
  return { id, code_mask, amount_minor, created_at, redeemed_at, redeemed_by_merchant_id };
}

export function parseBillingCodes(data, page, limit) {
  const pagination = data?.pagination ?? { page, limit, total: data?.total, totalPages: Math.ceil(data?.total / limit) };
  if (!Array.isArray(data?.items) || pagination.page !== page || !positive(pagination.limit) || !count(pagination.total)
    || !count(pagination.totalPages) || data.items.length > pagination.limit) throw new Error('充值码分页响应不完整。');
  const items = data.items.map(parseCodeRow);
  if (new Set(items.map(row => row.id)).size !== items.length) throw new Error('充值码列表包含重复记录。');
  return { items, pagination };
}

export function parseBillingCodeReceipt(data, amount) {
  const row = parseCodeRow(data);
  if (row.amount_minor !== amount || row.redeemed_at != null || typeof data.code !== 'string' || !codePattern.test(data.code)
    || `${data.code.slice(0, 7)}…${data.code.slice(-4)}` !== row.code_mask) throw new Error('充值码创建回执不完整。');
  return data.code;
}
