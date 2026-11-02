import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createTranslationPolicyAPI } from './api.js';
import { createTranslationPolicyFixture, TRANSLATION_POLICY_FIXTURE_CONTROL_PATH } from './fixture.js';
import { DEFAULT_TRANSLATION_POLICY, TRANSLATION_POLICY_FIELDS, TRANSLATION_POLICY_LIMITS, TRANSLATION_POLICY_PATH, TRANSLATION_TIMEZONE, createTranslationPolicyEditor, initialTranslationPolicyState, isTranslationPolicyDirty, readTranslationPolicy, sanitizeTranslationPolicyError, translationPolicyDraft, translationPolicyPayload } from './model.js';

const REVISION = '12345678-1234-4123-8123-123456789abc';
const PRIVATE = 'FIXTURE_ONLY_SECRET_NO_ERROR_ECHO';
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const payload = (patch = {}) => ({ ...Object.fromEntries(TRANSLATION_POLICY_FIELDS.map(key => [key, DEFAULT_TRANSLATION_POLICY[key]])), ...patch });
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const fixtureAPI = fixture => createTranslationPolicyAPI(async (path, options) => {
  const result = fixture.respond(path, options.method, new URLSearchParams(), options.body ? JSON.parse(options.body) : null);
  if (result.status !== 200) throw Object.assign(new Error(result.data.error), { status: result.status });
  return result.data;
});
const serverOptions = () => ({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });

test('默认5/10/100及上海时区仅供fixture；初始界面没有假已保存配置', () => {
  assert.deepEqual(DEFAULT_TRANSLATION_POLICY, { enabled: true, daily_limit: 5, english_daily_limit: 10, sponsor_daily_limit: 100, sponsor_auto_allowed: true, cache_epoch: 1, revision: '00000000-0000-4000-8000-000000000001', timezone: 'Asia/Shanghai' });
  const initial = initialTranslationPolicyState();
  assert.equal(initial.saved, null); assert.equal(initial.needsReload, true); assert.equal(initial.loading, true);
  assert.deepEqual(initial.draft, { enabled: false, sponsor_auto_allowed: false, daily_limit: '', english_daily_limit: '', sponsor_daily_limit: '', cache_epoch: '' });
  assert.ok(Object.isFrozen(initial)); assert.ok(Object.isFrozen(initial.draft)); assert.ok(Object.isFrozen(DEFAULT_TRANSLATION_POLICY));
});

test('GET严格八字段、UUID及固定timezone，不接受额外数据/密钥或类型转换', () => {
  const read = readTranslationPolicy(DEFAULT_TRANSLATION_POLICY);
  assert.deepEqual(read, DEFAULT_TRANSLATION_POLICY); assert.notEqual(read, DEFAULT_TRANSLATION_POLICY); assert.ok(Object.isFrozen(read));
  for (const revision of [REVISION, REVISION.toUpperCase(), '12345678-1234-7123-8123-123456789abc']) assert.equal(readTranslationPolicy({ ...read, revision }).revision, revision);
  for (const key of Object.keys(read)) { const missing = { ...read }; delete missing[key]; assert.throws(() => readTranslationPolicy(missing), { code: 'INVALID_RESPONSE' }); }
  for (const value of [null, [], {}, Object.create(read)]) assert.throws(() => readTranslationPolicy(value), { code: 'INVALID_RESPONSE' });
  for (const patch of [{ api_key: PRIVATE }, { token_configured: false }, { extra: true }, { revision: '0' }, { revision: 0 }, { revision: 'uuid' }, { revision: ` ${REVISION}` }, { timezone: 'UTC' }, { timezone: null }, { enabled: 1 }, { sponsor_auto_allowed: 'false' }, { cache_epoch: 0 }, { daily_limit: '5' }]) {
    assert.throws(() => readTranslationPolicy({ ...read, ...patch }), error => error.code === 'INVALID_RESPONSE' && !String(error).includes(PRIVATE));
  }
  assert.throws(() => readTranslationPolicy({ ...read, [Symbol('extra')]: true }), { code: 'INVALID_RESPONSE' });
});

