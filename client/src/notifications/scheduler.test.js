import test from 'node:test';
import assert from 'node:assert/strict';
import { accountSessionKey, createRequestScheduler, retryAfterDelay, runWithDeadline } from './scheduler.js';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function clock() {
  let time = 1_700_000_000_000, id = 0;
  const timers = new Map();
  return {
    now: () => time,
    setTimer: (callback, delay) => { const key = ++id; timers.set(key, { at: time + delay, callback }); return key; },
    clearTimer: key => timers.delete(key),
    async tick(ms) {
      const end = time + ms;
      await flush();
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].callback(); await flush();
      }
      time = end; await flush();
    },
    count: () => timers.size,
  };
}
function setup(resources, options = {}) {
  const time = clock();
  const scheduler = createRequestScheduler({ resources, ...time, ...options });
  scheduler.setSession('A');
  scheduler.setVisible(true);
  return { scheduler, time };
}
const failure = (status = 500, retryAfter = null) => Object.assign(new Error('fixture'), { status, retryAfter });

test('稳定账号 session 不跟随 user/toast 对象、资料和账户列表引用变化', () => {
  const accounts = [{ id: 1, token: 'a' }, { id: 2, token: 'b' }];
  const key = accountSessionKey({ id: 1, username: 'before' }, accounts);
  assert.equal(key, accountSessionKey({ id: 1, username: 'after', avatar: 'new' }, [...accounts]));
  assert.notEqual(key, accountSessionKey({ id: 2 }, accounts));
  assert.notEqual(key, accountSessionKey({ id: 1 }, [{ id: 1, token: 'rotated' }]));
  assert.equal(accountSessionKey(null), null);
});

test('完成后 30 秒再拉取；同资源 singleflight、独立资源互不等待', async () => {
  const slow = deferred(); let a = 0, b = 0;
  const { scheduler, time } = setup({ a: () => { a++; return slow.promise; }, b: async () => ++b }, { timeout: 120_000 });
  await time.tick(0);
  const first = scheduler.refresh('a');
  assert.equal(first, scheduler.refresh('a'));
  await time.tick(31_000);
  assert.equal(a, 1); assert.equal(b, 2);
  slow.resolve('done'); await flush();
  assert.equal(scheduler.getSnapshot().resources.a.nextAt, time.now() + 30_000);
  await time.tick(29_999); assert.equal(a, 1);
  await time.tick(1); assert.equal(a, 2);
  scheduler.setVisible(false); assert.equal(time.count(), 0);
});

test('失败按 30/60/120/300/300 秒退避，成功重置；手动入口不能穿透冷却', async () => {
  let calls = 0, fail = true;
  const { scheduler, time } = setup({ a: async () => { calls++; if (fail) throw failure(); return 'ok'; } });
  await time.tick(0);
  for (const delay of [30_000, 60_000, 120_000, 300_000, 300_000]) {
    assert.equal(scheduler.getSnapshot().resources.a.nextAt, time.now() + delay);
    const before = calls;
    await scheduler.refresh('a'); await scheduler.refresh('a');
    await time.tick(delay - 1); assert.equal(calls, before);
    await time.tick(1); assert.equal(calls, before + 1);
  }
  fail = false; await time.tick(300_000);
  assert.equal(scheduler.getSnapshot().resources.a.error, null);
  assert.equal(scheduler.getSnapshot().resources.a.nextAt, time.now() + 30_000);
});

test('Retry-After 支持秒数/HTTP-date/无效值，不把 >300 秒及超长 timer 截短', async () => {
  const now = Date.UTC(2026, 9, 18);
  assert.equal(retryAfterDelay('901', now), 901_000);
  assert.equal(retryAfterDelay(new Date(now + 900_000).toUTCString(), now), 900_000);
  assert.equal(retryAfterDelay('garbage', now), 0);
  assert.equal(retryAfterDelay('-1', now), 0);
  let calls = 0;
  const { scheduler, time } = setup({ a: async () => { calls++; throw failure(429, '3600'); } });
  await time.tick(0); const deadline = scheduler.getSnapshot().resources.a.nextAt;
  scheduler.setVisible(false); await time.tick(30_000); scheduler.setVisible(true);
  for (let i = 0; i < 20; i++) await scheduler.refresh('a');
  await time.tick(3_569_999); assert.equal(calls, 1);
  assert.equal(scheduler.getSnapshot().resources.a.nextAt, deadline);
  await time.tick(1); assert.equal(calls, 2);
  const huge = setup({ a: async () => { throw failure(429, '3000000'); } });
  await huge.time.tick(0); await huge.time.tick(2_147_483_647);
  assert.equal(huge.scheduler.getSnapshot().resources.a.loading, false);
});

