import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
async function withAPI(run, { base = '', offline = false } = {}) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'd1-vite-contract-'));
  const server = await createServer({
    configFile: false, envFile: false, cacheDir, root: new URL('../', import.meta.url).pathname,
    server: { middlewareMode: true, hmr: { port: 42000 + process.pid % 10000 }, proxy: {} }, appType: 'custom',
    define: { 'import.meta.env.VITE_API_BASE': JSON.stringify(base) },
    plugins: offline ? [{ name: 'existing-offline-branch', transform(code, id) {
      if (id.endsWith('/src/api.js')) return code.replace('const USE_API = API_BASE !== undefined && API_BASE !== null;', 'const USE_API = false;');
    } }] : [],
  });
  const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
  const storage = new Map([['abdl_accounts', '[{"id":1,"token":"fixture-only"}]'], ['abdl_active_account', '1']]);
  const calls = [];
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  let respond = () => Response.json({});
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return respond(url, options); };
  try { await run({ api: await server.ssrLoadModule('/src/api.js'), calls, storage, respond: next => { respond = next; } }); }
  finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }); globalThis.fetch = originalFetch; if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage; }
}

test('apiFetch 保留 JSON/非 JSON HTTP status、code、Retry-After，成功响应仍归一化', async () => {
  await withAPI(async ({ api, respond }) => {
    const cases = [
      [Response.json({ error: '预算耗尽', code: 'D1_LIMIT' }, { status: 429, headers: { 'Retry-After': '901' } }), { status: 429, code: 'D1_LIMIT', retryAfter: '901' }],
      [new Response('<html>slow down</html>', { status: 429, headers: { 'Retry-After': 'Sun, 18 Oct 2026 21:00:00 GMT' } }), { status: 429, code: 'HTTP_429', retryAfter: 'Sun, 18 Oct 2026 21:00:00 GMT' }],
      [new Response('unauthorized', { status: 401 }), { status: 401, code: 'HTTP_401', retryAfter: null }],
      [new Response('upstream failed', { status: 503 }), { status: 503, code: 'HTTP_503', retryAfter: null }],
      [new Response('bad json', { status: 200 }), { status: 200, code: 'INVALID_RESPONSE', retryAfter: null }],
    ];
    for (const [response, expected] of cases) {
      respond(() => response);
      await assert.rejects(api.notificationsAPI.list(), expected);
    }
    respond(() => Response.json({ conversations: [{ user_id: 2, unread: 1 }] }));
    assert.equal((await api.messagesAPI.conversations()).conversations[0].unread, 1);
    respond(() => new Response(null, { status: 204 }));
    assert.equal(await api.messagesAPI.markRead(2), null);
  });
});

test('相关读取透传 AbortSignal、相对/绝对 API_BASE 与 auth；写请求只有一次且不自动重试', async () => {
  await withAPI(async ({ api, calls, respond }) => {
    const controller = new AbortController();
    await api.notificationsAPI.list({ signal: controller.signal });
    await api.messagesAPI.conversations({ signal: controller.signal });
    await api.messagesAPI.getMessages(2, { signal: controller.signal });
    assert.deepEqual(calls.map(call => call.url), ['/api/notifications', '/api/messages/conversations', '/api/messages/2']);
    for (const { options } of calls) {
      assert.equal(options.signal, controller.signal);
      assert.equal(options.credentials, 'include');
      assert.equal(options.headers.Authorization, 'Bearer fixture-only');
    }
    const before = calls.length;
    respond(() => Response.json({ error: 'do not retry', code: 'WRITE_LIMIT' }, { status: 429, headers: { 'Retry-After': '999' } }));
    await assert.rejects(api.messagesAPI.markRead(2, { signal: controller.signal }), { code: 'WRITE_LIMIT' });
    await assert.rejects(api.messagesAPI.send(2, 'once', { signal: controller.signal }), { code: 'WRITE_LIMIT' });
    assert.equal(calls.length, before + 2);
    for (const call of calls.slice(-2)) { assert.equal(call.options.method, 'POST'); assert.equal(call.options.signal, controller.signal); }
    const abort = new DOMException('fixture abort', 'AbortError');
    respond(() => { throw abort; });
    await assert.rejects(api.notificationsAPI.list(), error => error === abort);
    respond(() => ({ status: 200, text: async () => { throw abort; } }));
    await assert.rejects(api.messagesAPI.conversations(), error => error === abort);
    controller.abort();
    await assert.rejects(api.messagesAPI.getMessages(2, { signal: controller.signal }), { name: 'AbortError' });
  });
  await withAPI(async ({ api, calls }) => {
    await api.messagesAPI.getMessages(8);
    assert.equal(calls[0].url, 'https://fixture.invalid/api/messages/8');
  }, { base: 'https://fixture.invalid' });
});

