import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestVerificationLookup, requestTestVerificationCode, testVerificationQuery, testVerificationResult } from '../src/pages/admin/testVerificationCode.js';
import { createRegistrationGuardFixture } from './registration-guard-fixture.js';
import { createAdminFixtureServer } from './app-clients-fixture-server.js';

const superUser = { id: 1, role: 'admin', is_super_admin: true };
const query = { email: 'tester@test.top', type: 'register' };
const result = (input = query, now = Date.now()) => ({ ...input, code: '735219', expires_at: Math.floor(now / 1000) + 300 });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const restore = (key, descriptor) => { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; };

function clockHarness(request, onRejected = () => {}) {
  let time = 1800000000000, state, session = { user: { ...superUser }, token: 'fixture-super' }, nextTimer = 0;
  const timers = new Map();
  const lookup = createTestVerificationLookup({ request, getSession: () => session, onChange: value => { state = value; }, onRejected,
    now: () => time, schedule(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, at: time + delay }); return id; }, cancel: id => timers.delete(id) });
  return { lookup, timers, get state() { return state; }, get now() { return time; }, setSession(value) { session = value; },
    advance(ms) { time += ms; for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); } } };
}

test('精确输入校验拒绝恶意/批量/域名后缀，三种用途单独查询', () => {
  for (const type of ['register', 'reset', 'bind']) assert.deepEqual(testVerificationQuery({ email: ' Tester+case@Test.Top ', type }), { email: 'tester+case@test.top', type });
  for (const email of ['', null, {}, '*@test.top', 'a@test.top.evil', 'a@sub.test.top', 'member@example.invalid', 'a@test.top@evil.test', 'a@test.top,b@test.top', 'a@test.top\nb@test.top', 'a@test.top\r\n', 'a\0@test.top', 'a b@test.top', '<img>@test.top', "a' OR 1=1@test.top", 'a..b@test.top', 'a.@test.top', 'a'.repeat(65) + '@test.top']) assert.throws(() => testVerificationQuery({ email, type: 'register' }));
  for (const type of ['', undefined, null, 'REGISTER', 'register&all=1', ['register'], '__proto__']) assert.throws(() => testVerificationQuery({ email: query.email, type }));
});

test('响应必须精确匹配请求，六位随机码与 Unix 秒到期时间严格验证', () => {
  const now = 1800000000000, good = result(query, now);
  assert.deepEqual(testVerificationResult({ ...good, extra: '不传播' }, query, now), good);
  for (const changes of [{ email: 'other@test.top' }, { type: 'reset' }, { code: 123456 }, { code: '<script>' }, { code: '1234567' }, { expires_at: '1800000300' }, { expires_at: NaN }, { expires_at: 1.5 }, { expires_at: Number.MAX_SAFE_INTEGER }]) assert.throws(() => testVerificationResult({ ...good, ...changes }, query, now));
  for (const expires_at of [0, now / 1000 - 1, now / 1000]) assert.throws(() => testVerificationResult({ ...good, expires_at }, query, now), error => error.code === 'CODE_EXPIRED');
});

test('非超管、显式false与离线禁止发请求；cookie/Bearer/no-store且不读写存储', async () => {
  const oldFetch = globalThis.fetch, storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const fixture = createRegistrationGuardFixture(); fixture.seed(query.email, query.type);
  globalThis.fetch = fixture.fetch;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('敏感请求不能访问存储'); } });
  try {
    for (const user of [null, { id: 2, role: 'admin', is_super_admin: true }, { id: 1, role: 'user', is_super_admin: true }, ...[false, null, undefined, 1, 'true'].map(value => ({ id: 1, role: 'admin', is_super_admin: value }))]) await assert.rejects(requestTestVerificationCode('', query, { user }), error => error.status === 403);
    await assert.rejects(requestTestVerificationCode('', query, { user: superUser, enabled: false }), /安全服务端/);
    await assert.rejects(requestTestVerificationCode('', { ...query, email: '*@test.top' }, { user: superUser }));
    assert.equal(fixture.calls.length, 0);
    const code = await requestTestVerificationCode('', { ...query, extra: '不得透传' }, { user: superUser, token: 'fixture-super' });
    assert.match(code.code, /^\d{6}$/);
    const call = fixture.calls[0]; assert.equal(call.url, '/api/admin/security/test-verification-code');
    assert.equal(call.options.method, 'POST'); assert.equal(call.options.credentials, 'include'); assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.headers.Authorization, 'Bearer fixture-super'); assert.deepEqual(JSON.parse(call.options.body), query);
    // 旧协议只有缺失 boolean 才可回退，不自行改动既有权限规则。
    await requestTestVerificationCode('', query, { user: { id: '1', role: 'admin' }, token: 'fixture-super' });
    fixture.users.get('fixture-super').role = 'user';
    await assert.rejects(requestTestVerificationCode('', query, { user: superUser, token: 'fixture-super' }), error => error.status === 403 && error.code === 'SUPERADMIN_REQUIRED');
    await assert.rejects(requestTestVerificationCode('', query, { user: superUser, token: 'unknown' }), error => error.status === 401);
  } finally { globalThis.fetch = oldFetch; restore('localStorage', storage); }
});

