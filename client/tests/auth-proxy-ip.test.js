import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac, randomBytes } from 'node:crypto';
import { onRequest } from '../functions/api/[[path]].js';
import { attachAuthClientIp } from '../functions/_shared/auth-client-ip.js';

const secret = randomBytes(32).toString('hex');
const time = 1793000000000;
const fakeHeaders = { 'CF-Connecting-IP': '192.0.2.8', 'X-Auth-Client-IP': '192.0.2.99', 'X-Auth-Client-Time': '1', 'X-Auth-Client-Signature': 'forged' };
const syntheticIp = '2a06:98c0:3600::103';
const authUrl = 'https://edge.example/api/auth/register';

function signedEnvelope({ ip = '198.51.100.23', method = 'POST', path = '/api/auth/register', timestamp = String(Math.floor(time / 1000) - 5), key = secret } = {}) {
  return {
    'X-Auth-Client-IP': ip,
    'X-Auth-Client-Time': timestamp,
    'X-Auth-Client-Signature': createHmac('sha256', key).update(`auth-proxy-ip:v1\n${method}\n${path}\n${timestamp}\n${ip}`).digest('hex'),
  };
}

function assertNoEnvelope(headers) {
  for (const name of ['X-Auth-Client-IP', 'X-Auth-Client-Time', 'X-Auth-Client-Signature']) assert.equal(headers.has(name), false, name);
}

function assertSignedEnvelope(headers, { ip = '198.51.100.23', path = '/api/auth/register', now = time } = {}) {
  const expected = signedEnvelope({ ip, path, timestamp: String(Math.floor(now / 1000)) });
  for (const [name, value] of Object.entries(expected)) assert.equal(headers.get(name), value, name);
}

test('valid upstream envelope preserves the real client behind synthetic CF IP and refreshes its signature', async () => {
  const envelope = signedEnvelope();
  const request = new Request(`${authUrl}///?ignored=true`, {
    method: 'POST',
    headers: { ...envelope, 'CF-Connecting-IP': syntheticIp.toUpperCase(), 'X-Real-Client-IP': '192.0.2.88', 'X-Forwarded-For': '192.0.2.89' },
  });
  const headers = new Headers(request.headers);
  await attachAuthClientIp(request, headers, secret, time);
  assertSignedEnvelope(headers);
  assert.notEqual(headers.get('X-Auth-Client-Time'), envelope['X-Auth-Client-Time']);
  assert.notEqual(headers.get('X-Auth-Client-Signature'), envelope['X-Auth-Client-Signature']);
  assert.equal(request.headers.get('X-Auth-Client-Signature'), envelope['X-Auth-Client-Signature']);
});

test('helper signs at the direct edge and verifies and refreshes the next hop with aliased headers', async () => {
  const edgeRequest = new Request(authUrl, { method: 'POST', headers: { 'CF-Connecting-IP': '2001:DB8::23' } });
  await attachAuthClientIp(edgeRequest, edgeRequest.headers, secret, time);
  assertSignedEnvelope(edgeRequest.headers, { ip: '2001:db8::23' });
  const source = new Headers(edgeRequest.headers);
  source.set('CF-Connecting-IP', syntheticIp);
  const pagesRequest = new Request(authUrl, { method: 'POST', headers: source });
  await attachAuthClientIp(pagesRequest, pagesRequest.headers, secret, time + 1000);
  assertSignedEnvelope(pagesRequest.headers, { ip: '2001:db8::23', now: time + 1000 });
});

test('valid upstream IP takes precedence over CF IP and is accepted without a CF header', async () => {
  for (const cfIp of ['192.0.2.8', undefined]) {
    const source = signedEnvelope();
    if (cfIp) source['CF-Connecting-IP'] = cfIp;
    const request = new Request(authUrl, { method: 'POST', headers: source });
    const headers = new Headers(request.headers);
    await attachAuthClientIp(request, headers, secret, time);
    assertSignedEnvelope(headers);
  }
});

test('untrusted upstream envelopes never override CF IP and leave synthetic requests unsigned', async t => {
  const timestamp = Math.floor(time / 1000);
  const valid = signedEnvelope();
  const cases = [
    ['missing envelope', {}],
    ['missing IP', { ...valid, 'X-Auth-Client-IP': '' }],
    ['missing time', { ...valid, 'X-Auth-Client-Time': '' }],
    ['missing signature', { ...valid, 'X-Auth-Client-Signature': '' }],
    ['malformed signature', { ...valid, 'X-Auth-Client-Signature': 'forged' }],
    ['invalid HMAC', { ...valid, 'X-Auth-Client-Signature': '0'.repeat(64) }],
    ['modified signed IP', { ...valid, 'X-Auth-Client-IP': '192.0.2.99' }],
    ['expired', signedEnvelope({ timestamp: String(timestamp - 31) })],
    ['future outside clock window', signedEnvelope({ timestamp: String(timestamp + 31) })],
    ['wrong method', signedEnvelope({ method: 'GET' })],
    ['wrong path', signedEnvelope({ path: '/api/auth/login' })],
    ['wrong key', signedEnvelope({ key: randomBytes(32).toString('hex') })],
    ['signed synthetic IP', signedEnvelope({ ip: syntheticIp })],
    ['signed IP with path injection', signedEnvelope({ ip: '192.0.2.99/api/auth/login' })],
    ['malformed time', signedEnvelope({ timestamp: `${timestamp}junk` })],
    ['unsafe integer time', signedEnvelope({ timestamp: '9007199254740993' })],
  ];
  for (const [name, envelope] of cases) {
    await t.test(name, async () => {
      for (const cfIp of [syntheticIp, '192.0.2.8']) {
        const request = new Request(authUrl, {
          method: 'POST',
          headers: { ...envelope, 'CF-Connecting-IP': cfIp, 'X-Real-Client-IP': '192.0.2.88', 'X-Forwarded-For': '192.0.2.89' },
        });
        const headers = new Headers(request.headers);
        await attachAuthClientIp(request, headers, secret, time);
        if (cfIp === syntheticIp) assertNoEnvelope(headers);
        else assertSignedEnvelope(headers, { ip: cfIp });
      }
    });
  }
});

