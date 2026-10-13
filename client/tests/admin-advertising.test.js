import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('广告后台 API 契约：策略读取与保存走 /api/admin/advertising/policy', async () => {
  const server = await createServer({ configFile: false, root: new URL('../', import.meta.url).pathname, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const calls = [];
  globalThis.localStorage = { getItem: () => null };
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return Response.json({}); };
  try {
    const { adminAPI } = await server.ssrLoadModule('/src/api');
    for (const method of ['advertising', 'advertisingStats', 'advertisingAction', 'advertisingPolicy', 'updateAdvertisingPolicy']) assert.equal(typeof adminAPI[method], 'function', method);

    await adminAPI.advertisingPolicy();
    assert.match(calls.at(-1).url, /\/api\/admin\/advertising\/policy$/);
    assert.equal(calls.at(-1).options.method, undefined);

    const policy = { enabled: true, max_per_timeline: 1, min_interval_seconds: 30, ad_probability: 35, fallback_probability: 10 };
    await adminAPI.updateAdvertisingPolicy(policy);
    assert.match(calls.at(-1).url, /\/api\/admin\/advertising\/policy$/);
    assert.equal(calls.at(-1).options.method, 'PUT');
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), policy);

    await adminAPI.advertising();
    assert.match(calls.at(-1).url, /\/api\/admin\/advertising$/);
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage;
  }
});

test('广告后台页面渲染完整投放策略表单，并兼容聚合列表返回', () => {
  const page = source('../src/pages/admin/advertising.jsx');
  for (const key of ['ad_probability', 'fallback_probability', 'max_per_timeline', 'min_interval_seconds']) assert.ok(page.includes(`key: '${key}'`), key);
  assert.match(page, /开启全站广告投放/);
  assert.match(page, /adminAPI\.advertisingPolicy/);
  assert.match(page, /adminAPI\.updateAdvertisingPolicy/);
  assert.match(page, /list\?\.items \|\| list\?\.ads/);
  assert.match(page, /赞助者不会看到任何广告/);
  assert.doesNotMatch(page, /stats\?\.pending/);
  assert.doesNotMatch(page, /ac-panel|ac-stat-card|ac-message/);
});
