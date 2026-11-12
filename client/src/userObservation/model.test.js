import test from 'node:test';
import assert from 'node:assert/strict';
import { boundedExport, byteLength, DEFAULT_POLICY, expirySeconds, filters, localExpiry, MAX_BYTES, MAX_RECORDS, policyInput, readDay, readExport, readIP, readLegacy, readPage, readPolicy, readRequest, readTarget, readTargetDetail, reason, reasonRevision, revision, shanghaiDay, targetEligible, targetInput, text, TIMEZONE, userId } from './model.js';
import { fixtureIP, fixtureRequest, fixtureTarget, fixtureUser } from './fixture.js';
const now = Date.parse('2026-11-12T16:01:00Z');
const actor = { id: 1, role: 'admin', is_super_admin: true };

test('北京时间日期跨 UTC 日边界；7 天默认、30 天上限与非法日/时间拒绝', () => {
  assert.equal(shanghaiDay(now), '2026-11-13');
  assert.equal(localExpiry(now), '2026-11-20T00:01');
  assert.equal(expirySeconds(localExpiry(now)), now / 1000 + 7 * 86400);
  assert.throws(() => expirySeconds('2026-02-30T10:00'));
  assert.throws(() => expirySeconds('2026-11-12T25:00'));
  assert.throws(() => filters({ day: '2026-02-30' }));
  const input = { observe_ip: true, observe_requests: false, reason: '  排查异常请求  ', revision: '0', unknown: '不转发' };
  assert.deepEqual(targetInput(input, now), { observe_ip: true, observe_requests: false, reason: '排查异常请求', revision: '0', expires_at: now / 1000 + 7 * 86400 });
  assert.throws(() => targetInput({ ...input, expires_at: now / 1000 + 30 * 86400 + 1 }, now));
  assert.throws(() => targetInput({ ...input, expires_at: now / 1000 }, now));
  assert.deepEqual(targetInput({ ...input, observe_ip: false, expires_at: '忽略过期时间' }, now), { observe_ip: false, observe_requests: false, reason: '排查异常请求', revision: '0' });
});

test('目标只允许超管对普通用户；ID1、管理员、本人、未知角色均排除', () => {
  assert.equal(targetEligible(actor, fixtureUser(3)), true);
  for (const target of [{ id: 1, role: 'user' }, { id: 2, role: 'admin' }, { id: 3 }, null]) assert.equal(targetEligible(actor, target), false);
  for (const user of [{ id: 2, role: 'admin' }, { ...actor, is_super_admin: false }, { id: 3, role: 'user' }]) assert.equal(targetEligible(user, fixtureUser(4)), false);
  for (const id of [1, 0, -3, '2?admin=1', '3/requests', NaN]) assert.throws(() => userId(id));
});

test('policy 范围严格 boolean/整数；理由不可空，未知字段不转发', () => {
  const body = policyInput({ ...DEFAULT_POLICY, reason: '  必要排查  ', enable_all_users: true });
  assert.equal(body.reason, '必要排查'); assert.equal(Object.hasOwn(body, 'enable_all_users'), false);
  for (const patch of [{ enabled: 1 }, { retention_days: 31 }, { retention_days: 0 }, { per_user_daily_limit: 20001 }, { global_daily_limit: 100001 }, { global_daily_limit: 1.5 }, { revision: 1 }, { reason: '  ' }]) assert.throws(() => policyInput({ ...DEFAULT_POLICY, reason: '排查', ...patch }));
  for (const value of ['', ' '.repeat(5), 'x'.repeat(501), '理由\n控制字符']) assert.throws(() => reason(value));
});

test('revision 对齐服务端 opaque CAS：初始0、UUID、legacy SHA-256与128字边界原样读写', () => {
  const tokens = ['0', '550e8400-e29b-41d4-a716-446655440000', '040d7dae279b28278ca86e7f9b0f8acf6fc40139682446898dc5bbfe6369c4db', 'Cas_v2-Z', '9'.repeat(128)];
  for (const token of tokens) {
    assert.equal(revision(token), token);
    assert.equal(readPolicy({ policy: { ...DEFAULT_POLICY, revision: token } }).revision, token);
    assert.equal(policyInput({ ...DEFAULT_POLICY, revision: token, reason: '明确复核策略' }).revision, token);
    assert.equal(readTarget({ ...fixtureTarget(), revision: token }).revision, token);
    assert.equal(targetInput({ observe_ip: false, observe_requests: false, reason: '明确停止', revision: token }, now).revision, token);
    assert.equal(readLegacy({ user_id: 3, tracking: false, rule_revision: token, bans: [], truncated: false }).rule_revision, token);
    assert.equal(reasonRevision({ reason: '明确复核来源', revision: token }).revision, token);
  }
});

test('revision 只接受1–128字ASCII token，拒绝类型转换、空白、控制字符与路径符号', () => {
  const bad = [undefined, null, 0, 1, true, {}, [], '', 'x'.repeat(129), '中文', 'v1.2', 'a/b', 'a+b', 'a=b', 'a:b', ' token', 'token ', 'token\n', 'token\r', 'token\t'];
  for (const token of bad) {
    assert.throws(() => revision(token));
    assert.throws(() => readPolicy({ policy: { ...DEFAULT_POLICY, revision: token } }));
    assert.throws(() => reasonRevision({ reason: '明确复核', revision: token }));
  }
});

