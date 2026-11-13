import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';
import { parse as parseCSS } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import { createServer } from 'vite';
import { createAdminUXRouter } from './admin-ux-fixture-router.js';
import { fmtFull, fmtNum, parseTs } from '../src/pages/admin/util.js';
import { adminSessionKey } from '../src/pages/admin/access.js';

const page = readFileSync(new URL('../src/pages/admin/advertising.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pages/admin/advertising-ux.css', import.meta.url), 'utf8');
const mobile = page.includes('function parseCodes(');
const compiled = transformSync(page.replace(/^import .+;\n/gm, '').replace('export default function AdminAdvertising()', 'function AdminAdvertising()').replaceAll('export function ', 'function '), {
  loader: 'jsx', target: 'es2022', jsxFactory: 'h', jsxFragment: 'Fragment',
}).code;
const policy = (patch = {}) => ({ enabled: 0, max_per_timeline: 1, min_interval_seconds: 8, ad_probability: 20, fallback_probability: 5, updated_at: '2026-11-13 08:00:00', updated_by: 7, ...patch });
const ad = (id = 1, status = 'active', patch = {}) => ({ id, merchant_id: 9, merchant_name: '测试商家', title: `广告 ${id}`, body: '已读取的广告内容', ad_type: 'merchant', status, impression_count: 12, link_click_count: 2, image_view_count: 3, ad_navigation_count: 4, updated_at: '2026-11-13 08:00:00', ...patch });
const registrationCode = (id = 1, patch = {}) => ({ id, masked_code: 'abc***xy', consumed_at: null, consumed_by: null, expires_at: null, created_at: '2026-11-13 08:00:00', ...patch });
const overview = (patch = {}) => ({ items: [ad(), ad(2, 'draft')], codes: [registrationCode()], impressions: 17, clicks: 9, ...patch });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const h = (type, props, ...children) => ({ type, props: { ...props, children } });
const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.props.children) : String(node);

