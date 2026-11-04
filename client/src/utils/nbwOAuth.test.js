import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { NBW_BACKUP_ORIGIN as B, NBW_PRIMARY_ORIGIN as P, adoptNBWEndpoints, getNBWEndpointState } from './nbwEndpoints.js';
import { bindNBWAccount, exchangeNBWCode, getNBWOAuthStatus, initNBWConfig, nbwRegistrationFields, readNBWAuthorization, startNBWBind, startNBWOAuth, verifyNBWState, whenNBWReady } from './nbwOAuth.js';

const snapshot = (mode = 'backup', revision = 'oauth-1', remote_mode = 'full') => ({ schema_version: 1, revision, mode, api_origin: mode === 'primary' ? P : B, authorize_origin: mode === 'primary' ? P : B, public_origin: mode === 'primary' ? P : B, media_origin: mode === 'primary' ? P : B, ttl_seconds: 30, remote_mode });
const authorization = (state, origin = 'https://abdl-space.top', endpoints = snapshot()) => ({ client_id: 'fixture-client', redirect_uri: `${origin}/auth/nbw/callback`, endpoints, authorization_url: `${endpoints.authorize_origin}/oauth/authorize.php?${new URLSearchParams({ client_id: 'fixture-client', redirect_uri: `${origin}/auth/nbw/callback`, response_type: 'code', state })}`, oauth_context: 'opaque.fixture-context', expires_in: 600 });
const savedGlobals = Object.fromEntries(['window', 'document', 'sessionStorage', 'localStorage', 'crypto'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalFetch = globalThis.fetch;
let storage, calls, navigation, origin;
const pending = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function installOrigin(value) {
  origin = value;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { location: { origin, hostname: new URL(origin).hostname, assign: url => navigation.push(url) } }) });
}
test.beforeEach(() => {
  storage = new Map(); calls = []; navigation = [];
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === 'abdl_accounts' ? JSON.stringify([{ id: 7, token: 'fixture-session' }]) : '7' } });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: Object.assign(new EventTarget(), { visibilityState: 'visible' }) });
  installOrigin('https://abdl-space.top');
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    const state = new URL(url, origin).searchParams.get('state');
    if (url === '/api/nbw/endpoints') return Response.json(snapshot());
    if (url === '/api/auth/nbw/config') return Response.json({ client_id: 'fixture-client', redirect_uri: `${origin}/auth/nbw/callback` });
    if (state) return Response.json(authorization(state, origin));
    return Response.json({ action: 'login' });
  };
});
test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const [key, descriptor] of Object.entries(savedGlobals)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; }
});

test('主/m新授权每次fresh config state，导航仅server backup URL，保持callback同origin和sessionStorage', async () => {
  for (const value of ['https://abdl-space.top', 'https://m.abdl-space.top']) {
    installOrigin(value);
    for (const start of [startNBWOAuth, startNBWBind]) {
      await start();
      const transaction = JSON.parse(storage.get('nbw_oauth_transaction'));
      assert.equal(transaction.origin, value); assert.equal(transaction.context, 'opaque.fixture-context'); assert.equal(transaction.bind, start === startNBWBind);
      assert.equal(transaction.state, storage.get('nbw_oauth_state')); assert.match(transaction.state, /^[A-Za-z0-9_-]{16,128}$/);
      assert.equal(transaction.state.startsWith('m_'), value.includes('//m.'));
      const url = new URL(navigation.at(-1)); assert.equal(url.origin, B); assert.equal(url.searchParams.get('redirect_uri'), `${value}/auth/nbw/callback`); assert.equal(url.searchParams.get('state'), transaction.state);
      assert.equal(calls.at(-1).options.cache, 'no-store'); assert.equal(calls.at(-1).options.referrerPolicy, 'strict-origin-when-cross-origin'); assert.equal(calls.at(-1).options.headers.Origin, undefined);
    }
  }
  assert.equal(navigation.length, 4); assert.equal(calls.length, 4);
  assert.equal(new Set(calls.map(call => new URL(call.url, origin).searchParams.get('state'))).size, 4);
});

test('永久旧config已移除：配置短缓存失败后可重试，前台刷新可观察能力变更', async () => {
  await whenNBWReady({ force: true }); assert.equal(getNBWOAuthStatus().available, true);
  const before = calls.length; await whenNBWReady(); assert.equal(calls.length, before);
  globalThis.fetch = async () => Response.json({ error: 'PRIVATE', code: 'NBW_ENDPOINTS_UNAVAILABLE' }, { status: 503 });
  assert.equal(await whenNBWReady({ force: true }), null); assert.equal(getNBWOAuthStatus().available, false); assert.equal(getNBWEndpointState().endpoints, null);
  globalThis.fetch = async url => url.includes('/endpoints') ? Response.json(snapshot('backup', 'recovery', 'read_only')) : Response.json({ client_id: 'fixture-client', redirect_uri: `${origin}/auth/nbw/callback` });
  await whenNBWReady({ force: true }); assert.equal(getNBWOAuthStatus().available, false);
  globalThis.fetch = async url => url.includes('/endpoints') ? Response.json(snapshot('backup', 'full-again')) : Response.json({ client_id: 'fixture-client', redirect_uri: `${origin}/auth/nbw/callback` });
  await whenNBWReady({ force: true }); assert.equal(getNBWOAuthStatus().available, true);
});

