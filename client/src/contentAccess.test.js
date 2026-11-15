import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContentAccessStore, readContentAccess, isEssentialContentPath, VERIFICATION_PATH, CONTENT_REQUIRED_MESSAGE } from './contentAccess.js';
const value = state => ({ schema_version: 1, state, action_path: VERIFICATION_PATH, message: 'PRIVATE_REGION_REASON_NEVER_ECHO' });
const request = state => async () => Response.json(value(state));
const required = () => Response.json({ code: 'baby_verification_required' }, { status: 403, headers: { 'X-ABDL-Content-Access': 'v1:required' } });

test('schema1 + 固定跳转；服务器普通用户原因或任意 URL 不回显', () => {
  assert.deepEqual(readContentAccess(value('baby_verification_required')), { state: 'baby_verification_required', action_path: VERIFICATION_PATH, message: CONTENT_REQUIRED_MESSAGE });
  for (const patch of [{ schema_version: 2 }, { state: 'required' }, { action_path: 'https://evil.test' }, { message: null }]) assert.throws(() => readContentAccess({ ...value('open'), ...patch }));
});
test('必要认证/安全/验证/订单路径保留，非必要内容与相似路径不豁免', () => {
  for (const path of ['/login', '/account', '/settings', VERIFICATION_PATH, '/baby-verification', '/sponsors', '/orders/own', '/oauth/authorize', '/auth/nbw/callback', '/admin/app-clients']) assert.equal(isEssentialContentPath(path), true, path);
  for (const path of ['/', '/forum/1', '/search', '/merchant', '/profile/1', '/sponsors/thanks', '/settings/baby-verification-evil', '/administer', '/oauth-evil']) assert.equal(isEssentialContentPath(path), false, path);
});
test('pending 首次确认，404/损坏/离线均 unavailable，不伪造 off/open', async () => {
  for (const fetcher of [async () => new Response('', { status: 404 }), async () => Response.json({}), async () => { throw new Error('PRIVATE'); }]) {
    const store = createContentAccessStore(); assert.equal(store.getSnapshot().state, 'pending'); await store.load('session', fetcher); assert.equal(store.getSnapshot().state, 'unavailable'); assert.doesNotMatch(store.getSnapshot().message, /PRIVATE/);
  }
  const calls = [], store = createContentAccessStore(); await store.load('session', async (path, options) => { calls.push({ path, options }); return Response.json(value('open')); }); assert.equal(store.getSnapshot().state, 'open'); assert.equal(calls[0].path, '/api/access'); assert.equal(calls[0].options.credentials, 'include'); assert.equal(calls[0].options.cache, 'no-store'); assert.equal(calls[0].options.redirect, 'error');
});
test('只认可现有受保护 API 的精确 status+header+code，不监听随机 body/code/第三方或必要 API', async () => {
  const store = createContentAccessStore(); await store.load('s', request('open'));
  const cases = [[new Response('', { status: 403 }), { code: 'baby_verification_required' }, '/api/posts'], [required(), { code: 'OTHER' }, '/api/posts'], [required(), { code: 'baby_verification_required' }, 'https://foreign.test/api/posts'], [required(), { code: 'baby_verification_required' }, '/api/admin/policy'], [required(), { code: 'baby_verification_required' }, '/api/v1/sponsors/payment-orders/own'], [required(), { code: 'baby_verification_required' }, '/api/webauthn/credentials']];
  for (const args of cases) { assert.equal(store.observe(...args, store.getEpoch()), null); assert.equal(store.getSnapshot().state, 'open'); }
  const before = store.getEpoch(); const error = store.observe(required(), { code: 'baby_verification_required', message: 'PRIVATE_REGION' }, '/api/v1/sponsors/thanks', before);
  assert.equal(error.code, 'baby_verification_required'); assert.equal(error.message, CONTENT_REQUIRED_MESSAGE); assert.equal(store.getSnapshot().state, 'baby_verification_required'); assert.throws(() => store.assertCache()); assert.throws(() => store.assertResponse('/api/posts', before));
  store.assertResponse('/api/v1/sponsors/me', before);
});
test('切换会话中止旧 access，晚到 open 不可覆盖新 required；普通轮询不废弃内容请求代次', async () => {
  const store = createContentAccessStore(); let resolve, signal;
  const held = store.load('old', async (path, options) => { signal = options.signal; return new Promise(yes => { resolve = yes; }); }); store.reset(); assert.equal(signal.aborted, true);
  await store.load('new', request('baby_verification_required')); resolve(Response.json(value('open'))); await held; assert.equal(store.getSnapshot().key, 'new'); assert.equal(store.getSnapshot().state, 'baby_verification_required');
  await store.load('new', request('open')); const epoch = store.getEpoch(); await store.load('new', request('open')); assert.equal(store.getEpoch(), epoch);
});
test('React 在真实内容 providers 之前 gate，双 route 固定，未添加 localStorage 或全局 fetch 拦截', () => {
  const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8'); assert.ok(app.indexOf('if (contentGate)') < app.indexOf('<NsfwProvider>')); assert.match(app, /path="\/settings\/baby-verification" element=\{<BabyVerificationStatus/);
  const source = readFileSync(new URL('./contentAccess.js', import.meta.url), 'utf8'); assert.doesNotMatch(source, /localStorage|window\.fetch\s*=/);
});