test('PUT严格七key，timezone不提交，revision不可省；布尔不强转', () => {
  const input = payload(), result = translationPolicyPayload(input);
  assert.deepEqual(result, input); assert.notEqual(result, input); assert.ok(Object.isFrozen(result));
  for (const key of TRANSLATION_POLICY_FIELDS) { const missing = payload(); delete missing[key]; assert.throws(() => translationPolicyPayload(missing), { code: 'INVALID_BODY' }); }
  for (const value of [null, [], {}, DEFAULT_TRANSLATION_POLICY, payload({ enabled: 'true' }), payload({ sponsor_auto_allowed: 0 }), payload({ revision: '0' }), payload({ timezone: TRANSLATION_TIMEZONE }), payload({ secret: PRIVATE })]) assert.throws(() => translationPolicyPayload(value), { code: 'INVALID_BODY' });
});

test('三档quota允许0..10000独立整数；epoch允许>=1安全整数且不错误限制为10000', () => {
  for (const key of ['daily_limit', 'english_daily_limit', 'sponsor_daily_limit']) {
    for (const value of [0, 1, 10000]) assert.equal(translationPolicyPayload(payload({ [key]: value }))[key], value);
    for (const value of [-1, 10001, 1.5, true, '0', null, NaN, Infinity, undefined]) assert.throws(() => translationPolicyPayload(payload({ [key]: value })), { code: 'INVALID_BODY' });
  }
  for (const value of [1, 10001, Number.MAX_SAFE_INTEGER]) assert.equal(translationPolicyPayload(payload({ cache_epoch: value })).cache_epoch, value);
  for (const value of [0, -1, 1.5, '1', true, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) assert.throws(() => translationPolicyPayload(payload({ cache_epoch: value })), { code: 'INVALID_BODY' });
  assert.equal(translationPolicyPayload(payload({ daily_limit: 10000, english_daily_limit: 0, sponsor_daily_limit: 1 })).english_daily_limit, 0);
});

test('API只允许固定GET/PUT、no-store及signal，额外options无法注入第三方/测试/密钥', async () => {
  const calls = [], signal = new AbortController().signal;
  const api = createTranslationPolicyAPI(async (path, options) => { calls.push({ path, options }); return DEFAULT_TRANSLATION_POLICY; });
  await api.translationPolicy({ signal, method: 'POST', body: PRIVATE, cache: 'force-cache', headers: { Authorization: PRIVATE } });
  await api.saveTranslationPolicy(payload(), { signal, method: 'DELETE', body: PRIVATE, cache: 'force-cache' });
  assert.equal(calls.length, 2);
  for (const call of calls) { assert.equal(call.path, TRANSLATION_POLICY_PATH); assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.signal, signal); assert.equal(call.options.headers, undefined); }
  assert.equal(calls[0].options.method, 'GET'); assert.equal(Object.hasOwn(calls[0].options, 'body'), false);
  assert.equal(calls[1].options.method, 'PUT'); assert.deepEqual(JSON.parse(calls[1].options.body), payload());
  await assert.rejects(api.saveTranslationPolicy(DEFAULT_TRANSLATION_POLICY)); assert.equal(calls.length, 2);
});

