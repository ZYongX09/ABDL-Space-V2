// 只供 Node 测试与隔离 UI fixture 使用；无真实身份、配置、密钥或任何外部请求。
import { validateAlipayPolicyUpdate } from '../src/sponsors/alipayPolicyModel.js';
import { validateAlipayRefundBody, sponsorLedgerQuery } from '../src/sponsors/sponsorLedgerModel.js';
import { createSponsorFixture } from '../src/sponsors/fixture.js';

export const ALIPAY_FIXTURE_SCENARIOS = ['normal', 'ready', 'missing-context', 'daily-exhausted', 'monthly-exhausted', 'stale', 'unknown-reason', 'missing-api', 'load-error', 'invalid-data', 'save-error', 'save-unknown', 'conflict', 'concurrent-after-save', 'slow-save', 'unauthorized', 'forbidden', 'overview', 'overview-empty', 'records-page', 'refund-failure'];
const copy = value => structuredClone(value);
const ok = data => ({ status: 200, data: copy(data) });
const fail = (status, code, error) => ({ status, data: { code, error } });
const revision = version => `a11a0000-0000-4000-8000-${String(version).padStart(12, '0')}`;

export function alipayPolicyFixtureSample(now = Math.floor(Date.now() / 1000)) {
  const day = new Date((now + 8 * 3600) * 1000).toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonth = Date.UTC(year, monthNumber, 1) / 1000 - 8 * 3600;
  return {
    schema_version: 1, version: 1, revision: revision(1),
    settings: { purchase_enabled: false, merchant_status: 'pending_review', limits_verified: false, per_transaction_minor: 5000, daily_minor: 100000, monthly_mode: 'unknown', monthly_minor: null },
    platform_ceiling: { per_transaction_minor: 5000, daily_minor: 100000, cycle_timezone: 'Asia/Shanghai' },
    effective: { purchase_available: false, reason: 'disabled', per_transaction_minor: 5000, daily_minor: 100000, monthly_minor: null, monthly_unlimited_verified: false, environment: 'sandbox', master_configured: true, payment_configured: true },
    usage: { scope: 'this_system_ledger', as_of: now, timezone: 'Asia/Shanghai',
      day: { cycle_key: day, reset_at: Date.parse(`${day}T00:00:00+08:00`) / 1000 + 86400, paid_minor: 1200, pending_minor: 300, occupied_minor: 1500, remaining_minor: 98500 },
      month: { cycle_key: month, reset_at: nextMonth, paid_minor: 7200, pending_minor: 300, occupied_minor: 7500, remaining_minor: null } },
    updated_at: now, updated_by: 'fixture-admin-A',
  };
}

export function sponsorLedgerOverviewSample(now = Math.floor(Date.now() / 1000), { empty = false } = {}) {
  return {
    schema_version: 1, generated_at: now,
    channels: {
      alipay: empty ? { month_income_minor: 0, total_income_minor: 0, total_count: 0, month_count: 0 }
        : { month_income_minor: 12800, total_income_minor: 96000, total_count: 8, month_count: 3 },
      afdian: empty ? { month_income_minor: 0, total_income_minor: 0, total_count: 0 }
        : { month_income_minor: 6000, total_income_minor: 45000, total_count: 15 },
    },
  };
}

export function sponsorLedgerRecordsSample(now = Math.floor(Date.now() / 1000)) {
  const plans = ['月度赞助', '季度赞助', '永久赞助'], amounts = [1000, 3000, 12800];
  return Array.from({ length: 23 }, (_, index) => {
    const paid_at = now - index * 1800, alipay = index % 3 === 0;
    if (alipay) {
      return {
        channel: 'alipay', order_no: `ALI20261106${String(index).padStart(4, '0')}`, paid_at,
        plan_name: plans[index % 3], amount_minor: amounts[index % 3], username: `alipay_user_${index}`,
        avatar: index % 2 === 0 ? null : '/avatars/fixture-alipay.png', refundable: index % 6 !== 0,
      };
    }
    const redeemed = index % 4 !== 1;
    return {
      channel: 'afdian', order_no: `AFD20261106${String(index).padStart(4, '0')}`, paid_at,
      plan_name: plans[index % 3], amount_minor: amounts[index % 3],
      message: index % 5 === 2 ? `第 ${index} 笔本地留言` : null,
      redeemer: redeemed ? { username: `afdian_user_${index}`, avatar: index % 7 === 0 ? '/avatars/fixture-afdian.png' : null } : null,
    };
  });
}

const ledgerParams = source => source instanceof URLSearchParams ? source : new URLSearchParams(source || '');

