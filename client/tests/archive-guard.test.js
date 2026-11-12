import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { onRequest } from '../functions/_middleware.js';
import { ARCHIVE_PRODUCTS, archiveResponseHeaders, bypassArchiveGuard, isArchiveCrawler } from '../functions/_shared/archive-policy.js';

const PRODUCTS = ['archive.org_bot', 'ia_archiver', 'ia_archiver-web.archive.org', 'ArchiveBot', 'CCBot', 'heritrix'];
const ORIGINS = ['https://abdl-space.top', 'https://m.abdl-space.top', 'https://admin.abdl-space.top', 'https://merchant.abdl-space.top', 'https://fixture.pages.dev'];
const BYPASS_PATHS = ['/api', '/api/', '/api/v1/auth/me', '/api/ws?channel=fixture', '/oauth', '/oauth/', '/oauth/callback?code=fixture', '/robots.txt', '/.well-known/assetlinks.json', '/.well-known/apple-app-site-association', '/apple-app-site-association'];
const source = path => readFile(new URL(path, import.meta.url), 'utf8');
const directives = value => (value || '').split(',').map(part => part.trim().toLowerCase()).filter(Boolean);

function headerRules(text) {
  const rules = new Map();
  let headers;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      headers = new Headers();
      rules.set(line.trim(), headers);
    } else {
      const match = line.match(/^\s+([^:]+):\s*(.*)$/);
      if (match) headers.append(match[1], match[2]);
    }
  }
  return rules;
}

function upgradeResponse() {
  const socket = Object.freeze({
    accept() { assert.fail('archive guard must not accept a socket'); },
    send() { assert.fail('archive guard must not send on a socket'); },
    close() { assert.fail('archive guard must not close a socket'); },
  });
  return Object.freeze({
    status: 101, statusText: 'Switching Protocols', webSocket: socket,
    get body() { return assert.fail('archive guard must not inspect an upgrade body'); },
    get headers() { return assert.fail('archive guard must not inspect upgrade headers'); },
  });
}

for (const product of PRODUCTS) {
  test(`archive product ${product} matches complete case-insensitive tokens only`, () => {
    assert.deepEqual(ARCHIVE_PRODUCTS, PRODUCTS);
    for (const spelling of [product, product.toLowerCase(), product.toUpperCase()]) {
      assert.equal(isArchiveCrawler(spelling), true, spelling);
      assert.equal(isArchiveCrawler(`Mozilla/5.0 (compatible; ${spelling}/1.2; +https://crawler.example/)`), true, spelling);
    }
    for (const unrelated of [`My${product}`, `${product}Status`, `${product}.extra`, `${product}-unrelated`]) {
      assert.equal(isArchiveCrawler(unrelated), false, unrelated);
    }
  });
}

test('ordinary browsers, search crawlers, Mastodon, empty and missing UA still reach the original content', async () => {
  const agents = [undefined, '', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36', 'Googlebot/2.1 (+https://www.google.com/bot.html)', 'bingbot/2.0 (+https://www.bing.com/bingbot.htm)', 'Mastodon/4.3.0', 'MyCCBot/1.0', 'CCBotStatus/1.0'];
  assert.equal(isArchiveCrawler(null), false);
  assert.equal(isArchiveCrawler(123), false);
  for (const agent of agents) {
    assert.equal(isArchiveCrawler(agent), false, String(agent));
    const request = new Request('https://frontend.example/forum/61', { headers: agent === undefined ? {} : { 'User-Agent': agent } });
    const upstream = new Response('<html>original forum content</html>', { headers: { 'Content-Type': 'text/html' } });
    let calls = 0;
    const response = await onRequest({ request, next() { calls++; return upstream; } });
    assert.equal(calls, 1, String(agent));
    assert.equal(response.status, 200);
    assert.deepEqual(directives(response.headers.get('X-Robots-Tag')), ['noarchive']);
    assert.equal(await response.text(), '<html>original forum content</html>');
  }
});

test('archive denial precedes next on web paths, every HTTP method, and every frontend host', async () => {
  const paths = ['/', '/forum/61?fixture=1', '/login', '/c/fixture', '/admin', '/merchant', '/assets/app.js', '/sw.js'];
  for (const origin of ORIGINS) for (const path of paths) for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) for (const product of PRODUCTS) {
    const label = `${product} ${method} ${origin}${path}`;
    let calls = 0;
    const response = await onRequest({
      request: new Request(`${origin}${path}`, { method, headers: { 'User-Agent': `${product.toUpperCase()}/1.2` } }),
      next() { calls++; return new Response('<html><div hidden>UPSTREAM_SECRET</div></html>'); },
    });
    assert.equal(calls, 0, label);
    assert.equal(response.status, 403, label);
    assert.equal(response.headers.get('Content-Type'), 'text/plain; charset=utf-8', label);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store, max-age=0', label);
    assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store', label);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noarchive', label);
    assert.equal(response.headers.get('Vary'), 'User-Agent', label);
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff', label);
    if (method === 'HEAD') assert.equal(response.body, null, label);
    assert.equal(await response.text(), method === 'HEAD' ? '' : 'Forbidden\n', label);
  }
});

