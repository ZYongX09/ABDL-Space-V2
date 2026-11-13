import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as router from 'react-router-dom';
import { transform } from 'esbuild';
import * as adminModel from '../src/sponsors/adminModel.js';
import * as ledgerModel from '../src/sponsors/sponsorLedgerModel.js';
import * as policyModel from '../src/sponsors/alipayPolicyModel.js';
import * as adminAPI from '../src/sponsors/adminAPI.js';
import { createAlipayPolicyFixture } from './alipay-policy-fixture.js';

const source = name => readFileSync(new URL(`../src/sponsors/${name}`, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const plan = { id: 'monthly', version: 7, name: '单元视图月套餐', description: '仅供视图断言', price_minor: 590, currency: 'CNY', duration_unit: 'month', duration_count: 1, purchase_url: '', afdian_plan_id: '', afdian_sku_id: '', enabled: true, sort_order: 1 };
const config = { version: 3, enabled: true, free_daily_limit: 2, sponsor_daily_limit: 20, minimum_read_seconds: 5, notice_version: 2, timezone: 'Asia/Shanghai', center_title: '中心', notice_title: '须知', notice_body: '每天 {x} 张', exhausted_title: '用完', exhausted_body: '{reset} 重置', sponsor_exhausted_body: '{reset} 重置', purchase_title: '购买', purchase_steps: ['核对套餐'], default_color_key: 'blue', colors: [{ key: 'blue', name: '蓝色', light: '#123456', dark: '#abcdef', permanent_only: false }], benefits: [] };
const user = { id: 'view-user', username: '视图用户', sponsor: { active: true, permanent: false, plan_name: plan.name, expires_at: 1900000000 } };
const code = { id: 'code-view', masked_code: 'TEST-****-VIEW', state: 'active', plan_name: plan.name, batch_id: 'batch-view', expires_at: null, redeemed_at: null, redeemed_by: null };
const stock = { plan_id: plan.id, enabled: false, verified: false, can_enable: false, can_refill: false, paused: false, low_water: 2, target_stock: 10, batch_size: 5, check_interval_seconds: 300, verification_status: 'unchecked', last_stock: null, observed_line_count: null, product_stock: null, last_checked_at: null, next_check_at: null };
const batch = { id: 'stock-view', plan_id: plan.id, code_batch_id: code.batch_id, count: 1, state: 'unknown', created_at: 1800000000, last_error: '待核查正向证据' };
const audit = { id: 'audit-view', action: 'quota_adjust', actor_id: 'admin-view', user_id: user.id, created_at: 1800000000, reason: '人工复核后调整今日额外额度' };
const alipay = { channel: 'alipay', order_no: 'VIEW-ALIPAY-ORDER', paid_at: 1800000000, plan_name: plan.name, amount_minor: 590, username: user.username, avatar: null, refundable: true };
const afdian = { channel: 'afdian', order_no: 'VIEW-AFDIAN-ORDER', paid_at: 1800000000, plan_name: plan.name, amount_minor: 590, message: '单元视图留言', redeemer: null };
const overview = { schema_version: 1, generated_at: 1800000000, channels: { alipay: { month_income_minor: 590, total_income_minor: 590, total_count: 1, month_count: 1 }, afdian: { month_income_minor: 0, total_income_minor: 0, total_count: 0 } } };
const list = items => ({ items, total: items.length });
const ledger = items => ({ schema_version: 1, ...list(items), limit: 20, offset: 0 });
const ready = data => ({ data, loading: false, error: '' });
const noNetwork = new Proxy({}, { get: (_, name) => () => { throw new Error(`视图渲染不得调用 API: ${String(name)}`); } });

// 只在内存转译真实 JSX，不启动 Vite/server，不写 fixture，不执行 effect。
// hooks 仅注入只读服务器快照，实际表格、卡片、表单、错误分支由真实组件渲染。
async function loadViews() {
  const settings = { resources: [], policy: null, override: null, ids: 0 };
  const hooks = { ...React, useEffect() {}, useMemo: fn => fn(), useCallback: fn => fn, useRef: value => ({ current: value }), useId: () => `view-${++settings.ids}`,
    useState(initial) {
      const value = typeof initial === 'function' ? initial() : initial;
      const forced = settings.override?.(value);
      if (forced !== undefined) return [forced, () => {}];
      if (value?.loading === true && value.data === null) return [settings.resources.shift() || value, () => {}];
      if (value?.owner && value.snapshot === null && settings.policy) return [{ ...value, snapshot: settings.policy, draft: policyModel.alipayPolicyDraft(settings.policy.settings), loading: false }, () => {}];
      return [value, () => {}];
    },
  };
  const loaded = {};
  async function load(name) {
    const compiled = await transform(source(name), { loader: 'jsx', jsx: 'automatic', format: 'cjs', target: 'es2022', define: { 'import.meta.env.VITE_API_BASE': '""' } });
    const module = { exports: {} };
    const dependencies = { react: hooks, 'react-router-dom': router, './adminModel.js': adminModel, './sponsorLedgerModel.js': ledgerModel, './alipayPolicyModel.js': policyModel, './adminAPI.js': adminAPI, '../contexts/AuthContext.jsx': { useAuth: () => ({ user: { id: 'admin-view', username: '单元管理员' }, accounts: [] }) }, '../pages/admin/ui.jsx': { useDialogLifecycle() {} } };
    new Script(compiled.code, { filename: name }).runInContext(createContext({ module, exports: module.exports, require(id) { if (id.endsWith('.css')) return {}; return dependencies[id] || loaded[id] || require(id); }, structuredClone, console, Date, setInterval, clearInterval }));
    loaded[`./${name}`] = module.exports;
    return module.exports;
  }
  await load('AlipayPolicyPanel.jsx');
  await load('SponsorOverviewPanel.jsx');
  const ledgerViews = await load('SponsorLedgerPanel.jsx');
  const views = await load('SponsorAdmin.jsx');
  // 真实路由 wrapper 必须显式声明嵌入；标题宿主只提供与 AdminLayout 相同的 h1 契约。
  const wrapper = { exports: {} };
  const wrapperCode = await transform(readFileSync(new URL('../src/pages/admin/sponsors.jsx', import.meta.url), 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs' });
  new Script(wrapperCode.code, { filename: 'admin/sponsors.jsx' }).runInContext(createContext({ module: wrapper, exports: wrapper.exports, require(id) {
    if (id === '../../contexts/AuthContext.jsx') return { useAuth: () => ({ user: { id: 'admin-view', role: 'admin' } }) };
    if (id === './layout.jsx') return { __esModule: true, default: ({ children }) => React.createElement('main', null, React.createElement('h1', null, '赞助者管理'), children) };
    if (id === '../../sponsors/SponsorAdmin.jsx') return views;
    return require(id);
  } }));
  const actions = { busy: false, overviewVersion: 0, run() { throw new Error('静态视图不应写入'); }, confirm() { throw new Error('静态视图不应确认'); }, mutate() { throw new Error('静态视图不应写入'); } };
  function render(Component, props = {}, { resources = [], policy = null, override = null, route = '/' } = {}) {
    settings.resources = resources.map(value => value && Object.hasOwn(value, 'loading') ? value : ready(value)); settings.policy = policy; settings.override = override; settings.ids = 0;
    return renderToStaticMarkup(React.createElement(router.MemoryRouter, { initialEntries: [route] }, React.createElement(views.SponsorAdminApiContext.Provider, { value: noNetwork }, React.createElement(views.SponsorAdminActionsContext.Provider, { value: actions }, React.createElement(Component, props)))));
  }
  return { views, ledgerViews, render, actions, AdminSponsors: wrapper.exports.default };
}

const viewPromise = loadViews();
const cases = [
  ['overview', 'OverviewTab', [config, { items: [plan] }, { items: [stock] }], /下一步处理/],
  ['config', 'ConfigTab', [config, overview, ledger([alipay, afdian])], /支付宝门禁 · 独立保存/],
  ['plans', 'PlansTab', [{ items: [plan] }], /服务器套餐与版本/],
  ['users', 'UsersTab', [list([user]), { items: [plan] }], /用户身份检索结果/],
  ['codes', 'CodesTab', [{ items: [plan] }, list([code])], /兑换码检索结果（仅脱敏码）/],
  ['stock', 'StockTab', [{ credentials: {}, items: [stock] }, { items: [plan] }], /受控手动补货 · 外部写入/],
  ['batches', 'BatchesTab', [list([batch])], /补货批次与正向证据核查/],
  ['audit', 'AuditTab', [list([audit])], /赞助管理操作审计/],
];
for (const [tab, view, resources, expected] of cases) {
  test(`赞助后台 ${tab} 实际视图有独立工作区，不触发 API 或自动操作`, async () => {
    const h = await viewPromise;
    const html = h.render(h.views[view], {}, { resources });
    assert.match(html, expected);
    assert.match(html, /sa-panel/);
    if (['plans', 'users', 'codes', 'batches', 'audit'].includes(tab)) { assert.match(html, /<table/); assert.match(html, /sa-mobile-records/); }
  });
}

test('真实管理路由显式嵌入只保留 layout 唯一 h1，八栏上下文仍可辨认', async () => {
  const h = await viewPromise;
  for (const [tab, label] of h.views.SPONSOR_ADMIN_TABS) {
    const html = h.render(h.AdminSponsors, {}, { route: `/admin/sponsors?tab=${tab}` });
    assert.equal((html.match(/<h1\b/g) || []).length, 1, tab);
    assert.match(html, /data-embedded="true"/);
    assert.match(html, new RegExp(`<strong>${label}</strong>`));
    assert.equal((html.match(/data-testid="sponsor-tab-/g) || []).length, 8);
    assert.match(html, /sa-tab-context/);
    assert.match(html, /切换栏目会关闭未提交表单/);
    const top = html.slice(html.indexOf('data-testid="sponsor-admin"'), html.indexOf('<nav aria-label="赞助者管理栏目"'));
    assert.doesNotMatch(top, /<h1\b|sa-heading|管理员 · @|配置、权益与交易核查工作台/);
    assert.match(top, /服务器数据 · 变更留审计/);
  }
});

test('同 URL 的独立宿主仍有可见 h1 与操作说明，嵌入配置保留独立保存和风险', async () => {
  const h = await viewPromise;
  const standalone = h.render(h.views.default, {}, { route: '/admin/sponsors?tab=config' });
  assert.equal((standalone.match(/<h1\b/g) || []).length, 1);
  assert.match(standalone, /<h1>赞助者管理<\/h1>/);
  assert.doesNotMatch(standalone, /data-embedded="true"/);
  assert.match(standalone, /不自动保存，不自动重试外部写入/);
  const embedded = h.render(h.views.default, { embedded: true }, { route: '/admin/sponsors?tab=config', resources: [config, overview, ledger([alipay])] });
  assert.doesNotMatch(embedded, /<h1\b/);
  assert.match(embedded, /权益配置与支付宝门禁独立保存/);
  assert.match(embedded, /不会同时保存下方支付宝门禁/);
  assert.match(embedded, /切换栏目会关闭未提交表单/);
  assert.match(embedded, /不自动保存，不自动重试外部写入/);
  const css = source('sponsors.css');
  assert.match(css, /\.sponsor-admin\[data-embedded="true"\] \{ padding: 0;/);
  assert.doesNotMatch(css, /\.sponsor-admin[^{}]*h1[^{}]*\{[^}]*display:\s*none/);
});

test('八栏真实加载/错误视图不以 0 或占位记录冒充成功', async () => {
  const h = await viewPromise;
  assert.deepEqual(Array.from(h.views.SPONSOR_ADMIN_TABS, item => item[0]), cases.map(item => item[0]));
  for (const [, view, resources] of cases) {
    const loading = h.render(h.views[view]);
    assert.match(loading, /正在读取/);
    const failed = h.render(h.views[view], {}, { resources: resources.map(() => ({ data: null, loading: false, error: '单元读取失败' })) });
    assert.match(failed, /单元读取失败/); assert.match(failed, /重新读取/);
    assert.doesNotMatch(failed, /TEST-\*\*\*\*-VIEW|VIEW-ALIPAY-ORDER|单元视图月套餐/);
  }
});

test('五类名单有真实空态，零条分页、长值和理由提供完整查看', async () => {
  const h = await viewPromise;
  for (const [view, resources, text] of [
    ['PlansTab', [{ items: [] }], /尚未创建套餐/], ['UsersTab', [list([]), { items: [] }], /暂无用户记录/], ['CodesTab', [{ items: [] }, list([])], /没有符合条件的兑换码/], ['BatchesTab', [list([])], /暂无补货批次/], ['AuditTab', [list([])], /暂无赞助管理审计记录/],
  ]) assert.match(h.render(h.views[view], {}, { resources }), text);
  assert.match(h.render(h.views.Pagination, { offset: 0, total: 0, onChange() {} }), /第 1 \/ 1 页/);
  const long = '完整审计理由'.repeat(30);
  const html = h.render(h.views.LongValue, { value: long, label: '操作理由' });
  assert.match(html, /查看完整操作理由/); assert.ok(html.includes(long));
});

test('权益与套餐表单显示版本草稿、分组和提交影响，不混写支付宝策略', async () => {
  const h = await viewPromise;
  const html = h.render(h.views.ConfigForm, { initial: config, reload() {} });
  assert.match(html, /已读取服务器配置 v3/); assert.match(html, /不.*同时保存下方支付宝门禁/); assert.match(html, /版本冲突.*不自动覆盖或重发/);
  const edited = h.render(h.views.ConfigForm, { initial: config, reload() {} }, { override: value => value?.center_title ? { ...value, center_title: '修改后的标题' } : undefined });
  assert.match(edited, /有未提交草稿/);
  const planHTML = h.render(h.views.PlanForm, { initial: { ...plan, creating: false }, close() {}, saved() {} });
  assert.match(planHTML, /身份、价格与有效期/); assert.match(planHTML, /历史记录.*旧兑换码/); assert.match(planHTML, /value="5.90"/);
  const body = source('SponsorAdmin.jsx');
  assert.match(body, /expected_version: initial\.version/); assert.match(body, /price_minor: parsePrice\(price\)/);
  assert.match(body, /operations\.current\.get\(key, body\)/); assert.match(body, /if \(error\.definitive\) operations\.current\.done\(key\)/);
});

test('兑换码生成、选择与明文下载明确分离，保留剪贴板警告和未知补货门禁', async () => {
  const h = await viewPromise;
  const codes = h.render(h.views.CodesTab, {}, { resources: [{ items: [plan] }, list([code])] });
  assert.match(codes, /选择批次不会自动导出/); assert.match(codes, /剪贴板.*泄露/); assert.doesNotMatch(codes, /navigator\.clipboard/);
  const generated = h.render(h.views.CreateBatchForm, { plans: [plan], created() {} });
  assert.match(generated, /不会自动下载或入池/);
  const locked = h.render(h.views.StockForm, { initial: stock, plan, reload() {} });
  assert.match(locked, /单条|固定为 1 条/); assert.match(locked, /disabled=""/);
  const uncertain = h.render(h.views.StockForm, { initial: { ...stock, can_refill: true }, plan, reload() {} }, { override: value => value === false ? true : undefined });
  assert.match(uncertain, /本页面已停止再次发送/);
  assert.match(source('SponsorAdmin.jsx'), /disabled=\{initial\.can_refill !== true \|\| uncertain\}/);
});

test('独立支付宝门禁和收入样本实际呈现人工口径、CAS及精确金额', async () => {
  const h = await viewPromise;
  const policy = createAlipayPolicyFixture().respond('/api/admin/sponsors/alipay-policy').data;
  const html = h.render(h.views.ConfigTab, {}, { resources: [config, overview, ledger([alipay])], policy });
  assert.match(html, /人工核实与新购开关/); assert.match(html, /更保守的金额上限/); assert.match(html, /独立保存支付宝门禁/);
  assert.match(html, /草稿基于 v1/); assert.match(html, /预算/); assert.match(html, /服务器汇总样本 · 非实时余额/); assert.match(html, /¥5.90/);
  assert.match(html, /不是支付宝商户全部应用/); assert.match(html, /不是无限额/);
});

test('账本桌面表格和移动卡片保留未知兑换用户、留言及退款权限', async () => {
  const h = await viewPromise;
  for (const Component of [h.ledgerViews.RecordTable, h.ledgerViews.RecordRow]) {
    const props = Component === h.ledgerViews.RecordTable ? { items: [afdian] } : { record: afdian };
    const html = h.render(Component, { ...props, onRefund() {}, refundOpen: false });
    assert.match(html, /未知用户/); assert.match(html, /未兑换/); assert.match(html, /单元视图留言/); assert.doesNotMatch(html, />退款<\/button>/);
  }
  const html = h.render(h.ledgerViews.RecordRow, { record: { ...alipay, order_no: 'LONG-ORDER-'.repeat(10) }, onRefund() {}, refundOpen: false });
  assert.match(html, /查看完整订单号/); assert.match(html, />退款<\/button>/);
});

function refundHarness({ send, confirm = async () => true } = {}) {
  const text = source('SponsorLedgerPanel.jsx');
  const start = text.indexOf('  function patchRefund(patch) {'), end = text.indexOf('  const page = state.data ?', start);
  assert.ok(start > 0 && end > start, '真实退款 handlers 边界改变，请更新测试');
  const calls = [], notices = [], keys = [];
  const api = { refundAlipayOrder: async (...args) => { calls.push(args); if (send) return send(...args); return { order_no: args[0], refund_no: 'REFUND-VIEW', refund_amount_minor: args[1].refund_amount, status: 'accepted' }; } };
  const context = { ...ledgerModel, api, actions: { busy: false, confirm }, state: { loading: false }, locked: { current: false }, mounted: { current: true }, activeApi: { current: api }, refund: { record: alipay, amount: '5.90', reason: '视图单元退款原因', key: '', body: null, phase: 'form', error: '' },
    newIdempotencyKey: () => { const key = '12345678-1234-4234-8234-123456789abc'; keys.push(key); return key; },
    setRefund: update => { context.refund = typeof update === 'function' ? update(context.refund) : update; }, setNotice: value => notices.push(value), setRevision() {}, onRefunded() {},
  };
  const handlers = new Script(`${text.slice(start, end)}\n({ submitRefund, closeRefund });`, { filename: 'SponsorLedgerPanel.actual-handlers.js' }).runInContext(createContext(context));
  return { ...handlers, context, calls, notices, keys };
}

test('真实退款 handler 未知结果保留金额理由和 UUID；仅明确重试沿用同一请求', async () => {
  let sent = 0;
  const h = refundHarness({ send: async (order, body) => { if (++sent === 1) throw new Error('未知网络结果'); return { order_no: order, refund_no: 'REFUND-VIEW', refund_amount_minor: body.refund_amount, status: 'accepted' }; } });
  await h.submitRefund();
  assert.equal(h.context.refund.phase, 'unknown'); assert.equal(h.context.refund.reason, '视图单元退款原因'); assert.equal(h.calls.length, 1); assert.equal(h.notices.length, 0);
  await h.submitRefund();
  assert.equal(h.keys.length, 1); assert.deepEqual(h.calls[0], h.calls[1]); assert.equal(h.calls[1][1].refund_amount, 590);
  assert.equal(h.context.refund, null); assert.match(h.notices[0], /不会自动取消已发放权益/);
});

test('退款取消、校验失败、确认中双击与切换会话都不误发或伪报成功', async () => {
  const cancelled = refundHarness({ confirm: async () => false }); await cancelled.submitRefund(); assert.equal(cancelled.calls.length, 0);
  const invalid = refundHarness(); invalid.context.refund.amount = '5.901'; await invalid.submitRefund(); assert.equal(invalid.calls.length, 0); assert.match(invalid.context.refund.error, /两位小数/);
  let resolve; const pendingConfirm = new Promise(yes => { resolve = yes; });
  const duplicate = refundHarness({ confirm: () => pendingConfirm }); const flight = duplicate.submitRefund(); await duplicate.submitRefund(); assert.equal(duplicate.calls.length, 0); resolve(true); await flight; assert.equal(duplicate.calls.length, 1);
  let finish; const response = new Promise(yes => { finish = yes; });
  const switched = refundHarness({ send: () => response }); const request = switched.submitRefund(); await Promise.resolve(); switched.context.activeApi.current = {}; finish({ order_no: alipay.order_no, refund_no: 'REFUND-VIEW', refund_amount_minor: 590, status: 'accepted' }); await request; assert.equal(switched.notices.length, 0);
});

test('原生确认采用共享顶层生命周期，危险操作默认取消且不抢焦点', () => {
  const text = source('SponsorAdmin.jsx');
  assert.match(text, /useDialogLifecycle\(true, cancel, ref, \{ initialFocus: 'cancel' \}\)/);
  assert.match(text, /dialog\.showModal\(\)/); assert.match(text, /data-dialog-cancel/);
  assert.doesNotMatch(text, /addEventListener\(['"]keydown|feedback\.current\?\.focus/);
});

test('赞助 CSS 全部限定后台根，移动表格转换不会重塑前台中心', () => {
  for (const file of ['sponsors.css', 'sponsorLedger.css']) {
    const css = source(file);
    for (const line of css.split('\n')) if (/^\s*\.(?:sa-|sponsor-admin)/.test(line)) assert.match(line.trimStart(), /^\.sponsor-admin(?:\s|[\s\S]*\{)/);
    assert.doesNotMatch(css, /(^|\n)\s*\.sa-/);
  }
  assert.match(source('sponsors.css'), /\.sponsor-admin \.sa-table \{ display: none;/);
  assert.match(source('sponsors.css'), /\.sponsor-admin \.sa-mobile-records \{ display: grid;/);
});
