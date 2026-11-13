import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createUserObservationAPI, ROOT } from './api.js';
import { createUserObservationController } from './controller.js';
import { createObservationFixture, fixtureIP, fixtureRequest, fixtureTarget, fixtureUser } from './fixture.js';
import { byteLength, MAX_BYTES, MAX_RECORDS, TIMEZONE } from './model.js';
const now = () => Date.parse('2026-11-12T18:30:00Z');
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function harness(options = {}) {
  const fixture = createObservationFixture({ now }), copied = [], rejected = [], requests = [];
  let session = { user: { id: 1, role: 'admin', is_super_admin: true }, token: 'fixture-only' };
  const api = createUserObservationAPI({ now, getSession: () => session, fetcher: async (path, request) => {
    requests.push({ path, request }); const url = new URL(path, 'http://127.0.0.1');
    const result = fixture.respond(url.pathname, { method: request.method, params: url.searchParams, body: request.body ? JSON.parse(request.body) : undefined, operationId: request.headers['Idempotency-Key'] });
    return new Response(JSON.stringify(result.data), { status: result.status });
  } });
  const controller = createUserObservationController({ api: { ...api, ...options.api }, getSession: () => session, now, createId: randomUUID, clipboard: async text => { copied.push(text); if (options.clipboardFails) throw new Error('permission denied'); }, onRejected: (...args) => rejected.push(args) });
  return { controller, fixture, copied, rejected, requests, switchSession(next) { session = next; } };
}

test('打开/选择/分页只GET；IP与请求开关独立，不自动启用旧追踪/封禁/写剪贴板', async () => {
  const h = harness(); await Promise.all([h.controller.loadPolicy(), h.controller.loadTargets()]); await h.controller.select(3);
  assert.ok(h.fixture.calls.length > 3); assert.ok(h.fixture.calls.every(call => call.method === 'GET'));
  assert.equal(h.fixture.audit.length, 0); assert.equal(h.copied.length, 0); assert.equal(h.controller.getState().legacy, null);
  assert.equal(h.controller.getState().selected.target.observe_ip, true); assert.equal(h.controller.getState().selected.target.observe_requests, false);
  h.controller.changeTarget({ observe_ip: false, observe_requests: true, reason: '只需要请求元信息' });
  assert.equal(await h.controller.saveTarget(), true);
  const target = h.controller.getState().selected.target; assert.equal(target.observe_ip, false); assert.equal(target.observe_requests, true);
  assert.ok(h.fixture.calls.every(call => !/track.*ban|\/ban/.test(call.path))); h.controller.dispose();
});

test('API到controller连续policy/target写后读保留UUID与legacy hash，清日后回传新CAS', async () => {
  const h = harness(), uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, hash = /^[0-9a-f]{64}$/;
  try {
    assert.equal(await h.controller.loadPolicy(), true);
    for (let index = 0; index < 2; index += 1) {
      const previous = h.controller.getState().policyForm.revision;
      h.controller.changePolicy({ reason: '明确复核策略版本' }); assert.equal(await h.controller.savePolicy(), true);
      assert.equal(h.fixture.calls.at(-1).body.revision, previous);
      const saved = h.controller.getState().policyForm.revision; assert.match(saved, uuid); assert.notEqual(saved, previous);
      assert.equal(await h.controller.loadPolicy(), true); assert.equal(h.controller.getState().policyForm.revision, saved);
    }
    assert.equal(await h.controller.select(3), true);
    for (let index = 0; index < 2; index += 1) {
      const previous = h.controller.getState().targetForm.revision;
      h.controller.changeTarget({ observe_ip: false, observe_requests: false, reason: '明确停止且复核目标版本' }); assert.equal(await h.controller.saveTarget(), true);
      assert.equal(h.fixture.calls.at(-1).body.revision, previous);
      const saved = h.controller.getState().targetForm.revision; assert.match(saved, uuid); assert.notEqual(saved, previous);
      assert.equal(await h.controller.select(3), true); assert.equal(h.controller.getState().targetForm.revision, saved);
    }
    const previous = h.controller.getState().targetForm.revision;
    h.controller.changeReason('actionReason', '仅清除选定日'); assert.equal(await h.controller.clearDay(), true);
    const cleared = h.controller.getState().targetForm.revision; assert.match(cleared, uuid); assert.notEqual(cleared, previous);
    assert.equal(h.fixture.calls.find(call => call.path.endsWith('/clear-day')).body.revision, previous);
    assert.equal(h.controller.getState().requests.generation.target_revision, cleared);
    assert.equal(await h.controller.loadLegacy(), true);
    const legacy = h.controller.getState().legacy.rule_revision; assert.match(legacy, hash);
    h.controller.changeReason('legacyReason', '明确停止旧机制'); assert.equal(await h.controller.legacyAction('stop'), true);
    assert.equal(h.fixture.calls.at(-1).body.revision, legacy);
    const stopped = h.controller.getState().legacy.rule_revision; assert.match(stopped, hash); assert.notEqual(stopped, legacy);
    assert.equal(await h.controller.loadLegacy(), true); assert.equal(h.controller.getState().legacy.rule_revision, stopped);
    h.controller.selectLegacyIP('192.0.2.17', true); h.controller.changeReason('legacyReason', '复核后解封明确来源');
    assert.equal(await h.controller.legacyAction('unban'), true); assert.equal(h.fixture.calls.at(-1).body.revision, stopped);
    const unbanned = h.controller.getState().legacy.rule_revision; assert.match(unbanned, hash); assert.notEqual(unbanned, stopped);
    assert.equal(await h.controller.loadLegacy(), true); assert.equal(h.controller.getState().legacy.rule_revision, unbanned);
  } finally { h.controller.dispose(); }
});