test('bypass boundaries do not admit similarly named web paths or association descendants', async () => {
  for (const path of BYPASS_PATHS) assert.equal(bypassArchiveGuard(new URL(path, ORIGINS[0]).pathname), true, path);
  for (const path of ['/apiary', '/apis', '/API', '/oauth2', '/oauth-callback', '/robots.txt/foo', '/robots.txt.bak', '/.well-known/assetlinks.json/foo', '/.well-known/assetlinks.json.bak', '/.well-known/apple-app-site-association/foo', '/apple-app-site-association/foo']) {
    assert.equal(bypassArchiveGuard(path), false, path);
    let calls = 0;
    const response = await onRequest({ request: new Request(`${ORIGINS[0]}${path}`, { headers: { 'User-Agent': 'CCBot/2.0' } }), next() { calls++; assert.fail(`unexpected bypass: ${path}`); } });
    assert.equal(response.status, 403, path);
    assert.equal(calls, 0, path);
  }
});

test('HTML and XHTML, including asset-looking fallbacks and errors, are non-cacheable without losing CSP or existing robots rules', async () => {
  const csp = headerRules(await source('../public/_headers')).get('/*').get('Content-Security-Policy');
  assert.ok(csp);
  for (const type of ['text/html; charset=utf-8', 'Text/HTML', 'application/xhtml+xml', 'Application/Xhtml+Xml; charset=UTF-8']) for (const path of ['/forum/61', '/assets/missing.js', '/missing.png']) for (const status of [200, 404]) {
    const upstream = new Response('<html>original content</html>', { status, headers: {
      'Content-Type': type, 'Cache-Control': 'public, max-age=600', 'CDN-Cache-Control': 'public, max-age=3600',
      'Content-Security-Policy': csp, 'X-Robots-Tag': 'noindex, nofollow, max-snippet:0', Vary: 'Origin, Accept-Encoding',
    } });
    const response = await onRequest({ request: new Request(`${ORIGINS[0]}${path}`), next: () => upstream });
    assert.equal(response.status, status);
    assert.strictEqual(response.body, upstream.body);
    assert.equal(upstream.bodyUsed, false);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store, max-age=0');
    assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Content-Security-Policy'), csp);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, max-snippet:0, noarchive');
    assert.equal(response.headers.get('Vary'), 'Origin, Accept-Encoding, User-Agent');
    assert.equal(upstream.headers.get('Cache-Control'), 'public, max-age=600');
    assert.equal(upstream.headers.get('X-Robots-Tag'), 'noindex, nofollow, max-snippet:0');
    assert.equal(await response.text(), '<html>original content</html>');
  }
});

