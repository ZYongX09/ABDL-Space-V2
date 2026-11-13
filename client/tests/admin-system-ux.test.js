import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import * as appModel from '../src/appClients/model.js';
import * as aiModel from '../src/appAI/model.js';
import * as humanModel from '../src/appHumanCheck/model.js';
import * as upstreamModel from '../src/nbwUpstream/model.js';
import * as policyModel from '../src/translationPolicy/model.js';
import * as glossaryModel from '../src/translationGlossary/model.js';
import * as util from '../src/pages/admin/util.js';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const source = path => readFileSync(resolve(root, path), 'utf8');
const uuid = '00000000-0000-4000-8000-000000000001';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const failure = status => Object.assign(new Error('本地 fixture 请求失败'), { status });
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children || '');
const totals = Object.fromEntries(['observed_users', 'versioned_users', 'unversioned_users', 'active_1d', 'active_7d', 'active_30d'].map(key => [key, 0]));
const stats = () => ({ available: true, measurement_started_at: null, totals, versions: [] });
const access = posts => ({ web_mode: 'closed', web_message: '', web_login_prompt: '', app_mode: 'off', app_message: '', fake_posts: posts || [], app_download_open: true, revision: 'fixture-1' });
const beta = () => ({ enabled: false, allowedRoutes: ['/login'], message: '' });

// 直接编译、挂载生产 JSX，不创建 HTTP/Vite 服务，不导入生产 API，不发真实 AI/推送。
// 最小 hook/事件宿主不伪称浏览器测试；shared Modal/confirm 的焦点与布局由父统一验收。
function fixture(overrides = {}) {
  const calls = [];
  const api = {
    appClientReminder: async () => ({ ...appModel.DEFAULT_APP_REMINDER }),
    appClientPolicy: async () => ({ ...appModel.DEFAULT_APP_POLICY }),
    appClientNbwLocalOnly: async () => ({ ...appModel.DEFAULT_APP_NBW_LOCAL_ONLY }),
    nbwV2Policy: async () => ({ ...appModel.DEFAULT_NBW_V2_POLICY }),
    appAIProvider: async () => ({ ...aiModel.DEFAULT_APP_AI_PROVIDER, token_configured: true }),
    appHumanCheckPolicy: async () => ({ ...humanModel.DEFAULT_APP_HUMAN_POLICY }),
    nbwUpstreamHost: async () => ({ ...upstreamModel.DEFAULT_NBW_UPSTREAM }),
    translationPolicy: async () => ({ ...policyModel.DEFAULT_TRANSLATION_POLICY }),
    translationGlossary: async () => ({ entries: [], revision: uuid }),
    appClientStats: async () => stats(),
    appClientUsers: async () => ({ users: [], pagination: { page: 1, total: 0, totalPages: 0 } }),
    saveAppClientReminder: async payload => payload,
    saveAppClientPolicy: async payload => payload,
    saveAppClientNbwLocalOnly: async payload => payload,
    saveNbwV2Policy: async payload => payload,
    saveAppAIProvider: async payload => ({ base_url: payload.base_url, model_id: payload.model_id, token_configured: true, revision: 'fixture-2' }),
    testAppAIProvider: async payload => ({ success: true, protocol: aiModel.APP_AI_PROTOCOL, model_id: payload.model_id, latency_ms: 1, result_text: aiModel.APP_AI_TEST_RESULT_TEXT }),
    betaMode: async () => beta(), settings: async () => ({ settings: [] }), blockedEmails: async () => ({ emails: [] }),
    setBetaMode: async () => ({ ok: true }), saveSetting: async () => ({ ok: true }), addBlockedEmail: async () => ({ ok: true }), removeBlockedEmail: async () => ({ ok: true }), resetPassword: async () => ({ ok: true }),
    siteAccess: async () => access(), saveSiteAccess: async payload => ({ ...payload, revision: 'fixture-2' }),
    stats: async () => ({ web_count: 0, jpush_count: 0, today_sent: 0, today_failed: 0 }),
    platforms: async () => ({ vapidConfigured: true, jpushEnabled: true, jpushAppKey: 'NEVER_RENDER_FIXTURE_KEY' }),
    logs: async () => ({ logs: [] }), send: async () => ({ success: true, webSent: 1 }), test: async () => ({ success: true, sent: 1 }), jpushStats: async () => [],
    ...overrides,
  };
  for (const key of Object.keys(api)) { const invoke = api[key]; api[key] = (...args) => { calls.push({ key, args }); return invoke(...args); }; }
  return { api, calls, count: key => calls.filter(call => call.key === key).length, writes: () => calls.filter(call => /^(?:(?:save|set|add|remove|reset)[A-Z]|send$|test(?:$|[A-Z]))/.test(call.key)) };
}

