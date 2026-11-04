import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NBW_BACKUP_ORIGIN as B, NBW_PRIMARY_ORIGIN as P, adoptNBWEndpoints, fetchNBWJSON, getNBWEndpointState, hasNBWDisplayData, nbwURLSuffix, readNBWEndpoints, refreshNBWEndpoints, registrationNBWURL, resolveNBWDisplayURL, subscribeNBWEndpoints } from './nbwEndpoints.js';

const snapshot = (mode = 'primary', revision = 'fixture-1', remote_mode = 'full') => ({ schema_version: 1, revision, mode, api_origin: mode === 'primary' ? P : B, authorize_origin: mode === 'primary' ? P : B, public_origin: mode === 'primary' ? P : B, media_origin: mode === 'primary' ? P : B, ttl_seconds: 30, remote_mode });
const pending = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('公共schema严格9字段、两模式四精确origin、TTL范围与能力模式', () => {
  for (const mode of ['primary', 'backup']) for (const remote of ['full', 'read_only', 'local_only']) {
    const parsed = readNBWEndpoints(snapshot(mode, 'opaque-ABA-1', remote));
    assert.equal(Object.keys(parsed).length, 9); assert.ok(Object.isFrozen(parsed)); assert.equal(parsed.mode, mode); assert.equal(parsed.remote_mode, remote);
  }
  for (const key of Object.keys(snapshot())) { const invalid = snapshot(); delete invalid[key]; assert.throws(() => readNBWEndpoints(invalid), { code: 'NBW_INVALID_RESPONSE' }); }
  for (const patch of [{ revision: '' }, { revision: 'x'.repeat(97) }, { revision: 1 }, { schema_version: '1' }, { schema_version: 2 }, { mode: 'PRIMARY' }, { remote_mode: 'localonly' }, { ttl_seconds: 31 }, { ttl_seconds: 0 }, { ttl_seconds: '30' }, { extra: 'synthetic-private' }]) assert.throws(() => readNBWEndpoints({ ...snapshot(), ...patch }), { code: 'NBW_INVALID_RESPONSE' });
  for (const key of ['api_origin', 'authorize_origin', 'public_origin', 'media_origin']) for (const value of [B, `${P}/`, `${P}:443`, `${P}?x`, `${P}/api`, 'http://www.newbabyworld.top', 'https://user@www.newbabyworld.top', 'https://%77ww.newbabyworld.top', 'https://www.newbabyworld.top.evil.invalid']) assert.throws(() => readNBWEndpoints({ ...snapshot(), [key]: value }), { code: 'NBW_INVALID_RESPONSE' });
});

test('冷启动旧NBW媒体/href保持占位；不直连primary或自行猜backup', () => {
  assert.equal(getNBWEndpointState().endpoints, null);
  for (const source of [`${P}/avatar/a.png`, `${B}/forum.php?id=1#x`]) assert.equal(resolveNBWDisplayURL(source, null), undefined);
  assert.equal(resolveNBWDisplayURL('data:image/png;base64,AA', null), 'data:image/png;base64,AA');
  assert.equal(resolveNBWDisplayURL('https://third.example/avatar.png', null), 'https://third.example/avatar.png');
});

test('resolver只映射两字面httpsorigin，path/query/hash签名字节不变、不会改源对象', () => {
  const raw = `${P}/images/%2fraw%2Fname.png?sig=A%2Bb%2f&x=one+two&x=%20#raw%2Fhash`;
  const original = { id: 'stable-1', uri: `${P}/identity/1`, content: `原文 ${raw}`, images: [{ image_url: raw }] };
  const before = structuredClone(original);
  assert.equal(resolveNBWDisplayURL(raw, snapshot('backup')), raw.replace(P, B));
  assert.equal(resolveNBWDisplayURL(`${B}/images/a.png`, snapshot()), `${P}/images/a.png`);
  assert.deepEqual(original, before);
  for (const value of [undefined, null, '', 'blob:https://app.invalid/a', 'https://third.invalid/x', 'http://www.newbabyworld.top/x', '//www.newbabyworld.top/x', `${P}:443/x`, 'https://%77ww.newbabyworld.top/x', 'https://WWW.newbabyworld.top/x', `${P}.evil.invalid/x`, 'https://user:pw@www.newbabyworld.top/x', `${P}\\evil/x`, ` ${P}/x`, `${P}/x\n`, `${P}/${'a'.repeat(8192)}`]) {
    assert.equal(nbwURLSuffix(value), null); assert.equal(resolveNBWDisplayURL(value, snapshot('backup')), value);
  }
  assert.equal(resolveNBWDisplayURL(`${P}/oauth/authorize.php?state=unchanged`, snapshot('backup')), `${P}/oauth/authorize.php?state=unchanged`);
  for (const tail of ['/oauth/authorize.php?state=unchanged', '/%6fauth/authorize.php', '/callback?code=fixture', '/member.php?access_token=fixture', '/x?oauth_context=fixture', '/x?%63ode=fixture']) {
    assert.equal(resolveNBWDisplayURL(`${P}${tail}`, snapshot('backup')), `${P}${tail}`);
    assert.equal(resolveNBWDisplayURL(`${P}${tail}`, snapshot('backup'), 'media'), undefined);
  }
});

test('registrationURL必须两固定origin，禁userinfo/port/编码主机且无full能力不嵌入', () => {
  assert.equal(registrationNBWURL(`${P}/member.php?mod=register&sig=a%2Bb`, snapshot('backup')), `${B}/member.php?mod=register&sig=a%2Bb`);
  for (const value of ['javascript:alert(1)', 'https://evil.invalid/register', `${P}:443/register`, 'https://%77ww.newbabyworld.top/register', 'https://u:p@nbw.abdlcalendar.top/register']) assert.throws(() => registrationNBWURL(value, snapshot('backup')), { code: 'NBW_INVALID_RESPONSE' });
  assert.throws(() => registrationNBWURL(`${P}/register`, snapshot('backup', '2', 'read_only')));
});

