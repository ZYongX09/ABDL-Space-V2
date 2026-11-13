import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createUserObservationAPI, ROOT } from './api.js';
import { DEFAULT_POLICY, TIMEZONE } from './model.js';
import { createObservationFixture, fixtureRequest, fixtureTarget } from './fixture.js';

const session = { user: { id: 1, role: 'admin', is_super_admin: true }, token: 'fixture-only' };
const uuidRevision = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const generation = { target_revision: fixtureTarget().revision, policy_revision: '0' };
const legacyHash = (tracking, ips) => createHash('sha256').update(JSON.stringify([tracking, ips])).digest('hex');
function harness(overrides = {}) {
  const fixture = createObservationFixture(), calls = [];
  const api = createUserObservationAPI({ getSession: () => session, fetcher: async (path, options) => {
    calls.push({ path, options });
    const url = new URL(path, 'http://127.0.0.1');
    const result = fixture.respond(url.pathname, { method: options.method, params: url.searchParams, body: options.body ? JSON.parse(options.body) : undefined, operationId: options.headers['Idempotency-Key'] });
    return new Response(JSON.stringify(result.data), { status: result.status, headers: { 'Content-Type': 'application/json' } });
  }, ...overrides });
  return { api, fixture, calls };
}

test('ROOT 契约、cookie/bearer/no-store、禁止重定向，无离线缓存或额外详情请求', async () => {
  const { api, calls } = harness();
  const policy = await api.policy(); const target = await api.target(3);
  assert.equal(policy.timezone, TIMEZONE); assert.equal(policy.policy.enabled, false); assert.equal(target.user.role, 'user');
  assert.equal(calls[0].path, `${ROOT}/policy`); assert.equal(calls[1].path, `${ROOT}/targets/3`);
  for (const { options } of calls) { assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error'); assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.headers.Authorization, 'Bearer fixture-only'); assert.equal(Object.hasOwn(options, 'body'), false); }
});

test('所有写入必须 UUID 幂等键、理由和 CAS；policy/target 只发送确切白名单', async () => {
  const { api, calls } = harness();
  await assert.rejects(api.savePolicy({ ...DEFAULT_POLICY, reason: '排查' }), /操作标识/); assert.equal(calls.length, 0);
  await api.savePolicy({ ...DEFAULT_POLICY, reason: '排查', password: 'secret', write_all_users: true }, { operationId: randomUUID() });
  assert.deepEqual(Object.keys(JSON.parse(calls[0].options.body)).sort(), ['enabled', 'global_daily_limit', 'per_user_daily_limit', 'reason', 'retention_days', 'revision']);
  assert.match(calls[0].options.headers['Idempotency-Key'], /^[0-9a-f-]{36}$/);
  const result = await api.saveTarget(4, { observe_ip: false, observe_requests: true, reason: '排查请求', revision: '0', ban: true, private_action: 'read' }, { operationId: randomUUID() });
  assert.equal(result.target.observe_ip, false); assert.equal(result.target.observe_requests, true);
  const body = JSON.parse(calls.at(-1).options.body); assert.equal(Object.hasOwn(body, 'ban'), false); assert.equal(Object.hasOwn(body, 'private_action'), false); assert.ok(body.expires_at);
});

test('真实后端形状 UUID revision 连续读写与清日后CAS原样传回，旧版本仍409', async () => {
  const { api, calls } = harness();
  let policy = (await api.policy()).policy;
  for (let index = 0; index < 2; index += 1) {
    const previous = policy.revision;
    policy = (await api.savePolicy({ ...policy, reason: '复核策略版本' }, { operationId: randomUUID() })).policy;
    assert.equal(JSON.parse(calls.at(-1).options.body).revision, previous);
    assert.match(policy.revision, uuidRevision); assert.notEqual(policy.revision, previous);
    assert.equal((await api.policy()).policy.revision, policy.revision);
  }
  assert.match((await api.targets()).items[0].revision, uuidRevision);
  let target = (await api.target(3)).target;
  const original = target.revision;
  target = (await api.saveTarget(3, { ...target, reason: '复核目标版本' }, { operationId: randomUUID() })).target;
  assert.equal(JSON.parse(calls.at(-1).options.body).revision, original); assert.match(target.revision, uuidRevision);
  assert.equal((await api.target(3)).target.revision, target.revision);
  await assert.rejects(api.saveTarget(3, { ...target, revision: original, reason: '旧版本不能覆盖' }, { operationId: randomUUID() }), error => error.status === 409);
  const cleared = await api.clearDay(3, { day: '2026-11-13', revision: target.revision, reason: '仅清所选日' }, { operationId: randomUUID() });
  assert.equal(JSON.parse(calls.at(-1).options.body).revision, target.revision); assert.match(cleared.revision, uuidRevision); assert.notEqual(cleared.revision, target.revision);
  assert.equal((await api.target(3)).target.revision, cleared.revision);
});

test('请求/IP页必须有双revision generation；授权白名单原样发送，缺失或坏generation禁止复制', async () => {
  const malformed = [undefined, null, {}, { target_revision: '0' }, { ...generation, target_revision: 1 }, { ...generation, policy_revision: 'x'.repeat(129) }];
  for (const value of malformed) {
    const { api } = harness({ fetcher: async () => new Response(JSON.stringify({ items: [], next_cursor: null, timezone: TIMEZONE, generation: value })) });
    await assert.rejects(api.requests(3, { day: '2026-11-13' }));
    await assert.rejects(api.ips(3));
  }
  const { api, calls } = harness();
  const page = await api.requests(3, { day: '2026-11-13' }); assert.deepEqual(page.generation, generation);
  const input = { day: '2026-11-13', scope: 'current_page', reason: '明确复核当前页', count: page.items.length, generation: { ...page.generation, private_field: '不可转发' } };
  await api.authorizeExport(3, input, { operationId: randomUUID() });
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { ...input, generation });
  const count = calls.length;
  for (const value of malformed) assert.throws(() => api.authorizeExport(3, { ...input, generation: value }, { operationId: randomUUID() }));
  assert.equal(calls.length, count);
  assert.equal((await api.requests(4, { day: '2026-11-13' })).generation.target_revision, '0');
});

