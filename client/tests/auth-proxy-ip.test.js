import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, randomBytes } from 'node:crypto';
import { onRequest } from '../functions/api/[[path]].js';
import { attachAuthClientIp } from '../functions/_shared/auth-client-ip.js';

const secret = randomBytes(32).toString('hex');
const time = 1793000000000;
const fakeHeaders = { 'CF-Connecting-IP': '192.0.2.8', 'X-Auth-Client-IP': '192.0.2.99', 'X-Auth-Client-Time': '1', 'X-Auth-Client-Signature': 'forged' };

test('proxy replaces caller-controlled envelopes with path-bound trusted edge IP signatures', async () => {
  const request = new Request('https://abdl-space.top/api/auth/register/?ignored=true', { method: 'POST', headers: fakeHeaders });
  const headers = new Headers(request.headers);
  await attachAuthClientIp(request, headers, secret, time);
  assert.equal(headers.get('X-Auth-Client-IP'), '192.0.2.8');
  assert.equal(headers.get('X-Auth-Client-Time'), '1793000000');
  const expected = createHmac('sha256', secret).update('auth-proxy-ip:v1\nPOST\n/api/auth/register\n1793000000\n192.0.2.8').digest('hex');
  assert.equal(headers.get('X-Auth-Client-Signature'), expected);
});

test('missing secret, unprotected path and missing trusted IP strip rather than preserve forged envelopes', async () => {
  for (const [url, key, source] of [
    ['https://abdl-space.top/api/auth/register', undefined, fakeHeaders],
    ['https://abdl-space.top/api/posts', secret, fakeHeaders],
    ['https://abdl-space.top/api/auth/register', secret, { 'X-Forwarded-For': '192.0.2.9', 'X-Auth-Client-IP': '192.0.2.10' }],
  ]) {
    const request = new Request(url, { method: 'POST', headers: source });
    const headers = new Headers(request.headers);
    await attachAuthClientIp(request, headers, key, time);
    assert.equal(headers.has('X-Auth-Client-IP'), false);
    assert.equal(headers.has('X-Auth-Client-Time'), false);
    assert.equal(headers.has('X-Auth-Client-Signature'), false);
  }
});

test('actual Pages handler signs upstream registration without exposing secrets or altering body', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return Response.json({ ok: true });
  });
  const request = new Request('https://abdl-space.top/api/auth/register', { method: 'POST', headers: { ...fakeHeaders, 'Content-Type': 'application/json' }, body: '{"synthetic":true}' });
  const response = await onRequest({ request, env: { AUTH_PROXY_HMAC_KEY: secret } });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(new URL(url).pathname, '/api/auth/register');
  assert.equal(init.headers.get('X-Auth-Client-IP'), '192.0.2.8');
  const stamp = init.headers.get('X-Auth-Client-Time');
  assert.equal(init.headers.get('X-Auth-Client-Signature'), createHmac('sha256', secret).update(`auth-proxy-ip:v1\nPOST\n/api/auth/register\n${stamp}\n192.0.2.8`).digest('hex'));
  assert.equal(await new Response(init.body).text(), '{"synthetic":true}');
  assert.equal(JSON.stringify([...init.headers]), JSON.stringify([...init.headers]).replaceAll(secret, 'not-expected'));
  assert.equal((await response.text()).includes(secret), false);
});
