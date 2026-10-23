import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import {
  validateCatalog, validateMe, validateHistory, isActiveSponsor, safeSponsorPurchaseURL,
  planDuration, formatBytes, formatSponsorTime, redemptionOperation, createForegroundReadTimer,
} from './userModel.js';

const mapping = { afdian_plan_id: 'a'.repeat(32), afdian_sku_id: 'b'.repeat(32) };
function purchaseURL() {
  const url = new URL('https://ifdian.net/order/create');
  url.searchParams.set('product_type', '1');
  url.searchParams.set('plan_id', mapping.afdian_plan_id);
  url.searchParams.set('sku', JSON.stringify([{ sku_id: mapping.afdian_sku_id, count: 1 }]));
  return url.href;
}
const plan = () => ({ ...mapping, id: 'monthly', version: 1, name: '月度套餐', description: '', price_minor: 1234, currency: 'CNY', duration_unit: 'month', duration_count: 1, sort_order: 0, enabled: true, purchase_url: purchaseURL() });
const catalog = () => ({ config: {
  enabled: true, version: 2, center_title: '赞助中心', free_daily_limit: 2, sponsor_daily_limit: 6,
  timezone: 'Asia/Shanghai', notice_version: 1, notice_title: '赞助须知', notice_body: '剩余 {a} 次',
  exhausted_title: '今日额度耗尽', exhausted_body: '{reset}', sponsor_exhausted_body: '{reset}',
  purchase_title: '购买套餐', purchase_steps: ['阅读须知', '购买后兑换'], minimum_read_seconds: 5,
  default_color_key: 'blue', colors: [{ key: 'blue', name: '蓝色', light: '#123456', dark: '#aBcDeF', permanent_only: false }],
  benefits: [{ id: 'gift', title: '可领取权益', description: '', status: 'available', action: 'claim', sort_order: 0 }],
}, plans: [plan()] });
const me = () => ({ sponsor: { active: true, permanent: false, expires_at: 2000000000, plan_name: '月度套餐', color_key: 'blue', color_light: '#123456', color_dark: '#abcdef' }, quota: { limit: 6, used: 2, remaining: 4, resets_at: 2000000100, day_key: '2026-10-24' }, config_version: 2, notice_required: true, claimed_benefit_ids: ['gift'] });
const history = () => ({ items: [{ id: 'sponsor_operation:redeem:123', plan_name: '月度套餐', redeemed_at: 1800000000, expires_at: 2000000000, permanent: false }], total: 1 });
function memoryStorage(values = new Map()) {
  return { values, writes: 0, getItem(key) { return values.has(key) ? values.get(key) : null; }, setItem(key, value) { this.writes++; values.set(key, value); } };
}
const chineseError = error => error instanceof Error && /[\u3400-\u9fff]/u.test(error.message);