test('敏感API保留status/code/retryAfter，拒绝旧会话/迟到JSON/过期，不做断网兜底', async () => {
  const oldFetch = globalThis.fetch;
  try {
    for (const status of [400, 401, 403, 404, 429, 503]) {
      globalThis.fetch = async () => Response.json({ error: '内存错误', code: 'FIXTURE_DENIED', retryAfter: 3 }, { status, headers: { 'Retry-After': '7' } });
      await assert.rejects(requestTestVerificationCode('', query, { user: superUser }), error => error.status === status && error.code === 'FIXTURE_DENIED' && error.retryAfter === '7');
    }
    globalThis.fetch = async () => { throw new TypeError('内存断网'); };
    await assert.rejects(requestTestVerificationCode('', query, { user: superUser }), /内存断网/);
    globalThis.fetch = async () => Response.json({ ...result(), expires_at: 1 });
    await assert.rejects(requestTestVerificationCode('', query, { user: superUser }), error => error.code === 'CODE_EXPIRED');
    let current = true; const json = deferred();
    globalThis.fetch = async () => ({ ok: true, status: 200, json: () => json.promise });
    const pending = requestTestVerificationCode('', query, { user: superUser, isCurrent: () => current });
    await Promise.resolve(); current = false; json.resolve(result());
    await assert.rejects(pending, { name: 'AbortError' });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(requestTestVerificationCode('', query, { user: superUser, signal: controller.signal }), { name: 'AbortError' });
  } finally { globalThis.fetch = oldFetch; }
});

test('显式查询前/修改输入时先清空，连续查询迟到响应不能覆盖最新码', async () => {
  const pending = [];
  const h = clockHarness((input, options) => { const d = deferred(); pending.push({ ...d, input, options }); return d.promise; });
  assert.equal(pending.length, 0, '创建控制器不能自动查询');
  const first = h.lookup.query(query); pending[0].resolve(result(query, h.now)); await first;
  assert.ok(h.state.result); assert.equal(h.timers.size, 1);
  const slow = h.lookup.query({ ...query, type: 'reset' });
  assert.equal(h.state.result, null); assert.equal(h.timers.size, 0);
  const latest = h.lookup.query({ ...query, type: 'bind' });
  assert.equal(pending[1].options.signal.aborted, true);
  pending[2].resolve(result(pending[2].input, h.now)); await latest;
  pending[1].resolve(result(pending[1].input, h.now)); await slow;
  assert.equal(h.state.result.type, 'bind');
  await h.lookup.query({ ...query, email: '*@test.top' }); assert.equal(h.state.result, null); assert.ok(h.state.error);
  assert.equal(pending.length, 3, '恶意输入不发请求');
  h.lookup.clear(); assert.equal(h.state.error, null); h.lookup.dispose();
});