test('upstream clock allowance includes both 30-second boundaries', async () => {
  for (const offset of [-30, 30]) {
    const request = new Request(authUrl, {
      method: 'POST',
      headers: { ...signedEnvelope({ timestamp: String(Math.floor(time / 1000) + offset) }), 'CF-Connecting-IP': syntheticIp },
    });
    const headers = new Headers(request.headers);
    await attachAuthClientIp(request, headers, secret, time + 999);
    assertSignedEnvelope(headers);
  }
});

test('all existing protected POST paths remain signed', async () => {
  for (const path of ['/api/auth/register', '/api/auth/login', '/api/beta/beta-register', '/api/admin/security/test-verification-code']) {
    const request = new Request(`https://edge.example${path}/?ignored=true`, {
      method: 'POST',
      headers: { ...signedEnvelope({ path }), 'CF-Connecting-IP': syntheticIp },
    });
    const headers = new Headers(request.headers);
    await attachAuthClientIp(request, headers, secret, time);
    assertSignedEnvelope(headers, { path });
  }
});

test('valid incoming envelopes are stripped for unprotected paths, methods and missing or short secrets', async () => {
  const cases = [
    ...['/api/posts', '/api/auth', '/api/beta/beta-register/extra', '/api/admin/security/test-verification-code/extra'].map(path => ({ path })),
    ...['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map(method => ({ path: '/api/auth/register', method })),
    ...[undefined, null, '', 'x'.repeat(31)].map(key => ({ path: '/api/auth/register', key })),
  ];
  for (const entry of cases) {
    const { path, method = 'POST' } = entry;
    const key = Object.hasOwn(entry, 'key') ? entry.key : secret;
    const request = new Request(`https://edge.example${path}`, {
      method,
      headers: { ...signedEnvelope({ path, method }), 'CF-Connecting-IP': '192.0.2.8' },
    });
    const headers = new Headers(request.headers);
    await attachAuthClientIp(request, headers, key, time);
    assertNoEnvelope(headers);
  }
});

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
    ['https://abdl-space.top/api/auth/register', secret, { 'X-Real-Client-IP': '192.0.2.9', 'X-Forwarded-For': '192.0.2.10' }],
    ['https://abdl-space.top/api/auth/register', secret, { 'CF-Connecting-IP': syntheticIp, 'X-Real-Client-IP': '192.0.2.9', 'X-Forwarded-For': '192.0.2.10' }],
    ['https://abdl-space.top/api/auth/register', secret, { 'CF-Connecting-IP': '192.0.2.9/api/auth/register' }],
  ]) {
    const request = new Request(url, { method: 'POST', headers: source });
    const headers = new Headers(request.headers);
    await attachAuthClientIp(request, headers, key, time);
    assert.equal(headers.has('X-Auth-Client-IP'), false);
    assert.equal(headers.has('X-Auth-Client-Time'), false);
    assert.equal(headers.has('X-Auth-Client-Signature'), false);
  }
});

test('actual Pages handler verifies and refreshes an edge envelope without altering the request body', async t => {
  const calls = [];
  t.mock.method(Date, 'now', () => time);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return Response.json({ ok: true });
  });
  const envelope = signedEnvelope();
  const request = new Request(authUrl, {
    method: 'POST',
    headers: { ...envelope, 'CF-Connecting-IP': syntheticIp, 'Content-Type': 'application/json', 'X-Real-Client-IP': '192.0.2.88' },
    body: '{"preserve":"edge → Pages → API"}',
  });
  const response = await onRequest({ request, env: { AUTH_PROXY_HMAC_KEY: secret } });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(new URL(url).pathname, '/api/auth/register');
  assert.equal(init.method, 'POST');
  assertSignedEnvelope(init.headers);
  assert.notEqual(init.headers.get('X-Auth-Client-Signature'), envelope['X-Auth-Client-Signature']);
  assert.equal(await new Response(init.body).text(), '{"preserve":"edge → Pages → API"}');
  assert.equal(JSON.stringify([...init.headers]).includes(secret), false);
  assert.equal((await response.text()).includes(secret), false);
});

test('actual Pages handler leaves unproven synthetic requests unsigned and preserves the API failure', async t => {
  const calls = [];
  t.mock.method(Date, 'now', () => time);
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls.push(init);
    return Response.json({ error: 'Trusted client IP unavailable' }, { status: 503 });
  });
  const request = new Request(authUrl, {
    method: 'POST',
    headers: { ...fakeHeaders, 'CF-Connecting-IP': syntheticIp, 'X-Real-Client-IP': '192.0.2.88', 'X-Forwarded-For': '192.0.2.89' },
    body: '{"preserve":true}',
  });
  const response = await onRequest({ request, env: { AUTH_PROXY_HMAC_KEY: secret } });
  assert.equal(calls.length, 1);
  assertNoEnvelope(calls[0].headers);
  assert.equal(await new Response(calls[0].body).text(), '{"preserve":true}');
  assert.equal(response.status, 503);
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
