import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alipayRefundRequest, avatarSource, formatLedgerCount, formatLedgerMoney, formatLedgerTime, fullRefundAmount,
  isRefundable, ledgerEmptyText, ledgerMessage, ledgerPage, ledgerUser, newIdempotencyKey, overviewIsEmpty,
  overviewSections, recordKey, refundErrorMessage, sponsorLedgerError, sponsorLedgerQuery, sponsorOverviewError,
  validateAlipayRefundBody, validateIdempotencyKey, validateSponsorOverview, validateSponsorPaymentRecords,
  verifySponsorRefundReceipt,
} from './sponsorLedgerModel.js';
import { createAlipayPolicyFixture, sponsorLedgerOverviewSample, sponsorLedgerRecordsSample } from '../../tests/alipay-policy-fixture.js';

const NOW = 1793923200;
const copy = value => structuredClone(value);
const overview = (empty = false) => sponsorLedgerOverviewSample(NOW, { empty });
const records = () => ({ schema_version: 1, items: sponsorLedgerRecordsSample(NOW).slice(0, 20), total: 23, limit: 20, offset: 0 });
const refundable = () => records().items.find(item => isRefundable(item));

test('概览严格接受两渠道字段，金额分转元、人次明确，未知字段/负数/字符串拒绝', () => {
  const normal = overview();
  assert.equal(validateSponsorOverview(normal), normal);
  const sections = overviewSections(normal);
  assert.deepEqual(sections.map(section => section.channel), ['alipay', 'afdian']);
  assert.deepEqual(sections[0].metrics, [['当月收入', '¥128.00'], ['总收入', '¥960.00'], ['总人次', '8 人次'], ['当月人次', '3 人次']]);
  assert.deepEqual(sections[1].metrics, [['当月收入', '¥60.00'], ['总收入', '¥450.00'], ['总人次', '15 人次']]);
  assert.equal(overviewIsEmpty(normal), false);
  const empty = overview(true);
  assert.equal(overviewIsEmpty(empty), true);
  assert.equal(overviewSections(empty)[0].metrics[0][1], '¥0.00');

  const changes = [
    data => { data.schema_version = 2; }, data => { data.generated_at = -1; }, data => { data.generated_at = NOW * 1000; },
    data => { data.channels.alipay.total_count = -1; }, data => { data.channels.alipay.total_income_minor = '12800'; },
    data => { data.channels.alipay.month_income_minor = 1.5; }, data => { data.channels.afdian.total_count = Number.MAX_SAFE_INTEGER + 1; },
    data => { data.channels.afdian.month_count = 1; }, data => { delete data.channels.afdian.total_income_minor; },
    data => { data.channels.wechat = { month_income_minor: 0, total_income_minor: 0, total_count: 0 }; },
    data => { data.raw = {}; },
  ];
  for (const change of changes) { const data = copy(normal); change(data); assert.throws(() => validateSponsorOverview(data), /契约不一致/); }
  for (const value of [null, [], true, 'overview', {}]) assert.throws(() => validateSponsorOverview(value));
});

test('明细严格校验分页/渠道/金额；未知用户、未兑换、留言与退款可用性可判定', () => {
  const data = records();
  assert.equal(validateSponsorPaymentRecords(data), data);
  const page = ledgerPage(data);
  assert.deepEqual({ page: page.page, pages: page.pages, total: page.total, hasPrev: page.hasPrev, hasNext: page.hasNext, empty: page.empty }, { page: 1, pages: 2, total: 23, hasPrev: false, hasNext: true, empty: false });
  const second = ledgerPage({ ...data, offset: 20, items: sponsorLedgerRecordsSample(NOW).slice(20) });
  assert.equal(second.page, 2); assert.equal(second.hasNext, false); assert.equal(second.hasPrev, true);

  const afdian = data.items.filter(item => item.channel === 'afdian');
  const unredeemed = afdian.find(item => item.redeemer === null);
  assert.ok(unredeemed); assert.deepEqual(ledgerUser(unredeemed), { username: '未知用户', avatar: '', known: false });
  const redeemed = afdian.find(item => item.redeemer !== null);
  assert.equal(ledgerUser(redeemed).known, true); assert.match(ledgerUser(redeemed).username, /^afdian_user_/);
  const alipay = data.items.find(item => item.channel === 'alipay');
  assert.equal(ledgerUser(alipay).username, alipay.username);
  assert.equal(ledgerMessage(afdian.find(item => item.message !== null)), afdian.find(item => item.message !== null).message);
  assert.equal(isRefundable(alipay), alipay.refundable);
  assert.equal(isRefundable(unredeemed), false);
  assert.equal(recordKey(alipay), `alipay:${alipay.order_no}`);
  assert.equal(formatLedgerTime(alipay.paid_at), new Date(alipay.paid_at * 1000).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }));

  const changes = [
    data => { data.schema_version = 2; }, data => { data.total = -1; }, data => { data.limit = 0; }, data => { data.limit = 101; },
    data => { data.offset = -1; }, data => { data.items.length = 21; }, data => { data.offset = 5; },
    data => { data.items[0].channel = 'wechat'; }, data => { data.items[0].amount_minor = -1; },
    data => { data.items[0].paid_at = '1793923200'; }, data => { data.items[0].order_no = ''; },
    data => { data.items[0].avatar = '//evil.invalid/x.png'; }, data => { data.items[1].redeemer = { username: '', avatar: null }; },
    data => { data.items[1].message = 7; }, data => { data.items[0].refundable = 'true'; },
    data => { data.items[0].extra = true; }, data => { delete data.items[0].refundable; },
  ];
  for (const change of changes) { const value = copy(data); change(value); assert.throws(() => validateSponsorPaymentRecords(value), /契约不一致/); }
  assert.doesNotThrow(() => validateSponsorPaymentRecords({ ...data, items: [], offset: 40 }));
});

