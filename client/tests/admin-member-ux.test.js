import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { MemoryRouter } from 'react-router-dom';
import postcss from 'postcss';

// 与现有 admin-theme 一样加载实际 JSX；所有数据是内存 fixture，不连接业务 API。
const source = file => readFileSync(new URL(`../src/pages/admin/${file}`, import.meta.url), 'utf8');
const render = (Component, props) => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component, props)));
const ordinary = { id: 42, username: 'member_42', display_name: '长显示名'.repeat(12), role: 'user', email: `${'long'.repeat(20)}@example.test`, qq_bound: null, created_at: '2026-11-13 01:00:00', post_count: 0, comment_count: 9, checkin_count: 3, banned: false };
const superAdmin = { id: 1, role: 'admin', is_super_admin: true };
let server;
let overview, users, badges, diapers, ui;
before(async () => {
  server = await createServer({ configFile: false, envFile: false, root: new URL('../', import.meta.url).pathname,
    esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  overview = await server.ssrLoadModule('/src/pages/admin/overview.jsx');
  users = await server.ssrLoadModule('/src/pages/admin/users.jsx');
  badges = await server.ssrLoadModule('/src/pages/admin/badges.jsx');
  diapers = await server.ssrLoadModule('/src/pages/admin/diapers.jsx');
  ui = await server.ssrLoadModule('/src/pages/admin/ui.jsx');
});
after(async () => { await server?.close(); });
const renderForm = (Component, props) => renderToStaticMarkup(React.createElement(ui.ConfirmProvider, null, React.createElement(Component, props)));

test('总览未知数不伪装为零，环比只在两期均提供时计算', () => {
  for (const value of [undefined, null, '', ' ', 'invalid', -1, NaN, {}, false]) assert.equal(overview.knownCount(value), null);
  assert.equal(overview.knownCount(0), 0); assert.equal(overview.knownCount('12'), 12);
  assert.equal(overview.weekDelta({}, 'users'), '数据未提供');
  assert.equal(overview.weekDelta({ week: { users: 5 } }, 'users'), '数据未提供');
  assert.equal(overview.weekDelta({ week: { users: 5 }, prevWeek: { users: 0 } }, 'users'), '新增');
  assert.equal(overview.weekDelta({ week: { users: 0 }, prevWeek: { users: 0 } }, 'users'), '持平');
  assert.equal(overview.weekDelta({ week: { users: 6 }, prevWeek: { users: 4 } }, 'users'), '+50%');
});

test('总览首载、刷新与失败独立显示；任务不将未知/安全事件标成已清空待办', () => {
  const notice = resource => render(overview.OverviewResourceNotice, { resource, label: '运营总览', onRetry() {} });
  assert.match(notice({ loading: true, data: null, error: '' }), /正在读取运营总览/);
  assert.match(notice({ loading: true, data: { totals: {} }, error: '' }), /保留上次成功数据/);
  assert.match(notice({ loading: false, data: null, error: '断网' }), /断网[\s\S]*尚无可用数据[\s\S]*重试运营总览/);
  assert.match(notice({ loading: false, data: {}, error: '503' }), /上次成功数据，并非最新结果/);
  const unknown = render(overview.OverviewTasks, { overview: null });
  assert.equal((unknown.match(/数量未提供/g) || []).length, 5);
  assert.doesNotMatch(unknown, /已清空|0 待处理/);
  const actual = render(overview.OverviewTasks, { overview: { pending: { reports: 0, friend_reports: 3, security_24h: 2 } } });
  assert.match(actual, /0 待处理/); assert.match(actual, /3 待处理/); assert.match(actual, /2 条事件/);
  assert.match(actual, /事件量不等于待办量/);
  for (const path of ['/admin/reports', '/admin/novels', '/admin/security']) assert.ok(actual.includes(path));
  const page = source('overview.jsx');
  assert.doesNotMatch(page, /Promise\.all\(|fillDaily\(/);
  for (const key of ['overview', 'trends', 'app']) assert.ok(page.includes(`readResource('${key}'`));
  assert.match(page, /request === requests\.current\[key\]/);
  assert.match(page, /查看每日数值[\s\S]*不依赖悬停/);
});

test('趋势保留接口日期和真实零，不把缺失日期/指标补成零', () => {
  assert.equal(overview.trendRows({ series: {} }, 'users'), null);
  assert.deepEqual(overview.trendRows({ series: { users: [] } }, 'users'), []);
  assert.deepEqual(overview.trendRows({ series: { users: [{ d: '2026-11-13', c: 0 }, { d: '2026-11-10', c: 7 }, { d: '2026-11-11', c: null }] } }, 'users'), [{ date: '2026-11-10', count: 7 }, { date: '2026-11-13', count: 0 }]);
});

test('用户首载/刷新/筛选失败不会显示空结果，旧结果有上下文且写操作禁用', () => {
  const results = props => render(users.UsersResults, { list: null, loading: false, error: '', actor: superAdmin, ...props });
  assert.match(results({ loading: true }), /正在读取用户/);
  const failed = results({ error: '筛选读取失败' });
  assert.match(failed, /筛选读取失败[\s\S]*重试当前筛选/); assert.doesNotMatch(failed, /没有匹配的用户/);
  assert.doesNotMatch(results({ list: [], error: '断网' }), /没有匹配的用户/);
  assert.match(results({ list: [] }), /没有匹配的用户/);
  const refreshed = results({ list: [ordinary], loading: true, resultContext: '旧筛选 / 第2页' });
  assert.match(refreshed, /正在刷新用户[\s\S]*旧筛选 \/ 第2页/);
  assert.match(refreshed, /disabled=""/);
  const stale = results({ list: [ordinary], error: '新筛选503', resultContext: '旧关键词' });
  assert.match(stale, /不代表当前筛选/); assert.match(stale, /旧关键词/);
});

test('用户 draft 输入不依赖网络，Enter/搜索显式应用并回第1页，重置清空全部条件', () => {
  const page = source('users.jsx');
  assert.match(page, /<form className="ac-member-filter" onSubmit=\{applyFilters\}/);
  assert.match(page, /value=\{draftFilters\.q\} onChange=\{e => setDraftFilters/);
  assert.match(page, /useEffect\(\(\) => \{ load\(page, q, role, qqBound\); \}, \[page, q, role, qqBound, load\]\)/);
  assert.doesNotMatch(page, /useEffect\([^\n]*draftFilters|setQ\(|setRole\(|setQqBound\(/);
  const apply = /const applyFilters = event => \{([\s\S]*?)\n  \};/.exec(page)?.[1];
  const reset = /const resetFilters = \(\) => \{([\s\S]*?)\n  \};/.exec(page)?.[1];
  assert.ok(apply); assert.ok(reset);
  const calls = [];
  const context = { draftFilters: { q: ' member ', role: 'admin', qqBound: 'bound' }, appliedFilters: { q: '', role: '', qqBound: '' }, page: 3,
    EMPTY_FILTERS: { q: '', role: '', qqBound: '' }, setDraftFilters: value => calls.push(['draft', value]), setAppliedFilters: value => calls.push(['applied', value]), setPage: value => calls.push(['page', value]), load: (...args) => calls.push(['load', ...args]) };
  runInNewContext(`(event => {${apply}})({ preventDefault() {} })`, context);
  assert.equal(calls.find(call => call[0] === 'applied')[1].q, 'member');
  assert.deepEqual(calls.find(call => call[0] === 'page'), ['page', 1]);
  assert.equal(calls.filter(call => call[0] === 'load').length, 0);
  context.page = 1; context.appliedFilters = { q: 'member', role: 'admin', qqBound: 'bound' }; calls.length = 0;
  runInNewContext(`(event => {${apply}})({ preventDefault() {} })`, context);
  assert.deepEqual(calls.find(call => call[0] === 'load'), ['load', 1, 'member', 'admin', 'bound']);
  calls.length = 0; runInNewContext(`(() => {${reset}})()`, context);
  assert.deepEqual(calls.find(call => call[0] === 'applied')[1], context.EMPTY_FILTERS);
  assert.match(users.userFilterSummary({ q: 'member', role: 'user', qqBound: 'unbound' }), /member.*普通用户.*未绑定 QQ/);
});

test('实际用户读取只接收最新请求；刷新错误保留旧列表，不伪造空数组', async () => {
  const body = /const load = useCallback\(async \(p, query, selectedRole, selectedQQ\) => \{([\s\S]*?)\n  \}, \[sessionKey\]\);/.exec(source('users.jsx'))?.[1];
  assert.ok(body);
  const pending = [];
  let list = [ordinary], error = '', loading = false, result = '';
  const context = { listRequest: { current: 0 }, alive: { current: true }, session: { current: { key: 'session' } }, sessionKey: 'session', PAGE_SIZE: 20,
    adminAPI: { users: args => new Promise((resolve, reject) => pending.push({ args, resolve, reject })) },
    setLoading: value => { loading = value; }, setErrors: value => { error = value; }, setList: value => { list = value; }, setPagination() {}, setResultContext: value => { result = value; }, userFilterSummary: users.userFilterSummary, handleError() {} };
  const load = (...args) => runInNewContext(`(async (p, query, selectedRole, selectedQQ) => {${body}})(...args)`, { ...context, args });
  const first = load(1, 'old', '', ''); const latest = load(1, 'new', 'user', 'bound');
  assert.equal(loading, true); assert.equal(list[0], ordinary);
  pending[1].resolve({ users: [{ ...ordinary, username: 'new-result' }], pagination: { page: 1, total: 1, totalPages: 1 } }); await latest;
  pending[0].resolve({ users: [], pagination: { page: 1, total: 0, totalPages: 1 } }); await first;
  assert.equal(list[0].username, 'new-result'); assert.match(result, /new/);
  const failed = load(1, 'missing', '', ''); pending[2].reject(new Error('fixture 503')); await failed;
  assert.equal(error, 'fixture 503'); assert.equal(list[0].username, 'new-result'); assert.equal(loading, false);
  assert.equal(pending[1].args.qq_bound, 'bound');
});

test('用户桌面表格与移动卡保留邮箱/QQ/注册/三计数，治理权限及解绑安全仍在', () => {
  const html = render(users.UsersResults, { list: [ordinary], loading: false, error: '', actor: superAdmin });
  assert.match(html, /ac-desktop-only/); assert.match(html, /ac-mobile-only/); assert.match(html, /<dl class="ac-member-kv"/);
  for (const text of [ordinary.email, 'member_42', '状态未知', '注册时间', '帖子 / 评论 / 签到']) assert.ok(html.includes(text), text);
  assert.ok((html.match(/删除账号/g) || []).length >= 1, '移动卡片保留完整治理操作，桌面通过详情进入');
  const protectedActions = render(users.UserManagementActions, { actor: superAdmin, target: { id: 2, role: 'admin' } });
  assert.equal((protectedActions.match(/disabled=""/g) || []).length, 3);
  assert.match(protectedActions, /请先由超级管理员撤销/);
  assert.doesNotMatch(render(users.UserManagementActions, { actor: { id: 2, role: 'admin' }, target: ordinary }), /提升为管理员/);
  const qq = render(users.LoginMethods, { identity: { methods: { qq: { bound: true, can_unbind: true } } }, busy: true, blockedReason: '刷新详情失败' });
  assert.match(qq, /disabled=""/); assert.match(qq, /刷新详情失败/);
  const page = source('users.jsx');
  for (const contract of ['adminSessionKey(admin, token)', 'detailRef.current?.userId !== userId', 'request !== detailRequest.current', 'operationKeeper()', 'expectedBindingVersion: target.version', 'operations.current.get(key, body)', 'error.definitive', 'UserObservationLink', 'if (!ok || !isCurrent()) return']) assert.ok(page.includes(contract), contract);
  assert.match(page, /来源：\{detail.context\}/); assert.match(page, /detail.loading \|\| !!detail.error/);
});

test('桌面用户结果七列不挤压身份/邮箱，三项活动合列且详情保留完整治理', () => {
  const html = render(users.UsersResults, { list: [ordinary], loading: false, error: '', actor: superAdmin });
  const desktop = html.slice(html.indexOf('<table'), html.indexOf('</table>') + '</table>'.length);
  assert.equal((desktop.match(/<th scope="col"/g) || []).length, 7);
  assert.equal((desktop.match(/<td class=/g) || []).length, 7);
  for (const text of ['角色 / QQ', '活动汇总', '帖子 0', '评论 9', '签到 3', '治理操作在详情', '展开完整身份', '展开完整邮箱', ordinary.email, '查看用户详情 @member_42']) assert.ok(desktop.includes(text), text);
  assert.equal((desktop.match(/<button /g) || []).length, 1, '桌面仅保留详情主操作');
  assert.doesNotMatch(desktop, /aria-label="(?:封禁账号|删除账号|追踪并封禁 IP)"/);
  assert.match(html, /role="region" aria-label="用户筛选结果表，可横向滚动" tabindex="0"/);
  const mobile = html.slice(html.indexOf('class="ac-mobile-only'));
  for (const text of ['member_42', ordinary.email, '注册时间', '帖子 / 评论 / 签到', '封禁账号', '追踪并封禁 IP', '删除账号']) assert.ok(mobile.includes(text), text);
  const page = source('users.jsx');
  assert.match(page, /<Card title="用户检索"/); assert.doesNotMatch(page, /<Card title="用户管理"/);
  assert.match(page, /账户治理与角色[\s\S]*<UserManagementActions actor=\{admin\} target=\{info.user\}[\s\S]*onRole=\{changeRole\} onBan=\{toggleBan\} onTrack=\{doTrackAndBan\} onDelete=\{remove\}/);
  const css = postcss.parse(source('member-ux.css'));
  const values = selector => {
    const result = {};
    css.walkRules(rule => { if (rule.selector === selector) rule.walkDecls(decl => { result[decl.prop] = decl.value; }); });
    return result;
  };
  const table = values('.ac-member-ux .ac-member-users-table');
  assert.equal(table['min-width'], '1040px'); assert.equal(table['table-layout'], 'fixed');
  assert.equal(values('.ac-member-ux .ac-member-users-scroll')['overflow-x'], 'auto');
  assert.equal(values('.ac-member-ux .ac-member-users-table .ac-member-user-identity')['min-width'], '200px');
  assert.equal(values('.ac-member-ux .ac-member-users-table .ac-member-user-email')['min-width'], '220px');
  assert.equal(values('.ac-member-ux .ac-member-users-table .ac-uname')['white-space'], 'nowrap');
  assert.equal(values('.ac-member-ux .ac-member-user-ellipsis')['text-overflow'], 'ellipsis');
});

test('徽章首载/刷新/错误与空态互斥，双形态保留key/颜色/图标及全部五项动作', () => {
  const props = { badges: null, loading: true, error: '' };
  assert.match(render(badges.BadgeResults, props), /正在读取徽章定义/);
  assert.doesNotMatch(render(badges.BadgeResults, { ...props, loading: false, error: '503' }), /尚未创建任何徽章|加载中/);
  const fixture = { key: 'long_badge', name: '徽章名'.repeat(20), description: '完整多行说明\n'.repeat(12), icon: 'verified', color: '#123456', holders: 0 };
  const html = render(badges.BadgeResults, { badges: [fixture], loading: true, error: '' });
  assert.match(html, /保留上次成功结果/); assert.match(html, /ac-desktop-only/); assert.match(html, /ac-mobile-only/);
  for (const field of [fixture.key, fixture.name, fixture.description, fixture.icon, fixture.color, '0 人', '持有人', '颁发', '收回', '编辑', '删除']) assert.ok(html.includes(field), field);
  assert.doesNotMatch(render(badges.BadgeResults, { badges: [], loading: false, error: '断网' }), /尚未创建任何徽章/);
  assert.match(render(badges.BadgeResults, { badges: [], loading: false, error: '' }), /尚未创建任何徽章/);
});

test('持有人先显示资源状态；重试不伪造空态，移动键值保留解锁/确认时间与收回入口', () => {
  const base = { key: 'early', name: '先行者', list: null, total: null, loading: true, error: '' };
  assert.match(render(badges.BadgeHolders, { holders: base }), /正在读取持有人/);
  const failure = render(badges.BadgeHolders, { holders: { ...base, loading: false, error: '断网' } });
  assert.match(failure, /不能判定暂无持有人[\s\S]*重试持有人/); assert.doesNotMatch(failure, /class="ac-empty"/);
  const html = render(badges.BadgeHolders, { holders: { ...base, loading: false, list: [{ user_id: 42, username: 'member', unlocked_at: 1730000000, acknowledged_at: null }] } });
  for (const text of ['42', '@member', '解锁时间', '确认时间', '未确认', '从此用户收回']) assert.ok(html.includes(text));
  assert.match(html, /ac-member-kv/);
});

test('徽章定义/颁发/收回保留表单输入错误，busy锁定、目标类型与原API契约不变', () => {
  assert.deepEqual(badges.badgeTargetBody('test', ' 42 '), { badge_key: 'test', user_id: 42 });
  assert.deepEqual(badges.badgeTargetBody('test', ' member '), { badge_key: 'test', username: 'member' });
  assert.throws(() => badges.badgeTargetBody('test', ' '), /请输入/);
  const form = renderForm(badges.BadgeForm, { open: true, mode: 'edit', item: { key: 'locked', name: '未丢失名称', description: '未丢失说明' }, saving: true, error: '保存503；输入已保留' });
  for (const text of ['未丢失名称', '未丢失说明', '保存503', 'member-badge-key', 'member-badge-color', 'member-badge-icon']) assert.ok(form.includes(text));
  assert.match(form, /<fieldset[^>]*disabled=""/); assert.match(form, /form="member-badge-form"/);
  const grant = renderForm(badges.GrantModal, { open: true, badge: { key: 'locked', name: '测试徽章', revoke: true, target: '42' }, saving: true, error: '收回503；目标已保留' });
  assert.match(grant, /value="42"/); assert.match(grant, /收回503/); assert.match(grant, /disabled=""/);
  const page = source('badges.jsx');
  for (const api of ['badges', 'createBadge', 'updateBadge', 'deleteBadge', 'badgeHolders', 'badgeGrant', 'badgeRevoke']) assert.ok(page.includes(`adminAPI.${api}(`), api);
  assert.match(page, /const request = \+\+requests.current.holders;[\s\S]*setHolders\([\s\S]*adminAPI.badgeHolders/);
  assert.match(page, /request === requests.current.holders/); assert.match(page, /mutation.current = true/);
  assert.match(page, /确认收回徽章/); assert.match(page, /放弃徽章更改/);
});

const diaper = { id: 7, brand: '品牌'.repeat(20), model: '型号'.repeat(20), product_type: '一次性', absorbency_mfr: '5000 ml', absorbency_adult: '1234 ml', is_baby_diaper: 1, material: '材质长文'.repeat(20), features: '完整特性\n'.repeat(20), avg_price: 0, official_url: 'https://example.test/official', created_at: '2026-11-13 01:00:00', images: ['https://example.test/first.png', `https://example.test/${'long'.repeat(40)}.png`], sizes: [{ label: 'M', waist_min: 0, waist_max: 70, hip_min: 80, hip_max: 90 }] };

test('纸尿裤/品牌首载刷新错误与空态互斥，桌面+360px卡完整字段可披露', () => {
  assert.match(render(diapers.CatalogResults, { resource: { list: null, loading: true, error: '' } }), /正在读取纸尿裤条目/);
  const failure = render(diapers.CatalogResults, { resource: { list: null, loading: false, error: '503' } });
  assert.match(failure, /不能判定为空/); assert.doesNotMatch(failure, /class="ac-empty"/);
  const html = render(diapers.CatalogResults, { resource: { list: [diaper], loading: true, error: '' } });
  assert.match(html, /ac-desktop-only/); assert.match(html, /ac-mobile-only/); assert.match(html, /展开完整参数、图片与尺码/);
  assert.match(html, /¥0/); assert.match(html, /完整特性/); assert.match(html, /1234 ml/); assert.ok(html.includes(diaper.images[1]));
  for (const action of ['详情', '编辑', '删除']) assert.ok(html.includes(action));
  assert.doesNotMatch(render(diapers.CatalogResults, { resource: { list: [], loading: false, error: '断网' }, brand: true }), /class="ac-empty"/);
  assert.match(render(diapers.CatalogResults, { resource: { list: [], loading: false, error: '' }, brand: true }), /暂无品牌/);
  const brand = render(diapers.CatalogResults, { resource: { list: [{ id: 9, name: '品牌完整名称', logo: 'https://example.test/logo.svg', invert_dark: true, invert_light: false }], loading: false, error: '' }, brand: true });
  for (const field of ['品牌完整名称', 'https://example.test/logo.svg', '深色 / 浅色反转', '创建时间']) assert.ok(brand.includes(field));
});

test('产品详情全部字段/图片/尺码可读，外部链接只允许HTTP(S)而不执行注入', () => {
  const html = render(diapers.DiaperDetails, { item: diaper });
  for (const text of ['厂商标注吸水量', '成人实测吸水量', '材质', '特性', '腰围下限 / 上限', '臀围下限 / 上限', diaper.images[0], diaper.images[1], '¥0']) assert.ok(html.includes(text));
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '/relative', 'not a url']) assert.equal(diapers.safeCatalogURL(url), '');
  assert.equal(diapers.safeCatalogURL('https://example.test/path'), 'https://example.test/path');
  const unsafe = render(diapers.DiaperDetails, { item: { ...diaper, official_url: 'javascript:alert(1)', images: ['data:text/html,<script>bad</script>'] } });
  assert.doesNotMatch(unsafe, /href="(?:javascript:|data:)|<script>/);
  assert.match(html, /rel="noopener noreferrer"/);
  const brand = render(diapers.BrandDetails, { item: { id: 9, name: '完整品牌', logo: 'https://example.test/logo.svg', invert_dark: true, invert_light: false } });
  for (const text of ['Logo URL', '深色主题反转', '浅色主题反转', '创建时间', '完整品牌']) assert.ok(brand.includes(text));
});

test('纸尿裤表单保留零值/所有字段及原payload，非法尺码阻止写入，失败不关闭表单', () => {
  const fields = diapers.diaperFields(diaper);
  assert.equal(fields.avg_price, 0); assert.match(fields.sizes, /M\|0\|70\|80\|90/);
  const payload = diapers.diaperPayload(fields);
  for (const field of ['brand', 'model', 'product_type', 'absorbency_mfr', 'absorbency_adult', 'is_baby_diaper', 'material', 'features', 'avg_price', 'official_url', 'images', 'sizes']) assert.deepEqual(payload[field], diaper[field]);
  assert.throws(() => diapers.diaperPayload({ ...fields, brand: ' ' }), /必填/);
  for (const sizes of ['M|x|70|80|90', 'M|80|70|80|90', 'M|1|2', 'M|1|2|3|-4']) assert.throws(() => diapers.diaperPayload({ ...fields, sizes }), /尺码/);
  const html = renderForm(diapers.DiaperForm, { open: true, mode: 'edit', item: diaper, saving: true, error: '保存503；输入已保留' });
  assert.match(html, /保存503/); assert.match(html, /<fieldset[^>]*disabled=""/); assert.match(html, /form="member-diaper-form"/);
  for (const field of ['brand', 'model', 'product_type', 'absorbency_mfr', 'absorbency_adult', 'avg_price', 'official_url', 'material', 'features', 'images', 'sizes']) assert.ok(html.includes(`id="member-diaper-${field}"`), field);
  const brandForm = renderForm(diapers.BrandForm, { open: true, mode: 'edit', item: { id: 9, name: '未丢失品牌', logo: 'https://example.test/logo.svg', invert_dark: true, invert_light: false }, saving: true, error: '品牌保存503' });
  assert.match(brandForm, /未丢失品牌/); assert.match(brandForm, /品牌保存503/); assert.match(brandForm, /<fieldset[^>]*disabled=""/);
  const page = source('diapers.jsx');
  for (const api of ['listDiapers', 'createDiaper', 'updateDiaper', 'deleteDiaper', 'listBrands', 'saveBrand', 'deleteBrand']) assert.ok(page.includes(`adminAPI.${api}(`));
  assert.doesNotMatch(page, /adminAPI\.(?:updateBrand|brandDetail|diaperDetail)\(/);
  assert.match(page, /放弃纸尿裤更改/); assert.match(page, /放弃品牌更改/); assert.match(page, /mutation.current = true/);
});

test('三页 cleanup 使用稳定计数器最新值，StrictMode 再 setup 不接受旧成功或失败', () => {
  for (const [file, keys] of [['overview.jsx', ['overview', 'trends', 'app']], ['badges.jsx', ['list', 'holders']], ['diapers.jsx', ['diapers', 'brands']]]) {
    const page = source(file);
    const body = /useEffect\(\(\) => \{\n([\s\S]*?)\n  \}, \[\]\);/.exec(page)?.[1];
    assert.ok(body, `${file} 生命周期应可独立验证`);
    assert.match(body, /const counters = requests.current/);
    assert.doesNotMatch(page, /requests\.current\s*=(?!=)/, `${file} 不得替换计数器对象`);
    const counters = Object.fromEntries(keys.map(key => [key, 0]));
    const requests = { current: counters };
    const alive = { current: false };
    const setup = () => runInNewContext(`(() => {${body}})()`, { requests, alive });
    const cleanup = setup();
    assert.equal(alive.current, true);
    const pending = keys.map((key, index) => {
      // setup 之后可以发出多次请求；cleanup 必须递增最新号，不能回写 setup 的 0。
      requests.current[key] += index + 4;
      const request = requests.current[key];
      return { key, request, accept: () => alive.current && request === requests.current[key] };
    });
    cleanup();
    assert.equal(alive.current, false);
    for (const old of pending) assert.equal(counters[old.key], old.request + 1);
    const cleanupAgain = setup();
    assert.equal(alive.current, true);
    assert.equal(requests.current, counters);
    for (const old of pending) {
      assert.equal(old.accept(), false, `${file}/${old.key} 的旧成功与失败均应忽略`);
      const current = ++requests.current[old.key];
      assert.equal(alive.current && current === counters[old.key], true);
    }
    cleanupAgain();
    assert.equal(alive.current, false);
    for (const old of pending) assert.equal(counters[old.key], old.request + 3);
  }
});

test('新增组CSS只作用本组，767px切换卡片且360px长内容可换行，不靠横滚或悬停提供操作', () => {
  const cssText = source('member-ux.css');
  const css = postcss.parse(cssText);
  assert.match(cssText, /@media \(max-width: 767px\)/);
  assert.match(cssText, /\.ac-member-ux \.ac-desktop-only \{ display: none; \}/);
  assert.match(cssText, /\.ac-member-ux \.ac-mobile-only \{ display: grid; \}/);
  assert.match(cssText, /overflow-wrap: anywhere/); assert.match(cssText, /min-width: 0/); assert.match(cssText, /min-height: 44px/);
  css.walkRules(rule => assert.match(rule.selector, /^\.ac-member-(?:ux|dialog)/, rule.selector));
  css.walkDecls(decl => { if (/^(?:color|background|border)/.test(decl.prop)) assert.doesNotMatch(decl.value, /#[\da-f]{3,8}\b|\b(?:white|black)\b/i); });
  assert.doesNotMatch(cssText, /:root|:has\(|\.admin-console|display:.*hover/);
  for (const file of ['overview.jsx', 'users.jsx', 'badges.jsx', 'diapers.jsx']) {
    const page = source(file); assert.match(page, /import '\.\/member-ux.css'/); assert.match(page, /ac-member-ux/);
    assert.doesNotMatch(page, /dangerouslySetInnerHTML|window\.confirm\(/);
  }
});
