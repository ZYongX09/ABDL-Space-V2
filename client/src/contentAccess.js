// 独立、仅内存的内容访问投影。不从资料省份/UA/本地持久化推断权限。
export const CONTENT_ACCESS_HEADER = 'X-ABDL-Content-Access';
export const VERIFICATION_PATH = '/settings/baby-verification';
export const CONTENT_REQUIRED_MESSAGE = '请完成宝宝认证后继续访问内容。';
export const CONTENT_UNAVAILABLE_MESSAGE = '内容暂时无法访问，请稍后重试。';
const messages = { open: '', baby_verification_required: CONTENT_REQUIRED_MESSAGE, unavailable: CONTENT_UNAVAILABLE_MESSAGE, pending: '正在确认内容访问权限…' };
const ESSENTIAL_PAGES = new Set(['/login', '/auth/sign_in', '/register', '/auth/sign_up', '/forgot-password', '/beta-register', '/nbw-one-click-register', '/settings', '/account', '/baby-verification', VERIFICATION_PATH, '/sponsors', '/orders', '/app', '/about', '/terms', '/privacy', '/cookies', '/minor-protection', '/nbw-bind-guide']);
export function isEssentialContentPath(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return ESSENTIAL_PAGES.has(path) || ['/admin/', '/oauth/', '/auth/nbw/', '/settings/security/', '/orders/', '/c/'].some(prefix => path.startsWith(prefix)) || path === '/admin' || path === '/oauth' || path === '/settings/security';
}
const essentialAPI = path => /^\/api\/(?:access(?:[/?]|$)|auth(?:[/?]|$)|admin(?:[/?]|$)|app\/human-check(?:[/?]|$)|v1\/baby-verification(?:[/?]|$)|v1\/accounts\/verify_credentials(?:[/?]|$)|v1\/sponsors\/(?:catalog|payment-options|payment-orders|me|redemptions)(?:[/?]|$)|orders(?:[/?]|$)|security(?:[/?]|$)|webauthn(?:[/?]|$)|users\/me(?:[/?]|$)|oauth(?:[/?]|$))/.test(path);
export function readContentAccess(value) {
  if (!value || value.schema_version !== 1 || !['open', 'baby_verification_required', 'unavailable'].includes(value.state) || value.action_path !== VERIFICATION_PATH || typeof value.message !== 'string') throw new Error(CONTENT_UNAVAILABLE_MESSAGE);
  // 不回显任意服务器文本/URL；普通用户提示固定且不披露判断原因。
  return { state: value.state, action_path: VERIFICATION_PATH, message: messages[value.state] };
}
export function contentAccessError(state) {
  return Object.assign(new Error(messages[state] || CONTENT_UNAVAILABLE_MESSAGE), { code: state === 'baby_verification_required' ? state : 'content_access_unavailable', status: state === 'baby_verification_required' ? 403 : 503 });
}
export function createContentAccessStore() {
  let snapshot = { key: null, state: 'pending', message: messages.pending, action_path: VERIFICATION_PATH }, epoch = 0, generation = 0, controller = null;
  const listeners = new Set();
  const publish = next => { snapshot = next; for (const listener of listeners) listener(); };
  const clearCache = () => { if (typeof window !== 'undefined') window.__apiCache?.clear(); };
  const reset = () => { epoch += 1; generation += 1; controller?.abort(); controller = null; clearCache(); publish({ ...snapshot, key: null, state: 'pending', message: messages.pending }); };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getEpoch: () => epoch,
    reset,
    async load(key, request) {
      generation += 1; const ticket = generation; controller?.abort(); const active = new AbortController(); controller = active;
      // 每次新会话确认前不保留旧账号的 open；只读轮询不闪烁已知结果。
      if (snapshot.key !== key) { epoch += 1; clearCache(); publish({ ...snapshot, key, state: 'pending', message: messages.pending }); }
      const timer = setTimeout(() => active.abort(), 5000);
      try {
        const response = await request('/api/access', { method: 'GET', credentials: 'include', cache: 'no-store', redirect: 'error', signal: active.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) throw contentAccessError('unavailable');
        const value = readContentAccess(await response.json());
        if (ticket !== generation) return;
        if (value.state !== snapshot.state) epoch += 1;
        if (value.state !== 'open') clearCache();
        publish({ key, ...value });
      } catch {
        if (ticket === generation) { epoch += 1; clearCache(); publish({ key, state: 'unavailable', action_path: VERIFICATION_PATH, message: CONTENT_UNAVAILABLE_MESSAGE }); }
      } finally { clearTimeout(timer); if (controller === active) controller = null; }
    },
    observe(response, data, path, ticket) {
      if (ticket !== epoch || !/^\/api(?:\/|$)/.test(path) || essentialAPI(path)) return null;
      const header = response.headers.get(CONTENT_ACCESS_HEADER);
      const state = response.status === 403 && header === 'v1:required' && data?.code === 'baby_verification_required' ? 'baby_verification_required'
        : response.status === 503 && header === 'v1:unavailable' && data?.code === 'content_access_unavailable' ? 'unavailable' : null;
      if (!state) return null;
      epoch += 1; generation += 1; controller?.abort(); controller = null; clearCache(); publish({ ...snapshot, state, message: messages[state] });
      return contentAccessError(state);
    },
    assertResponse(path, ticket) { if (/^\/api(?:\/|$)/.test(path) && !essentialAPI(path) && (ticket !== epoch || ['baby_verification_required', 'unavailable'].includes(snapshot.state))) throw contentAccessError(snapshot.state); },
    assertCache() { if (['baby_verification_required', 'unavailable'].includes(snapshot.state)) throw contentAccessError(snapshot.state); },
  };
}
export const contentAccess = createContentAccessStore();
if (typeof window !== 'undefined') window.addEventListener('auth-session-changing', () => contentAccess.reset());
