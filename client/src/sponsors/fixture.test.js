import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createSponsorFixture, SPONSOR_FIXTURE_IDENTITIES, SPONSOR_FIXTURE_SCENARIOS } from './fixture.js';
import { createSponsorFixtureServer } from '../../tests/sponsor-fixture-server.js';

const API = '/api/v1/sponsors/';
const op = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const get = (fixture, name, query = '') => fixture.respond(API + name, 'GET', new URLSearchParams(query));
const write = (fixture, name, body, method = 'POST') => fixture.respond(API + name, method, new URLSearchParams(), body);
const redeem = (fixture, code = 'TEST-MONTH', operation_id = op(1), extra = {}) => write(fixture, 'redeem', { code, operation_id, ...extra });

function request(server, path, { method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const text = body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body);
    const req = http.request({ hostname: '127.0.0.1', port: server.address().port, path, method,
      headers: { ...(text === null ? {} : { 'Content-Type': 'application/json' }), ...headers } }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let data;
        try { data = JSON.parse(text); } catch { data = null; }
        resolve({ status: res.statusCode, text, data, headers: res.headers });
      });
    });
    req.setTimeout(10000, () => req.destroy(new Error('本地测试请求超时')));
    req.on('error', reject);
    if (text !== null) req.write(text);
    req.end();
  });
}
async function listen(app) {
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
}

// 纯模块可在 Node/SSR 无 window 环境导入，故测试不依赖浏览器或真实 API。
test('所有路径仅内存响应：禁止 fetch/http/https 出站且未知 API 一律 404', t => {
  const deny = () => { assert.fail('fixture 不得创建任何网络请求'); };
  t.mock.method(globalThis, 'fetch', deny);
  for (const transport of [http, https]) for (const key of ['request', 'get']) t.mock.method(transport, key, deny);
  for (const scenario of SPONSOR_FIXTURE_SCENARIOS) {
    const fixture = createSponsorFixture(scenario);
    get(fixture, 'catalog'); get(fixture, 'me'); get(fixture, 'redemptions'); redeem(fixture);
    write(fixture, 'color', { color_key: 'pink' }, 'PUT'); write(fixture, 'claims', { benefit_id: 'claim', operation_id: op(2) });
    for (const path of ['/api', '/api/unknown', '/api/v1/sponsors/payment', '/api/auth/login', 'https://example.invalid/api']) {
      assert.equal(fixture.respond(path, 'POST').status, 404);
    }
  }
});

test('catalog 提供完整配置、合法虚构 32hex 商品规格与仅官方 URL；额度上海次日重置', () => {
  const fixture = createSponsorFixture();
  const { config, plans } = get(fixture, 'catalog').data;
  for (const key of ['enabled', 'version', 'center_title', 'free_daily_limit', 'sponsor_daily_limit', 'timezone', 'notice_version', 'notice_title', 'notice_body', 'exhausted_title', 'exhausted_body', 'sponsor_exhausted_body', 'purchase_title', 'purchase_steps', 'minimum_read_seconds', 'default_color_key', 'colors', 'benefits']) assert.ok(Object.hasOwn(config, key), key);
  assert.equal(config.version, 1); assert.equal(config.timezone, 'Asia/Shanghai'); assert.equal(config.minimum_read_seconds, 5);
  assert.ok(config.colors.some(c => c.permanent_only)); assert.ok(config.colors.some(c => !c.permanent_only));
  for (const action of ['original', 'color', 'claim']) assert.ok(config.benefits.some(b => b.action === action));
  assert.ok(config.benefits.some(b => b.id === 'album_storage' && b.status === 'automatic'));
  assert.ok(config.benefits.some(b => b.status === 'coming_soon' && b.action === 'none'));
  assert.equal(plans.length, 5);
  for (const plan of plans) {
    for (const key of ['id', 'version', 'name', 'description', 'price_minor', 'currency', 'duration_unit', 'duration_count', 'purchase_url', 'afdian_plan_id', 'afdian_sku_id', 'enabled', 'sort_order']) assert.ok(Object.hasOwn(plan, key), key);
    assert.match(plan.afdian_plan_id, /^[0-9a-f]{32}$/i); assert.match(plan.afdian_sku_id, /^[0-9a-f]{32}$/i);
    const url = new URL(plan.purchase_url);
    assert.equal(url.origin, 'https://ifdian.net'); assert.equal(url.pathname, '/order/create');
    assert.equal(url.searchParams.get('product_type'), '1'); assert.equal(url.searchParams.get('plan_id'), plan.afdian_plan_id);
    assert.equal(url.searchParams.get('viokrz_ex'), '0');
    assert.deepEqual(JSON.parse(url.searchParams.get('sku')), [{ sku_id: plan.afdian_sku_id, count: 1 }]);
    assert.deepEqual([...url.searchParams.keys()].sort(), ['plan_id', 'product_type', 'sku', 'viokrz_ex']);
  }
  const { quota, album_quota } = get(fixture, 'me').data;
  assert.equal(quota.remaining, quota.limit - quota.used);
  assert.equal(quota.resets_at, Date.parse(`${quota.day_key}T00:00:00+08:00`) / 1000 + 86400);
  assert.ok(quota.resets_at > Date.now() / 1000); assert.ok(quota.resets_at - Date.now() / 1000 <= 86400);
  assert.equal(album_quota.tier, 'free'); assert.equal(album_quota.limit_bytes, 3 * 1024 ** 3);
  config.colors.length = 0; plans[0].name = '污染';
  assert.equal(get(fixture, 'catalog').data.config.colors.length, 3);
  assert.notEqual(get(fixture, 'catalog').data.plans[0].name, '污染');
});