test('clear或policy改变拒绝旧页新授权及幂等回执重放，重读新generation后可授权', async () => {
  for (const change of ['clear', 'policy']) {
    const { api, fixture } = harness();
    const page = await api.requests(3, { day: '2026-11-13' });
    const body = { day: '2026-11-13', scope: 'current_page', reason: '明确当前页导出', count: page.items.length, generation: page.generation };
    const options = { operationId: randomUUID() };
    await api.authorizeExport(3, body, options);
    if (change === 'clear') await api.clearDay(3, { day: body.day, revision: page.generation.target_revision, reason: '清除旧日数据' }, { operationId: randomUUID() });
    else await api.savePolicy({ ...DEFAULT_POLICY, reason: '改变策略代次' }, { operationId: randomUUID() });
    const audits = fixture.audit.length;
    for (const operationId of [options.operationId, randomUUID()]) await assert.rejects(api.authorizeExport(3, body, { operationId }), error => error.status === 409);
    assert.equal(fixture.audit.length, audits);
    const fresh = await api.requests(3, { day: body.day }); assert.notDeepEqual(fresh.generation, page.generation);
    await api.authorizeExport(3, { ...body, count: fresh.items.length, generation: fresh.generation }, { operationId: randomUUID() });
  }
});

test('IP all/day 和请求筛选游标区分；day/raw_query 不泄漏到 targets/days', async () => {
  const { api, calls } = harness();
  await api.ips(3, { cursor: '50' }); assert.equal(new URL(calls.at(-1).path, 'http://fixture.invalid').searchParams.has('day'), false);
  await api.ips(3, { day: '2026-11-12', cursor: '50', method: 'POST', token: 'secret' });
  assert.match(calls.at(-1).path, /day=2026-11-12/); assert.doesNotMatch(calls.at(-1).path, /method|token/);
  await api.requests(3, { day: '2026-11-12', method: 'POST', status: 403, cursor: '50', raw_query: 'private' });
  assert.match(calls.at(-1).path, /method=POST/); assert.match(calls.at(-1).path, /status=403/); assert.doesNotMatch(calls.at(-1).path, /private/);
  await api.targets({ day: '不要转发' }); assert.doesNotMatch(calls.at(-1).path, /day=/);
  await api.days(3, { day: '不要转发' }); assert.doesNotMatch(calls.at(-1).path, /day=/);
});

