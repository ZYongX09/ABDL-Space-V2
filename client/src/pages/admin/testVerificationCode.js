import { adminSessionKey, isSuperAdmin } from './access.js';

const TYPES = new Set(['register', 'reset', 'bind']);

export function testVerificationQuery(input) {
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  // 只接受一个精确测试邮箱，不支持通配、批量、子域、控制字符或查询表达式。
  if (/[\u0000-\u001f\u007f]/.test(input?.email) || !/^[a-z0-9][a-z0-9._+-]{0,63}@test\.top$/.test(email) || email.includes('..') || email.includes('.@')) {
    throw new Error('请输入完整的 @test.top 测试邮箱，不支持通配或批量查询');
  }
  if (!TYPES.has(input?.type)) throw new Error('验证码用途必须为 register、reset 或 bind');
  return { email, type: input.type };
}

export function testVerificationResult(data, query, now = Date.now()) {
  if (!data || data.email !== query.email || data.type !== query.type || typeof data.code !== 'string'
    || !/^\d{6}$/.test(data.code) || !Number.isSafeInteger(data.expires_at)
    || !Number.isSafeInteger(data.expires_at * 1000) || data.expires_at * 1000 > 8640000000000000) {
    throw Object.assign(new Error('测试验证码响应格式异常'), { code: 'INVALID_RESPONSE' });
  }
  if (data.expires_at * 1000 <= now) throw Object.assign(new Error('测试验证码已过期，请重新获取邮箱验证码'), { code: 'CODE_EXPIRED' });
  return { email: data.email, type: data.type, code: data.code, expires_at: data.expires_at };
}

/** 独立敏感请求，不经过 apiFetch、公共缓存或离线存储；服务端仍必须复核当前 DB 权限。 */
export async function requestTestVerificationCode(base, input, { user, token = '', signal, isCurrent = () => true, enabled = true } = {}) {
  if (!isSuperAdmin(user)) throw Object.assign(new Error('仅超级管理员可查询测试验证码'), { status: 403 });
  if (!enabled) throw new Error('测试验证码查询需要连接安全服务端');
  const query = testVerificationQuery(input);
  const current = () => {
    signal?.throwIfAborted();
    if (!isSuperAdmin(user) || !isCurrent()) throw new DOMException('会话或查询已失效', 'AbortError');
  };
  current();
  const response = await fetch(`${base}/api/admin/security/test-verification-code`, {
    method: 'POST', credentials: 'include', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(query),
  });
  current();
  let data;
  try { data = await response.json(); } catch (error) {
    current();
    if (error.name === 'AbortError') throw error;
    throw Object.assign(new Error('测试验证码响应格式异常'), { status: response.status, code: 'INVALID_RESPONSE' });
  }
  current();
  if (!response.ok) {
    throw Object.assign(new Error(data?.error || `查询失败 (${response.status})`), {
      status: response.status, code: data?.code ?? `HTTP_${response.status}`,
      retryAfter: response.headers.get('Retry-After') ?? data?.retryAfter ?? null,
    });
  }
  return testVerificationResult(data, query);
}

/** 查询代次 + 会话快照双重防护，即使 fetch 忽略 abort，也不能展示迟到响应。 */
export function createTestVerificationLookup({ request, getSession, onChange, onRejected = () => {}, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  let sequence = 0, controller, timer, disposed = false, blocked = false;
  let state = { pending: false, result: null, error: null, blocked: false };
  const publish = next => { state = next; if (!disposed) onChange(state); };
  const clear = () => {
    sequence += 1;
    controller?.abort(); controller = null;
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    publish({ pending: false, result: null, error: null, blocked });
  };
  const expire = () => { if (state.result && state.result.expires_at * 1000 <= now()) clear(); };
  return {
    clear,
    expire,
    block() { blocked = true; clear(); },
    dispose() { disposed = true; clear(); },
    getState() { expire(); return state; },
    async query(input) {
      if (disposed) return;
      clear(); // 包括无效输入在内，每次显式查询都先抹掉旧码。
      const session = getSession();
      const key = adminSessionKey(session?.user, session?.token);
      const generation = sequence;
      const current = () => !disposed && !blocked && generation === sequence
        && isSuperAdmin(getSession()?.user) && key === adminSessionKey(getSession()?.user, getSession()?.token);
      try {
        if (blocked || !isSuperAdmin(session?.user)) throw Object.assign(new Error('当前会话无查询权限'), { status: 403 });
        const query = testVerificationQuery(input);
        controller = new AbortController();
        publish({ pending: true, result: null, error: null, blocked: false });
        const data = await request(query, { user: session.user, token: session.token, signal: controller.signal, isCurrent: current });
        if (!current()) return;
        const result = testVerificationResult(data, query, now());
        publish({ pending: false, result, error: null, blocked: false });
        const check = () => {
          if (!current()) { clear(); return; }
          if (result.expires_at * 1000 <= now()) { clear(); return; }
          timer = schedule(check, Math.min(2147483647, result.expires_at * 1000 - now()));
        };
        check();
      } catch (error) {
        if (generation !== sequence || disposed || blocked) return;
        // 当前权限已变化的旧响应（包括 401/403）不能影响新会话。
        if (key !== adminSessionKey(getSession()?.user, getSession()?.token)) { clear(); return; }
        if (error.name !== 'AbortError') {
          publish({ pending: false, result: null, error, blocked: false });
          // TEST_EMAIL_REQUIRED 是输入限制，不是权限变化；其余 403 仍按撤权处理。
          if (error.status === 401 || (error.status === 403 && error.code !== 'TEST_EMAIL_REQUIRED')) { blocked = true; clear(); onRejected(error, key); }
        } else clear();
      }
    },
  };
}
