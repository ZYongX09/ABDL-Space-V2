import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { initialObservationState } from './controller.js';
import { fixtureIP, fixtureRequest, fixtureTarget, fixtureUser } from './fixture.js';
import { TIMEZONE } from './model.js';
const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
async function renderExports({ tripwire = false } = {}) {
  const componentsPath = fileURLToPath(new URL('./components.jsx', import.meta.url));
  // SSR 不执行 effect：在敏感会话函数入口放测试专用绊线，防止“未执行 fetch”掩盖误挂载。
  const plugins = tripwire ? [{ name: 'observation-session-mount-tripwire', setup(builder) {
    builder.onLoad({ filter: /userObservation\/components\.jsx$/ }, () => {
      const signature = "function ObservationSession({ user, token, initialUserId = '', apiFactory = createUserObservationAPI, clipboard }) {";
      const original = source('./components.jsx'); assert.ok(original.includes(signature));
      return { contents: original.replace(signature, `${signature}\n  throw new globalThis.Error('SENSITIVE_SESSION_MOUNTED');`), loader: 'jsx', resolveDir: fileURLToPath(new URL('.', import.meta.url)) };
    });
  } }] : [];
  const result = await build({ stdin: { contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import UserObservation, { ObservationTables, TargetPanel, LegacyPanel, UserObservationLink } from ${JSON.stringify(componentsPath)}; import { ConfirmProvider } from ${JSON.stringify(fileURLToPath(new URL('../pages/admin/ui.jsx', import.meta.url)))}; module.exports = (name, props) => renderToStaticMarkup(React.createElement(ConfirmProvider, null, React.createElement({UserObservation, ObservationTables, TargetPanel, LegacyPanel, UserObservationLink}[name], props)));`, resolveDir: fileURLToPath(new URL('.', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', plugins, loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_API_BASE': '""' } });
  const module = { exports: {} }; new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports); return module.exports;
}

test('非超管不挂载会发请求的敏感会话；普通目标链接排除管理员/ID1/本人', async () => {
  const render = await renderExports({ tripwire: true });
  let apiCreations = 0;
  const apiFactory = () => { apiCreations += 1; throw new Error('不能创建敏感API'); };
  for (const user of [null, { id: 3, role: 'user' }, { id: 2, role: 'admin' }, { id: 1, role: 'admin', is_super_admin: false }]) {
    const html = render('UserObservation', { user, initialUserId: 3, apiFactory });
    assert.match(html, /仅超级管理员/); assert.doesNotMatch(html, /当前请求页|复制所选日|观察总策略|普通用户 ID/);
  }
  assert.equal(apiCreations, 0);
  const actor = { id: 1, role: 'admin', is_super_admin: true };
  // 正向校准绊线，确保测试确实拦在 controller/API 初始化之前，而不是 SSR 偶然不跑 effect。
  assert.throws(() => render('UserObservation', { user: actor, apiFactory }), /SENSITIVE_SESSION_MOUNTED/);
  const providerOnly = '<div class="ac-admin-theme"></div>';
  assert.match(render('UserObservationLink', { actor, target: fixtureUser(3), onOpen() {} }), /定向观察/);
  for (const target of [{ id: 1, role: 'user' }, { id: 2, role: 'admin' }, { id: 3 }]) {
    const html = render('UserObservationLink', { actor, target, onOpen() {} });
    assert.equal(html, providerOnly); assert.doesNotMatch(html, /<button|定向观察/);
  }
});

test('真实 JSX 呈现独立开关、默认到期、停止与删历史区分、请求注释非用户行为', async () => {
  const render = await renderExports(), state = initialObservationState();
  const target = fixtureTarget();
  Object.assign(state, { selected: { user: fixtureUser(3), target, status: 'policy_disabled', policy_enabled: false }, targetForm: { observe_ip: true, observe_requests: false, expires: '2026-11-19T10:00', reason: '', revision: target.revision }, requests: { items: [fixtureRequest()], next_cursor: 'next', timezone: TIMEZONE }, ips: { items: [fixtureIP()], next_cursor: null, timezone: TIMEZONE }, legacy: { tracking: true, rule_revision: '040d7dae279b28278ca86e7f9b0f8acf6fc40139682446898dc5bbfe6369c4db', bans: [{ ip: '192.0.2.17', reason: '独立来源', created_at: 1794440000, created_by: 1 }], truncated: false } });
  const targetHTML = render('TargetPanel', { state, controller: {} }); assert.match(targetHTML, /记录该用户 IP（独立）/); assert.match(targetHTML, /记录该用户请求日志（独立）/); assert.match(targetHTML, /停止将来观察（不删历史）/); assert.match(targetHTML, /最长 30 天/);
  const tables = render('ObservationTables', { state, controller: {} });
  for (const text of ['业务注释（非行为结论）', '当前请求页', '所选日有界导出', '5000', '1 MiB', '事件 ID', '耗时 ms', '仅清除', '不证明', '全部留存 IP', '来源']) assert.ok(tables.includes(text), text);
  const legacy = render('LegacyPanel', { state, controller: {} }); assert.match(legacy, /仅停止旧追踪（保留封禁）/); assert.match(legacy, /仅解封明确所选 0 个来源封禁/); assert.match(legacy, /不等同于历史 IP/);
});

test('复制失败可选只读textarea、无自动clipboard、无外部导出/localStorage敏感副本', async () => {
  const render = await renderExports(), state = initialObservationState();
  state.selected = { user: fixtureUser(3), target: fixtureTarget() };
  state.output = { copied: false, text: '{"safe":"已审计"}', count: 1, truncated: false };
  const html = render('ObservationTables', { state, controller: {} }); assert.match(html, /<textarea[^>]*readonly=""[^>]*>/); assert.match(html, /可手动选择复制/);
  const components = source('./components.jsx'), controller = source('./controller.js'), api = source('./api.js');
  for (const text of ['auth-session-changing', 'admin-session-rejected', 'pagehide', 'storage', 'adminSessionKey', 'useConfirm', '敏感信息警告', '取消导出']) assert.ok(components.includes(text), text);
  assert.doesNotMatch(components + controller + api, /localStorage\.(?:getItem|setItem)|sessionStorage|createObjectURL|window\.open|execCommand|sendBeacon/);
  assert.doesNotMatch(api + controller + components, /trackAndBanUserIp|banUser\(/);
  assert.match(controller, /if \(!confirmed\) return false/); assert.match(controller, /authorizeExport/); assert.match(controller, /await clipboard\(output\.text\)/);
});

test('安全中心保留简单tabs，用户详情内部navigate预填ID；旧危险能力仍是独立确认', () => {
  const security = source('../pages/admin/security.jsx'), users = source('../pages/admin/users.jsx');
  assert.match(security, /安全概览/); assert.match(security, /role="tablist"/); assert.match(security, /UserObservation user=\{user\} token=\{token\} initialUserId=\{initialUserId\}/);
  assert.match(users, /navigate\(`\/admin\/security\?tab=user-observation&user_id=/); assert.match(users, /UserObservationLink actor=\{admin\} target=\{info\?\.user\}/);
  assert.match(users, /const doTrackAndBan/); assert.match(users, /await confirm\(\{ title: '追踪并封禁 IP'/);
  assert.match(users, /isSuperAdmin\(admin\) && <section[^>]*>.*旧 IP 追踪/s);
  assert.doesNotMatch(source('./styles.css'), /#[0-9a-f]{3,8}\b|rgba?\(/i); assert.match(source('./styles.css'), /var\(--ac-/);
});

test('本地fixture限定loopback、独立Vite配置，不可能转发生产API；fixture从不注入生产模块', () => {
  const server = source('./fixture-server.js');
  for (const text of ["'127.0.0.1'", 'configFile: false', 'envFile: false', '不转发真实 API', 'Content-Security-Policy', "connect-src 'self'", '绝不转发生产']) assert.ok(server.includes(text), text);
  assert.doesNotMatch(server, /https:\/\/(?:api\.|abdl-space)|proxy:/);
  for (const file of ['./components.jsx', './controller.js', './api.js', './model.js']) assert.doesNotMatch(source(file), /from ['"].*fixture/);
});
