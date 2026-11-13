import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import { FIXTURE_BODY, FIXTURE_HASH, fixtureAIPolicy, fixtureAutoReview, fixtureReview, fixtureWork } from './fixture.js';
import { initialReviewState } from './model.js';
import { createNovelFixtureServer } from '../../tests/novel-review-fixture-server.js';

const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const elements = (element, predicate) => !element || typeof element !== 'object' ? [] : [...(predicate(element) ? [element] : []), ...React.Children.toArray(element.props?.children).flatMap(child => elements(child, predicate))];
const nodes = (element, type) => elements(element, child => child.type === type);
const contentText = value => Array.isArray(value) ? value.map(contentText).join('') : value == null || typeof value === 'boolean' ? '' : typeof value === 'object' ? contentText(value.props?.children) : String(value);
const actionButton = (element, label) => nodes(element, 'button').find(button => contentText(button.props.children) === label);
async function withViews(run) {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
  try { await run(await server.ssrLoadModule('/src/novelReview/components.jsx'), server); }
  finally { await server.close(); }
}

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
    for (const item of [fixtureReview(), fixtureReview({ status: 'reviewing', claimed_by: 2 }), fixtureReview({ work_type: 'repost' }), fixtureReview({ work_type: 'ai' })]) {
      const state = { ...initialReviewState(), selected: item }, decisions = [], mutations = [];
      const element = ReviewDecision({ state, adminId: 1, controller: { mutate: action => mutations.push(action) }, onDecide: action => decisions.push(action) });
      const actions = buttons(element);
      for (const label of ['人工通过', '人工驳回']) { const button = actions.find(entry => entry.props.children === label); assert.ok(button); assert.equal(button.props.disabled, false); button.props.onClick(); }
      assert.deepEqual(decisions, ['approve', 'reject']);
      actions.find(entry => /可选/.test(entry.props.children)).props.onClick(); assert.deepEqual(mutations, ['claim']);
      const markup = renderToStaticMarkup(element); assert.match(markup, /审核理由（选填/); assert.doesNotMatch(markup, /必须认领|通读所有|审核理由（必填/);
      const detail = renderToStaticMarkup(React.createElement(ConfirmProvider, null, React.createElement(ReviewDetail, { state, adminId: 1, controller: {} })));
      assert.doesNotMatch(detail, /他人认领.*只读|作决定前必须认领/); assert.match(detail, /认领仅用于协作|仅作协作提示/);
      for (const patch of [{ saving: true }, { needsReload: true }]) {
        const locked = ReviewDecision({ state: { ...state, ...patch }, adminId: 1, controller: {}, onDecide() {} });
        for (const button of buttons(locked)) assert.equal(button.props.disabled, true);
      }
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

test('四分类使用共享 Tabs，方向键 / Home / End 可定位，页面不重复壳标题', async () => {
  await withViews(({ NovelTabs }) => {
    const calls = [], element = NovelTabs({ value: 'reviews', onChange: value => calls.push(value) });
    const markup = renderToStaticMarkup(element);
    for (const text of ['作品审核', '作品治理', '小说举报', '创作者限制', '小说管理分类']) assert.ok(markup.includes(text), text);
    assert.equal((markup.match(/role="tab"/g) || []).length, 4);
    const targets = ['reviews', 'works', 'reports', 'creators'].map(value => ({ focus: () => calls.push(`focus:${value}`), click: () => calls.push(value) }));
    for (const [key, index, expected] of [['ArrowRight', 0, 'works'], ['ArrowLeft', 0, 'creators'], ['Home', 2, 'reviews'], ['End', 1, 'creators']]) {
      let prevented = false;
      element.props.onKeyDown({ key, target: targets[index], currentTarget: { querySelectorAll: () => targets }, preventDefault: () => { prevented = true; } });
      assert.equal(prevented, true); assert.equal(calls.at(-1), expected); assert.equal(calls.at(-2), `focus:${expected}`);
    }
    assert.doesNotMatch(source('./components.jsx'), /<h1\b|title=\{MODES\.find/);
  });
});

test('筛选区区分搜索草稿 / 已应用条件，搜索、重置、自动筛选和刷新各自显式绑定', async () => {
  await withViews(({ NovelFilters }) => {
    const state = { ...initialReviewState(), filter: { status: 'reviewing', query: '已应用关键词', auto_filter: 'needs_human', cursor: 'page:20' }, page: { items: [], next_cursor: null } }, calls = [];
    const element = NovelFilters({ state, query: '未搜索的输入', onQuery: value => calls.push(['draft', value]), load: patch => calls.push(['load', patch]), refresh: () => calls.push('refresh') });
    const markup = renderToStaticMarkup(element);
    for (const text of ['已应用筛选', '已应用关键词', '输入尚未应用', '需人工处理（含旧记录 / 已取消）', '刷新与状态筛选沿用已应用关键词']) assert.ok(markup.includes(text), text);
    nodes(element, 'form')[0].props.onSubmit({ preventDefault() {} });
    nodes(element, 'select').find(select => select.props.id === 'nr-filter-auto').props.onChange({ target: { value: 'queued' } });
    actionButton(element, '刷新服务器列表').props.onClick();
    actionButton(element, '重置筛选').props.onClick();
    assert.deepEqual(calls, [['load', { query: '未搜索的输入' }], ['load', { auto_filter: 'queued' }], 'refresh', ['draft', ''], ['load', { query: '', status: 'pending', auto_filter: 'all' }]]);
    const reports = renderToStaticMarkup(React.createElement(NovelFilters, { state: { ...state, mode: 'reports' }, query: '', onQuery() {}, load() {}, refresh() {} }));
    assert.doesNotMatch(reports, /<input|<select/); assert.match(reports, /仅展示接口提供/);
  });
});

test('列表未知 / loading / error retry / 空页 / 游标分页不是同一种状态，不伪造计数', async () => {
  await withViews(({ NovelList }) => {
    const calls = [], base = { state: initialReviewState(), controller: { loadList: value => calls.push(value) }, query: '', onQuery() {}, load() {}, refresh: () => calls.push('refresh-current-page'), cursors: [null], onPrevious: () => calls.push('previous'), onNext: () => calls.push('next'), onOpen() {} };
    const render = patch => renderToStaticMarkup(React.createElement(NovelList, { ...base, state: { ...base.state, ...patch } }));
    assert.match(render({}), /尚未取得服务器记录，不能判断队列是否为空/);
    const loading = render({ loading: true }); assert.match(loading, /aria-busy="true"/); assert.match(loading, /尚未取得本次服务器结果/); assert.doesNotMatch(loading, /当前页 0 条/);
    const failure = NovelList({ ...base, state: { ...base.state, listError: '请求超时' } });
    assert.match(renderToStaticMarkup(failure), /失败，不代表队列为空/);
    actionButton(failure, '重试当前筛选与页码').props.onClick(); assert.equal(calls.at(-1), 'refresh-current-page');
    const empty = render({ page: { items: [], next_cursor: null } }); assert.match(empty, /服务器没有返回符合当前筛选/); assert.match(empty, /不是待处理总量/);
    const next = NovelList({ ...base, selectedId: 'review-pending', state: { ...base.state, page: { items: [fixtureReview()], next_cursor: 'page:40' } } });
    assert.equal(actionButton(next, '上一页').props.disabled, false); assert.equal(actionButton(next, '下一页').props.disabled, false);
    actionButton(next, '上一页').props.onClick(); actionButton(next, '下一页').props.onClick(); assert.deepEqual(calls.slice(-2), ['previous', 'next']);
    const markup = renderToStaticMarkup(next); assert.match(markup, /当前详情：审核 #review-pending/); assert.match(markup, /第 2 页/);
  });
});

test('三类队列桌面表格与手机卡片保留目标 ID / 状态 / 当前详情，上下文与按钮可访问', async () => {
  await withViews(({ NovelRecords }) => {
    const report = { id: 'report-comment', work_id: 'work-1', work_title: '评论举报目标', chapter_id: 'chapter-2', comment_id: 'comment-1', reason: '完整举报理由 <script>不执行</script>', status: 'pending', reporter: { id: 43 }, created_at: 1793174400 };
    for (const [mode, item, expected] of [['reviews', fixtureReview({ claimed_by: 2 }), ['审核版本', '协作认领 #2（不限制决定）']], ['works', fixtureWork(), ['发布版本', 'release-previous']], ['reports', report, ['仅评论 #comment-1', '完整举报理由']]]) {
      const markup = renderToStaticMarkup(React.createElement(NovelRecords, { state: { ...initialReviewState(), mode, page: { items: [item], next_cursor: null } }, selectedId: item.id, onOpen() {} }));
      for (const text of [...expected, 'ac-desktop-only', 'ac-mobile-only', 'scope="col"', 'aria-current="true"', item.id, '当前详情']) assert.ok(markup.includes(text), text);
      assert.doesNotMatch(markup, /<script>/); assert.match(markup, /<table/); assert.match(markup, /aria-label="当前页小说管理记录"/);
    }
    const css = source('./review.css');
    assert.match(css, /\.nr-desktop-records\.ac-desktop-only \{ display: none/);
    assert.match(css, /\.nr-mobile-records\.ac-mobile-only \{ display: none/);
    assert.match(css, /focus-visible/); assert.match(css, /min-height: 44px/); assert.match(css, /table-layout: fixed/);
  });
});

test('冻结正文完整保留首尾 / 空白 / HTML 转义，独立加载、停止与重试不启动 AI', async () => {
  await withViews(({ ReviewBodies }) => {
    const item = fixtureReview(), calls = [], state = { ...initialReviewState(), selected: item, bodies: { 'chapter-1': { id: 'chapter-1', generation: 2, body_sha256: FIXTURE_HASH, body: FIXTURE_BODY } }, bodyError: '另一个章节加载失败' };
    const controller = { loadBodies: id => calls.push(id ?? 'all'), cancelBodies: () => calls.push('cancel') };
    const element = ReviewBodies({ state, controller }), markup = renderToStaticMarkup(element);
    for (const text of ['冻结候选快照', 'review-pending', '版本 1', 'Generation', FIXTURE_HASH, '完整章节开头', '完整章节末尾：不能被截断。', '已加载 1 / 2 章', '目录不是正文预览']) assert.ok(markup.includes(text), text);
    actionButton(element, '逐章加载全部正文').props.onClick(); actionButton(element, '重试加载未完成正文').props.onClick(); actionButton(element, '加载本章全文').props.onClick();
    assert.deepEqual(calls, ['all', 'all', 'chapter-2']);
    const running = ReviewBodies({ state: { ...state, bodyLoading: true }, controller }); actionButton(running, '停止正文加载').props.onClick(); assert.equal(calls.at(-1), 'cancel');
    const unsafe = renderToStaticMarkup(React.createElement(ReviewBodies, { state: { ...state, bodyError: '', bodies: { 'chapter-1': { body: '  开头\n<script>文本</script>\n末尾  ' }, 'chapter-2': { body: '' } } }, controller }));
    assert.match(unsafe, /  开头\n&lt;script&gt;文本&lt;\/script&gt;\n末尾  /); assert.match(unsafe, /本章正文为空/); assert.doesNotMatch(unsafe, /<script>/);
    for (const patch of [{ saving: true }, { needsReload: true }]) assert.equal(actionButton(ReviewBodies({ state: { ...state, ...patch }, controller }), '加载本章全文').props.disabled, true);
  });
});

test('详情包含全部冻结快照区段、就近人工动作与焦点目标，渲染不发出 AI 或决定请求', async () => {
  await withViews(async ({ ReviewDetail }, server) => {
    const { ConfirmProvider } = await server.ssrLoadModule('/src/pages/admin/ui.jsx'), calls = [];
    const state = { ...initialReviewState(), selected: fixtureReview({ status: 'reviewing', version: 2, claimed_by: 2, auto_review: fixtureAutoReview() }) };
    const controller = { startAI: () => calls.push('AI'), mutate: () => calls.push('mutate'), open: () => calls.push('open') };
    const markup = renderToStaticMarkup(React.createElement(ConfirmProvider, null, React.createElement(ReviewDetail, { state, controller, adminId: 1 })));
    for (const name of ['decision', 'metadata', 'changes', 'bodies', 'automatic', 'manual-ai', 'history']) assert.ok(markup.includes(`data-nr-section="${name}"`), name);
    for (const text of ['data-nr-detail-focus', '当前审核目标', '作品 #work-1', '审核 #review-pending', '版本 2', '候选详情章节导航', '刷新当前详情（保留理由）']) assert.ok(markup.includes(text), text);
    assert.ok(markup.indexOf('人工审核决定 ·') < markup.indexOf('完整作品与作者信息'));
    assert.deepEqual(calls, []);
    const code = source('./components.jsx'); assert.match(code, /section\?\.focus\(\)/); assert.match(code, /data-nr-detail-focus/); assert.match(code, /preserveReason: true/);
    assert.doesNotMatch(code, /setInterval|import.*fixture|dangerouslySetInnerHTML/);
  });
});

test('动作反馈 busy / 未确认 / 409 / 成功各有局部状态，重载不会重放决定', async () => {
  await withViews(({ ActionFeedback, ReviewDecision }) => {
    let reloads = 0;
    const feedback = ActionFeedback({ busy: false, error: '409 版本变化', needsReload: true, onReload: () => { reloads += 1; } });
    const markup = renderToStaticMarkup(feedback);
    for (const text of ['未记录为成功', '不会自动重放', '理由草稿未丢弃', '重新加载详情并保留理由', 'role="alert"']) assert.ok(markup.includes(text), text);
    actionButton(feedback, '重新加载详情并保留理由').props.onClick(); assert.equal(reloads, 1);
    const busy = ActionFeedback({ busy: true, error: '网络未确认', needsReload: true, onReload() {} }); assert.equal(actionButton(busy, '重新加载详情并保留理由').props.disabled, true); assert.match(renderToStaticMarkup(busy), /请勿重复提交/);
    assert.match(renderToStaticMarkup(React.createElement(ActionFeedback, { notice: '服务器已确认人工通过。' })), /role="status"/);
    const calls = [], state = { ...initialReviewState(), selected: fixtureReview(), reason: '保留人工理由', needsReload: true, error: '版本更新' };
    const decision = ReviewDecision({ state, adminId: 1, controller: { open: (...args) => calls.push(args) }, onDecide() {} });
    assert.equal(actionButton(decision, '人工通过').props.disabled, true);
    const local = elements(decision, child => child.type === ActionFeedback)[0]; local.props.onReload(); assert.deepEqual(calls, [['review-pending', { preserveReason: true }]]);
    assert.match(renderToStaticMarkup(decision), /保留人工理由/);
  });
});

test('治理按钮保持必填理由、发布状态限制、评论作用域与失败后先重读的安全约束', async () => {
  await withViews(({ GovernanceControls, ReportDetails }) => {
    const work = fixtureWork(), calls = [];
    const props = { target: { kind: 'work', id: work.id }, state: { ...initialReviewState(), work }, reason: '核对后的操作依据', onReason() {}, onSubmit: action => calls.push(action), onRefresh: () => calls.push('refresh') };
    const published = GovernanceControls(props); assert.equal(actionButton(published, '下架作品').props.disabled, false); assert.equal(actionButton(published, '恢复已批准作品').props.disabled, true);
    actionButton(published, '下架作品').props.onClick(); assert.deepEqual(calls, ['withdraw']);
    for (const patch of [{ reason: '' }, { reason: '   ' }, { reason: '含\0空字符' }, { reason: 'x'.repeat(2001) }, { busy: true }, { confirmed: true }, { unconfirmed: true }]) assert.equal(actionButton(GovernanceControls({ ...props, ...patch }), '下架作品').props.disabled, true);
    for (const workPatch of [{ status: 'draft' }, { status: 'pending' }, { status: 'rejected' }, { status: 'withdrawn', release_id: null }]) assert.equal(actionButton(GovernanceControls({ ...props, state: { ...props.state, work: fixtureWork(workPatch) } }), '恢复已批准作品').props.disabled, true);
    assert.equal(actionButton(GovernanceControls({ ...props, state: { ...props.state, work: fixtureWork({ status: 'withdrawn' }) } }), '恢复已批准作品').props.disabled, false);
    const reason = nodes(published, 'textarea')[0]; assert.equal(reason.props.required, true); assert.equal(reason.props.maxLength, 2000);
    const report = { id: 'report-comment', work_id: work.id, work_title: work.title, comment_id: 'comment-1', reason: '举报依据', status: 'pending' };
    const reportControls = GovernanceControls({ ...props, target: { kind: 'report', id: report.id, report } });
    assert.ok(actionButton(reportControls, '移除被举报评论')); assert.equal(actionButton(reportControls, '下架被举报作品'), undefined);
    assert.match(renderToStaticMarkup(React.createElement(ReportDetails, { report })), /只针对该评论，不下架作品/);
    const stale = GovernanceControls({ ...props, target: { kind: 'report', id: report.id, report }, unconfirmed: true });
    assert.equal(actionButton(stale, '移除被举报评论').props.disabled, true); actionButton(stale, '重新读取举报列表核对本条').props.onClick(); assert.equal(calls.at(-1), 'refresh');
    const done = GovernanceControls({ ...props, target: { kind: 'report', id: report.id, report: { ...report, status: 'dismissed' } } }); assert.equal(actionButton(done, '忽略举报').props.disabled, true);
    const absent = GovernanceControls({ ...props, target: { kind: 'report', id: report.id, report, unavailable: true } }); assert.equal(actionButton(absent, '移除被举报评论').props.disabled, true);
  });
});

test('创作者权限无查询时明确未知，确切账号与理由不可缺少，不伪造资格恢复状态', async () => {
  await withViews(({ GovernanceControls }) => {
    const calls = [], props = { target: { kind: 'creator' }, state: initialReviewState(), reason: '独立小说权限治理依据', creatorId: '42', onReason() {}, onCreatorId: id => calls.push(id), onSubmit: action => calls.push(action) };
    const element = GovernanceControls(props), markup = renderToStaticMarkup(element);
    for (const text of ['当前资格状态：未知', '不更改宝宝认证、社区角色或徽章', '不接受昵称', '操作理由（必填']) assert.ok(markup.includes(text), text);
    assert.equal(actionButton(element, '限制创作者').props.disabled, false); assert.equal(actionButton(element, '恢复创作者').props.disabled, false);
    actionButton(element, '恢复创作者').props.onClick(); assert.deepEqual(calls, ['restore']);
    for (const creatorId of ['', '0', '-1', '昵称', '4.2']) assert.equal(actionButton(GovernanceControls({ ...props, creatorId }), '限制创作者').props.disabled, true);
    assert.equal(actionButton(GovernanceControls({ ...props, reason: ' ' }), '限制创作者').props.disabled, true);
    const uncertain = GovernanceControls({ ...props, unconfirmed: true }); assert.match(renderToStaticMarkup(uncertain), /接口没有资格查询/); assert.ok(actionButton(uncertain, '重试限制创作者'));
    const receipt = renderToStaticMarkup(GovernanceControls({ ...props, confirmed: true, state: { ...props.state, notice: '治理操作已由服务器确认。' } })); assert.match(receipt, /仅确认上次操作回执，不提供当前资格查询/);
  });
});

test('作品 / 举报 / 创作者详情都有当前目标、错误重试与完整上下文，历史独立追加', async () => {
  await withViews(async ({ GovernanceForm, WorkHistoryPager }, server) => {
    const { ConfirmProvider } = await server.ssrLoadModule('/src/pages/admin/ui.jsx');
    const render = (target, patch = {}) => renderToStaticMarkup(React.createElement(ConfirmProvider, null, React.createElement(GovernanceForm, { target, state: { ...initialReviewState(), ...patch }, controller: {}, onReview() {}, onRefreshReport() {} })));
    const work = fixtureWork(), target = { kind: 'work', id: work.id, item: work };
    assert.match(render(target, { workLoading: true }), /正在加载完整作品目录/);
    const failed = render(target, { workError: '作品请求失败' }); assert.match(failed, /重试作品详情/); assert.match(failed, /作品请求失败/); assert.match(failed, /当前治理目标/);
    const loaded = render(target, { work }); for (const text of ['作品 #work-1', '完整目录', '审核版本历史', '操作理由（必填']) assert.ok(loaded.includes(text), text);
    const report = { id: 'report-1', work_id: work.id, work_title: '举报作品', reason: '完整举报理由', status: 'pending' };
    const reportMarkup = render({ kind: 'report', id: report.id, report }); for (const text of ['举报 #report-1', '作品 #work-1', '完整举报理由', '下架操作影响该作品']) assert.ok(reportMarkup.includes(text), text);
    assert.match(render({ kind: 'report', id: report.id, report, unavailable: true }), /未返回本条举报，不能推断/);
    assert.match(render({ kind: 'creator' }), /当前资格状态：未知/);
    const history = WorkHistoryPager({ state: { work: fixtureWork({ reviews_next_cursor: 'history:50' }), historyError: '追加失败', historyLoading: false }, controller: {} }); assert.ok(actionButton(history, '重试加载更多审核历史'));
  });
});

test('手动 AI 的 running / 取消 / 续跑 / 完成只涵盖所选章节，分块意见不替代人工决定', async () => {
  await withViews(({ AIReview }) => {
    const calls = [], base = { ...initialReviewState(), selected: fixtureReview(), selectedChapterIds: ['chapter-1'] }, controller = { startAI: () => calls.push('start'), cancelAI: () => calls.push('cancel') };
    const running = AIReview({ state: { ...base, ai: { ...base.ai, status: 'running', chapter_id: 'chapter-1', offset: 12000, chunks: 1, totalChapters: 1 } }, controller, allowed: true });
    assert.equal(actionButton(running, '正在检查所选章节…').props.disabled, true); actionButton(running, '取消 AI 检查').props.onClick(); assert.deepEqual(calls, ['cancel']);
    assert.match(renderToStaticMarkup(running), /同章偏移 12000/);
    for (const status of ['error', 'cancelled']) { const stopped = AIReview({ state: { ...base, ai: { ...base.ai, status, message: '未完成，不计为覆盖' } }, controller, allowed: true }); actionButton(stopped, '继续所选章节 AI 检查').props.onClick(); }
    assert.deepEqual(calls, ['cancel', 'start', 'start']);
    const complete = renderToStaticMarkup(React.createElement(AIReview, { state: { ...base, ai: { ...base.ai, status: 'complete', completedChapters: 1, totalChapters: 1, chunks: 2, results: [{ chapter_id: 'chapter-1', offset: 12000, next_offset: null, body_sha256: FIXTURE_HASH, findings: '<script>仅文字建议</script>' }] } }, controller, allowed: true }));
    for (const text of ['本次所选章节已完成 1 / 1 章', '不代表未选章节已检查', '不是审核决定', '重新检查所选章节', '&lt;script&gt;', FIXTURE_HASH]) assert.ok(complete.includes(text), text);
    assert.doesNotMatch(complete, /<script>/);
    for (const patch of [{ saving: true }, { needsReload: true }]) assert.equal(nodes(AIReview({ state: { ...base, ...patch }, controller, allowed: true }), 'fieldset')[0].props.disabled, true);
  });
});

test('策略保持折叠低频设置与真实服务器已保存值，未知 / dirty / 409 不静默生效', async () => {
  await withViews(({ NovelAIPolicy }) => {
    const initial = initialReviewState(), policy = { ...initial.policy, saved: fixtureAIPolicy(), needsReload: false, draft: { enabled: false, daily_call_limit: '200', job_call_limit: '256' } };
    const element = NovelAIPolicy({ state: { ...initial, policy }, controller: {} }), settings = nodes(element, 'details')[0];
    assert.equal(settings.props.open, undefined);
    const clean = renderToStaticMarkup(element); for (const text of ['低频设置', '服务器已关闭', 'fixture-policy-1', '表单与最近读取的服务器策略一致']) assert.ok(clean.includes(text), text);
    const dirty = renderToStaticMarkup(React.createElement(NovelAIPolicy, { state: { ...initial, policy: { ...policy, draft: { ...policy.draft, enabled: true } } }, controller: {} })); assert.match(dirty, /尚未生效/); assert.match(dirty, /服务器已保存：自动审核已关闭/);
    const failed = renderToStaticMarkup(React.createElement(NovelAIPolicy, { state: { ...initial, policy: { ...policy, error: '409 草稿已保留', needsReload: true } }, controller: {} })); assert.match(failed, /重新加载策略并核对版本/); assert.match(failed, /不会自动覆盖/);
    assert.match(source('../../package.json'), /src\/novelReview\/\*\.test\.js/);
    const code = source('./components.jsx'); assert.doesNotMatch(code, /providerAPI|fetch\(|setInterval\(|\.savePolicy\(\).*\.startAI/);
    const api = source('./api.js'); assert.match(api, /required: false/); assert.match(source('./model.js'), /body_sha256 !== expected\.body_sha256/);
  });
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