test('渠道/分页参数白名单与错误码文案', () => {
  assert.deepEqual(sponsorLedgerQuery({}), { limit: 20, offset: 0 });
  assert.deepEqual(sponsorLedgerQuery({ channel: 'alipay', limit: 5, offset: 10 }), { channel: 'alipay', limit: 5, offset: 10 });
  for (const value of [{ channel: 'wechat' }, { channel: null }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }, { offset: -1 }, { offset: '20' }]) {
    assert.throws(() => sponsorLedgerQuery(value));
  }
  assert.match(sponsorOverviewError({ status: 404 }), /尚未提供/);
  assert.match(sponsorOverviewError({ status: 401 }), /登录已过期/);
  assert.match(sponsorOverviewError({ message: '读取失败', status: 503 }), /未获得新的概览数据/);
  assert.match(sponsorLedgerError({ status: 403 }), /无管理员权限/);
  assert.match(sponsorLedgerError({ message: '读取失败', status: 503 }), /未获得新的账本数据/);
  assert.match(refundErrorMessage({ status: 409 }), /操作冲突/);
  assert.match(refundErrorMessage({ status: 422, definitive: true, message: '金额无效' }), /明确失败，未退款/);
  assert.match(refundErrorMessage({ status: 503, definitive: false }), /结果未知/);
});

test('退款请求全额默认、原因必填、金额上限、不可退拒绝；回执必须与订单和金额一致', () => {
  const record = refundable();
  assert.ok(record);
  const full = fullRefundAmount(record);
  assert.equal(full, (record.amount_minor / 100).toFixed(2));
  const body = alipayRefundRequest(record, full, '  用户申请退款  ');
  assert.deepEqual(body, { refund_amount: record.amount_minor, reason: '用户申请退款' });
  assert.deepEqual(alipayRefundRequest(record, '0.01', '部分退款'), { refund_amount: 1, reason: '部分退款' });
  assert.throws(() => alipayRefundRequest(record, full, '   '), /原因|理由/);
  assert.throws(() => alipayRefundRequest(record, '0', '理由'), /退款金额/);
  assert.throws(() => alipayRefundRequest(record, ((record.amount_minor + 1) / 100).toFixed(2), '理由'), /退款金额/);
  assert.throws(() => alipayRefundRequest(record, full, 'x'.repeat(501)), /原因|理由/);
  assert.throws(() => alipayRefundRequest({ ...record, refundable: false }, full, '理由'), /不可退款/);
  assert.throws(() => alipayRefundRequest({ ...record, channel: 'afdian' }, full, '理由'), /不可退款/);
  for (const invalid of [null, [], { refund_amount: 0, reason: '理由' }, { refund_amount: 1, reason: ' ' }, { refund_amount: 1, reason: '理由', extra: 1 }]) {
    assert.throws(() => validateAlipayRefundBody(invalid));
  }

  const receipt = { order_no: record.order_no, refund_no: 'RFI0001', refund_amount_minor: body.refund_amount, status: 'processing' };
  assert.equal(verifySponsorRefundReceipt(receipt, record.order_no, body), receipt);
  assert.throws(() => verifySponsorRefundReceipt({ ...receipt, order_no: 'other' }, record.order_no, body), /不一致/);
  assert.throws(() => verifySponsorRefundReceipt({ ...receipt, refund_amount_minor: 1 }, record.order_no, body), /不一致/);
  assert.throws(() => verifySponsorRefundReceipt({ ...receipt, extra: true }, record.order_no, body), /契约不一致/);
  assert.throws(() => verifySponsorRefundReceipt({ ...receipt, status: 'PROCESSING' }, record.order_no, body), /契约不一致/);
});