test('降权/退出/切号/token刷新丢弃迟到成功及失败，卸载后不能再展示', async () => {
  for (const next of [null, { user: { id: 2, role: 'admin' }, token: 'fixture-admin' }, { user: { ...superUser, is_super_admin: false }, token: 'fixture-super' }, { user: { ...superUser }, token: 'rotated-token' }]) {
    for (const failure of [false, true]) {
      const d = deferred(); let rejections = 0;
      const h = clockHarness(() => d.promise, () => rejections++);
      const job = h.lookup.query(query); h.setSession(next);
      if (failure) d.reject(Object.assign(new Error('旧会话403'), { status: 403 })); else d.resolve(result(query, h.now));
      await job; assert.equal(h.state.result, null); assert.equal(rejections, 0); h.lookup.dispose();
    }
  }
  for (const method of ['clear', 'block', 'dispose']) {
    const d = deferred(), h = clockHarness(() => d.promise); const job = h.lookup.query(query);
    h.lookup[method](); assert.equal(h.lookup.getState().result, null);
    d.resolve(result(query, h.now)); await job; assert.equal(h.lookup.getState().result, null);
    h.lookup.dispose();
  }
});

test('到期准确抹码，返回时已过期不展示；当前401/403阻止再次查询', async () => {
  let h = clockHarness(async input => ({ ...result(input, h.now), expires_at: h.now / 1000 + 2 }));
  await h.lookup.query(query); h.advance(1999); assert.ok(h.state.result); h.advance(1); assert.equal(h.state.result, null); assert.equal(h.timers.size, 0); h.lookup.dispose();
  h = clockHarness(async input => ({ ...result(input, h.now), expires_at: h.now / 1000 }));
  await h.lookup.query(query); assert.equal(h.state.result, null); assert.equal(h.state.error.code, 'CODE_EXPIRED'); h.lookup.dispose();
  for (const status of [401, 403]) {
    let calls = 0, rejected;
    h = clockHarness(async () => { calls++; throw Object.assign(new Error('会话失效'), { status }); }, error => { rejected = error; });
    await h.lookup.query(query); assert.equal(rejected.status, status); assert.equal(h.state.result, null); assert.equal(h.state.blocked, true);
    await h.lookup.query(query); assert.equal(calls, 1); h.lookup.dispose();
  }
});

test('实际查询控制器拒绝普通管理员和真实邮箱，不调用请求函数', async () => {
  let calls = 0;
  const request = async () => { calls++; throw new Error('不应发出查询'); };
  for (const user of [{ id: 2, role: 'admin', is_super_admin: false }, { ...superUser, is_super_admin: false }]) {
    const h = clockHarness(request);
    h.setSession({ user, token: 'fixture-admin' });
    await h.lookup.query(query); assert.equal(h.state.blocked, true); assert.equal(h.state.result, null);
    h.lookup.dispose();
  }
  const h = clockHarness(request);
  for (const email of ['member@example.invalid', 'a@sub.test.top', '*@test.top']) {
    await h.lookup.query({ ...query, email });
    assert.equal(h.state.result, null); assert.match(h.state.error.message, /@test.top/); assert.equal(h.state.blocked, false);
  }
  assert.equal(calls, 0); h.lookup.dispose();
});

