import { createSponsorFixture } from '../../src/sponsors/fixture.js';
import { reasonText, validateConfig, validatePlan, validateStock } from '../../src/sponsors/adminModel.js';
import { copy, createReceipts, fail, missing, ok, paginate, routeSignature, rowsForScenario, search } from './core.js';

// 管理端缺失的内存契约；支付宝门禁/账本/退款仍由原 alipay-policy fixture 负责。
export function registerSponsorRoutes({ add }, state, { scenario, now, alipay }) {
  const visible = rows => rowsForScenario(scenario(), rows);
  const seed = createSponsorFixture().respond('/api/v1/sponsors/catalog').data;
  state.sponsorConfig = copy(seed.config);
  // 用户端旧 seed 带 viokrz_ex；管理端实际契约只允许商品/规格三个参数。
  // 仅规范化这里的合成种子，再走真实 validator；不放宽生产 parser 或写入契约。
  state.plans = copy(seed.plans).map(plan => {
    const url = new URL(plan.purchase_url);
    url.searchParams.delete('viokrz_ex');
    return validatePlan({ ...plan, purchase_url: url.href });
  });
  state.sponsorAccounts = new Map();
  state.sponsorCodes = [];
  state.codeBatches = new Map();
  state.sponsorAudit = [{ id: 'sponsor-audit-seed', action: 'synthetic_seed', actor_id: 1, user_id: 3, reason: '本地合成初始化，无付款、无兑换、无外部库存操作。', created_at: now() - 3600 }];
  state.stock = state.plans.map((plan, index) => ({ plan_id: plan.id, enabled: false, verified: index === 0, verification_status: index === 0 ? 'write_verified' : 'unchecked', can_refill: index === 0, can_enable: index === 0, verification_message: index === 0 ? '合成正向证据：仅本地内存验证，不代表真实部署已配置。' : '未进行合成只读检查。', low_water: 2, target_stock: 10, batch_size: 5, check_interval_seconds: 900, paused: false, last_stock: index === 0 ? 4 : null, observed_line_count: index === 0 ? 4 : null, product_stock: 99, last_checked_at: index === 0 ? now() - 600 : null, next_check_at: null, last_error: null }));
  state.stockBatches = [{ id: 'synthetic-stock-seed', batch_id: 'synthetic-stock-seed', code_batch_id: 'synthetic-seed-batch', plan_id: 'week', state: 'unknown', count: 1, created_at: now() - 1800, last_error: '合成未知响应；点击对账只核查合成正向证据，不重复追加。' }];
  let sequence = 1;
  const receipts = createReceipts();
  const audit = (ctx, action, userId = null) => state.sponsorAudit.unshift({ id: `sponsor-audit-${++sequence}`, action, actor_id: ctx.actor.id, user_id: userId, reason: ctx.body?.reason || '', created_at: now() });
  const authorizedWrite = (ctx, action, perform, userId = null, idempotent = false) => {
    try { reasonText(ctx.body?.reason); } catch { return fail(422, 'reason_required'); }
    const run = () => { const result = perform(); if (result.status < 300) audit(ctx, action, userId); return result; };
    return idempotent ? receipts(ctx.body?.operation_id, routeSignature(ctx), run) : run();
  };
  const account = id => {
    const user = state.users.find(row => String(row.id) === String(id)); if (!user) return null;
    if (!state.sponsorAccounts.has(user.id)) {
      const fixture = createSponsorFixture(); fixture.setup({ identity: user.id === 3 ? 'active' : user.id === 4 ? 'permanent' : 'regular' });
      state.sponsorAccounts.set(user.id, copy(fixture.respond('/api/v1/sponsors/me').data));
    }
    return { user, data: state.sponsorAccounts.get(user.id) };
  };
  const listAccounts = () => visible(state.users).map(user => ({ ...user, sponsor: account(user.id).data.sponsor }));
  const planById = id => state.plans.find(plan => plan.id === id);
  const makeBatch = (plan, count, expires_at) => {
    const id = `synthetic-code-batch-${++sequence}`;
    const codes = Array.from({ length: count }, (_, index) => ({ id: `synthetic-code-${++sequence}`, masked_code: `SYNTHETIC-****-${String(sequence).padStart(4, '0')}`, plain: `SYNTHETIC-NOT-REDEEMABLE-${id}-${index + 1}`, plan_id: plan.id, plan_name: plan.name, batch_id: id, state: 'active', expires_at: expires_at ?? null, redeemed_at: null, redeemed_by: null }));
    state.codeBatches.set(id, codes); state.sponsorCodes.push(...codes); return { id, count };
  };
  makeBatch(state.plans[1], scenario() === 'longlists' ? 67 : 3, null);

  add('sponsors', 'GET', '/api/admin/sponsors/config', () => ok(state.sponsorConfig));
  add('sponsors', 'PUT', '/api/admin/sponsors/config', ctx => authorizedWrite(ctx, 'config_update', () => {
    if (ctx.body?.expected_version !== state.sponsorConfig.version) return fail(409, 'version_conflict');
    let config; try { config = validateConfig(ctx.body.config, state.sponsorConfig); } catch { return fail(422, 'invalid_config'); }
    state.sponsorConfig = { ...config, version: state.sponsorConfig.version + 1 }; return ok(state.sponsorConfig);
  }));
  add('sponsors', 'GET', '/api/admin/sponsors/plans', () => ok({ items: visible(state.plans) }));
  add('sponsors', 'POST', '/api/admin/sponsors/plans', ctx => authorizedWrite(ctx, 'plan_create', () => {
    let plan; try { plan = validatePlan(ctx.body.plan); } catch { return fail(422, 'invalid_plan'); }
    if (planById(plan.id)) return fail(409, 'plan_exists');
    state.plans.push(plan); state.stock.push({ ...copy(state.stock[0]), plan_id: plan.id, verified: false, can_enable: false, can_refill: false, verification_status: 'unchecked' }); return ok(plan);
  }));
  add('sponsors', 'PUT', '/api/admin/sponsors/plans/:id', ctx => authorizedWrite(ctx, 'plan_update', () => {
    const current = planById(ctx.ids.id); if (!current) return missing();
    if (ctx.body?.expected_version !== current.version) return fail(409, 'version_conflict');
    let plan; try { plan = validatePlan({ ...ctx.body.plan, id: current.id }); } catch { return fail(422, 'invalid_plan'); }
    Object.assign(current, plan, { version: current.version + 1 }); return ok(current);
  }));
  add('sponsors', 'GET', '/api/admin/sponsors/users', ({ params }) => ok(paginate(search(listAccounts(), params, ['id', 'username', 'display_name']), params)));
  add('sponsors', 'GET', '/api/admin/sponsors/users/:id', ({ ids }) => account(ids.id) ? ok(account(ids.id).data) : missing());
  for (const action of ['grants', 'revoke', 'quota']) add('sponsors', 'POST', `/api/admin/sponsors/users/:id/${action}`, ctx => authorizedWrite(ctx, action, () => {
    const selected = account(ctx.ids.id); if (!selected) return missing();
    const data = selected.data;
    if (action === 'grants') {
      const plan = planById(ctx.body?.plan_id); if (!plan) return missing();
      const permanent = plan.duration_unit === 'permanent';
      if (data.sponsor.permanent && !permanent) return fail(409, 'already_permanent');
      const end = new Date(Math.max(now(), data.sponsor.expires_at ?? 0) * 1000);
      if (!permanent) { if (plan.duration_unit === 'month') end.setUTCMonth(end.getUTCMonth() + plan.duration_count); else end.setUTCDate(end.getUTCDate() + plan.duration_count); }
      Object.assign(data.sponsor, { active: true, permanent, expires_at: permanent ? null : end.getTime() / 1000, plan_name: plan.name });
      data.quota.limit = Math.max(data.quota.limit, state.sponsorConfig.sponsor_daily_limit);
    } else if (action === 'revoke') {
      Object.assign(data.sponsor, { active: false, permanent: false, expires_at: now(), plan_name: null }); data.quota.limit = state.sponsorConfig.free_daily_limit;
    } else {
      if (!Number.isSafeInteger(ctx.body.adjustment) || !ctx.body.adjustment || Math.abs(ctx.body.adjustment) > 100000) return fail(422, 'invalid_quota');
      data.quota.limit = Math.max(0, data.quota.limit + ctx.body.adjustment);
    }
    data.quota.remaining = Math.max(0, data.quota.limit - data.quota.used); return ok(data);
  }, Number(ctx.ids.id), true));
  add('sponsors', 'GET', '/api/admin/sponsors/codes', ({ params }) => {
    const rows = visible(state.sponsorCodes).filter(code => (!params.get('plan_id') || code.plan_id === params.get('plan_id')) && (!params.get('state') || code.state === params.get('state')) && (!params.get('q') || code.plain === params.get('q'))).map(({ plain: _plain, ...code }) => code);
    return ok(paginate(rows, params));
  });
  add('sponsors', 'POST', '/api/admin/sponsors/code-batches', ctx => authorizedWrite(ctx, 'code_batch_create', () => {
    const plan = planById(ctx.body?.plan_id); if (!plan) return missing();
    if (!Number.isSafeInteger(ctx.body.count) || ctx.body.count < 1 || ctx.body.count > 200) return fail(422, 'invalid_count');
    if (ctx.body.expires_at != null && (!Number.isSafeInteger(ctx.body.expires_at) || ctx.body.expires_at <= now())) return fail(422, 'invalid_expiry');
    return ok(makeBatch(plan, ctx.body.count, ctx.body.expires_at));
  }, null, true));
  add('sponsors', 'POST', '/api/admin/sponsors/code-batches/:id/export', ctx => authorizedWrite(ctx, 'synthetic_code_export', () => {
    const codes = state.codeBatches.get(ctx.ids.id); return codes ? ok({ id: ctx.ids.id, codes: codes.map(code => code.plain) }) : missing();
  }));
  add('sponsors', 'POST', '/api/admin/sponsors/codes/:id/state', ctx => authorizedWrite(ctx, 'code_state', () => {
    const code = state.sponsorCodes.find(row => row.id === ctx.ids.id); if (!code) return missing();
    if (code.state === 'redeemed') return fail(409, 'already_redeemed');
    if (typeof ctx.body.disabled !== 'boolean') return fail(422, 'invalid_state');
    code.state = ctx.body.disabled ? 'disabled' : code.expires_at && code.expires_at <= now() ? 'expired' : 'active'; return ok({ id: code.id, state: code.state });
  }));
  add('sponsors', 'GET', '/api/admin/sponsors/stock/', () => ok({ credentials: { user_id_configured: true, token_configured: true, code_key_configured: true, pool_contract_verified: true, append_contract_verified: true }, items: visible(state.stock) }));
  add('sponsors', 'PUT', '/api/admin/sponsors/stock/:id', ctx => authorizedWrite(ctx, 'stock_setting', () => {
    const current = state.stock.find(row => row.plan_id === ctx.ids.id); if (!current) return missing();
    let setting; try { setting = validateStock(ctx.body.setting); } catch { return fail(422, 'invalid_stock'); }
    if (setting.enabled && !current.can_enable) return fail(409, 'stock_not_verified');
    Object.assign(current, setting); return ok(current);
  }));
  add('sponsors', 'POST', '/api/admin/sponsors/stock/:id/check', ctx => authorizedWrite(ctx, 'synthetic_stock_check', () => {
    const current = state.stock.find(row => row.plan_id === ctx.ids.id); if (!current) return missing();
    Object.assign(current, { last_checked_at: now(), last_stock: current.last_stock ?? 0, observed_line_count: current.last_stock ?? 0, can_refill: true, verification_status: current.verified ? 'write_verified' : 'read_verified', verification_message: '本地合成池读取成功（没有请求爱发电服务）。' }); return ok(current);
  }));
  add('sponsors', 'POST', '/api/admin/sponsors/stock/:id/refill', ctx => authorizedWrite(ctx, 'synthetic_refill', () => {
    const current = state.stock.find(row => row.plan_id === ctx.ids.id); if (!current) return missing();
    if (!current.can_refill || !Number.isSafeInteger(ctx.body.count) || ctx.body.count < 1 || ctx.body.count > (current.verified ? Math.min(200, current.batch_size) : 1) || (current.last_stock || 0) + ctx.body.count > current.target_stock) return fail(409, 'stock_gate');
    const codeBatch = makeBatch(planById(current.plan_id), ctx.body.count, null);
    const batch = { id: `synthetic-stock-${++sequence}`, batch_id: `synthetic-stock-${sequence}`, plan_id: current.plan_id, code_batch_id: codeBatch.id, state: 'confirmed', count: ctx.body.count, created_at: now(), last_error: null };
    state.stockBatches.unshift(batch); Object.assign(current, { verified: true, can_enable: true, verification_status: 'write_verified', last_stock: (current.last_stock || 0) + ctx.body.count, verification_message: '仅合成内存正向证据确认；无外部追加。' }); return ok(batch);
  }, null, true));
  add('sponsors', 'GET', '/api/admin/sponsors/stock/batches', ({ params }) => ok(paginate(visible(state.stockBatches), params)));
  add('sponsors', 'POST', '/api/admin/sponsors/stock/batches/:id/reconcile', ctx => authorizedWrite(ctx, 'synthetic_reconcile', () => {
    const batch = state.stockBatches.find(row => row.id === ctx.ids.id); if (!batch) return missing();
    // 仅种子批次具备预设合成正向证据；未知状态绝不被重新发送。
    if (batch.id === 'synthetic-stock-seed') { batch.state = 'confirmed'; batch.last_error = null; }
    return ok({ ...batch, batch_id: batch.id });
  }));
  add('sponsors', 'GET', '/api/admin/sponsors/audit', ({ params }) => ok(paginate(visible(state.sponsorAudit), params)));
  add('sponsors', 'GET', '/api/admin/sponsors/overview', ctx => alipay.respond(ctx.path, ctx.method, null, ctx.params));
  add('sponsors', 'GET', '/api/admin/sponsors/payment-records', ctx => alipay.respond(ctx.path, ctx.method, null, ctx.params));
  add('sponsors', 'GET', '/api/admin/sponsors/alipay-policy', ctx => alipay.respond(ctx.path, ctx.method, null, ctx.params));
  add('sponsors', 'PUT', '/api/admin/sponsors/alipay-policy', ctx => alipay.respond(ctx.path, ctx.method, ctx.body, ctx.params));
  add('sponsors', 'POST', '/api/payments/alipay/orders/:id/refunds', ctx => receipts(ctx.operationId, routeSignature(ctx), () => alipay.respond(ctx.path, ctx.method, ctx.body, ctx.params)));
}