test('退款操作标识严格 UUID 且可由注入生成器复用', () => {
  const key = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  assert.equal(validateIdempotencyKey(key), key);
  for (const value of ['', 'not-a-uuid', key.toUpperCase(), null, 7]) assert.throws(() => validateIdempotencyKey(value), /Idempotency-Key/);
  assert.equal(newIdempotencyKey(() => key), key);
  assert.throws(() => newIdempotencyKey(() => undefined), /Idempotency-Key/);
});

test('头像只允许同源相对路径或 https，缺省由纯色占位接管', () => {
  assert.equal(avatarSource(null), ''); assert.equal(avatarSource(''), ''); assert.equal(avatarSource('   '), '');
  assert.equal(avatarSource('/avatars/a.png'), '/avatars/a.png');
  assert.equal(avatarSource('https://media.example.invalid/a.png'), 'https://media.example.invalid/a.png');
  for (const value of ['//evil.invalid/a.png', 'http://evil.invalid/a.png', 'javascript:alert(1)', 'data:image/png;base64,AA', ' /a.png']) assert.equal(avatarSource(value), '');
  assert.equal(formatLedgerMoney(0), '¥0.00'); assert.equal(formatLedgerMoney(12800), '¥128.00');
  assert.equal(formatLedgerMoney(-1), '金额待核查'); assert.equal(formatLedgerMoney('12800'), '金额待核查');
  assert.equal(formatLedgerCount(0), '0 人次'); assert.equal(formatLedgerCount(-1), '人次待核查');
  assert.equal(formatLedgerTime(null), '时间待核查');
  assert.equal(ledgerEmptyText('alipay'), '暂无支付宝支付记录'); assert.equal(ledgerEmptyText(''), '暂无支付记录');
});

test('本地 fixture 覆盖概览正常/空、明细分页含未兑换与退款失败，不转发真实 API', () => {
  const normal = createAlipayPolicyFixture('overview');
  const summary = normal.respond('/api/admin/sponsors/overview');
  assert.equal(summary.status, 200); assert.equal(validateSponsorOverview(summary.data), summary.data);
  assert.equal(overviewIsEmpty(summary.data), false);

  const empty = createAlipayPolicyFixture('overview-empty');
  const zero = empty.respond('/api/admin/sponsors/overview');
  assert.equal(overviewIsEmpty(zero.data), true);
  const noRecords = empty.respond('/api/admin/sponsors/payment-records', 'GET', null, new URLSearchParams({ limit: '20', offset: '0' }));
  assert.equal(noRecords.data.total, 0); assert.deepEqual(noRecords.data.items, []);

  const page1 = normal.respond('/api/admin/sponsors/payment-records', 'GET', null, new URLSearchParams({ limit: '5', offset: '0' }));
  const page2 = normal.respond('/api/admin/sponsors/payment-records', 'GET', null, new URLSearchParams({ limit: '5', offset: '5' }));
  assert.equal(page1.status, 200); assert.equal(page1.data.items.length, 5); assert.equal(page1.data.total, 23);
  assert.equal(ledgerPage(page1.data).page, 1); assert.equal(ledgerPage(page2.data).page, 2); assert.equal(ledgerPage(page2.data).hasPrev, true);
  const afdian = normal.respond('/api/admin/sponsors/payment-records', 'GET', null, new URLSearchParams({ channel: 'afdian', limit: '20', offset: '0' }));
  assert.ok(afdian.data.items.length > 0); assert.ok(afdian.data.items.every(item => item.channel === 'afdian'));
  assert.ok(afdian.data.items.some(item => item.redeemer === null)); assert.ok(afdian.data.items.some(item => item.redeemer !== null));
  assert.equal(normal.respond('/api/admin/sponsors/payment-records', 'GET', null, new URLSearchParams({ channel: 'wechat' })).status, 422);

  const failure = createAlipayPolicyFixture('refund-failure');
  const record = sponsorLedgerRecordsSample(NOW).find(item => item.channel === 'alipay' && item.refundable);
  const rejected = failure.respond(`/api/payments/alipay/orders/${record.order_no}/refunds`, 'POST', { refund_amount: record.amount_minor, reason: '本地退款测试' });
  assert.equal(rejected.status, 503); assert.match(rejected.data.error, /退款失败/);

  const success = createAlipayPolicyFixture('normal').respond(`/api/payments/alipay/orders/${record.order_no}/refunds`, 'POST', { refund_amount: record.amount_minor, reason: '本地退款测试' });
  assert.equal(success.status, 200); assert.equal(success.data.order_no, record.order_no);
  assert.equal(success.data.refund_amount_minor, record.amount_minor);
  assert.equal(verifySponsorRefundReceipt(success.data, record.order_no, { refund_amount: record.amount_minor }), success.data);
});