test('现有 localStorage 离线分支仍可读会话、消息及单次已读写入', async () => {
  await withAPI(async ({ api, storage, calls }) => {
    storage.set('abdl_conversations', '[{"user_id":2,"unread":3}]');
    storage.set('abdl_messages', '{"1-2":[{"id":1,"content":"offline","created_at":"2026-10-18"}]}');
    assert.equal((await api.messagesAPI.conversations()).conversations[0].unread, 3);
    assert.equal((await api.messagesAPI.getMessages(2)).messages[0].content, 'offline');
    await api.messagesAPI.markRead(2);
    assert.equal((await api.messagesAPI.conversations()).conversations[0].unread, 0);
    assert.deepEqual((await api.notificationsAPI.list()).notifications, []);
    assert.equal(calls.length, 0);
  }, { offline: true });
});

test('Vite SSR 合同：Provider 向 MessagesPage 共享 snapshot/稳定方法；不把 SSR 当 effect runtime gate', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'd1-ssr-contract-'));
  const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
  let requests = 0;
  const server = await createServer({ configFile: false, envFile: false, cacheDir,
    root: new URL('../', import.meta.url).pathname, esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, hmr: { port: 42000 + process.pid % 10000 }, proxy: {} }, appType: 'custom',
    plugins: [{ name: 'd1-contract-auth', transform(_code, id) {
      if (id.endsWith('/contexts/AuthContext.jsx')) return 'export const useAuth = () => ({ user: { id: 1 }, accounts: [{ id: 1, token: "fixture" }] });';
      if (id.endsWith('/contexts/MobileHeaderContext.jsx')) return 'export const useMobileHeaderActions = () => ({ registerActions() {} });';
    } }],
  });
  globalThis.fetch = async () => { requests++; throw new Error('SSR cannot fetch'); };
  globalThis.localStorage = { getItem: () => null };
  try {
    const { MemoryRouter } = await server.ssrLoadModule('react-router-dom');
    const { NotificationProvider, useNotifications } = await server.ssrLoadModule('/src/contexts/NotificationContext.jsx');
    const { ToastProvider } = await server.ssrLoadModule('/src/contexts/ToastContext.jsx');
    const { default: MessagesPage } = await server.ssrLoadModule('/src/pages/MessagesPage.jsx');
    let contract;
    function Probe() { contract = useNotifications(); return null; }
    const tree = React.createElement(MemoryRouter, { initialEntries: ['/messages?user=2'] }, React.createElement(ToastProvider, null,
      React.createElement(NotificationProvider, null, React.createElement(Probe), React.createElement(MessagesPage))));
    assert.match(renderToStaticMarkup(tree), /输入消息/);
    for (const method of ['refreshConversations', 'fetchMessageUnread', 'fetchUnread', 'markConversationRead', 'clearUnread']) assert.equal(typeof contract[method], 'function');
    assert.equal(contract.refreshConversations, contract.fetchMessageUnread);
    assert.deepEqual(contract.conversations, []);
    assert.equal(requests, 0, 'SSR 仅检查组件/API合同，不执行effects；真实效果在本地fixture验收');
  } finally { await server.close(); await rm(cacheDir, { recursive: true, force: true }); globalThis.fetch = originalFetch; if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage; }
});

