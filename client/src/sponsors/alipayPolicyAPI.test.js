import test from 'node:test';
import assert from 'node:assert/strict';
import { createSponsorAdminAPI } from './adminAPI.js';
import { alipayPolicyDraft, alipayPolicyUpdate, verifyAlipayPolicySave } from './alipayPolicyModel.js';
import { ALIPAY_FIXTURE_SCENARIOS, alipayPolicyFixtureSample, createAlipayPolicyFixture } from '../../tests/alipay-policy-fixture.js';
import { createAlipayPolicyFixtureServer } from '../../tests/alipay-policy-fixture-server.js';

const sample = () => alipayPolicyFixtureSample(1793923200);
const body = () => alipayPolicyUpdate(alipayPolicyDraft(sample().settings), 1, '测试人工核实');
const apiFixture = scenario => {
  const fixture = createAlipayPolicyFixture(scenario), calls = [];
  const api = createSponsorAdminAPI({ fetcher: async (url, options) => {
    calls.push({ url, options });
    const result = fixture.respond(new URL(url, 'http://fixture.invalid').pathname, options.method, options.body ? JSON.parse(options.body) : null);
    return Response.json(result.data, { status: result.status });
  } });
  return { api, calls, fixture };
};

test('真实 adminAPI GET/PUT 使用同一会话 no-store/cookie，exact 写入不加 operation_id', async () => {
  const calls = []; let token = 'fixture-session-A';
  const api = createSponsorAdminAPI({ base: 'https://local.invalid/', getToken: () => token, fetcher: async (url, options) => { calls.push({ url, options }); return Response.json(sample()); } });
  const read = await api.alipayPolicy(); token = 'fixture-session-B'; await api.saveAlipayPolicy(body());
  assert.equal(read.version, 1);
  for (const [index, call] of calls.entries()) {
    assert.equal(call.url, 'https://local.invalid/api/admin/sponsors/alipay-policy');
    assert.equal(call.options.method, index ? 'PUT' : 'GET');
    assert.equal(call.options.headers.Authorization, `Bearer fixture-session-${index ? 'B' : 'A'}`);
    assert.equal(call.options.credentials, 'include'); assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.redirect, 'error');
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  assert.equal(calls[0].options.body, undefined);
  assert.deepEqual(JSON.parse(calls[1].options.body), body());
  assert.deepEqual(Object.keys(JSON.parse(calls[1].options.body)).sort(), ['expected_version', 'reason', 'settings']);
  assert.equal(calls[1].options.headers['Content-Type'], 'application/json');
});

test('真实 API 拒绝不完整及未知字段写入，不发网络请求；非法响应 fail-closed', async () => {
  let requests = 0;
  const api = createSponsorAdminAPI({ fetcher: async () => { requests++; return Response.json(sample()); } });
  for (const value of [{ ...body(), operation_id: 'not-allowed' }, { ...body(), settings: { ...body().settings, raw_config: {} } }, { ...body(), expected_version: 0 }]) assert.throws(() => api.saveAlipayPolicy(value));
  assert.equal(requests, 0);
  for (const data of [{ ok: true }, { ...sample(), raw_policy: {} }, { ...sample(), usage: null }, { ...sample(), settings: { ...sample().settings, merchant_status: 'official_auto' } }]) {
    const invalid = createSponsorAdminAPI({ fetcher: async () => Response.json(data) });
    await assert.rejects(invalid.alipayPolicy(), /契约不一致/);
    await assert.rejects(invalid.saveAlipayPolicy(body()), /契约不一致/);
  }
});

test('JSON/HTML 的 401/403/404/405/409/503 均明确拒绝，无假保存和自动重试', async () => {
  for (const [status, expected] of [[401, /登录已过期/], [403, /管理员权限/], [404, /接口尚未提供/], [405, /接口尚未提供/], [409, /操作冲突/], [503, /请求失败/]]) {
    for (const format of ['json', 'html']) {
      let count = 0;
      const api = createSponsorAdminAPI({ fetcher: async () => { count++; return format === 'json' ? Response.json({ error: 'do-not-display-raw-config' }, { status }) : new Response('<html>error</html>', { status }); } });
      await assert.rejects(api.saveAlipayPolicy(body()), error => error.status === status && expected.test(error.message) && !error.message.includes('do-not-display'));
      assert.equal(count, 1);
    }
  }
});

test('中断/坏 JSON/响应时切号丢弃，未配置 base 也不回退 localStorage 或模拟成功', async () => {
  let requests = 0;
  const broken = createSponsorAdminAPI({ base: '', fetcher: async () => { requests++; throw new TypeError('connection failed'); } });
  await assert.rejects(broken.alipayPolicy(), /网络中断或超时.*不会自动重试/);
  await assert.rejects(broken.saveAlipayPolicy(body()), /未确认保存成功/); assert.equal(requests, 2);
  const json = createSponsorAdminAPI({ fetcher: async () => new Response('not JSON', { status: 200 }) });
  await assert.rejects(json.alipayPolicy(), /无法解析/);
  let current = true;
  const changed = createSponsorAdminAPI({ isCurrentSession: () => current, fetcher: async () => { current = false; return Response.json(sample()); } });
  await assert.rejects(changed.alipayPolicy(), /忽略旧账户响应/);
  let called = false;
  const stale = createSponsorAdminAPI({ isCurrentSession: () => false, fetcher: async () => { called = true; } });
  await assert.rejects(stale.alipayPolicy(), /会话已切换/); assert.equal(called, false);
});

