import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppClientsAPI } from './api.js';
import { createAppClientsFixture } from './fixture.js';
import { APP_NBW_LOCAL_ONLY_SETTING_KEY, APP_POLICY_SETTING_KEY, APP_REMINDER_SETTING_KEY, createRequestGate, DEFAULT_APP_NBW_LOCAL_ONLY, DEFAULT_APP_POLICY, DEFAULT_APP_REMINDER, DEFAULT_APP_REMINDER_MESSAGE, exactCount, isReservedAppClientSetting, nbwLocalOnlyPayload, normalizeVersionCodes, policyPayload, readNbwLocalOnly, readPolicy, readReminder, readStats, readUsers, reminderPayload, usersQuery } from './model.js';

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
  assert.deepEqual(DEFAULT_APP_REMINDER, { enabled: false, version_codes: [], message: '已有新版本 App，建议更新以获得更好的体验。', include_unversioned: true });
  const custom = '<img src=x onerror=alert(1)>\n第二行';
  assert.deepEqual(reminderPayload({ ...DEFAULT_APP_REMINDER, versionText: '003, 1，3\n2', message: ` ${custom} ` }), { enabled: false, version_codes: [1, 2, 3], message: custom, include_unversioned: true });
  assert.deepEqual(reminderPayload({ ...DEFAULT_APP_REMINDER, enabled: true, versionText: '', message: ' \n ' }), { enabled: true, version_codes: [], message: '', include_unversioned: true });
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

