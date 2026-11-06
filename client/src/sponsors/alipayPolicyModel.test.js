import test from 'node:test';
import assert from 'node:assert/strict';
import { adoptAlipayPolicyLatest, alipayMoney, alipayPolicyAvailability, alipayPolicyDraft, alipayPolicyError, alipayPolicyReason, alipayPolicySampleFresh, alipayPolicyUpdate, alipayRemaining, receiveAlipayPolicyRead, validateAlipayPolicyResponse, validateAlipayPolicyUpdate, verifyAlipayPolicySave } from './alipayPolicyModel.js';
import { alipayPolicyFixtureSample, createAlipayPolicyFixture } from '../../tests/alipay-policy-fixture.js';

const sample = () => alipayPolicyFixtureSample(1793923200);
const copy = value => structuredClone(value);
const revision2 = 'a11a0000-0000-4000-8000-000000000002';
const empty = () => ({ snapshot: null, latest: null, draft: null, reason: '', blocked: false, error: '', notice: '' });
const ready = () => createAlipayPolicyFixture('ready').respond('/api/admin/sponsors/alipay-policy').data;

test('门禁完整 shape 接受默认关闭和 true/null 可购，未知禁用码只中文暂不可用', () => {
  const initial = sample();
  assert.equal(validateAlipayPolicyResponse(initial), initial);
  assert.equal(initial.settings.purchase_enabled, false);
  const allowed = ready();
  assert.equal(validateAlipayPolicyResponse(allowed), allowed);
  assert.equal(allowed.effective.reason, null); assert.equal(alipayPolicyAvailability(allowed), true);
  initial.effective.reason = '<img src=x onerror=alert(1)>';
  assert.doesNotThrow(() => validateAlipayPolicyResponse(initial));
  assert.equal(alipayPolicyAvailability(initial), false);
  assert.equal(alipayPolicyReason(initial.effective.reason), '暂不可用，请核查服务器策略');
  for (const reason of ['constructor', '__proto__', 'toString']) assert.equal(alipayPolicyReason(reason), '暂不可用，请核查服务器策略');
  for (const reason of ['available', 'disabled', 'future']) {
    const invalid = copy(allowed); invalid.effective.reason = reason;
    assert.throws(() => validateAlipayPolicyResponse(invalid), /契约不一致/);
  }
});

test('未知字段/enum/缺字段/隐式数字/unsafe/负数均拒绝，不接收 raw config', () => {
  const changes = [
    data => { data.schema_version = 2; }, data => { data.version = 0; }, data => { data.version = Number.MAX_SAFE_INTEGER + 1; },
    data => { data.revision = 'not-uuid'; }, data => { data.revision = data.revision.toUpperCase(); }, data => { data.updated_at = -1; },
    data => { data.updated_by = 7; }, data => { data.raw_config = {}; }, data => { delete data.settings; }, data => { data.settings = []; },
    data => { data.settings.purchase_enabled = 'false'; }, data => { data.settings.merchant_status = 'automatically_approved'; },
    data => { data.settings.monthly_mode = 'unlimited'; }, data => { data.settings.limits_verified = 1; },
    data => { data.settings.per_transaction_minor = 5001; }, data => { data.settings.daily_minor = 100001; },
    data => { data.settings.per_transaction_minor = 0; }, data => { data.settings.daily_minor = '100000'; },
    data => { data.settings.monthly_minor = 1; }, data => { data.platform_ceiling.per_transaction_minor = 5001; },
    data => { data.platform_ceiling.daily_minor = 99999; }, data => { data.platform_ceiling.cycle_timezone = 'UTC'; },
    data => { data.effective.reason = null; }, data => { data.effective.reason = ' '; }, data => { data.effective.environment = 'live'; },
    data => { data.effective.master_configured = 1; }, data => { delete data.effective.payment_configured; },
    data => { data.effective.per_transaction_minor = -1; }, data => { data.effective.daily_minor = Number.MAX_SAFE_INTEGER; },
    data => { data.effective.monthly_minor = 0; }, data => { data.effective.monthly_unlimited_verified = true; },
    data => { data.usage.scope = 'all_merchant_funds'; }, data => { data.usage.timezone = 'UTC'; }, data => { data.usage.as_of = '1793923200'; },
    data => { data.usage.day.paid_minor = -1; }, data => { data.usage.day.pending_minor = Number.MAX_SAFE_INTEGER + 1; },
    data => { data.usage.month.occupied_minor = '0'; }, data => { data.usage.day.remaining_minor = -1; },
    data => { delete data.usage.day.remaining_minor; }, data => { data.usage.month.cycle_key = '2026-13'; },
    data => { data.usage.day.cycle_key = '2026-02-30'; }, data => { data.usage.day.reset_at = -1; },
  ];
  for (const change of changes) { const data = sample(); change(data); assert.throws(() => validateAlipayPolicyResponse(data), /契约不一致/); }
  for (const invalid of [null, [], true, 'data', {}]) assert.throws(() => validateAlipayPolicyResponse(invalid));
});