test('真实 GET/PUT fixture 往返，默认false，可关闭但不清掉 paid/pending/occupied', async () => {
  const { api, calls } = apiFixture('normal');
  const before = await api.alipayPolicy();
  assert.equal(before.settings.purchase_enabled, false);
  const draft = { ...alipayPolicyDraft(before.settings), purchase_enabled: true, merchant_status: 'restricted_allowed', limits_verified: true, monthly_mode: 'limited', monthly: '2000' };
  const update = alipayPolicyUpdate(draft, before.version, '平台允许受限收款，人工核实额度');
  const receipt = await api.saveAlipayPolicy(update), latest = await api.alipayPolicy();
  assert.equal(verifyAlipayPolicySave(before, update.settings, receipt, latest), 'confirmed');
  assert.equal(latest.effective.purchase_available, true); assert.equal(latest.effective.reason, null);
  const closed = await api.saveAlipayPolicy({ expected_version: latest.version, settings: { ...latest.settings, purchase_enabled: false }, reason: '暂停新购' });
  assert.equal(closed.effective.purchase_available, false);
  assert.equal(closed.usage.day.paid_minor, before.usage.day.paid_minor);
  assert.equal(closed.usage.day.pending_minor, before.usage.day.pending_minor);
  assert.equal(closed.usage.month.occupied_minor, before.usage.month.occupied_minor);
  assert.equal(calls.filter(call => call.options.method === 'PUT').length, 2);
});

test('真实 CAS 409、不确定已受理、保存后并发新版本均可重现，绝无盲重放', async () => {
  const conflict = apiFixture('conflict');
  const first = await conflict.api.alipayPolicy();
  await assert.rejects(conflict.api.saveAlipayPolicy(alipayPolicyUpdate(alipayPolicyDraft(first.settings), first.version, '核实')), error => error.status === 409);
  const other = await conflict.api.alipayPolicy();
  assert.equal(other.version, 2); assert.equal(other.updated_by, 'fixture-admin-B');
  assert.equal(conflict.calls.filter(call => call.options.method === 'PUT').length, 1);
  const unknown = apiFixture('save-unknown');
  const initial = await unknown.api.alipayPolicy();
  const update = alipayPolicyUpdate({ ...alipayPolicyDraft(initial.settings), daily: '900' }, initial.version, '核实');
  await assert.rejects(unknown.api.saveAlipayPolicy(update), error => error.status === 503);
  const accepted = await unknown.api.alipayPolicy();
  assert.equal(accepted.version, 2); assert.equal(accepted.settings.daily_minor, 90000);
  assert.equal(unknown.calls.filter(call => call.options.method === 'PUT').length, 1);
  const concurrent = apiFixture('concurrent-after-save');
  const before = await concurrent.api.alipayPolicy(), payload = alipayPolicyUpdate(alipayPolicyDraft(before.settings), before.version, '核实');
  const receipt = await concurrent.api.saveAlipayPolicy(payload), latest = await concurrent.api.alipayPolicy();
  assert.equal(verifyAlipayPolicySave(before, payload.settings, receipt, latest), 'concurrent');
  assert.equal(latest.updated_by, 'fixture-admin-B');
});

test('本地所有 fixture 成功样本均满足真 API shape；未知场景和未知 API 不转发', async () => {
  const rejected = new Set(['missing-api', 'load-error', 'invalid-data', 'unauthorized', 'forbidden']);
  for (const scenario of ALIPAY_FIXTURE_SCENARIOS) {
    const { api } = apiFixture(scenario);
    if (rejected.has(scenario)) await assert.rejects(api.alipayPolicy());
    else assert.equal((await api.alipayPolicy()).schema_version, 1);
  }
  const fixture = createAlipayPolicyFixture();
  assert.equal(fixture.respond('/api/unknown').status, 404);
  assert.throws(() => fixture.setup('unknown'));
});

test('loopback fixture HTTP server 与真实 adminAPI 往返；拦跨来源与未知API，不启Vite', async () => {
  const app = await createAlipayPolicyFixtureServer({ port: 0, ui: false });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  try {
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const api = createSponsorAdminAPI({ base });
    const previous = await api.alipayPolicy(), update = alipayPolicyUpdate(alipayPolicyDraft(previous.settings), previous.version, 'HTTP fixture 核实');
    const receipt = await api.saveAlipayPolicy(update), latest = await api.alipayPolicy();
    assert.equal(verifyAlipayPolicySave(previous, update.settings, receipt, latest), 'confirmed');
    const response = await fetch(`${base}/api/admin/sponsors/alipay-policy`);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.equal((await fetch(`${base}/api/admin/sponsors/alipay-policy`, { headers: { Origin: 'https://evil.invalid' } })).status, 403);
    assert.equal((await fetch(`${base}/api/unknown`, { method: 'POST', body: '{bad-json' })).status, 404);
    const landing = await fetch(`${base}/__alipay-policy-fixture?scenario=conflict&theme=colorful`);
    assert.equal(landing.status, 200); assert.match(await landing.text(), /真实 SponsorAdmin/);
  } finally { await app.close(); }
});
