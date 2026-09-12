import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, formatPrice, integer, safePurchaseURL, validatePlan, validateConfig, validateStock, renderTemplate, operationKeeper, expirySeconds } from './adminModel.js';
import { createSponsorAdminAPI } from './adminAPI.js';

const mapping = { afdian_plan_id: 'a'.repeat(32), afdian_sku_id: 'b'.repeat(32) };
function purchaseURL() {
  const url = new URL('https://ifdian.net/order/create');
  url.searchParams.set('plan_id', mapping.afdian_plan_id);
  url.searchParams.set('product_type', '1');
  url.searchParams.set('sku', JSON.stringify([{ sku_id: mapping.afdian_sku_id, count: 1 }]));
  return url.href;
}
const plan = () => ({ ...mapping, id: 'test-plan', name: '测试套餐', description: '', version: 1, price_minor: 123, currency: 'CNY', duration_unit: 'day', duration_count: 7, sort_order: 0, enabled: false, purchase_url: purchaseURL() });
const config = () => ({ enabled: false, version: 2, notice_version: 2, center_title: '测试', notice_title: '须知', notice_body: '共 {x} 次，剩余 {a} 次', exhausted_title: '耗尽', exhausted_body: '{reset}', sponsor_exhausted_body: '{reset}', purchase_title: '购买', purchase_steps: ['核对套餐'], free_daily_limit: 2, sponsor_daily_limit: 6, timezone: 'Asia/Shanghai', minimum_read_seconds: 5, default_color_key: 'sample', colors: [{ key: 'sample', name: '测试色', light: '#123456', dark: '#abcdef', permanent_only: false }], benefits: [{ id: 'sample', title: '测试权益', description: '', sort_order: 0, status: 'coming_soon', action: 'none' }] });

