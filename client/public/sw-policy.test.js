import assert from 'node:assert/strict';
import test from 'node:test';
import './sw-policy.js';

const origin = 'https://abdl-space.top';

test('service worker ignores cross-origin, API, certificate, and authorized requests', () => {
  assert.equal(globalThis.shouldCacheRequest(new Request('https://static.cloudflareinsights.com/beacon.min.js'), origin), false);
  assert.equal(globalThis.shouldCacheRequest(new Request(`${origin}/api/v1/timelines/home`), origin), false);
  assert.equal(globalThis.shouldCacheRequest(new Request(`${origin}/c/TOKEN`), origin), false);
  assert.equal(globalThis.shouldCacheRequest(new Request(`${origin}/asset.js`, { headers: { Authorization: 'Bearer token' } }), origin), false);
});

test('service worker only caches same-origin static GET requests', () => {
  assert.equal(globalThis.shouldCacheRequest(new Request(`${origin}/assets/app.js`), origin), true);
  assert.equal(globalThis.shouldCacheRequest(new Request(`${origin}/app-icon.png`), origin), true);
  assert.equal(globalThis.shouldCacheRequest(new Request(`${origin}/assets/app.js`, { method: 'POST' }), origin), false);
});

test('service worker never caches HTML navigation or SPA routes', () => {
  assert.equal(globalThis.shouldCacheRequest(new Request(`${origin}/`, { headers: { Accept: 'text/html' } }), origin), false);
  assert.equal(globalThis.shouldCacheRequest(new Request(`${origin}/forum/61`, { headers: { Accept: 'text/html' } }), origin), false);
  assert.equal(globalThis.shouldCacheRequest(new Request(`${origin}/login`, { headers: { Accept: 'text/html' } }), origin), false);
});

import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

function cacheResponse(type, cacheControl = '', overrides = {}) {
  const response = { ok: true, type: 'basic', headers: new Headers({ 'Content-Type': type, 'Cache-Control': cacheControl }), ...overrides };
  response.clone = () => ({ ...response });
  return response;
}

test('response policy rejects HTML and XHTML even when the URL looks like a cacheable asset', () => {
  for (const path of ['/assets/app.js', '/assets/app.css', '/fallback.png']) {
    assert.equal(globalThis.shouldCacheRequest(new Request(`${origin}${path}`), origin), true, path);
    for (const type of ['text/html', 'TEXT/HTML; charset=UTF-8', 'application/xhtml+xml', 'Application/Xhtml+Xml; charset=utf-8']) {
      assert.equal(globalThis.shouldCacheResponse(cacheResponse(type, 'public, max-age=600')), false, `${path}: ${type}`);
    }
  }
});

test('response policy refuses private, no-store, errors, opaque and non-basic responses', () => {
  for (const control of ['private', 'PrIvAtE, max-age=60', 'max-age=60, PRIVATE="Set-Cookie"', 'no-store', 'public, NO-STORE, max-age=60']) {
    assert.equal(globalThis.shouldCacheResponse(cacheResponse('text/css', control)), false, control);
  }
  for (const response of [null, undefined, cacheResponse('text/css', '', { ok: false, status: 403 }), cacheResponse('text/css', '', { ok: false, status: 500 }), ...['opaque', 'opaqueredirect', 'error', 'cors', 'default'].map(type => cacheResponse('text/css', '', { type }))]) {
    assert.equal(globalThis.shouldCacheResponse(response), false);
  }
});

test('response policy still permits successful public CSS, JavaScript and other ordinary assets', () => {
  for (const type of ['text/css', 'application/javascript', 'text/javascript', 'image/png', 'font/woff2']) {
    for (const control of ['', 'public, max-age=60', 'public, max-age=31536000, immutable', 'no-cache']) {
      assert.equal(globalThis.shouldCacheResponse(cacheResponse(type, control)), true, `${type}: ${control}`);
    }
  }
});

async function workerFixture(cached, network, { offline = false, path = '/assets/app.js' } = {}) {
  const [policy, worker] = await Promise.all(['./sw-policy.js', './sw.js'].map(path => readFile(new URL(path, import.meta.url), 'utf8')));
  const listeners = new Map();
  const deleted = [];
  const writes = [];
  const fetched = [];
  const cache = {
    async match() { return cached; },
    async delete(request) { deleted.push(request); return true; },
    async put(request, response) { writes.push({ request, response }); },
  };
  runInNewContext(`${policy}\n${worker}`, {
    URL,
    self: { location: { origin }, addEventListener(name, callback) { listeners.set(name, callback); } },
    importScripts(path) { assert.equal(path, '/sw-policy.js'); },
    caches: { async open() { return cache; } },
    async fetch(request) { fetched.push(request); if (offline) throw new Error('fixture offline'); return network; },
  });
  const request = new Request(`${origin}${path}`);
  let result;
  listeners.get('fetch')({ request, respondWith(promise) { result = promise; } });
  assert.ok(result, 'asset request must enter the actual service worker fetch handler');
  return { result, request, deleted, writes, fetched };
}

test('actual service worker deletes cached HTML/XHTML and neither replays nor stores it, including offline', async () => {
  for (const type of ['text/html', 'application/xhtml+xml']) {
    const cached = cacheResponse(type);
    const network = cacheResponse(type);
    const live = await workerFixture(cached, network);
    assert.strictEqual(await live.result, network);
    assert.notStrictEqual(network, cached);
    assert.deepEqual(live.deleted, [live.request]);
    assert.deepEqual(live.writes, []);
    assert.deepEqual(live.fetched, [live.request]);
    const offline = await workerFixture(cached, null, { offline: true });
    await assert.rejects(offline.result, /fixture offline/);
    assert.deepEqual(offline.deleted, [offline.request]);
    assert.deepEqual(offline.writes, []);
  }
});

test('actual service worker replaces stale HTML with a cloned cacheable CSS or JavaScript response', async () => {
  for (const [type, path] of [['text/css', '/assets/app.css'], ['application/javascript', '/assets/app.js']]) {
    const network = cacheResponse(type, 'public, max-age=600');
    const fixture = await workerFixture(cacheResponse('text/html'), network, { path });
    assert.strictEqual(await fixture.result, network);
    assert.deepEqual(fixture.deleted, [fixture.request]);
    assert.equal(fixture.writes.length, 1);
    assert.strictEqual(fixture.writes[0].request, fixture.request);
    assert.notStrictEqual(fixture.writes[0].response, network);
    assert.equal(fixture.writes[0].response.headers.get('Content-Type'), type);
  }
});

test('actual service worker retains and replays ordinary cached assets when the network is offline', async () => {
  for (const type of ['text/css', 'application/javascript']) {
    const cached = cacheResponse(type, 'public, max-age=600');
    const fixture = await workerFixture(cached, null, { offline: true });
    assert.strictEqual(await fixture.result, cached);
    assert.deepEqual(fixture.deleted, []);
    assert.deepEqual(fixture.writes, []);
    assert.deepEqual(fixture.fetched, [fixture.request]);
  }
});
