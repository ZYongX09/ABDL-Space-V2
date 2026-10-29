import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setImmediate } from 'node:timers';
import { createNovelReviewController, initialReviewState, readAIChunk, readBody, readPage, readReview, reviewAvailability, safeReviewError } from './model.js';
import { createNovelReviewAPI } from './api.js';
import { createNovelFixture, fixtureReview, fixtureWork, FIXTURE_BODY } from './fixture.js';

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function harness(overrides = {}, options = {}) {
  const fixture = createNovelFixture();
  const calls = [];
  const api = createNovelReviewAPI(async (path, request) => {
    const url = new URL(path, 'http://fixture.invalid');
    calls.push({ path, request });
    const result = await fixture.respond(url.pathname, { method: request.method, body: request.body == null ? undefined : JSON.parse(request.body), params: url.searchParams, actorId: 1, operationId: request.headers['Idempotency-Key'] });
    if (result.status !== 200) throw Object.assign(new Error(result.data.error), { status: result.status, code: result.data.code });
    return result.data;
  }, { createId: randomUUID, timeoutMs: 1000 });
  const controller = createNovelReviewController({ ...api, ...overrides }, { adminId: 1, createId: randomUUID, ...options });
  return { controller, api, fixture, calls };
}
const reviewing = (patch = {}) => fixtureReview({ status: 'reviewing', claimed_by: 1, version: 2, ...patch });

test('小说审核只接受真实列表结构，不把缺失 items /完整目录/作者映射为空成功', () => {
  assert.equal(initialReviewState().page, null);
  assert.throws(() => readPage({}, readReview), /列表响应/);
  assert.throws(() => readReview({ ...fixtureReview(), chapters: undefined }, true), /完整候选目录/);
  assert.throws(() => readReview({ ...fixtureReview(), author: null }, true), /作者信息/);
  assert.throws(() => readReview({ ...fixtureReview(), chapters: [fixtureReview().chapters[0], fixtureReview().chapters[0]] }, true), /重复章节/);
  const item = readReview(fixtureReview(), true);
  assert.equal(item.statements.length, 2); assert.equal(item.chapters.length, 2);
});

test('宝宝认证式认领权限：他人认领、已通过/驳回和未认领不可直接决定', () => {
  assert.equal(reviewAvailability(fixtureReview(), 1).claim, true);
  for (const item of [fixtureReview(), reviewing({ claimed_by: 2 }), reviewing({ status: 'approved' }), reviewing({ status: 'rejected' })]) {
    assert.equal(reviewAvailability(item, 1).approve, false); assert.equal(reviewAvailability(item, 1).ai, false);
  }
  const own = reviewAvailability(reviewing(), '1');
  for (const key of ['approve', 'reject', 'release', 'ai']) assert.equal(own[key], true);
});

test('四种审核状态均从 domain 列表读取，搜索/游标不构造假总数', async () => {
  const { controller, calls } = harness();
  for (const status of ['pending', 'reviewing', 'approved', 'rejected']) {
    assert.equal(await controller.loadList({ status, query: '完整', cursor: 'fixture-list:0' }), true);
    assert.equal(controller.getState().page.items[0].status, status);
    const params = new URL(calls.at(-1).path, 'http://fixture.invalid').searchParams;
    assert.equal(params.get('status'), status); assert.equal(params.get('query'), '完整'); assert.equal(params.get('cursor'), 'fixture-list:0');
    assert.equal(Object.hasOwn(controller.getState().page, 'total'), false);
  }
  controller.dispose();
});

test('真实认领/释放后使用服务端版本，不能仅变按钮文字', async () => {
  const { controller } = harness();
  await controller.open('review-pending');
  assert.equal(await controller.mutate('approve'), false);
  assert.equal(await controller.mutate('claim'), true);
  assert.equal(controller.getState().selected.status, 'reviewing'); assert.equal(controller.getState().selected.version, 2); assert.equal(controller.getState().selected.claimed_by, 1);
  assert.equal(await controller.mutate('release'), true);
  assert.equal(controller.getState().selected.status, 'pending'); assert.equal(controller.getState().selected.version, 3); assert.equal(controller.getState().selected.claimed_by, null);
  controller.dispose();
});

