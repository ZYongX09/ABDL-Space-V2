export const TRIAL_PRICE_MINOR = 1500;
export const MAX_BILLING_MINOR = Math.floor(Number.MAX_SAFE_INTEGER / 2);

const MODES = ['plan', 'cpm'];
const BILLING_STATES = {
  available: '计费条件已满足（不保证展示）',
  plan_required: '需要有效的企业投放套餐；如未配置计费，请先编辑广告',
  balance_insufficient: '企业余额不足，暂停按曝光投放',
  budget_exhausted: '此广告的曝光预算已用完',
  billing_paused: '平台已暂停计费，此广告暂不可投放',
  legacy: '历史广告保留原投放资格；单独停用后不再保留',
};

export function parseYuan(input) {
  const parts = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(input ?? '').trim());
  if (!parts) throw new Error('请输入有效的人民币金额，最多两位小数。');
  const minor = Number(`${parts[1]}${(parts[2] || '').padEnd(2, '0')}`);
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > MAX_BILLING_MINOR) throw new Error('金额须大于 0 元，且不能超出有效范围。');
  return minor;
}

function yuanParts(halfMinor) {
  const units = halfMinor < 0n ? -halfMinor : halfMinor;
  const fraction = String(units % 200n * 5n).padStart(3, '0').replace(/0$/, '');
  return `${halfMinor < 0n ? '-' : ''}¥${units / 200n}.${fraction}`;
}

export const formatHalfMinor = value => Number.isSafeInteger(value) ? yuanParts(BigInt(value)) : '—';
export const formatMinor = value => Number.isSafeInteger(value) ? yuanParts(BigInt(value) * 2n) : '—';
export const minorToInput = value => Number.isSafeInteger(value) && value > 0 ? formatMinor(value).slice(1) : '';
export const billingEnabled = info => info?.billing_enabled === true;
export const officialAd = ad => ['official', 'system'].includes(ad?.ad_type);

export function adBillingFields(mode, budget) {
  if (!mode) return {};
  if (!MODES.includes(mode)) throw new Error('请选择有效的计费方式。');
  if (mode === 'plan') return { billing_mode: mode };
  if (!String(budget ?? '').trim()) throw new Error('按可见曝光投放须填写预算（元）。');
  return { billing_mode: mode, billing_budget_minor: parseYuan(budget) };
}

export function billingDelivery(ad) {
  if (officialAd(ad)) return '官方 / 系统广告不参与商家计费';
  return Object.hasOwn(BILLING_STATES, ad?.billing_state) ? BILLING_STATES[ad.billing_state] : '';
}

export function termExpiries(billing, now = Date.now()) {
  const end = billing.entitlement_ends_at;
  const current = billing.entitlement_current_ends_at === undefined ? end : billing.entitlement_current_ends_at;
  return {
    current: Date.parse(current) > now ? current : null,
    queued: Date.parse(end) > Math.max(now, Date.parse(current) || 0) ? end : null,
  };
}

export function billingError(error, access = '当前账户无权使用计费。') {
  if (error?.status === 401) return '登录已过期，请重新登录。';
  if (error?.status === 403) return access;
  if (error?.status === 503 || error?.status === 404) return '计费服务当前不可用，请稍后重新读取。';
  return error?.message || '计费请求失败，请稍后重试。';
}

export function ambiguousWrite(error) {
  return !Number.isInteger(error?.status) || error.status >= 500 || [408, 425, 429].includes(error.status);
}

// 仅保存一次待确认购买的请求参数；不保存登录令牌、充值码或曝光令牌。
export function createPurchaseAttempt({ storage, scope, makeId = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('') } = {}) {
  const key = scope == null ? null : `abdl:merchant-billing-purchase:${scope}`;
  let pending = null;
  try {
    const saved = key && JSON.parse(storage?.getItem(key) || 'null');
    if (saved && ['monthly', 'trial'].includes(saved.plan) && Number.isSafeInteger(saved.expected_price_minor)
      && saved.expected_price_minor > 0 && typeof saved.request_id === 'string' && saved.request_id) pending = saved;
  } catch { /* 当前浏览器禁止存储时仍可在本页重试。 */ }
  return {
    get current() { return pending; },
    start(plan, price) {
      if (pending) return pending;
      pending = { plan, expected_price_minor: price, request_id: makeId() };
      try { if (key) storage?.setItem(key, JSON.stringify(pending)); } catch { /* 内存回退 */ }
      return pending;
    },
    clear() {
      pending = null;
      try { if (key) storage?.removeItem(key); } catch { /* 内存回退 */ }
    },
  };
}

export const LEDGER_LABELS = { redemption: '充值码兑换', monthly: '购买 / 续订 30 天套餐', trial: '购买 7 天试用', impression: '按可见曝光扣费' };
export const formatLedgerAmount = (row, key) => row[`${key}_half_minor`] == null ? formatMinor(row[`${key}_minor`]) : formatHalfMinor(row[`${key}_half_minor`]);

export function assertBillingReceipt(receipt, kind, price) {
  const row = receipt?.item;
  if (typeof receipt?.recorded !== 'boolean' || row?.kind !== kind || !Number.isSafeInteger(row.amount_half_minor)
    || (kind === 'redemption' ? row.amount_half_minor <= 0 : row.amount_half_minor !== -2 * price)) {
    throw new Error('计费回执不完整，暂不能确认本次操作。');
  }
  return row;
}