test('五种身份的 user/settings schema、有效期与空间派生正确；setup 不伪造历史或消费码', () => {
  const fixture = createSponsorFixture();
  for (const identity of SPONSOR_FIXTURE_IDENTITIES) {
    fixture.setup({ identity });
    const auth = fixture.respond('/api/auth/me', 'GET');
    if (identity === 'guest') {
      assert.equal(fixture.currentUser(), null); assert.equal(auth.status, 401); assert.equal(get(fixture, 'me').status, 401); continue;
    }
    for (const key of ['id', 'username', 'display_name', 'role', 'email', 'avatar']) assert.ok(Object.hasOwn(auth.data.user, key), key);
    assert.equal(auth.data.user.avatar, null); assert.equal(auth.data.user.role, 'user');
    const me = get(fixture, 'me').data;
    assert.equal(me.sponsor.active, ['active', 'permanent'].includes(identity));
    assert.equal(me.sponsor.permanent, identity === 'permanent');
    assert.equal(me.album_quota.tier, ({ regular: 'free', active: 'month', permanent: 'permanent', expired: 'free' })[identity]);
    assert.equal(get(fixture, 'redemptions').data.total, 0);
    if (identity === 'expired') { assert.ok(me.sponsor.expires_at < Date.now() / 1000); assert.equal(me.sponsor.color_light, null); assert.ok(me.album_quota.used_bytes > 0); }
    if (identity === 'permanent') assert.equal(me.sponsor.expires_at, null);
  }
  fixture.setup({ identity: 'active' });
  assert.equal(redeem(fixture).status, 200);
  assert.equal(get(fixture, 'redemptions').data.total, 1);
});

test('兑换规范化并更新身份/历史；成功响应无 album_quota，而 /me 带最新空间', () => {
  const fixture = createSponsorFixture();
  const result = redeem(fixture, '  test- mO nTh\n');
  assert.equal(result.status, 200); assert.equal(result.data.sponsor.active, true); assert.equal(result.data.sponsor.permanent, false);
  assert.equal(Object.hasOwn(result.data, 'album_quota'), false);
  assert.equal(get(fixture, 'me').data.album_quota.tier, 'month');
  assert.equal(fixture.currentUser().sponsor.active, true);
  const history = get(fixture, 'redemptions').data;
  assert.equal(history.total, 1); assert.equal(history.items[0].expires_at, result.data.sponsor.expires_at);
  assert.equal(Object.hasOwn(history.items[0], 'code'), false);
  assert.equal(get(fixture, 'redemptions', 'limit=1&offset=1').data.items.length, 0);
  assert.equal(get(fixture, 'redemptions', 'limit=0').status, 422);
  assert.equal(get(fixture, 'redemptions', 'offset=-1').status, 422);
  assert.equal(redeem(fixture, 'TEST-PERMANENT', op(2)).status, 200);
  assert.equal(get(fixture, 'me').data.album_quota.tier, 'permanent');
});