test('通过与驳回均强制理由、当前 version 与稳定 UUID；成功之后采用真实服务器 snapshot', async () => {
  const { controller, calls } = harness();
  await controller.open('review-reviewing');
  for (const action of ['approve', 'reject']) assert.equal(await controller.mutate(action), false);
  assert.match(controller.getState().error, /理由/);
  controller.changeReason('  人工完整核对授权及正文  ');
  assert.equal(await controller.mutate('approve'), true);
  const call = calls.find(entry => entry.path.endsWith('/decision'));
  assert.deepEqual(JSON.parse(call.request.body), { decision: 'approve', reason: '人工完整核对授权及正文', version: 2 });
  assert.match(call.request.headers['Idempotency-Key'], /^[0-9a-f-]{36}$/);
  assert.equal(controller.getState().selected.status, 'approved'); assert.equal(controller.getState().selected.version, 3);
  assert.equal(controller.getState().reason, ''); assert.match(controller.getState().notice, /服务器已确认/);
  controller.dispose();
});

test('网络未知结果保留同 payload 的幂等键，修改理由产生新键，不伪报成功', async () => {
  const keys = [];
  const { controller } = harness({ review: async () => reviewing(), decide: async (_id, body, options) => { keys.push({ key: options.operationId, body }); throw new Error('lost response'); } });
  await controller.open('review-pending'); controller.changeReason('相同人工理由');
  assert.equal(await controller.mutate('reject'), false); assert.equal(await controller.mutate('reject'), false);
  assert.equal(keys[0].key, keys[1].key); assert.equal(controller.getState().notice, ''); assert.equal(controller.getState().reason, '相同人工理由');
  controller.changeReason('不同人工理由'); await controller.mutate('reject'); assert.notEqual(keys[2].key, keys[1].key);
  controller.dispose();
});

test('保存中只发一次 mutation；409 保留理由并阻止再次保存，刷新取新版本', async () => {
  const waiting = deferred(); let count = 0, version = 2;
  const { controller } = harness({ review: async () => reviewing({ version }), decide: async () => { count += 1; await waiting.promise; throw Object.assign(new Error('conflict'), { status: 409 }); } });
  await controller.open('review-pending'); controller.changeReason('保留这个理由');
  const pending = controller.mutate('reject'); assert.equal(await controller.mutate('reject'), false); assert.equal(count, 1);
  waiting.resolve(); assert.equal(await pending, false);
  assert.equal(controller.getState().needsReload, true); assert.equal(controller.getState().reason, '保留这个理由');
  assert.equal(await controller.mutate('reject'), false); assert.equal(count, 1);
  version = 4; await controller.open('review-pending', { preserveReason: true });
  assert.equal(controller.getState().selected.version, 4); assert.equal(controller.getState().reason, '保留这个理由'); assert.equal(controller.getState().needsReload, false);
  controller.dispose();
});

test('成功 HTTP 但无 review /version 未前进也不能显示决定成功', async () => {
  for (const value of [{}, { review: reviewing({ status: 'approved' }) }]) {
    const { controller } = harness({ review: async () => reviewing(), decide: async () => value });
    await controller.open('review-pending'); controller.changeReason('明确理由'); assert.equal(await controller.mutate('approve'), false);
    assert.equal(controller.getState().notice, ''); assert.equal(controller.getState().needsReload, true); controller.dispose();
  }
});

