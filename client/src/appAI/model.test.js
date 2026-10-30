import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { APP_AI_TEST_TIMEOUT_MS, createAppAIAPI } from './api.js';
import { APP_AI_FIXTURE_CONTROL_PATH, createAppAIFixture } from './fixture.js';
import { APP_AI_PROTOCOL, APP_AI_PROVIDER_PATH, APP_AI_PROVIDER_TEST_PATH, APP_AI_TEST_RESULT_TEXT, createProviderEditor, DEFAULT_APP_AI_PROVIDER, initialProviderState, providerBaseURL, providerOriginChangeRequiresToken, providerPayload, readProviderMetadata, readProviderTestResult, sanitizeAppAIError, sanitizeProviderTestError } from './model.js';

const FAKE_TOKEN = 'FIXTURE_ONLY_NOT_A_REAL_PROVIDER_TOKEN';
const REVISION = '12345678-1234-4123-8123-123456789abc';
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const body = (token_action = 'keep', revision = '0', patch = {}) => ({ base_url: DEFAULT_APP_AI_PROVIDER.base_url, model_id: DEFAULT_APP_AI_PROVIDER.model_id, token_action, revision, ...(token_action === 'replace' ? { api_token: FAKE_TOKEN } : {}), ...patch });
const fixtureAPI = fixture => createAppAIAPI(async (path, options) => {
  const result = fixture.respond(path, options.method, new URLSearchParams(), options.body ? JSON.parse(options.body) : null);
  if (result.status !== 200) throw Object.assign(new Error(result.data.error), { status: result.status, code: result.data.code });
  return result.data;
});
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const testResult = (model_id = DEFAULT_APP_AI_PROVIDER.model_id, patch = {}) => ({ success: true, protocol: APP_AI_PROTOCOL, model_id, latency_ms: 12, result_text: APP_AI_TEST_RESULT_TEXT, ...patch });
const configuredMetadata = () => ({ ...DEFAULT_APP_AI_PROVIDER, token_configured: true, revision: REVISION });
const serverOptions = () => ({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });

function editorFixture(api = fixtureAPI(createAppAIFixture())) {
  let token = '', clears = 0;
  const changes = [];
  const editor = createProviderEditor(api, { onChange: state => changes.push(state), clearToken: () => { token = ''; clears += 1; } });
  return { editor, changes, setToken(value) { token = value; }, getToken: () => token, getClears: () => clears };
}

test('默认值只属于后端/fixture，初始编辑状态没有伪造已保存配置或令牌', () => {
  assert.deepEqual(DEFAULT_APP_AI_PROVIDER, { base_url: 'https://api.deepseek.com', model_id: 'deepseek-chat', token_configured: false, revision: '0' });
  assert.equal(initialProviderState().saved, null);
  assert.equal(initialProviderState().draft.base_url, '');
  assert.equal(initialProviderState().needsReload, true);
  assert.equal(initialProviderState().testing, false); assert.equal(initialProviderState().testResult, null); assert.equal(initialProviderState().testError, '');
  assert.ok(Object.isFrozen(DEFAULT_APP_AI_PROVIDER));
});

test('读取严格四字段及不透明字符串版本，不接收 token/密文/额外字段', () => {
  const metadata = { ...DEFAULT_APP_AI_PROVIDER, revision: REVISION };
  const read = readProviderMetadata(metadata);
  assert.deepEqual(read, metadata); assert.notEqual(read, metadata); assert.ok(Object.isFrozen(read));
  for (const key of Object.keys(metadata)) { const missing = { ...metadata }; delete missing[key]; assert.throws(() => readProviderMetadata(missing)); }
  for (const extra of ['api_token', 'token', 'ciphertext', 'token_ciphertext', 'error', 'data']) assert.throws(() => readProviderMetadata({ ...metadata, [extra]: FAKE_TOKEN }), error => !String(error).includes(FAKE_TOKEN));
  for (const revision of [0, 1, -1, '', null, undefined, '1', 'revision-x', REVISION.toUpperCase()]) assert.throws(() => readProviderMetadata({ ...metadata, revision }));
  for (const data of [null, [], {}, { ...metadata, token_configured: 1 }, { ...metadata, base_url: false }, { ...metadata, model_id: null }]) assert.throws(() => readProviderMetadata(data));
});

test('地址仅 HTTPS 公网域名与安全路径，不设固定供应商主机但保留安全校验', () => {
  for (const host of ['api.deepseek.com', 'api.openai.com', 'custom-provider.example.com']) assert.equal(providerBaseURL(`https://${host}/v1/`), `https://${host}/v1`);
  assert.equal(providerBaseURL('https://API.OPENAI.COM:443/v1///'), 'https://api.openai.com/v1');
  assert.equal(providerBaseURL('https://approved.example.com/path~safe/v1'), 'https://approved.example.com/path~safe/v1');
  for (const value of ['', ' http://api.openai.com', ' https://api.openai.com', 'https://api.openai.com ', 'http://api.openai.com', 'https://user:pass@api.openai.com', 'https://@api.openai.com', 'https://api.openai.com?token=fake', 'https://api.openai.com#fake', 'https://api.openai.com?', 'https://api.openai.com:444', 'https://127.0.0.1', 'https://[::1]', 'https://localhost', 'https://foo.local', 'https://api.openai.com/../v1', 'https://api.openai.com/./v1', 'https://api.openai.com/%2e%2e', 'https://api.openai.com/a:b', 'https://api.openai.com/a\\b', 'https://api.openai.com/\n', `https://api.openai.com/${'x'.repeat(2048)}`]) assert.throws(() => providerBaseURL(value), { code: 'INVALID_URL' });
});

test('模型 1–200 可见 ASCII，令牌先拒绝控制符、原始长度边界再去边缘空格', () => {
  assert.equal(providerPayload(body('replace', '0', { api_token: `  ${FAKE_TOKEN}  `, model_id: 'vendor/model:v2' })).api_token, FAKE_TOKEN);
  assert.equal(providerPayload(body('replace', '0', { api_token: 'x'.repeat(8192), model_id: 'm'.repeat(200) })).api_token.length, 8192);
  for (const api_token of ['', '   ', 'x'.repeat(8193), 'x y', '\tfake', 'fake\n', 'fake\r', '令牌', 'fake\u007f', null, 1]) assert.throws(() => providerPayload(body('replace', '0', { api_token })), { code: 'INVALID_TOKEN' });
  for (const model_id of ['', '模型', 'a b', ' a', 'a ', 'a\n', 'm'.repeat(201), null, 1]) assert.throws(() => providerPayload(body('keep', '0', { model_id })), { code: 'INVALID_MODEL' });
});

test('PUT 三动作精确字段，keep/clear 即使 api_token 为空也拒绝，版本不自动推算', () => {
  for (const action of ['keep', 'clear', 'replace']) {
    const payload = providerPayload(body(action, REVISION));
    assert.deepEqual(payload, body(action, REVISION));
    assert.deepEqual(Object.keys(payload).sort(), (action === 'replace' ? ['base_url', 'model_id', 'token_action', 'revision', 'api_token'] : ['base_url', 'model_id', 'token_action', 'revision']).sort());
  }
  for (const action of ['keep', 'clear']) for (const api_token of ['', undefined, FAKE_TOKEN]) assert.throws(() => providerPayload(body(action, '0', { api_token })));
  const missing = body('replace'); delete missing.api_token; assert.throws(() => providerPayload(missing));
  for (const bad of [{ ...body(), unknown: true }, { ...body(), token_configured: false }, { ...body(), clear_confirmed: true }, { ...body(), token_action: 'KEEP' }, { ...body(), revision: 0 }]) assert.throws(() => providerPayload(bad));
});