// 编译并执行真实页面 JSX 与事件处理器；只替换 React 调度 / UI 容器 / 网络边界。
// 不启动 Vite，不复制业务处理器，不依赖源码正则来冒充点击行为。
function mount(overrides = {}, initialAuth = { user: { id: 7, role: 'admin' }, loading: false, accounts: [] }) {
  const calls = [], successes = [], instances = new Map();
  let auth = initialAuth, active, tree, dirty = true, effects = [], root;
  const defaults = {
    advertising: async () => overview(), advertisingStats: async () => ({ stats: { impressions: 17, clicks: 9 } }), advertisingPolicy: async () => policy(),
    updateAdvertisingPolicy: async next => policy({ ...next, updated_at: '2026-11-13 08:01:00' }),
    advertisingAction: async (id, action) => ad(id, action === 'approve' ? 'active' : 'paused', { updated_at: '2026-11-13 08:01:00' }),
    generateAdvertisingCodes: async () => ({ success: true, masked_code: 'abc***xy' }),
  };
  const api = Object.fromEntries(Object.keys(defaults).map(name => [name, (...args) => { calls.push({ name, args }); return (overrides[name] || defaults[name])(...args); }]));
  const depsChanged = (previous, next) => !previous || !next || previous.length !== next.length || next.some((value, index) => !Object.is(value, previous[index]));
  const hook = initialize => { const instance = active; const index = instance.cursor++; if (!Object.hasOwn(instance.slots, index)) instance.slots[index] = initialize(); return instance.slots[index]; };
  const useState = initial => { const slot = hook(() => ({ value: typeof initial === 'function' ? initial() : initial })); return [slot.value, next => { const value = typeof next === 'function' ? next(slot.value) : next; if (!Object.is(value, slot.value)) { slot.value = value; dirty = true; } }]; };
  const useRef = initial => hook(() => ({ current: initial }));
  const useCallback = (callback, dependencies) => { const slot = hook(() => ({})); if (depsChanged(slot.dependencies, dependencies)) { slot.dependencies = dependencies; slot.callback = callback; } return slot.callback; };
  const useEffect = (setup, dependencies) => { const slot = hook(() => ({})); if (depsChanged(slot.dependencies, dependencies)) { slot.dependencies = dependencies; effects.push(() => { slot.cleanup?.(); slot.cleanup = setup(); }); } };
  const Card = ({ title, description, action, children }) => h('section', {}, h('h2', {}, title), description && h('p', {}, description), action, children);
  const context = {
    h, Fragment: 'fragment', useState, useRef, useCallback, useEffect, adminAPI: api,
    useAuth: () => auth, useToast: () => ({ success: message => successes.push(message), error() {} }), adminSessionKey,
    fmtFull, fmtNum, parseTs, window: { setInterval: () => 1, clearInterval() {} },
    AdminLayout: ({ children }) => h('main', {}, children), Card,
    Empty: ({ text: message }) => h('div', { 'data-empty': true }, message),
    ErrorBox: ({ msg }) => msg ? h('div', { role: 'alert' }, msg) : null,
    Loading: ({ text: message }) => h('div', { role: 'status' }, message),
    Pill: ({ children }) => h('span', {}, children),
    FormField: ({ label, htmlFor, hint, error, children }) => h('div', {}, h('label', { htmlFor }, label), children, hint, error && h('div', { role: 'alert' }, error)),
    StatCard: ({ label, value, meta }) => h('div', { 'data-stat': label, 'data-value': value }, value, meta),
  };
  const module = runInNewContext(`${compiled}\n({ AdminAdvertising, parsePolicy, parseAds, parseStats, parseAdReceipt, policyErrors${mobile ? ', parseCodes, parseCodeReceipt' : ''} });`, context, { filename: 'advertising.actual-jsx.js' });
  root = module.AdminAdvertising;
  const expand = (node, path, seen) => {
    if (node == null || typeof node === 'boolean') return null;
    if (Array.isArray(node)) return node.map((child, index) => expand(child, `${path}.${index}`, seen));
    if (typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const id = `${path}:${node.type.name}:${node.props.key || ''}`;
      if (!instances.has(id)) instances.set(id, { slots: [], cursor: 0 });
      const instance = instances.get(id); instance.cursor = 0; seen.add(id);
      const previous = active; active = instance;
      const child = node.type(node.props); active = previous;
      return expand(child, `${id}.render`, seen);
    }
    return { ...node, props: { ...node.props, children: expand(node.props.children, `${path}.children`, seen) } };
  };
  const render = () => {
    let iterations = 0;
    do {
      assert.ok(iterations++ < 40, '页面不能进入重渲染循环');
      dirty = false;
      const seen = new Set(); tree = expand(h(root, {}), 'root', seen);
      for (const [id, instance] of instances) if (!seen.has(id)) { instance.slots.forEach(slot => slot.cleanup?.()); instances.delete(id); }
      const pendingEffects = effects; effects = []; pendingEffects.forEach(setup => setup());
    } while (dirty);
    return tree;
  };
  const flush = async () => { for (let index = 0; index < 30; index++) { await Promise.resolve(); if (dirty) render(); } };
  const nodes = predicate => { const found = []; const walk = node => { if (Array.isArray(node)) return node.forEach(walk); if (!node || typeof node !== 'object') return; if (predicate(node)) found.push(node); walk(node.props.children); }; walk(tree); return found; };
  const button = label => nodes(node => node.type === 'button' && (text(node) === label || node.props['aria-label'] === label))[0];
  const click = node => { assert.ok(node, '应渲染操作按钮'); if (node.props.disabled) return undefined; const result = node.props.onClick?.(); render(); return result; };
  const change = (id, value) => { const input = nodes(node => node.props.id === id)[0]; assert.ok(input, id); input.props.onChange({ target: { value, checked: value } }); render(); };
  const submit = () => { const form = nodes(node => node.type === 'form')[0]; assert.ok(form); const result = form.props.onSubmit({ preventDefault() {} }); render(); return result; };
  render();
  return { module, calls, successes, nodes, button, click, change, submit, render, flush, text: () => text(tree), callCount: name => calls.filter(call => call.name === name).length, setAuth: next => { auth = next; render(); }, unmount: () => { for (const instance of instances.values()) instance.slots.forEach(slot => slot.cleanup?.()); instances.clear(); } };
}
const adAction = (host, id, view) => host.nodes(node => node.type === 'button' && node.props['data-ad-action'] === id && node.props['data-view'] === view)[0];