test('逐章加载完整正文保留首尾、换行与 >12000 字符；校验候选 id/hash/generation', async () => {
  const { controller } = harness();
  await controller.open('review-pending'); assert.equal(await controller.loadBodies(), true);
  assert.equal(controller.getState().bodies['chapter-1'].body, FIXTURE_BODY); assert.ok(FIXTURE_BODY.length > 12000);
  assert.match(controller.getState().bodies['chapter-2'].body, /<script>不作为 HTML 执行<\/script>/);
  const expected = fixtureReview().chapters[0];
  assert.throws(() => readBody({ ...expected, body: FIXTURE_BODY, generation: 8 }, expected), /版本或校验/);
  assert.throws(() => readBody({ ...expected, body: FIXTURE_BODY, body_sha256: 'b'.repeat(64) }, expected), /版本或校验/);
  controller.dispose();
});

test('正文失败保留已加载章节但不声称剩余完成；取消晚回包不会污染新详情', async () => {
  let count = 0; const pendingBody = deferred();
  const { controller } = harness({ chapter: async (_id, chapterId) => {
    count += 1; if (count === 2) throw new Error('connection');
    return { ...fixtureReview().chapters.find(chapter => chapter.id === chapterId), body: FIXTURE_BODY };
  } });
  await controller.open('review-pending'); assert.equal(await controller.loadBodies(), false);
  assert.equal(Object.keys(controller.getState().bodies).length, 1); assert.ok(controller.getState().bodyError); controller.dispose();
  const other = harness({ chapter: () => pendingBody.promise });
  await other.controller.open('review-pending'); const request = other.controller.loadBodies('chapter-1'); other.controller.close();
  pendingBody.resolve({ ...fixtureReview().chapters[0], body: FIXTURE_BODY }); await request;
  assert.equal(Object.keys(other.controller.getState().bodies).length, 0); other.controller.dispose();
});

test('AI 不会因开详情或加载正文自动触发；完整覆盖同一 chapter offset 后才进下一章，不作审核决定', async () => {
  const { controller, fixture } = harness();
  await controller.open('review-reviewing'); await controller.loadBodies();
  assert.equal(fixture.state().calls.filter(call => call.path.endsWith('/ai')).length, 0);
  assert.equal(await controller.startAI(), true);
  const calls = fixture.state().calls.filter(call => call.path.endsWith('/ai'));
  assert.deepEqual(calls.map(call => call.body), [{ chapter_id: 'chapter-1', offset: 0 }, { chapter_id: 'chapter-1', offset: 12000 }, { chapter_id: 'chapter-2', offset: 0 }]);
  assert.equal(controller.getState().ai.status, 'complete'); assert.equal(controller.getState().ai.completedChapters, 2); assert.equal(controller.getState().ai.chunks, 3);
  assert.equal(controller.getState().selected.status, 'reviewing'); assert.equal(fixture.state().calls.filter(call => call.path.endsWith('/decision')).length, 0);
  controller.dispose();
});

test('AI 取消停止后续分块，晚回包不算覆盖；管理员续跑同一章偏移和幂等键', async () => {
  const waiting = deferred(); const calls = [];
  const { controller } = harness({ review: async () => reviewing(), ai: async (_id, body, options) => {
    calls.push({ ...body, key: options.operationId });
    if (calls.length === 2) await waiting.promise;
    return { status: 'complete', findings: '仅本地合成意见', chapter_id: body.chapter_id, body_sha256: fixtureReview().chapters[0].body_sha256, next_offset: body.chapter_id === 'chapter-1' && body.offset === 0 ? 12000 : null };
  } });
  await controller.open('review-pending'); const run = controller.startAI();
  while (calls.length < 2) await new Promise(resolve => setImmediate(resolve));
  controller.cancelAI(); waiting.resolve(); await run;
  assert.equal(calls.length, 2); assert.equal(controller.getState().ai.status, 'cancelled'); assert.equal(controller.getState().ai.completedChapters, 0); assert.equal(controller.getState().ai.offset, 12000); assert.equal(controller.getState().ai.chunks, 1);
  assert.equal(await controller.startAI(), true);
  assert.deepEqual(calls.map(call => [call.chapter_id, call.offset]), [['chapter-1', 0], ['chapter-1', 12000], ['chapter-1', 12000], ['chapter-2', 0]]);
  assert.equal(calls[1].key, calls[2].key); assert.equal(controller.getState().ai.completedChapters, 2); controller.dispose();
});

