import test from 'node:test';
import assert from 'node:assert/strict';
import { request as rawRequest } from 'node:http';
import { createNBWBrowserFixture } from './nbw-browser-fixture-server.js';

async function localFixture(run) {
  const fixture = await createNBWBrowserFixture({ ui: false });
  await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.server.address().port}`;
  const request = async (path, body, headers = {}) => {
    const response = await fetch(base + path, { headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  try { await run({ base, request }); } finally { await fixture.close(); }
}

test('fixture deny-external CSP、无proxy/未知API404，不接受非loopback/跨Origin', async () => {
  await localFixture(async ({ base, request }) => {
    const initial = await request('/api/nbw/endpoints'); assert.equal(initial.status, 200); assert.equal(Object.keys(initial.data).length, 9); assert.equal(initial.data.mode, 'backup');
    assert.equal(initial.headers.get('cache-control'), 'no-store'); assert.match(initial.headers.get('vary'), /Origin, Referer/);
    const csp = initial.headers.get('content-security-policy'); assert.match(csp, /connect-src 'self'/); assert.match(csp, /img-src 'self' data: blob:/); assert.match(csp, /frame-src 'none'/); assert.ok(!csp.includes('newbabyworld'));
    assert.equal((await request('/api/production-unknown')).status, 404); assert.equal((await request('/oauth/unknown')).status, 404);
    assert.equal((await request('/api/nbw/endpoints', null, { Origin: 'https://evil.invalid' })).status, 403);
    const badHost = await new Promise((resolve, reject) => { const req = rawRequest(base + '/api/nbw/endpoints', { headers: { Host: 'api.abdl-space.top' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); }); req.on('error', reject); req.end(); });
    assert.equal(badHost, 403);
    assert.equal((await request('/__fixture/nbw/control', { mode: 'evil.invalid', secret: 'PRIVATE' })).status, 422);
    const oversized = await fetch(base + '/__fixture/nbw/control', { method: 'POST', body: 'x'.repeat(16385) }); assert.equal(oversized.status, 413);
  });
});

test('fixture同源GET无Origin走可信Referer，非法Origin不得fallback，新config和callback同snapshot', async () => {
  await localFixture(async ({ base, request }) => {
    const state = 'nbw1_fixture_browser_0123456789';
    const path = `/api/auth/nbw/config?state=${state}`;
    assert.equal((await request(path)).status, 400);
    assert.equal((await request(path, null, { Origin: 'https://evil.invalid', Referer: `${base}/__fixture/nbw` })).status, 403);
    const config = await request(path, null, { Referer: `${base}/__fixture/nbw` });
    assert.equal(config.status, 200); assert.equal(Object.keys(config.data).length, 6); assert.equal(new URL(config.data.authorization_url).origin, 'https://nbw.abdlcalendar.top'); assert.equal(config.data.redirect_uri, `${base}/auth/nbw/callback`);
    await request('/__fixture/nbw/control', { mode: 'primary' });
    const body = { code: 'fixture-code-123', state, oauth_context: config.data.oauth_context };
    const callback = await request('/api/auth/nbw/callback', body); assert.equal(callback.status, 200); assert.equal(callback.data.action, 'choose');
    assert.equal((await request('/api/auth/nbw/callback', body)).status, 409);
    const records = await request('/__fixture/nbw/control');
    assert.ok(records.data.events.some(event => event.source === 'Referer'));
    assert.ok(records.data.events.some(event => event.pinned_mode === 'backup' && event.current_mode === 'primary'));
    assert.ok(!JSON.stringify(records.data.events).includes('fixture-code-123'));
  });
});

test('fixture按钮对应hold/release保持旧authorization响应，revision前后快照分离且无真实NBW请求', async () => {
  await localFixture(async ({ base, request }) => {
    await request('/__fixture/nbw/control', { hold_authorization: true });
    let resolved = false;
    const config = request('/api/auth/nbw/config?state=nbw1_hold_browser_0123456789', null, { Referer: `${base}/__fixture/nbw` }).then(result => { resolved = true; return result; });
    let waiting;
    for (let i = 0; i < 20; i++) { waiting = await request('/__fixture/nbw/control'); if (waiting.data.waiting === 1) break; await new Promise(resolve => setTimeout(resolve, 5)); }
    assert.equal(waiting.data.waiting, 1); assert.equal(resolved, false);
    await request('/__fixture/nbw/control', { mode: 'primary' });
    await request('/__fixture/nbw/control', { release_authorization: true });
    const result = await config; assert.equal(result.data.endpoints.mode, 'backup'); assert.equal((await request('/api/nbw/endpoints')).data.mode, 'primary');
    await request('/__fixture/nbw/control', { scenario: 'unavailable' }); assert.equal((await request('/api/nbw/endpoints')).status, 503);
  });
});
