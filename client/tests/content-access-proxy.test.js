import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { attachContentClient, CONTENT_CLIENT_HEADERS, publicContentIp, trustedContentClient } from '../functions/_shared/content-client.js';
import { onRequest as api } from '../functions/api/[[path]].js';
import { onRequest as web } from '../functions/_middleware.js';
import { isProtectedContentDocument } from '../functions/_shared/content-web.js';
import { createCdnProxy, CONTENT_CDN_ACTIVATION } from '../../scripts/content-cdn-v1.mjs';
const secret = randomBytes(32).toString('hex'), now = 1794700000000, synthetic = '2a06:98c0:3600::103';
const fixture = { ip: '8.8.8.8', country: 'CN', region: '11' };
function envelope({ method = 'GET', path = '/api/posts', stamp = String(now / 1000), ip = fixture.ip, country = 'CN', region = '11', purpose = 'content-access:v1' } = {}) {
  return Object.fromEntries(CONTENT_CLIENT_HEADERS.map((name, i) => [name, [ip, country, region, stamp, createHmac('sha256', secret).update(`${purpose}\n${method}\n${path}\n${stamp}\n${ip}\n${country}\n${region}`).digest('hex')][i]]));
}
const withCF = (request, cf = { country: 'CN', regionCode: '11', region: 'Beijing' }) => Object.defineProperty(request, 'cf', { value: cf });
const noEnvelope = headers => { for (const name of CONTENT_CLIENT_HEADERS) assert.equal(headers.has(name), false, name); };
const access = state => Response.json({ schema_version: 1, state, action_path: '/settings/baby-verification', message: 'PRIVATE_REGION_REASON' }, { headers: { 'Set-Cookie': 'probe-cookie=NEVER_FORWARD', 'Cache-Control': 'public,max-age=300' } });