function jsxHost(fx, { confirm = async () => true } = {}) {
  const frames = new Map(), nodes = new Map(), modules = new Map();
  const window = new EventTarget();
  let active, effects = [], changed = false, disposed = false, lateWrites = 0, hosts = [], tree, Component, props;
  const hooks = {
    ...React,
    useState(initial) { const frame = active, slot = frame.cursor++; if (!(slot in frame.slots)) frame.slots[slot] = typeof initial === 'function' ? initial() : initial; return [frame.slots[slot], next => { if (disposed) { lateWrites++; return; } const value = typeof next === 'function' ? next(frame.slots[slot]) : next; if (!Object.is(value, frame.slots[slot])) { frame.slots[slot] = value; changed = true; } }]; },
    useRef(initial) { const frame = active, slot = frame.cursor++; return frame.slots[slot] ||= { current: initial }; },
    useEffect(setup, deps) { const frame = active, slot = frame.cursor++, previous = frame.slots[slot]; if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps?.[index]))) { const state = { deps, cleanup: previous?.cleanup }; frame.slots[slot] = state; effects.push(() => { state.cleanup?.(); state.cleanup = setup(); }); } },
    useLayoutEffect(setup, deps) { return hooks.useEffect(setup, deps); },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useMemo(fn, deps) { const frame = active, slot = frame.cursor++, previous = frame.slots[slot]; if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) frame.slots[slot] = { deps, value: fn() }; return frame.slots[slot].value; },
    useId() { const frame = active; return `fixture-${frame.path.replace(/\W/g, '-')}-${frame.cursor++}`; },
  };
  const known = new Map(Object.entries({ 'appClients/model.js': appModel, 'appAI/model.js': aiModel, 'appHumanCheck/model.js': humanModel, 'nbwUpstream/model.js': upstreamModel, 'translationPolicy/model.js': policyModel, 'translationGlossary/model.js': glossaryModel, 'pages/admin/util.js': util }).map(([path, value]) => [resolve(root, path), value]));
  const load = path => {
    const file = resolve(root, path);
    if (known.has(file)) return known.get(file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} }; modules.set(file, module);
    const require = id => {
      if (id === 'react') return hooks;
      if (id === 'react/jsx-runtime') return jsxRuntime;
      if (id === 'react-router-dom') return { Link: ({ to, children, ...rest }) => React.createElement('a', { ...rest, href: to }, children) };
      let target = resolve(dirname(file), id);
      if (!extname(target)) target = ['.js', '.jsx'].map(extension => target + extension).find(candidate => known.has(candidate) || existsSync(candidate)) || target + '.jsx';
      if (target.endsWith('.css')) return {};
      if (target === resolve(root, 'api.jsx') || target === resolve(root, 'api.js')) return { adminAPI: fx.api, adminPushAPI: fx.api };
      if (target.endsWith('/AuthContext.jsx')) return { useAuth: () => ({ user: { id: 1, role: 'admin' }, accounts: [{ id: 1, token: 'fixture-only' }] }) };
      if (target.endsWith('/layout.jsx')) return { default: ({ children }) => children };
      if (target.endsWith('/NBWImage.jsx')) return { default: () => null };
      if (target.endsWith('/dialog.js')) return { registerAdminDialog: () => () => {} };
      if (target.endsWith('/ui.jsx')) return { ...load('pages/admin/ui.jsx'), useConfirm: () => confirm, Modal: ({ open, children, footer }) => open ? React.createElement('div', { role: 'dialog' }, children, footer) : null };
      assert.ok(known.has(target) || /\/(?:pages\/admin\/|translationPolicy\/|translationGlossary\/|pages\/NotificationAdmin\.jsx)/.test(target), `fixture 禁止导入未知模块 ${target}`);
      return load(target);
    };
    const compiled = transformSync(readFileSync(file, 'utf8'), { loader: 'jsx', jsx: 'automatic', format: 'cjs', sourcefile: file }).code;
    runInNewContext(compiled, { module, exports: module.exports, require, window, AbortController, URL, Event, console, setTimeout, clearTimeout }, { filename: file });
    return module.exports;
  };
  const walk = (element, path = 'root', disabled = false, hidden = false) => {
    if (Array.isArray(element)) return element.map((entry, index) => walk(entry, `${path}/${entry?.key ?? index}`, disabled, hidden));
    if (!element || typeof element !== 'object') return element;
    if (element.type === React.Fragment) return walk(element.props.children, `${path}/fragment`, disabled, hidden);
    if (typeof element.type === 'function') {
      const frame = frames.get(path) || { path, cursor: 0, slots: [] }; frames.set(path, frame); frame.cursor = 0;
      const previous = active; active = frame; const result = element.type(element.props); active = previous;
      return walk(result, `${path}/view`, disabled, hidden);
    }
    const p = element.props || {}, off = disabled || !!p.disabled, concealed = hidden || !!p.hidden;
    const node = nodes.get(path) || new EventTarget(); nodes.set(path, node);
    Object.assign(node, { element, disabled: off, hidden: concealed, value: p.value ?? node.value ?? p.defaultValue ?? '', checked: p.checked ?? false });
    hosts.push(node);
    if (element.ref && node.assignedRef !== element.ref) { if (typeof element.ref === 'function') element.ref(node); else element.ref.current = node; node.assignedRef = element.ref; }
    const children = walk(p.children, `${path}/children`, disabled || element.type === 'fieldset' && !!p.disabled, concealed);
    const rest = { ...p }; delete rest.children;
    return React.createElement(element.type, { ...rest, key: path }, children);
  };
  const render = () => { changed = false; hosts = []; tree = walk(React.createElement(Component, props)); const pending = effects; effects = []; pending.forEach(effect => effect()); };
  const flush = async () => { for (let index = 0; index < 30; index++) { await Promise.resolve(); if (changed) render(); } };
  const host = predicate => hosts.find(node => !node.hidden && predicate(node.element));
  const event = async (predicate, name, value) => {
    const node = host(predicate); assert.ok(node, `找不到 ${name} 控件`); assert.equal(node.disabled, false, '不能向禁用控件派发事件');
    if (value !== undefined) { if (node.element.props.type === 'checkbox') node.checked = value; else node.value = value; }
    if (name === 'toggle') node.open = value;
    const type = { click: 'onClick', change: 'onChange', submit: 'onSubmit', toggle: 'onToggle' }[name]; let result;
    const callback = e => { result = node.element.props[type]?.(e); };
    node.addEventListener(name, callback, { once: true }); const emitted = new Event(name, { cancelable: true }); node.dispatchEvent(emitted);
    if (name === 'click' && node.element.type === 'button' && node.element.props.type === 'submit' && !emitted.defaultPrevented) {
      const path = [...nodes.entries()].find(([, entry]) => entry === node)?.[0];
      const form = [...nodes.entries()].filter(([key, entry]) => entry.element?.type === 'form' && path?.startsWith(`${key}/`)).sort(([a], [b]) => b.length - a.length)[0]?.[1];
      result = form?.element.props.onSubmit?.(new Event('submit', { cancelable: true }));
    }
    await result; await flush(); return emitted;
  };
  return {
    load,
    async mount(path, exported, initial = {}) { Component = load(path)[exported]; props = initial; render(); await flush(); return this; },
    flush, window,
    html: () => renderToStaticMarkup(tree),
    hosts: () => hosts.filter(node => !node.hidden),
    find: predicate => host(predicate),
    click: label => event(element => element.type === 'button' && (text(element) === label || element.props['aria-label'] === label), 'click'),
    change: (id, value) => event(typeof id === 'function' ? id : element => element.props.id === id, 'change', value),
    toggle: (index, open) => event(element => element.type === 'details' && element.props.className === 'sa-access-post' && text(element.props.children?.[0]).startsWith(`第 ${index + 1} 条`), 'toggle', open),
    submit: () => event(element => element.type === 'form', 'submit'),
    dispose() { for (const frame of frames.values()) for (const slot of frame.slots) slot?.cleanup?.(); disposed = true; },
    lateWrites: () => lateWrites,
  };
}