test('仅typed NBW展示字段标记远端缓存，uri/stableid/任意正文不影响本站cache', () => {
  for (const data of [{ post: { images: [`${P}/x`] } }, { posts: [{ user: { avatar: `${B}/a` } }] }, { comments: [{ user: { avatar_static: `${P}/a` } }] }, { post: { nbw_tid: 1 } }, { post: { repost: { images: [{ preview_url: `${B}/p` }] } } }]) assert.equal(hasNBWDisplayData(data), true);
  for (const data of [{ posts: [{ id: 1, uri: `${P}/x`, content: `${B}/x`, user: { avatar: 'data:a' } }] }, { image: `${P}/diaper.png` }, { posts: [{ images: ['https://other.invalid/x'] }] }, null]) assert.equal(hasNBWDisplayData(data), false);
});

test('缓存最长30s、同一在途promise并发共享、到期刷新且不永久缓存已完成Promise', async () => {
  let calls = 0, now = 1000; const oldNow = Date.now;
  Date.now = () => now;
  globalThis.fetch = async (_url, options) => { calls++; assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'include'); assert.equal(options.referrerPolicy, 'strict-origin-when-cross-origin'); assert.equal(options.headers.Origin, undefined); return Response.json(snapshot('backup', `ttl-${calls}`)); };
  try {
    await Promise.all([refreshNBWEndpoints({ force: true }), refreshNBWEndpoints(), refreshNBWEndpoints({ force: true })]); assert.equal(calls, 1);
    now += 29999; await refreshNBWEndpoints(); assert.equal(calls, 1);
    now += 1; await refreshNBWEndpoints(); assert.equal(calls, 2);
    await refreshNBWEndpoints({ force: true }); assert.equal(calls, 3);
  } finally { Date.now = oldNow; }
});

test('revision含同host/ABA必须更新epoch并通知，完全相同snapshot不改epoch', () => {
  let notifications = 0; const off = subscribeNBWEndpoints(() => notifications++);
  const first = getNBWEndpointState().epoch;
  adoptNBWEndpoints(snapshot('primary', 'aba-a')); assert.equal(getNBWEndpointState().epoch, first + 1);
  adoptNBWEndpoints(snapshot('primary', 'aba-a')); assert.equal(getNBWEndpointState().epoch, first + 1);
  adoptNBWEndpoints(snapshot('backup', 'aba-b')); adoptNBWEndpoints(snapshot('primary', 'aba-c')); adoptNBWEndpoints(snapshot('primary', 'aba-d'));
  assert.equal(getNBWEndpointState().epoch, first + 4); assert.equal(notifications, 5); off();
});

test('OAuth新snapshot压过旧discovery晚到响应，不把backup恢复成旧primary', async () => {
  const old = pending(); globalThis.fetch = () => old.promise;
  const request = refreshNBWEndpoints({ force: true });
  adoptNBWEndpoints(snapshot('backup', 'new-config'));
  old.resolve(Response.json(snapshot('primary', 'old-discovery')));
  assert.equal((await request).revision, 'new-config'); assert.equal(getNBWEndpointState().endpoints.mode, 'backup');
});

test('503/坏JSON/HTML/过大/重定向失败均不回退primary；清空authority且可恢复', async () => {
  for (const makeResponse of [() => Response.json({ code: 'NBW_ENDPOINTS_UNAVAILABLE', error: 'DO_NOT_ECHO_PRIVATE' }, { status: 503 }), () => new Response('<html>DO_NOT_ECHO_PRIVATE</html>', { headers: { 'Content-Type': 'text/html' } }), () => new Response('{', { headers: { 'Content-Type': 'application/json' } }), () => new Response('x'.repeat(32769), { headers: { 'Content-Type': 'application/json' } }), () => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '32769' } }), () => { throw new Error('DO_NOT_ECHO_PRIVATE'); }]) {
    adoptNBWEndpoints(snapshot('backup', 'known-before-fault'));
    globalThis.fetch = async () => makeResponse();
    await assert.rejects(refreshNBWEndpoints({ force: true }), error => !String(error).includes('DO_NOT_ECHO_PRIVATE'));
    assert.equal(getNBWEndpointState().endpoints, null); assert.equal(resolveNBWDisplayURL(`${P}/old.png`), undefined);
  }
  globalThis.fetch = async () => Response.json(snapshot('backup', 'recovered'));
  assert.equal((await refreshNBWEndpoints()).revision, 'recovered');
});

test('HTTP POST仅本站路径带当前会话鉴权与no-store，不发送任意host/secretquery', async () => {
  let request;
  globalThis.fetch = async (url, options) => { request = { url, options }; return Response.json({ action: 'login' }); };
  await fetchNBWJSON('/api/auth/nbw/callback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'fixture-code' }) });
  assert.equal(request.url, '/api/auth/nbw/callback'); assert.equal(request.options.credentials, 'include'); assert.equal(request.options.cache, 'no-store'); assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.Origin, undefined);
});

test('CSP NBW图片固定双origin，主iframe固定双origin且无NBW通配', () => {
  const headers = readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8');
  const images = /img-src ([^;]+)/.exec(headers)?.[1];
  assert.ok(images.includes(P)); assert.ok(images.includes(B)); assert.doesNotMatch(headers, /https:\/\/\*\.(?:newbabyworld|abdlcalendar)\.top/);
  if (headers.includes(`frame-src https://challenges.cloudflare.com ${P}`)) assert.ok(headers.includes(`frame-src https://challenges.cloudflare.com ${P} ${B}`));
});
