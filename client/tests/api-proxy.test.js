import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { onRequest } from '../functions/api/[[path]].js';

const site = 'https://abdl-space.top';
const origin = 'https://browser.example';

// Node 的 Response 不支持 101；这里只检查构造契约，真实升级另用 workerd 验证。
test('proxy response reconstruction retains the upstream WebSocket without accepting it', async t => {
  const socket = Object.freeze({});
  const upstream = {
    status: 101,
    statusText: 'Switching Protocols',
    headers: new Headers({ Upgrade: 'websocket', 'Sec-WebSocket-Protocol': 'presence', 'X-Upstream': 'upgrade' }),
    body: null,
    webSocket: socket,
  };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init });
    return upstream;
  });
  t.mock.method(globalThis, 'Response', function (body, init) {
    return { body, ...init };
  });
  const response = await onRequest({ request: new Request(`${site}/api/ws?channel=presence`, {
    headers: {
      Upgrade: 'websocket', Origin: origin, Cookie: 'session=fixture', Authorization: 'Bearer fixture',
      'Sec-WebSocket-Protocol': 'presence', 'X-Auth-Client-IP': '192.0.2.99',
      'X-Auth-Client-Time': '1', 'X-Auth-Client-Signature': 'forged',
    },
  }) });
  assert.equal(response.status, 101);
  assert.equal(response.statusText, upstream.statusText);
  assert.equal(response.body, null);
  assert.strictEqual(response.webSocket, socket);
  assert.equal(response.headers.get('Upgrade'), 'websocket');
  assert.equal(response.headers.get('Sec-WebSocket-Protocol'), 'presence');
  assert.equal(response.headers.get('X-Upstream'), 'upgrade');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://abdl-space-api.zhx589.workers.dev/api/ws?channel=presence');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.body, undefined);
  for (const [name, value] of Object.entries({
    Upgrade: 'websocket', Origin: origin, Cookie: 'session=fixture', Authorization: 'Bearer fixture',
    'Sec-WebSocket-Protocol': 'presence', 'X-Forwarded-Host': new URL(site).host, 'X-Forwarded-Proto': 'https',
  })) assert.equal(calls[0].init.headers.get(name), value, name);
  for (const name of ['X-Auth-Client-IP', 'X-Auth-Client-Time', 'X-Auth-Client-Signature']) {
    assert.equal(calls[0].init.headers.has(name), false, name);
  }
});

test('ordinary HTTP remains streaming and retains end-to-end headers and upstream CORS', async t => {
  let controller;
  const body = new ReadableStream({ start(value) { controller = value; } });
  const upstream = new Response(body, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': 'text/plain', 'Cache-Control': 'private, no-store', Vary: 'Origin, Authorization',
      'Set-Cookie': 'session=fixture; Secure; HttpOnly', 'Content-Range': 'bytes 0-10/11',
      'Content-Encoding': 'identity', 'Content-Length': '11', Connection: 'keep-alive', 'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': 'https://upstream.example', 'Access-Control-Allow-Credentials': 'true',
    },
  });
  t.mock.method(globalThis, 'fetch', async () => upstream);
  const response = await onRequest({ request: new Request(`${site}/api/stream`, { headers: { Origin: origin } }) });
  assert.equal(response.status, 206);
  assert.equal(response.statusText, 'Partial Content');
  assert.strictEqual(response.body, upstream.body);
  assert.equal(upstream.bodyUsed, false);
  for (const name of ['Content-Type', 'Cache-Control', 'Vary', 'Set-Cookie', 'Content-Range', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Credentials']) {
    assert.equal(response.headers.get(name), upstream.headers.get(name), name);
  }
  for (const name of ['Connection', 'Transfer-Encoding', 'Content-Encoding', 'Content-Length']) {
    assert.equal(response.headers.has(name), false, name);
  }
  const reader = response.body.getReader();
  controller.enqueue(new TextEncoder().encode('first'));
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'first');
  controller.enqueue(new TextEncoder().encode('second'));
  controller.close();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'second');
  assert.equal((await reader.read()).done, true);
});

test('rejected WebSocket authentication remains HTTP 401 with JSON and fallback CORS', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: {
      'WWW-Authenticate': 'Bearer', 'Retry-After': '30', 'Cache-Control': 'no-store',
    } });
  });
  const response = await onRequest({ request: new Request(`${site}/api/ws`, { headers: { Upgrade: 'websocket', Origin: origin } }) });
  assert.equal(calls, 1);
  assert.equal(response.status, 401);
  assert.equal(response.webSocket ?? null, null);
  assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer');
  assert.equal(response.headers.get('Retry-After'), '30');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.deepEqual(await response.json(), { error: 'Unauthorized' });
});

test('upstream connection failure remains the existing JSON 502 without a retry', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new Error('local upstream unavailable');
  });
  const response = await onRequest({ request: new Request(`${site}/api/ws`, { headers: { Upgrade: 'websocket', Origin: origin } }) });
  assert.equal(calls, 1);
  assert.equal(response.status, 502);
  assert.equal(response.webSocket ?? null, null);
  assert.equal(response.headers.get('Content-Type'), 'application/json');
  // 保留现有异常分支，不顺带改动其 CORS 契约。
  assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
  assert.deepEqual(await response.json(), { error: 'API proxy failed', detail: 'Error: local upstream unavailable' });
});

test('preflight remains local and keeps the existing CORS contract', async t => {
  t.mock.method(globalThis, 'fetch', async () => assert.fail('preflight must not reach upstream'));
  const response = await onRequest({ request: new Request(`${site}/api/ws`, { method: 'OPTIONS', headers: { Origin: origin } }) });
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  assert.equal(response.headers.get('Access-Control-Allow-Headers'), 'Content-Type, Authorization, X-Captcha-Token');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.equal(response.headers.get('Access-Control-Max-Age'), '86400');
});

test('undeployed root API proxy stays identical to the deployed Pages handler', async () => {
  const [deployed, duplicate] = await Promise.all([
    readFile(new URL('../functions/api/[[path]].js', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/api/[[path]].js', import.meta.url), 'utf8'),
  ]);
  assert.equal(duplicate, deployed);
});