test('10 App modules stay mounted across grouped navigation; independent drafts/save; no mount mutations', async () => {
  const fx = fixture(), ui = jsxHost(fx);
  try {
    await ui.mount('pages/admin/appClients.jsx', 'AppClientsContent');
    const { APP_MODULE_GROUPS } = ui.load('pages/admin/appClients.jsx');
    assert.equal(APP_MODULE_GROUPS.flatMap(group => group.modules).length, 10);
    for (const key of ['appClientReminder', 'appClientPolicy', 'appClientNbwLocalOnly', 'nbwV2Policy', 'nbwUpstreamHost', 'appAIProvider', 'appHumanCheckPolicy', 'translationPolicy', 'translationGlossary', 'appClientStats', 'appClientUsers']) assert.equal(fx.count(key), 1, key);
    assert.equal(fx.writes().length, 0);
    assert.match(ui.html(), /app-group-nbw[^>]*hidden=""/);
    await ui.change('app-reminder-message', '仅保存在内存的提醒');
    await ui.click('NBW 联动指定版本仅本站 / V2 模式 / 上游域名');
    await ui.change('app-nbw-local-only-versions', '31,34');
    await ui.click('更新与版本更新提醒 / 版本废弃');
    assert.equal(ui.find(element => element.props.id === 'app-reminder-message').value, '仅保存在内存的提醒');
    await ui.click('保存 App 更新提醒');
    assert.equal(fx.count('saveAppClientReminder'), 1); assert.equal(fx.writes().length, 1);
    await ui.click('NBW 联动指定版本仅本站 / V2 模式 / 上游域名');
    assert.equal(ui.find(element => element.props.id === 'app-nbw-local-only-versions').value, '31,34');
    assert.equal(fx.count('appClientReminder'), 1, '分组切换不重新加载或卸载');
  } finally { ui.dispose(); }
});

