import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { fixtureAIPolicy, fixtureAutoReview, fixtureReview, fixtureWork } from './fixture.js';
import { initialReviewState } from './model.js';
import { createNovelFixtureServer } from '../../tests/novel-review-fixture-server.js';

const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('真实 React 元数据/差异/审核历史/作品目录呈现完整信息，文本经过 React 转义', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
  try {
    const { NovelMetadata, ChangeSummary, ReviewHistory, WorkDetails } = await server.ssrLoadModule('/src/novelReview/components.jsx');
    const item = fixtureReview({ description: '完整简介尾部 <script>not executable</script>', authorization: '完整授权尾部', statements: ['第一项声明', '最后一项声明'] });
    const markup = renderToStaticMarkup(React.createElement(NovelMetadata, { item }));
    for (const text of ['完整授权尾部', '最后一项声明', 'fixture_author', '42', '完整简介尾部', '&lt;script&gt;']) assert.ok(markup.includes(text), text);
    assert.ok(!markup.includes('<script>'));
    const changes = renderToStaticMarkup(React.createElement(ChangeSummary, { changes: item.changes, baseReleaseId: item.base_release_id }));
    for (const text of ['简介', '标签', '修改', '新增', 'chapter-2', 'release-previous']) assert.ok(changes.includes(text), text);
    const unknown = renderToStaticMarkup(React.createElement(ChangeSummary, { changes: null })); assert.match(unknown, /不能据此推断/);
    const history = renderToStaticMarkup(React.createElement(ReviewHistory, { audit: [{ actor_id: 1, actor_name: '测试管理员', action: 'human_reject', reason: '完整人工驳回原因', created_at: 1793174400 }] }));
    for (const text of ['测试管理员', '人工驳回', '完整人工驳回原因']) assert.ok(history.includes(text));
    const automatic = renderToStaticMarkup(React.createElement(ReviewHistory, { audit: [{ actor_type: 'system', actor_name: '自动审核', action: 'auto_needs_human', reason: '策略关闭，转人工', created_at: 1793174400 }] }));
    assert.match(automatic, /自动审核转人工/); assert.match(automatic, /策略关闭，转人工/);
    const passed = renderToStaticMarkup(React.createElement(ReviewHistory, { audit: [{ actor_type: 'system', actor_name: '自动审核', action: 'auto_passed', reason: '自动分块完成', created_at: 1793174400 }] })); assert.match(passed, /自动审核通过/);
    const work = renderToStaticMarkup(React.createElement(WorkDetails, { work: fixtureWork(), onReview() {} }));
    for (const text of ['完整目录', 'chapter-1', 'chapter-2', '审核版本历史', '打开该候选全文']) assert.ok(work.includes(text));
  } finally { await server.close(); }
});

test('历史分页真实 React 按钮有 loading/错误/末页状态，点击绑定独立 history lane', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
  try {
    const { WorkHistoryPager } = await server.ssrLoadModule('/src/novelReview/components.jsx');
    let calls = 0; const controller = { loadMoreHistory() { calls += 1; } };
    const state = { work: fixtureWork({ reviews_next_cursor: 'history:50' }), historyError: '', historyLoading: false };
    const element = WorkHistoryPager({ state, controller });
    const button = element.props.children.find(child => child?.type === 'button'); button.props.onClick(); assert.equal(calls, 1);
    assert.match(renderToStaticMarkup(element), /还有更多历史未加载/); assert.match(renderToStaticMarkup(element), /加载更多审核历史/);
    const busy = renderToStaticMarkup(React.createElement(WorkHistoryPager, { state: { ...state, historyLoading: true, historyError: '历史请求失败' }, controller }));
    assert.match(busy, /disabled/); assert.match(busy, /正在加载历史/); assert.match(busy, /历史请求失败/);
    const tail = renderToStaticMarkup(React.createElement(WorkHistoryPager, { state: { ...state, work: fixtureWork() }, controller }));
    assert.match(tail, /历史末页/); assert.doesNotMatch(tail, /<button/);
  } finally { await server.close(); }
});

