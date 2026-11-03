import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createTranslationGlossaryAPI } from './api.js';
import { TRANSLATION_GLOSSARY_FIXTURE_CONTROL_PATH } from './fixture.js';
import { TRANSLATION_GLOSSARY_PATH } from './model.js';
import { DEFAULT_TRANSLATION_POLICY, TRANSLATION_POLICY_FIELDS, TRANSLATION_POLICY_PATH } from '../translationPolicy/model.js';
import { createAdminFixtureServer } from '../../tests/app-clients-fixture-server.js';

const REVISION = '12345678-1234-4123-8123-123456789abc';
const PRIVATE = 'FIXTURE_PRIVATE_RAW_ERROR';
const body = revision => ({ entries: [{ id: REVISION, chinese: ['尿布'], english: ['Diaper'], note: '' }], revision });
const serverOptions = () => ({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });

test('实际src/api.js复用管理员认证cookie/token且no-store，精确两字段，不写storage/公共缓存/供应商', async () => {
  const server = await createServer(serverOptions()), oldFetch = globalThis.fetch, storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const calls = [], reads = []; let status;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem(key) { reads.push(key); return key === 'abdl_accounts' ? JSON.stringify([{ id: 2, token: 'fixture-2' }]) : '2'; },
    setItem() { throw new Error('词库不应持久化'); }, removeItem() { throw new Error('词库不应持久化'); },
  } });
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return status ? Response.json({ error: PRIVATE, code: PRIVATE }, { status }) : Response.json(body(REVISION)); };
  try {
    const { adminAPI } = await server.ssrLoadModule('/src/api.js');
    await adminAPI.translationGlossary(); await adminAPI.translationGlossary(); await adminAPI.saveTranslationGlossary(body(REVISION));
    assert.equal(calls.length, 3, '两次GET都不走公共缓存');
    for (const call of calls) { assert.equal(call.url, TRANSLATION_GLOSSARY_PATH); assert.equal(call.options.credentials, 'include'); assert.equal(call.options.headers.Authorization, 'Bearer fixture-2'); assert.equal(call.options.cache, 'no-store'); }
    assert.deepEqual(JSON.parse(calls[2].options.body), body(REVISION)); assert.ok(reads.every(key => ['abdl_accounts', 'abdl_active_account'].includes(key)));
    for (status of [401, 403, 409, 422, 503]) await assert.rejects(adminAPI.saveTranslationGlossary(body(REVISION)), error => error.status === status && !String(error).includes(PRIVATE));
    const controller = new AbortController(); controller.abort(PRIVATE); const before = calls.length;
    await assert.rejects(adminAPI.saveTranslationGlossary(body(REVISION), { signal: controller.signal }), { name: 'AbortError' }); assert.equal(calls.length, before);
    status = undefined;
    globalThis.fetch = async () => new Response('{"private":"' + PRIVATE, { headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(adminAPI.translationGlossary(), error => !String(error).includes(PRIVATE));
  } finally { globalThis.fetch = oldFetch; if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else delete globalThis.localStorage; await server.close(); }
});