test('401/403/409/422/503/网络错误脱敏，不回显原始message/body/cause也不假默认成功', async () => {
  for (const [status, code] of [[400, 'INVALID_BODY'], [401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [409, 'CONFLICT'], [422, 'INVALID_BODY'], [503, 'UNAVAILABLE'], [500, 'REQUEST_FAILED'], [undefined, 'REQUEST_FAILED']]) {
    const unsafe = Object.assign(new Error(PRIVATE), { status, code: PRIVATE, body: PRIVATE, cause: PRIVATE });
    const api = createTranslationPolicyAPI(async () => { throw unsafe; });
    await assert.rejects(api.translationPolicy(), error => error.code === code && !JSON.stringify(error).includes(PRIVATE) && !String(error).includes(PRIVATE) && !error.cause);
    const editor = createTranslationPolicyEditor(api); assert.equal(await editor.load(), false);
    assert.equal(editor.getState().saved, null); assert.equal(editor.getState().needsReload, true); assert.equal(await editor.save(), false);
  }
  assert.equal(sanitizeTranslationPolicyError(new Error(PRIVATE)).code, 'REQUEST_FAILED');
});

test('加载与草稿是不可变独立快照；不能通过getState或外部patch改写保存状态', async () => {
  const response = { ...DEFAULT_TRANSLATION_POLICY }, changes = [];
  const editor = createTranslationPolicyEditor({ translationPolicy: async () => response }, { onChange: state => changes.push(state) });
  await editor.load(); const before = editor.getState(), patch = { daily_limit: '8', timezone: 'UTC', revision: REVISION, secret: PRIVATE };
  response.daily_limit = 99; editor.change(patch); patch.daily_limit = '90';
  const current = editor.getState();
  assert.equal(before.saved.daily_limit, 5); assert.equal(before.draft.daily_limit, '5'); assert.equal(current.draft.daily_limit, '8');
  assert.equal(current.saved.revision, DEFAULT_TRANSLATION_POLICY.revision); assert.equal(current.saved.timezone, TRANSLATION_TIMEZONE);
  assert.ok(Object.isFrozen(current)); assert.ok(Object.isFrozen(current.saved)); assert.ok(Object.isFrozen(current.draft));
  assert.throws(() => { current.draft.daily_limit = '100'; }, TypeError);
  assert.equal(isTranslationPolicyDirty(current.saved, current.draft), true); assert.ok(!JSON.stringify(changes).includes(PRIVATE));
});

test('保存三quota/开关/epoch只提交策略及旧revision，成功接收新版本并清dirty，不调用AI', async () => {
  const fixture = createTranslationPolicyFixture(), api = fixtureAPI(fixture), calls = [];
  const editor = createTranslationPolicyEditor({ translationPolicy: api.translationPolicy, saveTranslationPolicy: (...args) => { calls.push(args[0]); return api.saveTranslationPolicy(...args); } });
  await editor.load(); assert.equal(isTranslationPolicyDirty(editor.getState().saved, editor.getState().draft), false);
  const revision = editor.getState().saved.revision;
  editor.change({ enabled: false, sponsor_auto_allowed: false, daily_limit: '0', english_daily_limit: '8', sponsor_daily_limit: '9999', cache_epoch: '10001' });
  assert.equal(await editor.save(), true);
  assert.deepEqual(calls, [payload({ enabled: false, sponsor_auto_allowed: false, daily_limit: 0, english_daily_limit: 8, sponsor_daily_limit: 9999, cache_epoch: 10001, revision })]);
  assert.notEqual(editor.getState().saved.revision, revision); assert.equal(editor.getState().saved.enabled, false); assert.equal(editor.getState().saved.cache_epoch, 10001);
  assert.equal(isTranslationPolicyDirty(editor.getState().saved, editor.getState().draft), false);
  assert.match(editor.getState().notice, /未调用 AI/); assert.match(editor.getState().notice, /未清空当日额度账本/);
});

test('草稿空串/小数/指数/空白/越界不发送PUT，保留输入可修正；epoch无隐式取整', async () => {
  let writes = 0;
  const editor = createTranslationPolicyEditor({ translationPolicy: async () => DEFAULT_TRANSLATION_POLICY, saveTranslationPolicy: async () => { writes++; return DEFAULT_TRANSLATION_POLICY; } });
  await editor.load();
  for (const key of Object.keys(TRANSLATION_POLICY_LIMITS)) {
    const badValues = key === 'cache_epoch' ? ['', '0', '-1', '1.5', '1e1', ' 1', '1 ', '9007199254740992'] : ['', '-1', '1.5', '1e1', ' 1', '1 ', '10001', '99999999999999999'];
    for (const value of badValues) {
      editor.change({ [key]: value }); assert.equal(await editor.save(), false); assert.equal(editor.getState().draft[key], value); assert.equal(editor.getState().needsReload, false); assert.match(editor.getState().error, /策略字段无效/);
    }
    editor.change({ [key]: String(DEFAULT_TRANSLATION_POLICY[key]) });
  }
  assert.equal(writes, 0);
});

test('409保留dirty草稿及旧快照，禁止重放；加载失败仍锁定，成功重载后才能保存', async () => {
  const fixture = createTranslationPolicyFixture(), editor = createTranslationPolicyEditor(fixtureAPI(fixture));
  await editor.load(); const oldRevision = editor.getState().saved.revision;
  editor.change({ daily_limit: '8', sponsor_auto_allowed: false }); fixture.control('POST', { scenario: 'conflict' });
  assert.equal(await editor.save(), false); assert.equal(editor.getState().saved.revision, oldRevision); assert.equal(editor.getState().draft.daily_limit, '8');
  assert.equal(editor.getState().needsReload, true); assert.match(editor.getState().error, /不会自动重放/); assert.equal(await editor.save(), false);
  editor.change({ daily_limit: '9' }); assert.equal(editor.getState().draft.daily_limit, '8');
  fixture.control('POST', { scenario: 'unavailable' }); assert.equal(await editor.load(), false); assert.equal(await editor.save(), false); assert.equal(editor.getState().draft.daily_limit, '8');
  fixture.control('POST', { scenario: 'normal' }); assert.equal(await editor.load(), true); assert.notEqual(editor.getState().saved.revision, oldRevision); assert.equal(editor.getState().draft.daily_limit, '5');
  editor.change({ daily_limit: '8' }); assert.equal(await editor.save(), true);
});

test('保存503/权限失败/损坏响应保留草稿但需重载，不把未知写入视为已保存', async () => {
  for (const scenario of ['save-error', 'invalid-save']) {
    const fixture = createTranslationPolicyFixture(), editor = createTranslationPolicyEditor(fixtureAPI(fixture)); await editor.load(); editor.change({ daily_limit: '8' });
    fixture.control('POST', { scenario }); assert.equal(await editor.save(), false);
    assert.equal(editor.getState().needsReload, true); assert.equal(editor.getState().saved.daily_limit, 5); assert.equal(editor.getState().draft.daily_limit, '8'); assert.equal(await editor.save(), false);
  }
  for (const status of [401, 403]) {
    const editor = createTranslationPolicyEditor({ translationPolicy: async () => DEFAULT_TRANSLATION_POLICY, saveTranslationPolicy: async () => { throw Object.assign(new Error(PRIVATE), { status }); } });
    await editor.load(); editor.change({ enabled: false }); assert.equal(await editor.save(), false);
    assert.equal(editor.getState().needsReload, true); assert.match(editor.getState().error, /管理员/); assert.equal(editor.getState().saved.enabled, true); assert.equal(editor.getState().draft.enabled, false);
  }
});

test('代次胜出并取消旧GET；晚到错误不能覆盖较新的成功结果', async () => {
  const first = pending(), second = pending(), signals = []; let index = 0;
  const editor = createTranslationPolicyEditor({ translationPolicy: ({ signal }) => { signals.push(signal); return [first, second][index++].promise; } });
  const old = editor.load(), fresh = editor.load(); assert.equal(signals[0].aborted, true);
  second.resolve({ ...DEFAULT_TRANSLATION_POLICY, daily_limit: 8 }); assert.equal(await fresh, true);
  first.reject(new Error(PRIVATE)); assert.equal(await old, false);
  assert.equal(editor.getState().saved.daily_limit, 8); assert.equal(editor.getState().error, '');
});

test('换号/卸载抛弃晚到GET成功与错误，新StrictMode编辑器不共享草稿', async () => {
  for (const failure of [false, true]) {
    const late = pending(), changes = [];
    const editor = createTranslationPolicyEditor({ translationPolicy: () => late.promise }, { onChange: state => changes.push(state) });
    const loading = editor.load(), before = changes.length; editor.dispose();
    if (failure) late.reject(new Error(PRIVATE)); else late.resolve(DEFAULT_TRANSLATION_POLICY);
    assert.equal(await loading, false); assert.equal(changes.length, before); assert.equal(editor.getState().saved, null); assert.equal(await editor.load(), false);
  }
  const fresh = createTranslationPolicyEditor(fixtureAPI(createTranslationPolicyFixture())); await fresh.load(); assert.equal(fresh.getState().draft.daily_limit, '5');
});

test('双击保存只写一次，保存期间冻结草稿；换号抛弃晚到PUT成功与错误', async () => {
  for (const failure of [false, true]) {
    const write = pending(), changes = []; let writes = 0, signal;
    const editor = createTranslationPolicyEditor({ translationPolicy: async () => DEFAULT_TRANSLATION_POLICY, saveTranslationPolicy: (_body, options) => { writes++; signal = options.signal; return write.promise; } }, { onChange: state => changes.push(state) });
    await editor.load(); editor.change({ daily_limit: '8' }); const saving = editor.save();
    assert.equal(await editor.save(), false); editor.change({ daily_limit: '9' }); assert.equal(editor.getState().draft.daily_limit, '8');
    const before = changes.length; editor.dispose(); assert.equal(signal.aborted, true);
    if (failure) write.reject(new Error(PRIVATE)); else write.resolve({ ...DEFAULT_TRANSLATION_POLICY, daily_limit: 8, revision: REVISION });
    assert.equal(await saving, false); assert.equal(writes, 1); assert.equal(changes.length, before); assert.equal(editor.getState().saved, null);
  }
});

test('取消PUT不声称回滚，晚到成功被丢弃；成功重载前不能重复写', async () => {
  const write = pending(); let writes = 0, signal;
  const editor = createTranslationPolicyEditor({ translationPolicy: async () => DEFAULT_TRANSLATION_POLICY, saveTranslationPolicy: (_body, options) => { writes++; signal = options.signal; return write.promise; } });
  await editor.load(); editor.change({ daily_limit: '8' }); const saving = editor.save(); editor.cancel();
  assert.equal(signal.aborted, true); assert.equal(editor.getState().needsReload, true); assert.match(editor.getState().error, /不代表服务器写入被撤回/);
  write.resolve({ ...DEFAULT_TRANSLATION_POLICY, daily_limit: 8, revision: REVISION }); assert.equal(await saving, false);
  assert.equal(editor.getState().saved.daily_limit, 5); assert.equal(editor.getState().draft.daily_limit, '8'); assert.equal(await editor.save(), false); assert.equal(writes, 1);
});

test('重载可替换在途保存，旧PUT成功不会回写新GET；取消初始GET不展示默认值', async () => {
  const write = pending(); let loads = 0;
  const editor = createTranslationPolicyEditor({ translationPolicy: async () => ({ ...DEFAULT_TRANSLATION_POLICY, daily_limit: ++loads === 1 ? 5 : 7 }), saveTranslationPolicy: () => write.promise });
  await editor.load(); editor.change({ daily_limit: '8' }); const saving = editor.save(); await editor.load();
  write.resolve({ ...DEFAULT_TRANSLATION_POLICY, daily_limit: 8, revision: REVISION }); assert.equal(await saving, false); assert.equal(editor.getState().saved.daily_limit, 7);
  const read = pending(), initial = createTranslationPolicyEditor({ translationPolicy: () => read.promise });
  const loading = initial.load(); initial.cancel(); read.resolve(DEFAULT_TRANSLATION_POLICY); assert.equal(await loading, false);
  assert.equal(initial.getState().saved, null); assert.equal(initial.getState().needsReload, true);
});

test('API在请求前后检查Abort，抹去reason与晚到响应，无隐式重试', async () => {
  const controller = new AbortController(); controller.abort(PRIVATE); let calls = 0;
  const api = createTranslationPolicyAPI(async () => { calls++; return DEFAULT_TRANSLATION_POLICY; });
  await assert.rejects(api.translationPolicy({ signal: controller.signal }), error => error.name === 'AbortError' && !String(error).includes(PRIVATE)); assert.equal(calls, 0);
  const late = pending(), current = new AbortController(), delayed = createTranslationPolicyAPI(async () => late.promise);
  const request = delayed.translationPolicy({ signal: current.signal }); current.abort(PRIVATE); late.resolve(DEFAULT_TRANSLATION_POLICY);
  await assert.rejects(request, { name: 'AbortError' });
});

test('内存fixture精确CAS/稳定缺省revision/复位/错误/延迟，仅接受策略请求', async () => {
  const fixture = createTranslationPolicyFixture(), api = fixtureAPI(fixture);
  const first = await api.translationPolicy(); assert.deepEqual(await api.translationPolicy(), first);
  const saved = await api.saveTranslationPolicy(payload({ daily_limit: 8 })); assert.notEqual(saved.revision, first.revision); assert.equal(saved.timezone, TRANSLATION_TIMEZONE);
  await assert.rejects(api.saveTranslationPolicy(payload()), { code: 'CONFLICT' });
  assert.equal(fixture.respond(TRANSLATION_POLICY_PATH, 'POST').status, 405);
  assert.equal(fixture.respond(TRANSLATION_POLICY_PATH, 'GET', new URLSearchParams({ secret: PRIVATE })).status, 400);
  assert.equal(fixture.respond('/api/admin/app-ai/provider', 'PUT').status, 404);
  fixture.control('POST', { scenario: 'slow' }); assert.equal(fixture.delay(TRANSLATION_POLICY_PATH), 1500);
  fixture.control('POST', { reset: true }); assert.deepEqual(await api.translationPolicy(), DEFAULT_TRANSLATION_POLICY);
  assert.equal(fixture.control('POST', { secret: PRIVATE }).status, 400); assert.equal(fixture.control('DELETE').status, 405);
});

test('真实Card SSR覆盖loading/已保存/dirty/保存中/成功/只读时区，不出现密钥或AI测试入口', async () => {
  const server = await createServer(serverOptions());
  try {
    const { default: Card, TranslationPolicyCardView } = await server.ssrLoadModule('/src/translationPolicy/Card.jsx');
    const render = state => renderToStaticMarkup(React.createElement(TranslationPolicyCardView, { state }));
    const initial = renderToStaticMarkup(React.createElement(Card));
    assert.match(initial, /正在读取翻译策略/); assert.doesNotMatch(initial, /id="translation-policy-form"/);
    for (const text of ['三档额度', '不叠加', 'Asia/Shanghai', '当前有效赞助', '用户主动启用', '不调用 AI', '统一 App AI 服务配置', '不代表模型已配置或可用']) assert.ok(initial.includes(text), text);
    const editor = createTranslationPolicyEditor(fixtureAPI(createTranslationPolicyFixture())); await editor.load();
    const clean = render(editor.getState()); assert.match(clean, /已保存每日额度：普通 5 \/ 英文阅读普通 10 \/ 有效赞助 100/);
    assert.match(clean, /id="translation-policy-timezone"[^>]*readonly=""[^>]*value="Asia\/Shanghai"/);
    for (const key of ['daily_limit', 'english_daily_limit', 'sponsor_daily_limit']) assert.match(clean, new RegExp(`id="translation-policy-${key}"[^>]*min="0"[^>]*max="10000"`));
    assert.match(clean, /id="translation-policy-cache_epoch"[^>]*min="1"[^>]*max="9007199254740991"/);
    editor.change({ enabled: false, daily_limit: '8' }); const dirty = render(editor.getState());
    assert.match(dirty, /未保存更改/); assert.match(dirty, /已保存翻译：启用/); assert.match(dirty, /重新加载成功会以服务器状态替换当前草稿/);
    const saving = render({ ...editor.getState(), saving: true }); assert.match(saving, /正在保存翻译策略/); assert.match(saving, /<fieldset class="ac-app-fieldset" disabled="">/); assert.match(saving, /取消当前请求/);
    await editor.save(); const saved = render(editor.getState()); assert.match(saved, /翻译策略已保存/); assert.match(saved, /已保存翻译：关闭/);
    assert.doesNotMatch(saved, /type="password"|<iframe|<script|测试当前草稿|data-sitekey|dangerouslySetInnerHTML/);
    assert.match(saved, /max-width:100%;white-space:normal/); assert.match(saved, /min-width:0;overflow-wrap:anywhere/);
  } finally { await server.close(); }
});

test('真实Card SSR覆盖401/403/409/503/取消/损坏响应，保留旧草稿但禁写并提供reload', async () => {
  const server = await createServer(serverOptions());
  try {
    const { TranslationPolicyCardView } = await server.ssrLoadModule('/src/translationPolicy/Card.jsx');
    const editor = createTranslationPolicyEditor(fixtureAPI(createTranslationPolicyFixture())); await editor.load(); editor.change({ daily_limit: '8' });
    for (const raw of [Object.assign(new Error(PRIVATE), { status: 401 }), { status: 403 }, { status: 409 }, { status: 503 }, { name: 'AbortError' }]) {
      const error = sanitizeTranslationPolicyError(raw);
      const html = renderToStaticMarkup(React.createElement(TranslationPolicyCardView, { state: { ...editor.getState(), error: error.message, needsReload: true } }));
      assert.match(html, /role="alert"/); assert.ok(html.includes(error.message)); assert.match(html, /必须成功重新加载/); assert.match(html, /<fieldset class="ac-app-fieldset" disabled="">/);
      assert.match(html, /重新加载已保存翻译策略/); assert.match(html, /id="translation-policy-daily_limit"[^>]*value="8"/); assert.ok(!html.includes(PRIVATE));
    }
    const empty = renderToStaticMarkup(React.createElement(TranslationPolicyCardView, { state: { ...initialTranslationPolicyState(), loading: false, error: '翻译策略响应异常' } }));
    assert.match(empty, /翻译策略响应异常/); assert.doesNotMatch(empty, /已保存翻译：|id="translation-policy-form"/);
  } finally { await server.close(); }
});

test('实际api.js认证注入cookie/token/no-store，精确body且仅有翻译策略请求', async () => {
  const server = await createServer(serverOptions()), oldFetch = globalThis.fetch, storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const calls = []; let status;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === 'abdl_accounts' ? JSON.stringify([{ id: 2, token: 'fixture-2' }]) : '2' } });
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return status ? Response.json({ error: PRIVATE, code: PRIVATE }, { status }) : Response.json(DEFAULT_TRANSLATION_POLICY); };
  try {
    const { adminAPI } = await server.ssrLoadModule('/src/api.js');
    await adminAPI.translationPolicy(); await adminAPI.saveTranslationPolicy(payload());
    for (const call of calls) { assert.equal(call.url, TRANSLATION_POLICY_PATH); assert.equal(call.options.credentials, 'include'); assert.equal(call.options.headers.Authorization, 'Bearer fixture-2'); assert.equal(call.options.cache, 'no-store'); }
    assert.equal(calls[0].options.body, undefined); assert.deepEqual(JSON.parse(calls[1].options.body), payload());
    for (status of [401, 403, 409, 503]) await assert.rejects(adminAPI.translationPolicy(), error => error.status === status && !String(error).includes(PRIVATE));
    const controller = new AbortController(); controller.abort(); const before = calls.length;
    await assert.rejects(adminAPI.saveTranslationPolicy(payload(), { signal: controller.signal }), { name: 'AbortError' }); assert.equal(calls.length, before);
  } finally { globalThis.fetch = oldFetch; if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else delete globalThis.localStorage; await server.close(); }
});