test('人工决定真实 React 按钮不要求正文 / 认领 / 理由，他人认领仍可决定 / 接手', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
  const buttons = element => {
    if (!element || typeof element !== 'object') return [];
    if (element.type === 'button') return [element];
    return React.Children.toArray(element.props?.children).flatMap(buttons);
  };
  try {
    const { ReviewDecision, ReviewDetail } = await server.ssrLoadModule('/src/novelReview/components.jsx');
    const { ConfirmProvider } = await server.ssrLoadModule('/src/pages/admin/ui.jsx');
    for (const item of [fixtureReview(), fixtureReview({ status: 'reviewing', claimed_by: 2 })]) {
      const state = { ...initialReviewState(), selected: item }, decisions = [], mutations = [];
      const element = ReviewDecision({ state, adminId: 1, controller: { mutate: action => mutations.push(action) }, onDecide: action => decisions.push(action) });
      const actions = buttons(element);
      for (const label of ['人工通过', '人工驳回']) { const button = actions.find(entry => entry.props.children === label); assert.ok(button); assert.equal(button.props.disabled, false); button.props.onClick(); }
      assert.deepEqual(decisions, ['approve', 'reject']);
      actions.find(entry => /可选/.test(entry.props.children)).props.onClick(); assert.deepEqual(mutations, ['claim']);
      const markup = renderToStaticMarkup(element); assert.match(markup, /审核理由（选填/); assert.doesNotMatch(markup, /必须认领|通读所有|审核理由（必填/);
      const detail = renderToStaticMarkup(React.createElement(ConfirmProvider, null, React.createElement(ReviewDetail, { state, adminId: 1, controller: {} })));
      assert.doesNotMatch(detail, /他人认领.*只读|作决定前必须认领/); assert.match(detail, /认领仅用于协作|仅作协作提示/);
      for (const patch of [{ saving: true }, { needsReload: true }]) for (const button of buttons(ReviewDecision({ state: { ...state, ...patch }, adminId: 1, controller: {}, onDecide() {} }))) assert.equal(button.props.disabled, true);
    }
  } finally { await server.close(); }
});

test('手动 AI 真实 React 选章 / 全选 / 清空绑定控制器，进度只称所选且无需 claim / body', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
  const find = (element, type) => !element || typeof element !== 'object' ? [] : [...(element.type === type ? [element] : []), ...React.Children.toArray(element.props?.children).flatMap(child => find(child, type))];
  try {
    const { AIReview } = await server.ssrLoadModule('/src/novelReview/components.jsx');
    const state = { ...initialReviewState(), selected: fixtureReview(), selectedChapterIds: ['chapter-2'] }, calls = [];
    const controller = { startAI: () => calls.push('start'), selectChangedAIChapters: () => calls.push('changed'), selectAIChapters: ids => calls.push(ids) };
    const element = AIReview({ state, controller, allowed: true }), actions = find(element, 'button');
    for (const label of ['选择变更章节', '全选章节', '清空选择', '开始所选章节 AI 辅助检查']) actions.find(button => button.props.children === label).props.onClick();
    assert.deepEqual(calls, ['changed', ['chapter-1', 'chapter-2'], [], 'start']);
    const checkboxes = find(element, 'input'); assert.deepEqual(checkboxes.map(input => input.props.checked), [false, true]);
    checkboxes[0].props.onChange({ target: { checked: true } }); assert.deepEqual(calls.at(-1), ['chapter-2', 'chapter-1']);
    assert.equal(find(element, 'fieldset')[0].props.disabled, false);
    const markup = renderToStaticMarkup(element); assert.match(markup, /无需认领或预先加载正文/); assert.match(markup, /本次所选章节已完成 0 \/ 1 章/); assert.match(markup, /不代表未选章节已检查/); assert.doesNotMatch(markup, /完整覆盖|全文 AI|先.*认领/);
    const empty = AIReview({ state: { ...state, selectedChapterIds: [] }, controller, allowed: true }); assert.equal(find(empty, 'button').at(-1).props.disabled, true);
  } finally { await server.close(); }
});