for (const [name, read, write, input, value] of [
  ['ReminderEditor', 'appClientReminder', 'saveAppClientReminder', 'app-reminder-message', '提醒草稿'],
  ['PolicyEditor', 'appClientPolicy', 'saveAppClientPolicy', 'app-update-message', '版本废弃草稿'],
  ['NbwLocalOnlyEditor', 'appClientNbwLocalOnly', 'saveAppClientNbwLocalOnly', 'app-nbw-local-only-versions', '31'],
  ['NbwV2PolicyEditor', 'nbwV2Policy', 'saveNbwV2Policy', element => element.props.name === 'nbw-v2-mode' && element.props.value === 'full', 'full'],
]) test(`${name}: real JSX loading/error/retry/draft/pending/failure/saved states`, async () => {
  const pending = deferred(); let rejectRead = true;
  const fx = fixture(), original = fx.api[read];
  fx.api[read] = (...args) => rejectRead ? Promise.reject(failure(503)) : original(...args);
  fx.api[write] = (...args) => { fx.calls.push({ key: write, args }); return pending.promise; };
  const ui = jsxHost(fx);
  try {
    await ui.mount('pages/admin/appClients.jsx', name); assert.match(ui.html(), /role="alert"/); assert.doesNotMatch(ui.html(), /正在读取/);
    rejectRead = false; await ui.click('重新加载'); await ui.change(input, value);
    assert.match(ui.html(), /未保存更改/); assert.equal(fx.writes().length, 0);
    const saving = ui.submit(); await ui.flush(); assert.match(ui.html(), /正在保存/);
    pending.reject(failure(500)); await saving;
    assert.match(ui.html(), /保存失败/); assert.match(ui.html(), /保留/); assert.equal(fx.count(write), 1);
    fx.api[write] = async payload => payload; await ui.submit(); assert.match(ui.html(), /已保存/);
  } finally { ui.dispose(); }
});

test('App observations distinguish error/unavailable/zero and preserve contextual filters', async () => {
  for (const [result, label] of [[Promise.reject(failure(503)), '统计读取失败'], [Promise.resolve({ available: false, versions: [] }), '不是 0'], [Promise.resolve(stats()), '尚无版本观测记录（0）']]) {
    // Rejections are installed at invocation to avoid unhandled rejection before mounting.
    result.catch(() => {});
    const fx = fixture({ appClientStats: () => result }), ui = jsxHost(fx);
    try { await ui.mount('pages/admin/appClients.jsx', 'AppClientsContent'); await ui.click('请求观测统计与用户明细'); assert.match(ui.html(), new RegExp(label.replace(/[()]/g, '\\$&'))); assert.equal(fx.writes().length, 0); }
    finally { ui.dispose(); }
  }
});

test('five model-backed App views show read errors, dirty/pending/locked states without secret values', async () => {
  const cases = [
    ['pages/admin/AppAIProviderCard.jsx', 'AppAIProviderView', aiModel.createProviderEditor, { model_id: 'fixture-draft' }],
    ['pages/admin/AppHumanCheckPolicyCard.jsx', 'AppHumanCheckPolicyView', humanModel.createHumanPolicyEditor, { mode: 'risk' }],
    ['pages/admin/AppNBWUpstreamCard.jsx', 'AppNBWUpstreamView', upstreamModel.createNBWUpstreamEditor, 'backup'],
    ['translationPolicy/Card.jsx', 'TranslationPolicyCardView', policyModel.createTranslationPolicyEditor, { daily_limit: '9' }],
    ['translationGlossary/Card.jsx', 'TranslationGlossaryCardView', glossaryModel.createTranslationGlossaryEditor, null],
  ];
  for (const [path, exported, createEditor, patch] of cases) {
    const fx = fixture(), editor = createEditor(fx.api, { uuid: () => uuid }); await editor.load();
    if (patch) editor.change(patch); else { editor.add(); editor.change(uuid, { chineseText: '术语', englishText: 'Term' }); }
    const state = editor.getState(); assert.ok(state.saved, path);
    for (const [extra, expected] of [[{}, /未保存|添加到草稿/], [{ saving: true }, /正在保存/], [{ needsReload: true, error: '本地冲突 409，草稿保留' }, /409/], [{ saved: null, loading: false, error: '本地读取失败 503' }, /503/]]) {
      const ui = jsxHost(fx);
      try { await ui.mount(path, exported, { state: { ...state, ...extra } }); assert.match(ui.html(), expected); assert.doesNotMatch(ui.html(), /NEVER_RENDER|api_token=/); if (extra.needsReload) assert.ok(ui.hosts().some(node => node.element.type === 'fieldset' && node.disabled)); }
      finally { ui.dispose(); }
    }
    assert.equal(fx.writes().length, 0); editor.dispose();
  }
});