test('实际 handler 回归：隐藏发送取消必须解锁，send 打断旧 load 失败不得卡 loading/重放写', async () => {
  const page = source('../src/pages/MessagesPage.jsx');
  const visibilityBody = /const onVisibility = \(\) => \{([\s\S]*?)\n    \};/.exec(page)?.[1];
  const sendBody = /const handleSend = async \(\) => \{([\s\S]*?)\n  \};/.exec(page)?.[1];
  assert.ok(visibilityBody); assert.ok(sendBody);
  let sending = true, loading = true;
  const controller = new AbortController();
  const context = { document: { hidden: true }, generationRef: { current: 1 }, requestRef: { current: controller }, setLoading: value => { loading = value; }, setSending: value => { sending = value; } };
  runInNewContext(`(() => {${visibilityBody}\n})()`, context);
  assert.equal(controller.signal.aborted, true); assert.equal(sending, false); assert.equal(loading, false);
  let writes = 0, errors = 0;
  const oldLoad = new AbortController();
  Object.assign(context, { input: 'once', activeUserId: '2', sending: false, sessionPaused: false, AbortController,
    requestRef: { current: oldLoad }, messagesAPI: { send: async () => { writes++; throw new Error('fixture send failed'); } },
    runWithDeadline: task => task(new AbortController().signal), showError: () => { errors++; }, setInput() {}, loadMessages: () => assert.fail('失败发送不得自动补读'), inputRef: { current: null },
  });
  loading = true;
  await runInNewContext(`(async () => {${sendBody}})()`, context);
  assert.equal(oldLoad.signal.aborted, true); assert.equal(loading, false); assert.equal(sending, false);
  assert.equal(writes, 1); assert.equal(errors, 1);
});

test('401 私有 UI 清理实际 layout handler：取消旧 load，清消息/资料/输入/发送，展示过期门控', () => {
  const page = source('../src/pages/MessagesPage.jsx');
  const body = /useLayoutEffect\(\(\) => \{([\s\S]*?)\n  \}, \[session, sessionPaused, activeUserId\]\);/.exec(page)?.[1];
  assert.ok(body);
  const privateState = { messages: ['private'], otherUser: { username: 'private' }, input: 'private', sending: true, showNewConvo: true };
  const controller = new AbortController();
  const context = { generationRef: { current: 1 }, requestRef: { current: controller } };
  for (const key of Object.keys(privateState)) context[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { privateState[key] = value; };
  runInNewContext(`(() => {${body}\n})()`, context);
  assert.equal(controller.signal.aborted, true); assert.equal(context.generationRef.current, 2);
  assert.equal(privateState.messages.length, 0); assert.equal(privateState.otherUser, null); assert.equal(privateState.input, '');
  assert.equal(privateState.sending, false); assert.equal(privateState.showNewConvo, false);
  assert.match(page, /if \(sessionPaused\) \{\s*return .*登录已过期/);
});

test('源码合同：唯一 conversations owner、稳定 effect 依赖、无新增聊天周期及保留宿主边界', () => {
  const page = source('../src/pages/MessagesPage.jsx'), provider = source('../src/contexts/NotificationContext.jsx'), hook = source('../src/notifications/useNotificationResources.js');
  assert.doesNotMatch(page, /messagesAPI\.conversations|\[user,|\[toast|toast\.error|setInterval|setTimeout/);
  assert.match(page, /const \{ error: showError \} = useToast/);
  assert.match(page, /accountSessionKey\(user, accounts\)/);
  assert.match(page, /\[session, sessionPaused, userId, showError, markConversationRead\]/);
  assert.match(hook, /const current = snapshot.session === session && !sessionPaused/);
  assert.match(page, /if \(sessionPaused\) \{\s*return .*登录已过期/);
  assert.match(provider, /\[session, sessionPaused\]/, '401 须清私有 toast 和通知基线');
  assert.match(page, /if \(document\.hidden\) \{[\s\S]*?requestRef\.current\?\.abort\(\);\s*setLoading\(false\);\s*setSending\(false\);/, '隐藏取消须清 sending；旧 finally 的 generation guard 不再负责清理');
  assert.match(page, /const handleSend = async[\s\S]*?requestRef\.current = controller;[\s\S]*?setLoading\(false\);\s*try/, 'send 接管旧 load 须清 loading，发送失败不会留下 spinner');
  assert.doesNotMatch(provider, /setInterval|messagesAPI\.conversations/);
  assert.equal((hook.match(/messagesAPI\.conversations/g) || []).length, 1);
  const app = source('../src/App.jsx'), main = source('../src/main.jsx');
  const isMobile = !source('../package.json').includes('abdl-space-client');
  assert.match(app, /if \(isMerchant(?:Route)?\) return .*MerchantHost/);
  if (isMobile) {
    assert.equal((main.match(/<NotificationProvider>/g) || []).length, 1);
    assert.doesNotMatch(app, /NotificationProvider/);
    assert.match(app, /<NsfwProvider>/, '本轮保留不相关 NSFW provider');
    assert.match(app, /if \(isAdmin\) return <>\s*<AdminRoutes/);
  } else assert.equal((app.match(/<NotificationProvider>/g) || []).length, 1);
});
