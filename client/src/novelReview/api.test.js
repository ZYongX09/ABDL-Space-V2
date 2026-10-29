import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { createNovelReviewAPI } from './api.js';
import { fixtureReview, fixtureWork } from './fixture.js';

function response(path) {
  if (path.includes('/reports/') && path.endsWith('/decision')) return { success: true };
  if (path.endsWith('/decision')) return { review: fixtureReview({ status: 'approved', version: 3 }), work: fixtureWork() };
  if (path.includes('/chapters/')) return { ...fixtureReview().chapters[0], body: '全章正文' };
  if (path.endsWith('/ai')) return { status: 'complete', findings: '仅本地模拟', chapter_id: 'chapter-1', body_sha256: 'a'.repeat(64), next_offset: null };
  if (path.endsWith('/action') || path.includes('/reports/') && path.endsWith('/decision')) return { success: true };
  if (path.includes('/reviews/') && !path.includes('?')) return fixtureReview();
  if (path.endsWith('/works/work-1')) return fixtureWork();
  return { items: path.includes('/works') ? [fixtureWork()] : path.includes('/reports') ? [] : [fixtureReview()], next_cursor: null };
}

test('全部审核域请求使用 no-store、JSON 和 UUID Idempotency-Key；正文不走 preview、AI 没有另一套 provider', async () => {
  const calls = [], key = randomUUID();
  const api = createNovelReviewAPI(async (path, options) => { calls.push({ path, options }); return response(path); }, { createId: randomUUID });
  await api.listReviews({ status: 'pending', query: '标题 & 作者', cursor: 'cursor / 1', limit: 20 });
  await api.review('review / 1'); await api.chapter('review / 1', 'chapter / 1');
  await api.claim('review / 1', { operationId: key }); await api.release('review / 1', { operationId: key });
  await api.decide('review / 1', { decision: 'approve', reason: '人工理由', version: 2 }, { operationId: key });
  await api.ai('review / 1', { chapter_id: 'chapter-1', offset: 12000 }, { operationId: key });
  await api.works({ status: 'withdrawn', query: '作品' }); await api.work('work-1'); await api.reports();
  await api.workAction('work-1', { action: 'withdraw', reason: '授权问题' }, { operationId: key });
  await api.reportDecision('report-1', { decision: 'dismiss', reason: '人工核实' }, { operationId: key });
  await api.creatorAction('42', { action: 'suspend', reason: '人工限制' }, { operationId: key });
  assert.ok(calls.every(call => call.path.startsWith('/api/admin/novels/rebuild/')));
  assert.equal(new URL(calls[0].path, 'http://fixture.invalid').searchParams.get('query'), '标题 & 作者');
  assert.match(calls[1].path, /reviews\/review%20%2F%201$/); assert.match(calls[2].path, /chapters\/chapter%20%2F%201$/);
  for (const call of calls) {
    assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.redirect, 'error'); assert.ok(call.options.signal);
    if (call.options.method === 'POST') { assert.equal(call.options.headers['Idempotency-Key'], key); assert.equal(call.options.headers['Content-Type'], 'application/json'); assert.doesNotThrow(() => JSON.parse(call.options.body)); }
  }
  assert.deepEqual(JSON.parse(calls[5].options.body), { decision: 'approve', reason: '人工理由', version: 2 });
  assert.deepEqual(JSON.parse(calls[6].options.body), { chapter_id: 'chapter-1', offset: 12000 });
  assert.ok(calls.every(call => !/preview|provider|publish|novelStatus/.test(call.path)));
});

test('API 拒绝缺少当前版本/理由/响应目录与治理假成功，不访问网络', async () => {
  let count = 0;
  const api = createNovelReviewAPI(async () => { count += 1; return {}; }, { createId: randomUUID });
  for (const body of [{ decision: 'approve', reason: '', version: 2 }, { decision: 'reject', reason: '理由' }, { decision: 'approve', reason: '理由', version: 0 }]) await assert.rejects(api.decide('id', body));
  await assert.rejects(api.ai('id', { chapter_id: 'chapter', offset: -1 }));
  await assert.rejects(api.listReviews({ status: 'all' })); assert.equal(count, 0);
  await assert.rejects(api.review('id'), /审核状态/); await assert.rejects(api.work('work-1'), /完整作品目录/); await assert.rejects(api.workAction('id', { action: 'withdraw', reason: '理由' }), /未确认/);
});

