import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createContext, Script } from 'node:vm';
import { createSponsorAPI } from '../src/sponsors/userAPI.js';
import { createForegroundReadTimer, redemptionOperation, safeSponsorPurchaseURL, validateMe } from '../src/sponsors/userModel.js';

// 执行 JSX 中真实的无 JSX 逻辑段，不复制业务分支；只注入 hooks、时钟和网络等边界。
// 提取边界变动时显式失败，避免悄悄测试已经不再使用的实现。
const source = readFileSync(new URL('../src/sponsors/SponsorCenter.jsx', import.meta.url), 'utf8');
function region(startText, endText, from = 0) {
  const start = source.indexOf(startText, from);
  const end = source.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `无法定位生产逻辑：${startText}`);
  return source.slice(start, end);
}
const parentBody = region('export default function SponsorCenter() {', '  if (loading) return').replace('export default function SponsorCenter() {', '');
const currentGuard = region('  const isCurrent = useCallback(', '  const api = useMemo(');
const requestAndLoad = region('  const request = useCallback(', '  useEffect(() => {\n    alive.current = true;');
const errorHandler = region('  function handleOperationError(', '  async function redeem(');
const redeemHandler = region('  async function redeem(event) {', '  async function updateBenefit(');
const guideStart = source.indexOf('function PurchaseGuide(');
const guideActivity = region('    const activity = () => {', "    window.addEventListener('focus', activity);", guideStart);
const guideReadiness = region('  useEffect(() => {\n    timer.setActive(foreground && ready', '\n\n  async function continueReading()', guideStart);
const continueHandler = region('  async function continueReading()', '  function checkAnswer(', guideStart);
const fingerprintHelpers = region('const canonical = ', 'const foregroundNow = ');
function execute(body, dependencies) {
  return new Script(body, { filename: 'SponsorCenter.actual-handlers.js' }).runInContext(createContext(dependencies));
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const operation = { code: 'TESTCODE', operation_id: '12345678-1234-4234-8234-123456789abc' };
const freeMe = () => ({ sponsor: { active: false, permanent: false, expires_at: null, plan_name: null, color_key: null, color_light: null, color_dark: null }, quota: { limit: 2, used: 0, remaining: 2, resets_at: 2000000000, day_key: '2026-10-24' }, config_version: 1, notice_required: true, claimed_benefit_ids: [] });
function memoryStorage() {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function redemptionHarness({ prepare = async () => ({ ...operation }), api } = {}) {
  const state = {
    code: ' test code ', action: { busy: '', message: '' }, redemption: null,
    page: { phase: 'ready', catalog: { config: { enabled: true, version: 1 } }, me: freeMe() },
    posts: [], refreshes: 0, historyRevision: 0,
  };
  const context = {
    AbortController, DOMException, useCallback: fn => fn,
    alive: { current: true }, currentSession: { current: 'account-A' }, sessionKey: 'account-A',
    controllers: { current: new Set() }, mutationLock: { current: false }, loadFlight: { current: null },
    readGeneration: { current: 0 }, latestPage: { current: state.page },
    canOperate: true, permanent: false, code: state.code,
    window: { location: { origin: 'https://sponsor-lifecycle.invalid' } }, user: { id: 7 },
    redemptionOperation: prepare, validateCatalog: value => value, validateMe,
    normalizeCode: value => value.replace(/\s+/gu, '').toUpperCase(),
    setAction: value => { state.action = typeof value === 'function' ? value(state.action) : value; },
    setRedemption: value => { state.redemption = value; },
    setCode: value => { state.code = typeof value === 'function' ? value(state.code) : value; context.code = state.code; },
    setPage: value => { state.page = typeof value === 'function' ? value(state.page) : value; context.latestPage.current = state.page; },
    setNowSeconds() {}, setHistoryRevision: value => { state.historyRevision = value(state.historyRevision); },
    clearRouteListCache() {}, refreshIdentity: async () => { state.refreshes++; },
    api: api || {
      catalog: async () => ({ config: { enabled: true, version: 1 }, plans: [] }), me: async () => freeMe(),
      redeem: async body => { state.posts.push(body); return freeMe(); },
    },
  };
  const handlers = execute(`${currentGuard}\n${requestAndLoad}\n${errorHandler}\n${redeemHandler}\n({ redeem, load, isCurrent });`, context);
  return { context, state, ...handlers, submit: () => handlers.redeem({ preventDefault() {} }) };
}
function purchaseHarness() {
  let time = 0;
  const timer = createForegroundReadTimer({ now: () => time, requiredSeconds: 5 });
  timer.setActive(true); time = 5000;
  const pending = deferred();
  const plan = { id: 'monthly', enabled: true, purchase_url: '', afdian_plan_id: 'a'.repeat(32), afdian_sku_id: 'b'.repeat(32) };
  const url = new URL('https://ifdian.net/order/create');
  url.searchParams.set('product_type', '1'); url.searchParams.set('plan_id', plan.afdian_plan_id);
  url.searchParams.set('sku', JSON.stringify([{ sku_id: plan.afdian_sku_id, count: 1 }]));
  plan.purchase_url = url.href;
  const config = { enabled: true, version: 1, minimum_read_seconds: 5 };
  const state = { focused: true, stage: 'read', answer: '', busy: false, error: '', foreground: true };
  const context = {
    config, plan, timer, ready: true, stage: 'read', foreground: true, busy: false,
    lock: { current: false }, mounted: { current: true }, foregroundEpoch: { current: 0 },
    foregroundNow: () => state.focused, isCurrent: () => true, safeSponsorPurchaseURL,
    refreshFresh: () => pending.promise,
    setStage: value => { state.stage = value; context.stage = value; },
    setAnswer: value => { state.answer = value; }, setError: value => { state.error = value; },
    setBusy: value => { state.busy = value; context.busy = value; },
    setForeground: value => { state.foreground = value; context.foreground = value; },
    setElapsed() {}, onChanged() {}, setInterval: () => 1, clearInterval() {},
    useEffect: effect => effect(),
  };
  const handlers = execute(`${fingerprintHelpers}\nconst fingerprint = purchaseFingerprint(config, plan);\n${guideActivity}\n${continueHandler}\nfunction readinessEffect() { ${guideReadiness} }\n({ activity, continueReading, readinessEffect });`, context);
  return { context, state, ...handlers, resolve: () => pending.resolve({ catalog: { config, plans: [plan] }, me: freeMe() }) };
}

test('父会话经 StrictMode render/effect 重放仍有效，渲染切号立即让旧 guard 失效', () => {
  const ref = { current: undefined };
  let effects = [];
  let auth = { user: { id: 'A' }, accounts: [] };
  const parent = execute(`function renderParent() { ${parentBody}\nreturn { currentSession, sessionKey }; }\nrenderParent;`, {
    useAuth: () => auth, accountSessionKey: user => `session:${user.id}`,
    useRef: value => { if (ref.current === undefined) ref.current = value; return ref; },
    useEffect: setup => { effects.push(setup); },
  });
  parent(); effects = []; const rendered = parent();
  const setups = [...effects]; const cleanups = setups.map(setup => setup());
  cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup(); });
  setups.forEach(setup => setup());
  const oldGuard = execute(`${currentGuard}\nisCurrent;`, {
    useCallback: fn => fn, alive: { current: true }, currentSession: rendered.currentSession, sessionKey: rendered.sessionKey,
  });
  assert.equal(oldGuard(), true);
  auth = { user: { id: 'B' }, accounts: [] }; parent();
  assert.equal(oldGuard(), false); assert.equal(ref.current, 'session:B');
});