test('注入 API 固定同源 GET/PUT、no-store、signal；选项不能覆盖路径/方法/请求体', async () => {
  const calls = [];
  const api = createAppAIAPI(async (path, options) => { calls.push({ path, options }); return DEFAULT_APP_AI_PROVIDER; });
  const signal = new AbortController().signal;
  await api.appAIProvider({ signal, method: 'POST', body: FAKE_TOKEN, cache: 'force-cache' });
  for (const action of ['keep', 'replace', 'clear']) await api.saveAppAIProvider(body(action), { signal, method: 'DELETE', body: 'wrong', cache: 'force-cache' });
  await api.appAIProvider();
  assert.equal(calls.length, 5);
  for (const call of calls) { assert.equal(call.path, APP_AI_PROVIDER_PATH); assert.equal(call.options.cache, 'no-store'); assert.ok(!call.path.includes('?')); }
  assert.equal(calls[0].options.method, 'GET'); assert.equal(Object.hasOwn(calls[0].options, 'body'), false);
  for (const [index, action] of ['keep', 'replace', 'clear'].entries()) { assert.equal(calls[index + 1].options.method, 'PUT'); assert.equal(calls[index + 1].options.signal, signal); assert.deepEqual(JSON.parse(calls[index + 1].options.body), body(action)); }
  const before = calls.length; await assert.rejects(api.saveAppAIProvider({ ...body(), api_token: '' })); assert.equal(calls.length, before);
});

test('401/403/409/503/网络错误完全脱敏，不传原始 message/code/cause/body', async () => {
  for (const status of [401, 403, 409, 422, 500, 503, undefined]) {
    const unsafe = Object.assign(new Error(`secret ${FAKE_TOKEN}`), { status, code: FAKE_TOKEN, cause: FAKE_TOKEN, body: FAKE_TOKEN, retryAfter: FAKE_TOKEN });
    const api = createAppAIAPI(async () => { throw unsafe; });
    for (const request of [() => api.appAIProvider(), () => api.saveAppAIProvider(body('replace'))]) await assert.rejects(request(), error => {
      assert.notEqual(error, unsafe); assert.equal(error.status, status); assert.ok(!String(error).includes(FAKE_TOKEN)); assert.ok(!JSON.stringify(error).includes(FAKE_TOKEN)); assert.equal(error.cause, undefined); return true;
    });
  }
  const safe = sanitizeAppAIError(Object.assign(new Error(FAKE_TOKEN), { status: 422, code: 'token_replace_required' }));
  assert.equal(safe.code, 'TOKEN_REPLACE_REQUIRED'); assert.match(safe.message, /替换新令牌/);
});

test('损坏响应或携带令牌响应均拒绝，失败 GET 不回退默认配置', async () => {
  for (const data of [null, {}, { ...DEFAULT_APP_AI_PROVIDER, api_token: FAKE_TOKEN }, { ...DEFAULT_APP_AI_PROVIDER, token_configured: 'false' }, { ...DEFAULT_APP_AI_PROVIDER, revision: 0 }]) {
    const api = createAppAIAPI(async () => data);
    await assert.rejects(api.appAIProvider(), { code: 'INVALID_RESPONSE' });
    await assert.rejects(api.saveAppAIProvider(body('replace')), { code: 'INVALID_RESPONSE' });
  }
  const harness = editorFixture(createAppAIAPI(async () => { throw new Error('offline'); }));
  assert.equal(await harness.editor.load(), false); assert.equal(harness.editor.getState().saved, null); assert.equal(harness.editor.getState().needsReload, true);
});

