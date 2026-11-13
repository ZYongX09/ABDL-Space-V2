import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const page = name => fileURLToPath(new URL(`../src/pages/admin/${name}.jsx`, import.meta.url));
let renderPromise;
function renderer() {
  if (!renderPromise) renderPromise = (async () => {
    // 仅替换页面路由/全站 API 依赖；实际安全 JSX、共享 UI、权限模型与图表均参与 SSR。
    const plugins = [{ name: 'safety-ui-boundaries', setup(builder) {
      builder.onResolve({ filter: /^\.\/layout(?:\.jsx)?$/ }, args => args.importer.endsWith('security.jsx') || args.importer.endsWith('babyVerifications.jsx') ? { path: 'layout', namespace: 'safety-ui-stub' } : null);
      builder.onResolve({ filter: /^\.\.\/\.\.\/api(?:\.js)?$/ }, args => args.importer.endsWith('security.jsx') ? { path: 'api', namespace: 'safety-ui-stub' } : null);
      builder.onResolve({ filter: /^\.\.\/\.\.\/contexts\/AuthContext(?:\.jsx)?$/ }, args => args.importer.endsWith('security.jsx') || args.importer.endsWith('babyVerifications.jsx') ? { path: 'auth', namespace: 'safety-ui-stub' } : null);
      builder.onLoad({ filter: /.*/, namespace: 'safety-ui-stub' }, args => ({ contents: args.path === 'api' ? 'export const adminAPI = { getTestVerificationCode(){ throw new Error("UNEXPECTED_REQUEST"); } };' : args.path === 'auth' ? 'export function useAuth(){ return { user: { id: 7, role: "admin" } }; }' : 'export default function Layout({children}){ return children; }', loader: 'jsx' }));
    } }];
    const result = await build({ stdin: { contents: `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { SecurityOverview, SecurityLogs, TestVerificationCodeCard, TestVerificationCodeView, TestVerificationCodeError } from ${JSON.stringify(page('security'))}; import AdminBabyVerifications, { BabyVerificationPagination, BabyVerificationQueue, BabyVerificationDetail, BabyVerificationPhoto, BabyVerificationAudit, BabyVerificationConfig } from ${JSON.stringify(page('babyVerifications'))}; import { ConfirmProvider } from ${JSON.stringify(page('ui'))}; import { ToastProvider } from ${JSON.stringify(fileURLToPath(new URL('../src/contexts/ToastContext.jsx', import.meta.url)))}; const views = {SecurityOverview, SecurityLogs, TestVerificationCodeCard, TestVerificationCodeView, TestVerificationCodeError, AdminBabyVerifications, BabyVerificationPagination, BabyVerificationQueue, BabyVerificationDetail, BabyVerificationPhoto, BabyVerificationAudit, BabyVerificationConfig}; module.exports = (name, props) => renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(ConfirmProvider, null, React.createElement(views[name], props)))); module.exports.photoSessionKey = props => BabyVerificationPhoto(props).key;`, resolveDir: root }, bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', plugins, loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' } });
    const module = { exports: {} };
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
    return module.exports;
  })();
  return renderPromise;
}
const noop = () => {};
const controls = { onRetry: noop, onStatus: noop, onOpen: noop, onDraftType: noop, onApply: noop, onReset: noop, onPage: noop, onChange: noop, onReason: noop, onSave: noop, onEmail: noop, onPurpose: noop, onQuery: noop, onClear: noop, onChanged: noop, onClose: noop };
const stats = { dayCount: 143, weekCount: 897, trend: [{ hour: 1794528000, cnt: 22 }, { hour: 1794531600, cnt: 61 }, { hour: 1794535200, cnt: 60 }], typeStats: [{ event_type: 'rate_limit_exceeded', cnt: 124 }, { event_type: 'human_check_failed', cnt: 19 }], scoreDistribution: [{ level: 'critical', cnt: 14 }, { level: 'warning', cnt: 38 }, { level: 'normal', cnt: 91 }] };
const logs = [{ id: 8217, created_at: '2026-11-13 02:14:09', event_type: 'rate_limit_exceeded', score: 12, ip: '2001:db8:42::17', session_id: 'fixture-session-a7c24', user_agent: 'SyntheticBrowser/137.0 Mobile review-fixture', details: JSON.stringify({ endpoint: '/api/posts/:id', limit: 50, window_seconds: 60, note: '合成限流记录，不含私人正文' }) }, { id: 8216, created_at: 1794535200, event_type: 'human_check_failed', score: 37, ip: null, session_id: null, user_agent: null, details: { reason: 'challenge_expired', provider: 'synthetic' } }];
const applicant = { id: 'BV_20261113_0042', userId: '3042', username: 'review_fixture_42', displayName: '审核样例用户', status: 'reviewing', submittedAt: '2026-11-13T02:03:00Z', updatedAt: '2026-11-13T02:05:00Z', claimedBy: '7', claimExpiresAt: '2026-11-13T03:05:00Z', reason: '资料等待人工核对', photoCount: 2, profile: { QQ: '100004242', 成年声明: '已确认', 声明版本: 'adult-2026-11' }, photos: [{ id: 'EVIDENCE_42_A', label: '认证拍摄照片', status: 'ready' }, { id: 'EVIDENCE_42_B', label: '辅助照片', status: 'processing' }], certificate: null };
const certificate = { id: 'CERT_20261113_42', token: 'synthetic_certificate_token_42', generation: 3, status: 'active', issuedAt: '2026-11-13T03:10:00Z', revokedAt: null, revokeReason: '', revokedBy: '' };
const config = { version: 9, enabled: true, declarationVersion: 'adult-2026-11', freeMonthlyLimit: 3, sponsorMonthlyLimit: 12, captureTtlSeconds: 900, uploadTtlSeconds: 300, maxEvidenceSize: 10485760 };
const mobileSection = html => html.slice(html.indexOf('ac-mobile-only'));
const button = (html, text) => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find(match => match[2].includes(text));

