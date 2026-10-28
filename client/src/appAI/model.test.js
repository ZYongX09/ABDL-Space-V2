import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createAppAIAPI } from './api.js';
import { APP_AI_FIXTURE_CONTROL_PATH, createAppAIFixture } from './fixture.js';
import { APP_AI_PROVIDER_PATH, createProviderEditor, DEFAULT_APP_AI_HOSTS, DEFAULT_APP_AI_PROVIDER, initialProviderState, providerBaseURL, providerOriginChangeRequiresToken, providerPayload, readProviderMetadata, sanitizeAppAIError } from './model.js';

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
  assert.deepEqual(DEFAULT_APP_AI_HOSTS, ['api.deepseek.com', 'api.openai.com', 'openrouter.ai', 'api.siliconflow.cn', 'api.groq.com', 'dashscope.aliyuncs.com']);
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

test('地址仅 HTTPS 公网域名与安全路径，自定义主机仍须服务端批准', () => {
  for (const host of DEFAULT_APP_AI_HOSTS) assert.equal(providerBaseURL(`https://${host}/v1/`), `https://${host}/v1`);
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
  const custom = fixture.respond(APP_AI_PROVIDER_PATH, 'PUT', new URLSearchParams(), body('keep', saved.revision, { base_url: 'https://unapproved.example.com' })); assert.equal(custom.status, 400);
  assert.equal(fixture.respond(APP_AI_PROVIDER_PATH, 'POST').status, 405); assert.equal(fixture.respond(APP_AI_PROVIDER_PATH, 'GET', new URLSearchParams({ api_token: FAKE_TOKEN })).status, 400);
  fixture.control('POST', { scenario: 'slow' }); assert.equal(fixture.delay(APP_AI_PROVIDER_PATH), 1500);
  fixture.control('POST', { reset: true }); assert.deepEqual(await api.appAIProvider(), DEFAULT_APP_AI_PROVIDER);
  assert.equal(createAppAIFixture().respond(APP_AI_PROVIDER_PATH, 'GET').data.token_configured, false);
});

test('卡片接在 V2 模式之后，非受控空密码、父级身份边界与三主题响应布局不持久化秘密', () => {
  const card = source('../pages/admin/AppAIProviderCard.jsx'); const page = source('../pages/admin/appClients.jsx');
  assert.match(page, /<NbwV2PolicyEditor \/>\s*<AppAIProviderCard \/>/); assert.match(page, /AppClientsContent key=\{`\$\{user.id\}:\$\{token\}`\}/);
  assert.match(card, /type="password" defaultValue=""/); assert.match(card, /autoComplete="new-password"/); assert.doesNotMatch(card, /type="password"[^>]*\bvalue=|localStorage|sessionStorage|console\.|dangerouslySetInnerHTML/);
  for (const text of ['X-ABDL-App-AI:1', '旧版 App 或网页 AI', '本站发帖正常', '已同意默认板块', '服务器环境批准', '取消当前请求', 'originNeedsToken', 'auth-session-changing', 'current.dispose()']) assert.ok(card.includes(text), text);
  assert.match(card, /<Card /); assert.match(card, /<FormField /); assert.match(card, /minWidth: 0, overflowWrap: 'anywhere'/); assert.match(card, /maxWidth: '100%', whiteSpace: 'normal'/);
  for (const path of ['./model.js', './api.js', './fixture.js']) assert.doesNotMatch(source(path), /localStorage|sessionStorage|console\.|\bfetch\(/);
});

test('实际 api.js 注入继续使用 cookie/账号 token/no-store，仅 PUT body 含假令牌且错误脱敏', async () => {
  const text = source('../api.js');
  assert.match(text, /import \{ createAppAIAPI \} from '.\/appAI\/api.js'/); assert.match(text, /\.\.\.createAppClientsAPI\(apiFetch\),\s*\.\.\.createAppAIAPI\(apiFetch\)/); assert.doesNotMatch(text, /export.*(?:function|\{)\s*apiFetch/);
  const calls = []; let failure;
  const context = { createAppAIAPI, createAppClientsAPI: () => ({}), createAppHumanCheckAPI: () => ({}), withAvatarPreviews: data => data, localStorage: { getItem: key => key === 'abdl_accounts' ? JSON.stringify([{ id: 2, token: 'fixture-2' }]) : '2' },
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