test('true 可购也必须满足已开关/人工商家状态/核实/月模式/master/payment，不能绕 gate', () => {
  const changes = [
    data => { data.settings.purchase_enabled = false; }, data => { data.settings.merchant_status = 'pending_review'; },
    data => { data.settings.merchant_status = 'unknown'; }, data => { data.settings.limits_verified = false; },
    data => { data.settings.monthly_mode = 'unknown'; data.settings.monthly_minor = null; },
    data => { data.effective.master_configured = false; }, data => { data.effective.payment_configured = false; },
    data => { data.effective.environment = null; }, data => { data.effective.per_transaction_minor = null; },
    data => { data.effective.daily_minor = null; }, data => { data.effective.monthly_minor = null; },
    data => { data.effective.monthly_minor = data.settings.monthly_minor + 1; },
  ];
  for (const change of changes) { const data = ready(); change(data); assert.throws(() => validateAlipayPolicyResponse(data)); }
  const unlimited = ready();
  unlimited.settings.monthly_mode = 'unlimited_verified'; unlimited.settings.monthly_minor = null;
  unlimited.effective.monthly_minor = null; unlimited.effective.monthly_unlimited_verified = true;
  assert.doesNotThrow(() => validateAlipayPolicyResponse(unlimited));
  assert.equal(alipayPolicyAvailability(unlimited), true);
});

test('无上下文 paid/pending/occupied/null 不能显示 0，remaining null 区分已核无限与未知', () => {
  const data = createAlipayPolicyFixture('missing-context').respond('/api/admin/sponsors/alipay-policy').data;
  assert.doesNotThrow(() => validateAlipayPolicyResponse(data));
  for (const cycle of [data.usage.day, data.usage.month]) for (const key of ['paid_minor', 'pending_minor', 'occupied_minor']) {
    assert.equal(cycle[key], null); assert.match(alipayMoney(cycle[key]), /不可获取/); assert.doesNotMatch(alipayMoney(cycle[key]), /¥0/);
  }
  assert.equal(alipayMoney(0), '¥0.00');
  assert.match(alipayRemaining(data), /未知/); assert.match(alipayRemaining(data, true), /未知/);
  data.settings.monthly_mode = 'unlimited_verified'; data.settings.monthly_minor = null; data.effective.monthly_unlimited_verified = true;
  assert.match(alipayRemaining(data, true), /已人工核实无月上限/);
});

test('PUT exact body 与元转分边界；unknown/unlimited 必须发 null，不接受提硬上限', () => {
  const settings = sample().settings, draft = alipayPolicyDraft(settings);
  assert.deepEqual(alipayPolicyUpdate({ ...draft, privateKey: 'do-not-send' }, 3, '  人工复核  '), { expected_version: 3, settings, reason: '人工复核' });
  assert.deepEqual(alipayPolicyUpdate({ ...draft, per_transaction: '0.29', daily: '999.99', monthly_mode: 'limited', monthly: '1000000.00' }, 1, '核实').settings,
    { ...settings, per_transaction_minor: 29, daily_minor: 99999, monthly_mode: 'limited', monthly_minor: 100000000 });
  assert.equal(alipayPolicyUpdate({ ...draft, monthly_mode: 'unlimited_verified', monthly: '123.45' }, 1, '核实').settings.monthly_minor, null);
  const invalid = [
    { per_transaction: '50.01' }, { daily: '1000.01' }, { per_transaction: '0' }, { daily: '0.00' },
    { per_transaction: '1e1' }, { daily: 'NaN' }, { daily: '100.001' }, { purchase_enabled: 1 },
    { merchant_status: 'automatic_approved' }, { monthly_mode: 'unlimited' }, { monthly_mode: 'limited', monthly: '' },
    { monthly_mode: 'limited', monthly: '0' }, { monthly_mode: 'limited', monthly: '1000000.01' },
  ];
  for (const values of invalid) assert.throws(() => alipayPolicyUpdate({ ...draft, ...values }, 1, '核实'));
  for (const reason of ['', ' ', 'a'.repeat(501)]) assert.throws(() => alipayPolicyUpdate(draft, 1, reason));
  assert.throws(() => alipayPolicyUpdate(draft, 0, '核实'));
  const body = alipayPolicyUpdate(draft, 1, '核实');
  assert.deepEqual(validateAlipayPolicyUpdate(body), body);
  for (const invalidBody of [{ ...body, operation_id: 'not-allowed' }, { ...body, expected_version: '1' }, { ...body, settings: { ...settings, verified: true } }, { settings, reason: '核实' }]) assert.throws(() => validateAlipayPolicyUpdate(invalidBody));
});

