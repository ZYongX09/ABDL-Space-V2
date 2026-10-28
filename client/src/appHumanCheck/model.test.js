import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createAppHumanCheckAPI } from './api.js';
import { APP_HUMAN_CHECK_FIXTURE_CONTROL_PATH, createAppHumanCheckFixture } from './fixture.js';
import { APP_HUMAN_CHECK_POLICY_PATH, DEFAULT_APP_HUMAN_POLICY, HUMAN_POLICY_FIELDS, HUMAN_POLICY_LIMITS, createHumanPolicyEditor, humanPolicyDraft, humanPolicyPayload, initialHumanPolicyState, isHumanPolicyDirty, readHumanPolicy, sanitizeHumanPolicyError } from './model.js';

const REVISION = '12345678-1234-4123-8123-123456789abc';
const PRIVATE = 'FIXTURE_ONLY_SECRET_NO_ERROR_ECHO';
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const payload = (revision = '0', patch = {}) => ({ ...Object.fromEntries(HUMAN_POLICY_FIELDS.map(key => [key, DEFAULT_APP_HUMAN_POLICY[key]])), revision, ...patch });
const fixtureAPI = fixture => createAppHumanCheckAPI(async (path, options) => {
  const result = fixture.respond(path, options.method, new URLSearchParams(), options.body ? JSON.parse(options.body) : null);
  if (result.status !== 200) throw Object.assign(new Error(result.data.error), { status: result.status });
  return result.data;
});
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

const serverOptions = () => ({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });

test('默认关闭只供后端/fixture，初始界面不伪造已保存策略', () => {
  assert.deepEqual(DEFAULT_APP_HUMAN_POLICY, { mode: 'off', email_window_seconds: 900, email_threshold: 2, source_window_seconds: 600, source_threshold: 5, source_distinct_emails: 3, revision: '0', turnstile_configured: false });
  assert.equal(initialHumanPolicyState().saved, null); assert.equal(initialHumanPolicyState().draft.mode, 'off');
  assert.equal(initialHumanPolicyState().draft.email_threshold, ''); assert.equal(initialHumanPolicyState().needsReload, true);
  assert.ok(Object.isFrozen(DEFAULT_APP_HUMAN_POLICY));
});

test('GET严格八字段；版本不透明UUIDv4/0，配置仅boolean，额外key或secret直接拒绝', () => {
  const read = readHumanPolicy(DEFAULT_APP_HUMAN_POLICY);
  assert.deepEqual(read, DEFAULT_APP_HUMAN_POLICY); assert.notEqual(read, DEFAULT_APP_HUMAN_POLICY); assert.ok(Object.isFrozen(read));
  assert.equal(readHumanPolicy({ ...read, revision: REVISION, turnstile_configured: true }).revision, REVISION);
  for (const key of Object.keys(read)) { const missing = { ...read }; delete missing[key]; assert.throws(() => readHumanPolicy(missing), { code: 'INVALID_RESPONSE' }); }
  for (const patch of [{ secret: PRIVATE }, { sitekey: PRIVATE }, { extra: true }, { revision: 0 }, { revision: '1' }, { revision: REVISION.toUpperCase() }, { mode: 'RISK' }, { turnstile_configured: 'false' }]) assert.throws(() => readHumanPolicy({ ...read, ...patch }), error => error.code === 'INVALID_RESPONSE' && !String(error).includes(PRIVATE));
});

