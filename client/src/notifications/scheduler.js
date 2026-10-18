export const POLL_INTERVAL = 30_000;
export const REQUEST_TIMEOUT = 15_000;
const BACKOFF = [30_000, 60_000, 120_000, 300_000];
const MAX_TIMER = 2_147_483_647;

// 保留原始 Retry-After 到调度时再解析；HTTP-date 与超过 300 秒的服务端冷却都有效。
export function retryAfterDelay(value, now = Date.now()) {
  if (value === null || value === undefined || value === '') return 0;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) {
    const delay = Number(text) * 1000;
    return Number.isFinite(delay) ? delay : 0;
  }
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

// 资料/头像刷新不产生新 session；账号或凭据变化才重置请求预算。
export function accountSessionKey(user, accounts = []) {
  if (user?.id === undefined || user?.id === null) return null;
  const token = accounts.find(account => String(account.id) === String(user.id))?.token || '';
  return JSON.stringify([String(user.id), token]);
}

// 为一次聊天加载提供总时限；也处理忽略 abort 的底层 promise，绝不自动重放写入。
export function runWithDeadline(task, { signal, timeout = REQUEST_TIMEOUT } = {}) {
  const controller = new AbortController();
  return new Promise((resolve, reject) => {
    let timer;
    let settled = false;
    const finish = (value, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(value);
    };
    const abort = () => {
      controller.abort();
      finish(undefined, signal.reason || new DOMException('请求已取消', 'AbortError'));
    };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => {
      const error = new Error('请求超时，请稍后重试');
      error.code = 'REQUEST_TIMEOUT';
      controller.abort();
      finish(undefined, error);
    }, timeout);
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return undefined;
      return task(controller.signal);
    }).then(value => finish(value), error => finish(undefined, error));
  });
}

/** 无 React/DOM 依赖的读取调度器。所有入口（包括手动刷新）共享同一个资源预算。 */
export function createRequestScheduler({ resources, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, interval = POLL_INTERVAL, timeout = REQUEST_TIMEOUT }) {
  let session = null;
  let generation = 0;
  let visible = false;
  let paused = false;
  const listeners = new Set();
  const states = Object.fromEntries(Object.keys(resources).map(name => [name, {
    data: null, error: null, nextAt: 0, failures: 0, revision: 0, timer: null, flight: null,
  }]));
  let snapshot;

  function publish() {
    snapshot = {
      session, generation, paused,
      resources: Object.fromEntries(Object.entries(states).map(([name, state]) => [name, {
        data: state.data, error: state.error, loading: !!state.flight, nextAt: state.nextAt,
      }])),
    };
    listeners.forEach(listener => listener());
  }
  const active = () => session !== null && visible && !paused;
  function clearSchedule(state) {
    if (state.timer !== null) clearTimer(state.timer);
    state.timer = null;
  }
  function cancel(state, keepCooldown = true) {
    clearSchedule(state);
    if (!state.flight) return;
    const flight = state.flight;
    state.flight = null;
    if (keepCooldown) state.nextAt = Math.max(state.nextAt, now() + interval);
    flight.cancel();
  }
  function arm(name) {
    const state = states[name];
    clearSchedule(state);
    if (!active() || state.flight) return;
    // 长 Retry-After 分段等待，不能被浏览器的 32 位 timer 溢出变成立即重试。
    state.timer = setTimer(() => {
      state.timer = null;
      if (now() < state.nextAt) arm(name);
      else start(name);
    }, Math.min(MAX_TIMER, Math.max(0, state.nextAt - now())));
  }
  function start(name) {
    const state = states[name];
    if (state.flight) return state.flight.promise;
    if (!active()) return Promise.resolve(undefined);
    if (now() < state.nextAt) { arm(name); return Promise.resolve(undefined); }
    clearSchedule(state);
    const controller = new AbortController();
    const ownGeneration = generation;
    const ownRevision = state.revision;
    let resolve;
    let settled = false;
    let deadline;
    const promise = new Promise(done => { resolve = done; });
    const flight = { promise, cancel: () => {
      finish(undefined, undefined, true);
      controller.abort();
    } };
    state.flight = flight;
    function finish(data, error, cancelled = false) {
      if (settled) return;
      settled = true;
      clearTimer(deadline);
      const current = state.flight === flight && generation === ownGeneration && state.revision === ownRevision && active();
      if (state.flight === flight) state.flight = null;
      if (current && !cancelled) {
        if (error) {
          state.error = error;
          const delay = BACKOFF[Math.min(state.failures++, BACKOFF.length - 1)];
          state.nextAt = now() + Math.max(delay, Number(error.status) === 429 ? retryAfterDelay(error.retryAfter, now()) : 0);
          if (Number(error.status) === 401) {
            // 401 暂停整个当前 session；切到新 session 才允许重新开始。
            paused = true;
            generation++;
            Object.values(states).forEach(peer => {
              cancel(peer);
              peer.data = null; // 认证失效不能继续展示之前成功的私有 snapshot。
            });
          }
        } else {
          state.data = data;
          state.error = null;
          state.failures = 0;
          state.nextAt = now() + interval;
        }
        publish();
        arm(name);
      }
      resolve(current && !error && !cancelled ? data : undefined);
    }
    deadline = setTimer(() => {
      const error = new Error('请求超时，请稍后重试');
      error.code = 'REQUEST_TIMEOUT';
      finish(undefined, error);
      controller.abort();
    }, timeout);
    publish();
    // 显式接住晚到的 resolve/reject，即使底层忽略 abort 也不能修改新 generation。
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return undefined;
      return resources[name]({ signal: controller.signal });
    }).then(data => finish(data), error => finish(undefined, error));
    return promise;
  }
  publish();
  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot: () => snapshot,
    capture: () => generation,
    isCurrent: token => token === generation && active(),
    setSession(next) {
      if (session === next) return;
      generation++;
      Object.values(states).forEach(state => {
        cancel(state, false);
        Object.assign(state, { data: null, error: null, nextAt: 0, failures: 0, revision: state.revision + 1 });
      });
      session = next;
      paused = false;
      publish();
      Object.keys(states).forEach(arm);
    },
    setVisible(next) {
      if (visible === next) return;
      visible = next;
      if (!visible) {
        generation++;
        Object.values(states).forEach(state => cancel(state));
        publish();
      } else Object.keys(states).forEach(arm);
    },
    refresh: name => start(name),
    invalidate(name, update) {
      const state = states[name];
      state.revision++;
      cancel(state);
      state.nextAt = Math.max(state.nextAt, now() + interval);
      state.data = update(state.data);
      publish();
      arm(name);
    },
  };
}
