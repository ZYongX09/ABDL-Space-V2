import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createNBWUpstreamAPI } from './api.js';
import { NBW_UPSTREAM_FIXTURE_CONTROL_PATH, NBW_UPSTREAM_FIXTURE_SCENARIOS, createNBWUpstreamFixture } from './fixture.js';
import { DEFAULT_NBW_UPSTREAM, NBW_BACKUP_HOST, NBW_PRIMARY_HOST, NBW_UPSTREAM_HOST_PATH, NBW_UPSTREAM_MODES, NBWUpstreamError, createNBWUpstreamEditor, initialNBWUpstreamState, isNBWUpstreamDirty, nbwUpstreamPayload, readNBWUpstream, sanitizeNBWUpstreamError } from './model.js';

const PRIVATE = 'FIXTURE_ONLY_SECRET_NO_ERROR_ECHO';
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const fixtureAPI = fixture => createNBWUpstreamAPI(async (path, options) => {
  const result = fixture.respond(path, options.method, new URLSearchParams(), options.body ? JSON.parse(options.body) : null);
  if (result.status !== 200) throw Object.assign(new Error(result.data.error), { status: result.status });
  return result.data;
});
const pending = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

const serverOptions = () => ({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });

test('默认值只属于后端/fixture，初始编辑状态没有伪造已保存切换', () => {
  assert.deepEqual(DEFAULT_NBW_UPSTREAM, { mode: 'primary', host: NBW_PRIMARY_HOST, primary_host: NBW_PRIMARY_HOST, backup_host: NBW_BACKUP_HOST });
  assert.equal(NBW_PRIMARY_HOST, 'www.newbabyworld.top'); assert.equal(NBW_BACKUP_HOST, 'nbw.abdlcalendar.top');
  assert.ok(Object.isFrozen(DEFAULT_NBW_UPSTREAM)); assert.ok(Object.isFrozen(NBW_UPSTREAM_MODES));
  assert.equal(initialNBWUpstreamState().saved, null); assert.equal(initialNBWUpstreamState().draft, 'primary');
  assert.equal(initialNBWUpstreamState().loading, true); assert.equal(initialNBWUpstreamState().saving, false); assert.equal(initialNBWUpstreamState().needsReload, true);
});

test('GET严格四字段：mode枚举内且host必须等于所选模式的固定域名', () => {
  const read = readNBWUpstream(DEFAULT_NBW_UPSTREAM);
  assert.deepEqual(read, DEFAULT_NBW_UPSTREAM); assert.notEqual(read, DEFAULT_NBW_UPSTREAM); assert.ok(Object.isFrozen(read));
  assert.equal(readNBWUpstream({ ...DEFAULT_NBW_UPSTREAM, mode: 'backup', host: NBW_BACKUP_HOST }).host, NBW_BACKUP_HOST);
  for (const key of ['mode', 'host', 'primary_host', 'backup_host']) { const missing = { ...DEFAULT_NBW_UPSTREAM }; delete missing[key]; assert.throws(() => readNBWUpstream(missing), { code: 'INVALID_RESPONSE' }); }
  for (const data of [
    { ...DEFAULT_NBW_UPSTREAM, host: NBW_BACKUP_HOST }, { ...DEFAULT_NBW_UPSTREAM, mode: 'backup' },
    { ...DEFAULT_NBW_UPSTREAM, mode: 'PRIMARY' }, { ...DEFAULT_NBW_UPSTREAM, mode: 'local_only' }, { ...DEFAULT_NBW_UPSTREAM, mode: 1 },
    { ...DEFAULT_NBW_UPSTREAM, primary_host: NBW_BACKUP_HOST }, { ...DEFAULT_NBW_UPSTREAM, backup_host: NBW_PRIMARY_HOST },
    { ...DEFAULT_NBW_UPSTREAM, primary_host: 'cdn.newbabyworld.top' },
    { ...DEFAULT_NBW_UPSTREAM, host: '' }, { ...DEFAULT_NBW_UPSTREAM, host: null },
    { ...DEFAULT_NBW_UPSTREAM, host: 'https://www.newbabyworld.top' }, { ...DEFAULT_NBW_UPSTREAM, host: ' www.newbabyworld.top' },
    { ...DEFAULT_NBW_UPSTREAM, host: 'www.newbabyworld.top/' }, { ...DEFAULT_NBW_UPSTREAM, host: 'evil.example.com' },
    null, [], {}, 'primary', 0,
  ]) assert.throws(() => readNBWUpstream(data), { code: 'INVALID_RESPONSE' });
});