test('主域dead切backup后不再authorize primary；中途切host后callback携原opaque context不改主机', async () => {
  adoptNBWEndpoints(snapshot('primary', 'before-switch'));
  await startNBWOAuth(); assert.equal(new URL(navigation[0]).origin, B);
  const state = storage.get('nbw_oauth_state');
  adoptNBWEndpoints(snapshot('primary', 'mid-oauth-switch'));
  assert.equal(verifyNBWState(state), true); assert.equal(verifyNBWState('incorrect-state-000'), false);
  assert.ok(storage.has('nbw_oauth_state'));
  await exchangeNBWCode('fixture-code', state);
  const request = calls.at(-1); assert.equal(request.url, '/api/auth/nbw/callback');
  assert.deepEqual(JSON.parse(request.options.body), { code: 'fixture-code', state, oauth_context: 'opaque.fixture-context' });
  assert.equal(request.options.headers.Authorization, 'Bearer fixture-session');
  assert.equal(storage.has('nbw_oauth_state'), false); assert.equal(storage.has('nbw_oauth_transaction'), false);
  const before = calls.length; await assert.rejects(exchangeNBWCode('fixture-code', state), { code: 'NBW_OAUTH_CONTEXT_INVALID' }); assert.equal(calls.length, before);
});

test('绑定与登录flow不能互换，错state不消费，成功POST带state/context且只发一次', async () => {
  await startNBWBind(); const state = storage.get('nbw_oauth_state');
  await assert.rejects(exchangeNBWCode('fixture-code', state), { code: 'NBW_OAUTH_CONTEXT_INVALID' }); assert.ok(storage.has('nbw_oauth_state'));
  await assert.rejects(bindNBWAccount('fixture-code', 'wrong-but-long-state'), { code: 'NBW_OAUTH_CONTEXT_INVALID' });
  await bindNBWAccount('fixture-code', state);
  assert.equal(calls.at(-1).url, '/api/auth/nbw/bind'); assert.equal(JSON.parse(calls.at(-1).options.body).state, state);
});

test('context缺失/错origin/超时/损坏禁止降code-only；legacy部署前旧state有界primary兼容', async () => {
  for (const mutate of [() => storage.delete('nbw_oauth_transaction'), tx => { tx.origin = 'https://m.abdl-space.top'; }, tx => { tx.expiresAt = Date.now() - 1; }, tx => { tx.context = ''; }, tx => { tx.state = 'bad'; }]) {
    await startNBWOAuth(); const state = storage.get('nbw_oauth_state'), tx = JSON.parse(storage.get('nbw_oauth_transaction'));
    mutate(tx); if (storage.has('nbw_oauth_transaction')) storage.set('nbw_oauth_transaction', JSON.stringify(tx));
    const before = calls.length; await assert.rejects(exchangeNBWCode('fixture-code', state)); assert.equal(calls.length, before);
  }
  storage.clear(); const legacyState = 'a'.repeat(32); storage.set('nbw_oauth_state', legacyState);
  await exchangeNBWCode('legacy-fixture-code', legacyState);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { code: 'legacy-fixture-code' });
});

test('新config严格schema+allowlist+params+callback：攻击host/重复state/多字段一律拒绝', () => {
  const state = 'nbw1_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const good = authorization(state);
  for (const patch of [{ expires_in: 601 }, { oauth_context: 'x'.repeat(4097) }, { extra: 'private' }, { authorization_url: good.authorization_url.replace(B, 'https://evil.invalid') }, { authorization_url: good.authorization_url.replace(B, `${B}:443`) }, { authorization_url: good.authorization_url.replace('nbw.abdlcalendar.top', '%6ebw.abdlcalendar.top') }, { authorization_url: `${good.authorization_url}&state=${state}` }, { authorization_url: good.authorization_url.replace('/oauth/authorize.php', '/oauth/token.php') }, { authorization_url: `${good.authorization_url}#hash` }, { redirect_uri: 'https://m.abdl-space.top/auth/nbw/callback' }, { endpoints: { ...snapshot(), schema_version: 2 } }]) {
    assert.throws(() => readNBWAuthorization({ ...good, ...patch }, state, origin), error => error.code === 'NBW_INVALID_RESPONSE');
  }
});

