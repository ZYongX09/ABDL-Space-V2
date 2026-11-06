import test from 'node:test';
import assert from 'node:assert/strict';
import { createSponsorAdminAPI } from './adminAPI.js';
import { createAlipayPolicyFixture, sponsorLedgerRecordsSample } from '../../tests/alipay-policy-fixture.js';

const NOW = 1793923200;
const KEY = '00000000-0000-4000-8000-000000000123';
const refundable = () => sponsorLedgerRecordsSample(NOW).find(item => item.channel === 'alipay' && item.refundable);
const nonRefundable = () => sponsorLedgerRecordsSample(NOW).find(item => item.channel === 'alipay' && !item.refundable);

function fixtureAPI(scenario = 'normal') {
  const fixture = createAlipayPolicyFixture(scenario), calls = [];
  const api = createSponsorAdminAPI({ fetcher: async (url, options) => {
    calls.push({ url, options });
    const target = new URL(url, 'http://fixture.invalid');
    const result = fixture.respond(target.pathname, options.method, options.body ? JSON.parse(options.body) : null, target.searchParams);
    return Response.json(result.data, { status: result.status });
  } });
  return { api, calls, fixture };
}

test('概览/明细分页复用同源 cookie、no-store、超时，渠道空值不写入查询', async () => {
  const { api, calls } = fixtureAPI('overview');
  const overview = await api.overview();
  assert.equal(overview.channels.alipay.total_count, 8);
  const records = await api.paymentRecords({ channel: '', limit: 5, offset: 10 });
  assert.equal(records.items.length, 5); assert.equal(records.total, 23);
  const filtered = await api.paymentRecords({ channel: 'afdian', limit: 20, offset: 0 });
  assert.ok(filtered.items.every(item => item.channel === 'afdian'));
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, '/api/admin/sponsors/overview');
  assert.equal(calls[1].url, '/api/admin/sponsors/payment-records?limit=5&offset=10');
  const target = new URL(calls[2].url, 'http://fixture.invalid');
  assert.equal(target.pathname, '/api/admin/sponsors/payment-records');
  assert.deepEqual(Object.fromEntries(target.searchParams), { channel: 'afdian', limit: '20', offset: '0' });
  for (const call of calls) {
    assert.equal(call.options.method, 'GET');
    assert.equal(call.options.credentials, 'include'); assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.redirect, 'error');
    assert.ok(call.options.signal instanceof AbortSignal); assert.equal(call.options.body, undefined);
  }
});

test('退款使用独立同源路径、Idempotency-Key 与严格金额/原因；非法输入不发请求', async () => {
  const { api, calls } = fixtureAPI('normal');
  const record = refundable();
  const receipt = await api.refundAlipayOrder(record.order_no, { refund_amount: record.amount_minor, reason: ' 用户申请  ' }, KEY);
  assert.equal(receipt.order_no, record.order_no); assert.equal(receipt.status, 'processing');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `/api/payments/alipay/orders/${record.order_no}/refunds`);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['Idempotency-Key'], KEY);
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].options.credentials, 'include'); assert.equal(calls[0].options.cache, 'no-store');
  assert.deepEqual(JSON.parse(calls[0].options.body), { refund_amount: record.amount_minor, reason: '用户申请' });

  let requests = 0;
  const guarded = createSponsorAdminAPI({ fetcher: async () => { requests++; return Response.json({}); } });
  assert.throws(() => guarded.refundAlipayOrder(record.order_no, { refund_amount: 0, reason: '理由' }, KEY));
  assert.throws(() => guarded.refundAlipayOrder(record.order_no, { refund_amount: record.amount_minor, reason: ' ' }, KEY));
  assert.throws(() => guarded.refundAlipayOrder(record.order_no, { refund_amount: record.amount_minor, reason: '理由' }, 'not-a-uuid'));
  assert.throws(() => guarded.refundAlipayOrder('', { refund_amount: record.amount_minor, reason: '理由' }, KEY));
  assert.equal(requests, 0);
});

test('退款失败/未知/冲突保持明确语义，不盲重试也不假报成功', async () => {
  const failure = fixtureAPI('refund-failure');
  const record = refundable();
  await assert.rejects(failure.api.refundAlipayOrder(record.order_no, { refund_amount: record.amount_minor, reason: '测试' }, KEY),
    error => error.status === 503 && error.definitive === false && /未确认退款成功/.test(error.message));
  assert.equal(failure.calls.length, 1);

  const conflict = fixtureAPI('normal');
  const blocked = nonRefundable();
  await assert.rejects(conflict.api.refundAlipayOrder(blocked.order_no, { refund_amount: blocked.amount_minor, reason: '测试' }, KEY),
    error => error.status === 409 && /退款操作冲突/.test(error.message));

  for (const [status, expected] of [[404, /尚未提供/], [405, /尚未提供/]]) {
    const api = createSponsorAdminAPI({ fetcher: async () => Response.json({ error: 'x' }, { status }) });
    await assert.rejects(api.paymentRecords({ limit: 20, offset: 0 }), expected);
    await assert.rejects(api.refundAlipayOrder(record.order_no, { refund_amount: record.amount_minor, reason: '理由' }, KEY), expected);
  }
  const broken = createSponsorAdminAPI({ fetcher: async () => new Response('not json', { status: 200 }) });
  await assert.rejects(broken.refundAlipayOrder(record.order_no, { refund_amount: record.amount_minor, reason: '理由' }, KEY), /退款响应无法解析/);
});

test('非法响应 fail-closed，账户切换丢弃旧响应，网络错误不自动重试', async () => {
  const invalidOverview = createSponsorAdminAPI({ fetcher: async () => Response.json({ ok: true }) });
  await assert.rejects(invalidOverview.overview(), /契约不一致/);
  const invalidRecords = createSponsorAdminAPI({ fetcher: async () => Response.json({ schema_version: 1, items: [], total: 0, limit: 20, offset: -1 }) });
  await assert.rejects(invalidRecords.paymentRecords({ limit: 20, offset: 0 }), /契约不一致/);

  let current = true;
  const switched = createSponsorAdminAPI({ isCurrentSession: () => current, fetcher: async () => { current = false; return Response.json({}); } });
  await assert.rejects(switched.overview(), /忽略旧账户响应/);
  let called = false;
  const stale = createSponsorAdminAPI({ isCurrentSession: () => false, fetcher: async () => { called = true; } });
  await assert.rejects(stale.paymentRecords({ limit: 20, offset: 0 }), /会话已切换/); assert.equal(called, false);

  let attempts = 0;
  const offline = createSponsorAdminAPI({ fetcher: async () => { attempts++; throw new TypeError('connection failed'); } });
  await assert.rejects(offline.paymentRecords({ limit: 20, offset: 0 }), /不会自动重试/);
  assert.equal(attempts, 1);
});

test('fixture 退款成功后回执可被模型复核；概览为空时也返回合法 0 汇总', async () => {
  const { api } = fixtureAPI('normal');
  const record = refundable();
  const receipt = await api.refundAlipayOrder(record.order_no, { refund_amount: record.amount_minor, reason: '测试' }, KEY);
  assert.deepEqual(Object.keys(receipt).sort(), ['order_no', 'refund_amount_minor', 'refund_no', 'status']);
  const empty = fixtureAPI('overview-empty');
  const overview = await empty.api.overview();
  assert.equal(overview.channels.alipay.total_count, 0); assert.equal(overview.channels.afdian.total_income_minor, 0);
  const page = await empty.api.paymentRecords({ limit: 20, offset: 0 });
  assert.deepEqual(page.items, []); assert.equal(page.total, 0);
});