test('自动摘要真实 React 显示排队 / 失败原因 / 依据 / 覆盖提示并转义 HTML，旧记录不伪造结论', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
  try {
    const { AutoReviewSummary } = await server.ssrLoadModule('/src/novelReview/components.jsx');
    const summary = fixtureAutoReview({ status: 'needs_human', completed_chunks: 1, reason: '预算用尽 <script>bad</script>', failure_code: 'JOB_CALL_LIMIT', findings: [{ chapter_id: 'chapter-2', field: 'authorization', reason: '需要核对授权', evidence: '<img src=x onerror=bad>' }] });
    const markup = renderToStaticMarkup(React.createElement(AutoReviewSummary, { value: summary }));
    for (const text of ['需人工处理', '1 / 3', '预算用尽', 'JOB_CALL_LIMIT', '需要核对授权', '&lt;script&gt;', '&lt;img', '任何管理员均可', '不会锁定人工操作']) assert.ok(markup.includes(text), text);
    assert.doesNotMatch(markup, /<script>|<img /);
    const compact = renderToStaticMarkup(React.createElement(AutoReviewSummary, { value: summary, compact: true })); assert.match(compact, /预算用尽/); assert.match(compact, /JOB_CALL_LIMIT/);
    assert.match(renderToStaticMarkup(React.createElement(AutoReviewSummary, { value: fixtureAutoReview() })), /自动审核排队中/);
    assert.match(renderToStaticMarkup(React.createElement(AutoReviewSummary, { value: null })), /无自动审核记录/);
  } finally { await server.close(); }
});

test('策略真实 React 有加载 / 失败 / 保存 / 409 / 真实成功状态，无客户端默认预算或密钥表单', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
  try {
    const { NovelAIPolicy } = await server.ssrLoadModule('/src/novelReview/components.jsx');
    const render = policy => renderToStaticMarkup(React.createElement(NovelAIPolicy, { state: { ...initialReviewState(), policy }, controller: {} }));
    const initial = initialReviewState().policy;
    assert.match(render(initial), /不会使用客户端默认值/); assert.doesNotMatch(render(initial), /value="200"|value="256"/);
    assert.match(render({ ...initial, loading: true }), /正在加载服务器策略/); assert.match(render({ ...initial, error: '加载失败' }), /加载失败/);
    const policy = { ...initial, saved: fixtureAIPolicy(), draft: { enabled: true, daily_call_limit: '400', job_call_limit: '128' }, needsReload: false };
    const markup = render(policy); for (const text of ['每日最大调用次数', '单任务最大调用次数', '不是 token 预算', '不禁用手动辅助', 'min="1"', 'max="10000"', 'max="2048"']) assert.ok(markup.includes(text), text);
    assert.doesNotMatch(markup, /type="password"|api_token|base_url/);
    assert.match(render({ ...policy, saving: true }), /正在保存/);
    const conflict = render({ ...policy, needsReload: true, error: '草稿已保留，未覆盖服务器' }); assert.match(conflict, /草稿已保留/); assert.match(conflict, /重新加载确认最新策略/); assert.match(conflict, /disabled=""[^>]*>保存自动审核策略/);
    assert.match(render({ ...policy, notice: '服务器已确认保存自动审核策略' }), /服务器已确认保存/);
  } finally { await server.close(); }
});

test('小说审核页复用现有 AdminLayout/Modal 及认证的权限与幂等模型，不保留旧发布入口', () => {
  const page = source('../pages/admin/novels.jsx'), components = source('./components.jsx'), model = source('./model.js');
  assert.match(page, /AdminLayout/); assert.match(page, /NovelReviewConsole/); assert.doesNotMatch(page, /novelStatus|changeStatus/);
  assert.match(model, /babyVerification\/model\.js/); assert.match(model, /createDecisionOperationStore/);
  for (const term of ['Modal', 'auth-session-changing', 'admin-session-rejected', 'pagehide', 'storage', 'adminSessionKey']) assert.ok(components.includes(term), term);
  assert.match(components, /state\.needsReload/); assert.match(components, /state\.saving/);
  assert.match(components, /aria-label="自动审核筛选"/); assert.match(components, /load\(\{ auto_filter: event\.target\.value \}\)/);
  assert.doesNotMatch(components, /作决定前必须认领|通过前请加载并通读|发布只由服务器接受人工审核|当前只读/);
  assert.match(components, /逐章加载全部正文/); assert.match(components, /完整候选目录与正文/); assert.match(components, /同章偏移/); assert.match(components, /取消 AI 检查/);
  assert.doesNotMatch(components, /dangerouslySetInnerHTML|\.body\.(?:slice|substring)/);
});