test('兑换持久化期间实际 load 代际推进或配置/永久门禁变化，恢复后均不 POST', async () => {
  const changes = [
    { name: '真实 load 推进 readGeneration', apply: h => h.load() },
    { name: '配置关闭', apply: h => { h.context.latestPage.current.catalog.config.enabled = false; } },
    { name: '变为永久', apply: h => { h.context.latestPage.current.me.sponsor.permanent = true; } },
    { name: 'ready 失效', apply: h => { h.context.latestPage.current.phase = 'stale'; } },
    { name: '配置版本不一致', apply: h => { h.context.latestPage.current.me.config_version = 2; } },
  ];
  for (const change of changes) {
    const prepared = deferred(); const h = redemptionHarness({ prepare: () => prepared.promise });
    const pending = h.submit(); await change.apply(h); prepared.resolve({ ...operation }); await pending;
    assert.equal(h.state.posts.length, 0, change.name); assert.equal(h.state.code, ' test code ', change.name);
    assert.match(h.state.redemption.message, /尚未提交兑换/u); assert.equal(h.context.mutationLock.current, false);
    assert.equal(h.state.action.busy, '');
  }
});

test('正常兑换只 POST 一次，准备期间重复 submit 被锁住，成功只刷新而不直接套用写入快照', async () => {
  const prepared = deferred(); let preparations = 0;
  const h = redemptionHarness({ prepare: () => { preparations++; return prepared.promise; } });
  const pending = h.submit(); await h.submit();
  assert.equal(preparations, 1); assert.equal(h.state.posts.length, 0);
  prepared.resolve({ ...operation }); await pending;
  assert.equal(h.state.posts.length, 1); assert.deepEqual(h.state.posts[0], operation);
  assert.equal(h.state.code, ''); assert.equal(h.state.redemption.tone, 'success');
  assert.equal(h.state.refreshes, 1); assert.equal(h.state.historyRevision, 1);
  assert.equal(h.state.page.me.sponsor.active, false); assert.equal(h.context.mutationLock.current, false);
});