test('相同 UUID 同 body 幂等并保留原 snapshot；异 body/重复码/无效 UUID 不会重复消费', () => {
  const fixture = createSponsorFixture();
  const first = redeem(fixture);
  write(fixture, 'color', { color_key: 'pink' }, 'PUT');
  const replay = write(fixture, 'redeem', { operation_id: op(1).toUpperCase(), code: ' test-month ' });
  assert.deepEqual(replay, first);
  replay.data.sponsor.active = false;
  assert.deepEqual(redeem(fixture), first);
  assert.equal(get(fixture, 'me').data.sponsor.color_key, 'pink');
  assert.equal(redeem(fixture, 'TEST-PERMANENT', op(1)).data.code, 'idempotency_conflict');
  assert.equal(redeem(fixture, 'TEST-MONTH', op(1), { changed: true }).status, 409);
  assert.equal(redeem(fixture, 'TEST-MONTH', op(2)).data.code, 'code_unavailable');
  assert.equal(redeem(fixture, 'TEST-PERMANENT', 'not-a-uuid').status, 422);
  assert.equal(write(fixture, 'redeem', null).status, 400);
  assert.equal(get(fixture, 'redemptions').data.total, 1);
});

test('network-unknown 第一次已受理返回503，原UUID重试返回稳定成功快照且只写一次历史', () => {
  const fixture = createSponsorFixture('network-unknown');
  const first = redeem(fixture);
  assert.equal(first.status, 503); assert.equal(first.data.code, 'sponsors_unavailable');
  assert.equal(get(fixture, 'me').data.sponsor.active, true);
  assert.equal(get(fixture, 'redemptions').data.total, 1);
  assert.equal(redeem(fixture, 'TEST-MONTH', op(2)).status, 409);
  const retry = redeem(fixture);
  assert.equal(retry.status, 200); assert.equal(Object.hasOwn(retry.data, 'album_quota'), false);
  assert.deepEqual(redeem(fixture), retry);
  assert.equal(redeem(fixture, 'TEST-PERMANENT', op(2)).status, 200); // 每次 setup 只一次未知响应。
  assert.equal(get(fixture, 'redemptions').data.total, 2);
});

test('永久不消费；颜色/领取校验、领取幂等和未来权益门禁均为内存行为', () => {
  const fixture = createSponsorFixture();
  assert.equal(write(fixture, 'color', { color_key: 'blue' }, 'PUT').data.code, 'sponsor_required');
  fixture.setup({ identity: 'permanent' });
  assert.equal(redeem(fixture).data.code, 'already_permanent');
  assert.equal(redeem(fixture, 'TEST-PERMANENT', op(2)).data.code, 'already_permanent');
  assert.equal(get(fixture, 'redemptions').data.total, 0);
  assert.equal(write(fixture, 'color', { color_key: 'pink' }, 'PUT').data.code, 'invalid_color');
  assert.equal(write(fixture, 'color', { color_key: 'gold' }, 'PUT').status, 200);
  fixture.setup({ identity: 'active' });
  assert.equal(write(fixture, 'color', { color_key: 'gold' }, 'PUT').status, 422);
  assert.equal(write(fixture, 'color', { color_key: 'pink' }, 'PUT').status, 200);
  const body = { benefit_id: 'claim', operation_id: op(3) };
  const claimed = write(fixture, 'claims', body);
  assert.deepEqual(claimed.data.claimed_benefit_ids, ['claim']);
  assert.deepEqual(write(fixture, 'claims', body), claimed);
  assert.equal(write(fixture, 'claims', { ...body, benefit_id: 'lottery' }).data.code, 'idempotency_conflict');
  assert.equal(write(fixture, 'claims', { benefit_id: 'lottery', operation_id: op(4) }).data.code, 'benefit_unavailable');
});