test('fixture HTTP管理员guard优先，CAS/503/422/no-store与Origin边界，不污染provider/其他策略', async () => {
  const { createAdminFixtureServer } = await import('../../tests/app-clients-fixture-server.js');
  const fixture = await createAdminFixtureServer({ quiet: true }); await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.server.address().port}`;
  const request = async (path, method = 'GET', body, token = 'fixture-2') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  try {
    const protectedPaths = ['/api/admin/app-ai/provider', '/api/admin/app-human-check/policy', '/api/admin/app-clients/reminder'];
    const before = await Promise.all(protectedPaths.map(async path => (await request(path)).data));
    const initial = await request(TRANSLATION_POLICY_PATH); assert.equal(initial.status, 200); assert.deepEqual(initial.data, DEFAULT_TRANSLATION_POLICY); assert.equal(initial.headers.get('cache-control'), 'no-store');
    for (const [token, status] of [['fixture-3', 403], ['real-token-is-not-accepted', 401]]) for (const method of ['GET', 'PUT']) assert.equal((await request(TRANSLATION_POLICY_PATH, method, method === 'PUT' ? payload() : undefined, token)).status, status);
    assert.equal((await request(TRANSLATION_POLICY_FIXTURE_CONTROL_PATH, 'POST', { reset: true }, 'fixture-3')).status, 403);
    assert.equal((await request(TRANSLATION_POLICY_PATH, 'PUT', payload({ daily_limit: 1.5 }))).status, 422);
    const saved = await request(TRANSLATION_POLICY_PATH, 'PUT', payload({ daily_limit: 8 })); assert.equal(saved.status, 200); assert.equal(saved.data.daily_limit, 8); assert.notEqual(saved.data.revision, initial.data.revision);
    assert.equal((await request(TRANSLATION_POLICY_PATH, 'PUT', payload())).status, 409);
    await request(TRANSLATION_POLICY_FIXTURE_CONTROL_PATH, 'POST', { scenario: 'unavailable' }); assert.equal((await request(TRANSLATION_POLICY_PATH)).status, 503);
    assert.deepEqual(await Promise.all(protectedPaths.map(async path => (await request(path)).data)), before);
    await request(TRANSLATION_POLICY_FIXTURE_CONTROL_PATH, 'POST', { reset: true }); assert.deepEqual((await request(TRANSLATION_POLICY_PATH)).data, DEFAULT_TRANSLATION_POLICY);
    const foreign = await fetch(base + TRANSLATION_POLICY_PATH, { method: 'PUT', headers: { Origin: 'https://example.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) }); assert.equal(foreign.status, 403);
    const malformed = await fetch(base + TRANSLATION_POLICY_PATH, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: `{"secret":"${PRIVATE}"` }); assert.ok(!(await malformed.text()).includes(PRIVATE));
  } finally { await fixture.close(); }
});

test('仅AppClients一处挂卡，继承管理员/账号边界与三主题样式，不改provider、不持久化草稿', () => {
  const page = source('../pages/admin/appClients.jsx'), card = source('./Card.jsx'), api = source('../api.js');
  assert.equal((page.match(/<TranslationPolicyCard \/>/g) || []).length, 1);
  assert.match(page, /<AppAIProviderCard \/>\s*<AppHumanCheckPolicyCard \/>\s*<TranslationPolicyCard \/>/);
  assert.match(page, /user\?\.role === 'admin'/); assert.match(page, /AppClientsContent key=\{`\$\{user.id\}:\$\{token\}`\}/);
  assert.match(card, /auth-session-changing/); assert.match(card, /current.dispose\(\)/); assert.match(api, /\.\.\.createTranslationPolicyAPI\(apiFetch\)/);
  for (const path of ['./model.js', './api.js', './fixture.js', './Card.jsx']) assert.doesNotMatch(source(path), /localStorage|sessionStorage|console\.|\bfetch\(|dangerouslySetInnerHTML|challenges\.cloudflare\.com/);
  assert.doesNotMatch(card, /#[0-9a-f]{3,8}\b|rgba?\(|https?:\/\/|type="password"/i);
  const styles = source('../pages/admin/appClients.css'); assert.match(styles, /var\(--ac-surface-soft\)/); assert.match(styles, /max-width: 600px/);
  assert.deepEqual(translationPolicyDraft(DEFAULT_TRANSLATION_POLICY), { enabled: true, sponsor_auto_allowed: true, daily_limit: '5', english_daily_limit: '10', sponsor_daily_limit: '100', cache_epoch: '1' });
});
