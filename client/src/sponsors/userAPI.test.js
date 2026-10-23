import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createSponsorAPI } from './userAPI.js';
import { redemptionOperation } from './userModel.js';

const me = () => ({ sponsor: { active: false, permanent: false, expires_at: null, plan_name: null, color_key: null, color_light: null, color_dark: null }, quota: { limit: 2, used: 0, remaining: 2, resets_at: 2000000000, day_key: '2026-10-24' }, config_version: 1, notice_required: true, claimed_benefit_ids: [] });
const catalog = () => ({ config: { enabled: true, version: 1, center_title: '赞助中心', free_daily_limit: 2, sponsor_daily_limit: 6, timezone: 'Asia/Shanghai', notice_version: 1, notice_title: '须知', notice_body: '阅读须知', exhausted_title: '额度用尽', exhausted_body: '{reset}', sponsor_exhausted_body: '{reset}', purchase_title: '购买', purchase_steps: ['阅读须知'], minimum_read_seconds: 5, default_color_key: 'blue', colors: [{ key: 'blue', name: '蓝色', light: '#123456', dark: '#abcdef', permanent_only: false }], benefits: [] }, plans: [] });
const history = () => ({ items: [{ id: 'sponsor_operation:123', plan_name: '套餐', redeemed_at: 1800000000, expires_at: null, permanent: true }], total: 1 });
const operation = { code: 'TEST-CODE', operation_id: '12345678-1234-4234-8234-123456789abc' };
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function storage(values = new Map()) {
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function errorIs({ status, code, unknownOutcome, message }) {
  return error => {
    assert.ok(error instanceof Error); assert.equal(error.status, status); assert.equal(error.code, code);
    assert.equal(error.unknownOutcome, unknownOutcome); assert.match(error.message, message);
    return true;
  };
}

test('六个API方法路由、HTTP方法和JSON请求体精确符合契约', async () => {
  const calls = [];
  const api = createSponsorAPI({ base: 'https://api.example.test///', fetcher: async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.endsWith('/catalog') ? catalog() : url.includes('/redemptions?') ? history() : me());
  } });
  await api.catalog(); await api.me(); await api.redeem({ ...operation, token: '不得提交' });
  await api.color('blue'); await api.claim({ benefit_id: 'gift', operation_id: operation.operation_id, token: '不得提交' });
  await api.history(); await api.history({ offset: 40, limit: 10 });
  assert.deepEqual(calls.map(({ url, options }) => [url, options.method]), [
    ['https://api.example.test/api/v1/sponsors/catalog', 'GET'],
    ['https://api.example.test/api/v1/sponsors/me', 'GET'],
    ['https://api.example.test/api/v1/sponsors/redeem', 'POST'],
    ['https://api.example.test/api/v1/sponsors/color', 'PUT'],
    ['https://api.example.test/api/v1/sponsors/claims', 'POST'],
    ['https://api.example.test/api/v1/sponsors/redemptions?offset=0&limit=20', 'GET'],
    ['https://api.example.test/api/v1/sponsors/redemptions?offset=40&limit=10', 'GET'],
  ]);
  assert.deepEqual(JSON.parse(calls[2].options.body), operation);
  assert.deepEqual(JSON.parse(calls[3].options.body), { color_key: 'blue' });
  assert.deepEqual(JSON.parse(calls[4].options.body), { benefit_id: 'gift', operation_id: operation.operation_id });
  for (const { options } of calls.filter(call => call.options.method === 'GET')) assert.equal(Object.hasOwn(options, 'body'), false);
});
test('每次请求使用当前Bearer和cookie，敏感数据no-store且禁止redirect', async () => {
  let token = 'account-A'; const calls = [];
  const api = createSponsorAPI({ getToken: () => token, fetcher: async (_, options) => { calls.push(options); return Response.json(me()); } });
  await api.me(); token = 'account-B'; await api.redeem(operation); token = ''; await api.color('blue');
  assert.equal(calls[0].headers.Authorization, 'Bearer account-A'); assert.equal(calls[1].headers.Authorization, 'Bearer account-B');
  assert.equal(Object.hasOwn(calls[2].headers, 'Authorization'), false);
  for (const options of calls) {
    assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Accept, 'application/json'); assert.ok(options.signal instanceof AbortSignal);
  }
  assert.equal(calls[1].headers['Content-Type'], 'application/json'); assert.equal(calls[2].headers['Content-Type'], 'application/json');
});
test('catalog/me/mutations/history 使用各自validator，保留扩展和可选album原状', async () => {
  let payload;
  const api = createSponsorAPI({ fetcher: async () => Response.json(payload) });
  payload = catalog(); payload.config.free_daily_limit = '2'; payload.extra = true;
  const result = await api.catalog(); assert.equal(result.config.free_daily_limit, 2); assert.equal(result.extra, true);
  payload = me(); payload.message = '成功';
  for (const invoke of [() => api.me(), () => api.redeem(operation), () => api.color('blue'), () => api.claim({ benefit_id: 'gift', operation_id: operation.operation_id })]) {
    const result = await invoke(); assert.equal(result.message, '成功'); assert.equal(Object.hasOwn(result, 'album_quota'), false);
  }
  payload = { ...me(), album_quota: null }; assert.equal((await api.me()).album_quota, null);
  payload = history(); payload.total = '1'; assert.equal((await api.history()).total, 1);
});
test('401保留status/code并给中文重新登录提示，不被当作写入成功', async () => {
  const api = createSponsorAPI({ fetcher: async () => Response.json({ code: 'unauthorized', error: 'Unauthorized' }, { status: 401 }) });
  for (const invoke of [() => api.me(), () => api.redeem(operation)]) {
    await assert.rejects(invoke(), errorIs({ status: 401, code: 'unauthorized', unknownOutcome: false, message: /登录已过期.*重新登录/u }));
  }
});
test('401非JSON仍提示登录，写入解析失败保持unknownOutcome', async () => {
  const api = createSponsorAPI({ fetcher: async () => new Response('not-json', { status: 401 }) });
  await assert.rejects(api.me(), errorIs({ status: 401, code: '', unknownOutcome: false, message: /重新登录/u }));
  await assert.rejects(api.redeem(operation), errorIs({ status: 401, code: '', unknownOutcome: true, message: /重新登录/u }));
});
test('503 sponsors_unavailable明确服务不可用，不本地兜底，不自动重发', async () => {
  let calls = 0;
  const api = createSponsorAPI({ fetcher: async () => { calls++; return Response.json({ code: 'sponsors_unavailable', error: 'unavailable' }, { status: 503 }); } });
  await assert.rejects(api.catalog(), errorIs({ status: 503, code: 'sponsors_unavailable', unknownOutcome: false, message: /赞助服务暂不可用/u }));
  assert.equal(calls, 1);
  await assert.rejects(api.redeem(operation), errorIs({ status: 503, code: 'sponsors_unavailable', unknownOutcome: true, message: /结果未确认/u }));
  assert.equal(calls, 2);
});
test('403/409保留code，409优先呈现服务端码无效及已永久等具体文案', async () => {
  for (const [status, code, error, message] of [
    [403, 'forbidden', '禁止访问', /无权/u],
    [409, 'code_unavailable', '兑换码无效或已使用', /兑换码无效或已使用/u],
    [409, 'already_permanent', '当前账号已是永久赞助者', /当前账号已是永久赞助者/u],
  ]) {
    const api = createSponsorAPI({ fetcher: async () => Response.json({ code, error }, { status }) });
    await assert.rejects(api.redeem(operation), errorIs({ status, code, unknownOutcome: false, message }));
  }
});
test('写入未知传输错误、同步fetch异常及跳转错误只调用一次并要求核查', async () => {
  for (const failure of [new TypeError('network'), new Error('socket lost'), new DOMException('aborted', 'AbortError')]) {
    let calls = 0; const api = createSponsorAPI({ fetcher: () => { calls++; throw failure; } });
    await assert.rejects(api.redeem(operation), errorIs({ status: 0, code: '', unknownOutcome: true, message: /结果未确认.*相同操作标识/u }));
    assert.equal(calls, 1);
  }
});
test('GET传输失败也明确读取结果未确认但不标记写入unknownOutcome', async () => {
  const api = createSponsorAPI({ fetcher: async () => { throw new TypeError('network'); } });
  await assert.rejects(api.me(), errorIs({ status: 0, code: '', unknownOutcome: false, message: /结果未确认/u }));
});
test('写入无效JSON和坏schema保留HTTP状态并标明结果未确认', async () => {
  for (const response of [new Response('broken-json', { status: 200 }), new Response('<html>upstream error</html>', { status: 503 }), Response.json({ sponsor: {}, quota: {} })]) {
    let calls = 0; const api = createSponsorAPI({ fetcher: async () => { calls++; return response; } });
    await assert.rejects(api.claim({ benefit_id: 'gift', operation_id: operation.operation_id }), errorIs({ status: response.status, code: '', unknownOutcome: true, message: /结果未确认/u }));
    assert.equal(calls, 1);
  }
});
test('所有读取和写入接口拒绝错误schema，不把HTTP200当成功', async () => {
  const api = createSponsorAPI({ fetcher: async () => Response.json({ code: 'bad_payload', items: 'wrong' }) });
  for (const [invoke, writing] of [
    [() => api.catalog(), false], [() => api.me(), false], [() => api.history(), false],
    [() => api.redeem(operation), true], [() => api.color('blue'), true], [() => api.claim({ benefit_id: 'gift', operation_id: operation.operation_id }), true],
  ]) await assert.rejects(invoke(), errorIs({ status: 200, code: 'bad_payload', unknownOutcome: writing, message: /不符合赞助契约.*结果未确认/u }));
});
test('过期session调用前即阻止请求，取token期间会话切换同样不发送', async () => {
  let calls = 0;
  const api = createSponsorAPI({ isCurrentSession: () => false, fetcher: async () => { calls++; return Response.json(me()); } });
  await assert.rejects(api.me(), errorIs({ status: 0, code: '', unknownOutcome: false, message: /会话已切换/u }));
  let current = true;
  const changed = createSponsorAPI({ isCurrentSession: () => current, getToken: () => { current = false; return 'old-account'; }, fetcher: async () => { calls++; return Response.json(me()); } });
  await assert.rejects(changed.redeem(operation), /会话已切换/u);
  assert.equal(calls, 0);
});
test('session切换时抛弃旧账户成功/错误HTTP响应，不读取旧账户body', async () => {
  for (const status of [200, 401, 503]) {
    const response = deferred(); let current = true; let read = false;
    const api = createSponsorAPI({ isCurrentSession: () => current, fetcher: () => response.promise });
    const pending = api.me(); current = false;
    response.resolve({ status, ok: status === 200, json: async () => { read = true; return me(); } });
    await assert.rejects(pending, errorIs({ status, code: '', unknownOutcome: false, message: /忽略旧账户响应/u }));
    assert.equal(read, false);
  }
});
test('session在JSON解析期间切换，旧账户写入响应不能更新新账户', async () => {
  const json = deferred(); const entered = deferred(); let current = true;
  const api = createSponsorAPI({ isCurrentSession: () => current, fetcher: async () => ({ status: 200, ok: true, json: () => { entered.resolve(); return json.promise; } }) });
  const pending = api.redeem(operation); await entered.promise; current = false; json.resolve(me());
  await assert.rejects(pending, errorIs({ status: 200, code: '', unknownOutcome: true, message: /忽略旧账户响应/u }));
});
test('session切换后的网络失败也不归入新账户', async () => {
  const fetch = deferred(); let current = true;
  const api = createSponsorAPI({ isCurrentSession: () => current, fetcher: () => fetch.promise });
  const pending = api.redeem(operation); current = false; fetch.reject(new TypeError('network'));
  await assert.rejects(pending, errorIs({ status: 0, code: '', unknownOutcome: true, message: /忽略旧账户响应/u }));
});
test('调用前已abort阻止发送，各方法均接受外部signal', async () => {
  const controller = new AbortController(); controller.abort(); let calls = 0;
  const api = createSponsorAPI({ fetcher: async () => { calls++; return Response.json(me()); } });
  const options = { signal: controller.signal };
  for (const invoke of [() => api.catalog(options), () => api.me(options), () => api.redeem(operation, options), () => api.color('blue', options), () => api.claim({ benefit_id: 'gift' }, options), () => api.history(options)]) {
    await assert.rejects(invoke(), errorIs({ status: 0, code: '', unknownOutcome: false, message: /尚未发送/u }));
  }
  assert.equal(calls, 0);
});
test('外部signal中止写入立即失败并透传组合signal，不依赖fetcher主动拒绝', async () => {
  const controller = new AbortController(); const entered = deferred(); let passed;
  const api = createSponsorAPI({ fetcher: (_, options) => { passed = options.signal; entered.resolve(); return new Promise(() => {}); } });
  const pending = api.redeem(operation, { signal: controller.signal }); await entered.promise; controller.abort();
  await assert.rejects(pending, errorIs({ status: 0, code: '', unknownOutcome: true, message: /取消.*结果未确认/u }));
  assert.equal(passed.aborted, true);
});
test('30秒超时包含写入，超时立即终止且不重发', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0; let passed;
  const api = createSponsorAPI({ fetcher: (_, options) => { calls++; passed = options.signal; return new Promise(() => {}); } });
  const pending = api.color('blue');
  const rejected = assert.rejects(pending, errorIs({ status: 0, code: '', unknownOutcome: true, message: /30 秒.*结果未确认/u }));
  t.mock.timers.tick(29999); assert.equal(passed.aborted, false);
  t.mock.timers.tick(1); await rejected; assert.equal(passed.aborted, true); assert.equal(calls, 1);
});
test('30秒超时也覆盖响应JSON解析，成功调用移除外部abort监听', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const entered = deferred(); let passed;
  const api = createSponsorAPI({ fetcher: async (_, options) => { passed = options.signal; return { status: 200, ok: true, json: () => { entered.resolve(); return new Promise(() => {}); } }; } });
  const pending = api.redeem(operation); const rejected = assert.rejects(pending, errorIs({ status: 200, code: '', unknownOutcome: true, message: /超时.*结果未确认/u }));
  await entered.promise; t.mock.timers.tick(30000); await rejected; assert.equal(passed.aborted, true);
  const controller = new AbortController();
  const successful = createSponsorAPI({ fetcher: async (_, options) => { passed = options.signal; return Response.json(me()); } });
  await successful.me({ signal: controller.signal }); controller.abort(); t.mock.timers.tick(30000);
  assert.equal(passed.aborted, false);
});
test('未知写入后手动重试沿用持久化operation，每次调用只发送一次', async () => {
  const saved = storage(); const first = await redemptionOperation('account-A', ' test code ', { storage: saved, cryptoImpl: webcrypto });
  const calls = [];
  const api = createSponsorAPI({ fetcher: async (_, options) => { calls.push(JSON.parse(options.body)); if (calls.length === 1) throw new TypeError('offline'); return Response.json(me()); } });
  await assert.rejects(api.redeem(first), /结果未确认/u); assert.equal(calls.length, 1);
  const recreatedStorage = storage(new Map(saved.values));
  const retry = await redemptionOperation('account-A', 'TESTCODE', { storage: recreatedStorage, cryptoImpl: webcrypto });
  await api.redeem(retry); assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]); assert.deepEqual(calls[0], first);
});
test('兑换持久化失败时调用链不进入API提交', async () => {
  let calls = 0;
  const api = createSponsorAPI({ fetcher: async () => { calls++; return Response.json(me()); } });
  const brokenStorage = { getItem: () => null, setItem: () => { throw new Error('storage unavailable'); } };
  await assert.rejects((async () => api.redeem(await redemptionOperation('account-A', 'code', { storage: brokenStorage, cryptoImpl: webcrypto })))(), /尚未提交兑换/u);
  assert.equal(calls, 0);
});
