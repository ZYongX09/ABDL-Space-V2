import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import postcss from 'postcss';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveAdminTheme, watchAdminTheme } from '../src/pages/admin/theme.js';
import { adminAccessState, adminRoleLabel, adminSessionKey, isSuperAdmin, userActionPolicy } from '../src/pages/admin/access.js';
import { createAdminFixtureServer } from './app-clients-fixture-server.js';
import { runInNewContext } from 'node:vm';
import { MemoryRouter } from 'react-router-dom';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const adminCSS = postcss.parse(source('../src/pages/admin/admin.css'));
const globalCSS = postcss.parse(source('../src/styles/global.css'));

function declarations(root, selector) {
  const values = {};
  root.walkRules(rule => {
    if (rule.selector !== selector) return;
    rule.walkDecls(decl => { values[decl.prop] = decl.value; });
  });
  return values;
}

// 模拟 CSS 自定义属性在定义元素上先解析、再继承的语义，检查别名循环和缺失。
function resolve(values) {
  const result = {};
  const resolving = new Set();
  const get = name => {
    if (name in result) return result[name];
    assert.ok(name in values, `未定义的主题变量 ${name}`);
    assert.ok(!resolving.has(name), `主题变量循环 ${name}`);
    resolving.add(name);
    const value = values[name].replace(/var\((--[\w-]+)\)/g, (_, key) => get(key));
    resolving.delete(name);
    result[name] = value;
    return value;
  };
  Object.keys(values).filter(key => key.startsWith('--')).forEach(get);
  return result;
}

function adminValues(frontTheme, adminTheme) {
  return resolve({
    ...declarations(globalCSS, ':root'), ...declarations(globalCSS, `[data-theme="${frontTheme}"]`),
    ...declarations(adminCSS, ':root[data-admin-theme="light"],\n:root:not([data-admin-theme])'),
    ...(adminTheme === 'dark' ? declarations(adminCSS, ':root[data-admin-theme="dark"]') : {}),
    ...declarations(adminCSS, ':root'), ...declarations(adminCSS, '.admin-console,\n.ac-admin-theme'),
  });
}

for (const front of ['light', 'dark', 'colorful']) for (const theme of ['light', 'dark']) {
  test(`前台 ${front} / 后台 ${theme} 独立表面，确认层、赞助页无变量循环`, () => {
    const admin = adminValues(front, theme);
    assert.equal(admin['--ac-surface'], theme === 'dark' ? '#252830' : '#FFFFFF');
    assert.equal(admin['--ac-canvas'], theme === 'dark' ? '#1A1D23' : '#F5F8FC');
    assert.equal(admin['--app-admin-scheme'], theme);
    assert.doesNotMatch(admin['--hero-bg'], /gradient|rgba/);
    const sponsor = resolve({ ...admin, ...declarations(postcss.parse(source('../src/sponsors/sponsors.css')), '.sponsor-admin') });
    assert.equal(sponsor['--sa-surface'], admin['--ac-surface']);
    assert.equal(sponsor['--sa-primary'], admin['--ac-action']);
    assert.equal(sponsor['--sa-text'], admin['--ac-text']);
  });
}

test('多彩仅后台跟随系统并实时监听，明确及已解析时间深浅不变', () => {
  for (const dark of [false, true]) {
    assert.equal(resolveAdminTheme('light', dark), 'light');
    assert.equal(resolveAdminTheme('dark', dark), 'dark');
    assert.equal(resolveAdminTheme('colorful', dark), dark ? 'dark' : 'light');
  }
  const root = { dataset: { theme: 'colorful' } };
  let listener;
  const media = { matches: false, addEventListener(event, fn) { assert.equal(event, 'change'); listener = fn; }, removeEventListener(event, fn) { if (listener === fn) listener = null; } };
  const cleanup = watchAdminTheme('colorful', root, media);
  assert.equal(root.dataset.adminTheme, 'light');
  media.matches = true; listener();
  assert.equal(root.dataset.adminTheme, 'dark');
  assert.equal(root.dataset.theme, 'colorful');
  cleanup(); assert.equal(listener, null); assert.equal(root.dataset.adminTheme, undefined);
  watchAdminTheme('light', root, media)(); assert.equal(listener, null);
  assert.doesNotMatch(source('../src/pages/admin/theme.js'), /localStorage|setTheme/);
  assert.match(source('../src/pages/admin/admin.css'), /:root\[data-admin-theme\] body\.admin-mode/);
  assert.match(source('../src/pages/admin/admin.css'), /background-image: none/);
});