test('取消前后均返回固定 AbortError，不携带 signal.reason 或旧响应', async () => {
  let calls = 0;
  const controller = new AbortController(); controller.abort(FAKE_TOKEN);
  const api = createAppAIAPI(async () => { calls += 1; return DEFAULT_APP_AI_PROVIDER; });
  await assert.rejects(api.appAIProvider({ signal: controller.signal }), error => error.name === 'AbortError' && !String(error).includes(FAKE_TOKEN));
  await assert.rejects(api.saveAppAIProvider(body('replace'), { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
  const late = new AbortController(); const response = pending();
  const delayed = createAppAIAPI(async () => response.promise);
  const request = delayed.appAIProvider({ signal: late.signal }); late.abort(FAKE_TOKEN); response.resolve(DEFAULT_APP_AI_PROVIDER);
  await assert.rejects(request, { name: 'AbortError' });
});

test('编辑器成功清除密码框、重置为 keep，并且状态历史从不包含令牌', async () => {
  const harness = editorFixture(); await harness.editor.load();
  harness.editor.change({ token_action: 'replace', model_id: 'fixture-model', api_token: FAKE_TOKEN }); harness.setToken(FAKE_TOKEN);
  assert.equal(await harness.editor.save(harness.getToken()), true);
  assert.equal(harness.getToken(), ''); assert.equal(harness.editor.getState().saved.token_configured, true);
  assert.equal(harness.editor.getState().draft.token_action, 'keep'); assert.equal(harness.editor.getState().draft.clear_confirmed, false);
  assert.ok(harness.changes.every(state => !JSON.stringify(state).includes(FAKE_TOKEN)));
});

test('clear 必须明确复选框，keep 空密码不会误清除，切换操作清空输入', async () => {
  const harness = editorFixture(); await harness.editor.load();
  harness.editor.change({ token_action: 'replace' }); harness.setToken(FAKE_TOKEN); await harness.editor.save(harness.getToken());
  assert.equal(await harness.editor.save(''), true); assert.equal(harness.editor.getState().saved.token_configured, true);
  harness.setToken(FAKE_TOKEN); harness.editor.change({ token_action: 'clear' }); assert.equal(harness.getToken(), '');
  assert.equal(await harness.editor.save(), false); assert.match(harness.editor.getState().error, /勾选/);
  harness.editor.change({ clear_confirmed: true }); assert.equal(await harness.editor.save(), true); assert.equal(harness.editor.getState().saved.token_configured, false);
});

test('保存失败保留非秘密草稿与密码框，不展示原始错误，允许安全重试', async () => {
  const fixture = createAppAIFixture(); const harness = editorFixture(fixtureAPI(fixture)); await harness.editor.load();
  harness.editor.change({ model_id: 'unsaved-model', token_action: 'replace' }); harness.setToken(FAKE_TOKEN);
  fixture.control('POST', { scenario: 'save-error' }); assert.equal(await harness.editor.save(harness.getToken()), false);
  assert.equal(harness.editor.getState().draft.model_id, 'unsaved-model'); assert.equal(harness.getToken(), FAKE_TOKEN);
  assert.equal(harness.editor.getState().saved.revision, '0'); assert.equal(harness.editor.getState().needsReload, false);
  fixture.control('POST', { scenario: 'normal' }); assert.equal(await harness.editor.save(harness.getToken()), true); assert.equal(harness.getToken(), '');
});

test('409 使用原始读取快照、禁止再保存直到成功重载，不自动覆盖并发更新', async () => {
  const fixture = createAppAIFixture(); const harness = editorFixture(fixtureAPI(fixture)); await harness.editor.load();
  harness.editor.change({ model_id: 'unsaved-cas' }); fixture.control('POST', { scenario: 'conflict' });
  assert.equal(await harness.editor.save(), false); assert.equal(harness.editor.getState().needsReload, true); assert.equal(harness.editor.getState().saved.revision, '0');
  assert.equal(harness.editor.getState().draft.model_id, 'unsaved-cas'); assert.equal(await harness.editor.save(), false);
  fixture.control('POST', { scenario: 'unavailable' }); await harness.editor.load(); assert.equal(harness.editor.getState().needsReload, true); assert.equal(await harness.editor.save(), false);
  fixture.control('POST', { scenario: 'normal' }); assert.equal(await harness.editor.load(), true); assert.notEqual(harness.editor.getState().saved.revision, '0'); assert.equal(harness.editor.getState().draft.model_id, 'deepseek-chat');
  harness.editor.change({ model_id: 'after-reload' }); assert.equal(await harness.editor.save(), true);
});

test('跨来源 keep 已配置令牌在 UI/编辑器与 fixture 均阻断，同源路径修改仍允许', async () => {
  const fixture = createAppAIFixture(); const api = fixtureAPI(fixture); const configured = await api.saveAppAIProvider(body('replace'));
  const harness = editorFixture(api); await harness.editor.load();
  harness.editor.change({ base_url: 'https://api.openai.com' }); assert.equal(providerOriginChangeRequiresToken(configured, harness.editor.getState().draft), true);
  assert.equal(await harness.editor.save(), false); assert.match(harness.editor.getState().error, /更换接口来源/);
  await assert.rejects(api.saveAppAIProvider(body('keep', configured.revision, { base_url: 'https://api.openai.com' })), { status: 422, code: 'TOKEN_REPLACE_REQUIRED' });
  harness.editor.change({ base_url: 'https://api.deepseek.com/v1', model_id: 'same-origin' }); assert.equal(await harness.editor.save(), true);
  harness.editor.change({ base_url: 'https://api.openai.com', token_action: 'clear', clear_confirmed: true });
  // 切换到 clear 时确认必须重选，不能在同一次动作变更中隐式勾选。
  assert.equal(await harness.editor.save(), false); harness.editor.change({ clear_confirmed: true }); assert.equal(await harness.editor.save(), true);
});

test('最后一代请求胜出，卸载/账号变化时清空秘密且旧成功失败不能回写', async () => {
  const first = pending(), second = pending(); let index = 0; const signals = [];
  const harness = editorFixture({ appAIProvider: ({ signal }) => { signals.push(signal); return [first, second][index++].promise; } });
  const old = harness.editor.load(), fresh = harness.editor.load(); assert.equal(signals[0].aborted, true);
  second.resolve({ ...DEFAULT_APP_AI_PROVIDER, model_id: 'fresh' }); await fresh;
  first.resolve(DEFAULT_APP_AI_PROVIDER); await old; assert.equal(harness.editor.getState().saved.model_id, 'fresh');
  harness.setToken(FAKE_TOKEN); const changes = harness.changes.length; harness.editor.dispose();
  assert.equal(harness.getToken(), ''); assert.equal(harness.editor.getState().saved, null); assert.equal(await harness.editor.load(), false); assert.equal(harness.changes.length, changes);
  const late = pending(); const waiting = editorFixture({ appAIProvider: () => late.promise }); const request = waiting.editor.load(); waiting.editor.dispose(); late.reject(new Error(FAKE_TOKEN)); await request;
  assert.equal(waiting.editor.getState().saved, null); assert.ok(!JSON.stringify(waiting.changes).includes(FAKE_TOKEN));
});

test('取消写入中断回写并要求重载，卸载会清理密码框，不自动重试写入', async () => {
  const write = pending(); let writes = 0, signal;
  const harness = editorFixture({ appAIProvider: async () => DEFAULT_APP_AI_PROVIDER, saveAppAIProvider: (_body, options) => { writes += 1; signal = options.signal; return write.promise; } });
  await harness.editor.load(); harness.editor.change({ token_action: 'replace' }); harness.setToken(FAKE_TOKEN);
  const saving = harness.editor.save(harness.getToken()); harness.editor.cancel(); assert.equal(signal.aborted, true); assert.equal(harness.getToken(), '');
  write.resolve({ ...DEFAULT_APP_AI_PROVIDER, token_configured: true, revision: REVISION }); assert.equal(await saving, false);
  assert.equal(harness.editor.getState().saved.token_configured, false); assert.equal(harness.editor.getState().needsReload, true); assert.equal(await harness.editor.save(FAKE_TOKEN), false); assert.equal(writes, 1);
});

test('本地 fixture 仅内存元数据与 CAS，无令牌读回/真调用；重置只影响 AI', async () => {
  const fixture = createAppAIFixture(); const api = fixtureAPI(fixture);
  const saved = await api.saveAppAIProvider(body('replace')); assert.equal(saved.token_configured, true); assert.notEqual(saved.revision, '0');
  await assert.rejects(api.saveAppAIProvider(body()), { status: 409 });
  assert.deepEqual(await api.appAIProvider(), saved); assert.ok(!JSON.stringify(fixture.control('GET')).includes(FAKE_TOKEN));
  const custom = fixture.respond(APP_AI_PROVIDER_PATH, 'PUT', new URLSearchParams(), body('replace', saved.revision, { base_url: 'https://custom-provider.example.com' })); assert.equal(custom.status, 200); assert.equal(custom.data.base_url, 'https://custom-provider.example.com');
  assert.equal(fixture.respond(APP_AI_PROVIDER_PATH, 'POST').status, 405); assert.equal(fixture.respond(APP_AI_PROVIDER_PATH, 'GET', new URLSearchParams({ api_token: FAKE_TOKEN })).status, 400);
  fixture.control('POST', { scenario: 'slow' }); assert.equal(fixture.delay(APP_AI_PROVIDER_PATH), 1500);
  fixture.control('POST', { reset: true }); assert.deepEqual(await api.appAIProvider(), DEFAULT_APP_AI_PROVIDER);
  assert.equal(createAppAIFixture().respond(APP_AI_PROVIDER_PATH, 'GET').data.token_configured, false);
});

test('卡片接在 V2 模式之后，非受控空密码、父级身份边界与三主题响应布局不持久化秘密', () => {
  const card = source('../pages/admin/AppAIProviderCard.jsx'); const page = source('../pages/admin/appClients.jsx');
  assert.match(page, /<NbwV2PolicyEditor \/>\s*<AppAIProviderCard \/>/); assert.match(page, /AppClientsContent key=\{`\$\{user.id\}:\$\{token\}`\}/);
  assert.match(card, /type="password" defaultValue=""/); assert.match(card, /autoComplete="new-password"/); assert.doesNotMatch(card, /type="password"[^>]*\bvalue=|localStorage|sessionStorage|console\.|dangerouslySetInnerHTML/);
  for (const text of ['X-ABDL-App-AI:1', '旧版 App 或网页 AI', '本站发帖正常', '已同意默认板块', 'DNS 公网解析', '取消当前请求', 'originNeedsToken', 'auth-session-changing', 'current.dispose()']) assert.ok(card.includes(text), text);
  assert.match(card, /<Card /); assert.match(card, /<FormField /); assert.match(card, /minWidth: 0, overflowWrap: 'anywhere'/); assert.match(card, /maxWidth: '100%', whiteSpace: 'normal'/);
  for (const path of ['./model.js', './api.js', './fixture.js']) assert.doesNotMatch(source(path), /localStorage|sessionStorage|console\.|\bfetch\(/);
});

test('实际 api.js 注入继续使用 cookie/账号 token/no-store，仅 PUT body 含假令牌且错误脱敏', async () => {
  const text = source('../api.js');
  assert.match(text, /import \{ createAppAIAPI \} from '.\/appAI\/api.js'/); assert.match(text, /\.\.\.createAppClientsAPI\(apiFetch\),\s*\.\.\.createAppAIAPI\(apiFetch\)/); assert.doesNotMatch(text, /export.*(?:function|\{)\s*apiFetch/);
  const calls = []; let failure;
  const context = { createAppAIAPI, createAppClientsAPI: () => ({}), createAppHumanCheckAPI: () => ({}), createNovelReviewAPI: () => ({}), withAvatarPreviews: data => data, localStorage: { getItem: key => key === 'abdl_accounts' ? JSON.stringify([{ id: 2, token: 'fixture-2' }]) : '2' },
    fetch: async (url, options) => { calls.push({ url, options }); return failure ? Response.json({ error: FAKE_TOKEN, code: FAKE_TOKEN }, { status: failure }) : Response.json(DEFAULT_APP_AI_PROVIDER); } };
  const executable = text.replace(/^import .+;\r?$/gm, '').replace(/import\.meta\.env/g, '({})').replace(/\bexport\s+(?=const|async function|function)/g, '');
  runInNewContext(`${executable}\nglobalThis.actualAdminAPI = adminAPI;`, context);
  const api = context.actualAdminAPI; await api.appAIProvider(); await api.saveAppAIProvider(body('replace'));
  for (const call of calls) { assert.equal(call.url, APP_AI_PROVIDER_PATH); assert.equal(call.options.credentials, 'include'); assert.equal(call.options.headers.Authorization, 'Bearer fixture-2'); assert.equal(call.options.cache, 'no-store'); }
  assert.equal(calls[0].options.body, undefined); assert.deepEqual(JSON.parse(calls[1].options.body), body('replace'));
  for (failure of [401, 403, 409, 503]) await assert.rejects(api.appAIProvider(), error => error.status === failure && !String(error).includes(FAKE_TOKEN));
});

test('fixture HTTP 管理员 guards 优先，安全控制读/重置、错误、CAS、原 fixture 隔离', async () => {
  const { createAdminFixtureServer } = await import('../../tests/app-clients-fixture-server.js');
  const fixture = await createAdminFixtureServer({ quiet: true }); await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.server.address().port}`;
  const request = async (path, method = 'GET', data, token = 'fixture-2') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, ...(data ? { body: JSON.stringify(data) } : {}) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  try {
    const reminder = (await request('/api/admin/app-clients/reminder')).data;
    const initial = await request(APP_AI_PROVIDER_PATH); assert.equal(initial.status, 200); assert.deepEqual(initial.data, DEFAULT_APP_AI_PROVIDER); assert.equal(initial.headers.get('cache-control'), 'no-store');
    for (const token of ['fixture-3', 'production-token']) for (const method of ['GET', 'PUT']) assert.equal((await request(APP_AI_PROVIDER_PATH, method, method === 'PUT' ? body('replace') : undefined, token)).status, token === 'fixture-3' ? 403 : 401);
    assert.equal((await request(APP_AI_FIXTURE_CONTROL_PATH, 'POST', { reset: true }, 'fixture-3')).status, 403);
    const saved = await request(APP_AI_PROVIDER_PATH, 'PUT', body('replace')); assert.equal(saved.data.token_configured, true); assert.ok(!JSON.stringify(saved.data).includes(FAKE_TOKEN)); assert.equal((await request(APP_AI_PROVIDER_PATH, 'PUT', body())).status, 409);
    await request(APP_AI_FIXTURE_CONTROL_PATH, 'POST', { scenario: 'unavailable' }); assert.equal((await request(APP_AI_PROVIDER_PATH)).status, 503);
    assert.deepEqual((await request('/api/admin/app-clients/reminder')).data, reminder);
    await request(APP_AI_FIXTURE_CONTROL_PATH, 'POST', { reset: true }); assert.deepEqual((await request(APP_AI_FIXTURE_CONTROL_PATH)).data.metadata, DEFAULT_APP_AI_PROVIDER);
    const malformed = await fetch(base + APP_AI_PROVIDER_PATH, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: `{"api_token":"${FAKE_TOKEN}"` });
    assert.ok(!(await malformed.text()).includes(FAKE_TOKEN)); assert.equal((await request('/api/not-defined')).status, 404);
  } finally { await fixture.close(); }
});

test('草稿测试与 PUT 共用精确字段，不接受提示词、UI 确认或额外令牌，clear 本地拒绝', async () => {
  let calls = 0;
  const api = createAppAIAPI(async () => { calls += 1; return testResult(); });
  for (const patch of [{ prompt: 'hello' }, { messages: [] }, { clear_confirmed: true }, { token_configured: true }, { api_token: '' }]) await assert.rejects(api.testAppAIProvider(body('keep', '0', patch)), { code: 'INVALID_BODY' });
  await assert.rejects(api.testAppAIProvider(body('clear')), { code: 'MISSING_TOKEN' });
  assert.equal(calls, 0);
});

test('测试响应精确五字段、固定协议/请求模型/服务端文本，拒绝原始正文、秘密、错误长度和耗时', () => {
  for (const latency_ms of [0, 15000]) {
    const value = testResult('custom-model', { latency_ms }); const read = readProviderTestResult(value, 'custom-model');
    assert.deepEqual(read, value); assert.notEqual(read, value); assert.ok(Object.isFrozen(read));
  }
  const valid = testResult();
  for (const key of Object.keys(valid)) { const value = { ...valid }; delete value[key]; assert.throws(() => readProviderTestResult(value, valid.model_id), { code: 'TEST_INVALID_RESPONSE' }); }
  for (const value of [null, [], {}, { ...valid, success: false }, { ...valid, protocol: 'openai_responses' }, { ...valid, model_id: 'upstream-self-reported' }, { ...valid, latency_ms: -1 }, { ...valid, latency_ms: 15001 }, { ...valid, latency_ms: 0.5 }, { ...valid, latency_ms: '12' }, { ...valid, result_text: '' }, { ...valid, result_text: 'x'.repeat(301) }, { ...valid, result_text: FAKE_TOKEN }, { ...valid, result_text: '<script>alert(1)</script>' }, { ...valid, api_token: FAKE_TOKEN }, { ...valid, revision: REVISION }]) assert.throws(() => readProviderTestResult(value, valid.model_id), error => error.code === 'TEST_INVALID_RESPONSE' && !String(error).includes(FAKE_TOKEN));
  assert.throws(() => readProviderMetadata({ ...DEFAULT_APP_AI_PROVIDER, protocol: APP_AI_PROTOCOL }), { code: 'INVALID_RESPONSE' });
});

test('测试 API 固定同源 POST/no-store 与独立 signal，仅 replace body 含假令牌，不自动加 v1 或重试', async () => {
  const calls = [], outer = new AbortController();
  const api = createAppAIAPI(async (path, options) => { calls.push({ path, options }); return testResult('draft-model'); });
  for (const action of ['keep', 'replace']) {
    const payload = body(action, REVISION, { base_url: 'https://custom-provider.example.com/custom', model_id: 'draft-model' });
    assert.deepEqual(await api.testAppAIProvider(payload, { signal: outer.signal, method: 'PUT', body: 'wrong', cache: 'force-cache', path: 'https://upstream.example.com' }), testResult('draft-model'));
    const call = calls.at(-1); assert.equal(call.path, APP_AI_PROVIDER_TEST_PATH); assert.equal(call.options.method, 'POST'); assert.equal(call.options.cache, 'no-store');
    assert.notEqual(call.options.signal, outer.signal); assert.equal(call.options.signal.aborted, false); assert.deepEqual(JSON.parse(call.options.body), payload);
    assert.equal(Object.hasOwn(JSON.parse(call.options.body), 'api_token'), action === 'replace');
  }
  assert.equal(calls.length, 2);
});

test('测试 API 取消前不请求，取消后即使底层忽略 signal 也结束等待且不接收迟到结果', async () => {
  let calls = 0, internal;
  const already = new AbortController(); already.abort(FAKE_TOKEN);
  const response = pending();
  const api = createAppAIAPI(async (_path, options) => { calls += 1; internal = options.signal; return response.promise; });
  await assert.rejects(api.testAppAIProvider(body('replace'), { signal: already.signal }), error => error.code === 'TEST_CANCELLED' && !String(error).includes(FAKE_TOKEN));
  assert.equal(calls, 0);
  const current = new AbortController(); const waiting = api.testAppAIProvider(body('replace'), { signal: current.signal });
  current.abort(FAKE_TOKEN); await assert.rejects(waiting, { code: 'TEST_CANCELLED' }); assert.equal(internal.aborted, true);
  response.resolve(testResult()); await Promise.resolve(); assert.equal(calls, 1);
});

test('测试总截止准确 20 秒，覆盖整个请求等待、AbortController 中断且绝不自动重试', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  assert.equal(APP_AI_TEST_TIMEOUT_MS, 20000);
  const response = pending(); let calls = 0, signal;
  const api = createAppAIAPI(async (_path, options) => { calls += 1; signal = options.signal; return response.promise; });
  const request = api.testAppAIProvider(body('replace'));
  const rejection = assert.rejects(request, error => error.code === 'TEST_TIMEOUT' && /不保证.*不计费/.test(error.message));
  t.mock.timers.tick(19999); assert.equal(signal.aborted, false); assert.equal(calls, 1);
  t.mock.timers.tick(1); await rejection; assert.equal(signal.aborted, true); assert.equal(calls, 1);
  response.reject(new Error(FAKE_TOKEN)); await Promise.resolve();
});

test('测试结束清理截止定时器与外部 abort 监听，后续 tick/会话 abort 不污染已结束请求', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const fail of [false, true]) {
    let signal; const outer = new AbortController();
    const api = createAppAIAPI(async (_path, options) => { signal = options.signal; if (fail) throw new Error(FAKE_TOKEN); return testResult(); });
    if (fail) await assert.rejects(api.testAppAIProvider(body('replace'), { signal: outer.signal }), { code: 'TEST_FAILED' });
    else await api.testAppAIProvider(body('replace'), { signal: outer.signal });
    t.mock.timers.tick(APP_AI_TEST_TIMEOUT_MS + 1); outer.abort(FAKE_TOKEN); assert.equal(signal.aborted, false);
  }
});

test('测试已知状态/reason 使用固定安全文案，未知错误、HTML、URL、cause 均不透传', async () => {
  const cases = [[401, 'anything', 'UNAUTHORIZED'], [403, 'anything', 'FORBIDDEN'], [409, 'revision_conflict', 'CONFLICT'], [429, 'rate_limited', 'TEST_RATE_LIMITED'], [422, 'missing_token', 'MISSING_TOKEN'], [422, 'unconfigured', 'MISSING_TOKEN'], [422, 'token_replace_required', 'TOKEN_REPLACE_REQUIRED'], [422, 'invalid_config', 'TEST_INVALID_CONFIG'], [422, 'invalid_request', 'TEST_INVALID_CONFIG'], [422, 'host_not_allowed', 'TEST_INVALID_CONFIG'], [502, 'dns_unavailable', 'TEST_DNS'], [502, 'dns_non_public', 'TEST_NON_PUBLIC'], [502, 'timeout', 'TEST_TIMEOUT'], [502, 'aborted', 'TEST_CANCELLED'], [502, 'http', 'TEST_UPSTREAM'], [502, 'redirect', 'TEST_REDIRECT'], [502, 'response_limit', 'TEST_RESPONSE'], [502, 'invalid_response', 'TEST_RESPONSE'], [502, 'invalid_json', 'TEST_RESPONSE'], [503, 'storage_unavailable', 'UNAVAILABLE'], [409, 'admin_changed', 'CONFLICT'], [422, 'unknown', 'TEST_FAILED'], [503, 'unknown', 'TEST_FAILED'], [undefined, 'unknown', 'TEST_FAILED']];
  for (const [status, code, expected] of cases) {
    const unsafe = Object.assign(new Error(`<script>${FAKE_TOKEN}</script> https://upstream.example.com`), { status, code, cause: FAKE_TOKEN, body: FAKE_TOKEN, retryAfter: FAKE_TOKEN });
    const safe = sanitizeProviderTestError(unsafe); assert.equal(safe.code, expected); assert.equal(safe.cause, undefined); assert.equal(safe.body, undefined);
    assert.doesNotMatch(String(safe), /FIXTURE_ONLY|<script>|https:\/\/|白名单|批准/);
    const api = createAppAIAPI(async () => { throw unsafe; }); await assert.rejects(api.testAppAIProvider(body('replace')), error => error.code === expected && !JSON.stringify(error).includes(FAKE_TOKEN));
  }
});

test('测试当前 replace 草稿不保存、不刷新元数据/版本、不重置编辑值和密码，也不存储秘密', async () => {
  const fixture = createAppAIFixture(); const harness = editorFixture(fixtureAPI(fixture)); await harness.editor.load();
  harness.editor.change({ base_url: 'https://new-provider.example.com/v1', model_id: 'draft-only', token_action: 'replace' }); harness.setToken(FAKE_TOKEN);
  const before = harness.editor.getState(), clears = harness.getClears();
  assert.equal(await harness.editor.test(harness.getToken()), true);
  const after = harness.editor.getState(); assert.equal(after.saved, before.saved); assert.equal(after.draft, before.draft); assert.equal(after.saved.revision, '0'); assert.equal(after.saved.token_configured, false);
  assert.equal(after.draft.token_action, 'replace'); assert.equal(after.testResult.model_id, 'draft-only'); assert.equal(after.testing, false); assert.equal(after.saving, false); assert.equal(harness.getToken(), FAKE_TOKEN); assert.equal(harness.getClears(), clears);
  assert.deepEqual(fixture.control('GET').data.metadata, DEFAULT_APP_AI_PROVIDER); assert.ok(!JSON.stringify(harness.changes).includes(FAKE_TOKEN));
  assert.equal(await harness.editor.save(harness.getToken()), true); assert.equal(harness.editor.getState().testResult, null); assert.equal(harness.editor.getState().draft.token_action, 'keep');
});

test('keep 测试使用读取的 CAS 版本且不发送 token，clear/未配置/空替换令牌全部本地拒绝', async () => {
  let tests = 0, last;
  const api = { appAIProvider: async () => configuredMetadata(), testAppAIProvider: async payload => { tests += 1; last = payload; return testResult(payload.model_id); } };
  const harness = editorFixture(api); await harness.editor.load();
  harness.editor.change({ model_id: 'keep-draft' }); assert.equal(await harness.editor.test(FAKE_TOKEN), true);
  assert.deepEqual(last, body('keep', REVISION, { model_id: 'keep-draft' })); assert.equal(harness.editor.getState().saved.revision, REVISION);
  harness.editor.change({ token_action: 'clear' }); harness.editor.change({ clear_confirmed: true }); assert.equal(await harness.editor.test(), false); assert.match(harness.editor.getState().testError, /没有可用令牌/);
  harness.editor.change({ token_action: 'replace' }); for (const token of ['', ' ', 'a b']) assert.equal(await harness.editor.test(token), false); assert.equal(tests, 1);
  const empty = editorFixture({ ...api, appAIProvider: async () => DEFAULT_APP_AI_PROVIDER }); await empty.editor.load(); assert.equal(await empty.editor.test(FAKE_TOKEN), false); assert.match(empty.editor.getState().testError, /没有可用令牌/); assert.equal(tests, 1);
});

test('测试沿用令牌跨 origin 仍被编辑器/fixture 拒绝，同源路径允许且不更新版本', async () => {
  const fixture = createAppAIFixture(), api = fixtureAPI(fixture); const saved = await api.saveAppAIProvider(body('replace'));
  const harness = editorFixture(api); await harness.editor.load(); harness.editor.change({ base_url: 'https://new-provider.example.com' });
  assert.equal(await harness.editor.test(), false); assert.match(harness.editor.getState().testError, /更换接口来源/);
  await assert.rejects(api.testAppAIProvider(body('keep', saved.revision, { base_url: 'https://new-provider.example.com' })), { code: 'TOKEN_REPLACE_REQUIRED' });
  harness.editor.change({ base_url: 'https://api.deepseek.com/custom/v1' }); assert.equal(await harness.editor.test(), true); assert.deepEqual(await api.appAIProvider(), saved);
});

test('地址/模型/令牌操作/确认框/密码 onInput 都使测试结果失效，密码不进入 state', async () => {
  const harness = editorFixture({ appAIProvider: async () => configuredMetadata(), testAppAIProvider: async payload => testResult(payload.model_id) }); await harness.editor.load();
  for (const patch of [{ base_url: 'https://api.deepseek.com/v1' }, { model_id: 'another-model' }, { clear_confirmed: true }, { token_action: 'replace' }]) {
    assert.equal(await harness.editor.test(FAKE_TOKEN), true); assert.ok(harness.editor.getState().testResult); harness.editor.change(patch);
    assert.equal(harness.editor.getState().testResult, null); assert.equal(harness.editor.getState().testError, '');
  }
  assert.equal(await harness.editor.test(FAKE_TOKEN), true); harness.editor.tokenChanged(); assert.equal(harness.editor.getState().testResult, null);
  assert.equal(await harness.editor.test(''), false); harness.editor.tokenChanged(); assert.equal(harness.editor.getState().testError, '');
  assert.ok(!JSON.stringify(harness.changes).includes(FAKE_TOKEN));
});

test('load/save/test 单飞：测试期间不重载/保存/重复调用，加载和保存期间不能测试', async () => {
  const loading = pending(), testing = pending(), saving = pending(); let loads = 0, tests = 0, saves = 0;
  const harness = editorFixture({ appAIProvider: async () => { loads += 1; return loading.promise; }, saveAppAIProvider: async () => { saves += 1; return saving.promise; }, testAppAIProvider: async () => { tests += 1; return testing.promise; } });
  const load = harness.editor.load(); assert.equal(await harness.editor.test(), false); loading.resolve(configuredMetadata()); await load;
  const draft = harness.editor.getState().draft; const request = harness.editor.test(); assert.equal(harness.editor.getState().testing, true);
  assert.equal(await harness.editor.test(), false); assert.equal(await harness.editor.save(), false); assert.equal(await harness.editor.load(), false); harness.editor.change({ model_id: 'blocked' }); assert.equal(harness.editor.getState().draft, draft);
  testing.resolve(testResult()); assert.equal(await request, true); assert.equal(tests, 1); assert.equal(loads, 1); assert.equal(saves, 0);
  const write = harness.editor.save(); assert.equal(harness.editor.getState().testResult, null); assert.equal(await harness.editor.test(), false); assert.equal(await harness.editor.load(), false);
  saving.resolve(configuredMetadata()); assert.equal(await write, true); assert.equal(saves, 1); assert.equal(tests, 1);
});

test('取消只读测试清空密码/结果但不需要重载；新请求不受旧成功或失败覆盖', async () => {
  for (const rejectOld of [false, true]) {
    const old = pending(), fresh = pending(); let calls = 0, signal;
    const harness = editorFixture({ appAIProvider: async () => configuredMetadata(), testAppAIProvider: (_payload, options) => { signal = options.signal; return [old, fresh][calls++].promise; } });
    await harness.editor.load(); harness.editor.change({ token_action: 'replace', model_id: 'first-draft' }); harness.setToken(FAKE_TOKEN);
    const first = harness.editor.test(harness.getToken()); harness.editor.cancel(); const cancelled = harness.editor.getState();
    assert.equal(signal.aborted, true); assert.equal(harness.getToken(), ''); assert.equal(cancelled.testResult, null); assert.equal(cancelled.testing, false); assert.equal(cancelled.needsReload, false); assert.match(cancelled.testError, /停止等待.*不计费/);
    harness.editor.change({ model_id: 'fresh-draft' }); const second = harness.editor.test(FAKE_TOKEN);
    if (rejectOld) old.reject(new Error(FAKE_TOKEN)); else old.resolve(testResult('first-draft'));
    assert.equal(await first, false); assert.equal(harness.editor.getState().testing, true);
    fresh.resolve(testResult('fresh-draft')); assert.equal(await second, true); assert.equal(harness.editor.getState().testResult.model_id, 'fresh-draft'); assert.equal(harness.editor.getState().saved.revision, REVISION);
  }
});

test('会话变更/卸载废弃在途测试，密码清空且旧响应/错误不能写入新会话', async () => {
  for (const fail of [false, true]) {
    const response = pending(); let signal;
    const harness = editorFixture({ appAIProvider: async () => configuredMetadata(), testAppAIProvider: (_payload, options) => { signal = options.signal; return response.promise; } });
    await harness.editor.load(); harness.editor.change({ token_action: 'replace' }); harness.setToken(FAKE_TOKEN);
    const request = harness.editor.test(harness.getToken()); const changeCount = harness.changes.length; harness.editor.dispose();
    assert.equal(signal.aborted, true); assert.equal(harness.getToken(), '');
    if (fail) response.reject(new Error(FAKE_TOKEN)); else response.resolve(testResult());
    assert.equal(await request, false); assert.equal(harness.changes.length, changeCount); assert.equal(harness.editor.getState().saved, null); assert.equal(harness.editor.getState().testResult, null); assert.equal(await harness.editor.test(FAKE_TOKEN), false); assert.ok(!JSON.stringify(harness.changes).includes(FAKE_TOKEN));
  }
});

test('测试 401/403/409/损坏响应保留草稿和旧版本、清除结果并锁定到重载，不写保存错误', async () => {
  for (const mode of [401, 403, 409, 'invalid']) {
    let calls = 0;
    const harness = editorFixture({ appAIProvider: async () => configuredMetadata(), testAppAIProvider: async () => { calls += 1; if (mode === 'invalid') return { ...testResult(), api_token: FAKE_TOKEN }; throw Object.assign(new Error(FAKE_TOKEN), { status: mode }); } });
    await harness.editor.load(); harness.editor.change({ model_id: 'must-survive' });
    assert.equal(await harness.editor.test(), false); assert.equal(harness.editor.getState().needsReload, true); assert.equal(harness.editor.getState().saved.revision, REVISION); assert.equal(harness.editor.getState().draft.model_id, 'must-survive'); assert.equal(harness.editor.getState().error, ''); assert.ok(harness.editor.getState().testError);
    assert.equal(await harness.editor.test(), false); assert.equal(await harness.editor.save(), false); assert.equal(calls, 1); assert.ok(!JSON.stringify(harness.changes).includes(FAKE_TOKEN));
    await harness.editor.load(); assert.equal(harness.editor.getState().needsReload, false); assert.equal(harness.editor.getState().testError, '');
  }
});

test('测试供应商失败/超时/限流/未知错误不保存、不假成功、不自动重试且可手动重试', async () => {
  for (const [status, code] of [[502, 'http'], [502, 'timeout'], [429, 'rate_limited'], [503, 'storage_unavailable'], [502, FAKE_TOKEN]]) {
    let calls = 0, fail = true;
    const harness = editorFixture({ appAIProvider: async () => configuredMetadata(), testAppAIProvider: async payload => { calls += 1; if (fail) throw Object.assign(new Error(FAKE_TOKEN), { status, code }); return testResult(payload.model_id); } });
    await harness.editor.load(); harness.editor.change({ model_id: 'retry-draft' }); assert.equal(await harness.editor.test(), false);
    assert.equal(calls, 1); assert.equal(harness.editor.getState().needsReload, false); assert.equal(harness.editor.getState().saved.revision, REVISION); assert.equal(harness.editor.getState().draft.model_id, 'retry-draft'); assert.equal(harness.editor.getState().testResult, null); assert.equal(harness.editor.getState().error, ''); assert.ok(!JSON.stringify(harness.changes).includes(FAKE_TOKEN));
    fail = false; assert.equal(await harness.editor.test(), true); assert.equal(calls, 2); assert.equal(harness.editor.getState().testError, '');
  }
});

test('重新加载使结果失效并清空密码，加载失败也不能展示旧测试成功', async () => {
  let fail = false; const response = pending();
  const harness = editorFixture({ appAIProvider: async () => fail ? response.promise : configuredMetadata(), testAppAIProvider: async payload => testResult(payload.model_id) });
  await harness.editor.load(); harness.editor.change({ token_action: 'replace' }); harness.setToken(FAKE_TOKEN); await harness.editor.test(harness.getToken());
  fail = true; const loading = harness.editor.load(); assert.equal(harness.editor.getState().testResult, null); assert.equal(harness.getToken(), '');
  response.reject(new Error(FAKE_TOKEN)); assert.equal(await loading, false); assert.equal(harness.editor.getState().testResult, null); assert.equal(harness.editor.getState().needsReload, true); assert.ok(!JSON.stringify(harness.changes).includes(FAKE_TOKEN));
});

test('fixture 测试仅模拟响应、不保存 replace 草稿/令牌/版本，支持自定义主机且模型来自请求', async () => {
  const fixture = createAppAIFixture(), api = fixtureAPI(fixture);
  const draft = body('replace', '0', { base_url: 'https://custom-provider.example.com/v1', model_id: 'draft/model:v2' });
  assert.deepEqual(await api.testAppAIProvider(draft), testResult('draft/model:v2'));
  assert.deepEqual(await api.appAIProvider(), DEFAULT_APP_AI_PROVIDER); assert.deepEqual(fixture.control('GET').data.metadata, DEFAULT_APP_AI_PROVIDER);
  const saved = await api.saveAppAIProvider(body('replace')); const keep = body('keep', saved.revision, { model_id: 'keep-draft' });
  assert.deepEqual(await api.testAppAIProvider(keep), testResult('keep-draft')); assert.deepEqual(await api.appAIProvider(), saved);
  for (const payload of [body('keep'), body('replace', saved.revision, { prompt: FAKE_TOKEN }), body('replace', saved.revision, { messages: [] })]) assert.notEqual(fixture.respond(APP_AI_PROVIDER_TEST_PATH, 'POST', new URLSearchParams(), payload).status, 200);
  for (const method of ['GET', 'PUT', 'DELETE']) assert.equal(fixture.respond(APP_AI_PROVIDER_TEST_PATH, method).status, 405);
  assert.equal(fixture.respond(APP_AI_PROVIDER_TEST_PATH, 'POST', new URLSearchParams({ api_token: FAKE_TOKEN }), draft).status, 400);
  assert.ok(!JSON.stringify(fixture.control('GET')).includes(FAKE_TOKEN));
});

test('fixture 提供可复核的测试失败/超时/限流/无效响应/慢响应，均不修改元数据', async () => {
  const fixture = createAppAIFixture(), api = fixtureAPI(fixture);
  for (const [scenario, code] of [['test-error', 'TEST_UPSTREAM'], ['test-timeout', 'TEST_TIMEOUT'], ['test-rate-limited', 'TEST_RATE_LIMITED'], ['test-invalid', 'TEST_INVALID_RESPONSE'], ['conflict', 'CONFLICT']]) {
    fixture.control('POST', { scenario }); await assert.rejects(api.testAppAIProvider(body('replace')), { code }); assert.deepEqual(fixture.control('GET').data.metadata, DEFAULT_APP_AI_PROVIDER);
  }
  fixture.control('POST', { scenario: 'test-slow' }); assert.equal(fixture.delay(APP_AI_PROVIDER_TEST_PATH), 1500); assert.equal(fixture.delay(APP_AI_PROVIDER_PATH), 0);
  assert.deepEqual(await api.testAppAIProvider(body('replace')), testResult()); assert.deepEqual(await api.appAIProvider(), DEFAULT_APP_AI_PROVIDER);
  assert.equal(fixture.respond(APP_AI_PROVIDER_TEST_PATH, 'POST', new URLSearchParams(), body('clear')).data.code, 'missing_token');
  assert.equal(fixture.respond(APP_AI_PROVIDER_TEST_PATH, 'POST', new URLSearchParams(), body('keep')).data.code, 'missing_token');
});

test('实际卡片 SSR 覆盖加载/草稿/测试中/成功/失败，按钮 type=button 且显示协议和非保存边界', async () => {
  const server = await createServer(serverOptions());
  try {
    const { default: Card, AppAIProviderView } = await server.ssrLoadModule('/src/pages/admin/AppAIProviderCard.jsx');
    const render = state => renderToStaticMarkup(React.createElement(AppAIProviderView, { state }));
    const initial = renderToStaticMarkup(React.createElement(Card)); assert.match(initial, /正在读取 App AI 配置/); assert.doesNotMatch(initial, /id="app-ai-provider-form"/);
    for (const text of ['OpenAI兼容 Chat Completions协议（POST .../chat/completions），不是 Responses API', '不自动添加 /v1', '可能产生供应商费用', '不会自动重试', '原始回复不展示', '测试成功不等于已保存', '模型质量', '停止等待不保证', '不设固定供应商主机白名单']) assert.ok(initial.includes(text), text);
    assert.doesNotMatch(initial, /默认批准主机|服务器环境批准|api\.openai\.com|<iframe|<script/);
    const response = pending(); const harness = editorFixture({ appAIProvider: async () => configuredMetadata(), testAppAIProvider: async () => response.promise }); await harness.editor.load();
    harness.editor.change({ model_id: 'ssr-draft' }); const dirty = render(harness.editor.getState()); assert.match(dirty, /未保存更改/); assert.match(dirty, /type="button"[^>]*>测试当前草稿（不保存）/); assert.match(dirty, /type="submit"[^>]*>保存 App AI 配置/); assert.match(dirty, /type="password"[^>]*value=""/);
    const waiting = harness.editor.test(); const busy = render(harness.editor.getState()); assert.match(busy, /正在测试当前草稿（不保存）/); assert.match(busy, /最多等待 20 秒/); assert.match(busy, /停止等待测试/); assert.match(busy, /aria-busy="true"/); assert.match(busy, /<fieldset class="ac-app-fieldset" disabled="">/); assert.match(busy, /disabled="">重新加载已保存 AI 配置/);
    response.resolve(testResult('ssr-draft')); await waiting; const success = render(harness.editor.getState()); assert.match(success, /当前草稿测试成功（未保存）/); assert.match(success, /测试模型：ssr-draft/); assert.match(success, /服务端耗时：12 ms/); assert.match(success, /回复状态：请求成功，已收到有效文本回复。/); assert.match(success, /未保存更改/);
    harness.editor.change({ token_action: 'clear' }); const clear = render(harness.editor.getState()); assert.match(clear, /disabled=""[^>]*>测试当前草稿/); assert.match(clear, /没有可用令牌/); assert.doesNotMatch(clear, /当前草稿测试成功/);
    const error = render({ ...harness.editor.getState(), needsReload: true, testError: sanitizeProviderTestError({ status: 409 }).message }); assert.match(error, /role="alert"/); assert.match(error, /必须成功重新加载后才能保存或测试/);
    assert.match(success, /max-width:100%;white-space:normal/); assert.match(success, /min-width:0;overflow-wrap:anywhere/);
  } finally { await server.close(); }
});

test('实际卡片仅用 React 文本输出请求模型/结果，不创建 HTML 或 URL 导航，密码 onInput 不传值', async () => {
  const server = await createServer(serverOptions());
  try {
    const { AppAIProviderView } = await server.ssrLoadModule('/src/pages/admin/AppAIProviderCard.jsx');
    const model = '<img/src=https://provider.example.com/onerror=alert(1)>';
    const harness = editorFixture({ appAIProvider: async () => configuredMetadata(), testAppAIProvider: async payload => testResult(payload.model_id) }); await harness.editor.load(); harness.editor.change({ model_id: model }); await harness.editor.test();
    const html = renderToStaticMarkup(React.createElement(AppAIProviderView, { state: harness.editor.getState() })); assert.match(html, /&lt;img\/src=https:\/\/provider\.example\.com/); assert.doesNotMatch(html, /<img|<script|href="https:\/\/provider/);
    const card = source('../pages/admin/AppAIProviderCard.jsx'); assert.match(card, /onInput=\{onTokenInput\}/); assert.match(card, /onTokenInput=\{\(\) => editor\.current\?\.tokenChanged\(\)\}/); assert.doesNotMatch(card, /dangerouslySetInnerHTML|\bfetch\(|DEFAULT_APP_AI_HOSTS|testResult[^\n]*href=/);
    const noToken = renderToStaticMarkup(React.createElement(AppAIProviderView, { state: { ...harness.editor.getState(), testResult: null, saved: DEFAULT_APP_AI_PROVIDER } })); assert.match(noToken, /disabled=""[^>]*>测试当前草稿/);
  } finally { await server.close(); }
});

test('实际 adminAPI 测试入口保留 cookie/账号认证与 no-store，只到站内端点，所有失败脱敏', async () => {
  const server = await createServer(serverOptions()), oldFetch = globalThis.fetch, storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const calls = []; let status;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === 'abdl_accounts' ? JSON.stringify([{ id: 2, token: 'fixture-2' }]) : '2' } });
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return status ? Response.json({ error: FAKE_TOKEN, code: FAKE_TOKEN }, { status }) : Response.json(testResult('api-draft')); };
  try {
    const { adminAPI } = await server.ssrLoadModule('/src/api.js'); const payload = body('replace', REVISION, { base_url: 'https://custom-provider.example.com/v1', model_id: 'api-draft' });
    const value = await adminAPI.testAppAIProvider(payload); assert.deepEqual(value, testResult('api-draft')); assert.equal(calls.length, 1);
    assert.equal(calls[0].url, APP_AI_PROVIDER_TEST_PATH); assert.equal(calls[0].options.credentials, 'include'); assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-2'); assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.method, 'POST'); assert.deepEqual(JSON.parse(calls[0].options.body), payload);
    for (status of [401, 403, 409, 422, 429, 502, 503]) await assert.rejects(adminAPI.testAppAIProvider(payload), error => error.status === status && !String(error).includes(FAKE_TOKEN));
    assert.equal(calls.length, 8); assert.ok(calls.every(call => call.url === APP_AI_PROVIDER_TEST_PATH));
  } finally { globalThis.fetch = oldFetch; if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else delete globalThis.localStorage; await server.close(); }
});

test('fixture HTTP 测试认证优先、no-store、不保存且敏感 query/错误/请求 token 不进日志', async () => {
  const { createAdminFixtureServer } = await import('../../tests/app-clients-fixture-server.js');
  const fixture = await createAdminFixtureServer(); await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.server.address().port}`, logs = [], originalLog = console.log;
  console.log = (...values) => logs.push(values.join(' '));
  const request = async (path, payload = body('replace'), token = 'fixture-2') => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  try {
    for (const [token, status] of [['fixture-3', 403], ['not-a-fixture-token', 401]]) assert.equal((await request(APP_AI_PROVIDER_TEST_PATH, {}, token)).status, status);
    const draft = body('replace', '0', { base_url: 'https://custom-provider.example.com/v1', model_id: 'http-draft' }); const result = await request(APP_AI_PROVIDER_TEST_PATH, draft);
    assert.equal(result.status, 200); assert.deepEqual(result.data, testResult('http-draft')); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.ok(!JSON.stringify(result.data).includes(FAKE_TOKEN));
    const read = await fetch(base + APP_AI_PROVIDER_PATH, { headers: { Authorization: 'Bearer fixture-2' } }); assert.deepEqual(await read.json(), DEFAULT_APP_AI_PROVIDER);
    const query = await request(`${APP_AI_PROVIDER_TEST_PATH}?api_token=${FAKE_TOKEN}`); assert.equal(query.status, 400); assert.ok(!JSON.stringify(query.data).includes(FAKE_TOKEN));
    const malformed = await fetch(base + APP_AI_PROVIDER_TEST_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-2' }, body: `{"api_token":"${FAKE_TOKEN}"` }); assert.equal(malformed.status, 400); assert.ok(!(await malformed.text()).includes(FAKE_TOKEN));
    assert.ok(logs.some(line => line.includes(`POST ${APP_AI_PROVIDER_TEST_PATH} -> 200`))); assert.ok(!logs.join('\n').includes(FAKE_TOKEN)); assert.ok(!logs.join('\n').includes('api_token'));
  } finally { console.log = originalLog; await fixture.close(); }
});
