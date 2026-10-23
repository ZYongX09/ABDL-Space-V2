// 仅供独立本地 fixture / node:test 使用；不接入生产入口，不读凭据，也不执行任何网络请求。
export const SPONSOR_FIXTURE_IDENTITIES = ['regular', 'active', 'permanent', 'expired', 'guest'];
export const SPONSOR_FIXTURE_SCENARIOS = ['normal', 'disabled', 'empty', 'config-change', 'network-unknown', 'history-error', 'unauthorized'];

const API = '/api/v1/sponsors/';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = 86400;
const GiB = 1024 ** 3;
const copy = value => structuredClone(value);
const ok = data => ({ status: 200, data: copy(data) });
const fail = (status, code, error) => ({ status, data: { error, code } });
const notFound = () => fail(404, 'fixture_not_found', '本地 fixture 未定义此接口；不会访问真实 API');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function initialConfig(scenario) {
  return {
    enabled: scenario !== 'disabled', version: 1, center_title: '赞助者中心（本地测试）',
    free_daily_limit: 3, sponsor_daily_limit: 25, timezone: 'Asia/Shanghai', notice_version: 1,
    notice_title: '查看原图须知（测试）',
    notice_body: '普通用户每天可查看 {x} 张原图，赞助者每天 {y} 张，今日剩余 {a} 张，{reset} 重置。所有额度只在本地内存中模拟。',
    exhausted_title: '今日原图额度已用完', exhausted_body: '普通用户每天 {x} 张，将于 {reset} 重置。',
    sponsor_exhausted_body: '赞助者每天 {y} 张，将于 {reset} 重置。',
    purchase_title: '本地赞助测试须知：请勿付款',
    purchase_steps: ['所有套餐、商品和规格标识均为虚构示例，请勿真实付款。', '仅在明确点击后才可打开官方 ifdian 页面，不自动下单或确认购买。', '返回本站不代表支付成功；请手动使用 TEST-MONTH 或 TEST-PERMANENT 测试兑换。'],
    minimum_read_seconds: 5, default_color_key: 'blue',
    colors: [
      { key: 'blue', name: '宝宝蓝', light: '#4E7394', dark: '#B9D9F0', permanent_only: false },
      { key: 'pink', name: '宝宝粉', light: '#A15E7C', dark: '#F2BED4', permanent_only: false },
      { key: 'gold', name: '永久金色', light: '#795500', dark: '#F6D778', permanent_only: true },
    ],
    benefits: scenario === 'empty' ? [] : [
      { id: 'original', title: '更多原图额度', description: '身份有效时自动提升每日额度。', status: 'automatic', action: 'original', sort_order: 10 },
      { id: 'color', title: '用户名颜色', description: '普通赞助者可选蓝色、粉色，永久赞助者固定专属金色。', status: 'available', action: 'color', sort_order: 20 },
      { id: 'album_storage', title: '宝宝相册存储与无损上传', description: '免费 3 GiB；周/月/季/年/永久分别为 5/10/20/50/100 GiB，过期不删除已用空间。', status: 'automatic', action: 'none', sort_order: 25 },
      { id: 'claim', title: '测试领取权益', description: '只记录内存领取状态，不发放真实商品或奖品。', status: 'available', action: 'claim', sort_order: 30 },
      { id: 'lottery', title: '赞助者抽奖', description: '即将推出；本地测试也不能领取。', status: 'coming_soon', action: 'none', sort_order: 40 },
    ],
  };
}

function samplePlans() {
  // 有效格式但完全虚构的 32hex，不复制生产商品标识或任何密钥。
  const planId = '1'.repeat(32);
  return [
    ['week', '周', 190, 'day', 7, 'a'], ['month', '月', 590, 'month', 1, 'b'],
    ['quarter', '季', 1490, 'month', 3, 'c'], ['year', '年', 4990, 'month', 12, 'd'],
    ['permanent', '永久', 9900, 'permanent', 0, 'e'],
  ].map(([id, name, price, unit, count, sku], index) => {
    const skuId = sku.repeat(32);
    const url = new URL('https://ifdian.net/order/create');
    url.searchParams.set('product_type', '1');
    url.searchParams.set('plan_id', planId);
    url.searchParams.set('sku', JSON.stringify([{ sku_id: skuId, count: 1 }]));
    url.searchParams.set('viokrz_ex', '0');
    return { id, version: 1, name: `${name}赞助者（测试）`, description: '虚构套餐，仅供本地验收，禁止真实支付。', price_minor: price,
      currency: 'CNY', duration_unit: unit, duration_count: count, purchase_url: url.href,
      afdian_plan_id: planId, afdian_sku_id: skuId, enabled: true, sort_order: (index + 1) * 10 };
  });
}