test('PUT精确七字段，不允许metadata/密钥/额外参数或数值强制转换', () => {
  assert.deepEqual(humanPolicyPayload(payload()), payload());
  for (const mode of ['off', 'risk', 'always']) assert.equal(humanPolicyPayload(payload(REVISION, { mode })).mode, mode);
  for (const value of [null, [], {}, DEFAULT_APP_HUMAN_POLICY, { ...payload(), revision: undefined }, { ...payload(), mode: true }, { ...payload(), secret: PRIVATE }, { ...payload(), turnstile_configured: false }]) assert.throws(() => humanPolicyPayload(value));
  for (const [key, [min, max]] of Object.entries(HUMAN_POLICY_LIMITS)) for (const value of [min - 1, max + 1, 1.5, true, String(min), null, NaN, Infinity]) assert.throws(() => humanPolicyPayload(payload('0', { [key]: value })), { code: 'INVALID_BODY' });
  assert.throws(() => humanPolicyPayload(payload('0', { source_distinct_emails: 6 })), { code: 'INVALID_BODY' });
  assert.equal(humanPolicyPayload(payload('0', { email_window_seconds: 60, source_window_seconds: 86400, email_threshold: 20, source_threshold: 200, source_distinct_emails: 50 })).source_distinct_emails, 50);
});

test('API固定同源GET/PUT、no-store、signal与精确body，调用方不能覆盖方法/缓存', async () => {
  const calls = [], signal = new AbortController().signal;
  const api = createAppHumanCheckAPI(async (path, options) => { calls.push({ path, options }); return DEFAULT_APP_HUMAN_POLICY; });
  await api.appHumanCheckPolicy({ signal, method: 'POST', body: PRIVATE, cache: 'force-cache' });
  await api.saveAppHumanCheckPolicy(payload(), { signal, method: 'DELETE', body: PRIVATE, cache: 'force-cache' });
  assert.equal(calls.length, 2);
  for (const call of calls) { assert.equal(call.path, APP_HUMAN_CHECK_POLICY_PATH); assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.signal, signal); }
  assert.equal(calls[0].options.method, 'GET'); assert.equal(Object.hasOwn(calls[0].options, 'body'), false);
  assert.equal(calls[1].options.method, 'PUT'); assert.deepEqual(JSON.parse(calls[1].options.body), payload());
  await assert.rejects(api.saveAppHumanCheckPolicy(DEFAULT_APP_HUMAN_POLICY)); assert.equal(calls.length, 2);
});

test('401/403/409/503/网络错误脱敏，无原始message、body、cause；加载失败不降级off', async () => {
  for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [409, 'CONFLICT'], [503, 'UNAVAILABLE'], [500, 'REQUEST_FAILED'], [undefined, 'REQUEST_FAILED']]) {
    const unsafe = Object.assign(new Error(PRIVATE), { status, code: PRIVATE, body: PRIVATE, cause: PRIVATE });
    const api = createAppHumanCheckAPI(async () => { throw unsafe; });
    await assert.rejects(api.appHumanCheckPolicy(), error => error.code === code && !JSON.stringify(error).includes(PRIVATE) && !String(error).includes(PRIVATE) && !error.cause);
    const editor = createHumanPolicyEditor(api); await editor.load();
    assert.equal(editor.getState().saved, null); assert.equal(editor.getState().needsReload, true); assert.equal(await editor.save(), false);
  }
  assert.equal(sanitizeHumanPolicyError(new Error(PRIVATE)).code, 'REQUEST_FAILED');
});

test('无配置仍可保存三种模式，保存只更新策略、opaque revision与明确dirty状态', async () => {
  const fixture = createAppHumanCheckFixture(), api = fixtureAPI(fixture), editor = createHumanPolicyEditor(api);
  await editor.load();
  assert.equal(isHumanPolicyDirty(editor.getState().saved, editor.getState().draft), false);
  for (const mode of ['risk', 'always', 'off']) {
    const oldRevision = editor.getState().saved.revision;
    editor.change({ mode, secret: PRIVATE });
    assert.equal(isHumanPolicyDirty(editor.getState().saved, editor.getState().draft), true);
    assert.equal(await editor.save(), true);
    assert.equal(editor.getState().saved.mode, mode); assert.equal(editor.getState().saved.turnstile_configured, false);
    assert.notEqual(editor.getState().saved.revision, oldRevision); assert.notEqual(editor.getState().saved.revision, '0');
    assert.equal(isHumanPolicyDirty(editor.getState().saved, editor.getState().draft), false);
    assert.match(editor.getState().notice, /未发送验证码邮件/); assert.ok(!JSON.stringify(editor.getState()).includes(PRIVATE));
  }
});