// 每个字段只规范化，不以客户端默认值替代后端配置。
test('catalog 规范化并保留顶层、配置、颜色、权益和套餐的扩展字段，不修改原对象', () => {
  const input = catalog();
  input.extra = { next: true }; input.config.extra = '配置扩展';
  input.config.colors[0].extra = '颜色扩展'; input.config.benefits[0].extra = '权益扩展';
  Object.assign(input.plans[0], { extra: '套餐扩展', amount: 1234, id: ' monthly ', price_minor: '1234' });
  const before = structuredClone(input);
  const result = validateCatalog(input);
  assert.deepEqual(input, before);
  assert.equal(result.plans[0].id, 'monthly'); assert.equal(result.plans[0].price_minor, 1234);
  assert.equal(result.plans[0].amount, 1234); assert.deepEqual(result.extra, { next: true });
  assert.equal(result.config.extra, '配置扩展'); assert.equal(result.config.colors[0].extra, '颜色扩展');
  assert.equal(result.config.benefits[0].extra, '权益扩展'); assert.equal(result.plans[0].extra, '套餐扩展');
});
test('catalog 空购买链接、部分购买映射及不安全链接不破坏可展示套餐', () => {
  for (const purchase_url of ['', 'https://evil.test/order/create']) {
    const input = catalog(); input.plans[0].purchase_url = purchase_url;
    const result = validateCatalog(input);
    assert.equal(result.plans[0].purchase_url, purchase_url);
    assert.equal(safeSponsorPurchaseURL(result.plans[0]), null);
  }
  const input = catalog(); input.plans[0].afdian_sku_id = '';
  assert.equal(safeSponsorPurchaseURL(validateCatalog(input).plans[0]), null);
  assert.deepEqual(validateCatalog({ ...catalog(), plans: [] }).plans, []);
});
test('catalog 拒绝损坏结构、错误类型、不安全标识和越界配置', () => {
  const mutations = [
    x => { x.config = null; }, x => { x.plans = {}; }, x => { x.plans = [null]; },
    x => { x.config.enabled = 'true'; }, x => { x.config.version = 0; },
    x => { x.config.timezone = 'UTC'; }, x => { x.config.minimum_read_seconds = 4; },
    x => { x.config.minimum_read_seconds = 301; }, x => { x.config.sponsor_daily_limit = 1; },
    x => { x.config.free_daily_limit = 100001; }, x => { x.config.colors = []; },
    x => { x.config.colors[0].light = 'red'; }, x => { x.config.colors[0].permanent_only = 'false'; },
    x => { x.config.colors[0].key = '../blue'; }, x => { x.config.default_color_key = 'missing'; },
    x => { x.config.colors[0].permanent_only = true; }, x => { x.config.benefits[0].id = ''; },
    x => { x.config.benefits[0].action = 'redirect'; }, x => { x.config.benefits[0].status = 'coming_soon'; },
    x => { x.config.benefits[0].description = {}; }, x => { x.config.purchase_steps = []; },
    x => { x.config.notice_body = '{unsafe}'; }, x => { x.config.center_title = 'x'.repeat(101); },
    x => { x.plans[0].id = '../monthly'; }, x => { x.plans[0].version = 0; },
    x => { x.plans[0].price_minor = 1.5; }, x => { x.plans[0].price_minor = '1e2'; },
    x => { x.plans[0].currency = 'USD'; }, x => { x.plans[0].duration_unit = 'year'; },
    x => { x.plans[0].duration_count = 121; }, x => { x.plans[0].duration_unit = 'permanent'; },
    x => { x.plans[0].enabled = 1; }, x => { x.plans[0].sort_order = 10001; },
  ];
  for (const mutate of mutations) { const input = catalog(); mutate(input); assert.throws(() => validateCatalog(input), chineseError); }
  for (const input of [null, [], 'catalog', {}, { config: [], plans: [] }]) assert.throws(() => validateCatalog(input), chineseError);
});
test('catalog 对齐颜色20、权益30、套餐200的上限和标识唯一约束', () => {
  const input = catalog();
  input.config.colors = Array.from({ length: 20 }, (_, n) => ({ ...input.config.colors[0], key: `color_${n}` }));
  input.config.default_color_key = 'color_0';
  input.config.benefits = Array.from({ length: 30 }, (_, n) => ({ ...input.config.benefits[0], id: `benefit_${n}` }));
  input.plans = Array.from({ length: 200 }, (_, n) => ({ ...plan(), id: `plan_${n}` }));
  assert.equal(validateCatalog(input).plans.length, 200);
  for (const target of [input.config.colors, input.config.benefits, input.plans]) {
    target.push({ ...target[0] }); assert.throws(() => validateCatalog(input), chineseError); target.pop();
    const original = target[1]; target[1] = { ...target[0] }; assert.throws(() => validateCatalog(input), /重复/); target[1] = original;
  }
});
test('购买 URL 严格核验商品和单个SKU，支持可选 viokrz_ex=0', () => {
  assert.equal(safeSponsorPurchaseURL(plan()), purchaseURL());
  const url = new URL(purchaseURL()); url.searchParams.set('viokrz_ex', '0');
  assert.equal(safeSponsorPurchaseURL({ ...plan(), purchase_url: url.href }), url.href);
  url.searchParams.set('viokrz_ex', '1'); assert.equal(safeSponsorPurchaseURL({ ...plan(), purchase_url: url.href }), null);
  assert.equal(safeSponsorPurchaseURL(null), null);
});
test('购买 URL 拒绝域名、协议、路径、凭据、fragment和query污染', () => {
  const source = purchaseURL();
  const attacks = [
    '', ` ${source}`, `${source}\n`, source.replace('https:', 'http:'), source.replace('https:', 'javascript:'),
    source.replace('ifdian.net', 'ifdian.net.evil.test'), source.replace('ifdian.net', 'ifdian.net:443'),
    source.replace('https://', 'https://user:pass@'), source.replace('https://', 'https://@'),
    source.replace('/order/create', '/order/../order/create'), source.replace('/order/create', '/order/other'),
    `${source}#`, `${source}#x`, `${source}&redirect=https://evil.test`, `${source}&plan_id=${mapping.afdian_plan_id}`,
    `${source}&product_type=1`, `${source}&sku=x`, `${source}&viokrz_ex=0&viokrz_ex=0`, `${source}&viokrz_ex=`,
    `${source}&`, source.replace('plan_id=', 'plan%5fid='), source.replace('ifdian.net/', 'ifdian.net\\'),
    `<a href="${source}">购买</a>`, source.replace(mapping.afdian_plan_id, 'c'.repeat(32)),
  ];
  for (const purchase_url of attacks) assert.equal(safeSponsorPurchaseURL({ ...plan(), purchase_url }), null, purchase_url);
  assert.equal(safeSponsorPurchaseURL({ ...plan(), afdian_plan_id: 'not-hex' }), null);
  assert.equal(safeSponsorPurchaseURL({ ...plan(), afdian_sku_id: '' }), null);
});
test('购买 URL 拒绝缺参、非数字count、重复JSON成员、多SKU及SKU额外字段', () => {
  for (const key of ['product_type', 'plan_id', 'sku']) {
    const url = new URL(purchaseURL()); url.searchParams.delete(key);
    assert.equal(safeSponsorPurchaseURL({ ...plan(), purchase_url: url.href }), null);
  }
  const invalid = [
    [], {}, null, [{ sku_id: mapping.afdian_sku_id, count: '1' }], [{ sku_id: mapping.afdian_sku_id, count: 2 }],
    [{ sku_id: mapping.afdian_sku_id, count: 1, redirect: 'evil' }], [{ sku_id: 'c'.repeat(32), count: 1 }],
    [{ sku_id: mapping.afdian_sku_id, count: 1 }, { sku_id: mapping.afdian_sku_id, count: 1 }],
  ].map(value => JSON.stringify(value));
  invalid.push('broken-json', `[{"sku_id":"${mapping.afdian_sku_id}","count":2,"count":1}]`);
  for (const sku of invalid) {
    const url = new URL(purchaseURL()); url.searchParams.set('sku', sku);
    assert.equal(safeSponsorPurchaseURL({ ...plan(), purchase_url: url.href }), null);
  }
});
test('me 保留扩展字段、数字规范化、message及可选album缺失/null，不伪造免费额度', () => {
  const input = me(); input.extra = true; input.sponsor.extra = '状态'; input.quota.extra = '额度'; input.quota.used = '2'; input.message = '兑换成功';
  const before = structuredClone(input); const result = validateMe(input);
  assert.deepEqual(input, before); assert.equal(result.quota.used, 2); assert.equal(result.quota.extra, '额度');
  assert.equal(result.sponsor.extra, '状态'); assert.equal(result.extra, true); assert.equal(result.message, '兑换成功');
  assert.equal(Object.hasOwn(result, 'album_quota'), false);
  assert.equal(validateMe({ ...me(), album_quota: null }).album_quota, null);
  const album_quota = { limit_bytes: '2048', used_bytes: 1024, reserved_bytes: 256, remaining_bytes: 768, tier: 'sponsor', sponsor_active: true, original_upload_allowed: true, extra: '相册扩展' };
  const album = validateMe({ ...me(), album_quota }).album_quota;
  assert.equal(album.limit_bytes, 2048); assert.equal(album.extra, '相册扩展');
});
test('普通及失效账号允许空套餐和null颜色，保留真实失效状态及超额used', () => {
  for (const expires_at of [null, 1700000000]) {
    const input = me();
    Object.assign(input.sponsor, { active: false, permanent: false, expires_at, plan_name: null, color_key: null, color_light: null, color_dark: null });
    input.quota = { ...input.quota, limit: 2, used: 4, remaining: 0 };
    const result = validateMe(input);
    assert.deepEqual(result.sponsor, input.sponsor); assert.equal(isActiveSponsor(result.sponsor), false);
    assert.equal(result.quota.used, 4); assert.equal(result.quota.remaining, 0);
  }
});
test('me 拒绝坏schema、无效日历日期、错误额度和错误album类型', () => {
  const mutations = [
    x => { x.sponsor = null; }, x => { x.sponsor.active = 'true'; }, x => { x.sponsor.permanent = 0; },
    x => { x.sponsor.expires_at = '2000000000'; }, x => { x.sponsor.color_light = '#fff'; },
    x => { delete x.sponsor.color_dark; }, x => { x.sponsor.plan_name = {}; },
    x => { x.quota.limit = -1; }, x => { x.quota.used = NaN; }, x => { x.quota.remaining = 3; },
    x => { x.quota.resets_at = 0; }, x => { x.quota.day_key = '2026-02-29'; },
    x => { x.quota.day_key = '2024-02-30'; }, x => { x.quota.day_key = '2026-13-01'; },
    x => { x.quota.day_key = '0000-01-01'; }, x => { x.quota.day_key = '2026-1-01'; },
    x => { x.config_version = 0; }, x => { x.notice_required = null; },
    x => { x.claimed_benefit_ids = ['gift', 'gift']; }, x => { x.claimed_benefit_ids = ['../gift']; },
    x => { x.claimed_benefit_ids = Array.from({ length: 31 }, (_, i) => `id_${i}`); },
    x => { x.album_quota = {}; }, x => { x.album_quota = undefined; }, x => { x.message = null; },
  ];
  for (const mutate of mutations) { const input = me(); mutate(input); assert.throws(() => validateMe(input), chineseError); }
  const valid = me(); valid.quota.day_key = '2024-02-29'; assert.doesNotThrow(() => validateMe(valid));
});
test('album 字节额度必须是安全非负整数，权限必须是布尔值', () => {
  const album = { limit_bytes: 1024, used_bytes: 512, reserved_bytes: 0, remaining_bytes: 512, tier: 'free', sponsor_active: false, original_upload_allowed: false };
  for (const [key, value] of [['used_bytes', -1], ['reserved_bytes', 0.5], ['limit_bytes', Number.MAX_SAFE_INTEGER + 1], ['remaining_bytes', 2048], ['sponsor_active', 1], ['original_upload_allowed', 'false'], ['tier', '']]) {
    assert.throws(() => validateMe({ ...me(), album_quota: { ...album, [key]: value } }), chineseError);
  }
});
test('history 保留带前缀记录id、永久null到期及扩展字段，不修改原数据', () => {
  const input = history(); input.extra = true; input.items[0].extra = '记录扩展'; input.items[0].permanent = true; input.items[0].expires_at = null; input.total = '1';
  const before = structuredClone(input); const result = validateHistory(input);
  assert.deepEqual(input, before); assert.equal(result.total, 1); assert.equal(result.items[0].id, 'sponsor_operation:redeem:123');
  assert.equal(result.items[0].expires_at, null); assert.equal(result.items[0].extra, '记录扩展'); assert.equal(result.extra, true);
  assert.deepEqual(validateHistory({ items: [], total: 0 }), { items: [], total: 0 });
});
test('history 拒绝损坏列表、重复记录、无效时间及错误总数', () => {
  const mutations = [x => { x.items = {}; }, x => { x.items = [null]; }, x => { x.items[0].id = ''; }, x => { x.items[0].id = 'x'.repeat(201); }, x => { x.items[0].redeemed_at = -1; }, x => { x.items[0].expires_at = Infinity; }, x => { x.items[0].permanent = 'true'; }, x => { x.total = 0; }, x => { x.items.push({ ...x.items[0] }); x.total = 2; }];
  for (const mutate of mutations) { const input = history(); mutate(input); assert.throws(() => validateHistory(input), chineseError); }
});
test('isActiveSponsor 同时核验active和当前秒时间，不把过期或未知状态当有效', () => {
  const sponsor = me().sponsor;
  assert.equal(isActiveSponsor(sponsor, 1999999999), true); assert.equal(isActiveSponsor(sponsor, 2000000000), false);
  assert.equal(isActiveSponsor({ ...sponsor, active: false, permanent: true }, 0), false);
  assert.equal(isActiveSponsor({ ...sponsor, permanent: true, expires_at: null }, 2100000000), true);
  for (const value of [null, {}, { ...sponsor, expires_at: null }, { ...sponsor, expires_at: '2000000000' }, { ...sponsor, active: 'true' }]) assert.equal(isActiveSponsor(value, 0), false);
  assert.equal(isActiveSponsor(sponsor, NaN), false);
});
test('时长、字节、上海秒时间格式不隐式解释坏数据', () => {
  assert.equal(planDuration(plan()), '1 个月'); assert.equal(planDuration({ duration_unit: 'day', duration_count: 7 }), '7 天');
  assert.equal(planDuration({ duration_unit: 'permanent', duration_count: 0 }), '永久'); assert.equal(planDuration({ duration_unit: 'day', duration_count: 0 }), '—');
  for (const [n, expected] of [[0, '0 B'], [1024, '1 KB'], [1536, '1.5 KB'], [1048576, '1 MB'], [1073741824, '1 GB']]) assert.equal(formatBytes(n), expected);
  for (const value of [null, undefined, '1024', -1, NaN, Infinity]) assert.equal(formatBytes(value), '—');
  const time = formatSponsorTime(0); assert.match(time, /1970.*01.*01/u); assert.match(time, /08:00:00/u);
  for (const value of [null, undefined, '0', -1, Infinity]) assert.equal(formatSponsorTime(value), '—');
});
test('兑换规范化去除空白转大写，同scope最新同码跨重建复用UUID', async () => {
  const storage = memoryStorage();
  const first = await redemptionOperation('account:1', ' a b\n-c\t123 ', { storage, cryptoImpl: webcrypto });
  assert.equal(first.code, 'AB-C123'); assert.match(first.operation_id, /^[0-9a-f-]{36}$/i);
  const rebuilt = memoryStorage(new Map(storage.values));
  const retry = await redemptionOperation('account:1', 'ab-c123', { storage: rebuilt, cryptoImpl: webcrypto });
  assert.deepEqual(retry, first); assert.equal(storage.writes, 1); assert.equal(rebuilt.writes, 0);
});
test('持久化仅scope SHA256 key及规范化码SHA256和UUID，不写明码、scope或token', async () => {
  const storage = memoryStorage(); const scope = 'user:42:session-not-a-token';
  const result = await redemptionOperation(scope, 'test-code', { storage, cryptoImpl: webcrypto });
  const [[key, value]] = storage.values;
  assert.equal(key, `sponsor:redemption:v1:${createHash('sha256').update(scope).digest('hex')}`);
  assert.deepEqual(JSON.parse(value), { code_hash: createHash('sha256').update('TEST-CODE').digest('hex'), operation_id: result.operation_id });
  for (const secret of [scope, 'test-code', 'TEST-CODE', 'token']) assert.equal(`${key}${value}`.includes(secret), false);
});
test('兑换操作隔离账号并只复用该scope最新同码，切码后生成新UUID', async () => {
  const storage = memoryStorage(); const options = { storage, cryptoImpl: webcrypto };
  const a = await redemptionOperation('A', 'code-one', options); const b = await redemptionOperation('B', 'code-one', options);
  assert.notEqual(a.operation_id, b.operation_id); assert.deepEqual(await redemptionOperation('A', 'CODE-ONE', options), a);
  const newer = await redemptionOperation('A', 'code-two', options); assert.notEqual(newer.operation_id, a.operation_id);
  const oldCodeAgain = await redemptionOperation('A', 'code-one', options); assert.notEqual(oldCodeAgain.operation_id, a.operation_id);
  assert.equal(storage.values.size, 2);
});
test('同scope同码并行准备只写入一次且返回同一操作标识', async () => {
  const storage = memoryStorage();
  const results = await Promise.all(Array.from({ length: 8 }, () => redemptionOperation('A', 'code', { storage, cryptoImpl: webcrypto })));
  assert.equal(new Set(results.map(x => x.operation_id)).size, 1); assert.equal(storage.writes, 1);
});
test('兑换码空/超过100/错误类型及空scope在持久化前拒绝', async () => {
  const storage = memoryStorage(); const options = { storage, cryptoImpl: webcrypto };
  for (const code of ['', ' \n\t\u3000', 'a'.repeat(101), null, 12]) await assert.rejects(redemptionOperation('A', code, options), chineseError);
  await assert.rejects(redemptionOperation('', 'CODE', options), chineseError);
  assert.equal(storage.writes, 0);
  assert.equal((await redemptionOperation('A', 'a'.repeat(100), options)).code.length, 100);
});
test('读取、写入、回读或数据损坏均失败关闭，不回退临时UUID', async () => {
  const badStores = [
    null,
    { getItem() { throw new Error('denied'); }, setItem() {} },
    { getItem() { return null; }, setItem() { throw new Error('quota'); } },
    { getItem() { return null; }, setItem() {} },
    { getItem() { return '{bad-json'; }, setItem() { assert.fail('不覆盖坏记录'); } },
    { getItem() { return JSON.stringify({ code_hash: 'a'.repeat(64), operation_id: 'not-uuid' }); }, setItem() { assert.fail('不覆盖坏记录'); } },
  ];
  for (const storage of badStores) await assert.rejects(redemptionOperation('A', 'CODE', { storage, cryptoImpl: webcrypto }), /尚未提交兑换/u);
});
test('加密不可用或UUID非法时不持久化，存储恢复后可重试', async () => {
  const storage = memoryStorage();
  for (const cryptoImpl of [null, {}, { subtle: webcrypto.subtle, randomUUID: () => 'bad' }]) await assert.rejects(redemptionOperation('A', 'CODE', { storage, cryptoImpl }), /尚未提交兑换/u);
  assert.equal(storage.writes, 0);
  let failing = true;
  const recoverable = { getItem: key => storage.getItem(key), setItem(key, value) { if (failing) throw new Error('denied'); storage.setItem(key, value); } };
  await assert.rejects(redemptionOperation('A', 'CODE', { storage: recoverable, cryptoImpl: webcrypto }), /尚未提交兑换/u);
  failing = false; const result = await redemptionOperation('A', 'CODE', { storage: recoverable, cryptoImpl: webcrypto });
  assert.deepEqual(await redemptionOperation('A', 'code', { storage: recoverable, cryptoImpl: webcrypto }), result);
});
test('前台计时初始暂停，重复激活不重置，后台和离线时间不累计', () => {
  let time = 0; const timer = createForegroundReadTimer({ now: () => time, requiredSeconds: 5 });
  time = 10000; assert.equal(timer.elapsedSeconds(), 0); assert.equal(timer.complete(), false);
  timer.setActive(true); time += 2000; timer.setActive(true); assert.equal(timer.elapsedSeconds(), 2);
  timer.setActive(false); time += 60000; timer.setActive(false); assert.equal(timer.elapsedSeconds(), 2);
  timer.setActive(true); time += 2999; assert.equal(timer.complete(), false); time++; assert.equal(timer.complete(), true);
  timer.setActive(false); assert.equal(timer.elapsedSeconds(), 5);
});
test('前台计时reset保留前台状态，暂停reset不启动计时，单调时钟回退不负累计', () => {
  let time = 1000; const timer = createForegroundReadTimer({ now: () => time, requiredSeconds: 2 });
  timer.setActive(true); time = 2500; assert.equal(timer.elapsedSeconds(), 1.5);
  time = 2000; assert.equal(timer.elapsedSeconds(), 1.5); time = 3000; assert.equal(timer.complete(), true);
  timer.reset(); assert.equal(timer.elapsedSeconds(), 0); time = 4000; assert.equal(timer.elapsedSeconds(), 1);
  timer.setActive(false); timer.reset(); time = 10000; assert.equal(timer.elapsedSeconds(), 0);
  assert.throws(() => createForegroundReadTimer({ requiredSeconds: NaN }), /阅读时长/u);
  assert.throws(() => timer.setActive('true'), /布尔值/u);
});
