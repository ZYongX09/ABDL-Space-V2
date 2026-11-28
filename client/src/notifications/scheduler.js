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

/** 无 React/DOM 依赖的读取调度器。详情与轮询共用同一资源预算。 */
export function createRequestScheduler({ resources, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, interval = POLL_INTERVAL, timeout = REQUEST_TIMEOUT, quietIntervals = {} }) {
  let session = null;
  let generation = 0;
  let visible = false;
  let paused = false;
  let quotaUntil = 0;
  let quotaError = null;
  const listeners = new Set();
  const states = Object.fromEntries(Object.keys(resources).map(name => [name, {
    data: null, error: null, nextAt: 0, failures: 0, revision: 0, timer: null, flight: null,
    requestedDetails: null, detailKey: null, details: null, urgent: false, write: null,
  }]));
  let snapshot;

  const active = () => session !== null && visible && !paused;
  function publish() {
    snapshot = {
      session, generation, paused,
      resources: Object.fromEntries(Object.entries(states).map(([name, state]) => [name, {
        data: state.data, error: quotaUntil > now() ? quotaError : state.error,
        loading: !!state.flight || !!state.write, nextAt: Math.max(state.nextAt, quotaUntil),
        detailKey: state.detailKey, details: state.details,
      }])),
    };
    listeners.forEach(listener => listener());
  }
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
  function cancelWrite(state) {
    const write = state.write;
    state.write = null;
    write?.abort();
  }
  function invalidate(state, update) {
    state.revision++;
    cancel(state);
    state.nextAt = Math.max(state.nextAt, now() + interval);
    state.data = update(state.data);
    if (state.details !== null) state.details = update(state.details);
  }
  function arm(name) {
    const state = states[name];
    clearSchedule(state);
    if (!active() || state.flight || state.write) return;
    // 长 Retry-After 分段等待，不能被浏览器的 32 位 timer 溢出变成立即重试。
    state.timer = setTimer(() => { state.timer = null; start(name); },
      Math.min(MAX_TIMER, Math.max(0, Math.max(state.nextAt, quotaUntil) - now())));
  }
  function onFailure(state, error) {
    state.error = error;
    const status = Number(error.status);
    const at = now();
    const backoff = BACKOFF[Math.min(state.failures++, BACKOFF.length - 1)];
    const retry = status === 429 || status === 503 ? retryAfterDelay(error.retryAfter, at) : 0;
    state.nextAt = at + Math.max(backoff, retry);
    if ((status === 429 || status === 503) && error.code === 'D1_DAILY_QUOTA_EXHAUSTED' && retry > 0) {
      // The server's quota is account-wide. Navigating, restoring the tab, or changing the
      // signed-in community account must not restart either poll before that deadline.
      if (state.nextAt >= quotaUntil) { quotaUntil = state.nextAt; quotaError = error; }
      Object.keys(states).forEach(arm);
    }
    if (status === 401) {
      paused = true;
      generation++;
      Object.values(states).forEach(peer => {
        cancel(peer);
        cancelWrite(peer);
        peer.data = null;
        peer.detailKey = null;
        peer.details = null;
      });
    }
  }
  function start(name) {
    const state = states[name];
    if (state.flight) return state.flight.promise;
    if (!active() || state.write) return Promise.resolve(undefined);
    if (now() < Math.max(state.nextAt, quotaUntil)) { arm(name); return Promise.resolve(undefined); }
    clearSchedule(state);
    const controller = new AbortController();
    const ownGeneration = generation;
    const ownRevision = state.revision;
    const detailKey = state.requestedDetails;
    state.urgent = false;
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
          onFailure(state, error);
        } else {
          state.data = data;
          if (detailKey !== null && detailKey === state.requestedDetails) {
            state.detailKey = detailKey;
            state.details = data;
          }
          state.error = null;
          state.failures = 0;
          state.nextAt = now() + (state.urgent ? 0 : state.requestedDetails === null ? quietIntervals[name] ?? interval : interval);
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
      return resources[name]({ signal: controller.signal, details: detailKey !== null });
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
        cancelWrite(state);
        Object.assign(state, { data: null, error: null, nextAt: 0, failures: 0, revision: state.revision + 1, detailKey: null, details: null, urgent: false });
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
        Object.values(states).forEach(state => { cancel(state); cancelWrite(state); });
        publish();
      } else Object.keys(states).forEach(arm);
    },
    setDetails(name, key) {
      const state = states[name];
      if (state.requestedDetails === key) return;
      state.requestedDetails = key;
      state.detailKey = null;
      state.details = null;
      state.urgent = key !== null;
      // Opening a page may bypass the normal interval, but not a server/error cooldown.
      if (state.urgent && !state.error) state.nextAt = 0;
      publish();
      arm(name);
    },
    refresh: name => start(name),
    invalidate(name, update) {
      invalidate(states[name], update);
      publish();
      arm(name);
    },
    async mutate(name, task, update, viewKey = null) {
      const state = states[name];
      if (!active() || state.write || quotaUntil > now() || (state.error && state.nextAt > now())) return;
      if (viewKey !== null && (state.requestedDetails !== viewKey || state.detailKey !== viewKey)) return;
      cancel(state);
      const controller = new AbortController();
      const ownGeneration = generation;
      state.write = controller;
      publish();
      try {
        await runWithDeadline(task, { signal: controller.signal, timeout });
        if (state.write === controller && ownGeneration === generation && active()) invalidate(state, update);
      } catch (error) {
        if (state.write === controller && ownGeneration === generation && active()) {
          onFailure(state, error);
          if (ownGeneration !== generation) publish(); // 401 clears the current private snapshot immediately.
        }
      } finally {
        if (state.write === controller) state.write = null;
        if (ownGeneration === generation) { publish(); arm(name); }
      }
    },
  };
}
