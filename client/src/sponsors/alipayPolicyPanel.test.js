import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { setImmediate } from 'node:timers';
import { alipayPolicyDraft, alipayPolicyError, alipayPolicyUpdate, receiveAlipayPolicyRead, verifyAlipayPolicySave } from './alipayPolicyModel.js';
import { createSponsorAdminAPI } from './adminAPI.js';
import { createAlipayPolicyFixture } from '../../tests/alipay-policy-fixture.js';

// 执行真实组件的无 JSX read/save handlers；仅注入 hooks 状态、既有 run/confirm 与网络边界。
// 浏览器视觉仍由独立 UI fixture 验收，不以 source 正则代替 UI。
const source = readFileSync(new URL('./AlipayPolicyPanel.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  async function readLatest() {');
const end = source.indexOf('  const freshSample =', start);
assert.ok(start > 0 && end > start, '真实门禁 handlers 提取边界变化，请更新测试');
const handlers = source.slice(start, end);
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { resolve, promise }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(scenario = 'normal', { fetcher, draftPatch = {} } = {}) {
  const fixture = createAlipayPolicyFixture(scenario);
  const previous = fixture.respond('/api/admin/sponsors/alipay-policy').data;
  const scope = { alive: true };
  const requests = [];
  let currentSession = true;
  const api = createSponsorAdminAPI({ isCurrentSession: () => currentSession, fetcher: fetcher || (async (url, options) => {
    requests.push({ url, options });
    const result = fixture.respond(url, options.method, options.body ? JSON.parse(options.body) : null);
    return Response.json(result.data, { status: result.status });
  }) });
  const state = { busy: false, globalLock: false, errors: [], successes: [], flights: [], writes: 0, confirms: 0 };
  let editor = { owner: api, snapshot: previous, latest: null, draft: { ...alipayPolicyDraft(previous.settings), ...draftPatch }, reason: '保留人工核实理由', blocked: false, loading: false, error: '', notice: '' };
  const context = {
    api, current: editor, snapshot: previous, pending: false, active: { current: scope }, localLock: { current: false },
    alipayPolicyUpdate, alipayPolicyDraft, verifyAlipayPolicySave, alipayPolicyError,
    applyRead(value, data) {
      try { return { ...receiveAlipayPolicyRead(value, data), loading: false }; }
      catch (error) { return { ...value, loading: false, blocked: !!value.snapshot, error: alipayPolicyError(error) }; }
    },
    stillHere: value => value.alive && context.active.current === value,
    confirm: async () => { state.confirms++; return true; },
    setEditor(change) {
      editor = typeof change === 'function' ? change(editor) : change;
      context.current = editor; context.snapshot = editor.snapshot; context.pending = editor.loading || state.busy;
      state.writes++;
    },
    run(task, success) {
      if (state.globalLock) return Promise.resolve();
      state.globalLock = true; state.busy = true; context.pending = true;
      const promise = (async () => {
        try { if (await task() !== false && scope.alive) state.successes.push(success); }
        catch (error) { state.errors.push(error); }
        finally { state.globalLock = false; state.busy = false; context.pending = editor.loading; }
      })();
      state.flights.push(promise); return promise;
    },
  };
  const actual = new Script(`${handlers}\n({ save, readLatest });`, { filename: 'AlipayPolicyPanel.actual-handlers.js' }).runInContext(createContext(context));
  return { state, context, fixture, requests, api, get editor() { return editor; },
    save: () => actual.save({ preventDefault() {} }), read: () => actual.readLatest(),
    switchSession() { currentSession = false; scope.alive = false; },
    wait: () => Promise.all(state.flights),
  };
}

test('真实 save handlers pending 时双击只 PUT 一次，重读确认前不报成功', async () => {
  const put = deferred(), get = deferred(); let puts = 0, gets = 0;
  const fixture = createAlipayPolicyFixture();
  const app = harness('normal', { fetcher: async (url, options) => {
    const result = fixture.respond(url, options.method, options.body ? JSON.parse(options.body) : null);
    if (options.method === 'PUT') { puts++; await put.promise; } else { gets++; await get.promise; }
    return Response.json(result.data, { status: result.status });
  }, draftPatch: { daily: '900' } });
  app.save(); app.save();
  assert.equal(puts, 1); assert.equal(app.state.busy, true); assert.equal(app.state.successes.length, 0);
  put.resolve(); await tick();
  assert.equal(gets, 1); assert.equal(app.state.busy, true); assert.equal(app.state.successes.length, 0);
  get.resolve(); await app.wait();
  assert.equal(app.editor.snapshot.version, 2); assert.equal(app.editor.draft.daily, '900.00'); assert.equal(app.editor.reason, '');
  assert.equal(app.state.successes.length, 1); assert.equal(app.state.busy, false); assert.equal(app.context.localLock.current, false);
});

test('真实 save handlers 409/503 保草稿理由、暂停写入；重读不自动采用新CAS', async () => {
  for (const scenario of ['conflict', 'save-error', 'save-unknown']) {
    const app = harness(scenario, { draftPatch: { daily: '888.88' } });
    app.save(); await app.wait();
    assert.equal(app.editor.draft.daily, '888.88'); assert.equal(app.editor.reason, '保留人工核实理由');
    assert.equal(app.editor.snapshot.version, 1); assert.equal(app.editor.blocked, true);
    assert.equal(app.state.successes.length, 0); assert.equal(app.state.errors.length, 1);
    app.save(); await app.wait();
    assert.equal(app.requests.filter(request => request.options.method === 'PUT').length, 1);
    await app.read();
    assert.equal(app.editor.draft.daily, '888.88'); assert.equal(app.editor.reason, '保留人工核实理由');
    if (scenario !== 'save-error') { assert.equal(app.editor.latest.version, 2); assert.equal(app.editor.snapshot.version, 1); assert.equal(app.editor.blocked, true); }
  }
});

test('真实 save handlers 保存回执后出现并行新版本，不假称当前成功或覆盖草稿', async () => {
  const app = harness('concurrent-after-save', { draftPatch: { daily: '900' } });
  app.save(); await app.wait();
  assert.equal(app.editor.snapshot.version, 1); assert.equal(app.editor.latest.version, 3);
  assert.equal(app.editor.draft.daily, '900'); assert.equal(app.editor.reason, '保留人工核实理由');
  assert.equal(app.editor.blocked, true); assert.equal(app.state.successes.length, 0);
  assert.match(app.editor.notice, /随后已变更/);
});

test('真实 save handlers 账户切换后旧响应不会更新草稿/成功提示', async () => {
  const network = deferred();
  const fixture = createAlipayPolicyFixture();
  const app = harness('normal', { fetcher: async (url, options) => {
    const result = fixture.respond(url, options.method, JSON.parse(options.body));
    await network.promise;
    return Response.json(result.data, { status: result.status });
  } });
  app.save(); const writesBefore = app.state.writes; app.switchSession(); network.resolve(); await app.wait();
  assert.equal(app.state.writes, writesBefore); assert.equal(app.state.successes.length, 0);
  assert.equal(app.editor.snapshot.version, 1); assert.equal(app.editor.reason, '保留人工核实理由');
});

test('真实 handlers 验证错误/取消确认不发写入且释放锁，读失败不假置0', async () => {
  const invalid = harness('normal', { draftPatch: { daily: '1000.01' } });
  invalid.save(); await invalid.wait(); assert.equal(invalid.requests.length, 0); assert.equal(invalid.context.localLock.current, false);
  const cancelled = harness('normal', { draftPatch: { purchase_enabled: true } });
  cancelled.context.confirm = async () => false;
  cancelled.save(); await cancelled.wait(); assert.equal(cancelled.requests.length, 0); assert.equal(cancelled.state.successes.length, 0); assert.equal(cancelled.context.localLock.current, false);
  const readFailure = harness('normal', { fetcher: async () => { throw new TypeError('network failed'); } });
  await readFailure.read();
  assert.equal(readFailure.editor.snapshot.usage.day.paid_minor, 1200); assert.equal(readFailure.editor.blocked, true);
  assert.match(readFailure.editor.error, /未获得新的有效样本/);
});