test('AI 未配置/失败/不前进/其他 hash 明确中止，绝不显示完整覆盖', async () => {
  for (const scenario of ['ai-unavailable', 'ai-stuck']) {
    const { controller, fixture } = harness(); fixture.configure({ scenario }); await controller.open('review-reviewing');
    assert.equal(await controller.startAI(), false); assert.equal(controller.getState().ai.status, 'error'); assert.equal(controller.getState().ai.completedChapters, 0); assert.equal(controller.getState().selected.status, 'reviewing'); controller.dispose();
  }
  const chapter = fixtureReview().chapters[0];
  assert.throws(() => readAIChunk({ status: 'complete', findings: '', chapter_id: chapter.id, body_sha256: 'f'.repeat(64), next_offset: null }, chapter, 0), /不属于/);
  assert.throws(() => readAIChunk({ status: 'complete', findings: '', chapter_id: chapter.id, body_sha256: chapter.body_sha256 }, chapter, 0), /游标/);
});

test('AI unavailable receipt 不锁死手动重试：新请求键重新尝试统一 provider', async () => {
  const { controller, fixture } = harness(); fixture.configure({ scenario: 'ai-unavailable' }); await controller.open('review-reviewing'); await controller.startAI();
  fixture.configure({ scenario: 'normal' }); assert.equal(await controller.startAI(), true);
  const calls = fixture.state().calls.filter(call => call.path.endsWith('/ai'));
  assert.notEqual(calls[0].operationId, calls[1].operationId); assert.equal(controller.getState().ai.status, 'complete'); controller.dispose();
});

test('换账号 generation 隔离详情、正文、AI、保存和治理旧回包，不出现旧账号成功提示', async () => {
  for (const action of ['detail', 'body', 'ai', 'save', 'govern']) {
    let session = 'A'; const waiting = deferred(); let pending;
    const methods = { review: async () => reviewing() };
    if (action === 'detail') methods.review = () => waiting.promise;
    if (action === 'body') methods.chapter = () => waiting.promise;
    if (action === 'ai') methods.ai = () => waiting.promise;
    if (action === 'save') methods.decide = () => waiting.promise;
    if (action === 'govern') methods.creatorAction = () => waiting.promise;
    const { controller } = harness(methods, { getSession: () => session });
    if (action !== 'detail' && action !== 'govern') await controller.open('review-pending');
    if (action === 'detail') pending = controller.open('review-pending');
    if (action === 'body') pending = controller.loadBodies();
    if (action === 'ai') pending = controller.startAI();
    if (action === 'save') { controller.changeReason('账号 A 的理由'); pending = controller.mutate('reject'); }
    if (action === 'govern') pending = controller.govern('creator', '42', 'suspend', '账号 A 的治理理由');
    session = 'B'; controller.block();
    waiting.resolve(action === 'detail' ? reviewing() : action === 'body' ? { ...fixtureReview().chapters[0], body: FIXTURE_BODY } : action === 'ai' ? { status: 'complete', findings: 'old result', chapter_id: 'chapter-1', body_sha256: 'a'.repeat(64), next_offset: null } : action === 'save' ? { review: reviewing({ version: 3, status: 'rejected' }) } : { success: true });
    await pending;
    assert.equal(controller.getState().blocked, true); assert.equal(controller.getState().selected, null); assert.deepEqual(controller.getState().bodies, {}); assert.equal(controller.getState().ai.results.length, 0); assert.equal(controller.getState().notice, ''); assert.equal(controller.getState().reason, ''); controller.dispose();
  }
});