test('额外键/保留键样式注入一律拒绝，错误文案不回显注入值', () => {
  for (const extra of ['revision', 'token', 'secret', 'updated_at', 'custom_host']) assert.throws(() => readNBWUpstream({ ...DEFAULT_NBW_UPSTREAM, [extra]: PRIVATE }), error => error.code === 'INVALID_RESPONSE' && !String(error).includes(PRIVATE));
  const unsafe = Object.assign(new Error(PRIVATE), { status: 422 });
  assert.equal(sanitizeNBWUpstreamError(unsafe).code, 'INVALID_BODY'); assert.ok(!String(sanitizeNBWUpstreamError(unsafe)).includes(PRIVATE));
  assert.ok(!JSON.stringify(sanitizeNBWUpstreamError(unsafe)).includes(PRIVATE)); assert.equal(sanitizeNBWUpstreamError(unsafe).cause, undefined);
  assert.equal(sanitizeNBWUpstreamError(new NBWUpstreamError('FORBIDDEN')).code, 'FORBIDDEN');
  assert.equal(new NBWUpstreamError('UNKNOWN_CODE').code, 'REQUEST_FAILED'); assert.equal(new NBWUpstreamError('CANCELLED').name, 'AbortError');
});

test('PUT精确单字段 {mode}，不接收host/revision/确认框或附加属性', () => {
  for (const mode of ['primary', 'backup']) { const payload = nbwUpstreamPayload(mode); assert.deepEqual(payload, { mode }); assert.deepEqual(Reflect.ownKeys(payload), ['mode']); }
  for (const value of ['PRIMARY', 'Backup', 'local_only', 'full', '', ' primary', 'primary ', 'primary\n', null, undefined, 0, 1, true, {}, ['primary'], DEFAULT_NBW_UPSTREAM]) assert.throws(() => nbwUpstreamPayload(value), { code: 'INVALID_BODY' });
});

test('API固定同源GET/PUT、no-store、signal与精确body，调用方不能覆盖方法/缓存/路径', async () => {
  const calls = [], signal = new AbortController().signal;
  const api = createNBWUpstreamAPI(async (path, options) => { calls.push({ path, options }); return DEFAULT_NBW_UPSTREAM; });
  await api.nbwUpstreamHost({ signal, method: 'POST', body: PRIVATE, cache: 'force-cache' });
  await api.saveNBWUpstreamHost('backup', { signal, method: 'DELETE', body: PRIVATE, cache: 'force-cache' });
  await api.nbwUpstreamHost();
  assert.equal(calls.length, 3);
  for (const call of calls) { assert.equal(call.path, NBW_UPSTREAM_HOST_PATH); assert.equal(call.options.cache, 'no-store'); assert.ok(!call.path.includes('?')); }
  assert.equal(calls[0].options.method, 'GET'); assert.equal(Object.hasOwn(calls[0].options, 'body'), false); assert.equal(calls[0].options.signal, signal);
  assert.equal(calls[1].options.method, 'PUT'); assert.equal(calls[1].options.signal, signal); assert.deepEqual(JSON.parse(calls[1].options.body), { mode: 'backup' });
  assert.equal(calls[2].options.method, 'GET');
  await assert.rejects(api.saveNBWUpstreamHost('local_only')); assert.equal(calls.length, 3);
  await assert.rejects(api.saveNBWUpstreamHost(DEFAULT_NBW_UPSTREAM)); assert.equal(calls.length, 3);
});