test('读取失败 / 畸形策略不产生默认关闭、假零统计或假空列表；成功资源仍可使用', async () => {
  for (const malformed of [null, {}, { ok: true }, policy({ enabled: '0' }), policy({ ad_probability: null }), policy({ updated_at: null })]) {
    const host = mount({ advertisingPolicy: async () => malformed });
    await host.flush();
    assert.match(host.text(), /投放策略读取失败/);
    assert.match(host.text(), /总开关状态未知/);
    assert.equal(host.nodes(node => node.type === 'form').length, 0);
    assert.equal(adAction(host, 1, 'desktop').props.disabled, false);
    assert.equal(host.nodes(node => node.props['data-stat'] === '累计曝光')[0].props['data-value'], '17');
    assert.equal(host.callCount('updateAdvertisingPolicy'), 0);
    host.unmount();
  }
  const host = mount({ advertising: async () => { throw new Error('503 广告读取中断'); }, advertisingStats: async () => { throw new Error('503 统计读取中断'); } });
  await host.flush();
  assert.match(host.text(), /广告列表读取失败/);
  assert.doesNotMatch(host.text(), /服务端已确认：暂无广告投放/);
  assert.equal(host.nodes(node => node.props['data-stat'] === '累计曝光')[0].props['data-value'], '—');
  assert.equal(host.nodes(node => node.props['data-stat'] === '已读取广告')[0].props['data-value'], '—');
  assert.ok(host.nodes(node => node.props.id === 'advertising-policy-enabled').length, '列表失败不阻止可信策略编辑');
  host.unmount();
});

test('列表和统计畸形值独立报错；读取失败不是已确认空列表，重读可恢复且按钮忙时去重', async () => {
  const host = mount(); await host.flush();
  for (const malformed of [null, {}, { items: null }, { items: [null] }, { items: [ad(), ad()] }]) assert.throws(() => host.module.parseAds(malformed));
  for (const malformed of [null, {}, { impressions: null, clicks: 0 }, { impressions: '0', clicks: 0 }, { impressions: 0, clicks: -1 }]) assert.throws(() => host.module.parseStats(malformed));
  assert.equal(host.module.parseStats({ impressions: 0, clicks: 0 }).impressions, 0);
  host.unmount();
  let reads = 0; const retry = deferred();
  const recovery = mount({ advertising: () => ++reads === 1 ? Promise.reject(new Error('temporary read outage')) : retry.promise });
  await recovery.flush();
  const reload = recovery.button('重新读取广告');
  const first = reload.props.onClick(); reload.props.onClick(); recovery.render();
  await recovery.flush();
  assert.equal(reads, 2);
  assert.equal(recovery.button('重新读取广告').props.disabled, true);
  retry.resolve(overview({ items: [] })); await first; await recovery.flush();
  assert.match(recovery.text(), /服务端已确认：暂无广告投放/);
  recovery.unmount();
});

