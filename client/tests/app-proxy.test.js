import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../functions/api/[[path]].js';

async function throughMainCdn(request) {
  const url = new URL(request.url);
  url.hostname = 'abdl-space-v2.pages.dev';
  const headers = new Headers(request.headers);
  const realIp = request.headers.get('CF-Connecting-IP');
  if (realIp) headers.set('X-Real-Client-IP', realIp);
  return onRequest({ request: new Request(url, { method: request.method, headers, redirect: request.redirect }) });
}

test('main-cdn and deployed Pages proxy preserve native App identity and private response headers', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url, headers: new Headers(init.headers) });
    return Response.json([{ id: 'app-update-required', content: '请更新 App' }], {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'User-Agent, X-App-Version-Code, Authorization' },
    });
  };
  try {
    const response = await throughMainCdn(new Request('https://abdl-space.top/api/v1/timelines/public?limit=20', {
      headers: {
        'User-Agent': 'MastodonAndroid/3.0.0',
        'X-App-Version-Code': '30',
        Authorization: 'Bearer fixture-token',
        'CF-Connecting-IP': '192.0.2.1',
      },
    }));
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'https://abdl-space-api.zhx589.workers.dev/api/v1/timelines/public?limit=20');
    assert.equal(seen[0].headers.get('X-App-Version-Code'), '30');
    assert.equal(seen[0].headers.get('User-Agent'), 'MastodonAndroid/3.0.0');
    assert.equal(seen[0].headers.get('Authorization'), 'Bearer fixture-token');
    assert.equal(seen[0].headers.get('X-Real-Client-IP'), '192.0.2.1');
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.equal(response.headers.get('Vary'), 'User-Agent, X-App-Version-Code, Authorization');
    assert.equal(response.headers.has('Link'), false);
    assert.deepEqual(await response.json(), [{ id: 'app-update-required', content: '请更新 App' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('main-cdn and Pages proxy do not invent App version headers for browser requests', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const headers = new Headers(init.headers);
    assert.equal(headers.get('X-App-Version-Code'), null);
    assert.equal(headers.get('User-Agent'), 'Mozilla/5.0 (Linux; Android 14) Chrome/130');
    return Response.json([{ id: 'real-post' }], { headers: { 'Cache-Control': 'public, max-age=30' } });
  };
  try {
    const response = await throughMainCdn(new Request('https://abdl-space.top/api/v1/timelines/public', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130' },
    }));
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=30');
    assert.deepEqual(await response.json(), [{ id: 'real-post' }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('legacy native requests remain identifiable without an internal version header', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const headers = new Headers(init.headers);
    assert.equal(headers.get('X-App-Version-Code'), null);
    assert.equal(headers.get('User-Agent'), 'MastodonAndroid/2.0.0');
    return Response.json([]);
  };
  try {
    const response = await throughMainCdn(new Request('https://abdl-space.top/api/v1/timelines/all', {
      headers: { 'User-Agent': 'MastodonAndroid/2.0.0', Authorization: 'Bearer fixture-token' },
    }));
    assert.equal(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
