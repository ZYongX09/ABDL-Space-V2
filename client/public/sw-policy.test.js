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
  assert.equal(globalThis.shouldCacheRequest(new Request(`${origin}/assets/app.js`, { method: 'POST' }), origin), false);
});
