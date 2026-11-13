import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('广告后台实际 API：GET 列表/统计/策略、PUT 完整策略、PATCH 双向状态均沿用鉴权与 JSON', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../', import.meta.url).pathname, define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const calls = [];
  globalThis.localStorage = { getItem: key => key === 'abdl_accounts' ? JSON.stringify([{ id: 7, token: 'advertising-memory-only' }]) : key === 'abdl_active_account' ? '7' : null };
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return Response.json({}); };
  try {
    const { adminAPI } = await server.ssrLoadModule('/src/api');
    for (const method of ['advertising', 'advertisingStats', 'advertisingAction', 'advertisingPolicy', 'updateAdvertisingPolicy']) assert.equal(typeof adminAPI[method], 'function', method);
    for (const [method, path] of [['advertising', '/api/admin/advertising'], ['advertisingStats', '/api/admin/advertising/stats'], ['advertisingPolicy', '/api/admin/advertising/policy']]) {
      await adminAPI[method]();
      assert.equal(calls.at(-1).url, path);
      assert.equal(calls.at(-1).options.method, undefined);
    }
    const policy = { enabled: false, max_per_timeline: 0, min_interval_seconds: 86400, ad_probability: 100, fallback_probability: 0 };
    await adminAPI.updateAdvertisingPolicy(policy);
    assert.equal(calls.at(-1).url, '/api/admin/advertising/policy');
    assert.equal(calls.at(-1).options.method, 'PUT');
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), policy);
    for (const [action, status] of [['approve', 'active'], ['disable', 'paused']]) {
      await adminAPI.advertisingAction('id / fixture', action);
      const call = calls.at(-1);
      assert.equal(call.url, '/api/admin/advertising/ads/id%20%2F%20fixture');
      assert.equal(call.options.method, 'PATCH');
      assert.deepEqual(JSON.parse(call.options.body), { status });
    }
    for (const call of calls) {
      assert.equal(call.options.credentials, 'include');
      assert.equal(call.options.headers.Authorization, 'Bearer advertising-memory-only');
      assert.equal(call.options.headers['Content-Type'], 'application/json');
    }
    for (const status of [401, 403, 422, 503]) {
      globalThis.fetch = async () => Response.json({ error: 'fixture advertising unavailable' }, { status });
      await assert.rejects(adminAPI.advertisingAction(9, 'disable'), error => error.status === status && /fixture advertising unavailable/.test(error.message));
    }
    globalThis.fetch = async () => new Response('<html>not JSON</html>', { status: 200 });
    await assert.rejects(adminAPI.updateAdvertisingPolicy(policy), /响应异常|JSON|解析/);
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage;
  }
});

test('广告页不再以默认值 / 聚合 Promise.all 掩盖失败，列表筛选仅作用于已读快照', () => {
  const page = source('../src/pages/admin/advertising.jsx');
  for (const key of ['ad_probability', 'fallback_probability', 'max_per_timeline', 'min_interval_seconds']) assert.ok(page.includes(`key: '${key}'`), key);
  assert.match(page, /raw\?\.items \?\? raw\?\.ads/);
  assert.match(page, /useAdvertisingResource\(readPolicy, parsePolicy\)/);
  assert.match(page, /adminAPI\.updateAdvertisingPolicy/);
  assert.match(page, /parseAdReceipt\(await adminAPI\.advertisingAction/);
  assert.match(page, /赞助者不会看到任何广告/);
  assert.match(page, /aria-pressed=\{filter === value\}/);
  assert.match(page, /ac-mobile-only/);
  assert.match(page, /ac-desktop-only/);
  assert.doesNotMatch(page, /POLICY_DEFAULT|Promise\.all|normalizePolicy|toast\.success\(next\.enabled/);
  assert.doesNotMatch(page, /stats\?\.pending|ac-panel|ac-stat-card|ac-message/);
});