test('真实后端错误由实际controller抹码并文本展示，输入403不撤销会话，权限403仍阻断', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
  const oldFetch = globalThis.fetch, storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  try {
    const { adminAPI } = await server.ssrLoadModule('/src/api.js');
    const { TestVerificationCodeError } = await server.ssrLoadModule('/src/pages/admin/security.jsx');
    const failures = [[400, 'VERIFICATION_NOT_FOUND'], [403, 'TEST_EMAIL_REQUIRED'], [503, 'TEST_VERIFICATION_UNAVAILABLE'], [503, 'AUTH_AUDIT_UNAVAILABLE'], [503, 'AUTH_SECURITY_UNAVAILABLE'], [429, 'AUTH_RATE_LIMITED']];
    for (const [status, code] of failures) {
      let rejected = 0, mode = 'success', calls = 0;
      const message = `${code}: <img src=x onerror="alert(1)"> & <script>alert(2)</script>`;
      globalThis.fetch = async () => {
        calls++;
        return mode === 'success' ? Response.json(result(query, h.now)) : Response.json({ error: message, code, retryAfter: 2 }, { status, headers: { 'Retry-After': '7' } });
      };
      const h = clockHarness((input, options) => adminAPI.getTestVerificationCode(input, options), () => rejected++);
      try {
        await h.lookup.query(query); assert.ok(h.state.result);
        mode = 'failure'; await h.lookup.query(query);
        assert.equal(h.state.result, null); assert.equal(h.timers.size, 0); assert.equal(h.state.pending, false);
        assert.equal(h.state.blocked, false); assert.equal(rejected, 0);
        assert.equal(h.state.error.status, status); assert.equal(h.state.error.code, code);
        assert.equal(h.state.error.message, message); assert.equal(h.state.error.retryAfter, '7');
        const html = renderToStaticMarkup(React.createElement(TestVerificationCodeError, { error: h.state.error }));
        assert.match(html, /role="alert"/); assert.ok(html.includes(code)); assert.match(html, /&lt;img/); assert.match(html, /&lt;script/); assert.match(html, /&amp;/);
        assert.doesNotMatch(html, /<img|<script/); assert.match(html, /7 秒后重试/);
        assert.equal(calls, 2, '管理查询错误不能自动重试');
        mode = 'success'; await h.lookup.query(query); assert.ok(h.state.result); assert.equal(h.state.error, null);
      } finally { h.lookup.dispose(); }
    }
    for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'SUPERADMIN_REQUIRED'], [403, 'HTTP_403']]) {
      globalThis.fetch = async () => Response.json({ error: '会话无权限', code }, { status });
      let rejected = 0;
      const h = clockHarness((input, options) => adminAPI.getTestVerificationCode(input, options), () => rejected++);
      await h.lookup.query(query); assert.equal(h.state.blocked, true); assert.equal(h.state.result, null); assert.equal(rejected, 1); h.lookup.dispose();
    }
  } finally { globalThis.fetch = oldFetch; restore('localStorage', storage); await server.close(); }
});

test('内存验证码fixture服务端拒绝未获取/已过期的测试码', async () => {
  let time = Date.now();
  const fixture = createRegistrationGuardFixture({ now: () => time });
  const request = () => fixture.fetch('/api/admin/security/test-verification-code', { method: 'POST', headers: { Authorization: 'Bearer fixture-super' }, body: JSON.stringify(query) });
  const missing = await request(); assert.equal(missing.status, 400); assert.equal((await missing.json()).code, 'VERIFICATION_NOT_FOUND');
  fixture.seed(query.email, query.type, 1);
  assert.equal((await request()).status, 200); time += 1000;
  const expired = await request(); assert.equal(expired.status, 400); assert.equal((await expired.json()).code, 'VERIFICATION_NOT_FOUND');
});

