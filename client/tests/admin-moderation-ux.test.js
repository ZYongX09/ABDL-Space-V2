import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import postcss from 'postcss';
import { parse } from '@babel/parser';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const hasAlbum = existsSync(new URL('../src/pages/admin/albumReports.jsx', import.meta.url));
const albumModel = hasAlbum ? await import('../src/pages/admin/albumReportsModel.js') : {};
const pages = ['posts', 'comments', 'reports', ...(hasAlbum ? ['albumReports'] : [])];
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const post = { id: 7, content: '完整帖子\n'.repeat(180), user: { id: 12, username: 'fixture-author' }, has_nsfw: false, pinned: false };
const comment = { id: 8, post_id: 7, content: '完整评论\n'.repeat(180), user: { id: 12, username: 'fixture-author' } };
const report = { id: 9, target_type: 'comment', target_id: 8, content_preview: comment.content, reason: '举报理由\n'.repeat(80), reporter_name: 'fixture-reporter', status: 'pending' };
const friend = { id: 9, request_username: 'fixture-request', request_title: '交友请求标题', request_description: '交友简介\n'.repeat(180), looking_for: 'fixture', reporter_name: 'fixture-reporter', status: 'pending' };
const albumReport = { id: 'album-report-1', album_id: 'album-7', album_name: 'fixture-album', owner_id: '12', reporter_id: '13', status: 'open', blocked_photo_count: 1, album_photo_count: 3 };
const albumPhotos = [
  { id: 'p1', admin_blocked: true, preview_url: 'https://example.invalid/blocked-preview.jpg' },
  { id: 'p2', admin_blocked: false, preview_url: '/fixture-preview-2.jpg' },
  { id: 'p3', admin_blocked: false, preview_url: '/fixture-preview-3.jpg' },
];

// 直接执行生产组件中的非 JSX 状态/事件逻辑；不启动 Vite、HTTP 服务或业务 API。
// 渲染标记与 CSS 另作静态断言，hooks 保留依赖、cleanup、异步重渲染与逐条锁语义。
function harness(name, apiOverrides = {}, confirmReply = async () => true) {
  const text = read(`src/pages/admin/${name}.jsx`);
  const start = text.indexOf('{', text.indexOf('export default function')) + 1;
  const endMarker = name === 'posts' || name === 'comments' ? '  const renderContent = ' : name === 'reports' ? '  const renderActions = ' : '  return (\n';
  const end = text.indexOf(endMarker, start);
  assert.ok(start > 0 && end > start, `${name} 状态逻辑可定位`);
  const returned = {
    posts: 'q, setQ, query, setQuery, resource, list, loading, error, busy, actionErrors, draftChanged, applySearch, resetSearch, load, togglePin, setNsfw, remove',
    comments: 'q, setQ, postId, setPostId, query, setQuery, resource, list, loading, error, busy, actionErrors, draftChanged, applySearch, resetSearch, load, remove',
    reports: 'query, setQuery, resource, list, loading, error, view, setView, dismissTarget, dismissReason, setDismissReason, busy, actionErrors, load, changeFilter, handleContent, acceptFriend, dismissFriend, openDismiss, closeDismiss',
    albumReports: 'query, setQuery, resource, list, loading, error, detailTarget, detail, checked, setChecked, previews, setPreviews, detailLoading, detailError, actionError, busy, diff, detailDisabled, blockedCount, loadList, openDetail, closeDetail, readDetail, refreshDetail, applyBlock, handleResolve',
  }[name];
  const calls = [], confirmations = [], successes = [], errors = [];
  let slots = [], cursor = 0, pendingEffects = [], dirty = true, output, disposed = false, lateUpdates = 0;
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const defaults = {
    posts: async () => ({ posts: [post], pagination: { total: 1, totalPages: 1 } }),
    listComments: async () => ({ comments: [comment], pagination: { total: 1, totalPages: 1 } }),
    reports: async () => ({ reports: [report], pagination: { total: 1 } }),
    friendRequestReports: async () => ({ reports: [friend], pagination: { total: 1 } }),
    pinPost: async () => ({ pinned: true }), setPostNsfw: async (_id, value) => ({ has_nsfw: value }),
    deletePost: async () => ({}), deleteComment: async () => ({}), resolveReport: async () => ({}),
    acceptFriendRequestReport: async () => ({}), dismissFriendRequestReport: async () => ({}),
    albumReports: async () => ({ reports: [albumReport], total: 1 }),
    albumReport: async id => ({ report: { ...albumReport, id: String(id) }, photos: albumPhotos }),
    blockAlbumPhotos: async (_id, ids) => ({ blocked_photo_ids: ids }), resolveAlbumReport: async () => ({}),
  };
  const adminAPI = Object.fromEntries(Object.entries({ ...defaults, ...apiOverrides }).map(([method, implementation]) => [method, (...args) => {
    calls.push({ method, args: plain(args) });
    return implementation(...args);
  }]));
  const context = {
    ...albumModel, adminAPI, PAGE_SIZE: 20,
    STATUS_LABELS: { pending: '待处理', resolved: '已处理', dismissed: '已驳回' },
    STATUS_TABS: [{ value: 'open', label: '待处理' }, { value: 'resolved', label: '已处理' }, { value: 'all', label: '全部' }],
    useToast: () => ({ success: text => successes.push(text), error: text => errors.push(text) }),
    useConfirm: () => async options => { confirmations.push(plain(options)); return confirmReply(options); },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) {
        const slot = { value: typeof initial === 'function' ? initial() : initial };
        slot.set = next => {
          if (disposed) { lateUpdates++; return; }
          const value = typeof next === 'function' ? next(slot.value) : next;
          if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; }
        };
        slots[index] = slot;
      }
      return [slots[index].value, slots[index].set];
    },
    useRef(initial) { const index = cursor++; if (!slots[index]) slots[index] = { current: initial }; return slots[index]; },
    useCallback(callback, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) slots[index] = { callback, deps };
      return slots[index].callback;
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || !sameDeps(slots[index].deps, deps)) {
        const previous = slots[index];
        slots[index] = { deps, cleanup: previous?.cleanup, effect };
        pendingEffects.push(index);
      }
    },
  };
  const component = runInNewContext(`(() => {${text.slice(start, end)}\nreturn { ${returned} }; })`, context);
  const render = () => {
    if (disposed) return output;
    for (let pass = 0; pass < 20; pass++) {
      dirty = false; cursor = 0; output = component();
      const effects = pendingEffects; pendingEffects = [];
      for (const index of effects) {
        const slot = slots[index]; slot.cleanup?.(); slot.cleanup = slot.effect();
      }
      if (!dirty) return output;
    }
    throw new Error(`${name} 出现重渲染循环`);
  };
  const flush = async () => {
    for (let turn = 0; turn < 8; turn++) { if (dirty) render(); await new Promise(resolve => setImmediate(resolve)); }
    if (dirty) render();
    return output;
  };
  const dispose = () => { for (const slot of slots) slot?.cleanup?.(); disposed = true; };
  const replayEffects = () => {
    for (const slot of slots) if (slot?.effect) { slot.cleanup?.(); slot.cleanup = undefined; slot.deps = undefined; }
    dirty = true; return render();
  };
  render();
  return { get state() { return output; }, calls, confirmations, successes, errors, render, flush, dispose, replayEffects, get lateUpdates() { return lateUpdates; } };
}