test('disabled/empty/config-change/history-error/unauthorized 各场景稳定且互不污染', () => {
  const fixture = createSponsorFixture('disabled');
  assert.equal(get(fixture, 'catalog').data.config.enabled, false); assert.equal(redeem(fixture).data.code, 'sponsors_disabled');
  assert.equal(get(fixture, 'me').status, 200);
  fixture.setup({ scenario: 'empty' });
  assert.deepEqual(get(fixture, 'catalog').data.plans, []); assert.deepEqual(get(fixture, 'catalog').data.config.benefits, []);
  assert.deepEqual(get(fixture, 'redemptions').data, { items: [], total: 0 });
  fixture.setup({ scenario: 'config-change' });
  assert.equal(get(fixture, 'catalog').data.config.version, 1); assert.equal(get(fixture, 'me').data.config_version, 1);
  assert.equal(get(fixture, 'catalog').data.config.version, 2); assert.equal(get(fixture, 'me').data.config_version, 2);
  for (let i = 0; i < 3; i++) assert.equal(get(fixture, 'catalog').data.config.version, 2);
  fixture.setup({ scenario: 'history-error' });
  assert.equal(get(fixture, 'redemptions').status, 503); assert.equal(get(fixture, 'me').status, 200); assert.equal(redeem(fixture).status, 200);
  fixture.setup({ scenario: 'unauthorized' });
  assert.equal(fixture.respond('/api/auth/me').status, 200); assert.equal(get(fixture, 'catalog').status, 200);
  for (const name of ['me', 'redemptions']) assert.equal(get(fixture, name).status, 401);
  assert.equal(redeem(fixture).status, 401); assert.equal(get(fixture, 'payment').status, 404);
  assert.throws(() => fixture.setup({ scenario: 'bad' }), TypeError);
});

test('实例和 setup 完全隔离，统计仅 method/path/op，无原码/query/token且返回不可污染', () => {
  const a = createSponsorFixture(), b = createSponsorFixture();
  redeem(a);
  assert.equal(get(b, 'me').data.sponsor.active, false); assert.equal(get(b, 'redemptions').data.total, 0);
  assert.equal(redeem(b).status, 200);
  const stats = a.stats;
  assert.deepEqual(stats, [{ method: 'POST', path: API + 'redeem', op: op(1) }]);
  assert.equal(JSON.stringify(stats).includes('TEST-MONTH'), false);
  a.respond(API + 'redeem', 'POST', new URLSearchParams('code=secret'), { code: 'TEST-MONTH', operation_id: 'TEST-MONTH' });
  assert.equal(a.stats.at(-1).op, null); assert.equal(JSON.stringify(a.stats).includes('secret'), false);
  stats.length = 0; assert.equal(a.stats.length, 2);
  const user = a.currentUser(); user.role = 'admin'; assert.equal(a.currentUser().role, 'user');
  a.respond('/__sponsor-fixture/setup', 'POST', undefined, { identity: 'regular', scenario: 'normal' });
  assert.deepEqual(a.respond('/__sponsor-fixture/stats').data, []);
  assert.equal(get(a, 'redemptions').data.total, 0); assert.equal(redeem(a).status, 200);
  assert.equal(get(b, 'redemptions').data.total, 1);
});