test('编辑器拒绝小数/指数/空串/越界/跨字段错误，保留草稿不发送PUT', async () => {
  let writes = 0;
  const api = { appHumanCheckPolicy: async () => DEFAULT_APP_HUMAN_POLICY, saveAppHumanCheckPolicy: async () => { writes++; return DEFAULT_APP_HUMAN_POLICY; } };
  const editor = createHumanPolicyEditor(api); await editor.load(); editor.change({ mode: 'risk' });
  for (const email_threshold of ['', '2.5', '1e1', ' 2', '-1', '0', '21', '999999']) {
    editor.change({ email_threshold }); assert.equal(await editor.save(), false); assert.equal(editor.getState().draft.email_threshold, email_threshold); assert.match(editor.getState().error, /策略字段无效/);
  }
  editor.change({ email_threshold: '2', source_threshold: '2', source_distinct_emails: '3' }); assert.equal(await editor.save(), false); assert.equal(writes, 0);
});

test('409保留旧快照及dirty草稿，禁止重放；成功重载后才能再次保存', async () => {
  const fixture = createAppHumanCheckFixture(), api = fixtureAPI(fixture), editor = createHumanPolicyEditor(api);
  await editor.load(); editor.change({ mode: 'risk', email_threshold: '4' });
  fixture.control('POST', { scenario: 'conflict' }); assert.equal(await editor.save(), false);
  assert.equal(editor.getState().saved.revision, '0'); assert.equal(editor.getState().draft.email_threshold, '4');
  assert.equal(editor.getState().needsReload, true); assert.match(editor.getState().error, /不会自动重放/); assert.equal(await editor.save(), false);
  fixture.control('POST', { scenario: 'unavailable' }); assert.equal(await editor.load(), false); assert.equal(await editor.save(), false);
  fixture.control('POST', { scenario: 'normal' }); assert.equal(await editor.load(), true);
  assert.notEqual(editor.getState().saved.revision, '0'); assert.equal(editor.getState().draft.email_threshold, '2');
  editor.change({ mode: 'always' }); assert.equal(await editor.save(), true);
});

test('保存503/权限失败/损坏响应保留草稿但需重载，不把未确认状态显示为已保存', async () => {
  for (const scenario of ['save-error', 'invalid']) {
    const fixture = createAppHumanCheckFixture(), editor = createHumanPolicyEditor(fixtureAPI(fixture)); await editor.load(); editor.change({ mode: 'risk' });
    fixture.control('POST', { scenario });
    if (scenario === 'invalid') await editor.load(); else await editor.save();
    assert.equal(editor.getState().needsReload, true); assert.equal(editor.getState().saved.mode, 'off'); assert.equal(editor.getState().draft.mode, 'risk'); assert.equal(await editor.save(), false);
  }
  for (const status of [401, 403]) {
    const editor = createHumanPolicyEditor({ appHumanCheckPolicy: async () => DEFAULT_APP_HUMAN_POLICY, saveAppHumanCheckPolicy: async () => { throw Object.assign(new Error(PRIVATE), { status }); } });
    await editor.load(); editor.change({ mode: 'always' }); assert.equal(await editor.save(), false);
    assert.equal(editor.getState().needsReload, true); assert.match(editor.getState().error, /管理员/); assert.equal(editor.getState().saved.mode, 'off');
  }
});

test('代次胜出，卸载/会话变化抛弃旧成功与旧错误；StrictMode新编辑器不共用状态', async () => {
  const first = pending(), second = pending(); let index = 0; const signals = [];
  const editor = createHumanPolicyEditor({ appHumanCheckPolicy: ({ signal }) => { signals.push(signal); return [first, second][index++].promise; } });
  const old = editor.load(), fresh = editor.load(); assert.equal(signals[0].aborted, true);
  second.resolve({ ...DEFAULT_APP_HUMAN_POLICY, mode: 'risk' }); await fresh; first.resolve(DEFAULT_APP_HUMAN_POLICY); await old;
  assert.equal(editor.getState().saved.mode, 'risk'); editor.dispose(); assert.equal(editor.getState().saved, null); assert.equal(await editor.load(), false);
  const late = pending(), changes = [], next = createHumanPolicyEditor({ appHumanCheckPolicy: () => late.promise }, { onChange: state => changes.push(state) });
  const loading = next.load(), before = changes.length; next.dispose(); late.reject(new Error(PRIVATE)); await loading;
  assert.equal(changes.length, before); assert.equal(next.getState().saved, null);
});