test('列表 generation 隔离旧筛选晚回包，401/403 清空页面且阻止新操作', async () => {
  const waiting = deferred(); let count = 0;
  const { controller } = harness({ listReviews: async () => { count += 1; if (count === 1) return waiting.promise; return { items: [fixtureReview({ status: 'approved' })], next_cursor: null }; } });
  const first = controller.loadList({ status: 'pending' }); await controller.loadList({ status: 'approved' }); waiting.resolve({ items: [fixtureReview()], next_cursor: null }); await first;
  assert.equal(controller.getState().page.items[0].status, 'approved'); controller.dispose();
  for (const status of [401, 403]) {
    const denied = harness({ review: async () => { throw Object.assign(new Error('denied'), { status }); } });
    await denied.controller.open('review-pending'); assert.equal(denied.controller.getState().blocked, true); assert.equal(await denied.controller.loadList(), false); denied.controller.dispose();
  }
});

test('作品详情从 admin work endpoint 获取全部 metadata/chapters/reviews，治理要求理由和 success:true', async () => {
  const { controller, calls } = harness();
  assert.equal(await controller.openWork('work-1'), true); assert.equal(controller.getState().work.reviews.length, 50); assert.equal(controller.getState().work.chapters.length, 2);
  assert.equal(await controller.loadMoreHistory(), true); assert.equal(controller.getState().work.reviews.length, 70); assert.equal(controller.getState().work.reviews_next_cursor, 'fixture-history:70');
  assert.equal(await controller.loadMoreHistory(), true); assert.equal(controller.getState().work.reviews.length, 73); assert.equal(controller.getState().work.reviews_next_cursor, null);
  assert.equal(await controller.loadMoreHistory(), false);
  assert.equal(await controller.govern('work', 'work-1', 'withdraw', ''), false);
  assert.equal(await controller.govern('work', 'work-1', 'withdraw', '人工核实授权问题'), true);
  assert.equal(await controller.govern('work', 'work-1', 'restore', '已核对整改和原批准版本'), true);
  assert.equal(await controller.govern('report', 'report-1', 'dismiss', '核对不构成违规'), true);
  assert.equal(await controller.govern('creator', '42', 'suspend', '限制创作者上传资格'), true);
  const before = calls.length; assert.equal(await controller.govern('creator', 'wrong', 'restore', '理由'), false); assert.equal(calls.length, before);
  assert.deepEqual(JSON.parse(calls.find(call => call.path.endsWith('/works/work-1/action')).request.body), { action: 'withdraw', reason: '人工核实授权问题' }); controller.dispose();
  const invalid = harness({ creatorAction: async () => ({ ok: true }) }); assert.equal(await invalid.controller.govern('creator', '42', 'restore', '人工恢复'), false); assert.equal(invalid.controller.getState().notice, ''); invalid.controller.dispose();
});

test('作品历史分页使用独立游标、禁止重复并发，错误不丢已加载历史，旧回包不混入新作品', async () => {
  const pending = deferred(); let count = 0;
  const { controller } = harness({ work: async () => fixtureWork({ reviews_next_cursor: 'work-history-only' }), workReviews: async (_id, params) => { count += 1; assert.equal(params.cursor, 'work-history-only'); assert.equal(params.limit, 20); return pending.promise; } });
  await controller.openWork('work-1'); const first = controller.loadMoreHistory(); assert.equal(await controller.loadMoreHistory(), false); assert.equal(count, 1);
  controller.close(); pending.resolve({ items: [fixtureReview({ id: 'review-old-history' })], next_cursor: null }); await first;
  assert.equal(controller.getState().work, null); controller.dispose();
  const stuck = harness({ work: async () => fixtureWork({ reviews_next_cursor: 'unchanged-history' }), workReviews: async () => ({ items: [], next_cursor: 'unchanged-history' }) });
  await stuck.controller.openWork('work-1'); assert.equal(await stuck.controller.loadMoreHistory(), false); assert.equal(stuck.controller.getState().work.reviews.length, 1); assert.match(stuck.controller.getState().historyError, /游标/); stuck.controller.dispose();
});