test('Web 实际 API→GUI fixture→页面读取 stats 包装；保留后端扁平格式且畸形包装不得回退或显示假零', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../', import.meta.url).pathname, define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') }, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const calls = [];
  const router = createAdminUXRouter({ role: 'admin' });
  globalThis.localStorage = { getItem: key => key === 'abdl_accounts' ? JSON.stringify([{ id: 2, token: 'fixture-2' }]) : key === 'abdl_active_account' ? '2' : null };
  let alteredStats;
  let replaceStats = false;
  globalThis.fetch = async (url, options = {}) => {
    const path = String(url);
    calls.push({ path, options });
    const result = await router.respond(path, { method: options.method || 'GET', headers: options.headers });
    return Response.json(replaceStats && path === '/api/admin/advertising/stats' ? alteredStats : result.data, { status: result.status });
  };
  try {
    const { adminAPI } = await server.ssrLoadModule('/src/api');
    for (const [scenario, impressions, clicks] of [['normal', 64, 12], ['empty', 0, 0]]) {
      router.setup({ scenario });
      assert.deepEqual(await adminAPI.advertisingStats(), { stats: { impressions, clicks } }, '真实 API wrapper 不能替测试拆包');
      const host = mount({ advertising: () => adminAPI.advertising(), advertisingStats: () => adminAPI.advertisingStats(), advertisingPolicy: () => adminAPI.advertisingPolicy() });
      try {
        await host.flush();
        assert.equal(host.nodes(node => node.props['data-stat'] === '累计曝光')[0].props['data-value'], String(impressions));
        assert.equal(host.nodes(node => node.props['data-stat'] === '累计互动')[0].props['data-value'], String(clicks));
        assert.doesNotMatch(host.text(), /广告统计读取失败/);
      } finally { host.unmount(); }
    }
    router.setup({ scenario: 'normal' });
    replaceStats = true;
    alteredStats = { impressions: 48, clicks: 9, link_clicks: 2, image_views: 3, ad_navigations: 4 };
    const flatHost = mount({ advertisingStats: () => adminAPI.advertisingStats() });
    try {
      await flatHost.flush();
      assert.equal(flatHost.nodes(node => node.props['data-stat'] === '累计曝光')[0].props['data-value'], '48');
      assert.equal(flatHost.nodes(node => node.props['data-stat'] === '累计互动')[0].props['data-value'], '9');
    } finally { flatHost.unmount(); }
    const malformed = [null, {}, { stats: null }, { stats: [] }, { stats: {} }, { stats: { impressions: 0 } }, { stats: { impressions: '0', clicks: 0 } }, { stats: { impressions: null, clicks: 0 } }, { stats: { impressions: -1, clicks: 0 } }, { stats: { impressions: 0, clicks: 0.5 } }, { stats: { impressions: 0, clicks: Number.MAX_SAFE_INTEGER + 1 } }, { stats: { stats: { impressions: 0, clicks: 0 } } }, { impressions: 999, clicks: 999, stats: null }, { impressions: 999, clicks: 999, stats: { impressions: 0, clicks: null } }];
    for (const value of malformed) {
      alteredStats = value;
      const host = mount({ advertisingStats: () => adminAPI.advertisingStats() });
      try {
        await host.flush();
        assert.match(host.text(), /广告统计读取失败/);
        assert.equal(host.nodes(node => node.props['data-stat'] === '累计曝光')[0].props['data-value'], '—');
        assert.equal(host.nodes(node => node.props['data-stat'] === '累计互动')[0].props['data-value'], '—');
        assert.equal(adAction(host, 1, 'desktop').props.disabled, false, '统计畸形不污染有效广告列表');
      } finally { host.unmount(); }
    }
    for (const call of calls.filter(call => call.path === '/api/admin/advertising/stats')) {
      assert.equal(call.options.method, undefined);
      assert.equal(call.options.credentials, 'include');
      assert.equal(call.options.headers.Authorization, 'Bearer fixture-2');
    }
  } finally {
    await server.close();
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage;
  }
});