test('真实购买核验正常进入 quiz，pending GET 期间 blur/focus 后旧结果不能恢复 quiz', async () => {
  for (const leaveForeground of [false, true]) {
    const h = purchaseHarness(); const pending = h.continueReading();
    assert.equal(h.state.busy, true);
    if (leaveForeground) {
      h.state.focused = false; h.activity(); h.state.focused = true; h.activity();
      assert.equal(h.context.foregroundEpoch.current, 1);
    }
    h.resolve(); await pending;
    assert.equal(h.state.stage, leaveForeground ? 'read' : 'quiz');
    assert.equal(h.state.busy, false);
    if (leaveForeground) assert.match(h.state.error, /核验期间曾离开前台/u);
  }
});

test('购买自身 GET 的 ready=false effect 不覆盖新问答，非自身失效仍撤销 quiz/verified', () => {
  const h = purchaseHarness();
  for (const stage of ['quiz', 'verified']) {
    h.context.stage = stage; h.state.stage = stage; h.context.ready = false; h.context.busy = true;
    h.readinessEffect(); assert.equal(h.state.stage, stage);
    h.context.busy = false; h.readinessEffect(); assert.equal(h.state.stage, 'read');
  }
});

test('真实 API 未知兑换保留输入不伪开通，重建持久化上下文后同码重试沿用 operation', async () => {
  const saved = memoryStorage(); const calls = [];
  const api = createSponsorAPI({ fetcher: async (_, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) throw new TypeError('connection lost after send');
    const result = freeMe();
    Object.assign(result.sponsor, { active: true, expires_at: 2100000000, plan_name: '服务端写入快照' });
    return Response.json(result);
  } });
  const prepare = (scope, code) => redemptionOperation(scope, code, { storage: saved, cryptoImpl: webcrypto });
  const h = redemptionHarness({ api, prepare }); await h.submit();
  assert.equal(calls.length, 1); assert.equal(h.state.code, ' test code ');
  assert.equal(h.state.redemption.tone, 'warning'); assert.match(h.state.redemption.message, /结果尚未确认/u);
  assert.equal(h.state.page.me.sponsor.active, false); assert.equal(h.state.refreshes, 0); assert.equal(h.state.historyRevision, 0);
  const rebuilt = memoryStorage(); for (const [key, value] of saved.values) rebuilt.values.set(key, value);
  const retry = redemptionHarness({ api, prepare: (scope, code) => redemptionOperation(scope, code, { storage: rebuilt, cryptoImpl: webcrypto }) });
  await retry.submit();
  assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  assert.equal(retry.state.redemption.tone, 'success'); assert.equal(retry.state.refreshes, 1);
  assert.equal(retry.state.page.me.sponsor.active, false, '写入成功快照也不能替代重新读取的身份');
});
