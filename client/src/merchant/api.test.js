import test from 'node:test';
import assert from 'node:assert/strict';
import { createMerchantAPI } from './api.js';
const info = { profile: null, merchant: null, authorized: true, active: true, is_super_admin: true, permissions: { can_manage_all: true, can_override_advertiser: true, can_edit_identity: true }, identity_required: false };
const ad = { id: 101, title: '广告', body: '内容', status: 'draft' };
const page = { items: [ad], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } };
const stats = { impressions: 2, clicks: 1, link_clicks: 1, image_views: 0, ad_navigations: 0, ad_count: 1, active_ads: 1, daily: [] };
const response = (data, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('factory 认证、base、cache、signal 与分页 query 使用独立适配器', async () => {
  let captured;
  const api = createMerchantAPI({ base: 'https://api.example.invalid/', getToken: () => 'session-token', fetcher: async (...args) => { captured = args; return response(page); } });
  assert.deepEqual(await api.ads({ q: 'a & b', status: 'draft', page: 2, limit: 10, merchant_id: 41 }), page);
  const [url, options] = captured;
  assert.equal(url, 'https://api.example.invalid/api/merchant/ads?q=a+%26+b&status=draft&page=2&limit=10&merchant_id=41');
  assert.equal(options.headers.Authorization, 'Bearer session-token'); assert.equal(options.credentials, 'include');
  assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error'); assert.ok(options.signal instanceof AbortSignal);
});
test('遵守 info / 平铺 profile / super null / 直接 ad / stats 契约', async () => {
  const values = [info, { id: 41, display_name: '企业' }, null, { profile: null }, ad, stats];
  const api = createMerchantAPI({ fetcher: async () => response(values.shift()) });
  assert.deepEqual(await api.info(), info); assert.equal((await api.profile()).display_name, '企业');
  assert.equal(await api.profile(), null); assert.deepEqual(await api.profile(), { profile: null });
  assert.deepEqual(await api.ad(101), ad); assert.deepEqual(await api.stats({ from: '2026-10-01', to: '2026-10-10' }), stats);
});
test('身份、广告、clone 和归档 canonical methods', async () => {
  const calls = [];
  const api = createMerchantAPI({ fetcher: async (url, options) => { calls.push([url, options]); return response({ ok: true }); } });
  await api.activate({ code: 'X', display_name: '企业', avatar_url: 'https://x.invalid/avatar.png' });
  await api.identity({ display_name: '企业', avatar_url: 'https://x.invalid/avatar.png' });
  await api.updateProfile({ description: '简介' }); await api.createAd({ title: '标题', body: '正文', landing_url: '', image_url: '', status: 'draft', starts_at: null, ends_at: null });
  await api.updateAd('a/b', { status: 'paused' }); await api.cloneAd(101); await api.archiveAd(101); await api.merchantStatus(41, 'suspended');
  assert.deepEqual(calls.map(([url, options]) => [url, options.method]), [
    ['/api/merchant/activate', 'POST'], ['/api/merchant/identity', 'POST'], ['/api/merchant/profile', 'PATCH'], ['/api/merchant/ads', 'POST'], ['/api/merchant/ads/a%2Fb', 'PATCH'], ['/api/merchant/ads/101/clone', 'POST'], ['/api/merchant/ads/101', 'DELETE'], ['/api/merchant/merchants/41/status', 'PATCH'],
  ]);
  assert.equal(calls[5][1].body, '{}'); assert.equal(calls[6][1].body, '{}'); assert.equal(calls[6][1].headers['Content-Type'], 'application/json'); assert.deepEqual(JSON.parse(calls[7][1].body), { status: 'suspended' });
});
test('malformed info、分页、ad 和 stats 拒绝成功伪装', async () => {
  for (const [method, value] of [['info', {}], ['ads', { items: [], pagination: { page: 1 } }], ['ad', { ad }], ['stats', { ...stats, impressions: '2' }]]) {
    const api = createMerchantAPI({ fetcher: async () => response(value) });
    await assert.rejects(() => api[method](101), /契约/);
  }
});
test('HTTP 错误保留 status/code，解析错误 inline 可重试', async () => {
  const api = createMerchantAPI({ fetcher: async () => response({ error: '企业身份已锁定', code: 'identity_locked' }, 409) });
  await assert.rejects(() => api.identity({}), error => error.status === 409 && error.code === 'identity_locked' && /锁定/.test(error.message));
  const bad = createMerchantAPI({ fetcher: async () => new Response('not-json') }); await assert.rejects(() => bad.info(), /无法解析/);
  const down = createMerchantAPI({ fetcher: async () => { throw new TypeError('offline'); } }); await assert.rejects(() => down.info(), /网络连接/);
});
test('旧 session 的响应和 mutation 被丢弃，外部 abort 与 abortAll 生效', async () => {
  let current = true; let release;
  const api = createMerchantAPI({ isCurrentSession: () => current, fetcher: () => new Promise(resolve => { release = resolve; }) });
  const promise = api.info(); current = false; release(response(info));
  await assert.rejects(promise, error => error.name === 'AbortError'); await assert.rejects(() => api.createAd({}), error => error.name === 'AbortError');
  const cancellable = createMerchantAPI({ fetcher: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })) });
  const controller = new AbortController(); const pending = cancellable.info({ signal: controller.signal }); controller.abort(); await assert.rejects(pending, error => error.name === 'AbortError');
  const all = cancellable.info(); cancellable.abortAll(); await assert.rejects(all, error => error.name === 'AbortError');
});
test('cookie-only auth 不造 token；上传复用认证并验证 URL', async () => {
  let options;
  const api = createMerchantAPI({ fetcher: async (_url, value) => { options = value; return response({ url: 'https://example.invalid/avatar.png' }); } });
  const file = new Blob(['image'], { type: 'image/png' });
  assert.equal(await api.upload(file), 'https://example.invalid/avatar.png'); assert.equal(options.headers.Authorization, undefined);
  assert.ok(options.body instanceof FormData); assert.equal(options.headers['Content-Type'], undefined);
  await assert.rejects(() => api.upload(new Blob(['x'], { type: 'text/plain' })), /10MB/);
});