test('取消在途写入不声称回滚，晚到成功不能显示saved；只允许重载且无重复写', async () => {
  const write = pending(); let writes = 0, signal;
  const editor = createHumanPolicyEditor({ appHumanCheckPolicy: async () => DEFAULT_APP_HUMAN_POLICY, saveAppHumanCheckPolicy: (_body, options) => { writes++; signal = options.signal; return write.promise; } });
  await editor.load(); editor.change({ mode: 'always' }); const saving = editor.save(); editor.cancel();
  assert.equal(signal.aborted, true); assert.equal(editor.getState().needsReload, true); assert.match(editor.getState().error, /不代表服务器写入被撤回/);
  write.resolve({ ...DEFAULT_APP_HUMAN_POLICY, revision: REVISION, mode: 'always' }); assert.equal(await saving, false);
  assert.equal(editor.getState().saved.mode, 'off'); assert.equal(await editor.save(), false); assert.equal(writes, 1);
});

test('API取消前后抹去signal.reason与旧响应，无隐式请求/重试', async () => {
  const controller = new AbortController(); controller.abort(PRIVATE); let calls = 0;
  const api = createAppHumanCheckAPI(async () => { calls++; return DEFAULT_APP_HUMAN_POLICY; });
  await assert.rejects(api.appHumanCheckPolicy({ signal: controller.signal }), error => error.name === 'AbortError' && !String(error).includes(PRIVATE)); assert.equal(calls, 0);
  const late = pending(), current = new AbortController(), delayed = createAppHumanCheckAPI(async () => late.promise);
  const request = delayed.appHumanCheckPolicy({ signal: current.signal }); current.abort(PRIVATE); late.resolve(DEFAULT_APP_HUMAN_POLICY);
  await assert.rejects(request, { name: 'AbortError' });
});

test('内存fixture精确CAS/复位/错误/延迟，配置bool不涉及邮件或外部服务', async () => {
  const fixture = createAppHumanCheckFixture(), api = fixtureAPI(fixture);
  fixture.control('POST', { scenario: 'configured' }); assert.equal((await api.appHumanCheckPolicy()).turnstile_configured, true);
  const saved = await api.saveAppHumanCheckPolicy(payload('0', { mode: 'risk' })); assert.notEqual(saved.revision, '0'); assert.equal(saved.turnstile_configured, true);
  await assert.rejects(api.saveAppHumanCheckPolicy(payload()), { code: 'CONFLICT' });
  assert.equal(fixture.respond(APP_HUMAN_CHECK_POLICY_PATH, 'POST').status, 405);
  assert.equal(fixture.respond(APP_HUMAN_CHECK_POLICY_PATH, 'GET', new URLSearchParams({ secret: PRIVATE })).status, 400);
  fixture.control('POST', { scenario: 'slow' }); assert.equal(fixture.delay(APP_HUMAN_CHECK_POLICY_PATH), 1500);
  fixture.control('POST', { reset: true }); assert.deepEqual(await api.appHumanCheckPolicy(), DEFAULT_APP_HUMAN_POLICY);
  assert.equal(fixture.control('POST', { secret: PRIVATE }).status, 400); assert.equal(fixture.control('DELETE').status, 405);
});