test('小说理由使用独立 2000 字合同：通过、驳回与治理接受长理由，空白/超限/空字符不发请求', async () => {
  for (const action of ['approve', 'reject']) {
    const { controller, calls } = harness(); await controller.open('review-reviewing');
    for (const reason of ['', '  \n ', '理'.repeat(2001), '理\0由']) {
      controller.changeReason(reason); const count = calls.length;
      assert.equal(await controller.mutate(action), false); assert.equal(calls.length, count);
    }
    const reason = '理'.repeat(2000); controller.changeReason(reason);
    assert.equal(await controller.mutate(action), true); assert.equal(controller.getState().selected.reason, reason); controller.dispose();
  }
  const { controller } = harness();
  assert.equal(await controller.govern('creator', '42', 'suspend', '理'.repeat(2000)), true);
  assert.equal(await controller.govern('creator', '42', 'restore', '理'.repeat(2001)), false); controller.dispose();
});

test('差异与审计严格读取 domain 的 metadata/chapter kind 和 actor 字段，不将错误 DTO 当成功', () => {
  const item = fixtureReview(); assert.deepEqual(readReview(item, true).changes, item.changes); assert.deepEqual(readReview(item, true).audit, item.audit);
  for (const changes of [{ metadata: [42], chapters: [] }, { metadata: [], chapters: [{ id: 'ch', title: '章', kind: 'removed' }] }, { metadata: [], chapters: [{ id: 'ch', title: 1, kind: 'added' }] }]) assert.throws(() => readReview(fixtureReview({ changes }), true), /差异|格式/);
  for (const audit of [[{}], [{ ...item.audit[0], actor_id: '42' }], [{ ...item.audit[0], created_at: 'today' }]]) assert.throws(() => readReview(fixtureReview({ audit }), true), /格式/);
});

test('历史分页错误保留 50 条及游标，可重试；去重且拒绝跨作品数据', async () => {
  let count = 0;
  const { controller } = harness({ workReviews: async () => {
    count += 1;
    if (count === 1) throw new Error('lost page');
    if (count === 2) return { items: [fixtureReview({ id: 'foreign', work_id: 'other-work' })], next_cursor: null };
    return { items: [fixtureReview(), fixtureReview({ id: 'history-new' }), fixtureReview({ id: 'history-new' })], next_cursor: null };
  } });
  await controller.openWork('work-1'); const before = controller.getState().work;
  for (let i = 0; i < 2; i += 1) {
    assert.equal(await controller.loadMoreHistory(), false); assert.deepEqual(controller.getState().work, before); assert.ok(controller.getState().historyError); assert.equal(controller.getState().listError, '');
  }
  assert.equal(await controller.loadMoreHistory(), true); assert.equal(controller.getState().work.reviews.length, 51); assert.equal(controller.getState().historyError, ''); controller.dispose();
});

test('历史 lane 与列表游标独立；切换作品或打开候选取消历史且清空 loading，晚回包不可污染', async () => {
  const pending = deferred();
  const { controller } = harness({ work: async id => fixtureWork({ id, reviews: [fixtureReview({ work_id: id })], reviews_next_cursor: 'history-only' }), workReviews: () => pending.promise });
  await controller.loadList({ mode: 'works', cursor: 'list-only' }); await controller.openWork('work-1');
  const history = controller.loadMoreHistory(); await controller.loadList({ mode: 'works', query: '完整', cursor: 'new-list-only' });
  assert.equal(controller.getState().historyLoading, true); assert.equal(controller.getState().work.reviews_next_cursor, 'history-only');
  await controller.openWork('work-2'); pending.resolve({ items: [fixtureReview({ id: 'stale-history' })], next_cursor: null }); await history;
  assert.equal(controller.getState().work.id, 'work-2'); assert.equal(controller.getState().work.reviews.length, 1); assert.equal(controller.getState().filter.cursor, 'new-list-only'); controller.dispose();
  const waiting = deferred(); const other = harness({ workReviews: () => waiting.promise }); await other.controller.openWork('work-1');
  const old = other.controller.loadMoreHistory(); await other.controller.open('review-pending');
  assert.equal(other.controller.getState().work, null); assert.equal(other.controller.getState().historyLoading, false);
  waiting.resolve({ items: [], next_cursor: null }); await old; assert.equal(other.controller.getState().selected.id, 'review-pending'); other.controller.dispose();
});