test('401/403/422/503/网络错误脱敏，无原始message、body、cause；加载失败不降级默认域名', async () => {
  for (const [status, code] of [[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [422, 'INVALID_BODY'], [503, 'UNAVAILABLE'], [500, 'REQUEST_FAILED'], [undefined, 'REQUEST_FAILED']]) {
    const unsafe = Object.assign(new Error(PRIVATE), { status, code: PRIVATE, body: PRIVATE, cause: PRIVATE });
    const api = createNBWUpstreamAPI(async () => { throw unsafe; });
    await assert.rejects(api.nbwUpstreamHost(), error => error.code === code && !JSON.stringify(error).includes(PRIVATE) && !String(error).includes(PRIVATE) && !error.cause);
    await assert.rejects(api.saveNBWUpstreamHost('backup'), error => error.code === code && !String(error).includes(PRIVATE));
    const editor = createNBWUpstreamEditor(api); await editor.load();
    assert.equal(editor.getState().saved, null); assert.equal(editor.getState().needsReload, true); assert.equal(await editor.save(), false);
  }
  assert.equal(sanitizeNBWUpstreamError(new Error(PRIVATE)).code, 'REQUEST_FAILED');
});

test('编辑器加载/保存接受服务器投影，dirty随选择更新，保存后回到一致', async () => {
  const fixture = createNBWUpstreamFixture(), api = fixtureAPI(fixture), editor = createNBWUpstreamEditor(api);
  assert.equal(await editor.save(), false);
  assert.equal(await editor.load(), true);
  assert.equal(editor.getState().saved.mode, 'primary'); assert.equal(editor.getState().draft, 'primary');
  assert.equal(isNBWUpstreamDirty(editor.getState().saved, editor.getState().draft), false);
  editor.change('backup');
  assert.equal(isNBWUpstreamDirty(editor.getState().saved, editor.getState().draft), true);
  assert.equal(await editor.save(), true);
  assert.equal(editor.getState().saved.mode, 'backup'); assert.equal(editor.getState().saved.host, NBW_BACKUP_HOST);
  assert.equal(editor.getState().draft, 'backup'); assert.equal(editor.getState().needsReload, false); assert.equal(editor.getState().loading, false); assert.equal(editor.getState().saving, false);
  assert.equal(isNBWUpstreamDirty(editor.getState().saved, editor.getState().draft), false);
  assert.match(editor.getState().notice, /已切换，对后续调用立即生效/); assert.match(editor.getState().notice, /不会自动重试已失败的请求/);
  editor.change('primary'); assert.equal(await editor.save(), true);
  assert.equal(editor.getState().saved.host, NBW_PRIMARY_HOST); assert.equal(isNBWUpstreamDirty(editor.getState().saved, editor.getState().draft), false);
});

test('change只接受两个固定模式，加载/保存/needsReload期间锁定草稿', async () => {
  const fixture = createNBWUpstreamFixture(), editor = createNBWUpstreamEditor(fixtureAPI(fixture));
  editor.change('backup'); assert.equal(editor.getState().draft, 'primary');
  await editor.load();
  for (const invalid of ['local_only', 'PRIMARY', '', null, 1, DEFAULT_NBW_UPSTREAM]) { editor.change(invalid); assert.equal(editor.getState().draft, 'primary'); }
  editor.change('backup'); assert.equal(editor.getState().draft, 'backup');
  fixture.control('POST', { scenario: 'save-error' });
  assert.equal(await editor.save(), false);
  editor.change('primary'); assert.equal(editor.getState().draft, 'backup');
  assert.equal(await editor.save(), false);
});

test('保存503/401/403/422/损坏响应保留草稿但需重载，不把未确认状态显示为已保存', async () => {
  const fixture = createNBWUpstreamFixture(), editor = createNBWUpstreamEditor(fixtureAPI(fixture));
  await editor.load(); editor.change('backup');
  fixture.control('POST', { scenario: 'save-error' });
  assert.equal(await editor.save(), false);
  assert.equal(editor.getState().saved.mode, 'primary'); assert.equal(editor.getState().draft, 'backup');
  assert.equal(editor.getState().needsReload, true); assert.equal(await editor.save(), false);
  const badEditor = createNBWUpstreamEditor({ nbwUpstreamHost: async () => DEFAULT_NBW_UPSTREAM, saveNBWUpstreamHost: async () => ({ mode: 'backup' }) });
  await badEditor.load(); badEditor.change('backup');
  assert.equal(await badEditor.save(), false);
  assert.equal(badEditor.getState().needsReload, true); assert.equal(badEditor.getState().saved.mode, 'primary'); assert.equal(badEditor.getState().draft, 'backup');
  for (const status of [401, 403, 422, 503]) {
    const guarded = createNBWUpstreamEditor({ nbwUpstreamHost: async () => DEFAULT_NBW_UPSTREAM, saveNBWUpstreamHost: async () => { throw Object.assign(new Error(PRIVATE), { status }); } });
    await guarded.load(); guarded.change('backup');
    assert.equal(await guarded.save(), false);
    assert.equal(guarded.getState().needsReload, true); assert.ok(guarded.getState().error); assert.ok(!String(guarded.getState().error).includes(PRIVATE));
    assert.equal(guarded.getState().saved.mode, 'primary');
  }
  // 末写生效、无 CAS：普通网络失败不锁定，草稿保留且可直接重试保存。
  const retryable = createNBWUpstreamEditor({ nbwUpstreamHost: async () => DEFAULT_NBW_UPSTREAM, saveNBWUpstreamHost: async () => { throw Object.assign(new Error(PRIVATE), { status: 500 }); } });
  await retryable.load(); retryable.change('backup');
  assert.equal(await retryable.save(), false);
  assert.equal(retryable.getState().needsReload, false); assert.equal(retryable.getState().saved.mode, 'primary'); assert.equal(retryable.getState().draft, 'backup');
  assert.equal(await retryable.save(), false); assert.equal(retryable.getState().needsReload, false); assert.ok(!String(retryable.getState().error).includes(PRIVATE));
});

test('加载失败（unavailable/invalid/网络）不降级默认域名，saved保持null且禁止保存', async () => {
  const fixture = createNBWUpstreamFixture(), api = fixtureAPI(fixture), editor = createNBWUpstreamEditor(api);
  fixture.control('POST', { scenario: 'unavailable' });
  assert.equal(await editor.load(), false);
  assert.equal(editor.getState().saved, null); assert.equal(editor.getState().needsReload, true); assert.equal(await editor.save(), false);
  assert.match(editor.getState().error, /暂不可用/);
  fixture.control('POST', { scenario: 'normal' });
  assert.equal(await editor.load(), true);
  fixture.control('POST', { scenario: 'invalid' });
  const broken = createNBWUpstreamEditor(api);
  assert.equal(await broken.load(), false);
  assert.equal(broken.getState().saved, null); assert.equal(broken.getState().needsReload, true); assert.equal(await broken.save(), false);
  const offline = createNBWUpstreamEditor({ nbwUpstreamHost: async () => { throw new Error('offline'); } });
  assert.equal(await offline.load(), false); assert.equal(offline.getState().saved, null);
});

test('代次胜出，卸载/会话变化抛弃旧成功与旧错误；StrictMode新编辑器不共用状态', async () => {
  const first = pending(), second = pending(); let index = 0; const signals = [];
  const editor = createNBWUpstreamEditor({ nbwUpstreamHost: ({ signal }) => { signals.push(signal); return [first, second][index++].promise; } });
  const old = editor.load(), fresh = editor.load(); assert.equal(signals[0].aborted, true);
  second.resolve({ ...DEFAULT_NBW_UPSTREAM, mode: 'backup', host: NBW_BACKUP_HOST }); await fresh; first.resolve(DEFAULT_NBW_UPSTREAM); await old;
  assert.equal(editor.getState().saved.mode, 'backup'); editor.dispose(); assert.equal(editor.getState().saved, null); assert.equal(await editor.load(), false);
  const late = pending(), changes = [], next = createNBWUpstreamEditor({ nbwUpstreamHost: () => late.promise }, { onChange: state => changes.push(state) });
  const loading = next.load(), before = changes.length; next.dispose(); late.reject(new Error(PRIVATE)); await loading;
  assert.equal(changes.length, before); assert.equal(next.getState().saved, null);
});

test('取消在途写入不声称回滚，晚到成功不能显示saved；只允许重载且无重复写', async () => {
  const write = pending(); let writes = 0, signal;
  const editor = createNBWUpstreamEditor({ nbwUpstreamHost: async () => DEFAULT_NBW_UPSTREAM, saveNBWUpstreamHost: (_mode, options) => { writes++; signal = options.signal; return write.promise; } });
  await editor.load(); editor.change('backup'); const saving = editor.save(); editor.cancel();
  assert.equal(signal.aborted, true); assert.equal(editor.getState().needsReload, true); assert.match(editor.getState().error, /不代表服务器切换被撤回/);
  write.resolve({ ...DEFAULT_NBW_UPSTREAM, mode: 'backup', host: NBW_BACKUP_HOST }); assert.equal(await saving, false);
  assert.equal(editor.getState().saved.mode, 'primary'); assert.equal(await editor.save(), false); assert.equal(writes, 1);
});

test('API取消前后抹去signal.reason与旧响应，无隐式请求/重试', async () => {
  const controller = new AbortController(); controller.abort(PRIVATE); let calls = 0;
  const api = createNBWUpstreamAPI(async () => { calls++; return DEFAULT_NBW_UPSTREAM; });
  await assert.rejects(api.nbwUpstreamHost({ signal: controller.signal }), error => error.name === 'AbortError' && !String(error).includes(PRIVATE)); assert.equal(calls, 0);
  await assert.rejects(api.saveNBWUpstreamHost('backup', { signal: controller.signal }), { name: 'AbortError' }); assert.equal(calls, 0);
  const late = pending(), current = new AbortController(), delayed = createNBWUpstreamAPI(async () => late.promise);
  const request = delayed.nbwUpstreamHost({ signal: current.signal }); current.abort(PRIVATE); late.resolve(DEFAULT_NBW_UPSTREAM);
  await assert.rejects(request, { name: 'AbortError' }); assert.equal(calls, 0);
});

test('加载与保存互斥：在途保存期间不能再次保存，后写覆盖语义下可再次切换', async () => {
  const write = pending(); let writes = 0;
  const editor = createNBWUpstreamEditor({ nbwUpstreamHost: async () => DEFAULT_NBW_UPSTREAM, saveNBWUpstreamHost: async () => { writes++; return writes === 1 ? write.promise : { ...DEFAULT_NBW_UPSTREAM, mode: 'primary', host: NBW_PRIMARY_HOST }; } });
  await editor.load(); editor.change('backup');
  const saving = editor.save(); assert.equal(editor.getState().saving, true);
  assert.equal(await editor.save(), false);
  write.resolve({ ...DEFAULT_NBW_UPSTREAM, mode: 'backup', host: NBW_BACKUP_HOST });
  assert.equal(await saving, true); assert.equal(writes, 1);
  assert.equal(editor.getState().saved.mode, 'backup');
  editor.change('primary'); assert.equal(await editor.save(), true); assert.equal(writes, 2); assert.equal(editor.getState().saved.mode, 'primary');
});

test('内存fixture精确切换/复位/错误/延迟，域名固定不接受自填', async () => {
  const fixture = createNBWUpstreamFixture(), api = fixtureAPI(fixture);
  assert.deepEqual(await api.nbwUpstreamHost(), DEFAULT_NBW_UPSTREAM);
  const saved = await api.saveNBWUpstreamHost('backup');
  assert.equal(saved.mode, 'backup'); assert.equal(saved.host, NBW_BACKUP_HOST);
  assert.deepEqual(Object.keys(saved).sort(), ['backup_host', 'host', 'mode', 'primary_host']);
  await assert.rejects(api.saveNBWUpstreamHost('full'), { code: 'INVALID_BODY' });
  assert.equal(fixture.respond(NBW_UPSTREAM_HOST_PATH, 'PUT', new URLSearchParams(), { mode: 'backup', host: 'evil.example.com' }).status, 422);
  assert.equal(fixture.respond(NBW_UPSTREAM_HOST_PATH, 'PUT', new URLSearchParams(), { mode: 'backup', custom: PRIVATE }).status, 422);
  assert.equal(fixture.respond(NBW_UPSTREAM_HOST_PATH, 'PUT', new URLSearchParams(), { mode: 'backup', nbw_upstream_host: 'evil.example.com' }).status, 422);
  assert.equal(fixture.respond(NBW_UPSTREAM_HOST_PATH, 'POST').status, 405);
  assert.equal(fixture.respond(NBW_UPSTREAM_HOST_PATH, 'GET', new URLSearchParams({ token: PRIVATE })).status, 400);
  assert.equal(fixture.respond('/api/admin/other', 'GET').status, 404);
  fixture.control('POST', { scenario: 'slow' }); assert.equal(fixture.delay(NBW_UPSTREAM_HOST_PATH), 1500); assert.equal(fixture.delay('/api/other'), 0);
  fixture.control('POST', { scenario: 'unavailable' }); await assert.rejects(api.nbwUpstreamHost(), { code: 'UNAVAILABLE' });
  fixture.control('POST', { scenario: 'save-error' }); await assert.rejects(api.saveNBWUpstreamHost('primary'), { code: 'UNAVAILABLE' });
  fixture.control('POST', { scenario: 'invalid' }); await assert.rejects(api.nbwUpstreamHost(), { code: 'INVALID_RESPONSE' });
  fixture.control('POST', { reset: true }); assert.deepEqual(await api.nbwUpstreamHost(), DEFAULT_NBW_UPSTREAM);
  assert.equal(fixture.control('POST', { scenario: 'nope' }).status, 400);
  assert.equal(fixture.control('POST', { reset: false }).status, 400);
  assert.equal(fixture.control('POST', { extra: PRIVATE }).status, 400);
  assert.equal(fixture.control('DELETE').status, 405);
  assert.deepEqual(NBW_UPSTREAM_FIXTURE_SCENARIOS, ['normal', 'unavailable', 'save-error', 'slow', 'invalid']);
  assert.ok(!JSON.stringify(fixture.control('GET')).includes(PRIVATE));
});

test('真实卡片SSR覆盖加载/已保存/dirty/错误/needsReload；两域名固定且无自填输入', async () => {
  const server = await createServer(serverOptions());
  try {
    const { default: Card, AppNBWUpstreamView } = await server.ssrLoadModule('/src/pages/admin/AppNBWUpstreamCard.jsx');
    const render = state => renderToStaticMarkup(React.createElement(AppNBWUpstreamView, { state }));
    const initial = renderToStaticMarkup(React.createElement(Card));
    assert.match(initial, /正在读取 NBW 上游域名/); assert.doesNotMatch(initial, /id="nbw-upstream-form"/); assert.doesNotMatch(initial, /<input/);
    for (const text of ['NBW 上游域名（备用切换）', '两个域名固定，不可自填', '同步发布、读取、OAuth 交换', '不会重试已失败的请求', '始终使用主域名', '主域名恢复后请切回主域名', '主域名：www.newbabyworld.top', '备用域名：nbw.abdlcalendar.top']) assert.ok(initial.includes(text), text);
    const editor = createNBWUpstreamEditor(fixtureAPI(createNBWUpstreamFixture())); await editor.load();
    const primary = render(editor.getState());
    assert.match(primary, /当前上游：主域名/); assert.match(primary, /id="nbw-upstream-form"/);
    assert.match(primary, /<input type="radio" name="nbw-upstream-mode" checked="" value="primary"\/>/);
    assert.doesNotMatch(primary, /<input[^>]*value="backup"[^>]*checked/);
    assert.equal((primary.match(/type="radio"/g) || []).length, 2);
    assert.doesNotMatch(primary, /<input(?![^>]*type="radio")[^>]*>/);
    editor.change('backup');
    const dirty = render(editor.getState());
    assert.match(dirty, /checked="" value="backup"\/>/); assert.match(dirty, /未保存更改/); assert.match(dirty, /当前上游：主域名/);
    await editor.save();
    const saved = render(editor.getState());
    assert.match(saved, /当前上游：备用域名/); assert.match(saved, /NBW 上游域名已切换，对后续调用立即生效/); assert.match(saved, /checked="" value="backup"\/>/);
    for (const status of [401, 403, 503]) {
      const error = sanitizeNBWUpstreamError(Object.assign(new Error(PRIVATE), { status }));
      const html = render({ ...editor.getState(), notice: '', error: error.message, needsReload: true });
      assert.match(html, /role="alert"/); assert.ok(html.includes(error.message)); assert.match(html, /必须成功重新加载/); assert.ok(!html.includes(PRIVATE));
      assert.match(html, /<fieldset class="ac-app-fieldset" disabled="">/);
    }
    assert.match(saved, /max-width:100%;white-space:normal/); assert.match(saved, /min-width:0;overflow-wrap:anywhere/);
  } finally { await server.close(); }
});

test('实际api.js认证注入使用cookie/token/no-store，PUT body仅mode字段', async () => {
  const server = await createServer(serverOptions()), oldFetch = globalThis.fetch, storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const calls = []; let status;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === 'abdl_accounts' ? JSON.stringify([{ id: 2, token: 'fixture-2' }]) : '2' } });
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return status ? Response.json({ error: PRIVATE, code: PRIVATE }, { status }) : Response.json(DEFAULT_NBW_UPSTREAM); };
  try {
    const { adminAPI } = await server.ssrLoadModule('/src/api.js');
    await adminAPI.nbwUpstreamHost(); await adminAPI.saveNBWUpstreamHost('backup');
    for (const call of calls) { assert.equal(call.url, NBW_UPSTREAM_HOST_PATH); assert.equal(call.options.credentials, 'include'); assert.equal(call.options.headers.Authorization, 'Bearer fixture-2'); assert.equal(call.options.cache, 'no-store'); }
    assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.body, undefined);
    assert.equal(calls[1].options.method, 'PUT'); assert.deepEqual(JSON.parse(calls[1].options.body), { mode: 'backup' });
    for (status of [401, 403, 422, 503]) await assert.rejects(adminAPI.nbwUpstreamHost(), error => error.status === status && !String(error).includes(PRIVATE));
  } finally { globalThis.fetch = oldFetch; if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else delete globalThis.localStorage; await server.close(); }
});