test('控制字符逐码与首中尾校验：文本仅允许HT/LF/CR，理由不能先trim绕过', () => {
  for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
    const character = String.fromCharCode(code);
    for (const input of [`${character}理由`, `前${character}后`, `理由${character}`]) {
      if ([9, 10, 13].includes(code)) assert.equal(text(input), input);
      else assert.throws(() => text(input), `文本必须拒绝控制码 ${code}`);
      assert.throws(() => reason(input), `理由首中尾必须拒绝控制码 ${code}`);
    }
  }
  for (const input of ['中文理由', 'emoji 🧷', '前 后', String.fromCharCode(128), '多行\n注释\t允许文本']) assert.equal(text(input), input);
  assert.equal(reason('  合法明确理由  '), '合法明确理由');
});

test('筛选 whitelist；limit<=200，状态精确，日期严格；不接受原始路径/私有动作字段', () => {
  assert.deepEqual(filters({ day: '2026-11-13', method: 'POST', status: 403, cursor: 'opaque:1', limit: 200, raw_query: '?token=secret', action: 'read-private-message' }), { day: '2026-11-13', method: 'POST', status: 403, cursor: 'opaque:1', limit: 200 });
  for (const patch of [{ method: 'TRACE' }, { status: '403' }, { status: 600 }, { limit: 201 }, { limit: 0 }, { cursor: 'x'.repeat(4097) }]) assert.throws(() => filters({ day: '2026-11-13', ...patch }));
  assert.deepEqual(filters({ day: '恶意日期', token: 'secret' }, { requireDay: false, allowDay: false, requests: false }), { limit: 50 });
});

test('响应 strict 核心字段；未知隐私字段被剔除，不把错误响应变空成功', () => {
  const request = readRequest({ ...fixtureRequest(), raw_query: 'secret', private_message: 'secret', credentials: 'secret' });
  assert.equal(Object.hasOwn(request, 'raw_query'), false); assert.equal(Object.hasOwn(request, 'private_message'), false);
  assert.throws(() => readRequest({ ...fixtureRequest(), metadata_version: 1 }));
  assert.throws(() => readRequest({ ...fixtureRequest(), duration_ms: null }));
  assert.throws(() => readPage({ timezone: TIMEZONE, next_cursor: null }, readIP));
  assert.throws(() => readPage({ timezone: 'UTC', items: [], next_cursor: null }, readIP));
  assert.throws(() => readPage({ timezone: TIMEZONE, items: [], next_cursor: undefined }, readIP));
  const detail = readTargetDetail({ user: fixtureUser(3), target: null, status: 'not_configured', policy_enabled: false, timezone: TIMEZONE });
  assert.equal(detail.target, null);
  assert.throws(() => readTargetDetail({ target: null, status: 'not_configured', policy_enabled: false, timezone: TIMEZONE }));
  assert.throws(() => readTargetDetail({ user: fixtureUser(3), target: { ...fixtureTarget(), observe_ip: 1 }, status: 'active', policy_enabled: false, timezone: TIMEZONE }));
});

test('逐日覆盖状态必须显式返回；无时间戳的限额日不是没有活动', () => {
  const value = { day: '2026-11-13', accepted_count: 0, request_count: 0, ip_count: 0, first_seen_at: null, last_seen_at: null, limit_reached: true, coverage: 'unknown' };
  assert.equal(readDay(value).coverage, 'unknown'); assert.equal(readDay(value).first_seen_at, null);
  assert.throws(() => readDay({ ...value, coverage: undefined })); assert.throws(() => readDay({ ...value, coverage: 'complete' }));
});

test('导出页 IP 每页必须存在，unknown coverage/缺失字段不假作完整', () => {
  const value = { schema_version: 1, user_id: 3, day: '2026-11-13', timezone: TIMEZONE, generated_at: now / 1000, items: [fixtureRequest()], ips: [fixtureIP()], next_cursor: 'stable:200', truncated: true, coverage: 'recorded', audit_id: 'audit-1' };
  assert.equal(readExport(value).ips.length, 1);
  assert.throws(() => readExport({ ...value, ips: undefined }));
  assert.throws(() => readExport({ ...value, coverage: 'complete' }));
  assert.throws(() => readExport({ ...value, items: Array.from({ length: 201 }, () => fixtureRequest()) }));
});

test('JSON/文本有界计数合计IP+请求，UTF8 1MiB 硬上限，包含元信息与截断', () => {
  const meta = { scope: 'day', day: '2026-11-13', timezone: TIMEZONE, filters: { method: null, status: null }, generatedAt: new Date(now).toISOString(), continuation: { next_cursor: 'opaque' }, coverage: 'limit_reached' };
  const bounded = boundedExport({ ...meta, ips: Array.from({ length: 3000 }, (_, i) => fixtureIP(i)), requests: Array.from({ length: 3000 }, (_, i) => fixtureRequest(i)) });
  assert.ok(bounded.count <= MAX_RECORDS); assert.ok(byteLength(bounded.text) <= MAX_BYTES); assert.equal(bounded.truncated, true);
  const parsed = JSON.parse(bounded.text);
  assert.equal(parsed.record_count, parsed.ip_count + parsed.request_count); assert.equal(parsed.timezone, TIMEZONE); assert.equal(parsed.scope, 'day'); assert.equal(parsed.coverage, 'limit_reached');
  const text = boundedExport({ ...meta, ips: [fixtureIP()], requests: [fixtureRequest()] }, 'text');
  assert.match(text.text, /"generatedAt"/); assert.match(text.text, /\nIP /); assert.match(text.text, /\nREQUEST /);
  assert.ok(byteLength(text.text) <= MAX_BYTES);
});