test('AI test requires explicit confirmation, uses only local fixture and never saves', async () => {
  const fx = fixture(), ui = jsxHost(fx);
  try {
    await ui.mount('pages/admin/AppAIProviderCard.jsx', 'default'); assert.equal(fx.writes().length, 0);
    await ui.click('测试当前草稿（不保存）'); assert.equal(fx.count('testAppAIProvider'), 0); assert.match(ui.html(), /确认测试当前 AI 草稿/);
    await ui.click('取消测试，保留草稿'); assert.equal(fx.writes().length, 0);
    await ui.click('测试当前草稿（不保存）'); await ui.click('确认调用一次测试');
    assert.equal(fx.count('testAppAIProvider'), 1); assert.equal(fx.count('saveAppAIProvider'), 0); assert.match(ui.html(), /测试成功（未保存）/);
  } finally { ui.dispose(); }
});

test('settings four blocks load independently, keep unrelated drafts, mask sensitive values and protect reserved keys', async () => {
  const fx = fixture({ settings: async () => ({ settings: [{ key: 'site_name', value: 'fixture' }, { key: 'push_api_key', value: 'NEVER_RENDER_SETTING_SECRET' }, { key: 'app_client_policy', value: '{}' }] }) }), ui = jsxHost(fx);
  try {
    await ui.mount('pages/admin/settings.jsx', 'AdminSettingsContent'); assert.equal(fx.writes().length, 0); assert.doesNotMatch(ui.html(), /NEVER_RENDER_SETTING_SECRET/); assert.match(ui.html(), /敏感值已隐藏/);
    for (const id of ['settings-runtime', 'settings-values', 'settings-emails', 'settings-password']) assert.match(ui.html(), new RegExp(`id="${id}"`));
    await ui.change('beta-routes', '/login\n/draft');
    await ui.click('新增配置项'); await ui.change('setting-key', 'app_client_policy'); await ui.click('保存此配置项'); assert.equal(fx.count('saveSetting'), 0); assert.match(ui.html(), /保留配置/);
    await ui.change('setting-key', 'site_title'); await ui.change('setting-value', 'new fixture title'); await ui.click('保存此配置项'); assert.equal(fx.count('saveSetting'), 1);
    assert.equal(ui.find(element => element.props.id === 'beta-routes').value, '/login\n/draft', '保存配置不能重载运行草稿');
    await ui.change('blocked-email', 'fixture@example.invalid'); await ui.click('添加屏蔽'); assert.equal(fx.count('addBlockedEmail'), 1);
    assert.equal(ui.find(element => element.props.id === 'beta-routes').value, '/login\n/draft');
    assert.equal(fx.count('betaMode'), 1);
  } finally { ui.dispose(); }
  const broken = jsxHost(fixture({ betaMode: async () => { throw failure(503); }, blockedEmails: async () => { throw failure(403); } }));
  try { await broken.mount('pages/admin/settings.jsx', 'AdminSettingsContent'); assert.match(broken.html(), /503/); assert.match(broken.html(), /403/); assert.doesNotMatch(broken.html(), /正在读取本模块/); assert.match(broken.html(), /暂无配置项（0）/); }
  finally { broken.dispose(); }
});