const listMethod = { posts: 'posts', comments: 'listComments', reports: 'reports', albumReports: 'albumReports' };
function payload(name, id, total = 1) {
  if (name === 'posts') return { posts: [{ ...post, id }], pagination: { total, totalPages: Math.max(1, Math.ceil(total / 20)) } };
  if (name === 'comments') return { comments: [{ ...comment, id }], pagination: { total, totalPages: Math.max(1, Math.ceil(total / 20)) } };
  if (name === 'reports') return { reports: [{ ...report, id }], pagination: { total } };
  return { reports: [{ ...albumReport, id }], total };
}
const nextQuery = name => name === 'posts' ? { page: 1, q: 'new' } : name === 'comments' ? { page: 1, q: 'new', postId: '7' } : name === 'reports' ? { tab: 'content', status: 'resolved', page: 1 } : { status: 'resolved', page: 1 };

test('全部 owned 页面通过真实 JSX 完整解析，驳回 footer 缺失按钮闭合会被拒绝', () => {
  const options = { sourceType: 'module', plugins: ['jsx'] };
  for (const name of pages) {
    assert.doesNotThrow(() => parse(read(`src/pages/admin/${name}.jsx`), options), `${name} 完整生产 JSX 应可解析`);
  }
  const reports = read('src/pages/admin/reports.jsx');
  const missingClose = reports.replace("'确认驳回'}</button></>}>", "'确认驳回'}</>}>");
  assert.notEqual(missingClose, reports, '负例应精确复现驳回 footer 漏闭合按钮');
  assert.throws(() => parse(missingClose, options), SyntaxError, '真实解析器必须捕获 footer JSX 结构错误');
});