test('HTTP 包装器有可见入口/最小本地存储、严格CSP、404兜底、来源限制和可清理生命周期', async t => {
  const app = await createSponsorFixtureServer({ port: 0, ui: false, quiet: true });
  t.after(() => app.close());
  await listen(app);
  const landing = await request(app.server, '/__sponsor-fixture');
  assert.equal(landing.status, 200); assert.match(landing.text, /准备并打开设置页/); assert.match(landing.text, /数据只在内存/);
  assert.match(landing.text, /href="\/settings"/); assert.match(landing.text, /sponsor-fixture-diagnostics/);
  const csp = landing.headers['content-security-policy'];
  assert.match(csp, /default-src 'self'/); assert.match(csp, /connect-src 'self' ws:\/\/127\.0\.0\.1:/); assert.match(csp, /worker-src 'none'/);
  assert.doesNotMatch(csp, /https:|ifdian|unsafe-eval/);
  const script = await request(app.server, '/__sponsor-fixture/landing.js');
  new vm.Script(script.text);
  assert.match(script.text, /fetch\('\/__sponsor-fixture\/setup'/); assert.match(script.text, /location.href = '\/settings'/);
  assert.deepEqual([...script.text.matchAll(/localStorage\.removeItem\('([^']+)'\)/g)].map(m => m[1]).sort(), ['abdl_accounts', 'abdl_active_account']);
  assert.deepEqual([...new Set([...script.text.matchAll(/localStorage\.setItem\('([^']+)'/g)].map(m => m[1]))].sort(), ['abdl_auto_theme', 'abdl_theme', 'cookie_consent']);
  assert.doesNotMatch(script.text, /localStorage.clear|TEST-MONTH|\/api\/.*redeem/);
  const diagnostic = await request(app.server, '/__sponsor-fixture/diagnostics.js');
  new vm.Script(diagnostic.text); assert.match(diagnostic.text, /unhandledrejection/); assert.match(diagnostic.text, /event.isTrusted/);
  for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']) for (const path of ['/api', '/api/unknown', '/api/v1/sponsors/payment', '/%61pi/unknown']) {
    assert.equal((await request(app.server, path, { method })).status, 404);
  }
  assert.equal((await request(app.server, '/__sponsor-fixture/setup', { method: 'POST', body: {} , headers: { Origin: 'https://example.invalid' } })).status, 403);
  assert.equal((await request(app.server, '/api/auth/me', { headers: { Host: 'example.invalid' } })).status, 403);
  assert.equal((await request(app.server, '/api/unknown', { method: 'POST', body: '{' })).status, 404);
  assert.equal((await request(app.server, '/__sponsor-fixture/setup', { method: 'GET' })).status, 404);
  assert.equal((await request(app.server, '/__sponsor-fixture/setup', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await request(app.server, '/__sponsor-fixture/setup', { method: 'POST', body: { identity: 'nope' } })).status, 400);
  const setup = await request(app.server, '/__sponsor-fixture/setup', { method: 'POST', body: { identity: 'regular', scenario: 'network-unknown' } });
  assert.equal(setup.status, 200);
  assert.deepEqual((await request(app.server, '/__sponsor-fixture/stats')).data, []);
  const args = { method: 'POST', body: { code: 'TEST-MONTH', operation_id: op(1) } };
  assert.equal((await request(app.server, API + 'redeem', args)).status, 503);
  assert.equal((await request(app.server, API + 'redeem', args)).status, 200);
  assert.equal((await request(app.server, API + 'redemptions')).data.total, 1);
  assert.equal(JSON.stringify((await request(app.server, '/__sponsor-fixture/stats')).data).includes('TEST-MONTH'), false);
  const large = await request(app.server, '/__sponsor-fixture/setup', { method: 'POST', body: { padding: 'x'.repeat(33000) } });
  assert.equal(large.status, 413);
  assert.equal((await request(app.server, '/sw.js')).status, 404);
  assert.equal((await request(app.server, '/settings')).status, 503);
  const source = await readFile(new URL('../../tests/sponsor-fixture-server.js', import.meta.url), 'utf8');
  for (const pattern of [/configFile: false/, /envFile: false/, /envPrefix: \[\]/, /middlewareMode: true/, /proxy: \{\}/, /ui = true/, /'import.meta.env.VITE_API_BASE': JSON.stringify\(''\)/]) assert.match(source, pattern);
  assert.doesNotMatch(source, /force: true, include|app-clients-fixture|createProxy|https:\/\/api\./);
  // 静态校验虚拟入口的路由映射：不再把生成代码放进 VM 动态执行。
  const entrySource = source.match(/const appEntry = mobile => `([\s\S]*?)`;/)[1].replace(/\$\{mobile[^\n]*\}/g, '');
  for (const [path, component] of [['/settings', 'Settings'], ['/sponsors', 'SponsorCenter']]) {
    assert.match(entrySource, new RegExp(`Route, \\{ path: '${path}', element: React\\.createElement\\(${component}\\) \\}`), `虚拟入口必须把 ${path} 渲染为 ${component}`);
  }
  assert.doesNotMatch(entrySource, /mobile\.css/, '桌面入口不应包含移动样式');
  await app.close(); assert.equal(app.server.listening, false);
});