export function createAlipayPolicyFixture(initialScenario = 'normal', { now = () => Math.floor(Date.now() / 1000) } = {}) {
  let scenario, sample, conflictSent, afterSave, unknownSent, config;
  const requests = [];
  const baseline = createSponsorFixture();
  function evaluate() {
    const settings = sample.settings;
    const missing = scenario === 'missing-context';
    const effective = sample.effective;
    effective.master_configured = !missing; effective.payment_configured = !missing;
    effective.environment = missing ? null : 'sandbox';
    effective.per_transaction_minor = missing ? null : settings.per_transaction_minor;
    effective.daily_minor = missing ? null : settings.daily_minor;
    effective.monthly_minor = missing || settings.monthly_mode !== 'limited' ? null : settings.monthly_minor;
    effective.monthly_unlimited_verified = !missing && settings.monthly_mode === 'unlimited_verified';
    const reason = !settings.purchase_enabled ? 'disabled' : !['restricted_allowed', 'approved'].includes(settings.merchant_status) ? 'merchant_not_ready'
      : !settings.limits_verified || settings.monthly_mode === 'unknown' ? 'limits_unverified' : missing ? 'not_configured'
        : scenario === 'daily-exhausted' ? 'daily_exhausted' : scenario === 'monthly-exhausted' ? 'monthly_exhausted' : null;
    effective.reason = reason; effective.purchase_available = reason === null;
    if (scenario === 'unknown-reason') { effective.reason = 'future_disabled_code'; effective.purchase_available = false; }
    for (const [key, limit] of [['day', effective.daily_minor], ['month', effective.monthly_minor]]) {
      const cycle = sample.usage[key];
      cycle.remaining_minor = missing || limit === null ? null : Math.max(0, limit - cycle.occupied_minor);
    }
    sample.usage.as_of = scenario === 'stale' ? now() - 3600 : now();
  }
  function setup(nextScenario = 'normal') {
    if (!ALIPAY_FIXTURE_SCENARIOS.includes(nextScenario)) throw new TypeError('未知的支付宝门禁 fixture 场景');
    scenario = nextScenario; sample = alipayPolicyFixtureSample(now()); conflictSent = false; afterSave = false; unknownSent = false;
    baseline.setup(); config = copy(baseline.respond('/api/v1/sponsors/catalog').data.config);
    if (['ready', 'stale', 'daily-exhausted', 'monthly-exhausted', 'missing-context'].includes(scenario)) {
      Object.assign(sample.settings, { purchase_enabled: true, merchant_status: 'restricted_allowed', limits_verified: true, monthly_mode: 'limited', monthly_minor: 200000 });
    }
    if (scenario === 'missing-context') for (const cycle of [sample.usage.day, sample.usage.month]) for (const key of ['paid_minor', 'pending_minor', 'occupied_minor', 'remaining_minor']) cycle[key] = null;
    if (scenario === 'daily-exhausted') Object.assign(sample.usage.day, { paid_minor: 99000, pending_minor: 1000, occupied_minor: 100000 });
    if (scenario === 'monthly-exhausted') Object.assign(sample.usage.month, { paid_minor: 199000, pending_minor: 1000, occupied_minor: 200000 });
    requests.length = 0; evaluate(); return { scenario };
  }
  setup(initialScenario);
  function update(settings, actor = 'fixture-admin-A') {
    sample.settings = copy(settings); sample.version++; sample.revision = revision(sample.version); sample.updated_at = now(); sample.updated_by = actor; evaluate();
  }
  return {
    setup, requests,
    respond(path, method = 'GET', body = null, query = null) {
      requests.push({ path, method }); // 不记录理由、请求体、查询值或任何 token。
      if (path === '/__alipay-policy-fixture/stats' && method === 'GET') return ok({ scenario, requests, version: sample.version });
      if (path === '/__alipay-policy-fixture/setup' && method === 'POST') {
        try { return ok(setup(body?.scenario)); } catch { return fail(422, 'invalid_request', '未知的 fixture 场景'); }
      }
      const ledgerFailure = () => scenario === 'missing-api' ? fail(404, 'fixture_missing', '管理接口未部署（本地模拟）')
        : scenario === 'load-error' ? fail(503, 'unavailable', '读取失败（本地模拟）')
          : scenario === 'unauthorized' ? fail(401, 'unauthorized', '本地模拟过期会话')
            : scenario === 'forbidden' ? fail(403, 'forbidden', '本地模拟无权访问') : null;
      if (method === 'GET' && path === '/api/admin/sponsors/overview') {
        const failure = ledgerFailure();
        if (failure) return failure;
        const data = sponsorLedgerOverviewSample(now(), { empty: scenario === 'overview-empty' });
        if (scenario === 'invalid-data') data.channels.alipay.total_count = -1;
        return ok(data);
      }
      if (method === 'GET' && path === '/api/admin/sponsors/payment-records') {
        const failure = ledgerFailure();
        if (failure) return failure;
        const params = ledgerParams(query);
        let validated;
        try {
          validated = sponsorLedgerQuery({
            channel: params.get('channel') || '', limit: params.get('limit') === null ? undefined : Number(params.get('limit')),
            offset: params.get('offset') === null ? undefined : Number(params.get('offset')),
          });
        } catch { return fail(422, 'invalid_query', '支付明细分页参数无效（本地模拟）'); }
        if (scenario === 'overview-empty') return ok({ schema_version: 1, items: [], total: 0, limit: validated.limit, offset: validated.offset });
        const filtered = sponsorLedgerRecordsSample(now()).filter(item => !validated.channel || item.channel === validated.channel);
        const data = { schema_version: 1, items: filtered.slice(validated.offset, validated.offset + validated.limit), total: filtered.length, limit: validated.limit, offset: validated.offset };
        if (scenario === 'invalid-data' && data.items.length) data.items[0].channel = 'unknown';
        return ok(data);
      }
      if (method === 'POST' && /^\/api\/payments\/alipay\/orders\/[^/]+\/refunds$/.test(path)) {
        const failure = ledgerFailure();
        if (failure) return failure;
        if (scenario === 'refund-failure') return fail(503, 'refund_unavailable', '退款失败（本地模拟）');
        const orderNo = decodeURIComponent(path.split('/')[5]);
        const record = sponsorLedgerRecordsSample(now()).find(item => item.channel === 'alipay' && item.order_no === orderNo);
        if (!record) return fail(404, 'order_not_found', '订单不存在（本地模拟）');
        let payload;
        try { payload = validateAlipayRefundBody(body); } catch { return fail(422, 'invalid_request', '退款金额或原因无效（本地模拟）'); }
        if (!record.refundable) return fail(409, 'not_refundable', '订单当前不可退款（本地模拟）');
        if (payload.refund_amount > record.amount_minor) return fail(422, 'invalid_amount', '退款金额超过实付金额（本地模拟）');
        return ok({ order_no: orderNo, refund_no: `RFI${orderNo.slice(-12)}`, refund_amount_minor: payload.refund_amount, status: 'processing' });
      }
      if (path === '/api/admin/sponsors/alipay-policy') {
        if (scenario === 'missing-api') return fail(404, 'fixture_missing', '管理接口未部署（本地模拟）');
        if (scenario === 'unauthorized') return fail(401, 'unauthorized', '本地模拟过期会话');
        if (scenario === 'forbidden') return fail(403, 'forbidden', '本地模拟无权访问');
        if (method === 'GET') {
          if (scenario === 'load-error') return fail(503, 'unavailable', '读取失败（本地模拟）');
          if (scenario === 'concurrent-after-save' && afterSave) { afterSave = false; update({ ...sample.settings, daily_minor: 80000 }, 'fixture-admin-B'); }
          evaluate();
          const data = copy(sample);
          if (scenario === 'invalid-data') data.settings.merchant_status = 'official_automatically_approved';
          return ok(data);
        }
        if (method === 'PUT') {
          let validated;
          try { validated = validateAlipayPolicyUpdate(body); } catch { return fail(422, 'invalid_request', '门禁写入结构或范围无效'); }
          if (scenario === 'save-error') return fail(503, 'unavailable', '保存失败（本地模拟）');
          if (scenario === 'conflict' && !conflictSent) { conflictSent = true; update({ ...sample.settings, daily_minor: 90000 }, 'fixture-admin-B'); }
          if (validated.expected_version !== sample.version) return fail(409, 'version_conflict', '其他管理员已修改（本地模拟）');
          update(validated.settings);
          if (scenario === 'save-unknown' && !unknownSent) { unknownSent = true; return fail(503, 'unknown', '已受理但回包失败（本地模拟）'); }
          afterSave = true;
          return { ...ok(sample), ...(scenario === 'slow-save' ? { delay: 2500 } : {}) };
        }
      }
      // 为真实 SponsorAdmin 的其他栏目提供只读 fixture，不改变既有 fixture 的交互。
      if (method === 'GET' && path === '/api/admin/sponsors/config') return ok(config);
      if (method === 'GET' && path === '/api/admin/sponsors/plans') return ok({ items: baseline.respond('/api/v1/sponsors/catalog').data.plans });
      if (method === 'GET' && path === '/api/admin/sponsors/stock/') return ok({ credentials: { user_id_configured: false, token_configured: false, code_key_configured: false, pool_contract_verified: false, append_contract_verified: false }, items: [] });
      if (method === 'GET' && ['/api/admin/sponsors/audit', '/api/admin/sponsors/users', '/api/admin/sponsors/codes', '/api/admin/sponsors/stock/batches'].includes(path)) return ok({ items: [], total: 0 });
      return fail(404, 'fixture_not_found', '隔离 fixture 未定义此接口；绝不转发真实 API');
    },
  };
}