test('真实卡片SSR显示默认/已保存/dirty/错误/冲突/权限/配置警告；风险字段只在risk启用', async () => {
  const server = await createServer(serverOptions());
  try {
    const { default: Card, AppHumanCheckPolicyView } = await server.ssrLoadModule('/src/pages/admin/AppHumanCheckPolicyCard.jsx');
    const render = state => renderToStaticMarkup(React.createElement(AppHumanCheckPolicyView, { state }));
    const initial = renderToStaticMarkup(React.createElement(Card));
    assert.match(initial, /正在读取安全验证策略/); assert.doesNotMatch(initial, /id="app-human-policy-form"/);
    for (const text of ['首次发送与重发', 'type=register', '429', '旧版 App', '网页注册', '旧发送端点仍可被调用', '不代表全站防机器人', '取消验证不能视为通过']) assert.ok(initial.includes(text), text);
    const editor = createHumanPolicyEditor(fixtureAPI(createAppHumanCheckFixture())); await editor.load();
    const off = render(editor.getState()); assert.match(off, /已保存模式：关闭/); assert.match(off, /验证组件：未配置/); assert.match(off, /需要挑战时将返回暂不可用/);
    assert.match(off, /<option value="off" selected="">关闭（默认）/);
    assert.match(off, /<fieldset class="ac-app-fieldset" disabled=""><legend>风险阈值/);
    editor.change({ mode: 'risk', email_threshold: '4' });
    const dirty = render(editor.getState()); assert.match(dirty, /已保存模式：关闭/); assert.match(dirty, /未保存更改/); assert.match(dirty, /<fieldset class="ac-app-fieldset"><legend>风险阈值/);
    await editor.save(); const saved = render(editor.getState()); assert.match(saved, /已保存模式：按风险触发/); assert.match(saved, /安全验证策略已保存/);
    const always = render({ ...editor.getState(), draft: { ...editor.getState().draft, mode: 'always' } }); assert.match(always, /<fieldset class="ac-app-fieldset" disabled=""><legend>风险阈值/);
    for (const status of [401, 403, 409, 503]) {
      const error = sanitizeHumanPolicyError(Object.assign(new Error(PRIVATE), { status }));
      const html = render({ ...editor.getState(), notice: '', error: error.message, needsReload: true });
      assert.match(html, /role="alert"/); assert.ok(html.includes(error.message)); assert.match(html, /必须成功重新加载/); assert.ok(!html.includes(PRIVATE));
      assert.match(html, /<fieldset class="ac-app-fieldset" disabled="">/);
    }
    const configured = render({ ...editor.getState(), saved: { ...editor.getState().saved, turnstile_configured: true } });
    assert.match(configured, /已配置（未实测）/); assert.doesNotMatch(configured, /type="password"|<iframe|<script|data-sitekey/);
    assert.match(saved, /max-width:100%;white-space:normal/); assert.match(saved, /min-width:0;overflow-wrap:anywhere/);
  } finally { await server.close(); }
});

test('实际api.js认证注入使用cookie/token/no-store，原始错误脱敏且body仅policy字段', async () => {
  const server = await createServer(serverOptions()), oldFetch = globalThis.fetch, storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const calls = []; let status;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === 'abdl_accounts' ? JSON.stringify([{ id: 2, token: 'fixture-2' }]) : '2' } });
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return status ? Response.json({ error: PRIVATE, code: PRIVATE }, { status }) : Response.json(DEFAULT_APP_HUMAN_POLICY); };
  try {
    const { adminAPI } = await server.ssrLoadModule('/src/api.js');
    await adminAPI.appHumanCheckPolicy(); await adminAPI.saveAppHumanCheckPolicy(payload());
    for (const call of calls) { assert.equal(call.url, APP_HUMAN_CHECK_POLICY_PATH); assert.equal(call.options.credentials, 'include'); assert.equal(call.options.headers.Authorization, 'Bearer fixture-2'); assert.equal(call.options.cache, 'no-store'); }
    assert.equal(calls[0].options.body, undefined); assert.deepEqual(JSON.parse(calls[1].options.body), payload());
    for (status of [401, 403, 409, 503]) await assert.rejects(adminAPI.appHumanCheckPolicy(), error => error.status === status && !String(error).includes(PRIVATE));
  } finally { globalThis.fetch = oldFetch; if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else delete globalThis.localStorage; await server.close(); }
});