test('新配置来自明确 target:null，不把404/网络错误当未配置或空数据', async () => {
  const h = harness(); assert.equal(await h.controller.select(4), true);
  assert.equal(h.controller.getState().targetForm.revision, '0'); assert.equal(h.controller.getState().targetForm.observe_ip, false); assert.equal(h.controller.getState().targetForm.observe_requests, false);
  assert.equal(await h.controller.select(999), false); assert.equal(h.controller.getState().selected, null); assert.match(h.controller.getState().errors.target, /不存在/);
  h.fixture.setScenario('unavailable'); assert.equal(await h.controller.select(3), false); assert.equal(h.controller.getState().requests, null); assert.match(h.controller.getState().errors.target, /不可用/); h.controller.dispose();
});

test('409 保留配置/理由并阻止盲重试；重读更新CAS但保留草稿后可重确认', async () => {
  const h = harness(); await h.controller.loadPolicy(); await h.controller.select(3);
  h.controller.changeTarget({ observe_ip: false, observe_requests: true, reason: '不能丢失的人工理由' }); h.fixture.setScenario('conflict');
  assert.equal(await h.controller.saveTarget(), false); assert.equal(h.controller.getState().conflicts.targetWrite, true);
  assert.equal(h.controller.getState().targetForm.reason, '不能丢失的人工理由'); const count = h.fixture.calls.length;
  assert.equal(h.controller.saveTarget(), false); assert.equal(h.fixture.calls.length, count);
  h.fixture.setScenario('normal'); await h.controller.select(3, { preserve: true });
  assert.equal(h.controller.getState().targetForm.observe_requests, true); assert.equal(h.controller.getState().targetForm.reason, '不能丢失的人工理由');
  assert.equal(await h.controller.saveTarget(), true); h.controller.dispose();
});

test('停止将来/清除所选日/旧停止/解封彼此独立，均显式理由与CAS', async () => {
  const h = harness(); await h.controller.select(3); h.controller.changeTarget({ reason: '已完成排查，停止将来' });
  assert.equal(await h.controller.saveTarget({ stop: true }), true); assert.ok(h.controller.getState().requests.items.length > 0);
  const calls = h.fixture.calls.length; await h.controller.loadLegacy(); assert.equal(h.fixture.calls.length, calls + 1);
  h.controller.changeReason('legacyReason', '明确关闭旧自动封禁'); await h.controller.legacyAction('stop');
  assert.equal(h.controller.getState().legacy.tracking, false); assert.equal(h.controller.getState().legacy.bans.length, 1);
  h.controller.changeReason('actionReason', '仅删除该日新观察记录'); await h.controller.clearDay();
  assert.equal(h.controller.getState().legacy.bans.length, 1); assert.equal(h.controller.getState().selected.target.observe_ip, false);
  h.controller.selectLegacyIP('198.51.100.9', true); assert.equal(h.controller.getState().selectedIPs.length, 0);
  h.controller.selectLegacyIP('192.0.2.17', true); h.controller.changeReason('legacyReason', '核对来源后解封单个IP'); await h.controller.legacyAction('unban');
  assert.equal(h.controller.getState().legacy.bans.length, 0); const unban = h.fixture.calls.find(call => call.path.endsWith('/unban')); assert.deepEqual(unban.body.ips, ['192.0.2.17']); h.controller.dispose();
});