test('site status 409 preserves all drafts, download boolean and 20-post limit; reload is explicit', async () => {
  let reads = 0;
  const posts = Array.from({ length: 20 }, (_, index) => ({ content: `fixture ${index + 1}`, author: '', created_at: null }));
  const fx = fixture({ siteAccess: async () => { reads++; return access(posts); }, saveSiteAccess: async () => { throw failure(409); } }), ui = jsxHost(fx, { confirm: async () => false });
  try {
    await ui.mount('pages/admin/siteAccess.jsx', 'SiteAccessContent'); assert.equal(fx.writes().length, 0); assert.match(ui.html(), /已达 20 条上限/);
    assert.equal(ui.find(element => element.type === 'button' && text(element) === '添加一条').disabled, true);
    await ui.change('access-web-message', '409 应保留的文案'); await ui.change(element => element.props.name === 'web-mode' && element.props.value === 'off', 'off');
    await ui.click('保存站点状态'); assert.equal(fx.count('saveSiteAccess'), 1); assert.equal(reads, 1, '409 不得自动重载'); assert.match(ui.html(), /409/);
    assert.equal(ui.find(element => element.props.id === 'access-web-message').value, '409 应保留的文案');
    assert.equal(fx.calls.find(call => call.key === 'saveSiteAccess').args[0].app_download_open, true);
    assert.equal(ui.find(element => element.type === 'button' && text(element) === '保存站点状态').disabled, true);
    await ui.click('重新加载'); assert.equal(reads, 1, '取消重新加载保留草稿');
  } finally { ui.dispose(); }
  const broken = jsxHost(fixture({ siteAccess: async () => { throw failure(503); } }));
  try { await broken.mount('pages/admin/siteAccess.jsx', 'SiteAccessContent'); assert.match(broken.html(), /重试读取站点状态/); assert.doesNotMatch(broken.html(), /正在加载站点状态/); }
  finally { broken.dispose(); }
});

test('push capability/read errors block sending; explicit local fixture send/test; delivery/log states', async () => {
  const fx = fixture(), ui = jsxHost(fx);
  try {
    await ui.mount('pages/NotificationAdmin.jsx', 'NotificationAdminContent'); assert.equal(fx.writes().length, 0); assert.equal(fx.count('jpushStats'), 0); assert.doesNotMatch(ui.html(), /NEVER_RENDER_FIXTURE_KEY/);
    await ui.change('push-title', 'fixture title'); await ui.change('push-body', 'fixture body'); await ui.change('push-target-ids', '3,NaN'); await ui.click('核对通知并准备发送'); assert.equal(fx.count('send'), 0); assert.match(ui.html(), /正整数/);
    await ui.change('push-target-ids', '3，3 4'); await ui.click('核对通知并准备发送'); assert.match(ui.html(), /指定 2 个用户/); assert.equal(fx.count('send'), 0);
    await ui.click('取消，保留草稿'); assert.equal(fx.writes().length, 0);
    await ui.click('核对通知并准备发送'); await ui.click('确认发送通知'); assert.equal(fx.count('send'), 1); assert.deepEqual(Array.from(fx.calls.find(call => call.key === 'send').args[0].targetIds), [3, 4]); assert.equal(ui.find(element => element.props.id === 'push-title').value, 'fixture title'); assert.match(ui.html(), /JPush 通道发送计数：未提供/);
    await ui.change('push-test-id', '8'); await ui.click('核对单用户测试'); assert.equal(fx.count('test'), 0); await ui.click('确认仅向此用户发送测试'); assert.equal(fx.count('test'), 1); assert.equal(fx.calls.find(call => call.key === 'test').args[0], 8);
    await ui.change('jpush-message-id', 'fixture_msg'); await ui.submit(); assert.equal(fx.count('jpushStats'), 1); assert.match(ui.html(), /查询成功，未返回送达数据/);
    assert.match(ui.html(), /暂无推送记录（0 条）/);
  } finally { ui.dispose(); }
  const brokenFx = fixture({ platforms: async () => { throw failure(503); }, logs: async () => { throw failure(500); } }), broken = jsxHost(brokenFx);
  try { await broken.mount('pages/NotificationAdmin.jsx', 'NotificationAdminContent'); assert.equal(broken.find(element => element.type === 'button' && text(element) === '核对通知并准备发送').disabled, true); assert.match(broken.html(), /503/); assert.doesNotMatch(broken.html(), /暂无推送记录/); assert.equal(brokenFx.writes().length, 0); }
  finally { broken.dispose(); }
});