test('隔离HTTP fixture测试码/TTL/stats/logs契约，普通管理员与真实邮箱均不得取码', async () => {
  let time = Date.now();
  const fixture = await createAdminFixtureServer({ quiet: true, now: () => time });
  await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.server.address().port}`;
  const path = '/api/admin/security/test-verification-code';
  const request = async (url, method = 'GET', body, token = 'fixture-1') => {
    const response = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  try {
    const start = await fetch(base + '/__fixture/start');
    assert.match(start.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.deepEqual((await request('/api/admin/security/stats')).data, { dayCount: 0, weekCount: 0, typeStats: [], scoreDistribution: [], trend: [] });
    assert.deepEqual((await request('/api/admin/security/logs')).data, { logs: [], total: 0 });
    for (const type of ['register', 'reset', 'bind']) {
      const seeded = await request(`/__fixture/test-code?email=tester%40test.top&type=${type}&ttl=2`);
      assert.equal(seeded.status, 200); assert.equal('code' in seeded.data, false);
      const found = await request(path, 'POST', { ...query, type });
      assert.equal(found.status, 200); assert.deepEqual(testVerificationResult(found.data, { ...query, type }, time), found.data);
      assert.equal(found.headers.get('cache-control'), 'no-store');
      assert.equal((await request(path, 'POST', { ...query, type }, 'fixture-2')).status, 403);
      assert.equal((await request(path, 'POST', { ...query, type }, 'unrecognized-fixture-token')).status, 401);
    }
    for (const email of ['member@example.invalid', 'a@sub.test.top', '*@test.top']) {
      assert.notEqual((await request(path, 'POST', { ...query, email })).status, 200);
      assert.equal((await request(`/__fixture/test-code?email=${encodeURIComponent(email)}`)).status, 400);
    }
    await request('/__fixture/session?mode=false'); assert.equal((await request(path, 'POST', query)).status, 403);
    await request('/__fixture/session?mode=server');
    const missing = await request(path, 'POST', { ...query, email: 'missing@test.top' });
    assert.equal(missing.status, 400); assert.equal(missing.data.code, 'VERIFICATION_NOT_FOUND');
    time += 2000;
    const expired = await request(path, 'POST', query);
    assert.equal(expired.status, 400); assert.equal(expired.data.code, 'VERIFICATION_NOT_FOUND'); assert.equal('code' in expired.data && /^\d{6}$/.test(expired.data.code), false);
    assert.equal((await request('/api/not-defined')).status, 404, '未知路径不能透传生产');
  } finally { await fixture.close(); }
});

// 实际Vite入口加载，但不读取项目env/config、不启动dev代理；所有fetch均在内存隔离。
test('实际AuthContext退出和切号在等待网络前通知管理控制器清码', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
  const oldFetch = globalThis.fetch, storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key),
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { location: {} }) });
  const h = clockHarness(async input => result(input, h.now));
  let notified = false;
  const onSessionChanging = () => { notified = true; h.lookup.clear(); };
  window.addEventListener('auth-session-changing', onSessionChanging);
  try {
    const { AuthProvider, useAuth } = await server.ssrLoadModule('/src/contexts/AuthContext.jsx');
    let auth;
    function Probe() { auth = useAuth(); return null; }
    renderToStaticMarkup(React.createElement(AuthProvider, null, React.createElement(Probe)));
    for (const method of ['logout', 'logoutAll', 'switchAccount']) {
      values.set('abdl_accounts', JSON.stringify([{ id: 2, token: 'fixture-admin' }]));
      await h.lookup.query(query); assert.ok(h.state.result);
      notified = false;
      globalThis.fetch = async () => {
        assert.equal(notified, true, '必须在等待会话网络前清空敏感结果');
        assert.equal(h.state.result, null); assert.equal(h.timers.size, 0);
        return Response.json({ id: 2, role: 'admin' });
      };
      await auth[method](2);
    }
  } finally { window.removeEventListener('auth-session-changing', onSessionChanging); h.lookup.dispose(); globalThis.fetch = oldFetch; restore('localStorage', storage); restore('window', oldWindow); await server.close(); }
});

test('实际adminAPI不走公共缓存，普通管理员渲染无卡片且不发请求', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
  const oldFetch = globalThis.fetch, storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const fixture = createRegistrationGuardFixture(); const seeded = fixture.seed(query.email, query.type);
  globalThis.fetch = fixture.fetch;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('验证码请求不得访问localStorage或缓存'); } });
  try {
    const { adminAPI } = await server.ssrLoadModule('/src/api.js');
    const { TestVerificationCodeCard } = await server.ssrLoadModule('/src/pages/admin/security.jsx');
    const render = user => renderToStaticMarkup(React.createElement(TestVerificationCodeCard, { user, token: 'fixture-super' }));
    for (const user of [null, { id: 2, role: 'admin' }, { ...superUser, is_super_admin: false }, { ...superUser, role: 'user' }]) {
      assert.equal(render(user), ''); await assert.rejects(adminAPI.getTestVerificationCode(query, { user, token: 'fixture-super' }));
    }
    assert.equal(fixture.calls.length, 0);
    const html = render(superUser); assert.match(html, /随机测试验证码查询/); assert.match(html, /@test.top/); assert.doesNotMatch(html, new RegExp(seeded.code));
    assert.equal(fixture.calls.length, 0, '仅挂载卡片不能查询');
    for (let i = 0; i < 2; i++) assert.deepEqual(await adminAPI.getTestVerificationCode(query, { user: superUser, token: 'fixture-super', cache: 'force-cache' }), seeded);
    assert.equal(fixture.calls.length, 2); assert.ok(fixture.calls.every(call => call.options.cache === 'no-store'));
  } finally { globalThis.fetch = oldFetch; restore('localStorage', storage); await server.close(); }
});
