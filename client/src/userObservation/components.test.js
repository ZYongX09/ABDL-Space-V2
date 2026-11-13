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
  const result = await build({ stdin: { contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import UserObservation, { ObservationContent, ObservationTables, PolicyPanel, TargetPicker, TargetPanel, LegacyPanel, UserObservationLink } from ${JSON.stringify(componentsPath)}; import { ConfirmProvider } from ${JSON.stringify(fileURLToPath(new URL('../pages/admin/ui.jsx', import.meta.url)))}; module.exports = (name, props) => renderToStaticMarkup(React.createElement(ConfirmProvider, null, React.createElement({UserObservation, ObservationContent, ObservationTables, PolicyPanel, TargetPicker, TargetPanel, LegacyPanel, UserObservationLink}[name], props)));`, resolveDir: fileURLToPath(new URL('.', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', plugins, loader: { '.css': 'empty' }, define: { 'import.meta.env.VITE_API_BASE': '""' } });
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

function realisticState() {
  const state = initialObservationState(Date.parse('2026-11-13T02:00:00Z'));
  const target = fixtureTarget(3, Date.parse('2026-11-13T02:00:00Z'));
  const generation = { target_revision: target.revision, policy_revision: 'b3bbff67-4da3-4c01-bafd-64fe8c327835' };
  return { ...state, policy: { schema_available: true, policy: { enabled: false, retention_days: 30, per_user_daily_limit: 2000, global_daily_limit: 5000, revision: generation.policy_revision } }, policyForm: { enabled: false, retention_days: 30, per_user_daily_limit: 2000, global_daily_limit: 5000, revision: generation.policy_revision, reason: '保留的策略修改理由' }, targets: { items: [{ ...target, status: 'policy_disabled' }], next_cursor: null }, selected: { user: fixtureUser(3), target, status: 'policy_disabled', policy_enabled: false }, targetForm: { observe_ip: true, observe_requests: false, expires: '2026-11-20T10:00', reason: '保留的目标修改理由', revision: target.revision }, days: { items: [{ day: state.filters.day, accepted_count: 118, request_count: 118, ip_count: 62, first_seen_at: Date.parse('2026-11-13T02:00:00Z'), last_seen_at: Date.parse('2026-11-13T02:02:00Z'), limit_reached: true, coverage: 'limit_reached' }], next_cursor: 'opaque-day-cursor' }, ips: { items: [fixtureIP(2, state.filters.day)], generation, next_cursor: null }, requests: { items: [fixtureRequest(0, 3, state.filters.day), fixtureRequest(1, 3, state.filters.day)], generation, next_cursor: 'opaque-request-cursor' }, exportReason: '人工复核异常请求', actionReason: '按要求清理所选日新观察历史', legacyReason: '复核旧机制来源', legacy: { user_id: 3, tracking: true, rule_revision: '040d7dae279b28278ca86e7f9b0f8acf6fc40139682446898dc5bbfe6369c4db', bans: [{ ip: '192.0.2.17', reason: '共享来源需人工核对', created_at: 1794440000, created_by: 1 }], truncated: true } };
}

test('真实完整观察视图：目标优先、低频披露和记录页签保留表单与所有记录字段', async () => {
  const render = await renderExports();
  const state = realisticState();
  const html = render('ObservationContent', { state, controller: {}, id: '3', onIdChange() {} });
  assert.ok(html.indexOf('观察目标') < html.indexOf('已记录数据'));
  for (const text of ['低频管理', '目标配置', '保留的策略修改理由', '保留的目标修改理由', '当前选择：用户 ID 3', '已应用到已读取页', '达到限额，覆盖不完整', '记录页签切换不重读、不重置表单', '复制当前请求页', '所选日有界导出', '仅清除', '旧机制', '共享来源需人工核对', 'opaque-request-cursor']) {
    if (text === 'opaque-request-cursor') assert.doesNotMatch(html, /opaque-request-cursor/); else assert.ok(html.includes(text), text);
  }
  assert.equal((html.match(/role="tabpanel"/g) || []).length, 2);
  assert.match(html, /id="[^"]*-ips-panel"[^>]*hidden=""/);
  assert.match(html, /<details class="uo-disclosure"><summary>低频管理/);
  assert.doesNotMatch(html, /<details[^>]*\bopen=/);
  assert.doesNotMatch(html, />取消(?:目标读取|日期读取|请求记录读取| IP 读取|导出)</);
  const requests = render('ObservationTables', { state, controller: {} });
  const mobile = requests.slice(requests.indexOf('ac-mobile-only uo-record-list'), requests.indexOf('</article>') + 10);
  for (const text of ['端点', '业务注释（非行为结论）', 'HTTP 状态', '耗时 ms', '事件 ID', '元数据版本', '来源', 'fixture-event-3-0', 'community.post.create', '2026-11-12.1', '2001:db8::1']) assert.ok(mobile.includes(text), text);
  assert.match(requests, /首次出现（北京）/); assert.match(requests, /最近出现（北京）/);
});

test('日期与目标列表独立loading/error/retry；读取失败绝不渲染空结果', async () => {
  const render = await renderExports(), state = realisticState();
  state.days = null; state.targets = null;
  state.errors = { days: '日期读取不可用', targets: '目标列表读取不可用', requests: '请求列表读取不可用', ips: 'IP 读取不可用' };
  state.ips = { ...state.ips, items: [] }; state.requests = { ...state.requests, items: [] };
  let html = render('ObservationContent', { state, controller: {}, id: '3', onIdChange() {} });
  for (const text of Object.values(state.errors)) assert.ok(html.includes(text), text);
  assert.ok((html.match(/重试读取/g) || []).length >= 4);
  assert.doesNotMatch(html, /该条件下没有已记录请求|该范围没有已记录 IP|尚无已配置目标|服务端没有返回已记录日期/);
  state.errors = {}; state.pending = { days: true, targets: true, ips: true, requests: true };
  html = render('ObservationContent', { state, controller: {}, id: '3', onIdChange() {} });
  for (const text of ['读取已记录日期', '读取已配置目标', '读取请求记录', '读取 IP', '取消日期读取', '取消请求记录读取']) assert.ok(html.includes(text), text);
});

test('每个写入/导出pending都禁用其他变更、目标切换与范围更改，非忙时不显示取消', async () => {
  const render = await renderExports();
  const disabledButton = (html, label) => {
    const button = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(match => match[2].includes(label));
    assert.ok(button, label); assert.match(button[1], /disabled=""/, label);
  };
  for (const job of ['policyWrite', 'targetWrite', 'clearDay', 'legacyWrite', 'export']) {
    const state = realisticState(); state.pending[job] = true;
    disabledButton(render('TargetPanel', { state, controller: {} }), '停止将来观察（不删历史）');
    const tables = render('ObservationTables', { state, controller: {} });
    disabledButton(tables, '复制当前请求页'); disabledButton(tables, '复制所选日有界导出'); disabledButton(tables, job === 'clearDay' ? '清除中' : '仅清除');
    assert.match(tables, /type="date"[^>]*disabled=""/);
    disabledButton(render('LegacyPanel', { state, controller: {} }), '仅停止旧追踪');
    disabledButton(render('PolicyPanel', { state, controller: {} }), job === 'policyWrite' ? '保存中' : '确认保存总策略');
    disabledButton(render('TargetPicker', { state, controller: {}, value: '3', onChange() {} }), '读取目标（不启用）');
    assert.equal(tables.includes('>取消导出<'), job === 'export');
  }
  const components = source('./components.jsx');
  assert.ok(components.indexOf('validate(); setError') < components.indexOf('await confirm(options)'));
  for (const text of ['reason(state.exportReason)', 'reason(state.actionReason)', 'reason(state.legacyReason)', 'policyInput(form)', 'targetInput({']) assert.ok(components.includes(text), text);
  assert.match(components, /hidden=\{recordTab !== 'requests'\}/); assert.match(components, /hidden=\{recordTab !== 'ips'\}/);
  assert.doesNotMatch(components, /key=\{(?:recordTab|format)|recordTab === 'requests' \?/);
});

test('本地fixture限定loopback、独立Vite配置，不可能转发生产API；fixture从不注入生产模块', () => {
  const server = source('./fixture-server.js');
  for (const text of ["'127.0.0.1'", 'configFile: false', 'envFile: false', '不转发真实 API', 'Content-Security-Policy', "connect-src 'self'", '绝不转发生产']) assert.ok(server.includes(text), text);
  assert.doesNotMatch(server, /https:\/\/(?:api\.|abdl-space)|proxy:/);
  for (const file of ['./components.jsx', './controller.js', './api.js', './model.js']) assert.doesNotMatch(source(file), /from ['"].*fixture/);
});