test('API 理由按小说合同支持 2000 字；非法理由及操作不访问网络，历史 cursor/limit 独立传递', async () => {
  const calls = []; const api = createNovelReviewAPI(async (path, options) => { calls.push({ path, options }); return path.includes('/works/work-1/reviews?') ? { items: [fixtureReview()], next_cursor: null } : response(path); }, { createId: randomUUID });
  const reason = '理'.repeat(2000);
  for (const decision of ['approve', 'reject']) await api.decide('id', { decision, reason, version: 2 });
  await api.workAction('work-1', { action: 'withdraw', reason }); await api.reportDecision('report-1', { decision: 'withdraw', reason }); await api.creatorAction('42', { action: 'restore', reason });
  assert.ok(calls.every(call => JSON.parse(call.options.body).reason.length === 2000)); const count = calls.length;
  for (const reason of ['', '  ', '理'.repeat(2001), '理\0由', null]) {
    await assert.rejects(api.decide('id', { decision: 'approve', reason, version: 2 })); await assert.rejects(api.workAction('work-1', { action: 'withdraw', reason })); await assert.rejects(api.reportDecision('report-1', { decision: 'dismiss', reason }));
  }
  await assert.rejects(api.creatorAction('42', { action: 'publish', reason: '理由' })); assert.equal(calls.length, count);
  await api.workReviews('work-1', { cursor: 'history / & 50', limit: 20 }); const url = new URL(calls.at(-1).path, 'http://fixture.invalid');
  assert.equal(url.pathname, '/api/admin/novels/rebuild/works/work-1/reviews'); assert.equal(url.searchParams.get('cursor'), 'history / & 50'); assert.equal(url.searchParams.get('limit'), '20'); assert.equal(calls.at(-1).options.method, 'GET');
});

test('API 超时与显式取消均中止请求并明确失败，即使传输层忽略 abort 也不会等成假成功', async () => {
  let signal;
  const hanging = () => new Promise(() => {});
  const api = createNovelReviewAPI(async (_path, options) => { signal = options.signal; return hanging(); }, { createId: randomUUID, timeoutMs: 10 });
  await assert.rejects(api.review('id'), error => error.code === 'TIMEOUT'); assert.equal(signal.aborted, true);
  const abort = new AbortController();
  const other = createNovelReviewAPI(async (_path, options) => { signal = options.signal; return hanging(); }, { createId: randomUUID, timeoutMs: 1000 });
  const waiting = other.review('id', { signal: abort.signal }); abort.abort(); await assert.rejects(waiting, error => error.name === 'AbortError'); assert.equal(signal.aborted, true);
});

test('实际 adminAPI 入口携带现有 Bearer/cookie，domain 写入不复用旧直接发布接口', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
  const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
  const calls = [], key = randomUUID();
  globalThis.localStorage = { getItem(name) { return name === 'abdl_accounts' ? JSON.stringify([{ id: 1, token: 'fixture-memory-admin' }]) : name === 'abdl_active_account' ? '1' : null; } };
  globalThis.fetch = async (path, options) => { calls.push({ path: String(path), options }); return Response.json(response(String(path))); };
  try {
    const { adminAPI } = await server.ssrLoadModule('/src/api.js');
    await adminAPI.novelReview.listReviews({ status: 'pending' });
    await adminAPI.novelReview.decide('review-pending', { decision: 'approve', reason: '人工明确理由', version: 2 }, { operationId: key });
    assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-memory-admin'); assert.equal(calls[0].options.credentials, 'include');
    assert.equal(calls[1].options.headers['Idempotency-Key'], key); assert.equal(calls[1].options.cache, 'no-store');
    const count = calls.length; await assert.rejects(adminAPI.novelStatus('id', 'published'), /直改已停用/); assert.equal(calls.length, count);
    globalThis.fetch = async () => Response.json({ error: 'version changed', code: 'review_conflict' }, { status: 409 });
    await assert.rejects(adminAPI.novelReview.claim('id'), error => error.status === 409 && error.code === 'review_conflict');
  } finally { await server.close(); globalThis.fetch = originalFetch; if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage; }
});
