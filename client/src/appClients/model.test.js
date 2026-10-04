import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppClientsAPI } from './api.js';
import { createAppClientsFixture } from './fixture.js';
import { APP_POLICY_SETTING_KEY, APP_REMINDER_SETTING_KEY, createRequestGate, DEFAULT_APP_POLICY, DEFAULT_APP_REMINDER, DEFAULT_APP_REMINDER_MESSAGE, exactCount, isReservedAppClientSetting, normalizeVersionCodes, policyPayload, readPolicy, readReminder, readStats, readUsers, reminderPayload, usersQuery } from './model.js';

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

test('提醒默认关闭、版本边界与纯文本校验；空白 PUT 选择默认文案', () => {
  assert.equal(APP_REMINDER_SETTING_KEY, 'app_client_reminder');
  assert.deepEqual(DEFAULT_APP_REMINDER, { enabled: false, version_codes: [], message: '已有新版本 App，建议更新以获得更好的体验。' });
  const custom = '<img src=x onerror=alert(1)>\n第二行';
  assert.deepEqual(reminderPayload({ ...DEFAULT_APP_REMINDER, versionText: '003, 1，3\n2', message: ` ${custom} ` }), { enabled: false, version_codes: [1, 2, 3], message: custom });
  assert.deepEqual(reminderPayload({ ...DEFAULT_APP_REMINDER, enabled: true, versionText: '', message: ' \n ' }), { enabled: true, version_codes: [], message: '' });
  assert.equal(readReminder({ enabled: false, version_codes: [], message: '' }).message, DEFAULT_APP_REMINDER_MESSAGE);
  assert.equal(reminderPayload({ ...DEFAULT_APP_REMINDER, message: '字'.repeat(2000) }).message.length, 2000);
  assert.throws(() => reminderPayload({ ...DEFAULT_APP_REMINDER, message: '字'.repeat(2001) }), /2000/);
  assert.deepEqual(reminderPayload({ ...DEFAULT_APP_REMINDER, versionText: '2147483647,1,2147483647' }).version_codes, [1, 2147483647]);
  assert.equal(reminderPayload({ ...DEFAULT_APP_REMINDER, version_codes: Array.from({ length: 200 }, (_, i) => i + 1) }).version_codes.length, 200);
  assert.throws(() => reminderPayload({ ...DEFAULT_APP_REMINDER, version_codes: Array.from({ length: 201 }, (_, i) => i + 1) }), /200.*提醒/);
  assert.equal(reminderPayload({ ...DEFAULT_APP_REMINDER, version_codes: Array(201).fill(1) }).version_codes.length, 1);
  for (const versionText of ['0', '-1', '1.5', '1e2', 'v100', '2147483648', '+3']) assert.throws(() => reminderPayload({ ...DEFAULT_APP_REMINDER, versionText }), /提醒版本号/);
  for (const bad of [null, {}, { ...DEFAULT_APP_REMINDER, enabled: 1 }, { ...DEFAULT_APP_REMINDER, message: null }, { ...DEFAULT_APP_REMINDER, version_codes: ['1'] }, { ...DEFAULT_APP_REMINDER, version_codes: [2147483648] }]) assert.throws(() => readReminder(bad));
  assert.throws(() => reminderPayload({ ...DEFAULT_APP_REMINDER, enabled: 'false' }));
  assert.throws(() => reminderPayload({ ...DEFAULT_APP_REMINDER, message: 1 }));
});

test('提醒 API 独立 GET/PUT、只传三字段、取消信号与 no-store；配置不自动启用', async () => {
  const fixture = createAppClientsFixture();
  const calls = [];
  const api = createAppClientsAPI(async (path, options) => {
    calls.push({ path, options });
    return fixture.respond(path, options.method || 'GET', new URLSearchParams(), options.body ? JSON.parse(options.body) : null).data;
  });
  const signal = new AbortController().signal;
  assert.equal((await api.appClientReminder({ signal, cache: 'force-cache' })).enabled, false);
  const saved = await api.saveAppClientReminder({ ...DEFAULT_APP_REMINDER, ...DEFAULT_APP_POLICY, versionText: '200,100,200', message: '  ' }, { signal, cache: 'force-cache' });
  assert.deepEqual(saved, { enabled: false, version_codes: [100, 200], message: DEFAULT_APP_REMINDER_MESSAGE });
  assert.deepEqual(JSON.parse(calls[1].options.body), { enabled: false, version_codes: [100, 200], message: '' });
  assert.deepEqual(Object.keys(JSON.parse(calls[1].options.body)).sort(), ['enabled', 'message', 'version_codes']);
  for (const call of calls) {
    assert.equal(call.path, '/api/admin/app-clients/reminder');
    assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.signal, signal);
  }
  assert.equal(calls[1].options.method, 'PUT');
  await api.appClientReminder(); await api.appClientReminder();
  assert.equal(calls.length, 4, 'GET 不使用内存缓存');
  const before = calls.length;
  await assert.rejects(api.saveAppClientReminder({ ...DEFAULT_APP_REMINDER, versionText: '0' }));
  assert.equal(calls.length, before, '非法输入不发送请求');
});