test('fixture HTTP真实GET/PUT:稳定空revision、CAS、422/413/415、no-store/Vary、Origin和admin优先', async () => {
  const fixture = await createAdminFixtureServer({ quiet: true }); await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.server.address().port}`;
  const request = async (path = TRANSLATION_GLOSSARY_PATH, method = 'GET', input, token = 'fixture-2', extra = {}) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...extra }, ...(input === undefined ? {} : { body: typeof input === 'string' ? input : JSON.stringify(input) }) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  try {
    const initial = await request(); assert.equal(initial.status, 200); assert.deepEqual(initial.data.entries, []);
    assert.deepEqual((await request()).data, initial.data); assert.equal(initial.headers.get('cache-control'), 'no-store');
    for (const key of ['cookie', 'authorization', 'origin']) assert.ok(initial.headers.get('vary').toLowerCase().includes(key));
    for (const [token, status] of [['fixture-3', 403], ['not-a-fixture-token', 401]]) {
      for (const method of ['GET', 'PUT']) assert.equal((await request(TRANSLATION_GLOSSARY_PATH, method, method === 'PUT' ? '{bad json' : undefined, token)).status, status, '权限失败优先于无效JSON');
      assert.equal((await request(TRANSLATION_GLOSSARY_FIXTURE_CONTROL_PATH, 'POST', { reset: true }, token)).status, status);
    }
    const invalid = await request(TRANSLATION_GLOSSARY_PATH, 'PUT', { ...body(initial.data.revision), extra: PRIVATE });
    assert.equal(invalid.status, 422); assert.equal(invalid.data.code, 'glossary_invalid'); assert.ok(!JSON.stringify(invalid.data).includes(PRIVATE)); assert.deepEqual(Object.keys(invalid.data).sort(), ['code', 'error']);
    for (const input of ['{"entries":[],"entries":[],"revision":"' + initial.data.revision + '"}', '{"entries":[{"note":"x","\\u006eote":"y"}]}', '{bad']) { const result = await request(TRANSLATION_GLOSSARY_PATH, 'PUT', input); assert.equal(result.status, 422); assert.equal(result.data.code, 'glossary_invalid'); }
    assert.equal((await request(TRANSLATION_GLOSSARY_PATH, 'PUT', body(initial.data.revision), 'fixture-2', { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await request(TRANSLATION_GLOSSARY_PATH, 'PUT', JSON.stringify({ entries: [], revision: initial.data.revision }) + ' '.repeat(98304))).status, 413);
    const foreign = await fetch(base + TRANSLATION_GLOSSARY_PATH, { method: 'PUT', headers: { Origin: 'https://example.invalid', 'Content-Type': 'application/json' }, body: JSON.stringify(body(initial.data.revision)) }); assert.equal(foreign.status, 403);
    const saved = await request(TRANSLATION_GLOSSARY_PATH, 'PUT', body(initial.data.revision)); assert.equal(saved.status, 200); assert.notEqual(saved.data.revision, initial.data.revision);
    const stale = await request(TRANSLATION_GLOSSARY_PATH, 'PUT', body(initial.data.revision)); assert.equal(stale.status, 409); assert.equal(stale.data.code, 'glossary_conflict');
    await request(TRANSLATION_GLOSSARY_FIXTURE_CONTROL_PATH, 'POST', { scenario: 'unavailable' }); const unavailable = await request(); assert.equal(unavailable.status, 503); assert.equal(unavailable.data.code, 'translation_unavailable');
    await request(TRANSLATION_GLOSSARY_FIXTURE_CONTROL_PATH, 'POST', { reset: true }); assert.deepEqual((await request()).data, initial.data);
  } finally { await fixture.close(); }
});

test('fixture真实认证API词库保存原子推进policy世代/revision，不修改额度或provider/其他策略，policy禁止倒退', async () => {
  const fixture = await createAdminFixtureServer({ quiet: true }); await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.server.address().port}`, calls = [];
  const request = async (path, options = {}) => {
    calls.push({ path, method: options.method || 'GET' });
    const response = await fetch(base + path, { ...options, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture-2' } });
    const data = await response.json(); if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status, code: data.code }); return data;
  };
  try {
    const protectedPaths = ['/api/admin/app-ai/provider', '/api/admin/app-human-check/policy', '/api/admin/app-clients/reminder'];
    const before = [];
    for (const path of protectedPaths) before.push(await request(path));
    const policy = await request(TRANSLATION_POLICY_PATH); assert.deepEqual(policy, DEFAULT_TRANSLATION_POLICY);
    const api = createTranslationGlossaryAPI(request), first = await api.translationGlossary(); await api.saveTranslationGlossary(body(first.revision));
    const fresh = await request(TRANSLATION_POLICY_PATH); assert.equal(fresh.cache_epoch, policy.cache_epoch + 1); assert.notEqual(fresh.revision, policy.revision);
    for (const key of ['daily_limit', 'english_daily_limit', 'sponsor_daily_limit', 'enabled', 'sponsor_auto_allowed', 'timezone']) assert.equal(fresh[key], policy[key]);
    const policyBody = Object.fromEntries(TRANSLATION_POLICY_FIELDS.map(key => [key, fresh[key]]));
    await assert.rejects(request(TRANSLATION_POLICY_PATH, { method: 'PUT', body: JSON.stringify({ ...policyBody, cache_epoch: 1 }) }), { status: 422 });
    await assert.rejects(request(TRANSLATION_POLICY_PATH, { method: 'PUT', body: JSON.stringify({ ...policyBody, revision: policy.revision, cache_epoch: 1 }) }), { status: 409 });
    const after = [];
    for (const path of protectedPaths) after.push(await request(path));
    assert.deepEqual(after, before); assert.ok(calls.every(call => call.method === 'GET' || [TRANSLATION_GLOSSARY_PATH, TRANSLATION_POLICY_PATH].includes(call.path)));
  } finally { await fixture.close(); }
});