test('有效零值保持为零；表单逐字段拒绝空白、小数、越界并区分草稿和已存开关', async () => {
  const host = mount({ advertisingPolicy: async () => policy({ max_per_timeline: 0, min_interval_seconds: 0, ad_probability: 0, fallback_probability: 0 }) });
  await host.flush();
  assert.match(host.text(), /服务端已确认：总开关关闭/);
  assert.equal(host.nodes(node => node.props.id === 'advertising-policy-ad_probability')[0].props.value, 0);
  host.change('advertising-policy-enabled', true);
  assert.match(host.text(), /草稿总开关：开启（未保存）/);
  assert.match(host.text(), /服务端已确认：总开关关闭/);
  assert.equal(host.successes.length, 0);
  for (const value of ['', ' ', '1.5', '-1', '101']) {
    host.change('advertising-policy-ad_probability', value);
    assert.equal(host.nodes(node => node.props.id === 'advertising-policy-ad_probability')[0].props['aria-invalid'], true);
    await host.submit();
    assert.equal(host.callCount('updateAdvertisingPolicy'), 0);
    assert.equal(host.button('保存策略').props.disabled, true);
  }
  host.change('advertising-policy-ad_probability', '100');
  host.change('advertising-policy-max_per_timeline', '2');
  assert.equal(host.button('保存策略').props.disabled, true);
  host.change('advertising-policy-max_per_timeline', '1');
  host.change('advertising-policy-min_interval_seconds', '86401');
  assert.equal(host.button('保存策略').props.disabled, true);
  host.change('advertising-policy-min_interval_seconds', '86400');
  host.change('advertising-policy-fallback_probability', '0');
  await host.submit(); await host.flush();
  assert.equal(host.callCount('updateAdvertisingPolicy'), 1);
  const body = host.calls.find(call => call.name === 'updateAdvertisingPolicy').args[0];
  assert.equal(body.enabled, true); assert.equal(body.min_interval_seconds, 86400); assert.equal(body.ad_probability, 100); assert.equal(body.fallback_probability, 0);
  assert.match(host.text(), /服务端已确认：总开关开启/);
  assert.match(host.text(), /与服务端已保存策略一致/);
  assert.equal(host.successes.length, 1);
  host.unmount();
});

test('保存策略同步双提交只写一次；畸形 / 不一致回执进入未知且保留草稿，读取后才解锁', async () => {
  for (const receipt of [null, {}, { ok: true }, policy({ enabled: true }), policy({ enabled: 1, updated_at: '' })]) {
    const pending = deferred(); let fresh = policy();
    const host = mount({ advertisingPolicy: async () => fresh, updateAdvertisingPolicy: () => pending.promise });
    await host.flush();
    host.change('advertising-policy-enabled', true);
    host.change('advertising-policy-ad_probability', '35');
    const oldSubmit = host.nodes(node => node.type === 'form')[0].props.onSubmit;
    const first = oldSubmit({ preventDefault() {} }); oldSubmit({ preventDefault() {} }); host.render();
    assert.equal(host.callCount('updateAdvertisingPolicy'), 1);
    assert.equal(host.nodes(node => node.type === 'fieldset')[0].props.disabled, true);
    pending.resolve(receipt); await first; await host.flush();
    assert.equal(host.successes.length, 0);
    assert.match(host.text(), /策略保存结果未确认/);
    assert.equal(host.nodes(node => node.props.id === 'advertising-policy-ad_probability')[0].props.value, '35');
    await oldSubmit({ preventDefault() {} });
    assert.equal(host.callCount('updateAdvertisingPolicy'), 1, '旧事件引用也不能绕过未知写入门禁');
    fresh = policy({ enabled: 1, ad_probability: 35 });
    await host.click(host.button('重新读取策略')); await host.flush();
    assert.match(host.text(), /服务端已确认：总开关开启/);
    assert.equal(host.successes.length, 0, 'GET 不能替代保存成功回执');
    host.unmount();
  }
});