test('404 未配置不能伪成功；unknown 字段剔除；错误不带服务端原始隐私输出', async () => {
  const { api } = harness(); await assert.rejects(api.target(999), error => error.status === 404);
  const notConfigured = await api.target(4); assert.equal(notConfigured.target, null);
  const bad = harness({ fetcher: async () => new Response(JSON.stringify({ error: 'secret-private-content', code: 'bad' }), { status: 500 }) });
  await assert.rejects(bad.api.policy(), error => !error.message.includes('secret-private-content') && error.status === 500);
  const invalid = harness({ fetcher: async () => new Response(JSON.stringify({ items: [], next_cursor: null, timezone: 'UTC' })) });
  await assert.rejects(invalid.api.requests(3, { day: '2026-11-12' }), /时区/);
  const unknown = harness({ fetcher: async () => new Response(JSON.stringify({ items: [{ ...fixtureRequest(), raw_query: 'secret' }], next_cursor: null, timezone: TIMEZONE, generation })) });
  const page = await unknown.api.requests(3, { day: '2026-11-12' }); assert.equal(Object.hasOwn(page.items[0], 'raw_query'), false);
});

test('非超管/禁用不请求，401403 非JSON仍保留权限状态；oversized响应中止', async () => {
  for (const user of [{ id: 2, role: 'admin' }, { id: 1, role: 'admin', is_super_admin: false }]) {
    const { api, calls } = harness({ getSession: () => ({ user }) }); await assert.rejects(api.policy(), error => error.status === 403); assert.equal(calls.length, 0);
  }
  const offline = harness({ enabled: false }); await assert.rejects(offline.api.policy(), /不提供离线/); assert.equal(offline.calls.length, 0);
  for (const status of [401, 403]) { const { api } = harness({ fetcher: async () => new Response('not json', { status }) }); await assert.rejects(api.policy(), error => error.status === status); }
  const oversized = harness({ fetcher: async () => new Response('x', { headers: { 'Content-Length': String(3 * 1024 * 1024) } }) }); await assert.rejects(oversized.api.policy(), /无法解析/);
});

test('旧操作独立路径、明确选择<=100；禁止由历史IP泛删共享封禁', async () => {
  const { api, calls } = harness();
  const legacy = await api.legacy(3); assert.equal(legacy.tracking, true);
  assert.equal(legacy.rule_revision, legacyHash(true, ['192.0.2.17']));
  const stopped = await api.stopLegacy(3, { reason: '停止旧机制', revision: legacy.rule_revision, ips: ['192.0.2.17'] }, { operationId: randomUUID() });
  assert.equal(calls.at(-1).path, `${ROOT}/legacy/3/stop`); assert.deepEqual(JSON.parse(calls.at(-1).options.body), { reason: '停止旧机制', revision: legacy.rule_revision });
  assert.equal(stopped.rule_revision, legacyHash(false, ['192.0.2.17']));
  assert.equal((await api.legacy(3)).rule_revision, stopped.rule_revision);
  assert.throws(() => api.unbanLegacy(3, { ips: [], reason: '未明确选择', revision: stopped.rule_revision }, { operationId: randomUUID() }), /明确选择/);
  const unbanned = await api.unbanLegacy(3, { ips: ['192.0.2.17'], reason: '明确核对来源', revision: stopped.rule_revision, delete_history_ips: true }, { operationId: randomUUID() });
  assert.equal(calls.at(-1).path, `${ROOT}/legacy/3/unban`); assert.equal(Object.hasOwn(JSON.parse(calls.at(-1).options.body), 'delete_history_ips'), false);
  assert.equal(JSON.parse(calls.at(-1).options.body).revision, stopped.rule_revision);
  assert.equal(unbanned.rule_revision, legacyHash(false, []));
  assert.equal((await api.legacy(3)).rule_revision, unbanned.rule_revision);
});
