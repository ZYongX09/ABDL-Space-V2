// 仅管理 NBW 上游域名切换：两个域名由后端固定下发，不可自填；没有令牌、密码、CAS 版本或持久化草稿。
export const NBW_UPSTREAM_HOST_PATH = '/api/admin/nbw/upstream-host';
export const NBW_PRIMARY_HOST = 'www.newbabyworld.top';
export const NBW_BACKUP_HOST = 'nbw.abdlcalendar.top';
export const NBW_UPSTREAM_MODES = Object.freeze({ primary: '主域名', backup: '备用域名' });
export const DEFAULT_NBW_UPSTREAM = Object.freeze({ mode: 'primary', host: NBW_PRIMARY_HOST, primary_host: NBW_PRIMARY_HOST, backup_host: NBW_BACKUP_HOST });
const MESSAGES = Object.freeze({
  INVALID_RESPONSE: 'NBW 上游域名响应格式异常，请重新加载或联系服务器管理员。',
  INVALID_BODY: 'NBW 上游域名无效：只能选择主域名或备用域名，不能自填其他域名。',
  UNAUTHORIZED: '管理员会话已失效，请重新登录后加载上游域名。',
  FORBIDDEN: '当前账号无权管理 NBW 上游域名，请确认管理员身份。',
  UNAVAILABLE: 'NBW 上游域名服务暂不可用；未将失败视为默认主域名，请重新加载确认。',
  REQUEST_FAILED: 'NBW 上游域名请求失败，选择已保留；服务器状态未确认，请重新加载后再保存。',
  CANCELLED: '已取消当前请求；这不代表服务器切换被撤回，请重新加载确认。',
});

export class NBWUpstreamError extends Error {
  constructor(code = 'REQUEST_FAILED', status) {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'REQUEST_FAILED';
    super(MESSAGES[safeCode]);
    this.name = safeCode === 'CANCELLED' ? 'AbortError' : 'NBWUpstreamError';
    this.code = safeCode;
    if (Number.isInteger(status) && status >= 400 && status <= 599) this.status = status;
  }
}

// 只保留固定安全文案；不透传原始 message、code、cause、响应体或请求体。
export function sanitizeNBWUpstreamError(error, signal) {
  if (signal?.aborted || error?.name === 'AbortError') return new NBWUpstreamError('CANCELLED');
  if (error instanceof NBWUpstreamError) return new NBWUpstreamError(error.code, error.status);
  const codes = { 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 422: 'INVALID_BODY', 503: 'UNAVAILABLE' };
  return new NBWUpstreamError(codes[error?.status] || 'REQUEST_FAILED', error?.status);
}

const exactFields = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));

// PUT 只发送精确单字段 {mode}；不接收 host、revision、确认框或任何附加属性。
export function nbwUpstreamPayload(mode) {
  if (typeof mode !== 'string' || !Object.hasOwn(NBW_UPSTREAM_MODES, mode)) throw new NBWUpstreamError('INVALID_BODY');
  return { mode };
}

// GET 投影必须严格四字段：mode 枚举内，且 host 与所选模式的固定域名完全一致。
export function readNBWUpstream(data) {
  if (!exactFields(data, ['mode', 'host', 'primary_host', 'backup_host']) || !Object.hasOwn(NBW_UPSTREAM_MODES, data.mode)
    || typeof data.host !== 'string' || !data.host
    || data.primary_host !== NBW_PRIMARY_HOST || data.backup_host !== NBW_BACKUP_HOST
    || data.host !== (data.mode === 'primary' ? NBW_PRIMARY_HOST : NBW_BACKUP_HOST)) throw new NBWUpstreamError('INVALID_RESPONSE');
  return Object.freeze({ mode: data.mode, host: data.host, primary_host: data.primary_host, backup_host: data.backup_host });
}

export function isNBWUpstreamDirty(saved, draft) {
  return !!saved && draft !== saved.mode;
}

export const initialNBWUpstreamState = () => ({ saved: null, draft: 'primary', loading: true, saving: false, needsReload: true, error: '', notice: '' });

// 每次挂载与 StrictMode effect setup 各有独立代次。取消/换号不把晚到响应视为当前保存成功；
// 无 revision/CAS，PUT 末写生效：保存失败仅在 401/403/503/无效响应时要求重载，普通网络失败可直接重试保存。
export function createNBWUpstreamEditor(api, { onChange = () => {} } = {}) {
  let state = initialNBWUpstreamState(), generation = 0, controller = null, disposed = false;
  const publish = patch => { state = { ...state, ...patch }; if (!disposed) onChange(state); };
  const invalidate = () => { generation += 1; controller?.abort(); controller = null; };
  const begin = () => {
    invalidate();
    const ticket = generation;
    controller = new AbortController();
    const signal = controller.signal;
    return { signal, current: () => !disposed && ticket === generation && !signal.aborted };
  };
  const accept = value => {
    const saved = readNBWUpstream(value);
    publish({ saved, draft: saved.mode, loading: false, saving: false, needsReload: false, error: '', notice: '' });
  };
  return {
    getState: () => state,
    async load() {
      if (disposed) return false;
      const request = begin();
      publish({ loading: true, saving: false, needsReload: true, error: '', notice: '' });
      try {
        const result = await api.nbwUpstreamHost({ signal: request.signal });
        if (!request.current()) return false;
        accept(result); return true;
      } catch (error) {
        if (request.current()) publish({ loading: false, error: sanitizeNBWUpstreamError(error, request.signal).message });
        return false;
      } finally { if (request.current()) controller = null; }
    },
    change(mode) {
      if (disposed || state.loading || state.saving || state.needsReload) return;
      if (typeof mode !== 'string' || !Object.hasOwn(NBW_UPSTREAM_MODES, mode) || mode === state.draft) return;
      publish({ draft: mode, error: '', notice: '' });
    },
    async save() {
      if (disposed || !state.saved || state.loading || state.saving || state.needsReload) return false;
      let payload;
      try { payload = nbwUpstreamPayload(state.draft); }
      catch (error) { publish({ error: sanitizeNBWUpstreamError(error).message, notice: '' }); return false; }
      const request = begin();
      publish({ saving: true, error: '', notice: '' });
      try {
        const result = await api.saveNBWUpstreamHost(payload.mode, { signal: request.signal });
        if (!request.current()) return false;
        accept(result);
        publish({ notice: 'NBW 上游域名已切换，对后续调用立即生效；不会自动重试已失败的请求。' });
        return true;
      } catch (error) {
        if (request.current()) {
          const safe = sanitizeNBWUpstreamError(error, request.signal);
          publish({ saving: false, needsReload: ['UNAUTHORIZED', 'FORBIDDEN', 'INVALID_BODY', 'INVALID_RESPONSE', 'UNAVAILABLE'].includes(safe.code), error: safe.message });
        }
        return false;
      } finally { if (request.current()) controller = null; }
    },
    cancel() {
      if (disposed || !controller) return;
      invalidate(); publish({ loading: false, saving: false, needsReload: true, error: MESSAGES.CANCELLED, notice: '' });
    },
    dispose() { disposed = true; invalidate(); state = initialNBWUpstreamState(); },
  };
}