test('429 HTTP-date 与错误退避取较长值，坏头不导致热循环', async () => {
  const time = clock(); let calls = 0;
  const scheduler = createRequestScheduler({ ...time, resources: { a: async () => { calls++; throw failure(429, calls === 1 ? new Date(time.now() + 900_000).toUTCString() : 'invalid'); } } });
  scheduler.setSession('A'); scheduler.setVisible(true); await time.tick(0);
  assert.equal(scheduler.getSnapshot().resources.a.nextAt, time.now() + 900_000);
  await time.tick(900_000);
  assert.equal(scheduler.getSnapshot().resources.a.nextAt, time.now() + 60_000);
});

test('401 暂停当前整个 session，abort 另一个资源；同账号资料刷新不复活，新 session 可恢复', async () => {
  let calls = 0, peerSignal;
  const peer = deferred();
  const { scheduler, time } = setup({ a: async () => { calls++; throw failure(401); }, b: ({ signal }) => { peerSignal = signal; return peer.promise; } });
  await time.tick(0);
  assert.equal(scheduler.getSnapshot().paused, true);
  // 同一 tick 上更早返回401时，尚未发出的 peer 也可以直接取消。
  assert.equal(peerSignal === undefined || peerSignal.aborted, true);
  scheduler.setVisible(false); scheduler.setVisible(true); scheduler.setSession('A');
  await scheduler.refresh('a'); await time.tick(600_000); assert.equal(calls, 1);
  scheduler.setSession('A-new-token'); await time.tick(0); assert.equal(calls, 2);
});

test('成功私有 snapshot 后 401 清空全部资源且保持暂停，旧结果和手动/可见恢复不能复活', async () => {
  let denied = false, a = 0, b = 0;
  const { scheduler, time } = setup({
    notifications: async () => { a++; if (denied) throw failure(401); return { private: 'notification-A' }; },
    conversations: async () => { b++; return { private: 'conversation-A' }; },
  });
  await time.tick(0);
  assert.equal(scheduler.getSnapshot().resources.notifications.data.private, 'notification-A');
  assert.equal(scheduler.getSnapshot().resources.conversations.data.private, 'conversation-A');
  denied = true; await time.tick(30_000);
  assert.equal(scheduler.getSnapshot().paused, true);
  for (const resource of Object.values(scheduler.getSnapshot().resources)) { assert.equal(resource.data, null); assert.equal(resource.loading, false); }
  const before = [a, b];
  scheduler.setVisible(false); scheduler.setVisible(true);
  await scheduler.refresh('conversations'); await scheduler.refresh('notifications'); await time.tick(600_000);
  assert.deepEqual([a, b], before);
  denied = false; scheduler.setSession('B'); await time.tick(0);
  assert.equal(scheduler.getSnapshot().paused, false);
  assert.notEqual(scheduler.getSnapshot().resources.conversations.data, null);
});

test('初始隐藏不发请求；隐藏取消在途，恢复及重复可见事件尊重冷却', async () => {
  const time = clock(), wait = deferred(); let calls = 0, signal;
  const scheduler = createRequestScheduler({ ...time, resources: { a: options => { calls++; signal = options.signal; return wait.promise; } } });
  scheduler.setSession('A'); await time.tick(100_000); assert.equal(calls, 0);
  scheduler.setVisible(true); await time.tick(0); assert.equal(calls, 1);
  scheduler.setVisible(false); assert.equal(signal.aborted, true); assert.equal(time.count(), 0);
  wait.resolve('old'); await flush(); assert.equal(scheduler.getSnapshot().resources.a.data, null);
  scheduler.setVisible(true); scheduler.setVisible(true); await scheduler.refresh('a');
  await time.tick(29_999); assert.equal(calls, 1);
  await time.tick(1); assert.equal(calls, 2);
});