test('提醒 API 独立 GET/PUT、始终传四字段、取消信号与 no-store；配置不自动启用', async () => {
  const fixture = createAppClientsFixture();
  const calls = [];
  const api = createAppClientsAPI(async (path, options) => {
    calls.push({ path, options });
    return fixture.respond(path, options.method || 'GET', new URLSearchParams(), options.body ? JSON.parse(options.body) : null).data;
  });
  const signal = new AbortController().signal;
  assert.equal((await api.appClientReminder({ signal, cache: 'force-cache' })).enabled, false);
  const saved = await api.saveAppClientReminder({ ...DEFAULT_APP_REMINDER, ...DEFAULT_APP_POLICY, versionText: '200,100,200', message: '  ' }, { signal, cache: 'force-cache' });
  assert.deepEqual(saved, { enabled: false, version_codes: [100, 200], message: DEFAULT_APP_REMINDER_MESSAGE, include_unversioned: true });
  assert.deepEqual(JSON.parse(calls[1].options.body), { enabled: false, version_codes: [100, 200], message: '', include_unversioned: true });
  assert.deepEqual(Object.keys(JSON.parse(calls[1].options.body)).sort(), ['enabled', 'include_unversioned', 'message', 'version_codes']);
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

test('旧三字段提醒响应与配置默认包含未上报，仍保留总开关关闭；新字段 false 不被覆盖', () => {
  const legacy = { enabled: false, version_codes: [200, 100, 200], message: '  旧文案  ' };
  const normalized = { enabled: false, version_codes: [100, 200], message: '旧文案', include_unversioned: true };
  assert.deepEqual(readReminder(legacy), normalized);
  assert.deepEqual(reminderPayload(legacy), normalized);
  assert.equal(Object.hasOwn(legacy, 'include_unversioned'), false, '归一化不修改旧配置');
  assert.deepEqual(readReminder({ ...legacy, include_unversioned: false }), { ...normalized, include_unversioned: false });
  assert.deepEqual(reminderPayload({ ...legacy, include_unversioned: false }), { ...normalized, include_unversioned: false });
});

test('显式非布尔未上报字段全部拒绝；非法保存不会发送请求', async () => {
  let requests = 0;
  const api = createAppClientsAPI(async () => { requests += 1; return DEFAULT_APP_REMINDER; });
  for (const include_unversioned of [undefined, null, 0, 1, 'true', 'false', '', [], {}]) {
    const bad = { ...DEFAULT_APP_REMINDER, include_unversioned };
    assert.throws(() => readReminder(bad), /响应格式异常/);
    assert.throws(() => reminderPayload(bad), /布尔值/);
    await assert.rejects(api.saveAppClientReminder(bad), /布尔值/);
    const invalidResponseAPI = createAppClientsAPI(async () => bad);
    await assert.rejects(invalidResponseAPI.appClientReminder(), /响应格式异常/);
    await assert.rejects(invalidResponseAPI.saveAppClientReminder(DEFAULT_APP_REMINDER), /响应格式异常/);
  }
  assert.equal(requests, 0);
});

test('空提醒列表与未上报选项独立，关闭总开关及恢复文案不重置任何其他字段', () => {
  for (const enabled of [false, true]) {
    for (const include_unversioned of [false, true]) {
      for (const version_codes of [[], [100, 200]]) {
        const config = { enabled, version_codes, message: '自定义提醒', include_unversioned };
        assert.deepEqual(readReminder(config), config);
        assert.deepEqual(reminderPayload(config), config);
        assert.deepEqual(reminderPayload({ ...config, message: '' }), { ...config, message: '' });
        assert.deepEqual(readReminder({ ...config, message: '' }), { ...config, message: DEFAULT_APP_REMINDER_MESSAGE });
        assert.deepEqual(reminderPayload({ ...config, enabled: false }), { ...config, enabled: false });
      }
    }
  }
});

test('旧响应 fixture 经 API 升级后保存四字段，正常重载保留 false；废弃四字段不变', async () => {
  const fixture = createAppClientsFixture('legacy-reminder');
  const calls = [];
  const api = createAppClientsAPI(async (path, options) => {
    calls.push({ path, options });
    return fixture.respond(path, options.method || 'GET', new URLSearchParams(), options.body ? JSON.parse(options.body) : null).data;
  });
  const legacy = fixture.respond('/api/admin/app-clients/reminder', 'GET').data;
  assert.deepEqual(Object.keys(legacy).sort(), ['enabled', 'message', 'version_codes']);
  const loaded = await api.appClientReminder();
  assert.equal(loaded.include_unversioned, true);
  assert.equal(loaded.enabled, false);
  const saved = await api.saveAppClientReminder({ ...loaded, enabled: true, include_unversioned: false, version_codes: [100] });
  assert.deepEqual(JSON.parse(calls[1].options.body), saved);
  assert.equal(saved.include_unversioned, false);
  fixture.setScenario('normal');
  assert.deepEqual(await api.appClientReminder(), saved);
  assert.deepEqual(Object.keys(fixture.respond('/api/admin/app-clients/policy', 'GET').data).sort(), ['block_unversioned', 'deprecated_version_codes', 'enabled', 'update_message']);
  assert.deepEqual(Object.keys(policyPayload({ ...DEFAULT_APP_POLICY, ...saved })).sort(), ['block_unversioned', 'deprecated_version_codes', 'enabled', 'update_message']);
});

test('提醒与废弃 fixture 状态独立，关闭仍保留配置；失败不伪造成功', () => {
  const fixture = createAppClientsFixture();
  const request = (path, method = 'GET', body) => fixture.respond(`/api/admin/app-clients/${path}`, method, new URLSearchParams(), body);
  const policyBefore = request('policy').data;
  const custom = { enabled: true, version_codes: [200, 100, 200], message: '<b>纯文本</b>', include_unversioned: false };
  assert.deepEqual(request('reminder', 'PUT', custom).data, { ...custom, version_codes: [100, 200] });
  assert.deepEqual(request('policy').data, policyBefore);
  request('policy', 'PUT', { ...DEFAULT_APP_POLICY, enabled: true, block_unversioned: true });
  assert.equal(request('reminder').data.message, custom.message);
  request('reminder', 'PUT', { ...custom, enabled: false });
  assert.deepEqual(request('reminder').data, { ...custom, enabled: false, version_codes: [100, 200] });
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

test('三项 App 配置键都保留，通用设置的手动新增也不能绕过', () => {
  const fixture = createAppClientsFixture();
  for (const key of [APP_POLICY_SETTING_KEY, APP_REMINDER_SETTING_KEY, APP_NBW_LOCAL_ONLY_SETTING_KEY]) {
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

test('仅本站默认三字段全关闭，无预选版本；文本归一化及整数/数量边界', () => {
  assert.equal(APP_NBW_LOCAL_ONLY_SETTING_KEY, 'app_client_nbw_local_only');
  assert.deepEqual(DEFAULT_APP_NBW_LOCAL_ONLY, { enabled: false, version_codes: [], include_unversioned: false });
  assert.deepEqual(nbwLocalOnlyPayload({ ...DEFAULT_APP_NBW_LOCAL_ONLY, versionText: '003, 1，3\n2；2147483647' }), { enabled: false, version_codes: [1, 2, 3, 2147483647], include_unversioned: false });
  assert.deepEqual(nbwLocalOnlyPayload({ ...DEFAULT_APP_NBW_LOCAL_ONLY, ...DEFAULT_APP_POLICY, message: '不携带', revision: 9, versionText: '' }), DEFAULT_APP_NBW_LOCAL_ONLY);
  assert.equal(nbwLocalOnlyPayload({ ...DEFAULT_APP_NBW_LOCAL_ONLY, version_codes: Array.from({ length: 200 }, (_, i) => i + 1) }).version_codes.length, 200);
  assert.throws(() => nbwLocalOnlyPayload({ ...DEFAULT_APP_NBW_LOCAL_ONLY, versionText: Array.from({ length: 201 }, (_, i) => i + 1).join(',') }), /200/);
  assert.deepEqual(nbwLocalOnlyPayload({ ...DEFAULT_APP_NBW_LOCAL_ONLY, versionText: Array(201).fill('1').join(',') }).version_codes, [1]);
  for (const versionText of ['0', '-1', '1.5', '1e2', '1.0', 'v31', '2147483648', 'NaN', '+3', '<b>31</b>']) assert.throws(() => nbwLocalOnlyPayload({ ...DEFAULT_APP_NBW_LOCAL_ONLY, versionText }), /仅本站版本号/);
  for (const version_codes of [null, undefined, '31', ['31'], [null], [true], [0], [-1], [1.5], [Infinity], [2147483648], Array(1)]) assert.throws(() => nbwLocalOnlyPayload({ ...DEFAULT_APP_NBW_LOCAL_ONLY, version_codes }));
  assert.throws(() => nbwLocalOnlyPayload({ ...DEFAULT_APP_NBW_LOCAL_ONLY, versionText: null }));
});

test('仅本站响应严格三字段，拒绝缺失、重复、错误类型及额外 revision，不回退默认成功', () => {
  const config = { enabled: true, version_codes: [2147483647, 1], include_unversioned: false };
  assert.deepEqual(readNbwLocalOnly(config), { ...config, version_codes: [1, 2147483647] });
  assert.deepEqual(config.version_codes, [2147483647, 1], '读取不修改输入');
  const invalid = [null, undefined, {}, { ...DEFAULT_APP_NBW_LOCAL_ONLY, revision: 1 }, { ...DEFAULT_APP_NBW_LOCAL_ONLY, message: '' }];
  for (const key of ['enabled', 'version_codes', 'include_unversioned']) {
    const missing = { ...DEFAULT_APP_NBW_LOCAL_ONLY }; delete missing[key]; invalid.push(missing);
  }
  for (const value of [undefined, null, 0, 1, 'true', 'false', '', [], {}]) {
    invalid.push({ ...DEFAULT_APP_NBW_LOCAL_ONLY, enabled: value }, { ...DEFAULT_APP_NBW_LOCAL_ONLY, include_unversioned: value });
    assert.throws(() => nbwLocalOnlyPayload({ ...DEFAULT_APP_NBW_LOCAL_ONLY, enabled: value }), /布尔值/);
    assert.throws(() => nbwLocalOnlyPayload({ ...DEFAULT_APP_NBW_LOCAL_ONLY, include_unversioned: value }), /布尔值/);
  }
  for (const version_codes of [null, '31', ['31'], [0], [2147483648], [31, 31], Array(1), Array.from({ length: 201 }, (_, i) => i + 1)]) invalid.push({ ...DEFAULT_APP_NBW_LOCAL_ONLY, version_codes });
  for (const data of invalid) assert.throws(() => readNbwLocalOnly(data), /响应格式异常/);
});

test('仅本站总开关、已知版本和未上报选项独立，关闭及清空列表不重置其他字段', () => {
  for (const enabled of [false, true]) for (const include_unversioned of [false, true]) for (const version_codes of [[], [31, 34]]) {
    const config = { enabled, version_codes, include_unversioned };
    assert.deepEqual(readNbwLocalOnly(config), config);
    assert.deepEqual(nbwLocalOnlyPayload(config), config);
    assert.deepEqual(nbwLocalOnlyPayload({ ...config, enabled: false }), { ...config, enabled: false });
    assert.deepEqual(nbwLocalOnlyPayload({ ...config, versionText: '' }), { ...config, version_codes: [] });
  }
});

test('仅本站 API 独立 GET/PUT 仅三字段，no-store/取消信号及校验先于请求', async () => {
  const fixture = createAppClientsFixture();
  const calls = [];
  const api = createAppClientsAPI(async (path, options) => {
    calls.push({ path, options });
    const response = fixture.respond(path, options.method || 'GET', new URLSearchParams(), options.body ? JSON.parse(options.body) : null);
    if (response.status !== 200) throw new Error(response.data.error);
    return response.data;
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await api.appClientNbwLocalOnly({ signal, cache: 'force-cache' }), DEFAULT_APP_NBW_LOCAL_ONLY);
  const saved = await api.saveAppClientNbwLocalOnly({ ...DEFAULT_APP_NBW_LOCAL_ONLY, ...DEFAULT_APP_POLICY, message: '不携带', revision: 2, versionText: '34,31,34' }, { signal, cache: 'force-cache' });
  assert.deepEqual(saved, { enabled: false, version_codes: [31, 34], include_unversioned: false });
  assert.deepEqual(JSON.parse(calls[1].options.body), saved);
  assert.deepEqual(Object.keys(saved).sort(), ['enabled', 'include_unversioned', 'version_codes']);
  assert.equal(calls[1].options.method, 'PUT');
  await api.appClientNbwLocalOnly({ signal }); await api.appClientNbwLocalOnly({ signal });
  assert.equal(calls.length, 4, '重复 GET 不缓存');
  for (const call of calls) {
    assert.equal(call.path, '/api/admin/app-clients/nbw-local-only');
    assert.equal(call.options.signal, signal); assert.equal(call.options.cache, 'no-store');
  }
  const before = calls.length;
  for (const form of [{ ...DEFAULT_APP_NBW_LOCAL_ONLY, versionText: '0' }, { ...DEFAULT_APP_NBW_LOCAL_ONLY, include_unversioned: 'false' }, { enabled: false, include_unversioned: false }]) await assert.rejects(api.saveAppClientNbwLocalOnly(form));
  assert.equal(calls.length, before, '非法表单不发请求');
});

test('仅本站 fixture 保存隔离，原提醒/废弃保持不变，错误不更新存储且可重试', () => {
  const fixture = createAppClientsFixture();
  const request = (name, method = 'GET', body) => fixture.respond(`/api/admin/app-clients/${name}`, method, new URLSearchParams(), body);
  const policy = request('policy').data, reminder = request('reminder').data;
  const custom = { enabled: true, version_codes: [31, 34], include_unversioned: true };
  assert.deepEqual(request('nbw-local-only').data, DEFAULT_APP_NBW_LOCAL_ONLY);
  assert.deepEqual(request('nbw-local-only', 'PUT', custom).data, custom);
  assert.deepEqual(request('policy').data, policy); assert.deepEqual(request('reminder').data, reminder);
  request('policy', 'PUT', { ...DEFAULT_APP_POLICY, enabled: true });
  request('reminder', 'PUT', { ...DEFAULT_APP_REMINDER, enabled: true });
  assert.deepEqual(request('nbw-local-only').data, custom);
  const copy = request('nbw-local-only').data; copy.version_codes.push(999);
  assert.deepEqual(request('nbw-local-only').data, custom);
  for (const scenario of ['unavailable', 'nbw-unavailable', 'errors']) {
    fixture.setScenario(scenario);
    assert.equal(request('nbw-local-only').status, 503); assert.equal(request('nbw-local-only', 'PUT', DEFAULT_APP_NBW_LOCAL_ONLY).status, 503);
  }
  fixture.setScenario('nbw-unavailable');
  assert.equal(request('policy').status, 200); assert.equal(request('reminder').status, 200);
  fixture.setScenario('save-error');
  assert.equal(request('nbw-local-only', 'PUT', DEFAULT_APP_NBW_LOCAL_ONLY).status, 500);
  assert.deepEqual(request('nbw-local-only').data, custom);
  fixture.setScenario('normal');
  for (const body of [{ ...custom, revision: 1 }, { ...custom, version_codes: [31, 31] }, { ...custom, version_codes: [0] }, { enabled: false, version_codes: [] }]) assert.equal(request('nbw-local-only', 'PUT', body).status, 400);
  assert.deepEqual(request('nbw-local-only', 'PUT', { ...custom, enabled: false }).data, { ...custom, enabled: false });
  assert.equal(request('nbw-local-only', 'POST', custom).status, 405);
  fixture.setScenario('nbw-invalid'); assert.throws(() => readNbwLocalOnly(request('nbw-local-only').data), /响应格式异常/);
  fixture.setScenario('slow'); assert.equal(fixture.delay('/api/admin/app-clients/nbw-local-only', new URLSearchParams()), 1500);
});

test('仅本站 API 的网络、503、取消及损坏响应不会被吞掉或回退默认', async () => {
  for (const method of ['appClientNbwLocalOnly', 'saveAppClientNbwLocalOnly']) {
    for (const status of [401, 403, 500, 503]) {
      const error = Object.assign(new Error(`本地模拟 ${status}`), { status });
      const api = createAppClientsAPI(async () => { throw error; });
      await assert.rejects(api[method](DEFAULT_APP_NBW_LOCAL_ONLY), actual => actual === error);
    }
    const controller = new AbortController(); controller.abort();
    const cancelled = createAppClientsAPI(async (_path, options) => { options.signal.throwIfAborted(); });
    await assert.rejects(method === 'appClientNbwLocalOnly' ? cancelled[method]({ signal: controller.signal }) : cancelled[method](DEFAULT_APP_NBW_LOCAL_ONLY, { signal: controller.signal }), { name: 'AbortError' });
    for (const data of [{}, { ...DEFAULT_APP_NBW_LOCAL_ONLY, include_unversioned: 'false' }, { ...DEFAULT_APP_NBW_LOCAL_ONLY, revision: 1 }]) {
      const invalidAPI = createAppClientsAPI(async () => data);
      await assert.rejects(invalidAPI[method](DEFAULT_APP_NBW_LOCAL_ONLY), /响应格式异常/);
    }
  }
});

test('API 网络错误不吞掉，不会产生空列表', async () => {
  const api = createAppClientsAPI(async () => { throw new Error('本地模拟 503'); });
  await assert.rejects(api.appClientStats(), /503/);
  await assert.rejects(api.appClientUsers(), /503/);
});