test('保存回执必须 v+1/new revision/真实 settings，并重读确认；并行管理员不静默覆盖', () => {
  const previous = sample(), settings = { ...previous.settings, daily_minor: 90000 };
  const receipt = { ...copy(previous), settings, version: 2, revision: revision2 };
  receipt.effective.daily_minor = 90000;
  assert.equal(verifyAlipayPolicySave(previous, settings, receipt, copy(receipt)), 'confirmed');
  const latest = { ...copy(receipt), version: 3, revision: 'a11a0000-0000-4000-8000-000000000003' };
  latest.settings.daily_minor = 80000; latest.effective.daily_minor = 80000;
  assert.equal(verifyAlipayPolicySave(previous, settings, receipt, latest), 'concurrent');
  assert.throws(() => verifyAlipayPolicySave(previous, settings, previous, previous), /不能确认/);
  const wrongRevision = { ...copy(receipt), revision: previous.revision };
  assert.throws(() => verifyAlipayPolicySave(previous, settings, wrongRevision, wrongRevision), /不能确认/);
  const wrongSettings = copy(receipt); wrongSettings.settings.daily_minor = 95000;
  assert.throws(() => verifyAlipayPolicySave(previous, settings, wrongSettings, wrongSettings), /不能确认/);
  assert.throws(() => verifyAlipayPolicySave(previous, settings, receipt, previous), /不能确认/);
});

test('冲突/结果未知后的最新读取保留草稿理由与旧CAS；只能人工明确采用新基准', () => {
  const initial = sample();
  let editor = receiveAlipayPolicyRead(empty(), initial);
  editor = { ...editor, draft: { ...editor.draft, daily: '888.88' }, reason: '保留我的理由', blocked: true };
  const latest = { ...copy(initial), version: 2, revision: revision2, updated_by: 'fixture-admin-B' };
  latest.settings.daily_minor = 90000; latest.effective.daily_minor = 90000;
  const conflict = receiveAlipayPolicyRead(editor, latest);
  assert.equal(conflict.snapshot.version, 1); assert.equal(conflict.latest.version, 2); assert.equal(conflict.blocked, true);
  assert.equal(conflict.draft.daily, '888.88'); assert.equal(conflict.reason, '保留我的理由');
  const adopted = adoptAlipayPolicyLatest(conflict);
  assert.equal(adopted.snapshot.version, 2); assert.equal(adopted.latest, null); assert.equal(adopted.blocked, false);
  assert.equal(adopted.draft.daily, '888.88'); assert.equal(adopted.reason, '保留我的理由');
  const unchanged = receiveAlipayPolicyRead(editor, initial);
  assert.equal(unchanged.draft.daily, '888.88'); assert.equal(unchanged.reason, '保留我的理由');
  assert.throws(() => receiveAlipayPolicyRead(adopted, initial), /旧版本/);
  assert.throws(() => receiveAlipayPolicyRead(editor, { ...initial, revision: revision2 }), /不一致/);
});

test('as_of 新鲜度不过度宣称实时；错误含接口缺失、冲突、保存未确认中文提示', () => {
  assert.equal(alipayPolicySampleFresh(1000, 1100 * 1000), true);
  assert.equal(alipayPolicySampleFresh(1000, 1201 * 1000), false);
  assert.equal(alipayPolicySampleFresh(2000, 1000 * 1000), false);
  assert.equal(alipayPolicySampleFresh('1000', 1100 * 1000), false);
  assert.match(alipayPolicyError({ status: 404 }), /接口尚未提供/);
  assert.match(alipayPolicyError({ status: 409 }, true), /版本冲突.*草稿和理由已保留/);
  assert.match(alipayPolicyError(new Error('网络中断'), true), /先读取核查.*不会自动重试/);
});