test('read_only/local_only禁授权，坏配置/旧2field响应/上游错误不跳primary或无context重试', async () => {
  for (const body of [{ client_id: 'old-client', redirect_uri: `${origin}/auth/nbw/callback` }, { error: 'PRIVATE', code: 'NBW_OAUTH_CONTEXT_INVALID' }]) {
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(startNBWOAuth()); assert.equal(navigation.length, 0);
  }
  for (const remote of ['read_only', 'local_only']) {
    globalThis.fetch = async url => Response.json(authorization(new URL(url, origin).searchParams.get('state'), origin, snapshot('backup', `mode-${remote}`, remote)));
    await assert.rejects(startNBWOAuth(), { code: 'NBW_REMOTE_DISABLED' }); assert.equal(navigation.length, 0);
  }
});

test('POST上下文错误/网络超时均不重发code或静默降旧协议，原始error正文不回显', async () => {
  await startNBWOAuth(); const state = storage.get('nbw_oauth_state'); let posts = 0;
  globalThis.fetch = async () => { posts++; return Response.json({ error: 'PRIVATE_SECRET_CODE', code: 'NBW_OAUTH_CONTEXT_CONSUMED' }, { status: 409 }); };
  await assert.rejects(exchangeNBWCode('fixture-code', state), error => error.code === 'NBW_OAUTH_CONTEXT_CONSUMED' && !String(error).includes('PRIVATE_SECRET_CODE'));
  await assert.rejects(exchangeNBWCode('fixture-code', state)); assert.equal(posts, 1);
});

test('并发start单请求；会话/endpointrevision变更丢弃旧config，不发旧authorize', async () => {
  const config = pending(); let count = 0;
  globalThis.fetch = async url => { count++; const state = new URL(url, origin).searchParams.get('state'); await config.promise; return Response.json(authorization(state)); };
  const old = startNBWOAuth(); await startNBWOAuth(); assert.equal(count, 1);
  adoptNBWEndpoints(snapshot('backup', 'new-generation'));
  config.resolve(); await assert.rejects(old, { code: 'NBW_ENDPOINT_CHANGED' }); assert.equal(navigation.length, 0);
});

test('App生命周期只有一计时器并cleanup，focus/visibility可刷新，图片hook无fetch', async () => {
  await whenNBWReady({ force: true });
  const set = globalThis.setInterval, clear = globalThis.clearInterval; let intervals = 0, cleared = 0;
  globalThis.setInterval = (_fn, delay) => { assert.equal(delay, 30000); intervals++; return 71; };
  globalThis.clearInterval = id => { assert.equal(id, 71); cleared++; };
  try { const cleanup = initNBWConfig(); window.dispatchEvent(new Event('auth-session-changing')); cleanup(); assert.equal(intervals, 1); assert.equal(cleared, 1); }
  finally { globalThis.setInterval = set; globalThis.clearInterval = clear; }
  const hook = readFileSync(new URL('./useNBWEndpoints.js', import.meta.url), 'utf8');
  assert.doesNotMatch(hook, /fetch\(|setInterval|MutationObserver/);
});

test('注册token/code上下文最小透传不接受upstream token/host注入、不改普通邮箱与验证码字段', () => {
  assert.deepEqual(nbwRegistrationFields({ email: 'person@example.invalid', code: '123456', captchaToken: 'proof' }), {});
  assert.deepEqual(nbwRegistrationFields({ nbw_token: 'signed.fixture-bind-token', access_token: 'untrusted', host: 'evil.invalid' }), { nbw_token: 'signed.fixture-bind-token' });
  const code = { nbw_code: 'fixture-code', nbw_state: 'abcdefghijklmnop', nbw_oauth_context: 'signed.context' };
  assert.deepEqual(nbwRegistrationFields(code), code);
  for (const invalid of [{ nbw_token: '' }, { nbw_token: 'a', nbw_code: 'b' }, { nbw_code: 'a', nbw_state: 'abcdefghijklmnop' }, { nbw_state: 'abcdefghijklmnop', nbw_oauth_context: 'c' }, { nbw_token: 'x'.repeat(4097) }]) assert.throws(() => nbwRegistrationFields(invalid));
  const api = readFileSync(new URL('../api.js', import.meta.url), 'utf8'), context = readFileSync(new URL('../contexts/AuthContext.jsx', import.meta.url), 'utf8'), page = readFileSync(new URL('../pages/Register.jsx', import.meta.url), 'utf8');
  for (const source of [api, context]) assert.match(source, /email, password, username, code, invite_code: inviteCode, \.\.\.nbwRegistrationFields\(nbw\)/);
  assert.match(page, /if \(!codeSent \|\| code.length < 6\)/); assert.match(page, /if \(!regVerified\)/); assert.match(page, /captchaToken: regTokenRef.current \|\| undefined/);
  assert.match(context, /headers\['X-Captcha-Token'\] = captchaToken/);
});
