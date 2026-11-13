import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const sha256 = value => createHash('sha256').update(value).digest('hex');

async function functionFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      files.push(...(await functionFiles(new URL(`${entry.name}/`, directory))).map(path => `${entry.name}/${path}`));
    } else {
      assert.ok(entry.isFile(), 'Functions must not contain symlinked entries');
      files.push(entry.name);
    }
  }
  return files.sort();
}

test('declarations-only release has only API/OAuth Functions and no root archive guard', async () => {
  const deployed = ['_shared/auth-client-ip.js', 'api/[[path]].js', 'oauth/[[path]].js'];
  assert.deepEqual(await functionFiles(new URL('../functions/', import.meta.url)), deployed);
  assert.deepEqual(await functionFiles(new URL('../../functions/', import.meta.url)), deployed.filter(path => !path.startsWith('oauth/')));
  const dist = new URL('../dist/', import.meta.url);
  const built = await lstat(dist).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (built) assert.deepEqual(await functionFiles(new URL('functions/', dist)), deployed);
});

test('declarations-only source and optional build have no all-path routes or advanced Worker', async () => {
  for (const root of ['../', '../public/', '../dist/', '../../']) {
    for (const name of ['_routes.json', '_worker.js', '_worker.ts', '_middleware.js', '_middleware.ts']) {
      await assert.rejects(lstat(new URL(`${root}${name}`, import.meta.url)), { code: 'ENOENT' }, `${root}${name}`);
    }
  }
});

test('robots declares the six archive products without restricting ordinary search indexing', async () => {
  const robots = await source('public/robots.txt');
  const groups = robots.replace(/#.*$/gm, '').trim().split(/\n\s*\n/)
    .map(group => group.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
  assert.deepEqual(groups, [
    [
      'User-agent: archive.org_bot',
      'User-agent: ia_archiver',
      'User-agent: ia_archiver-web.archive.org',
      'User-agent: ArchiveBot',
      'User-agent: CCBot',
      'User-agent: heritrix',
      'Disallow: /',
    ],
    ['User-agent: *', 'Disallow:'],
  ]);
});

test('public HTML declares noarchive while preserving the existing no-referrer meta', async () => {
  const html = await source('index.html');
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1];
  assert.ok(head, 'HTML must retain its head');
  assert.deepEqual(head.match(/<meta\s+name="robots"\s+content="[^"]*"\s*\/?>/gi), [
    '<meta name="robots" content="noarchive" />',
  ]);
  assert.match(head, /<meta name="referrer" content="no-referrer"\s*\/?>/);
});

test('global noarchive preserves CSP, security headers and sensitive-route declarations', async () => {
  const headers = await source('public/_headers');
  const global = headers.match(/^\/\*\r?\n((?:[ \t]+[^\r\n]*(?:\r?\n|$))*)/)?.[1];
  assert.ok(global, 'global static header block must remain');
  assert.match(global, /^ {2}X-Robots-Tag: noarchive\r?$/m);
  const csp = headers.split(/\r?\n/).map(line => line.trim())
    .find(line => line.startsWith('Content-Security-Policy:'));
  assert.ok(csp, 'existing CSP must remain');
  assert.equal(sha256(csp), 'e3886130d56eed975ab53a969950b0cbe5a8945f2e3c4a6b64345005797ee384');
  for (const header of [
    'Strict-Transport-Security: max-age=31536000; includeSubDomains; preload',
    'X-Frame-Options: DENY',
    'X-Content-Type-Options: nosniff',
    'Referrer-Policy: strict-origin-when-cross-origin',
    'Access-Control-Allow-Origin: *',
  ]) assert.ok(headers.includes(`  ${header}\n`), header);
  for (const path of ['/c/*', '/api/v1/baby-verification/verify/*', '/api/admin/baby-verification/*']) {
    assert.ok(headers.includes(`${path}\n  Cache-Control: no-store, max-age=0\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex, nofollow, noarchive\n`), path);
  }
});

test('API, OAuth and client-IP Functions match the reviewed observation signing integration', async () => {
  // Observation adds only a separately scoped signed IP envelope; response/proxy contracts have dedicated tests.
  for (const [path, digest] of [
    ['functions/api/[[path]].js', 'c1ec5a568d9ee06e2b2c53ca55c52b7fed3f89f2285caa3f3f833fa72d0aec87'],
    ['functions/oauth/[[path]].js', 'f2741a83f0a881272b962862427df11307843fdd75388ada47832f8653ebeb6d'],
    ['functions/_shared/auth-client-ip.js', 'e13ab4b43808520659aaf3d76ad301bc6587da75aca59cc19351f674b0c9f2b7'],
  ]) {
    assert.equal(sha256(await readFile(new URL(`../${path}`, import.meta.url))), digest, path);
  }
});