test('安全概览真实统计覆盖趋势、类型、风险分布与独立错误重试', async () => {
  const render = await renderer();
  const html = render('SecurityOverview', { stats, loading: false, error: '', ...controls });
  for (const text of ['24 小时安全事件', '143', '897', '24 小时事件趋势', '事件类型分布', '风险等级分布', 'rate_limit_exceeded', 'human_check_failed', '高危', '警告', '刷新安全统计']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /暂无事件|暂无等级数据/);
  const failed = render('SecurityOverview', { stats: null, loading: false, error: '统计服务暂不可用', ...controls });
  assert.match(failed, /role="alert"/); assert.match(failed, /重试安全统计/); assert.doesNotMatch(failed, /暂无事件|暂无等级数据/);
  const pending = render('SecurityOverview', { stats, loading: true, error: '', ...controls });
  assert.match(pending, /读取安全统计/); assert.match(pending, /保留上次成功读取/);
});

test('日志显式应用筛选与移动卡片保留所有字段，敏感字段仅位于关闭的逐条披露', async () => {
  const render = await renderer();
  const props = { logs, total: 87, page: 2, type: 'rate_limit_exceeded', draftType: 'human_check_failed', loading: false, error: '', ...controls };
  const html = render('SecurityLogs', props), mobile = mobileSection(html);
  for (const text of ['应用筛选', '重置筛选', '已应用：rate_limit_exceeded', '输入已修改，尚未应用', '第 2 页', '8217', '2001:db8:42::17', 'fixture-session-a7c24', 'SyntheticBrowser/137.0', 'window_seconds', '合成限流记录', 'Session', 'User Agent', '详情']) assert.ok(html.includes(text), text);
  for (const text of ['8217', 'rate_limit_exceeded', '2001:db8:42::17', 'fixture-session-a7c24', 'SyntheticBrowser/137.0', 'window_seconds']) assert.ok(mobile.includes(text), text);
  assert.match(html, /<details class="uo-disclosure security-log-details"><summary>/);
  assert.doesNotMatch(html, /<details[^>]*\bopen=|title="fixture-session|一键复制<|navigator\.clipboard/);
  const failed = render('SecurityLogs', { ...props, logs: [], error: '日志服务暂不可用' });
  assert.match(failed, /重试日志/); assert.doesNotMatch(failed, /没有匹配的日志/);
  assert.match(render('SecurityLogs', { ...props, logs: [], loading: true }), /读取安全日志/);
  assert.match(render('SecurityLogs', { ...props, logs: [] }), /没有匹配的日志/);
});

test('随机测试码工具保留精确邮箱、用途、到期、错误冷却和显式清空，不自动查询复制', async () => {
  const render = await renderer();
  const props = { email: 'reviewer.42@test.top', purpose: 'reset', state: { pending: false, error: null }, result: { email: 'reviewer.42@test.top', type: 'reset', code: '684291', expires_at: 1893456000 }, ...controls };
  const html = render('TestVerificationCodeView', props);
  for (const text of ['展开精确查询', '@test.top', 'register', 'reset', 'bind', '684291', '到期时间', '清空验证码显示', '不提供一键复制']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<details[^>]*\bopen=|>取消查询</);
  const pending = render('TestVerificationCodeView', { ...props, result: null, state: { pending: true, error: null } });
  assert.match(button(pending, '查询中')[1], /disabled=""/); assert.match(pending, />取消查询</);
  const failed = render('TestVerificationCodeView', { ...props, result: null, state: { error: { message: '查询过于频繁', retryAfter: 30 } } });
  assert.match(failed, /role="alert"/); assert.match(failed, /30 秒后重试/); assert.doesNotMatch(failed, /684291/);
  const restricted = render('TestVerificationCodeCard', { user: { id: 7, role: 'admin', is_super_admin: false }, request() { throw new Error('禁止请求'); } });
  assert.doesNotMatch(restricted, /精确测试邮箱|随机验证码|查询测试验证码/);
});

test('认证队列真实混合状态与移动全字段；队列绝无照片请求和预加载', async () => {
  const render = await renderer();
  const items = [applicant, { ...applicant, id: 'BV_20261113_0043', userId: '3043', status: 'submitted', claimedBy: '', claimExpiresAt: null, photoCount: 3 }, { ...applicant, id: 'BV_20261112_0021', status: 'approved', certificate }];
  const html = render('BabyVerificationQueue', { data: { items, total: 62, pending: 17 }, status: '', loading: false, error: '', openingId: '', ...controls });
  for (const text of ['17', '62', '审核中', '待审核', '已通过', '详情审核', '认领到期', 'BV_20261113_0042', '审核样例用户']) assert.ok(html.includes(text), text);
  const mobile = mobileSection(html);
  for (const text of ['用户名', 'review_fixture_42', '用户 ID', '3042', '申请编号', 'BV_20261113_0042', '提交时间', '照片数量', '认领管理员', '认领到期']) assert.ok(mobile.includes(text), text);
  assert.doesNotMatch(html, /<img|<link[^>]*preload|view-authorize|signed_url/);
  const failed = render('BabyVerificationQueue', { data: { items: [], total: 0, pending: 0 }, status: 'submitted', error: '审核队列不可用', ...controls });
  assert.match(failed, /重试审核队列/); assert.doesNotMatch(failed, /没有匹配的认证申请/);
});

test('认证页面首屏即显示读取态，未知队列总数不能降级为共 0 条', async () => {
  const render = await renderer();
  const initial = render('AdminBabyVerifications', {});
  assert.match(initial, /读取认证审核队列/); assert.match(initial, /正在首次读取队列，数量尚未确认/);
  assert.match(initial, /class="bv-stat">—</); assert.match(button(initial, '读取队列中')[1], /disabled=""/);
  assert.doesNotMatch(initial, /共\s*0\s*条|没有匹配的认证申请|class="ac-page-info"/);
  for (const state of [
    { data: null, loading: true, error: '' },
    { data: null, loading: false, error: '服务端暂不可用' },
    { data: null, loading: false, error: '' },
  ]) {
    const queue = render('BabyVerificationQueue', { status: 'submitted', ...state, ...controls });
    const footer = render('BabyVerificationPagination', { page: 1, limit: 20, onChange: noop, ...state });
    assert.doesNotMatch(queue + footer, /共\s*0\s*条|没有匹配的认证申请|class="ac-page-info"/);
    if (state.error) { assert.match(queue, /role="alert"/); assert.match(queue, /重试审核队列/); assert.match(queue, /队列读取失败，数量尚未确认/); }
  }
});

test('认证分页只展示成功读取的精确总数，首读及失败不伪装空队列', async () => {
  const render = await renderer();
  for (const limit of [20, 50]) {
    for (const resource of [
      { data: null, loading: true, error: '' },
      { data: null, loading: false, error: '读取失败' },
      { data: { items: [], total: 0 }, loading: true, error: '' },
      { data: { items: [], total: 0 }, loading: false, error: '读取失败' },
    ]) {
      const html = render('BabyVerificationPagination', { ...resource, page: 1, limit, onChange: noop });
      assert.doesNotMatch(html, /共\s*0\s*条|class="ac-page-info"|aria-label="分页"/);
    }
    const empty = render('BabyVerificationPagination', { data: { items: [], total: 0 }, loading: false, error: '', page: 1, limit, onChange: noop });
    assert.match(empty, /共 0 条/);
    const populated = render('BabyVerificationPagination', { data: { items: [applicant], total: 62 }, loading: false, error: '', page: 2, limit, onChange: noop });
    assert.match(populated, /共 62 条/); assert.match(populated, /第 2\//);
  }
  const emptyQueue = render('BabyVerificationQueue', { data: { items: [], total: 0, pending: 0 }, status: 'submitted', loading: false, error: '', ...controls });
  assert.match(emptyQueue, /没有匹配的认证申请/); assert.match(emptyQueue, /共 0 条/);
  const previous = render('BabyVerificationQueue', { data: { items: [], total: 0, pending: 0 }, status: 'submitted', loading: false, error: '重新读取失败', ...controls });
  assert.match(previous, /上次成功读取：共 0 条/); assert.doesNotMatch(previous, /没有匹配的认证申请/);
});

test('认证详情使用既有权限模型：本人认领决策、他人只读、证书代次与吊销信息完整', async () => {
  const render = await renderer();
  const owned = render('BabyVerificationDetail', { item: applicant, adminId: 7, ...controls });
  for (const text of ['role="dialog"', '关闭认证审核详情', '审核与认领', '显式展开已认证个人资料信息', '100004242', 'adult-2026-11', '认领到期', '释放审核', '通过', '驳回', '先校验理由，再确认操作', '照片仍在校验', '点击后请求短期照片地址']) assert.ok(owned.includes(text), text);
  assert.doesNotMatch(owned, /<img|<details[^>]*\bopen=/);
  const readonly = render('BabyVerificationDetail', { item: applicant, adminId: 8, ...controls });
  assert.match(readonly, /管理员 7 认领，当前为只读/); assert.equal(button(readonly, '通过'), undefined); assert.match(readonly, /请先认领审核/);
  const unclaimed = render('BabyVerificationDetail', { item: { ...applicant, status: 'submitted', claimedBy: '' }, adminId: 7, ...controls });
  assert.ok(button(unclaimed, '认领审核')); assert.equal(button(unclaimed, '驳回'), undefined);
  const approved = render('BabyVerificationDetail', { item: { ...applicant, status: 'approved', certificate }, adminId: 7, ...controls });
  for (const text of ['Generation（证书代次）', 'CERT_20261113_42', '吊销', '补发证书', '打开证书验真页']) assert.ok(approved.includes(text), text);
  const revoked = render('BabyVerificationDetail', { item: { ...applicant, status: 'approved', certificate: { ...certificate, status: 'revoked', revokedAt: '2026-11-13T04:10:00Z', revokeReason: '服务端确认资料不符', revokedByName: '复核管理员' } }, adminId: 7, ...controls });
  for (const text of ['已吊销', '吊销时间', '服务端确认资料不符', '复核管理员']) assert.ok(revoked.includes(text), text);
  assert.equal(button(revoked, '补发证书'), undefined);
});

test('认证照片初始不发起资源读取；保留单张显式授权、失效清理和原权限判断', async () => {
  const render = await renderer();
  for (const canView of [true, false]) {
    const html = render('BabyVerificationPhoto', { verificationId: applicant.id, photo: applicant.photos[0], canView, isClaimedByCurrentAdmin: canView });
    assert.doesNotMatch(html, /<img|src=|<link/);
    assert.ok(html.includes(canView ? '点击后请求短期照片地址' : '请先认领审核'));
  }
  const code = source('../src/pages/admin/babyVerifications.jsx');
  assert.match(code, /canView=\{canViewPhoto\(item, photo, adminId\)\}/);
  assert.match(code, /request\.signal\.aborted \|\| abort\.current !== request/);
  assert.match(code, /setTimeout\(clear/);
  assert.match(code, /key=\{JSON\.stringify\(\[verificationId, photo\.id, canView, accessScope\]\)\}/);
  assert.match(code, /accessScope=\{JSON\.stringify\(\[adminId, item\.claimedBy, item\.claimExpiresAt\]\)\}/);
  assert.match(code, /useEffect\(\(\) => dispose, \[dispose\]\)/);
  assert.doesNotMatch(code, /useEffect\(\(\) => \{ clear\(\)/);
  assert.match(code, /useDialogLifecycle\(true, close, panelRef, \{ initialFocus: 'first' \}\)/);
  assert.doesNotMatch(code, /addEventListener\(['"]keydown|\.focus\(|navigator\.clipboard|localStorage|sessionStorage|preload|prefetch/);
  assert.ok(code.indexOf('checked = needsReason ? validateReason(reason)') < code.indexOf('await confirm({ title:'));
  assert.ok(code.indexOf('stableOperationId = operations.current.acquire') < code.indexOf('await babyVerificationAPI.admin[name]'));
});

test('照片访问作用域变化同步替换有状态实例，表单外观变化保留同一实例', async () => {
  const render = await renderer();
  const props = { verificationId: applicant.id, photo: applicant.photos[0], canView: true, accessScope: JSON.stringify([7, applicant.claimedBy, applicant.claimExpiresAt]), isClaimedByCurrentAdmin: true };
  const key = render.photoSessionKey(props);
  assert.equal(render.photoSessionKey({ ...props, photo: { ...props.photo, label: '更新后的展示标签' } }), key);
  for (const changed of [
    { verificationId: 'BV_20261113_0043' },
    { photo: { ...props.photo, id: 'EVIDENCE_43_A' } },
    { canView: false },
    { accessScope: JSON.stringify([8, applicant.claimedBy, applicant.claimExpiresAt]) },
    { accessScope: JSON.stringify([7, '8', applicant.claimExpiresAt]) },
    { accessScope: JSON.stringify([7, applicant.claimedBy, '2026-11-13T04:05:00Z']) },
  ]) assert.notEqual(render.photoSessionKey({ ...props, ...changed }), key);
  const code = source('../src/pages/admin/babyVerifications.jsx');
  const cleanup = code.slice(code.indexOf('const dispose = useCallback'), code.indexOf('const clear = useCallback'));
  assert.match(cleanup, /abort\.current\?\.abort\(\)/); assert.match(cleanup, /clearTimeout\(expiry\.current\)/); assert.doesNotMatch(cleanup, /setState/);
  assert.match(code, /const generations = reads\.current; load\(\); return \(\) => \{ generations\[tab\] \+= 1;/);
});

test('审计结构化逐条展开保留未知原始字段；配置全部字段、版本与保存错误状态完整', async () => {
  const render = await renderer();
  const audit = { total: 124, items: [{ audit_id: 'AUDIT_1042', application_id: applicant.id, admin_id: 7, action: 'approve', created_at: '2026-11-13 03:10:00', reason: '照片与声明相符', operation_id: 'synthetic-operation-42', generation: 3, detail: { certificate_id: certificate.id, expected_version: 9 } }] };
  const html = render('BabyVerificationAudit', { audit, loading: false, error: '', ...controls });
  for (const text of ['认证审计', 'AUDIT_1042', 'approve', 'BV_20261113_0042', '照片与声明相符', '展开本条完整审计字段', 'synthetic-operation-42', 'CERT_20261113_42', 'expected_version']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /<pre|<details[^>]*\bopen=/);
  assert.doesNotMatch(render('BabyVerificationAudit', { audit: { items: [], total: 0 }, error: '审计读取失败', ...controls }), /没有认证审计记录/);
  const configured = render('BabyVerificationConfig', { config, reason: '调整认证额度以便人工复核', dirty: true, busy: false, loading: false, error: '', saveError: '配置版本已变化，请核对', ...controls });
  for (const text of ['启用认证', '声明版本', '普通用户月额度', '赞助用户月额度', '拍摄会话有效期（秒）', '上传授权有效期（秒）', '单张照片上限（字节）', '10485760', 'adult-2026-11', '服务端版本', '未保存修改', '修改理由（必填）', '配置版本已变化，请核对', '撤回未保存修改']) assert.ok(configured.includes(text), text);
  assert.match(button(configured, '重读配置')[1], /disabled=""/);
  const busy = render('BabyVerificationConfig', { config, reason: '保留修改', dirty: true, busy: true, ...controls });
  assert.match(busy, /<fieldset disabled=""/); assert.match(button(busy, '保存中')[1], /disabled=""/);
  const code = source('../src/pages/admin/babyVerifications.jsx');
  assert.match(code, /configRequest\(config, checked\)/); assert.match(code, /operations\.current\.reject\(item.id, name, checked, failure\)/);
  assert.match(code, /section === 'config' && !dirtyRef.current && !configWriting.current/);
  assert.doesNotMatch(source('../src/pages/admin/baby-verifications.css'), /(?:^|})\s*\.ac-table\s/);
});