test('abort/unmount and late auth responses cannot become current save successes', async () => {
  const pending = deferred(), fx = fixture({ saveSiteAccess: () => pending.promise }), ui = jsxHost(fx);
  try {
    await ui.mount('pages/admin/siteAccess.jsx', 'SiteAccessContent'); await ui.change('access-web-message', '未确认草稿');
    const saving = ui.click('保存站点状态'); await ui.flush(); ui.window.dispatchEvent(new Event('auth-session-changing')); await ui.flush(); pending.resolve(access()); await saving;
    assert.match(ui.html(), /管理员会话已变更/); assert.doesNotMatch(ui.html(), /已确认保存/);
  } finally { ui.dispose(); }
  const reading = deferred(); let signal;
  const blocked = jsxHost(fixture({ appClientReminder: options => { signal = options.signal; return reading.promise; } }));
  await blocked.mount('pages/admin/appClients.jsx', 'ReminderEditor'); blocked.dispose(); assert.equal(signal.aborted, true); reading.resolve(appModel.DEFAULT_APP_REMINDER); await blocked.flush(); assert.equal(blocked.lateWrites(), 0);
});

test('GUI repro: new site post stays expanded while typing and disclosure follows reorder/delete', async () => {
  const fx = fixture(), ui = jsxHost(fx);
  const details = index => ui.find(element => element.type === 'details' && element.props.className === 'sa-access-post' && text(element.props.children?.[0]).startsWith(`第 ${index + 1} 条`));
  try {
    await ui.mount('pages/admin/siteAccess.jsx', 'SiteAccessContent');
    await ui.click('添加一条'); assert.equal(details(0).element.props.open, true);
    await ui.change('access-post-content-0', '首'); assert.equal(details(0).element.props.open, true, '首字输入不得折叠');
    await ui.change('access-post-content-0', '首条正文'); await ui.toggle(0, false); assert.equal(details(0).element.props.open, false);
    await ui.change('access-post-author-0', '保持收起'); assert.equal(details(0).element.props.open, false);
    await ui.click('添加一条'); await ui.change('access-post-content-1', '第二条正文'); assert.equal(details(1).element.props.open, true);
    await ui.click('上移第 2 条'); assert.equal(ui.find(element => element.props.id === 'access-post-content-0').value, '第二条正文'); assert.equal(details(0).element.props.open, true); assert.equal(details(1).element.props.open, false);
    await ui.click('删除第 1 条'); assert.equal(ui.find(element => element.props.id === 'access-post-content-0').value, '首条正文'); assert.equal(details(0).element.props.open, false);
    assert.equal(fx.writes().length, 0);
  } finally { ui.dispose(); }
});

test('GUI repro: site save requires complete server document and changed revision; unknown keeps draft locked', async () => {
  const invalid = [null, undefined, {}, [], { revision: 'changed' }, { ...access(), web_message: '服务器不应被伪造为成功' }, { ...access(), revision: 'changed', fake_posts: null }, { ...access(), revision: 'changed', app_download_open: 'false' }];
  for (const receipt of invalid) {
    const fx = fixture({ saveSiteAccess: async () => receipt }), ui = jsxHost(fx, { confirm: async () => false });
    try {
      await ui.mount('pages/admin/siteAccess.jsx', 'SiteAccessContent'); await ui.change('access-web-message', '未知结果保留草稿'); await ui.click('保存站点状态');
      assert.equal(ui.find(element => element.props.id === 'access-web-message').value, '未知结果保留草稿');
      assert.doesNotMatch(ui.html(), /站点状态已确认保存/); assert.match(ui.html(), /保存未确认成功|保存结果未知/);
      assert.equal(ui.find(element => element.type === 'button' && text(element) === '保存站点状态').disabled, true);
      assert.equal(fx.count('saveSiteAccess'), 1); assert.equal(fx.count('siteAccess'), 1);
      await ui.click('重新加载'); assert.equal(fx.count('siteAccess'), 1, '取消读取仍保草稿，不重放写入');
    } finally { ui.dispose(); }
  }
  const fx = fixture({ saveSiteAccess: async payload => ({ ...payload, web_message: '服务器规范化文案', revision: '00000000-0000-4000-8000-000000000002' }) }), ui = jsxHost(fx);
  try {
    await ui.mount('pages/admin/siteAccess.jsx', 'SiteAccessContent'); await ui.change('access-web-message', '输入文案'); await ui.click('保存站点状态');
    assert.match(ui.html(), /站点状态已确认保存/); assert.equal(ui.find(element => element.props.id === 'access-web-message').value, '服务器规范化文案');
    assert.equal(ui.find(element => element.type === 'button' && text(element) === '保存站点状态').disabled, true);
  } finally { ui.dispose(); }
});