test('作品历史会话切换与 401/403 清空 work/history，旧账号回包不能复活', async () => {
  const waiting = deferred(); let session = 'A';
  const { controller } = harness({ workReviews: () => waiting.promise }, { getSession: () => session });
  await controller.openWork('work-1'); const pending = controller.loadMoreHistory(); session = 'B'; controller.block();
  waiting.resolve({ items: [fixtureReview()], next_cursor: null }); await pending;
  assert.equal(controller.getState().work, null); assert.equal(controller.getState().historyLoading, false); assert.equal(controller.getState().blocked, true); controller.dispose();
  for (const status of [401, 403]) {
    const other = harness({ workReviews: async () => { throw Object.assign(new Error('denied'), { status }); } }); await other.controller.openWork('work-1'); await other.controller.loadMoreHistory();
    assert.equal(other.controller.getState().work, null); assert.equal(other.controller.getState().blocked, true); other.controller.dispose();
  }
});

test('评论举报 withdraw 实际删除评论而作品仍 published；整书举报才下架且不重复删除', async () => {
  const { controller, fixture } = harness();
  assert.equal(await controller.govern('report', 'report-comment', 'withdraw', '仅移除违规评论'), true);
  const first = fixture.state(); assert.equal(first.comments[0].deleted, true); assert.equal(first.work.status, 'published'); assert.equal(first.work.comments, 3);
  const call = first.calls.find(item => item.path.endsWith('/reports/report-comment/decision'));
  const replay = await fixture.respond(call.path, { method: 'POST', body: call.body, operationId: call.operationId });
  assert.equal(replay.status, 200); assert.equal(fixture.state().work.comments, 3);
  assert.equal(await controller.govern('report', 'report-1', 'withdraw', '整书授权违规'), true); assert.equal(fixture.state().work.status, 'withdrawn'); controller.dispose();
});

test('写入成功但回包丢失以相同 UUID 取回收据；409 刷新相同版本后采用新 UUID，不循环冲突', async () => {
  let first = true, wrapped; const keys = [];
  const h = harness({ decide: async (id, body, options) => {
    keys.push(options.operationId); const result = await wrapped(id, body, options);
    if (first) { first = false; throw new Error('response lost after commit'); } return result;
  } }); wrapped = h.api.decide;
  await h.controller.open('review-reviewing'); h.controller.changeReason('人工驳回依据');
  assert.equal(await h.controller.mutate('reject'), false); assert.equal(h.controller.getState().notice, '');
  assert.equal(await h.controller.mutate('reject'), true); assert.equal(keys[0], keys[1]); assert.equal(h.controller.getState().selected.version, 3); h.controller.dispose();
  const other = harness(); await other.controller.open('review-reviewing'); other.controller.changeReason('冲突后保留理由'); other.fixture.configure({ scenario: 'conflict' });
  assert.equal(await other.controller.mutate('reject'), false); assert.equal(await other.controller.mutate('reject'), false);
  other.fixture.configure({ scenario: 'normal' }); await other.controller.open('review-reviewing', { preserveReason: true }); assert.equal(await other.controller.mutate('reject'), true);
  const calls = other.calls.filter(call => call.path.endsWith('/decision')); assert.equal(calls.length, 2); assert.notEqual(calls[0].request.headers['Idempotency-Key'], calls[1].request.headers['Idempotency-Key']); other.controller.dispose();
});

test('网络/超时/冲突错误不泄漏原始响应，也不把失败当默认配置或空成功', () => {
  assert.match(safeReviewError({ code: 'TIMEOUT', message: 'secret-token' }).message, /超时/);
  assert.match(safeReviewError({ status: 409 }).message, /理由草稿已保留/);
  assert.doesNotMatch(safeReviewError(new Error('secret-token')).message, /secret-token/);
});
