import test from 'node:test';
import assert from 'node:assert/strict';
import { accessState, adForm, adPayload, csvCell, defaultDateRange, identityPayload, profilePayload, safeMediaURL, safeURL, sessionKey, statsCSV, toLocalDateTime, validateDateRange } from './model.js';

test('访问状态只依据真实 merchant info，super 无 profile 可运营', () => {
  assert.equal(accessState(null), 'loading');
  assert.equal(accessState({ is_super_admin: true, authorized: false, active: false, profile: null, identity_required: true }), 'ready');
  assert.equal(accessState({ authorized: false, active: false, profile: null }), 'activate');
  assert.equal(accessState({ authorized: true, active: false, profile: { status: 'suspended' } }), 'suspended');
  assert.equal(accessState({ authorized: false, active: true, profile: {} }), 'inactive');
  assert.equal(accessState({ authorized: true, active: true, identity_required: true }), 'identity');
  assert.equal(accessState({ authorized: true, active: true, identity_required: false }), 'ready');
});
test('普通商家提交 canonical 字段，排期转换 UTC，不发送任何 identity override', () => {
  const form = { ...adForm(), title: ' 标题 ', body: ' 正文 ', landing_url: 'https://example.invalid', advertiser_name: '不能覆盖', advertiser_avatar_url: 'https://example.invalid/avatar.png', starts_at: '2026-10-10T12:00', ends_at: '2026-10-11T12:00' };
  const payload = adPayload(form);
  assert.deepEqual(Object.keys(payload).sort(), ['title', 'body', 'landing_url', 'image_url', 'status', 'starts_at', 'ends_at'].sort());
  assert.equal(payload.body, '正文'); assert.equal(payload.title, '标题');
  assert.equal(payload.starts_at, new Date(form.starts_at).toISOString());
  const superPayload = adPayload(form, true);
  assert.equal(superPayload.advertiser_name, '不能覆盖'); assert.equal(superPayload.advertiser_avatar_url, form.advertiser_avatar_url);
  assert.equal('ad_type' in superPayload, false);
});
test('广告状态、图文、链接和排期验证', () => {
  assert.throws(() => adPayload(adForm()), /正文或/);
  assert.throws(() => adPayload({ ...adForm(), body: '内容', status: 'archived' }), /状态无效/);
  assert.throws(() => adPayload({ ...adForm(), title: '标题', body: '内容', landing_url: 'javascript:alert(1)' }), /落地页/);
  assert.throws(() => adPayload({ ...adForm(), title: '标题', image_url: 'http://example.invalid/image.png' }), /HTTPS/);
  assert.throws(() => adPayload({ ...adForm(), title: '标题', body: '内容', starts_at: '2026-10-11T00:00', ends_at: '2026-10-10T00:00' }), /晚于/);
  assert.equal(adPayload({ ...adForm(), title: '标题', image_url: 'https://example.invalid/image.png' }).starts_at, null);
  assert.throws(() => adPayload({ ...adForm(), body: '内容' }), /1–160/);
  assert.throws(() => adPayload({ ...adForm(), title: '标题', body: 'x'.repeat(2001) }), /2000/);
});
test('身份登记一次使用独立 payload，普通 profile 只发送联系字段', () => {
  const form = { code: ' X ', display_name: ' 企业 ', avatar_url: 'https://example.invalid/avatar.png', description: ' 简介 ', contact_name: ' 李 ', contact_email: 'li@example.invalid', website_url: '' };
  assert.deepEqual(identityPayload(form, true), { code: 'X', display_name: '企业', avatar_url: form.avatar_url });
  assert.equal('code' in identityPayload(form), false);
  assert.deepEqual(profilePayload(form), { description: '简介', contact_name: '李', contact_email: form.contact_email, website_url: '' });
  assert.equal(profilePayload(form, true).display_name, '企业');
  assert.throws(() => identityPayload({ ...form, avatar_url: 'http://example.invalid/a.png' }), /HTTPS/);
});
test('UTC 日期包含两端、闰年与最多 93 天', () => {
  assert.deepEqual(defaultDateRange(new Date('2026-10-10T23:59:59Z')), { from: '2026-09-11', to: '2026-10-10' });
  assert.deepEqual(validateDateRange('2026-01-01', '2026-04-03'), { from: '2026-01-01', to: '2026-04-03' });
  assert.throws(() => validateDateRange('2026-01-01', '2026-04-04'), /93/);
  assert.throws(() => validateDateRange('2026-02-29', '2026-03-01'), /有效/);
  assert.throws(() => validateDateRange('2026-10-11', '2026-10-10'), /93/);
  assert.doesNotThrow(() => validateDateRange('2024-02-29', '2024-02-29'));
});
test('CSV 含 BOM、引号转义与 Excel 公式注入防护', () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  for (const value of ['=HYPERLINK("x")', '+1', '-2', '@SUM(1)', '  =1', '\t=1', '\nfoo']) assert.ok(csvCell(value).startsWith('"\''));
  const csv = statsCSV([{ date: '=1', impressions: 3, clicks: 1, ad_count: 1, active_ads: 1 }]);
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes("\"'=1\"")); assert.ok(csv.includes('\r\n'));
});
test('媒体、日期和 session key 不读取前台对象引用或不安全 URL', () => {
  assert.equal(safeURL('https://user:pass@example.invalid'), ''); assert.equal(safeMediaURL('javascript:alert(1)'), '');
  assert.equal(safeMediaURL('http://example.invalid/x.png'), ''); assert.equal(safeMediaURL('https://example.invalid/x.png'), 'https://example.invalid/x.png');
  assert.equal(toLocalDateTime('not a date'), '');
  assert.equal(sessionKey({ id: 7, role: 'user' }, 'a', 'http://127.0.0.1'), sessionKey({ id: 7, role: 'user' }, 'a', 'http://127.0.0.1'));
  assert.notEqual(sessionKey({ id: 7 }, 'a', 'one'), sessionKey({ id: 7 }, 'b', 'one'));
  assert.notEqual(sessionKey({ id: 7 }, 'a', 'one'), sessionKey({ id: 7 }, 'a', 'two'));
});