test('浅色与深色的文字、语义状态和实心按钮保持至少 4.5:1 对比', () => {
  const mix = (a, b, weight) => a.map((value, index) => value * weight + b[index] * (1 - weight));
  const parse = value => {
    if (/^#[\da-f]{6}$/i.test(value)) return [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255);
    const mixed = /^color-mix\(in srgb, (.+) (\d+)%, (.+)\)$/.exec(value);
    if (mixed) return mix(parse(mixed[1]), parse(mixed[3]), Number(mixed[2]) / 100);
    const rgba = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
    assert.ok(rgba, `未知颜色表达式 ${value}`);
    return [Number(rgba[1]) / 255, Number(rgba[2]) / 255, Number(rgba[3]) / 255, Number(rgba[4])];
  };
  const contrast = (a, b) => {
    const luminance = color => color.reduce((sum, value, index) => sum + [0.2126, 0.7152, 0.0722][index] * (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4), 0);
    const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
    return (high + 0.05) / (low + 0.05);
  };
  for (const theme of ['light', 'dark']) {
    const admin = adminValues('colorful', theme);
    const surface = parse(admin['--ac-surface']);
    for (const tone of ['action', 'success', 'danger', 'warning', 'violet', 'pink']) {
      const text = parse(admin[`--ac-${tone}`]);
      const soft = parse(admin[`--ac-${tone}-soft`]);
      const background = soft.length === 4 ? mix(soft.slice(0, 3), surface, soft[3]) : soft;
      assert.ok(contrast(text, background) >= 4.5, `${theme} ${tone} 状态文字对比不足`);
    }
    for (const tone of ['action', 'danger']) {
      assert.ok(contrast(parse(admin[`--ac-${tone}`]), parse(admin['--ac-on-action'])) >= 4.5, `${theme} ${tone} 按钮文字对比不足`);
    }
    assert.ok(contrast(parse(admin['--ac-text-secondary']), surface) >= 4.5);
  }
});

test('App 管理只保留页内布局，不再以路由覆盖共享主题', () => {
  assert.doesNotMatch(source('../src/pages/admin/appClients.css'), /:root|:has\(|--ac-[\w-]+\s*:/);
  assert.match(source('../src/pages/admin/ui.jsx'), /className="ac-admin-theme"/);
  const adminDir = new URL('../src/pages/admin/', import.meta.url);
  for (const file of readdirSync(adminDir).filter(file => file.endsWith('.jsx') && !['layout.jsx', 'ui.jsx', 'charts.jsx', 'util.jsx', 'gate.jsx'].includes(file))) {
    assert.match(source(`../src/pages/admin/${file}`), /AdminLayout/, `${file} 未使用管理端共享容器`);
  }
});

test('共享控件与赞助控件不再硬编码浅色表面/文本/边框', () => {
  for (const path of ['../src/pages/admin/admin.css', '../src/sponsors/sponsors.css']) {
    postcss.parse(source(path)).walkDecls(decl => {
      if (decl.prop.startsWith('--')) return;
      if (/^(color|background(-color)?|border(-.*)?|outline(-color)?|fill|stroke)$/.test(decl.prop)) {
        assert.doesNotMatch(decl.value, /#[\da-f]{3,8}\b|\b(?:white|black)\b/i, `${path}: ${decl.toString()}`);
      }
    });
  }
  for (const file of ['charts.jsx', 'overview.jsx', 'security.jsx']) {
    assert.doesNotMatch(source(`../src/pages/admin/${file}`), /#[\da-f]{3,8}\b/i);
  }
});

test('更新提醒位于废弃策略之前，纯文本预览与两项通用配置保护接入实际 adminAPI', async () => {
  const page = source('../src/pages/admin/appClients.jsx');
  assert.ok(page.indexOf('<ReminderEditor />') < page.indexOf('<PolicyEditor />'));
  assert.match(page, /App 更新提醒（不屏蔽真实帖子）/);
  assert.match(page, /App 版本废弃（只返回假帖）/);
  assert.match(page, /版本废弃优先/);
  assert.match(page, /id="app-reminder-enabled"[^>]+role="switch"/);
  assert.match(page, /id="app-reminder-include-unversioned"[^>]+checked=\{form.include_unversioned\}[^>]+aria-describedby="app-reminder-unversioned-note"/);
  assert.match(page, /包含未上报有效版本号的 App/);
  assert.match(page, /id="app-reminder-saved-summary"/);
  assert.match(page, /saved\?\.include_unversioned \? '是' : '否'/);
  assert.match(page, /版本号缺失或格式无效/);
  assert.match(page, /即使版本列表为空/);
  assert.doesNotMatch(page, /未上报版本不匹配/);
  assert.match(page, /saveGate\.current\.invalidate\(\); saveController\.current\?\.abort\(\)/);
  assert.match(page, /AppClientsContent key=\{`\$\{user.id\}:\$\{token\}`\}/);
  assert.match(page, /className="ac-app-note ac-app-plaintext">\{form.message.trim\(\) \|\| DEFAULT_APP_REMINDER_MESSAGE\}/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML|RichContent/);
  const settings = source('../src/pages/admin/settings.jsx');
  assert.match(settings, /isReservedAppClientSetting\(saveKey.key\)/);
  assert.match(settings, /isReservedAppClientSetting\(setting.key\) \? <Link/);
  const server = await createServer({ configFile: false, root: new URL('../', import.meta.url).pathname, server: { middlewareMode: true, hmr: { port: 25000 + process.pid % 10000 } }, appType: 'custom' });
  try {
    const { adminAPI } = await server.ssrLoadModule('/src/api.js');
    assert.equal(typeof adminAPI.appClientReminder, 'function');
    assert.equal(typeof adminAPI.saveAppClientReminder, 'function');
    for (const key of ['app_client_policy', 'app_client_reminder']) await assert.rejects(adminAPI.saveSetting(` ${key} `, '{}'), /保留配置/);
  } finally { await server.close(); }
});

test('QQ 身份组件实际渲染三态，未知不提供解绑、不声称无身份', async () => {
  const server = await createServer({ configFile: false, root: new URL('../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: { port: 25000 + process.pid % 10000 } }, appType: 'custom' });
  try {
    const { LoginMethods, UserIdentityDetails } = await server.ssrLoadModule('/src/pages/admin/users.jsx');
    const render = qq => renderToStaticMarkup(React.createElement(LoginMethods, { identity: { methods: { qq } }, onUnbind() {} }));
    for (const value of [true, 1, '1']) {
      const html = render({ bound: value, can_unbind: true });
      assert.match(html, /QQ 已绑定/);
      assert.match(html, /管理解绑/);
    }
    for (const value of [false, 0, '0']) {
      const html = render({ bound: value });
      assert.match(html, /QQ 未绑定/);
      assert.match(html, /该用户当前没有 QQ 第三方身份/);
      assert.doesNotMatch(html, /管理解绑/);
    }
    for (const qq of [undefined, null, {}, { bound: null }, { nickname: '旧资料' }]) {
      const html = render(qq);
      assert.match(html, /QQ 状态未知/);
      assert.doesNotMatch(html, /QQ 未绑定|该用户当前没有 QQ 第三方身份|管理解绑/);
    }
    assert.match(render({ bound: true, can_unbind: false }), /disabled=""/);
    const fallback = user => renderToStaticMarkup(React.createElement(UserIdentityDetails, {
      identity: null, identityError: '请求失败（404）', user, onUnbind() { throw new Error('降级展示不能解绑'); },
    }));
    for (const [value, label] of [[true, '已绑定'], [false, '未绑定'], [null, '状态未知'], [undefined, '状态未知']]) {
      // 无论旧列表是否为已绑定，都只使用最新普通详情值；false 不能被旧 true 覆盖。
      const html = fallback({ qq_bound: value, methods: { qq: { bound: true, can_unbind: true } } });
      assert.match(html, new RegExp(label));
      assert.match(html, /身份详情：请求失败（404）/);
      assert.match(html, /第三方身份资料暂不可用/);
      assert.doesNotMatch(html, /登录方式<|管理解绑|允许解绑|alt="QQ 头像"|最近身份审计|可用<|未设置/);
      if (value === false) assert.doesNotMatch(html, />已绑定</);
    }
    const dedicated = renderToStaticMarkup(React.createElement(UserIdentityDetails, {
      identity: { methods: { qq: { bound: false, can_unbind: false } }, audit: [] }, user: { qq_bound: true }, onUnbind() {},
    }));
    assert.match(dedicated, /QQ 未绑定/);
    assert.doesNotMatch(dedicated, /QQ 已绑定|管理解绑/);
  } finally {
    await server.close();
  }
});

const superUser = { id: 1, role: 'admin', is_super_admin: true };
const regularAdmin = { id: 2, role: 'admin', is_super_admin: false };
const ordinaryUser = { id: 3, role: 'user', is_super_admin: false };

test('super 严格 boolean 优先，缺失字段才兼容 ID1/admin，ID1 永远保护', () => {
  assert.equal(isSuperAdmin(superUser), true);
  assert.equal(isSuperAdmin({ id: '1', role: 'admin' }), true);
  for (const value of [false, null, undefined, 0, 1, 'true', 'false']) assert.equal(isSuperAdmin({ id: 1, role: 'admin', is_super_admin: value }), false);
  for (const user of [null, ordinaryUser, regularAdmin, { id: 2, role: 'admin', is_super_admin: true }, { id: 1, role: 'user', is_super_admin: true }]) assert.equal(isSuperAdmin(user), false);
  assert.equal(adminRoleLabel(superUser), '超级管理员');
  assert.equal(adminRoleLabel(regularAdmin), '管理员');
  assert.equal(adminRoleLabel(ordinaryUser), '普通用户');
  assert.equal(userActionPolicy(superUser, ordinaryUser).canChangeRole, true);
  assert.equal(userActionPolicy(superUser, regularAdmin).nextRole, 'user');
  assert.equal(userActionPolicy(regularAdmin, ordinaryUser).canChangeRole, false);
  for (const target of [superUser, { id: 1, role: 'user', is_super_admin: false }]) {
    assert.equal(userActionPolicy(superUser, target).canChangeRole, false);
    assert.equal(userActionPolicy(superUser, target).canGovern, false);
  }
  assert.equal(userActionPolicy(superUser, regularAdmin).canGovern, false);
  assert.match(userActionPolicy(superUser, regularAdmin).governanceReason, /先由超级管理员撤销/);
  assert.equal(userActionPolicy(regularAdmin, ordinaryUser).canGovern, true);
  assert.equal(userActionPolicy(ordinaryUser, ordinaryUser).canGovern, false);
  assert.notEqual(adminSessionKey({ id: 1, role: 'admin' }), adminSessionKey({ id: 1, role: 'admin', is_super_admin: null }));
  assert.notEqual(adminSessionKey(superUser, 'old'), adminSessionKey(superUser, 'new'));
});

test('route boundary 验证中/未登录/普通用户实际不渲染数据子页，未知路由安全', async () => {
  const server = await createServer({ configFile: false, root: new URL('../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: { port: 25000 + process.pid % 10000 } }, appType: 'custom' });
  try {
    const { AdminRouteBoundary, AdminUnknownRoute } = await server.ssrLoadModule('/src/pages/admin/gate.jsx');
    const { UserManagementActions, UserRoleBadge } = await server.ssrLoadModule('/src/pages/admin/users.jsx');
    let mounts = 0;
    function DataPage() { mounts++; return React.createElement('div', null, '机密数据'); }
    const render = element => renderToStaticMarkup(React.createElement(MemoryRouter, null, element));
    for (const [user, loading, label] of [[superUser, true, '正在验证'], [null, false, '请先登录'], [ordinaryUser, false, '仅管理员']]) {
      assert.notEqual(adminAccessState(user, loading), 'allowed');
      const html = render(React.createElement(AdminRouteBoundary, { user, loading }, React.createElement(DataPage)));
      assert.match(html, new RegExp(label)); assert.doesNotMatch(html, /机密数据/);
    }
    assert.equal(mounts, 0);
    assert.match(render(React.createElement(AdminRouteBoundary, { user: regularAdmin, loading: false }, React.createElement(DataPage))), /机密数据/);
    assert.equal(mounts, 1);
    assert.match(render(React.createElement(AdminUnknownRoute)), /管理页面不存在/);
    assert.match(render(React.createElement(UserRoleBadge, { user: superUser })), /超级管理员/);
    const actions = (actor, target) => render(React.createElement(UserManagementActions, { actor, target }));
    assert.match(actions(superUser, ordinaryUser), /提升为管理员/);
    assert.match(actions(superUser, regularAdmin), /撤销管理员/);
    assert.doesNotMatch(actions(regularAdmin, ordinaryUser), /提升为管理员|撤销管理员/);
    assert.doesNotMatch(actions(superUser, superUser), /aria-label="提升为管理员"|aria-label="撤销管理员"/);
    assert.equal((actions(superUser, regularAdmin).match(/disabled=""/g) || []).length, 3);
    const gate = source('../src/pages/admin/gate.jsx');
    assert.match(gate, /<ConfirmProvider key=\{sessionKey\}>/);
    assert.match(gate, /event.detail\?\.sessionKey !== currentSession.current/);
    assert.match(gate, /setBlockedSession\(null\); \}, \[sessionKey\]/);
    assert.match(source('../src/pages/admin/ui.jsx'), /pending.current\?\.\(false\); pending.current = null/);
  } finally { await server.close(); }
});

test('后台宿主不挂载前台推广层，必要全局toast使用独立后台表面', () => {
  const app = source('../src/App.jsx');
  assert.match(app, /const isAdminRoute = pathname === '\/admin' \|\| pathname.startsWith\('\/admin\/'\)/);
  for (const component of ['RedirectNotice', 'AdBlockNotice', 'CookieConsent', 'PushPrompt', 'ScrollProgress', 'BackToTop']) {
    assert.match(app, new RegExp(`!isAdminRoute && !pathname\\.startsWith\\('\\/c\\/'\\) && <${component} \\/>`), `${component} 必须仅前台挂载`);
  }
  assert.doesNotMatch(app, /<AppDownloadBanner\b/); // 主站未挂载；移动宿主须独立检查。
  assert.match(app, /className=\{isAdminRoute \? 'ac-admin-theme' : undefined\}><ToastPopup \/>/);
  const css = source('../src/pages/admin/admin.css');
  assert.match(css, /body\.admin-mode :is\(\.toast, \.toast-popup-item\)/);
  assert.match(css, /background: var\(--app-admin-surface\)/);
  assert.match(css, /\.toast button \{ color: var\(--app-admin-text\) !important/);
});

test('users StrictMode setup/cleanup/setup 恢复session，关闭详情不被旧refresh重新打开', () => {
  const page = source('../src/pages/admin/users.jsx');
  const match = /useEffect\(\(\) => \{\s*\/\/ StrictMode[^\n]*\n([\s\S]*?)\n  \}, \[sessionKey\]\);/.exec(page);
  assert.ok(match, '必须保留可验证的StrictMode会话生命周期');
  const state = { alive: { current: true }, session: { current: null }, admin: { id: 1 }, token: 'fixture-1', sessionKey: 'current', listRequest: { current: 0 }, detailRequest: { current: 0 } };
  const setup = () => runInNewContext(`(() => {${match[1]}})()`, state);
  const cleanup = setup(); cleanup();
  assert.equal(state.session.current, null); assert.equal(state.alive.current, false);
  setup();
  assert.equal(state.session.current.key, 'current'); assert.equal(state.alive.current, true);
  assert.equal(state.listRequest.current, 1); assert.equal(state.detailRequest.current, 1);
  assert.match(page, /detailRef.current\?\.userId !== userId/);
  assert.match(page, /if \(!ok \|\| !isCurrent\(\)\) return/);
  assert.match(page, /request !== detailRequest.current/);
  assert.match(page, /request === listRequest.current/);
});

test('Auth refresh 旧成功/失败不覆盖新会话，当前401清身份且保留storage契约', async () => {
  const text = source('../src/contexts/AuthContext.jsx');
  const body = /const refreshUser = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[\]\);/.exec(text)?.[1];
  assert.ok(body);
  let reply, user = 'unchanged', saved = [];
  const context = {
    USE_API: true, API_BASE: '', refreshRequest: { current: 0 }, currentSession: { current: 'A' },
    fetch: () => new Promise(resolve => { reply = resolve; }), setUser: value => { user = value; },
    setActiveAccountId() {}, getSavedAccounts: () => [], saveAccounts: value => { saved = value; }, setAccounts() {}, window: {},
  };
  const refresh = () => runInNewContext(`(async () => {${body}})()`, context);
  const old = refresh(); context.currentSession.current = 'B'; reply({ ok: true, json: async () => superUser }); await old;
  assert.equal(user, 'unchanged'); assert.equal(saved.length, 0);
  const deniedOld = refresh(); context.currentSession.current = 'C'; reply({ ok: false, status: 401 }); await deniedOld;
  assert.equal(user, 'unchanged');
  const current = refresh(); reply({ ok: true, json: async () => regularAdmin }); await current;
  assert.equal(user.id, 2); assert.equal(saved[0].role, 'admin');
  const denied = refresh(); reply({ ok: false, status: 401 }); await denied; assert.equal(user, null);
});

test('adminAPI 角色专项：PATCH精准body/token，旧POST保留，无降级、无错误伪成功', async () => {
  const server = await createServer({ configFile: false, root: new URL('../', import.meta.url).pathname, server: { middlewareMode: true, hmr: { port: 25000 + process.pid % 10000 } }, appType: 'custom' });
  const oldFetch = globalThis.fetch;
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const requests = [];
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => key === 'abdl_accounts' ? JSON.stringify([{ id: 1, token: 'fixture-1' }]) : '1' } });
    globalThis.fetch = async (url, options) => { requests.push({ url, ...options }); return new Response(JSON.stringify({ user: regularAdmin }), { status: 200 }); };
    const { adminAPI } = await server.ssrLoadModule('/src/api.js');
    await adminAPI.setUserRole('2', 'user');
    assert.equal(requests[0].url, '/api/admin/users/2/role'); assert.equal(requests[0].method, 'PATCH');
    assert.deepEqual(JSON.parse(requests[0].body), { role: 'user' }); assert.equal(requests[0].credentials, 'include');
    assert.equal(requests[0].headers.Authorization, 'Bearer fixture-1');
    await adminAPI.setUserRole('a/b', 'admin'); assert.match(requests[1].url, /a%2Fb\/role$/);
    await adminAPI.promoteUser(3); assert.equal(requests[2].url, '/api/admin/add'); assert.equal(requests[2].method, 'POST');
    assert.deepEqual(JSON.parse(requests[2].body), { user_ids: [3] });
    await assert.rejects(adminAPI.setUserRole(1, 'user'), /不能被降权/);
    for (const role of ['super', null, 1]) await assert.rejects(adminAPI.setUserRole(2, role), /角色必须/);
    assert.equal(requests.length, 3);
    globalThis.fetch = async () => new Response(JSON.stringify({ error: '仅超级管理员' }), { status: 403 });
    await assert.rejects(adminAPI.setUserRole(2, 'admin'), error => error.status === 403 && /仅超级管理员/.test(error.message));
    globalThis.fetch = async () => { throw new Error('断网'); };
    await assert.rejects(adminAPI.setUserRole(2, 'admin'), /断网/);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else delete globalThis.localStorage;
    await server.close();
  }
});

test('隔离fixture HTTP角色/列表/详情/overview契约，撤权即时生效且重置恢复', async () => {
  const fixture = await createAdminFixtureServer({ quiet: true });
  await new Promise(resolve => fixture.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.server.address().port}`;
  const request = async (path, method = 'GET', body, token) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json(), headers: res.headers };
  };
  try {
    const start = await fetch(base + '/__fixture/start');
    const landing = await start.text();
    assert.match(landing, /cookie_consent[\s\S]*accepted:false/);
    assert.match(landing, /registration.unregister\(\)/);
    const sw = await fetch(base + '/sw.js'); assert.match(await sw.text(), /self.registration.unregister\(\)/);
    assert.match(start.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.equal((await request('/api/auth/me')).data.is_super_admin, true);
    const users = (await request('/api/admin/users')).data.users;
    assert.equal(users.length, 4); assert.equal(users[1].is_super_admin, false);
    assert.equal((await request('/api/admin/users/1/detail')).data.user.is_super_admin, true);
    assert.equal((await request('/api/admin/stats/overview')).status, 200);
    await request('/__fixture/session?id=2');
    assert.equal((await request('/api/admin/users/3/role', 'PATCH', { role: 'admin' })).status, 403);
    assert.equal((await request('/api/admin/add', 'POST', { user_ids: [3] })).status, 403);
    await request('/__fixture/session?id=1');
    assert.equal((await request('/api/admin/users/1/role', 'PATCH', { role: 'user' })).status, 403);
    assert.equal((await request('/api/admin/users/2/role', 'PATCH', { role: 'owner' })).status, 400);
    assert.equal((await request('/api/admin/users/999/role', 'PATCH', { role: 'admin' })).status, 404);
    assert.equal((await request('/api/admin/users/2/role', 'PATCH', { role: 'user' })).data.user.role, 'user');
    assert.equal((await request('/api/auth/me', 'GET', null, 'fixture-2')).data.role, 'user');
    assert.equal((await request('/api/admin/users', 'GET', null, 'fixture-2')).status, 403);
    assert.equal((await request('/api/admin/users', 'GET', null, 'production-token')).status, 401);
    assert.equal((await request('/api/admin/add', 'POST', { user_ids: [2] })).status, 200);
    assert.equal((await request('/api/admin/users/2/detail')).data.user.role, 'admin');
    await request('/__fixture/session?mode=false'); assert.equal((await request('/api/auth/me')).data.is_super_admin, false);
    await request('/__fixture/session?mode=legacy'); assert.equal(Object.hasOwn((await request('/api/auth/me')).data, 'is_super_admin'), false);
    assert.equal((await request('/api/admin/users/2', 'DELETE')).status, 403);
    await request('/__fixture/session?reset=1&id=0'); assert.equal((await request('/api/auth/me')).status, 401);
    const unavailable = await fetch(base + '/api/not-defined'); assert.equal(unavailable.status, 404);
  } finally { await fixture.close(); }
});