test('header additions are idempotent and preserve existing case-insensitive UA vary and wildcard vary', () => {
  for (const [robots, vary, expectedRobots, expectedVary] of [
    ['noindex, nofollow', 'Origin', 'noindex, nofollow, noarchive', 'Origin, User-Agent'],
    ['NoArchive, max-snippet:0', 'Origin, user-agent', 'NoArchive, max-snippet:0', 'Origin, user-agent'],
    ['', '*', 'noarchive', '*'],
    ['', '', 'noarchive', 'User-Agent'],
  ]) {
    const upstream = new Response('asset', { headers: { 'X-Robots-Tag': robots, Vary: vary, 'Cache-Control': 'public, max-age=60' } });
    const before = [...upstream.headers];
    const headers = archiveResponseHeaders(upstream);
    assert.notStrictEqual(headers, upstream.headers);
    assert.equal(headers.get('X-Robots-Tag'), expectedRobots);
    assert.equal(headers.get('Vary'), expectedVary);
    assert.equal(headers.get('Cache-Control'), 'public, max-age=60');
    assert.deepEqual([...archiveResponseHeaders({ headers })], [...headers]);
    assert.deepEqual([...upstream.headers], before);
  }
});

test('non-HTML assets retain cache controls, HTTP statuses, metadata and the untouched stream', async () => {
  for (const type of ['text/css', 'application/javascript', 'image/png', 'application/json']) for (const status of [200, 206, 204, 304, 302, 404, 500]) {
    const hasBody = status !== 204 && status !== 304;
    const stream = hasBody ? new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('asset bytes')); controller.close(); } }) : null;
    const upstream = new Response(stream, { status, statusText: 'Fixture status', headers: {
      'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'CDN-Cache-Control': 'public, max-age=86400',
      ETag: '"fixture"', 'Content-Range': 'bytes 0-10/11', Location: '/assets/next.js', 'X-Upstream': 'retained',
    } });
    const response = await onRequest({ request: new Request(`${ORIGINS[0]}/assets/app.js`), next: () => upstream });
    assert.equal(response.status, status);
    assert.equal(response.statusText, upstream.statusText);
    assert.strictEqual(response.body, upstream.body);
    assert.equal(upstream.bodyUsed, false);
    for (const name of ['Content-Type', 'Cache-Control', 'CDN-Cache-Control', 'ETag', 'Content-Range', 'Location', 'X-Upstream']) assert.equal(response.headers.get(name), upstream.headers.get(name), name);
    assert.deepEqual(directives(response.headers.get('X-Robots-Tag')), ['noarchive']);
    assert.equal(await response.text(), hasBody ? 'asset bytes' : '');
  }
});

test('exact API, OAuth, robots and association bypasses return the same HTTP or socket response without constructing one', async t => {
  const responses = [new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'fixture=1; HttpOnly' } }), new Response(null, { status: 302, headers: { Location: '/oauth/complete' } }), upgradeResponse()];
  t.mock.method(globalThis, 'Response', function () { assert.fail('bypasses must not reconstruct responses'); });
  for (const path of BYPASS_PATHS) for (const upstream of responses) {
    let calls = 0;
    const response = await onRequest({ request: new Request(`${ORIGINS[0]}${path}`, { headers: { 'User-Agent': 'ArchiveBot/1.0', Upgrade: 'websocket' } }), next() { calls++; return upstream; } });
    assert.equal(calls, 1, path);
    assert.strictEqual(response, upstream, path);
    if (upstream.status === 101) assert.strictEqual(response.webSocket, upstream.webSocket);
    else assert.equal(upstream.bodyUsed, false);
  }
});

test('a normal-UA non-bypass WebSocket upgrade also stays identical and untouched', async t => {
  const upstream = upgradeResponse();
  t.mock.method(globalThis, 'Response', function () { assert.fail('101 responses must not be reconstructed'); });
  let calls = 0;
  const response = await onRequest({ request: new Request(`${ORIGINS[0]}/socket`, { headers: { Upgrade: 'websocket', 'User-Agent': 'Mozilla/5.0' } }), next() { calls++; return upstream; } });
  assert.equal(calls, 1);
  assert.strictEqual(response, upstream);
  assert.strictEqual(response.webSocket, upstream.webSocket);
});