test('卡片接在V2模式之后、AI卡片之前；api.js最小接线；模块无本地存储/console/fetch/自填输入', () => {
  const page = source('../pages/admin/appClients.jsx'), card = source('../pages/admin/AppNBWUpstreamCard.jsx'), api = source('../api.js');
  assert.match(page, /<NbwV2PolicyEditor \/>\s*<AppNBWUpstreamCard \/>\s*<AppAIProviderCard \/>/);
  assert.match(page, /import AppNBWUpstreamCard from '\.\/AppNBWUpstreamCard';/);
  assert.match(page, /AppClientsContent key=\{`\$\{user\.id\}:\$\{token\}`\}/);
  assert.match(card, /auth-session-changing/); assert.match(card, /current\.dispose\(\)/);
  assert.doesNotMatch(card, /localStorage|sessionStorage|console\.|dangerouslySetInnerHTML|\bfetch\(|type="text"|type="url"/);
  assert.match(api, /import \{ createNBWUpstreamAPI \} from '\.\/nbwUpstream\/api\.js';/);
  assert.match(api, /\.\.\.createAppHumanCheckAPI\(apiFetch\),\s*\.\.\.createNBWUpstreamAPI\(apiFetch\)/);
  for (const path of ['./model.js', './api.js', './fixture.js']) assert.doesNotMatch(source(path), /localStorage|sessionStorage|console\.|\bfetch\(/);
  assert.equal(NBW_PRIMARY_HOST, 'www.newbabyworld.top'); assert.equal(NBW_BACKUP_HOST, 'nbw.abdlcalendar.top');
});

test('fixture HTTP管理员guard优先：匿名401、非管理员403，切换/重置不污染AI与提醒', async () => {
  const { createAdminFixtureServer } = await import('../../tests/app-clients-fixture-server.js');
  const fixture = await createAdminFixtureServer({ quiet: true }); await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.server.address().port}`;
  const request = async (path, method = 'GET', body, token = 'fixture-2') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  try {
    const ai = (await request('/api/admin/app-ai/provider')).data, reminder = (await request('/api/admin/app-clients/reminder')).data;
    const initial = await request(NBW_UPSTREAM_HOST_PATH);
    assert.equal(initial.status, 200); assert.deepEqual(initial.data, DEFAULT_NBW_UPSTREAM); assert.equal(initial.headers.get('cache-control'), 'no-store');
    for (const token of ['fixture-3', 'real-token-is-not-accepted']) for (const method of ['GET', 'PUT']) assert.equal((await request(NBW_UPSTREAM_HOST_PATH, method, method === 'PUT' ? { mode: 'backup' } : undefined, token)).status, token === 'fixture-3' ? 403 : 401);
    assert.equal((await request(NBW_UPSTREAM_FIXTURE_CONTROL_PATH, 'POST', { reset: true }, 'fixture-3')).status, 403);
    await request('/__fixture/session?id=0');
    assert.equal((await request(NBW_UPSTREAM_HOST_PATH, 'GET', undefined, '')).status, 401);
    assert.equal((await request(NBW_UPSTREAM_FIXTURE_CONTROL_PATH, 'POST', { reset: true }, '')).status, 401);
    const saved = await request(NBW_UPSTREAM_HOST_PATH, 'PUT', { mode: 'backup' });
    assert.equal(saved.status, 200); assert.equal(saved.data.mode, 'backup'); assert.equal(saved.data.host, NBW_BACKUP_HOST);
    assert.deepEqual((await request(NBW_UPSTREAM_HOST_PATH)).data, saved.data);
    assert.equal((await request(NBW_UPSTREAM_FIXTURE_CONTROL_PATH, 'POST', { scenario: 'unavailable' })).status, 200);
    assert.equal((await request(NBW_UPSTREAM_HOST_PATH)).status, 503);
    assert.equal((await request(NBW_UPSTREAM_FIXTURE_CONTROL_PATH, 'POST', { reset: true })).status, 200);
    assert.deepEqual((await request(NBW_UPSTREAM_HOST_PATH)).data, DEFAULT_NBW_UPSTREAM);
    assert.deepEqual((await request('/api/admin/app-ai/provider')).data, ai); assert.deepEqual((await request('/api/admin/app-clients/reminder')).data, reminder);
    assert.equal((await request(`${NBW_UPSTREAM_HOST_PATH}?mode=backup`)).status, 400);
    const malformed = await fetch(base + NBW_UPSTREAM_HOST_PATH, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-2' }, body: `{"mode":"backup","secret":"${PRIVATE}"` });
    assert.ok(!(await malformed.text()).includes(PRIVATE));
  } finally { await fixture.close(); }
});

test('fixture HTTP日志排除新路径的query与请求体，不泄露保留键样式的注入', async () => {
  const { createAdminFixtureServer } = await import('../../tests/app-clients-fixture-server.js');
  const fixture = await createAdminFixtureServer(); await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.server.address().port}`, logs = [], originalLog = console.log;
  console.log = (...values) => logs.push(values.join(' '));
  try {
    const clean = await fetch(base + NBW_UPSTREAM_HOST_PATH, { headers: { Authorization: 'Bearer fixture-2' } });
    assert.equal(clean.status, 200);
    const query = await fetch(base + `${NBW_UPSTREAM_HOST_PATH}?mode=backup&token=${PRIVATE}`, { headers: { Authorization: 'Bearer fixture-2' } });
    assert.equal(query.status, 400); assert.ok(!(await query.text()).includes(PRIVATE));
    const bad = await fetch(base + NBW_UPSTREAM_HOST_PATH, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-2' }, body: JSON.stringify({ mode: 'backup', host: PRIVATE }) });
    assert.equal(bad.status, 422); assert.ok(!(await bad.text()).includes(PRIVATE));
    const malformed = await fetch(base + NBW_UPSTREAM_FIXTURE_CONTROL_PATH, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-2' }, body: `{"scenario":"${PRIVATE}"` });
    assert.ok(!(await malformed.text()).includes(PRIVATE));
    assert.ok(logs.some(line => line.includes(`GET ${NBW_UPSTREAM_HOST_PATH} -> 200`)));
    assert.ok(!logs.join('\n').includes(PRIVATE)); assert.ok(!logs.join('\n').includes('mode=backup'));
  } finally { console.log = originalLog; await fixture.close(); }
});