test('全部 owned 页面使用页内样式、响应式卡片、可重试资源状态与已应用筛选', () => {
  for (const name of pages) {
    const text = read(`src/pages/admin/${name}.jsx`);
    for (const token of ["import './moderation-ux.css'", 'AdminLayout', 'ac-mod-intro', 'StatCard', 'ac-desktop-only', 'ac-mobile-only', 'ac-mod-record', '已应用：', 'aria-busy={loading}', 'ErrorBox', '重试加载', 'useConfirm', 'actionLocks']) assert.ok(text.includes(token), `${name}: ${token}`);
    assert.match(text, /!loading && !error && list\?\.length === 0/);
    assert.match(text, /list !== null && <fieldset[^>]+disabled=\{loading \|\| !!error\}/);
    assert.doesNotMatch(text, /window\.confirm|window\.prompt|dangerouslySetInnerHTML|navigator\.clipboard|fetch\(/);
    assert.match(text, /request !== (?:requestSeq|listSeq)\.current/);
    assert.match(text, /key !== JSON\.stringify\(queryRef\.current\)/);
  }
  const css = postcss.parse(read('src/pages/admin/moderation-ux.css'));
  css.walkRules(rule => { for (const selector of rule.selectors) assert.ok(selector.startsWith('.ac-moderation'), `未限定页内作用域 ${selector}`); });
  css.walkDecls(decl => {
    assert.ok(!decl.prop.startsWith('--ac-'), '不重定义共享主题');
    if (/^(?:color|background(?:-color)?|border(?:-color)?)$/.test(decl.prop)) assert.doesNotMatch(decl.value, /#[\da-f]{3,8}\b|\b(?:white|black)\b/i);
  });
  assert.match(css.toString(), /@media \(max-width: 767px\)/);
  assert.match(css.toString(), /\.ac-moderation \.ac-desktop-only \{ display: none; \}/);
  assert.match(css.toString(), /\.ac-moderation \.ac-mobile-only \{ display: flex; \}/);
  assert.doesNotMatch(css.toString(), /\.ac-mod-content\s*\{[^}]*max-height/);
  if (!hasAlbum) assert.equal(existsSync(new URL('../src/pages/admin/albumReportsModel.js', import.meta.url)), false, '不在移动站创建 web-only 相册管理');
});

test('任务标题不重复布局页名；桌面字段保留、ID/日期不拆行，局部横滚有说明且手机卡片仍完整', () => {
  const elements = root => {
    const result = [];
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      if (value.type === 'JSXElement') result.push(value);
      for (const child of Object.values(value)) {
        if (Array.isArray(child)) child.forEach(visit);
        else if (child && typeof child === 'object') visit(child);
      }
    };
    visit(root);
    return result;
  };
  const tag = element => element.openingElement.name.name;
  const attribute = (element, name) => {
    const value = element.openingElement.attributes.find(item => item.type === 'JSXAttribute' && item.name.name === name)?.value;
    return value?.type === 'JSXExpressionContainer' ? value.expression.value : value?.value;
  };
  const hasClass = (element, name) => String(attribute(element, 'className') || '').split(/\s+/).includes(name);
  const expected = {
    posts: { title: '查找帖子与调整展示', columns: ['帖子', '作者', '内容', '互动', '时间', '标签', '操作'] },
    comments: { title: '定位评论与核对原帖', columns: ['评论', '所属帖子', '作者', '内容', '点赞', '时间', '操作'] },
    reports: { title: '核对举报与提交决定', columns: ['举报 ID', '对象', '被举报内容', '被举报请求', '请求描述', '举报人', '理由', '时间', '状态', '操作'] },
    albumReports: { title: '核对相册与照片屏蔽状态', columns: ['举报 ID', '相册', '相册主', '举报人', '理由', '详情', '时间', '屏蔽照片', '状态', '操作'] },
  };
  for (const name of pages) {
    const text = read(`src/pages/admin/${name}.jsx`);
    const nodes = elements(parse(text, { sourceType: 'module', plugins: ['jsx'] }));
    assert.equal(nodes.some(node => ['PageHeader', 'h1', 'h2'].includes(tag(node))), false, `${name} 不重复布局标题`);
    const intro = nodes.find(node => hasClass(node, 'ac-mod-intro'));
    assert.ok(intro);
    const introNodes = elements(intro);
    assert.ok(introNodes.some(node => tag(node) === 'p' && node.children.some(child => child.type === 'JSXText' && child.value.trim())), `${name} 保留明确说明`);
    const refresh = introNodes.find(node => tag(node) === 'button');
    assert.ok(refresh?.openingElement.attributes.some(item => item.name?.name === 'onClick'), `${name} 保留刷新入口`);
    assert.match(text.slice(refresh.start, refresh.end), /刷新/);
    const card = nodes.find(node => tag(node) === 'Card');
    assert.equal(attribute(card, 'title'), expected[name].title);
    const region = nodes.find(node => hasClass(node, 'ac-mod-table-scroll'));
    assert.ok(region && hasClass(region, 'ac-desktop-only'));
    assert.equal(attribute(region, 'role'), 'region');
    assert.equal(attribute(region, 'tabIndex'), 0);
    const hint = nodes.find(node => attribute(node, 'id') === attribute(region, 'aria-describedby'));
    assert.ok(hint && hasClass(hint, 'ac-desktop-only'));
    assert.match(text.slice(hint.start, hint.end), /左右滚动查看全部字段/);
    const tableNodes = elements(region);
    const columns = tableNodes.filter(node => tag(node) === 'th').map(node => node.children.filter(child => child.type === 'JSXText').map(child => child.value).join('').trim());
    assert.deepEqual(columns, expected[name].columns, `${name} 不删减任何一栏，含两种举报分支`);
    for (const className of ['ac-mod-id-cell', 'ac-mod-date-cell', 'ac-mod-actions-cell']) assert.ok(tableNodes.some(node => hasClass(node, className)), `${name}: ${className}`);
    assert.ok(tableNodes.some(node => hasClass(node, name === 'posts' ? 'ac-mod-count-cell' : name === 'albumReports' ? 'ac-mod-object-ref' : 'ac-mod-object-cell')));
    const mobile = nodes.find(node => hasClass(node, 'ac-mobile-only') && hasClass(node, 'ac-mod-records'));
    assert.ok(mobile && elements(mobile).some(node => tag(node) === 'article'), `${name} 手机卡片保留`);
    assert.ok(text.includes('ac-mod-details'), `${name} 完整长内容仍可展开`);
  }
  const css = postcss.parse(read('src/pages/admin/moderation-ux.css'));
  const declarations = selector => {
    const result = {};
    css.walkRules(rule => { if (rule.selectors.includes(selector)) rule.walkDecls(decl => { result[decl.prop] = decl.value; }); });
    return result;
  };
  assert.ok(Number.parseFloat(declarations('.ac-moderation .ac-mod-table')['min-width']) >= 1120);
  assert.ok(Number.parseFloat(declarations('.ac-moderation .ac-mod-reports-table')['min-width']) >= 1320);
  assert.ok(Number.parseFloat(declarations('.ac-moderation .ac-mod-album-table')['min-width']) >= 1540);
  const scroll = declarations('.ac-moderation .ac-mod-table-scroll');
  assert.equal(scroll['overflow-x'], 'auto'); assert.equal(scroll['max-width'], '100%'); assert.equal(scroll['min-width'], '0');
  for (const name of ['id-cell', 'object-cell', 'date-cell', 'count-cell', 'status-cell', 'object-ref', 'id-cell .ac-mod-link', 'object-cell .ac-mod-link']) {
    const rule = declarations(`.ac-moderation .ac-mod-table .ac-mod-${name}`);
    assert.equal(rule['white-space'], 'nowrap', name); assert.equal(rule['word-break'], 'normal', name); assert.equal(rule['overflow-wrap'], 'normal', name);
  }
  assert.ok(Number.parseFloat(declarations('.ac-moderation .ac-mod-table .ac-mod-date-cell')['min-width']) >= 184);
  css.walkRules(rule => {
    if (rule.selector.includes('ac-mod-table') && !rule.selector.includes('focus-visible')) rule.walkDecls(decl => {
      assert.ok(!(decl.prop === 'display' && decl.value === 'none'), '不以隐藏列解决拥挤');
      assert.ok(!(['overflow', 'overflow-x'].includes(decl.prop) && decl.value === 'hidden'), '不裁掉完整表格字段');
    });
  });
});

for (const name of ['posts', 'comments']) test(`${name}: 输入不逐键请求，提交/翻页/刷新只使用已应用筛选，重置回第一页`, async () => {
  const method = listMethod[name];
  const h = harness(name, { [method]: async () => payload(name, 1, 40) });
  await h.flush();
  const initial = h.calls.length;
  h.state.setQ('  已应用关键词  ');
  if (name === 'comments') h.state.setPostId('007');
  h.render();
  assert.equal(h.calls.length, initial);
  assert.equal(h.state.draftChanged, true);
  let prevented = false;
  h.state.applySearch({ preventDefault() { prevented = true; } });
  await h.flush();
  assert.equal(prevented, true);
  assert.equal(h.state.query.q, '已应用关键词');
  if (name === 'comments') assert.equal(h.state.query.postId, '7');
  assert.equal(h.calls.at(-1).args[0].q, '已应用关键词');
  if (name === 'comments') assert.equal(h.calls.at(-1).args[0].post_id, 7);
  h.state.setQ('未应用关键词');
  h.state.setQuery(previous => ({ ...previous, page: 2 }));
  await h.flush();
  assert.equal(h.calls.at(-1).args[0].page, 2);
  assert.equal(h.calls.at(-1).args[0].q, '已应用关键词');
  await h.state.load(h.state.query);
  await h.flush();
  assert.equal(h.calls.at(-1).args[0].q, '已应用关键词');
  h.state.resetSearch();
  await h.flush();
  assert.equal(h.state.q, '');
  assert.equal(h.state.query.q, '');
  assert.equal(h.state.query.page, 1);
  if (name === 'comments') { assert.equal(h.state.postId, ''); assert.equal(h.calls.at(-1).args[0].post_id, 0); }
  h.dispose();
});

for (const name of pages) {
  test(`${name}: 首次加载/错误/重试/刷新期间不伪装为空，失败保留同一筛选下的结果`, async () => {
    let pending = deferred();
    const method = listMethod[name];
    const h = harness(name, { [method]: () => pending.promise });
    assert.equal(h.state.loading, true);
    assert.equal(h.state.list, null);
    pending.reject(new Error('fixture-load-failure'));
    await h.flush();
    assert.equal(h.state.loading, false);
    assert.equal(h.state.list, null);
    assert.match(h.state.error, /fixture-load-failure/);
    pending = deferred();
    const retry = name === 'albumReports' ? h.state.loadList(h.state.query) : h.state.load(h.state.query);
    h.render();
    assert.equal(h.state.loading, true); assert.equal(h.state.error, '');
    pending.resolve(payload(name, 'retained'));
    await retry; await h.flush();
    assert.equal(h.state.list[0].id, 'retained');
    pending = deferred();
    const refresh = name === 'albumReports' ? h.state.loadList(h.state.query) : h.state.load(h.state.query);
    h.render();
    assert.equal(h.state.loading, true);
    assert.equal(h.state.list[0].id, 'retained');
    pending.reject(new Error('fixture-refresh-failure'));
    await refresh; await h.flush();
    assert.equal(h.state.loading, false);
    assert.equal(h.state.list[0].id, 'retained');
    assert.match(h.state.error, /fixture-refresh-failure/);
    h.dispose();
  });

  test(`${name}: 新筛选清旧列表，晚到成功/失败不得覆盖新资源，卸载不提交状态`, async () => {
    const pending = [];
    const h = harness(name, { [listMethod[name]]: () => { const request = deferred(); pending.push(request); return request.promise; } });
    h.state.setQuery(nextQuery(name, h.state)); h.render();
    assert.equal(pending.length, 2); assert.equal(h.state.list, null); assert.equal(h.state.loading, true);
    pending[1].resolve(payload(name, 'new'));
    await h.flush();
    pending[0].reject(new Error('stale-failure'));
    await h.flush();
    assert.equal(h.state.list[0].id, 'new'); assert.equal(h.state.error, ''); assert.equal(h.state.loading, false);
    h.state.setQuery(previous => ({ ...previous, page: 2 })); h.render();
    h.state.setQuery(previous => ({ ...previous, page: 3 })); h.render();
    pending[3].resolve(payload(name, 'latest', 80)); await h.flush();
    pending[2].resolve(payload(name, 'old', 80)); await h.flush();
    assert.equal(h.state.list[0].id, 'latest');
    h.state.setQuery(previous => ({ ...previous, page: 4 })); h.render();
    h.dispose(); pending[4].resolve(payload(name, 'unmounted', 80)); await h.flush();
    assert.equal(h.lateUpdates, 0);
  });

  test(`${name}: 总数缩水后回落有效页，StrictMode cleanup/setup 可恢复`, async () => {
    const h = harness(name, { [listMethod[name]]: async () => payload(name, 'one', 1) });
    await h.flush();
    h.state.setQuery(previous => ({ ...previous, page: 4 }));
    await h.flush();
    assert.equal(h.state.query.page, 1);
    assert.equal(h.state.resource.pagination.totalPages, 1);
    h.replayEffects(); await h.flush();
    assert.equal(h.state.loading, false); assert.equal(h.state.list[0].id, 'one');
    h.dispose();
  });
}

test('帖子单条置顶/敏感/删除都确认；保持精确参数、逐条锁、成功后读回与失败可重试', async () => {
  let answer = false;
  const h = harness('posts', {}, async () => answer);
  await h.flush();
  await h.state.remove(post); await h.flush();
  assert.equal(h.calls.filter(call => call.method === 'deletePost').length, 0);
  assert.equal(h.confirmations.at(-1).danger, true);
  assert.match(h.confirmations.at(-1).message, /#7.*@fixture-author.*不可恢复/);
  answer = true;
  await h.state.togglePin(post); await h.flush();
  assert.deepEqual(h.calls.find(call => call.method === 'pinPost').args, [7]);
  assert.match(h.confirmations.at(-1).message, /置顶/);
  await h.state.setNsfw(post); await h.flush();
  await h.state.setNsfw({ ...post, has_nsfw: true }); await h.flush();
  assert.deepEqual(h.calls.filter(call => call.method === 'setPostNsfw').map(call => call.args), [[7, true], [7, false]]);
  assert.equal(h.confirmations.at(-1).danger, true);
  assert.match(h.confirmations.at(-1).message, /普通信息流和搜索结果/);
  await h.state.remove(post); await h.flush();
  assert.deepEqual(h.calls.filter(call => call.method === 'deletePost').map(call => call.args), [[7]]);
  assert.equal(h.calls.at(-1).method, 'posts');
  h.dispose();

  const waiting = [];
  const locks = harness('posts', { deletePost: () => { const request = deferred(); waiting.push(request); return request.promise; } });
  await locks.flush();
  const first = locks.state.remove(post); await locks.flush();
  const duplicate = locks.state.remove(post); await duplicate;
  const second = locks.state.remove({ ...post, id: 10 }); await locks.flush();
  assert.equal(waiting.length, 2); assert.deepEqual(Object.keys(locks.state.busy).sort(), ['10', '7']);
  waiting[0].reject(new Error('fixture-delete-failure')); await first; await locks.flush();
  assert.equal(locks.state.busy[10], 'delete'); assert.equal(locks.state.busy[7], undefined);
  assert.match(locks.state.actionErrors[7], /fixture-delete-failure/);
  waiting[1].resolve({}); await second; await locks.flush();
  assert.deepEqual(plain(locks.state.busy), {});
  locks.dispose();
});

test('评论删除只传评论 ID，确认含所属帖子与作者，失败保留文本与单条错误', async () => {
  let cancelled = true;
  const h = harness('comments', { deleteComment: async () => { throw new Error('fixture-comment-failure'); } }, async () => !cancelled);
  await h.flush();
  await h.state.remove(comment); await h.flush();
  assert.equal(h.calls.filter(call => call.method === 'deleteComment').length, 0);
  cancelled = false;
  await h.state.remove(comment); await h.flush();
  assert.deepEqual(h.calls.find(call => call.method === 'deleteComment').args, [8]);
  assert.match(h.confirmations.at(-1).message, /评论 #8.*帖子 #7.*@fixture-author.*不删除原帖.*不可恢复/);
  assert.equal(h.state.list[0].content, comment.content);
  assert.match(h.state.actionErrors[8], /fixture-comment-failure/);
  assert.deepEqual(plain(h.state.busy), {});
  h.dispose();
});

test('长帖子/评论与举报说明在桌面和手机都保留全文，不用定高展开或仅 title 承载信息', () => {
  for (const [name, field] of [['posts', 'post'], ['comments', 'comment']]) {
    const text = read(`src/pages/admin/${name}.jsx`);
    assert.match(text, /<details className="ac-mod-details">/);
    assert.ok(text.includes(`<div className="ac-mod-content">{${field}.content}</div>`));
    assert.ok(text.includes(`{renderContent(${field})}{renderActions(${field})}`));
    assert.doesNotMatch(text, /maxHeight|WebkitLineClamp|\.content\.slice|\.content\.substring/);
  }
  const text = read('src/pages/admin/reports.jsx');
  for (const token of ['被举报内容', '请求描述', '举报人', '理由', '时间', '状态', 'request_title', 'request_description', 'looking_for', 'admin_reply', 'content_preview']) assert.ok(text.includes(token), token);
  assert.match(text, /<details className="ac-mod-details"><summary>展开举报与对象内容/);
  assert.match(text, /renderActions\(view.report, view.kind, true\)/);
});

test('举报类型/状态切换回第一页并清详情，交友列表不会被晚到内容列表污染', async () => {
  const content = deferred();
  const h = harness('reports', { reports: () => content.promise });
  h.state.setView({ kind: 'content', report });
  h.state.openDismiss(friend); h.state.setDismissReason('临时回复');
  h.state.changeFilter({ tab: 'friend' }); await h.flush();
  assert.equal(h.state.query.tab, 'friend'); assert.equal(h.state.query.page, 1);
  assert.equal(h.state.view, null); assert.equal(h.state.dismissTarget, null); assert.equal(h.state.dismissReason, '');
  assert.deepEqual(h.calls.find(call => call.method === 'friendRequestReports').args, ['pending', 1]);
  content.resolve({ reports: [report], pagination: { total: 1 } }); await h.flush();
  assert.equal(h.state.list[0].request_username, friend.request_username);
  h.state.changeFilter({ status: 'dismissed' }); await h.flush();
  assert.deepEqual(h.calls.at(-1).args, ['dismissed', 1]);
  h.dispose();
});

test('内容举报仅处理/删除并处理/驳回语义明确，取消不写入且不再伪称删除', async () => {
  let answer = false;
  const h = harness('reports', {}, async () => answer);
  await h.flush();
  await h.state.handleContent(report, 'resolve', true); await h.flush();
  assert.equal(h.calls.filter(call => call.method === 'resolveReport').length, 0);
  answer = true;
  await h.state.handleContent(report, 'resolve', false); await h.flush();
  assert.deepEqual(h.calls.find(call => call.method === 'resolveReport').args, [9, 'resolve', false]);
  assert.equal(h.successes.at(-1), '已处理，未删除内容');
  assert.equal(h.confirmations.at(-1).danger, false); assert.match(h.confirmations.at(-1).message, /评论 #8.*不删除目标内容/);
  await h.state.handleContent(report, 'resolve', true); await h.flush();
  assert.deepEqual(h.calls.filter(call => call.method === 'resolveReport').at(-1).args, [9, 'resolve', true]);
  assert.equal(h.successes.at(-1), '已处理，内容已删除'); assert.equal(h.confirmations.at(-1).danger, true);
  await h.state.handleContent(report, 'dismiss', false); await h.flush();
  assert.deepEqual(h.calls.filter(call => call.method === 'resolveReport').at(-1).args, [9, 'dismiss', false]);
  assert.equal(h.successes.at(-1), '已驳回，未删除内容');
  await h.state.handleContent({ ...report, status: 'resolved' }, 'resolve', true); await h.flush();
  assert.equal(h.calls.filter(call => call.method === 'resolveReport').length, 3, '已决定的举报不可重复处理');
  h.dispose();
});

test('交友采纳明确删除/封禁/通知，驳回保留回复至成功，确认和精确 API 参数不变', async () => {
  let fail = true;
  const h = harness('reports', { dismissFriendRequestReport: async () => { if (fail) throw new Error('fixture-dismiss-failure'); return {}; } });
  await h.flush(); h.state.changeFilter({ tab: 'friend' }); await h.flush();
  await h.state.acceptFriend(friend); await h.flush();
  assert.deepEqual(h.calls.find(call => call.method === 'acceptFriendRequestReport').args, [9]);
  assert.match(h.confirmations.at(-1).message, /#9.*fixture-request.*删除|删除.*fixture-request/);
  assert.match(h.confirmations.at(-1).message, /封禁其发布权限并通知举报人/);
  assert.equal(h.confirmations.at(-1).danger, true);
  h.state.openDismiss(friend); h.state.setDismissReason('  保留的回复  '); h.render();
  await h.state.dismissFriend(); await h.flush();
  assert.deepEqual(h.calls.find(call => call.method === 'dismissFriendRequestReport').args, [9, '保留的回复']);
  assert.equal(h.state.dismissTarget.id, 9); assert.equal(h.state.dismissReason, '  保留的回复  ');
  assert.match(h.state.actionErrors['friend:9'], /fixture-dismiss-failure/);
  assert.match(h.confirmations.at(-1).message, /不会删除请求或封禁发布权限.*通知举报人/);
  fail = false;
  await h.state.dismissFriend(); await h.flush();
  assert.equal(h.state.dismissTarget, null);
  assert.equal(h.calls.at(-1).method, 'friendRequestReports');
  h.dispose();
});

test('跨举报类型的相同 ID 忙碌状态互不覆盖，双击只写一次，晚响应不关闭新详情', async () => {
  const pendingContent = deferred(), pendingFriend = deferred();
  const h = harness('reports', { resolveReport: () => pendingContent.promise, acceptFriendRequestReport: () => pendingFriend.promise });
  await h.flush();
  const first = h.state.handleContent(report, 'resolve', false); await h.flush();
  await h.state.handleContent(report, 'resolve', false);
  h.state.changeFilter({ tab: 'friend' }); await h.flush();
  h.state.setView({ kind: 'friend', report: friend }); h.render();
  const second = h.state.acceptFriend(friend); await h.flush();
  assert.deepEqual(Object.keys(h.state.busy).sort(), ['content:9', 'friend:9']);
  assert.equal(h.calls.filter(call => call.method === 'resolveReport').length, 1);
  pendingContent.resolve({}); await first; await h.flush();
  assert.equal(h.state.view.kind, 'friend'); assert.equal(h.state.busy['friend:9'], 'accept');
  pendingFriend.resolve({}); await second; await h.flush();
  assert.equal(h.state.view, null); assert.deepEqual(plain(h.state.busy), {});
  h.dispose();
});

test('相册只在主动进入详情时读元数据，预览需逐张主动查看，所有照片参与期望状态', { skip: !hasAlbum }, async () => {
  const h = harness('albumReports'); await h.flush();
  assert.equal(h.calls.filter(call => call.method === 'albumReport').length, 0);
  await h.state.openDetail(albumReport); await h.flush();
  assert.deepEqual(plain(h.state.previews), {});
  assert.equal(h.state.detail.photos[0].preview_url, null);
  assert.equal(h.state.detail.photos.length, 3);
  const text = read('src/pages/admin/albumReports.jsx');
  assert.match(text, /photo.admin_blocked \|\| previews\[photo.id\] \? <img src=\{photoDisplayUrl\(photo\)\}/);
  assert.match(text, /onClick=\{\(\) => setPreviews/);
  assert.match(text, /setPreviews\(\{\}\);/);
  assert.match(text, /detail.photos.map\(photo => \[photo.id, true\]\)/);
  assert.match(text, /detail.photos.map\(photo => \[photo.id, false\]\)/);
  assert.doesNotMatch(text, /original_url|hd_url|\.photos\.slice|download=|navigator\.clipboard/);
  h.dispose();
});

test('相册屏蔽/解除提交全量期望状态及 UUID，确认可取消，成功后读回列表与详情', { skip: !hasAlbum }, async () => {
  let answer = false;
  let serverPhotos = albumPhotos;
  const h = harness('albumReports', {
    albumReport: async id => ({ report: { ...albumReport, id }, photos: serverPhotos }),
    blockAlbumPhotos: async (_id, ids) => { serverPhotos = albumPhotos.map(photo => ({ ...photo, admin_blocked: ids.includes(photo.id) })); return { blocked_photo_ids: ids }; },
  }, async () => answer);
  await h.flush(); await h.state.openDetail(albumReport); await h.flush();
  h.state.setChecked({ p1: false, p2: true }); h.render();
  await h.state.applyBlock(); await h.flush();
  assert.equal(h.calls.filter(call => call.method === 'blockAlbumPhotos').length, 0);
  assert.equal(h.state.diff.hasChanges, true);
  answer = true;
  await h.state.applyBlock(); await h.flush();
  const write = h.calls.find(call => call.method === 'blockAlbumPhotos');
  assert.equal(write.args[0], albumReport.id); assert.deepEqual(write.args[1], ['p2']);
  assert.match(write.args[2], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(h.confirmations.at(-1).message, /新增屏蔽 1 张，解除屏蔽 1 张/);
  assert.equal(h.confirmations.at(-1).danger, true);
  assert.equal(h.calls.filter(call => call.method === 'albumReport').length, 2);
  assert.equal(h.calls.filter(call => call.method === 'albumReports').length, 2);
  assert.equal(h.state.diff.hasChanges, false); assert.deepEqual(plain(h.state.checked), {}); assert.deepEqual(plain(h.state.previews), {});
  await h.state.applyBlock(); assert.equal(h.calls.filter(call => call.method === 'blockAlbumPhotos').length, 1, '无变化不可写入');
  h.dispose();
});

test('相册保存失败保留选择；决定要求已保存状态，刷新放弃调整需确认', { skip: !hasAlbum }, async () => {
  let confirmValue = true;
  const h = harness('albumReports', { blockAlbumPhotos: async () => { throw new Error('fixture-block-failure'); } }, async () => confirmValue);
  await h.flush(); await h.state.openDetail(albumReport); await h.flush();
  h.state.setChecked({ p2: true }); h.render();
  await h.state.handleResolve(); assert.equal(h.calls.filter(call => call.method === 'resolveAlbumReport').length, 0);
  await h.state.applyBlock(); await h.flush();
  assert.equal(h.state.checked.p2, true); assert.match(h.state.actionError, /fixture-block-failure/); assert.equal(h.state.busy[albumReport.id], undefined);
  confirmValue = false;
  await h.state.refreshDetail(); await h.flush();
  assert.equal(h.state.checked.p2, true); assert.equal(h.calls.filter(call => call.method === 'albumReport').length, 1);
  confirmValue = true;
  await h.state.refreshDetail(); await h.flush();
  assert.deepEqual(plain(h.state.checked), {});
  await h.state.handleResolve(); await h.flush();
  assert.deepEqual(h.calls.find(call => call.method === 'resolveAlbumReport').args, [albumReport.id]);
  assert.match(h.confirmations.at(-1).message, /已屏蔽的照片保持屏蔽/);
  assert.equal(h.state.detailTarget, null);
  h.dispose();
});

test('相册详情/保存/决定晚响应不重开已关闭详情、不清新对象选择、不关闭新详情', { skip: !hasAlbum }, async () => {
  const pendingRead = deferred(), pendingBlock = deferred(), pendingResolve = deferred();
  const h = harness('albumReports', {
    albumReport: id => id === 'slow' ? pendingRead.promise : Promise.resolve({ report: { ...albumReport, id }, photos: albumPhotos }),
    blockAlbumPhotos: () => pendingBlock.promise,
    resolveAlbumReport: () => pendingResolve.promise,
  });
  await h.flush();
  const oldRead = h.state.openDetail({ id: 'slow' }); h.render();
  h.state.closeDetail(); h.render();
  pendingRead.resolve({ report: { ...albumReport, id: 'slow' }, photos: albumPhotos }); await oldRead; await h.flush();
  assert.equal(h.state.detailTarget, null); assert.equal(h.state.detail, null); assert.equal(h.state.detailLoading, false);
  await h.state.openDetail(albumReport); await h.flush();
  h.state.setChecked({ p2: true }); h.render();
  const block = h.state.applyBlock(); await h.flush();
  h.state.closeDetail(); await h.state.openDetail({ id: 'new-report' }); await h.flush();
  h.state.setChecked({ p3: true }); h.render();
  pendingBlock.resolve({ blocked_photo_ids: ['p1', 'p2'] }); await block; await h.flush();
  assert.equal(h.state.detail.report.id, 'new-report'); assert.equal(h.state.checked.p3, true);
  assert.equal(h.calls.filter(call => call.method === 'albumReport' && call.args[0] === albumReport.id).length, 1, '旧保存不重新读取/打开旧详情');
  h.state.setChecked({}); h.render();
  const resolve = h.state.handleResolve(); await h.flush();
  h.state.closeDetail(); await h.state.openDetail({ id: 'third-report' }); await h.flush();
  pendingResolve.resolve({}); await resolve; await h.flush();
  assert.equal(h.state.detail.report.id, 'third-report'); assert.equal(h.state.detailTarget, 'third-report');
  h.dispose();
});

test('相册确认后对象已切换则不发送旧操作；读回失败不可伪装为已同步', { skip: !hasAlbum }, async () => {
  const gate = deferred();
  const h = harness('albumReports', {}, () => gate.promise);
  await h.flush(); await h.state.openDetail(albumReport); await h.flush();
  h.state.setChecked({ p2: true }); h.render();
  const action = h.state.applyBlock(); await h.flush();
  h.state.closeDetail(); await h.state.openDetail({ id: 'replacement' }); await h.flush();
  gate.resolve(true); await action; await h.flush();
  assert.equal(h.calls.filter(call => call.method === 'blockAlbumPhotos').length, 0);
  assert.equal(h.state.detailTarget, 'replacement'); h.dispose();

  let reads = 0;
  const readback = harness('albumReports', { albumReport: async id => {
    if (++reads > 1) throw new Error('fixture-readback-failure');
    return { report: { ...albumReport, id }, photos: albumPhotos };
  } });
  await readback.flush(); await readback.state.openDetail(albumReport); await readback.flush();
  readback.state.setChecked({ p2: true }); readback.render();
  await readback.state.applyBlock(); await readback.flush();
  assert.match(readback.state.detailError, /fixture-readback-failure/); assert.equal(readback.state.detailDisabled, true);
  const writes = readback.calls.filter(call => call.method === 'resolveAlbumReport').length;
  await readback.state.handleResolve(); assert.equal(readback.calls.filter(call => call.method === 'resolveAlbumReport').length, writes);
  readback.dispose();
});