test('策略 403 保留草稿且不报成功；网络结果未知必须先读，失败读保留草稿和上次快照', async () => {
  for (const error of [Object.assign(new Error('fixture denied'), { status: 403 }), new Error('connection lost')]) {
    let failingRead = false;
    const host = mount({ advertisingPolicy: async () => { if (failingRead) throw new Error('policy read offline'); return policy(); }, updateAdvertisingPolicy: async () => { throw error; } });
    await host.flush(); host.change('advertising-policy-enabled', true);
    await host.submit(); await host.flush();
    assert.equal(host.successes.length, 0);
    assert.match(host.text(), error.status ? /策略保存被拒绝/ : /策略保存结果未确认/);
    failingRead = true;
    await host.click(host.button('重新读取策略')); await host.flush();
    assert.match(host.text(), /上次确认：总开关关闭/);
    assert.equal(host.nodes(node => node.props.id === 'advertising-policy-enabled')[0].props.checked, true);
    assert.equal(host.button('保存策略').props.disabled, true);
    host.unmount();
  }
});

test('广告桌面 / 移动双入口共锁，忙时点击与刷新不能重复写入；启停双方向按记录确认', async () => {
  const pending = deferred(); let nextPending = pending;
  const host = mount({ advertisingAction: () => nextPending.promise });
  await host.flush();
  const desktop = adAction(host, 1, 'desktop'), mobileAction = adAction(host, 1, 'mobile');
  const first = desktop.props.onClick(); mobileAction.props.onClick(); host.render();
  assert.equal(host.callCount('advertisingAction'), 1);
  assert.equal(adAction(host, 1, 'desktop').props.disabled, true);
  assert.equal(adAction(host, 1, 'mobile').props.disabled, true);
  assert.equal(host.button('重新读取广告').props.disabled, true);
  assert.equal(adAction(host, 2, 'mobile').props.disabled, false, '不同记录不被全局写入锁阻塞');
  pending.resolve(ad(1, 'paused')); await first; await host.flush();
  assert.equal(host.calls.find(call => call.name === 'advertisingAction').args[1], 'disable');
  assert.equal(adAction(host, 1, 'mobile').props['aria-label'], '启用广告 #1');
  assert.match(host.text(), /广告 #1 已停用，服务端回执已确认/);
  nextPending = deferred(); const second = host.click(adAction(host, 1, 'mobile'));
  nextPending.resolve(ad(1, 'active')); await second; await host.flush();
  assert.equal(host.calls.filter(call => call.name === 'advertisingAction')[1].args[1], 'approve');
  assert.equal(adAction(host, 1, 'desktop').props['aria-label'], '停用广告 #1');
  host.unmount();
});

test('广告异常回执不把提交状态当成功；只读重试解锁，未知未来状态不自动变成草稿', async () => {
  for (const receipt of [null, {}, { ok: true }, { id: 1, status: 'paused' }, ad(77, 'paused'), ad(1, 'active'), ad(1, 'paused', { updated_at: null })]) {
    let fresh = overview();
    const host = mount({ advertising: async () => fresh, advertisingAction: async () => receipt });
    await host.flush();
    const staleClick = adAction(host, 1, 'desktop').props.onClick;
    await host.click(adAction(host, 1, 'mobile')); await host.flush();
    assert.match(host.text(), /广告 #1 停用结果未确认/);
    assert.doesNotMatch(host.text(), /广告 #1 已停用，服务端回执已确认/);
    assert.equal(adAction(host, 1, 'desktop').props.disabled, true);
    await staleClick();
    assert.equal(host.callCount('advertisingAction'), 1);
    fresh = overview({ items: [ad(1, 'paused')] });
    await host.click(host.button('重新读取广告')); await host.flush();
    assert.equal(adAction(host, 1, 'desktop').props.disabled, false);
    assert.equal(adAction(host, 1, 'desktop').props['aria-label'], '启用广告 #1');
    host.unmount();
  }
  const host = mount({ advertising: async () => overview({ items: [ad(1, 'future_review')] }) });
  await host.flush();
  assert.equal(adAction(host, 1, 'desktop').props.disabled, true);
  assert.match(host.text(), /未知状态：future_review/);
  host.unmount();
});

test('广告 401/403 明确失败，无成功反馈、不改记录；筛选选中态和搜索计数两端一致', async () => {
  for (const status of [401, 403]) {
    const host = mount({ advertisingAction: async () => { throw Object.assign(new Error('fixture denied'), { status }); } });
    await host.flush(); await host.click(adAction(host, 1, 'desktop')); await host.flush();
    assert.match(host.text(), /广告 #1 停用被拒绝/);
    assert.equal(adAction(host, 1, 'desktop').props['aria-label'], '停用广告 #1');
    assert.equal(host.successes.length, 0);
    host.unmount();
  }
  const host = mount(); await host.flush();
  const filter = host.nodes(node => node.type === 'button' && text(node).startsWith('草稿') && Object.hasOwn(node.props, 'aria-pressed'))[0];
  host.click(filter);
  assert.match(host.text(), /当前筛选：草稿 · 1 \/ 2 条/);
  assert.equal(adAction(host, 1, 'desktop'), undefined);
  assert.equal(host.nodes(node => node.type === 'button' && node.props['aria-pressed'] === true).length, 1);
  host.change('advertising-search', '不存在的商家');
  assert.match(host.text(), /没有符合当前筛选的广告/);
  host.click(host.button('清除筛选'));
  assert.ok(adAction(host, 1, 'desktop')); assert.ok(adAction(host, 1, 'mobile'));
  host.unmount();
});

test('非管理员 / 认证中不发广告请求，真实管理员可操作，切换身份后旧写入不反馈到新会话', async () => {
  for (const auth of [{ user: null, loading: false }, { user: { id: 3, role: 'user', is_super_admin: true }, loading: false }, { user: { id: 7, role: 'admin' }, loading: true }]) {
    const host = mount({}, auth); await host.flush();
    assert.equal(host.calls.length, 0); assert.equal(host.nodes(node => node.props['data-ad-action']).length, 0); host.unmount();
  }
  const pending = deferred();
  const host = mount({ updateAdvertisingPolicy: () => pending.promise }); await host.flush();
  host.change('advertising-policy-enabled', true); const save = host.submit();
  host.setAuth({ user: { id: 3, role: 'user' }, loading: false, accounts: [] });
  pending.resolve(policy({ enabled: 1 })); await save; await host.flush();
  assert.equal(host.successes.length, 0);
  assert.equal(host.nodes(node => node.type === 'form').length, 0);
  host.unmount();
});

function assertAdvertisingCSSScope(source) {
  const stylesheet = parseCSS(source);
  stylesheet.walkRules(rule => {
    selectorParser(selectors => {
      selectors.each(selector => {
        const first = selector.nodes.find(node => node.type !== 'comment');
        assert.ok(first?.type === 'class' && first.value === 'adux-page', `广告样式必须限定在 .adux-page：${rule.selector}`);
      });
      selectors.walkTags(node => assert.notEqual(node.value.toLowerCase(), 'body', '禁止 body 全局选择器'));
      selectors.walkPseudos(node => assert.notEqual(node.value.toLowerCase(), ':root', '禁止 :root 全局选择器'));
    }).processSync(rule.selector);
  });
  stylesheet.walkDecls(declaration => assert.doesNotMatch(declaration.value, /#[0-9a-f]{3,8}\b/i, '广告样式不得硬编码十六进制主题色'));
}

test('广告页局部响应式 / 无障碍约束：桌面表格移动卡片，按钮 44px、字段错误关联与主题变量', () => {
  assert.match(page, /scope="col"/);
  assert.match(page, /role="switch"/);
  assert.match(page, /aria-invalid=\{!!errors\[field\.key\]\}/);
  assert.match(page, /aria-describedby=/);
  assert.match(page, /data-view=\{view\}/);
  assert.match(css, /\.adux-page \.ac-mobile-only \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /\.adux-page \.ac-desktop-only \{ display: none; \}/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /var\(--ac-/);
  assertAdvertisingCSSScope(css);
  assert.doesNotThrow(() => assertAdvertisingCSSScope('/* body { color: #fff } :root {} */ .adux-page .ac-card-body { color: var(--ac-text); }'));
  for (const forbidden of ['body { margin: 0; }', ':root { --color: red; }', '.adux-page body { margin: 0; }', '.adux-page :root { color: red; }', '.adux-page, body { color: red; }', '@media (max-width: 767px) { body { margin: 0; } }', '.ac-card-body { padding: 0; }', '.adux-page { color: #fff; }']) {
    assert.throws(() => assertAdvertisingCSSScope(forbidden), undefined, forbidden);
  }
});

if (mobile) {
  test('移动聚合读取只请求一次，畸形统计/注册码各自失败、不影响合法广告与独立策略', async () => {
    const host = mount({ advertising: async () => overview({ impressions: null, codes: null }) });
    await host.flush();
    assert.equal(host.callCount('advertising'), 1);
    assert.match(host.text(), /广告统计读取失败/);
    assert.match(host.text(), /商家注册码读取失败/);
    assert.equal(adAction(host, 1, 'mobile').props.disabled, false);
    assert.ok(host.nodes(node => node.type === 'form').length);
    assert.equal(host.button('生成 1 个注册码').props.disabled, true);
    host.unmount();
  });

  test('注册码真实字段：null 未使用 / 无到期、已用和带时区过期，掩码不是明码；创建一次只计一条', async () => {
    const pending = deferred();
    const host = mount({ advertising: async () => overview({ codes: [registrationCode(1), registrationCode(2, { consumed_at: '2026-11-12 09:00:00' }), registrationCode(3, { expires_at: '2020-01-01T00:00:00Z' })] }), generateAdvertisingCodes: () => pending.promise });
    await host.flush();
    assert.match(host.text(), /未使用且未过期 1 条/); assert.match(host.text(), /已过期/); assert.match(host.text(), /已使用/);
    assert.match(host.text(), /不支持批量生成或完整码回读/);
    const oldClick = host.button('生成 1 个注册码').props.onClick;
    const first = oldClick(); oldClick(); host.render();
    assert.equal(host.callCount('generateAdvertisingCodes'), 1);
    assert.equal(host.calls.find(call => call.name === 'generateAdvertisingCodes').args[0], 1);
    assert.equal(host.button('生成中…').props.disabled, true);
    pending.resolve({ success: true, masked_code: 'abc***xy' }); await first; await host.flush();
    assert.match(host.text(), /服务端确认已创建 1 个注册码/);
    assert.match(host.text(), /不是可供激活的完整码/);
    assert.doesNotMatch(page, /codeCount|setCodeCount|已生成 \$\{codeCount\}/);
    host.unmount();
  });

  test('注册码畸形创建回执与网络失败保留未知结果，旧点击不自动补发，明确 403 也不报成功', async () => {
    for (const result of [null, {}, { items: [] }, { success: true }, { success: true, masked_code: 'not-a-masked-code' }, new Error('connection lost'), Object.assign(new Error('denied'), { status: 403 })]) {
      const host = mount({ generateAdvertisingCodes: async () => { if (result instanceof Error) throw result; return result; } });
      await host.flush(); const oldClick = host.button('生成 1 个注册码').props.onClick;
      await host.click(host.button('生成 1 个注册码')); await host.flush();
      assert.doesNotMatch(host.text(), /服务端确认已创建 1 个注册码/);
      if (result?.status === 403) assert.match(host.text(), /注册码生成被拒绝/);
      else { assert.match(host.text(), /注册码创建结果未确认/); await oldClick(); assert.equal(host.callCount('generateAdvertisingCodes'), 1); }
      host.unmount();
    }
  });
}