test('API and OAuth OPTIONS and POST pass the original synthetic request and body upstream without reading or cloning', async t => {
  const upstream = new Response('upstream', { status: 202, headers: { 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': 'https://fixture.example' } });
  t.mock.method(globalThis, 'Response', function () { assert.fail('API and OAuth responses must not be reconstructed'); });
  for (const path of ['/api', '/api/v1/session', '/oauth', '/oauth/token']) for (const method of ['OPTIONS', 'POST']) {
    const body = Object.freeze({ fixture: 'unread body' });
    let inNext = false;
    let calls = 0;
    const request = {
      url: `${ORIGINS[0]}${path}`, method,
      headers: new Headers({ 'User-Agent': 'CCBot/2.0', Authorization: 'Bearer fixture', Cookie: 'session=fixture' }),
      get body() { assert.equal(inNext, true, 'only downstream may access the request body'); return body; },
      get bodyUsed() { return assert.fail('guard must not inspect request body state'); },
    };
    for (const name of ['clone', 'text', 'json', 'arrayBuffer', 'formData', 'blob']) request[name] = () => assert.fail(`guard must not call request.${name}`);
    const context = { request, next(...args) {
      calls++;
      assert.deepEqual(args, []);
      assert.strictEqual(this.request, request);
      assert.equal(this.request.method, method);
      assert.equal(this.request.headers.get('Authorization'), 'Bearer fixture');
      assert.equal(this.request.headers.get('Cookie'), 'session=fixture');
      inNext = true;
      assert.strictEqual(this.request.body, body);
      inNext = false;
      return upstream;
    } };
    assert.strictEqual(await onRequest(context), upstream);
    assert.equal(calls, 1);
    assert.equal(upstream.bodyUsed, false);
    assert.equal(upstream.headers.get('Cache-Control'), 'no-cache');
    assert.equal(upstream.headers.get('Access-Control-Allow-Origin'), 'https://fixture.example');
  }
});

test('robots groups disallow all six archive products but leave the wildcard group unrestricted', async () => {
  const groups = [];
  let group;
  for (const raw of (await source('../public/robots.txt')).split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const match = line.match(/^([^:]+):\s*(.*)$/);
    assert.ok(match, line);
    const name = match[1].trim().toLowerCase();
    const value = match[2].trim();
    if (name === 'user-agent') {
      if (!group || group.rules.length) { group = { agents: [], rules: [] }; groups.push(group); }
      group.agents.push(value.toLowerCase());
    } else {
      assert.ok(group, 'robots rules must belong to a user-agent group');
      group.rules.push([name, value]);
    }
  }
  assert.deepEqual(groups.flatMap(entry => entry.agents).sort(), [...PRODUCTS.map(product => product.toLowerCase()), '*'].sort());
  for (const product of PRODUCTS) {
    const matches = groups.filter(entry => entry.agents.includes(product.toLowerCase()));
    assert.equal(matches.length, 1, product);
    assert.deepEqual(matches[0].rules, [['disallow', '/']], product);
    assert.equal(matches[0].agents.includes('*'), false, product);
  }
  const wildcard = groups.filter(entry => entry.agents.includes('*'));
  assert.equal(wildcard.length, 1);
  assert.deepEqual(wildcard[0].rules, [['disallow', '']]);
});

test('public headers and HTML opt out of archives, not global indexing, and retain private-route robots directives', async () => {
  const rules = headerRules(await source('../public/_headers'));
  const global = rules.get('/*');
  assert.ok(global);
  assert.deepEqual(directives(global.get('X-Robots-Tag')), ['noarchive']);
  assert.match(global.get('Content-Security-Policy'), /default-src 'self'/);
  assert.match(global.get('Content-Security-Policy'), /https:\/\/challenges\.cloudflare\.com/);
  for (const path of ['/c/*', '/api/v1/baby-verification/verify/*', '/api/admin/baby-verification/*']) {
    assert.deepEqual(directives(rules.get(path).get('X-Robots-Tag')), ['noindex', 'nofollow', 'noarchive'], path);
  }
  const metas = [...(await source('../index.html')).matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)].map(match => [match[1].toLowerCase(), match[3]])));
  const robots = metas.filter(meta => meta.name?.toLowerCase() === 'robots');
  assert.equal(robots.length, 1);
  assert.deepEqual(directives(robots[0].content), ['noarchive']);
});

test('Pages routing invokes the guard for every path without static or API exclusions', async () => {
  const routes = JSON.parse(await source('../public/_routes.json'));
  assert.equal(routes.version, 1);
  assert.deepEqual(routes.include, ['/*']);
  assert.deepEqual(routes.exclude, []);
});
