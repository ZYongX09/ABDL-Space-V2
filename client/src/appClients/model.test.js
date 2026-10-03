import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppClientsAPI } from './api.js';
import { createAppClientsFixture } from './fixture.js';
import { APP_POLICY_SETTING_KEY, createRequestGate, DEFAULT_APP_POLICY, exactCount, normalizeVersionCodes, policyPayload, readPolicy, readStats, readUsers, usersQuery } from './model.js';

test('策略默认关闭，独立未知版本开关与明确废弃列表归一化', () => {
  assert.equal(APP_POLICY_SETTING_KEY, 'app_client_policy');
  assert.equal(DEFAULT_APP_POLICY.enabled, false);
  assert.equal(DEFAULT_APP_POLICY.block_unversioned, false);
  assert.deepEqual(normalizeVersionCodes(' 003, 2，3\n1；2、1 '), [1, 2, 3]);
  assert.deepEqual(policyPayload({ ...DEFAULT_APP_POLICY, block_unversioned: true, versionText: '', update_message: ' 更新提示 ' }), { enabled: false, deprecated_version_codes: [], block_unversioned: true, update_message: '更新提示' });
  for (const invalid of ['0', '-1', '1.5', '1e2', '1.0', 'v100', '2147483648', 'NaN', '+3']) assert.throws(() => normalizeVersionCodes(invalid));
  assert.throws(() => normalizeVersionCodes(Array.from({ length: 201 }, (_, i) => i + 1)));
  assert.equal(normalizeVersionCodes('2147483647')[0], 2147483647);
  assert.throws(() => policyPayload({ ...DEFAULT_APP_POLICY, update_message: '  ' }));
  assert.throws(() => policyPayload({ ...DEFAULT_APP_POLICY, update_message: '字'.repeat(2001) }));
  assert.throws(() => readPolicy({ ...DEFAULT_APP_POLICY, enabled: 'false' }));
});

test('API 使用专用路径、完整四字段 PUT 与 URL 编码；传递取消信号', async () => {
  const fixture = createAppClientsFixture();
  const calls = [];
  const api = createAppClientsAPI(async (path, options = {}) => {
    calls.push({ path, options });
    const url = new URL(path, 'http://localhost');
    return fixture.respond(url.pathname, options.method || 'GET', url.searchParams, options.body ? JSON.parse(options.body) : null).data;
  });
  const signal = new AbortController().signal;
  await api.appClientPolicy({ signal });
  const saved = await api.saveAppClientPolicy({ ...DEFAULT_APP_POLICY, versionText: '2,1,2' }, { signal });
  assert.deepEqual(saved.deprecated_version_codes, [1, 2]);
  assert.equal(calls[1].path, '/api/admin/app-clients/policy');
  assert.equal(calls[1].options.method, 'PUT');
  assert.equal(calls[1].options.signal, signal);
  assert.equal(calls[1].options.cache, 'no-store');
  assert.deepEqual(Object.keys(JSON.parse(calls[1].options.body)).sort(), ['block_unversioned', 'deprecated_version_codes', 'enabled', 'update_message']);
  await api.appClientUsers({ version_code: 'missing', q: ' 名字 & ? ', page: 2 }, { signal });
  const query = new URL(calls[2].path, 'http://localhost').searchParams;
  assert.equal(query.get('version_code'), 'missing'); assert.equal(query.get('q'), '名字 & ?'); assert.equal(query.get('page'), '2'); assert.equal(query.get('limit'), '20');
  await api.appClientStats({ signal });
  assert.equal(calls[3].path, '/api/admin/app-clients/stats');
  assert.throws(() => usersQuery({ version_code: '0' }));
  assert.throws(() => usersQuery({ page: -1 }));
  assert.equal(new URLSearchParams(usersQuery({ version_code: '001' })).get('version_code'), '1');
});

test('错误与不可用不伪装成零；统计按账号去重，版本行和未知版本可以重叠', () => {
  const fixture = createAppClientsFixture();
  const stats = readStats(fixture.respond('/api/admin/app-clients/stats', 'GET').data);
  assert.equal(stats.totals.observed_users, 46);
  assert.equal(stats.totals.versioned_users, 42);
  assert.equal(stats.totals.unversioned_users, 6);
  assert.ok(stats.totals.versioned_users + stats.totals.unversioned_users > stats.totals.observed_users);
  assert.ok(stats.versions.reduce((sum, row) => sum + row.observed_users, 0) > stats.totals.observed_users);
  assert.equal(stats.versions.reduce((sum, row) => sum + row.latest_users, 0), stats.totals.observed_users);
  fixture.setScenario('unavailable');
  assert.equal(fixture.respond('/api/admin/app-clients/policy', 'GET').status, 503);
  assert.equal(readStats(fixture.respond('/api/admin/app-clients/stats', 'GET').data).available, false);
  fixture.setScenario('empty');
  assert.equal(readStats(fixture.respond('/api/admin/app-clients/stats', 'GET').data).totals.observed_users, 0);
  assert.equal(exactCount(0), '0'); assert.equal(exactCount(undefined), '—');
  assert.throws(() => readStats({ available: true, totals: {}, versions: [] }));
  assert.throws(() => readUsers({}));
});

test('全部列表只含最近版本；指定/未上报为历史配对；可搜索分页', () => {
  const fixture = createAppClientsFixture();
  const get = params => readUsers(fixture.respond('/api/admin/app-clients/users', 'GET', new URLSearchParams(params)).data);
  const all = get({ version_code: 'all', page: '1', limit: '100' });
  assert.equal(all.users.length, 46); assert.equal(new Set(all.users.map(row => row.id)).size, 46);
  assert.equal(all.users.find(row => row.id === 1).version_code, 200);
  const old = get({ version_code: '100', page: '1', limit: '20' });
  assert.equal(old.pagination.total, 26); assert.equal(old.pagination.totalPages, 2);
  assert.ok(old.users.find(row => row.id === 1));
  assert.equal(get({ version_code: '100', page: '2', limit: '20' }).users.length, 6);
  assert.equal(get({ version_code: 'missing', page: '1', limit: '20' }).pagination.total, 6);
  assert.equal(get({ version_code: 'all', q: 'fixture_01', limit: '20' }).users[0].version_code, 200);
  assert.equal(get({ q: '不存在' }).pagination.total, 0);
});

test('最后请求赢，旧成功/失败、卸载和账户切换的反馈失效', async () => {
  const gate = createRequestGate();
  let finishOld;
  const old = gate.begin();
  const slow = new Promise(resolve => { finishOld = resolve; });
  const visible = [];
  const completion = slow.then(() => { if (old()) visible.push('旧响应'); });
  const fresh = gate.begin();
  if (fresh()) visible.push('新响应');
  finishOld(); await completion;
  assert.deepEqual(visible, ['新响应']);
  gate.invalidate(); assert.equal(fresh(), false);
});

test('API 网络错误不吞掉，不会产生空列表', async () => {
  const api = createAppClientsAPI(async () => { throw new Error('本地模拟 503'); });
  await assert.rejects(api.appClientStats(), /503/);
  await assert.rejects(api.appClientUsers(), /503/);
});