test('过期目标停止只关闭两开关，不转发旧到期时间、不隐式续期', async () => {
  for (const stop of [true, false]) {
    const expired = { ...fixtureTarget(3, now()), expires_at: Math.floor(now() / 1000) - 86400 };
    const detail = { user: fixtureUser(3), target: expired, status: 'expired', policy_enabled: true, timezone: TIMEZONE };
    const h = harness({ api: { target: async () => detail } });
    try {
      assert.equal(await h.controller.select(3), true);
      assert.equal(h.controller.getState().selected.status, 'expired');
      const oldDeadline = h.controller.getState().targetForm.expires;
      h.controller.changeTarget({ observe_ip: false, observe_requests: false, reason: '过期后明确关闭观察，不续期' });
      assert.equal(await h.controller.saveTarget({ stop }), true);
      const call = h.fixture.calls.find(entry => entry.method === 'PUT');
      assert.deepEqual(call.body, { observe_ip: false, observe_requests: false, reason: '过期后明确关闭观察，不续期', revision: expired.revision });
      assert.equal(Object.hasOwn(call.body, 'expires_at'), false);
      assert.equal(h.controller.getState().targetForm.expires, oldDeadline);
      assert.equal(h.controller.getState().selected.target.observe_ip, false);
      assert.equal(h.controller.getState().selected.target.observe_requests, false);
    } finally { h.controller.dispose(); }
  }
});

test('会话切换/注销/撤权/销毁清空内存原始数据并拒绝迟到回填', async () => {
  for (const event of ['switch', 'block', 'dispose']) {
    const pending = deferred(); const h = harness(); await h.controller.select(3);
    const lateAPI = harness({ api: { requests: () => pending.promise } });
    const opening = lateAPI.controller.select(3);
    await new Promise(resolve => setImmediate(resolve));
    if (event === 'switch') lateAPI.switchSession({ user: { id: 2, role: 'admin' }, token: 'different' });
    else lateAPI.controller[event]();
    pending.resolve({ items: [fixtureRequest()], next_cursor: null, timezone: TIMEZONE }); await opening;
    const state = lateAPI.controller.getState(); assert.equal(state.requests, null); assert.equal(state.selected, null); assert.equal(state.output, null);
    h.controller.dispose(); lateAPI.controller.dispose();
  }
  for (const status of [401, 403]) {
    const h = harness(); await h.controller.select(3); h.fixture.setScenario(status === 401 ? 'unauthorized' : 'forbidden'); await h.controller.loadRequests();
    assert.equal(h.controller.getState().blocked, true); assert.equal(h.controller.getState().selected, null); assert.equal(h.rejected.length, 1); h.controller.dispose();
  }
});

test('复制必须明确 confirmed 与理由，先授权审计再clipboard；当前页不是全日', async () => {
  const h = harness(); await h.controller.select(3);
  assert.equal(await h.controller.copy(), false); assert.equal(h.fixture.audit.length, 0);
  assert.equal(await h.controller.copy({ confirmed: true }), false); assert.equal(h.copied.length, 0);
  h.controller.changeReason('exportReason', '明确当前页排查'); assert.equal(await h.controller.copy({ confirmed: true }), true);
  const output = JSON.parse(h.copied[0]); assert.equal(output.scope, 'current_page'); assert.equal(output.requests.length, 50); assert.equal(output.ip_count, 0); assert.equal(output.coverage, 'unknown'); assert.equal(output.truncated, true);
  assert.equal(h.fixture.audit.at(-1).path.endsWith('/export-authorization'), true); assert.ok(output.audit_ids.length); assert.equal(output.timezone, TIMEZONE);
  const calls = h.fixture.calls.length; assert.equal(await h.controller.copy({ confirmed: true, kind: 'ips' }), false); assert.equal(h.fixture.calls.length, calls);
  h.controller.setFilters({ ipAll: false }); await h.controller.loadIPs(); assert.equal(await h.controller.copy({ confirmed: true, kind: 'ips' }), true); h.controller.dispose();
});

test('跨会话clear/policy变更后旧请求/IP页授权409，不写clipboard或发布输出，重读恢复', async () => {
  for (const kind of ['requests', 'ips']) for (const change of ['clear', 'policy']) {
    const h = harness();
    try {
      assert.equal(await h.controller.loadPolicy(), true); assert.equal(await h.controller.select(3), true);
      if (kind === 'ips') { h.controller.setFilters({ ipAll: false }); assert.equal(await h.controller.loadIPs(), true); }
      const page = h.controller.getState()[kind], generation = { ...page.generation };
      const body = change === 'clear' ? { day: h.controller.getState().filters.day, reason: '另一会话明确清日', revision: generation.target_revision } : { ...h.controller.getState().policy.policy, reason: '另一会话改变策略' };
      const result = h.fixture.respond(change === 'clear' ? `${ROOT}/targets/3/clear-day` : `${ROOT}/policy`, { method: change === 'clear' ? 'POST' : 'PUT', body, operationId: randomUUID() });
      assert.equal(result.status, 200);
      h.controller.changeReason('exportReason', '明确复制已见当前页');
      assert.equal(await h.controller.copy({ kind, confirmed: true }), false);
      assert.deepEqual(h.fixture.calls.at(-1).body.generation, generation);
      assert.equal(h.copied.length, 0); assert.equal(h.controller.getState().output, null); assert.equal(h.controller.getState().conflicts.export, true);
      assert.equal(await h.controller[kind === 'ips' ? 'loadIPs' : 'loadRequests'](), true);
      assert.notDeepEqual(h.controller.getState()[kind].generation, generation);
      assert.equal(await h.controller.copy({ kind, confirmed: true }), true); assert.equal(h.copied.length, 1);
    } finally { h.controller.dispose(); }
  }
});