test('public canonical IP rejects synthetic/private/reserved/malformed sources; raw forwarding never signs', async () => {
  for (const ip of [synthetic, '2a06:98c0:3600:0:0:0:0:103', '127.0.0.1', '10.0.0.1', '100.64.0.1', '172.16.0.1', '192.168.0.1', '192.0.2.1', '198.51.100.1', '203.0.113.1', '0.0.0.0', '224.0.0.1', 'fd00::1', 'fe80::1', '::1', '::ffff:8.8.8.8', '2001:db8::1', '8.8.008.8', '8.8.8.8:80']) assert.equal(publicContentIp(ip), null, ip);
  assert.equal(publicContentIp('2606:4700:4700:0:0:0:0:1111'), '2606:4700:4700::1111');
  const workerHop = withCF(new Request('https://abdl-space.top/api/posts', { headers: { 'CF-Connecting-IP': '8.8.8.8', 'CF-Worker': 'foreign-worker.example' } }));
  assert.equal(await trustedContentClient(workerHop, secret, now), null, 'unproven same-zone Worker cannot launder CF metadata');
  for (const request of [new Request('https://abdl-space.top/api/posts', { headers: { 'CF-Connecting-IP': '8.8.8.8', 'X-CF-Country': 'CN', 'X-CF-Region': 'BJ', 'X-Forwarded-For': '8.8.4.4' } }), withCF(new Request('https://foreign.test/api/posts', { headers: { 'CF-Connecting-IP': '8.8.8.8' } })), withCF(new Request('https://abdl-space.top/api/posts', { headers: { 'CF-Connecting-IP': synthetic, 'X-Real-Client-IP': '8.8.8.8' } }))]) {
    const headers = new Headers({ ...envelope(), 'X-Content-Client-Future': 'forged', 'X-ABDL-Content-Access': 'v1:open' }); await attachContentClient(request, headers, secret, now); noEnvelope(headers); assert.equal(headers.has('X-Content-Client-Future'), false); assert.equal(headers.has('X-ABDL-Content-Access'), false);
  }
});
test('genuine edge signs raw regionCode, not name/profile; verified envelope wins and aliased strip is safe', async () => {
  for (const region of ['BJ', 'SH', '11', '31', '61', '']) {
    const request = withCF(new Request('https://abdl-space.top/api/posts///?irrelevant=1', { headers: { 'CF-Connecting-IP': '8.8.8.8' } }), { country: 'CN', regionCode: region, region: 'ignored profile region' });
    await attachContentClient(request, request.headers, secret, now); for (const [name, expected] of Object.entries(envelope({ region }))) assert.equal(request.headers.get(name), expected, name);
    const hop = withCF(new Request('https://abdl-space-v2.pages.dev/api/posts', { headers: { ...Object.fromEntries(request.headers), 'CF-Connecting-IP': synthetic } }), { country: 'US', regionCode: 'CA' });
    await attachContentClient(hop, hop.headers, secret, now + 1000); assert.deepEqual(await trustedContentClient(hop, secret, now + 1000), { ...fixture, region });
  }
});
test('purpose/method/path/time/HMAC/geo/canonical tampering rejected incl 30 second boundaries', async () => {
  const invalid = [{ method: 'POST' }, { path: '/api/search' }, { stamp: String(now / 1000 - 31) }, { stamp: String(now / 1000 + 31) }, { purpose: 'auth-proxy-ip:v1' }, { region: 'Beijing' }, { country: 'cn' }, { ip: synthetic }, { ip: '2606:4700:4700:0:0:0:0:1111' }];
  for (const args of invalid) assert.equal(await trustedContentClient(new Request('https://abdl-space-v2.pages.dev/api/posts', { headers: envelope(args) }), secret, now), null);
  for (const offset of [-30, 30]) assert.deepEqual(await trustedContentClient(new Request('https://abdl-space.top/api/posts', { headers: envelope({ stamp: String(now / 1000 + offset) }) }), secret, now), fixture);
});
test('candidate CDN → actual Pages → API preserves GET/HEAD user geo and method, strips caller claims; no cache/secret/body leaks', async t => {
  t.mock.method(Date, 'now', () => now);
  assert.match(CONTENT_CDN_ACTIVATION, /^blocked/);
  for (const method of ['GET', 'HEAD']) {
    let hops = 0;
    t.mock.method(globalThis, 'fetch', async (input, init) => {
      hops++;
      if (input instanceof Request) {
        assert.equal(new URL(input.url).hostname, 'abdl-space-v2.pages.dev');
        const headers = new Headers(input.headers); headers.set('CF-Connecting-IP', synthetic);
        return api({ request: new Request(input.url, { method: input.method, headers }), env: { AUTH_PROXY_HMAC_KEY: secret } });
      }
      assert.equal(input, 'https://abdl-space-api.zhx589.workers.dev/api/posts?x=1'); assert.equal(init.method, method); assert.equal(init.cache, 'no-store'); assert.equal(init.body, undefined);
      const request = new Request(input, { method, headers: init.headers }); assert.deepEqual(await trustedContentClient(request, secret, now), fixture); assert.equal(init.headers.has('X-Content-Client-Future'), false); assert.equal(init.headers.has('X-ABDL-Content-Access'), false);
      return new Response(method === 'HEAD' ? null : 'original', { status: 200, headers: { 'X-ABDL-Content-Access': 'v1:open', 'Set-Cookie': 'own=one', 'Cache-Control': 'public, max-age=3600' } });
    });
    const edge = withCF(new Request('https://abdl-space.top/api/posts?x=1', { method, headers: { 'CF-Connecting-IP': '8.8.8.8', 'X-Content-Client-Country': 'US', 'X-Content-Client-Future': 'evil', 'X-ABDL-Content-Access': 'v1:open' } }));
    const result = await createCdnProxy('abdl-space-v2.pages.dev', true).fetch(edge, { AUTH_PROXY_HMAC_KEY: secret }); assert.equal(hops, 2); assert.match(result.headers.get('Cache-Control'), /private, no-store/); assert.equal(result.headers.get('Set-Cookie'), 'own=one'); assert.equal(await result.text(), method === 'HEAD' ? '' : 'original');
    t.mock.restoreAll(); t.mock.method(Date, 'now', () => now);
  }
});
test('pre-render required suppresses real content for all UAs, HEAD null, rebinds document proof to GET access and never forwards probe cookie', async t => {
  t.mock.method(Date, 'now', () => now);
  for (const method of ['GET', 'HEAD']) for (const ua of ['Mozilla/5.0', 'Googlebot/2.1', 'ABDL-Space/3.1.0']) {
    let next = 0, probes = 0;
    t.mock.method(globalThis, 'fetch', async (url, init) => { probes++; assert.equal(url, 'https://abdl-space-api.zhx589.workers.dev/api/access'); assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual'); assert.equal(init.headers.get('Cookie'), 'own=session'); assert.equal(init.headers.get('Authorization'), 'Bearer own'); assert.equal(init.headers.has('X-Forwarded-For'), false); assert.deepEqual(await trustedContentClient(new Request(url, { headers: init.headers }), secret, now), fixture); return access('baby_verification_required'); });
    const response = await web({ request: new Request('https://abdl-space.top/forum/1', { method, headers: { ...envelope({ method, path: '/forum/1' }), 'CF-Connecting-IP': synthetic, 'User-Agent': ua, Cookie: 'own=session', Authorization: 'Bearer own' } }), env: { AUTH_PROXY_HMAC_KEY: secret }, next() { next++; return new Response('REAL_POST_MUST_NOT_RENDER'); } });
    assert.equal(probes, 1); assert.equal(next, 0); assert.equal(response.status, 403); assert.equal(response.headers.has('Set-Cookie'), false); assert.equal(response.headers.get('X-ABDL-Content-Access'), 'v1:required'); assert.match(response.headers.get('Cache-Control'), /no-store/);
    const body = await response.text(); assert.doesNotMatch(body, /REAL_POST|PRIVATE_REGION|Beijing|CN-BJ/); if (method === 'HEAD') { assert.equal(response.body, null); assert.equal(body, ''); } else assert.match(body, /href="\/settings\/baby-verification"/);
  }
});
test('unavailable/malformed/old-server404 stays closed; open streams only original content and no probe cookies', async t => {
  for (const probe of [() => new Response('', { status: 404 }), () => Response.json({}), () => access('unavailable'), () => { throw new Error('SECRET'); }]) {
    t.mock.method(globalThis, 'fetch', probe); const result = await web({ request: new Request('https://m.abdl-space.top/search'), next() { assert.fail('must not render'); } }); assert.equal(result.status, 503); assert.doesNotMatch(await result.text(), /SECRET|PRIVATE_REGION/);
  }
  t.mock.method(globalThis, 'fetch', async () => access('open')); const original = new Response('ORIGINAL_CONTENT', { headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public', 'Set-Cookie': 'real=retained' } });
  const result = await web({ request: new Request('https://abdl-space.top/forum/1'), next: () => original }); assert.strictEqual(result.body, original.body); assert.equal(result.headers.get('X-ABDL-Content-Access'), 'v1:open'); assert.equal(result.headers.get('Set-Cookie'), 'real=retained'); assert.match(result.headers.get('Vary'), /Cookie/);
});
test('essential paths/static bootstrap exempt, but data/static HTML/extension-looking posts cannot bypass', () => {
  for (const path of ['/login', '/account', '/settings/baby-verification', '/sponsors', '/api/posts', '/oauth/callback', '/admin/users', '/assets/app.js', '/sw.js']) assert.equal(isProtectedContentDocument(new Request(`https://abdl-space.top${path}`)), false, path);
  for (const path of ['/', '/forum/a.png', '/search', '/merchant', '/data/diapers.json', '/index.html', '/starfield-demo.html']) assert.equal(isProtectedContentDocument(new Request(`https://abdl-space.top${path}`)), true, path);
});
test('deployed and undeployed main helper mirror stays byte-identical', async () => {
  assert.equal(await readFile(new URL('../functions/_shared/content-client.js', import.meta.url), 'utf8'), await readFile(new URL('../../functions/_shared/content-client.js', import.meta.url), 'utf8'));
});