/** 创建互不共享身份、兑换码、幂等快照、历史及统计的纯内存 fixture（Node/SSR 安全）。 */
export function createSponsorFixture(scenario = 'normal') {
  let state;
  const requests = [];
  const setup = ({ identity = 'regular', scenario: nextScenario = 'normal' } = {}) => {
    if (!SPONSOR_FIXTURE_IDENTITIES.includes(identity) || !SPONSOR_FIXTURE_SCENARIOS.includes(nextScenario)) {
      throw new TypeError('未知的 fixture 身份或场景');
    }
    const now = Math.floor(Date.now() / 1000);
    const permanent = identity === 'permanent';
    state = { identity, scenario: nextScenario, config: initialConfig(nextScenario), plans: samplePlans(), catalogReads: 0,
      account: identity === 'guest' ? null : { id: 9101 + SPONSOR_FIXTURE_IDENTITIES.indexOf(identity), username: `fixture_${identity}`,
        display_name: ({ regular: '本地普通用户', active: '本地有效赞助者', permanent: '本地永久赞助者', expired: '本地过期赞助者' })[identity],
        role: 'user', email: `fixture_${identity}@example.invalid`, avatar: null },
      membership: { permanent, expires_at: identity === 'active' ? now + 15 * DAY : identity === 'expired' ? now - DAY : null,
        plan_name: permanent ? '永久赞助者（测试）' : ['active', 'expired'].includes(identity) ? '月赞助者（测试）' : null,
        color_key: permanent ? 'gold' : 'blue' },
      history: [], claimed: new Set(), operations: new Map(), consumed: new Set(), unknownSent: false };
    // 准备身份不是兑换或付款，不预消费测试码，也不伪造成功历史。
    requests.length = 0;
    return { identity, scenario: nextScenario };
  };
  setup({ scenario });

  const snapshot = (withAlbum = false) => {
    const now = Math.floor(Date.now() / 1000);
    const m = state.membership;
    const active = m.permanent || (m.expires_at !== null && m.expires_at > now);
    const color = active ? state.config.colors.find(c => c.key === (m.permanent ? 'gold' : m.color_key)) : null;
    const day_key = new Date((now + 8 * 3600) * 1000).toISOString().slice(0, 10);
    const limit = active ? state.config.sponsor_daily_limit : state.config.free_daily_limit;
    const data = { sponsor: { active, permanent: m.permanent, expires_at: m.permanent ? null : m.expires_at, plan_name: m.plan_name,
      color_key: color?.key ?? null, color_light: color?.light ?? null, color_dark: color?.dark ?? null },
      quota: { limit, used: 0, remaining: limit, resets_at: Date.parse(`${day_key}T00:00:00+08:00`) / 1000 + DAY, day_key },
      notice_required: !active, config_version: state.config.version, claimed_benefit_ids: [...state.claimed].sort() };
    if (withAlbum) {
      const tier = !active ? 'free' : m.permanent ? 'permanent' : 'month';
      const limitBytes = ({ free: 3, month: 10, permanent: 100 })[tier] * GiB;
      const usedBytes = 256 * 1024 ** 2; // 过期仍保留已使用空间，不把读失败伪造成 0。
      data.album_quota = { tier, sponsor_active: active, original_upload_allowed: active, limit_bytes: limitBytes,
        used_bytes: usedBytes, reserved_bytes: 0, remaining_bytes: limitBytes - usedBytes };
    }
    return data;
  };
  const currentUser = () => {
    if (!state.account) return null;
    const sponsor = snapshot().sponsor;
    return copy({ ...state.account, sponsor: { active: sponsor.active, permanent: sponsor.permanent, valid_until: sponsor.expires_at,
      color_light: sponsor.color_light, color_dark: sponsor.color_dark } });
  };

  const mutate = (path, method, body) => {
    if (!plainObject(body)) return fail(400, 'invalid_request', '请求体必须为 JSON 对象');
    const action = path.slice(API.length);
    const requiresOp = action !== 'color' || body.operation_id !== undefined;
    if (requiresOp && !UUID.test(typeof body.operation_id === 'string' ? body.operation_id : '')) return fail(422, 'invalid_request', 'operation_id 必须为 UUID');
    const op = requiresOp ? body.operation_id.toLowerCase() : null;
    const normalized = { ...body, ...(op ? { operation_id: op } : {}) };
    if (action === 'redeem') {
      if (typeof body.code !== 'string' || !body.code.trim() || body.code.length > 100) return fail(422, 'invalid_request', '兑换码格式不正确');
      normalized.code = body.code.toUpperCase().replace(/\s/g, '');
    }
    const signature = JSON.stringify(canonical([method, path, normalized]));
    const prior = op ? state.operations.get(op) : null;
    if (prior) return prior.signature === signature ? copy(prior.result) : fail(409, 'idempotency_conflict', '该操作编号已用于不同请求');
    if (!state.config.enabled) return fail(503, 'sponsors_disabled', '赞助者功能暂未开放（本地模拟）');

    if (action === 'redeem') {
      const planId = ({ 'TEST-MONTH': 'month', 'TEST-PERMANENT': 'permanent' })[normalized.code];
      if (!planId) return fail(409, 'code_unavailable', '测试兑换码无效');
      if (state.membership.permanent) return fail(409, 'already_permanent', '您已是永久赞助者，无需再次兑换；测试码未消费');
      if (state.consumed.has(normalized.code)) return fail(409, 'code_unavailable', '测试兑换码已使用');
      const plan = state.plans.find(p => p.id === planId);
      const now = Math.floor(Date.now() / 1000);
      const permanent = plan.duration_unit === 'permanent';
      const end = new Date(Math.max(now, state.membership.expires_at ?? 0) * 1000);
      end.setUTCMonth(end.getUTCMonth() + 1);
      state.membership = { permanent, expires_at: permanent ? null : Math.floor(end.getTime() / 1000), plan_name: plan.name,
        color_key: permanent ? 'gold' : state.membership.color_key };
      state.consumed.add(normalized.code);
      state.history.unshift({ id: `fixture-redemption-${state.history.length + 1}`, plan_name: plan.name, redeemed_at: now,
        expires_at: state.membership.expires_at, permanent });
    } else {
      const me = snapshot();
      if (!me.sponsor.active) return fail(403, 'sponsor_required', '此操作需要有效的赞助者身份');
      if (action === 'color') {
        const color = state.config.colors.find(c => c.key === body.color_key);
        if (!color || color.permanent_only !== me.sponsor.permanent) return fail(422, 'invalid_color', '该颜色不可选择');
        state.membership.color_key = color.key;
      } else {
        const benefit = state.config.benefits.find(b => b.id === body.benefit_id);
        if (!benefit || benefit.status !== 'available' || benefit.action !== 'claim') return fail(409, 'benefit_unavailable', '该权益尚未开放领取');
        state.claimed.add(benefit.id);
      }
    }
    const result = ok({ ...snapshot(), ...(action === 'redeem' ? { message: '兑换成功，赞助者身份已更新（仅本地内存）' } : {}) });
    if (op) state.operations.set(op, { signature, result: copy(result) });
    if (action === 'redeem' && state.scenario === 'network-unknown' && !state.unknownSent) {
      state.unknownSent = true;
      // 已完成内存事务且保存成功快照，只让第一次响应返回可观测的 HTTP 503。
      return fail(503, 'sponsors_unavailable', '本地模拟：兑换已受理，但本次响应不可用；请保持原 operation_id 重试');
    }
    return result;
  };

  return {
    setup, currentUser,
    get stats() { return copy(requests); },
    respond(path, method = 'GET', searchParams = new URLSearchParams(), body = null) {
      method = method.toUpperCase();
      if (path === '/__sponsor-fixture/stats' && method === 'GET') return ok(requests);
      if (path === '/__sponsor-fixture/setup' && method === 'POST') {
        if (!plainObject(body)) return fail(400, 'invalid_request', '准备参数必须为 JSON 对象');
        try { return ok(setup(body)); }
        catch { return fail(400, 'invalid_request', '未知的 fixture 身份或场景'); }
      }
      // 只记录方法、路径与合法 UUID；从不记录请求体、兑换码、查询参数或凭据。
      requests.push({ method, path, op: typeof body?.operation_id === 'string' && UUID.test(body.operation_id) ? body.operation_id.toLowerCase() : null });
      if (path === '/api/auth/me' && method === 'GET') return state.account ? ok({ user: currentUser() }) : fail(401, 'unauthorized', '未登录（本地模拟）');
      if (path === `${API}catalog` && method === 'GET') {
        state.catalogReads += 1;
        if (state.scenario === 'config-change' && state.catalogReads === 2) {
          state.config = { ...state.config, version: 2, notice_version: 2, sponsor_daily_limit: 30, center_title: '赞助者中心（本地配置已更新）' };
        }
        return ok({ config: state.config, plans: state.scenario === 'empty' ? [] : state.plans });
      }
      const known = (method === 'GET' && [API + 'me', API + 'redemptions'].includes(path))
        || (method === 'POST' && [API + 'redeem', API + 'claims'].includes(path)) || (method === 'PUT' && path === API + 'color');
      if (!known) return notFound();
      if (!state.account || state.scenario === 'unauthorized') return fail(401, 'unauthorized', '赞助身份验证已失效（本地模拟）');
      if (path === `${API}me`) return ok(snapshot(true));
      if (path === `${API}redemptions`) {
        if (state.scenario === 'history-error') return fail(503, 'sponsors_unavailable', '本地模拟：兑换历史读取失败，请重试');
        const limit = searchParams.get('limit') ?? '20', offset = searchParams.get('offset') ?? '0';
        if (!/^\d{1,7}$/.test(limit) || Number(limit) < 1 || Number(limit) > 100 || !/^\d{1,7}$/.test(offset) || Number(offset) > 1000000) return fail(422, 'invalid_request', '分页参数不正确');
        return ok({ items: state.history.slice(Number(offset), Number(offset) + Number(limit)), total: state.history.length });
      }
      return mutate(path, method, body);
    },
  };
}