test('fixture HTTP管理员guard优先，独立策略CAS/重置/不可用不污染AI与提醒', async () => {
  const { createAdminFixtureServer } = await import('../../tests/app-clients-fixture-server.js');
  const fixture = await createAdminFixtureServer({ quiet: true }); await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.server.address().port}`;
  const request = async (path, method = 'GET', body, token = 'fixture-2') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  try {
    const ai = (await request('/api/admin/app-ai/provider')).data, reminder = (await request('/api/admin/app-clients/reminder')).data;
    const initial = await request(APP_HUMAN_CHECK_POLICY_PATH); assert.equal(initial.status, 200); assert.deepEqual(initial.data, DEFAULT_APP_HUMAN_POLICY); assert.equal(initial.headers.get('cache-control'), 'no-store');
    for (const [token, status] of [['fixture-3', 403], ['real-token-is-not-accepted', 401]]) for (const method of ['GET', 'PUT']) assert.equal((await request(APP_HUMAN_CHECK_POLICY_PATH, method, method === 'PUT' ? payload() : undefined, token)).status, status);
    assert.equal((await request(APP_HUMAN_CHECK_FIXTURE_CONTROL_PATH, 'POST', { reset: true }, 'fixture-3')).status, 403);
    const saved = await request(APP_HUMAN_CHECK_POLICY_PATH, 'PUT', payload('0', { mode: 'risk' })); assert.equal(saved.status, 200); assert.equal(saved.data.mode, 'risk');
    assert.equal((await request(APP_HUMAN_CHECK_POLICY_PATH, 'PUT', payload())).status, 409);
    await request(APP_HUMAN_CHECK_FIXTURE_CONTROL_PATH, 'POST', { scenario: 'unavailable' }); assert.equal((await request(APP_HUMAN_CHECK_POLICY_PATH)).status, 503);
    assert.deepEqual((await request('/api/admin/app-ai/provider')).data, ai); assert.deepEqual((await request('/api/admin/app-clients/reminder')).data, reminder);
    await request(APP_HUMAN_CHECK_FIXTURE_CONTROL_PATH, 'POST', { reset: true }); assert.deepEqual((await request(APP_HUMAN_CHECK_POLICY_PATH)).data, DEFAULT_APP_HUMAN_POLICY);
    const malformed = await fetch(base + APP_HUMAN_CHECK_POLICY_PATH, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: `{"secret":"${PRIVATE}"` }); assert.ok(!(await malformed.text()).includes(PRIVATE));
  } finally { await fixture.close(); }
});

test('卡片接App管理身份边界，不新增注册页面/代理/第三方脚本，不保存草稿或提供假测试开关', () => {
  const page = source('../pages/admin/appClients.jsx'), card = source('../pages/admin/AppHumanCheckPolicyCard.jsx'), api = source('../api.js');
  assert.match(page, /<AppAIProviderCard \/>\s*<AppHumanCheckPolicyCard \/>/); assert.match(page, /AppClientsContent key=\{`\$\{user.id\}:\$\{token\}`\}/);
  assert.match(card, /auth-session-changing/); assert.match(card, /current.dispose\(\)/); assert.match(card, /disabled=\{draft.mode !== 'risk'\}/);
  assert.match(api, /\.\.\.createAppHumanCheckAPI\(apiFetch\)/);
  for (const path of ['./model.js', './api.js', './fixture.js', '../pages/admin/AppHumanCheckPolicyCard.jsx']) assert.doesNotMatch(source(path), /localStorage|sessionStorage|console\.|\bfetch\(|dangerouslySetInnerHTML|challenges\.cloudflare\.com/);
  assert.deepEqual(humanPolicyDraft(DEFAULT_APP_HUMAN_POLICY), { mode: 'off', email_window_seconds: '900', email_threshold: '2', source_window_seconds: '600', source_threshold: '5', source_distinct_emails: '3' });
});
