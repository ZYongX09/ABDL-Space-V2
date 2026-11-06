// 只供 Node 测试与隔离 UI fixture 使用；无真实身份、配置、密钥或任何外部请求。
import { validateAlipayPolicyUpdate } from '../src/sponsors/alipayPolicyModel.js';
import { createSponsorFixture } from '../src/sponsors/fixture.js';

export const ALIPAY_FIXTURE_SCENARIOS = ['normal', 'ready', 'missing-context', 'daily-exhausted', 'monthly-exhausted', 'stale', 'unknown-reason', 'missing-api', 'load-error', 'invalid-data', 'save-error', 'save-unknown', 'conflict', 'concurrent-after-save', 'slow-save', 'unauthorized', 'forbidden'];
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
    respond(path, method = 'GET', body = null) {
      requests.push({ path, method }); // 不记录理由、请求体或任何 token。
      if (path === '/__alipay-policy-fixture/stats' && method === 'GET') return ok({ scenario, requests, version: sample.version });
      if (path === '/__alipay-policy-fixture/setup' && method === 'POST') {
        try { return ok(setup(body?.scenario)); } catch { return fail(422, 'invalid_request', '未知的 fixture 场景'); }
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