test('GUI repro: empty/null/204-equivalent push receipt is unknown; summary retained and no automatic resend', async () => {
  for (const kind of ['send', 'test']) for (const receipt of [null, undefined, {}, [], { success: false }, { success: 'true' }, { ok: true }, { webSent: 1 }]) {
    const fx = fixture({ [kind]: async () => receipt }), ui = jsxHost(fx);
    try {
      await ui.mount('pages/NotificationAdmin.jsx', 'NotificationAdminContent');
      await ui.change('push-title', '未知推送标题'); await ui.change('push-body', '未知推送内容'); await ui.change('push-target-ids', '3');
      if (kind === 'send') { await ui.click('核对通知并准备发送'); await ui.click('确认发送通知'); }
      else { await ui.change('push-test-id', '8'); await ui.click('核对单用户测试'); await ui.click('确认仅向此用户发送测试'); }
      assert.doesNotMatch(ui.html(), /发送请求已确认完成|测试请求已确认完成|请求已确认完成/);
      assert.match(ui.html(), /发送结果未知|发送未确认成功/); assert.match(ui.html(), /上次请求摘要/);
      assert.match(ui.html(), kind === 'send' ? /未知推送标题/ : /仅用户 8/);
      assert.equal(ui.find(element => element.props.id === 'push-title').value, '未知推送标题'); assert.equal(fx.count(kind), 1);
      await ui.click('刷新记录'); assert.equal(fx.count(kind), 1, '只读核对不能自动再次发送'); assert.match(ui.html(), /上次请求摘要/);
    } finally { ui.dispose(); }
  }
});

test('push success:true acknowledgement does not require optional channel counters', async () => {
  const fx = fixture({ send: async () => ({ success: true }), test: async () => ({ success: true }) }), ui = jsxHost(fx);
  try {
    await ui.mount('pages/NotificationAdmin.jsx', 'NotificationAdminContent'); await ui.change('push-title', '已确认草稿'); await ui.change('push-body', '固定fixture'); await ui.change('push-target-ids', '3');
    await ui.click('核对通知并准备发送'); await ui.click('确认发送通知'); assert.match(ui.html(), /发送请求已确认完成/); assert.match(ui.html(), /发送计数：未提供/);
    await ui.change('push-test-id', '8'); await ui.click('核对单用户测试'); await ui.click('确认仅向此用户发送测试'); assert.match(ui.html(), /测试请求已确认完成/);
  } finally { ui.dispose(); }
});

test('scoped display only; business explanations reachable; no new endpoints/storage/automatic mutations', () => {
  const app = source('pages/admin/appClients.jsx');
  assert.match(app, /hidden=\{active !== id\}/); assert.match(app, /aria-pressed=\{active === group.id\}/);
  for (const wording of ['版本废弃优先', '不会修改账号真实的 NBW 绑定', 'code31 的回复本地缺陷不能由后端修复', '列表为空且此项未勾选时，不命中任何 App']) assert.ok(app.includes(wording));
  for (const path of ['pages/admin/appClients.jsx', 'pages/admin/settings.jsx', 'pages/admin/siteAccess.jsx', 'pages/NotificationAdmin.jsx']) {
    const page = source(path); assert.doesNotMatch(page, /dangerouslySetInnerHTML|localStorage|sessionStorage|\bfetch\(/); assert.match(page, /auth-session-changing/);
  }
  for (const path of ['pages/admin/settings.css', 'pages/admin/siteAccess.css', 'pages/NotificationAdmin.css', 'pages/admin/appClients.css', 'translationGlossary/card.css']) {
    const css = source(path), parsed = postcss.parse(css);
    assert.doesNotMatch(css, /#[a-f0-9]{3,8}\b|rgba?\(/i); assert.match(css, /var\(--ac-/);
    const scopes = path.endsWith('settings.css') ? ['ac-system-settings', 'ac-setting-editor'] : path.endsWith('siteAccess.css') ? ['ac-site-access'] : path.endsWith('NotificationAdmin.css') ? ['ac-push-admin'] : path.endsWith('appClients.css') ? ['ac-app-clients'] : ['ac-translation-glossary-card'];
    parsed.walkRules(rule => selectorParser(selectors => selectors.each(selector => {
      assert.ok(selector.nodes.some(node => node.type === 'class' && scopes.includes(node.value)), `${path}: 未限定到所属视图 ${selector}`);
      selector.walkPseudos(node => assert.notEqual(node.value, ':root', `${path}: 不得修改全局根节点`));
      selector.walkTags(node => {
        if (node.value !== 'body') return;
        assert.equal(path, 'pages/NotificationAdmin.css');
        assert.ok(node.parent.nodes.some(sibling => sibling.type === 'class' && sibling.value === 'admin-mode'), `${path}: body 必须限定后台`);
      });
    })).processSync(rule.selector));
  }
  assert.doesNotMatch(source('pages/NotificationAdmin.jsx'), /jpushAppKey|console\./);
  assert.match(source('pages/NotificationAdmin.css'), /body\.admin-mode \.ac-push-admin/);
});
