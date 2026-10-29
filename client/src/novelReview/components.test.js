import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { fixtureReview, fixtureWork } from './fixture.js';
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

test('小说审核页复用现有 AdminLayout/Modal 及认证的权限与幂等模型，不保留旧发布入口', () => {
  const page = source('../pages/admin/novels.jsx'), components = source('./components.jsx'), model = source('./model.js');
  assert.match(page, /AdminLayout/); assert.match(page, /NovelReviewConsole/); assert.doesNotMatch(page, /novelStatus|changeStatus/);
  assert.match(model, /babyVerification\/model\.js/); assert.match(model, /createDecisionOperationStore/);
  for (const term of ['Modal', 'auth-session-changing', 'admin-session-rejected', 'pagehide', 'storage', 'adminSessionKey']) assert.ok(components.includes(term), term);
  assert.match(components, /state\.needsReload/); assert.match(components, /state\.saving/);
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
  const request = async (path, body, token = 'fixture-1') => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    const entry = await fetch(base + '/__novel/start'); assert.equal(entry.status, 200); assert.match(await entry.text(), /仅内存验收/);
    const auth = await fetch(base + '/api/auth/me').then(response => response.json()); assert.equal(auth.role, 'admin'); assert.match(auth.username, /fixture/);
    assert.equal((await request('/api/admin/novels/rebuild/reviews', undefined, 'not-a-fixture-token')).status, 403);
    const list = await request('/api/admin/novels/rebuild/reviews?status=pending').then(response => response.json()); assert.equal(list.items.length, 1);
    const claim = await request('/api/admin/novels/rebuild/reviews/review-pending/claim', {}).then(response => response.json()); assert.equal(claim.status, 'reviewing');
    const ai = await request('/api/admin/novels/rebuild/reviews/review-pending/ai', { chapter_id: 'chapter-1', offset: 0 }).then(response => response.json()); assert.equal(ai.next_offset, 12000); assert.match(ai.findings, /仅内存模拟/);
    const work = await request('/api/admin/novels/rebuild/works/work-1').then(response => response.json()); assert.equal(work.reviews.length, 50); assert.ok(work.reviews_next_cursor);
    const history = await request('/api/admin/novels/rebuild/works/work-1/reviews?cursor=' + work.reviews_next_cursor + '&limit=20').then(response => response.json()); assert.equal(history.items.length, 20); assert.ok(history.next_cursor);
    const tail = await request('/api/admin/novels/rebuild/works/work-1/reviews?cursor=' + history.next_cursor + '&limit=20').then(response => response.json()); assert.equal(tail.items.length, 3); assert.equal(tail.next_cursor, null);
    await request('/api/admin/novels/rebuild/reports/report-comment/decision', { decision: 'withdraw', reason: '仅删除被举报评论' });
    const memory = await fetch(base + '/__novel/state').then(response => response.json()); assert.equal(memory.work.status, 'published'); assert.equal(memory.comments[0].deleted, true);
  } finally { await host.close(); }
});