test('直接 A-B、A-B-A 与注销都 abort，旧代返回不能写入新 session', async () => {
  const pending = [], signals = [];
  const { scheduler, time } = setup({ a: ({ signal }) => { const wait = deferred(); pending.push(wait); signals.push(signal); return wait.promise; } });
  await time.tick(0);
  scheduler.setSession('B'); await time.tick(0); assert.equal(signals[0].aborted, true);
  scheduler.setSession('A'); await time.tick(0); assert.equal(signals[1].aborted, true);
  pending[0].resolve('old A'); pending[1].reject(failure()); await flush();
  assert.equal(scheduler.getSnapshot().resources.a.data, null);
  pending[2].resolve('new A'); await flush(); assert.equal(scheduler.getSnapshot().resources.a.data, 'new A');
  await time.tick(30_000); scheduler.setSession(null);
  assert.equal(signals[3].aborted, true);
  pending[3].resolve('after logout'); await flush();
  assert.equal(scheduler.getSnapshot().resources.a.data, null); assert.equal(time.count(), 0);
});

test('超时有界，底层忽略 abort 的晚结果不能覆盖，后续按错误退避', async () => {
  const wait = deferred(); let signal;
  const { scheduler, time } = setup({ a: options => { signal = options.signal; return wait.promise; } });
  await time.tick(0); const promise = scheduler.refresh('a');
  await time.tick(15_000);
  assert.equal(await promise, undefined); assert.equal(signal.aborted, true);
  assert.equal(scheduler.getSnapshot().resources.a.error.code, 'REQUEST_TIMEOUT');
  assert.equal(scheduler.getSnapshot().resources.a.nextAt, time.now() + 30_000);
  wait.resolve('too late'); await flush(); assert.equal(scheduler.getSnapshot().resources.a.data, null);
});

test('read 成功后 invalidation 取消旧 snapshot，保留本地已读且冷却内不自动补拉', async () => {
  const stale = deferred(); let calls = 0, signal;
  const { scheduler, time } = setup({ conversations: options => {
    calls++; signal = options.signal;
    return calls === 1 ? Promise.resolve({ conversations: [{ user_id: 2, unread: 3 }] }) : stale.promise;
  } });
  await time.tick(0); await time.tick(30_000); assert.equal(calls, 2);
  scheduler.invalidate('conversations', data => ({ ...data, conversations: data.conversations.map(c => ({ ...c, unread: 0 })) }));
  assert.equal(signal.aborted, true);
  stale.resolve({ conversations: [{ user_id: 2, unread: 3 }] }); await flush();
  assert.equal(scheduler.getSnapshot().resources.conversations.data.conversations[0].unread, 0);
  await scheduler.refresh('conversations'); await time.tick(29_999); assert.equal(calls, 2);
});

test('卸载等价的 visible=false 清理所有 timer/flight，subscribe可移除', async () => {
  let events = 0;
  const { scheduler, time } = setup({ a: async () => 1 });
  const unsubscribe = scheduler.subscribe(() => events++);
  await time.tick(0); assert.ok(events > 0);
  unsubscribe(); const before = events;
  scheduler.setVisible(false); assert.equal(time.count(), 0);
  await time.tick(600_000); assert.equal(events, before);
});

test('单次聊天/写请求 deadline 可取消及限时，不自动重试', async () => {
  let calls = 0;
  await assert.rejects(runWithDeadline(() => { calls++; return new Promise(() => {}); }, { timeout: 5 }), { code: 'REQUEST_TIMEOUT' });
  assert.equal(calls, 1);
  const controller = new AbortController();
  const pending = runWithDeadline(() => new Promise(() => {}), { signal: controller.signal });
  controller.abort(); await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(runWithDeadline(() => { throw new Error('write rejected'); }), /write rejected/);
});