test('小说样式全部使用现有三主题语义变量，移动布局不依赖固定表宽或硬编码颜色', () => {
  const css = postcss.parse(source('./review.css'));
  css.walkDecls(decl => { if (/color|background|border|outline|fill|stroke/.test(decl.prop)) assert.doesNotMatch(decl.value, /#[\da-f]{3,8}\b|\b(?:white|black)\b/i, decl.toString()); });
  assert.ok(css.nodes.some(node => node.type === 'atrule' && node.name === 'media' && node.params.includes('700px')));
  assert.match(source('./review.css'), /overflow-wrap: anywhere/); assert.match(source('./review.css'), /prefers-reduced-motion/);
  for (const name of ['text', 'surface', 'border', 'action', 'warning']) assert.match(source('./review.css'), new RegExp(`var\\(--ac-${name}`));
});

test('本地验收服务器仅接受合成凭据，所有小说写入只改变内存，AI 不出网', async () => {
  const host = await createNovelFixtureServer();
  await new Promise(resolve => host.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${host.server.address().port}`;
  const request = async (path, body, token = 'fixture-1', method = body ? 'POST' : 'GET') => fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    const entry = await fetch(base + '/__novel/start'); assert.equal(entry.status, 200); assert.match(await entry.text(), /仅内存验收/);
    const auth = await fetch(base + '/api/auth/me').then(response => response.json()); assert.equal(auth.role, 'admin'); assert.match(auth.username, /fixture/);
    assert.equal((await request('/api/admin/novels/rebuild/reviews', undefined, 'not-a-fixture-token')).status, 403);
    const list = await request('/api/admin/novels/rebuild/reviews?status=pending').then(response => response.json()); assert.equal(list.items.length, 3);
    const queued = await request('/api/admin/novels/rebuild/reviews?status=pending&auto_filter=queued').then(response => response.json()); assert.deepEqual(queued.items.map(item => item.id), ['review-auto-queued']);
    const failed = await request('/api/admin/novels/rebuild/reviews?status=reviewing&auto_filter=needs_human').then(response => response.json()); assert.equal(failed.items.find(item => item.id === 'review-auto-failure').auto_review.failure_code, 'JOB_CALL_LIMIT');
    const policy = await request('/api/admin/novels/rebuild/ai-policy').then(response => response.json()); assert.deepEqual(policy, fixtureAIPolicy());
    const saved = await request('/api/admin/novels/rebuild/ai-policy', { ...policy, daily_call_limit: 300 }, 'fixture-1', 'PUT').then(response => response.json()); assert.equal(saved.daily_call_limit, 300); assert.notEqual(saved.revision, policy.revision);
    assert.equal((await request('/api/admin/novels/rebuild/ai-policy', policy, 'fixture-2', 'PUT')).status, 409);
    const direct = await request('/api/admin/novels/rebuild/reviews/review-auto-failure/decision', { decision: 'reject', version: 2 }, 'fixture-1').then(response => response.json()); assert.equal(direct.review.status, 'rejected'); assert.equal(direct.review.reason, '');
    const claim = await request('/api/admin/novels/rebuild/reviews/review-pending/claim', {}).then(response => response.json()); assert.equal(claim.status, 'reviewing');
    const ai = await request('/api/admin/novels/rebuild/reviews/review-pending/ai', { chapter_id: 'chapter-1', offset: 0 }).then(response => response.json()); assert.equal(ai.next_offset, 12000); assert.match(ai.findings, /仅内存模拟/);
    const work = await request('/api/admin/novels/rebuild/works/work-1').then(response => response.json()); assert.equal(work.reviews.length, 50); assert.ok(work.reviews_next_cursor);
    const history = await request('/api/admin/novels/rebuild/works/work-1/reviews?cursor=' + work.reviews_next_cursor + '&limit=20').then(response => response.json()); assert.equal(history.items.length, 20); assert.ok(history.next_cursor);
    const tail = await request('/api/admin/novels/rebuild/works/work-1/reviews?cursor=' + history.next_cursor + '&limit=20').then(response => response.json()); assert.equal(tail.items.length, 7); assert.equal(tail.next_cursor, null);
    await request('/api/admin/novels/rebuild/reports/report-comment/decision', { decision: 'withdraw', reason: '仅删除被举报评论' });
    const memory = await fetch(base + '/__novel/state').then(response => response.json()); assert.equal(memory.work.status, 'published'); assert.equal(memory.comments[0].deleted, true);
  } finally { await host.close(); }
});