test('元转分精确处理两位小数及边界，不接受隐式数值转换', () => {
  for (const [input, expected] of [['0', 0], ['1.9', 190], ['0.29', 29], ['14.90', 1490], ['1000000', 100000000]]) assert.equal(parsePrice(input), expected);
  for (const input of ['', ' ', '-1', '1.001', '1e2', '0x20', 'NaN', 'Infinity', '1,000', '1000000.01', '<b>1</b>']) assert.throws(() => parsePrice(input));
  for (const input of [' ', '1e2', '0x10', [], true, null]) assert.throws(() => integer(input, '数量'));
  assert.equal(formatPrice(190), '¥1.90');
});
test('购买 URL 拒绝 HTML、伪域名、凭据、重定向、重复参数和 SKU 篡改', () => {
  assert.ok(safePurchaseURL(purchaseURL(), mapping));
  const attacks = [purchaseURL().replace('https:', 'javascript:'), purchaseURL().replace('ifdian.net', 'ifdian.net.evil.test'), purchaseURL().replace('https://', 'https://user:pass@'), `${purchaseURL()}#x`, `${purchaseURL()}&product_type=2`, `${purchaseURL()}&redirect=https://evil.test`, `<a href="${purchaseURL()}">购买</a>`, purchaseURL().replace(mapping.afdian_plan_id, 'c'.repeat(32)), purchaseURL().replace('order/create', 'order/other')];
  for (const value of attacks) assert.equal(safePurchaseURL(value, mapping), null);
  const url = new URL(purchaseURL()); url.searchParams.set('sku', JSON.stringify([{ sku_id: mapping.afdian_sku_id, count: 2 }]));
  assert.equal(safePurchaseURL(url.href, mapping), null);
});
test('套餐支持全空购买映射，不允许部分配置或非法时长', () => {
  assert.equal(validatePlan(plan()).price_minor, 123);
  assert.doesNotThrow(() => validatePlan({ ...plan(), purchase_url: '', afdian_plan_id: '', afdian_sku_id: '' }));
  assert.throws(() => validatePlan({ ...plan(), purchase_url: '' }));
  assert.throws(() => validatePlan({ ...plan(), duration_unit: 'permanent', duration_count: 1 }));
  assert.throws(() => validatePlan({ ...plan(), duration_unit: 'month', duration_count: 121 }));
});
test('配置约束与后端对齐，额度变更要求须知版本递增', () => {
  const initial = config();
  assert.doesNotThrow(() => validateConfig(initial, initial));
  assert.throws(() => validateConfig({ ...initial, free_daily_limit: 3 }, initial));
  assert.doesNotThrow(() => validateConfig({ ...initial, free_daily_limit: 3, notice_version: 3 }, initial));
  assert.throws(() => validateConfig({ ...initial, colors: [{ ...initial.colors[0], permanent_only: true }] }));
  assert.throws(() => validateConfig({ ...initial, benefits: [{ ...initial.benefits[0], action: 'claim' }] }));
  assert.throws(() => validateConfig({ ...initial, sponsor_daily_limit: 1 }));
});
test('HTML 文案保持纯文本；不解释 HTML 或未授权模板', () => {
  assert.equal(renderTemplate('<img src=x onerror=alert(1)> {x}', { x: '<script>x</script>' }), '<img src=x onerror=alert(1)> <script>x</script>');
  assert.throws(() => renderTemplate('{unknown}', {}));
});
test('库存只发送可编辑字段，剔除客户端伪造的证据与验证开关', () => {
  const setting = { enabled: false, low_water: 1, target_stock: 10, batch_size: 2, check_interval_seconds: 300 };
  assert.deepEqual(validateStock({ ...setting, verified: true, can_refill: true, paused: false, token: 'do-not-send' }), setting);
  assert.throws(() => validateStock({ ...setting, check_interval_seconds: 299 }));
  assert.throws(() => validateStock({ ...setting, target_stock: 201 }));
});
test('未知结果沿用 operation UUID，禁止改参数绕过重试门禁', () => {
  let next = 0; const keeper = operationKeeper(() => `operation-${++next}`);
  const first = keeper.get('user', { count: 1, reason: '测试' });
  assert.equal(keeper.get('user', { reason: '测试', count: 1 }), first);
  assert.throws(() => keeper.get('user', { count: 2, reason: '测试' }));
  assert.throws(() => keeper.get('user', { count: 1, reason: '改动' }));
  keeper.done('user'); assert.notEqual(keeper.get('user', { count: 1, reason: '测试' }), first);
});
test('未来到期时间转为秒，拒绝过去与非法日期', () => {
  assert.equal(expirySeconds('2030-01-01T00:00:00Z', 0), 1893456000);
  assert.equal(expirySeconds(''), undefined);
  assert.throws(() => expirySeconds('invalid'));
  assert.throws(() => expirySeconds('2000-01-01T00:00:00Z'));
});
test('API 使用注入的当前会话，禁用缓存并携带 cookie，详情路径正确', async () => {
  let token = 'account-A'; const calls = [];
  const api = createSponsorAdminAPI({ getToken: () => token, fetcher: async (url, options) => { calls.push({ url, options }); return Response.json({ sponsor: { active: false }, quota: { remaining: 0 } }); } });
  await api.user(42); token = 'account-B'; await api.user(43);
  assert.equal(calls[0].url, '/api/admin/sponsors/users/42');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer account-A');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer account-B');
  assert.equal(calls[0].options.credentials, 'include'); assert.equal(calls[0].options.cache, 'no-store');
});
test('过期会话阻止请求和旧响应，绝不回退假数据', async () => {
  let called = false;
  const stale = createSponsorAdminAPI({ isCurrentSession: () => false, fetcher: async () => { called = true; } });
  await assert.rejects(stale.plans(), /会话已切换/); assert.equal(called, false);
  let current = true;
  const changed = createSponsorAdminAPI({ isCurrentSession: () => current, fetcher: async () => { current = false; return Response.json({ items: [] }); } });
  await assert.rejects(changed.plans(), /忽略旧账户响应/);
});
test('API 显式呈现版本冲突、未登录和无权访问', async () => {
  for (const [status, expression] of [[409, /冲突/], [401, /登录已过期/], [403, /管理员权限/]]) {
    const api = createSponsorAdminAPI({ fetcher: async () => Response.json({ code: 'test', error: 'test' }, { status }) });
    await assert.rejects(api.plans(), error => error.status === status && error.definitive && expression.test(error.message));
  }
});
test('API 网络失败和无效响应不被视为成功，无自动写入重试', async () => {
  let calls = 0;
  const api = createSponsorAdminAPI({ fetcher: async () => { calls++; throw new TypeError('network'); } });
  await assert.rejects(api.createBatch({ count: 1 }), /先核查状态/); assert.equal(calls, 1);
  const invalid = createSponsorAdminAPI({ fetcher: async () => Response.json({ items: 'not-array' }) });
  await assert.rejects(invalid.plans(), /契约不一致/);
});