test('缺失generation的页即使被注入controller也不能授权或写clipboard', async () => {
  const h = harness({ api: { requests: async () => ({ items: [], next_cursor: null, timezone: TIMEZONE }) } });
  try {
    await h.controller.select(3); h.controller.changeReason('exportReason', '必须有读取代次');
    const calls = h.fixture.calls.length;
    assert.equal(await h.controller.copy({ confirmed: true }), false);
    assert.equal(h.fixture.calls.length, calls); assert.equal(h.copied.length, 0); assert.equal(h.controller.getState().output, null);
  } finally { h.controller.dispose(); }
});

test('剪贴板失败仅展示已审计可选文本；取消/切换不自动覆盖clipboard或留存输出', async () => {
  const h = harness({ clipboardFails: true }); await h.controller.select(3); h.controller.changeReason('exportReason', '排查，手动拷贝');
  await h.controller.copy({ confirmed: true }); assert.equal(h.controller.getState().output.copied, false); assert.ok(h.controller.getState().output.text.includes('fixture-event'));
  h.controller.clearOutput(); assert.equal(h.controller.getState().output, null); h.controller.block(); assert.equal(h.controller.getState().exportReason, ''); h.controller.dispose();
  const gate = deferred(); const late = harness({ api: { authorizeExport: () => gate.promise } }); await late.controller.select(3); late.controller.changeReason('exportReason', '取消读取');
  const copying = late.controller.copy({ confirmed: true }); late.controller.cancel('export'); gate.resolve({ audit_id: 'late-audit' }); await copying;
  assert.equal(late.copied.length, 0); assert.equal(late.controller.getState().output, null); late.controller.dispose();
});

test('每日稳定双流逐页IP+request导出：不丢后页IP，合计5000/UTF8 1MiB硬上限', async () => {
  const h = harness(); await h.controller.select(3); h.controller.changeReason('exportReason', '有界全日人工排查');
  assert.equal(await h.controller.copy({ scope: 'day', confirmed: true }), true);
  let output = JSON.parse(h.copied.at(-1)); assert.equal(output.requests.length, 118); assert.equal(output.ips.length, 62); assert.equal(output.record_count, 180); assert.equal(output.truncated, false); assert.equal(output.coverage, 'recorded');
  h.fixture.setScenario('large'); assert.equal(await h.controller.copy({ scope: 'day', confirmed: true }), true);
  output = JSON.parse(h.copied.at(-1)); assert.ok(output.record_count <= MAX_RECORDS); assert.ok(byteLength(h.copied.at(-1)) <= MAX_BYTES); assert.equal(output.truncated, true); assert.equal(output.coverage, 'limit_reached'); assert.ok(output.continuation); h.controller.dispose();
});

test('导出游标回环/快照改变/失败绝不发布部分成功或复制假空数据', async () => {
  for (const mode of ['loop', 'snapshot', 'fail']) {
    let count = 0;
    const h = harness({ api: { exportDay: async () => {
      count += 1; if (count === 2 && mode === 'fail') throw new Error('network failure');
      return { schema_version: 1, user_id: 3, day: '2026-11-13', timezone: TIMEZONE, generated_at: mode === 'snapshot' ? count : 1, items: [fixtureRequest(count, 3, '2026-11-13')], ips: [fixtureIP(count, '2026-11-13')], next_cursor: 'repeat', truncated: true, coverage: 'recorded', audit_id: `audit-${count}` };
    } } });
    await h.controller.select(3); h.controller.changeReason('exportReason', '验证输出稳定性'); assert.equal(await h.controller.copy({ scope: 'day', confirmed: true }), false);
    assert.equal(h.copied.length, 0); assert.equal(h.controller.getState().output, null); assert.ok(h.controller.getState().errors.export); h.controller.dispose();
  }
});