test('提醒与废弃 fixture 状态独立，关闭仍保留配置；失败不伪造成功', () => {
  const fixture = createAppClientsFixture();
  const request = (path, method = 'GET', body) => fixture.respond(`/api/admin/app-clients/${path}`, method, new URLSearchParams(), body);
  const policyBefore = request('policy').data;
  const custom = { enabled: true, version_codes: [200, 100, 200], message: '<b>纯文本</b>' };
  assert.deepEqual(request('reminder', 'PUT', custom).data, { ...custom, version_codes: [100, 200] });
  assert.deepEqual(request('policy').data, policyBefore);
  request('policy', 'PUT', { ...DEFAULT_APP_POLICY, enabled: true, block_unversioned: true });
  assert.equal(request('reminder').data.message, custom.message);
  request('reminder', 'PUT', { ...custom, enabled: false });
  assert.deepEqual(request('reminder').data.version_codes, [100, 200]);
  const retained = request('reminder').data;
  retained.version_codes.push(999);
  assert.deepEqual(request('reminder').data.version_codes, [100, 200], '返回副本不会改变存储');
  for (const scenario of ['unavailable', 'errors']) {
    fixture.setScenario(scenario);
    assert.equal(request('reminder').status, 503); assert.equal(request('reminder', 'PUT', custom).status, 503);
  }
  fixture.setScenario('save-error');
  assert.equal(request('reminder').status, 200);
  assert.equal(request('reminder', 'PUT', { ...custom, message: '失败写入' }).status, 500);
  assert.equal(request('reminder').data.message, custom.message);
  fixture.setScenario('normal');
  assert.equal(request('reminder', 'PUT', { ...custom, version_codes: [0] }).status, 400);
  assert.equal(request('reminder', 'PUT', { ...custom, message: '\n  ' }).data.message, DEFAULT_APP_REMINDER_MESSAGE);
  fixture.setScenario('slow');
  assert.equal(fixture.delay('/api/admin/app-clients/reminder', new URLSearchParams()), 1500);
});

test('两项 App 配置键都保留，通用设置的手动新增也不能绕过', () => {
  const fixture = createAppClientsFixture();
  for (const key of [APP_POLICY_SETTING_KEY, APP_REMINDER_SETTING_KEY]) {
    assert.equal(isReservedAppClientSetting(` ${key} `), true);
    assert.equal(fixture.respond('/api/admin/settings', 'PUT', new URLSearchParams(), { key: ` ${key} `, value: '{}' }).status, 400);
  }
  assert.equal(isReservedAppClientSetting('site_name'), false);
  const keys = fixture.respond('/api/admin/settings', 'GET').data.settings.map(row => row.key);
  assert.ok(keys.includes(APP_REMINDER_SETTING_KEY));
});

test('提醒 API 网络、取消与响应格式错误原样上抛，不回退默认成功', async () => {
  for (const method of ['appClientReminder', 'saveAppClientReminder']) {
    const network = new Error('本地模拟 503');
    const api = createAppClientsAPI(async () => { throw network; });
    await assert.rejects(api[method](DEFAULT_APP_REMINDER), error => error === network);
    const controller = new AbortController(); controller.abort();
    const cancelled = createAppClientsAPI(async (_path, options) => { options.signal.throwIfAborted(); });
    await assert.rejects(method === 'appClientReminder' ? cancelled[method]({ signal: controller.signal }) : cancelled[method](DEFAULT_APP_REMINDER, { signal: controller.signal }), { name: 'AbortError' });
    const invalidAPI = createAppClientsAPI(async () => ({}));
    await assert.rejects(invalidAPI[method](DEFAULT_APP_REMINDER), /响应格式异常/);
  }
});

test('API 网络错误不吞掉，不会产生空列表', async () => {
  const api = createAppClientsAPI(async () => { throw new Error('本地模拟 503'); });
  await assert.rejects(api.appClientStats(), /503/);
  await assert.rejects(api.appClientUsers(), /503/);
});
