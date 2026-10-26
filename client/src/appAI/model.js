// 新版 App AI 配置只保存服务端元数据；令牌不进入 React 状态、缓存或持久化草稿。
export const APP_AI_PROVIDER_PATH = '/api/admin/app-ai/provider';
export const DEFAULT_APP_AI_PROVIDER = Object.freeze({ base_url: 'https://api.deepseek.com', model_id: 'deepseek-chat', token_configured: false, revision: '0' });
export const DEFAULT_APP_AI_HOSTS = Object.freeze(['api.deepseek.com', 'api.openai.com', 'openrouter.ai', 'api.siliconflow.cn', 'api.groq.com', 'dashscope.aliyuncs.com']);
export const TOKEN_ACTIONS = Object.freeze(['keep', 'replace', 'clear']);

const MESSAGES = Object.freeze({
  INVALID_RESPONSE: 'App AI 配置响应格式异常，请重新加载或联系服务器管理员。',
  INVALID_BODY: 'App AI 配置字段无效，请检查后重试。',
  INVALID_URL: '接口地址须为 HTTPS 公网域名，不能包含账号、密码、查询参数、片段或非标准端口；自定义域名须先由服务器环境批准。',
  INVALID_MODEL: '模型名称须为 1–200 个可见 ASCII 字符，不能包含空白或控制字符。',
  INVALID_REVISION: '配置版本无效，请重新加载后再保存。',
  INVALID_TOKEN: '替换令牌时必须填写非空令牌，不能包含空白或控制字符。',
  CLEAR_CONFIRMATION: '清除令牌前，请勾选确认复选框。',
  TOKEN_REPLACE_REQUIRED: '更换接口来源时不能沿用已保存令牌，请选择替换新令牌或确认清除，防止向新主机发送原令牌。',
  UNAUTHORIZED: '管理员会话已失效，请重新登录后加载配置。',
  FORBIDDEN: '当前账号无权管理 App AI 配置，请确认管理员身份。',
  CONFLICT: '配置已被其他管理员更新；草稿未覆盖服务器，必须重新加载后再保存。',
  UNAVAILABLE: 'App AI 配置服务暂不可用，请稍后重新加载；未将失败视为默认配置。',
  REQUEST_FAILED: 'App AI 配置请求失败；地址和模型草稿已保留，请重新加载确认服务器状态。',
  CANCELLED: '操作已取消；服务器状态未确认，请重新加载后再保存。',
});

export class AppAIError extends Error {
  constructor(code = 'REQUEST_FAILED', status) {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'REQUEST_FAILED';
    super(MESSAGES[safeCode]);
    this.name = safeCode === 'CANCELLED' ? 'AbortError' : 'AppAIError';
    this.code = safeCode;
    if (Number.isInteger(status) && status >= 400 && status <= 599) this.status = status;
  }
}

// 不保留原始 message、code、cause、响应体或请求体，防止后端/网络错误回显令牌。
export function sanitizeAppAIError(error, signal) {
  if (signal?.aborted || error?.name === 'AbortError') return new AppAIError('CANCELLED');
  if (error instanceof AppAIError) return new AppAIError(error.code, error.status);
  const status = error?.status;
  const codes = { 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 409: 'CONFLICT', 503: 'UNAVAILABLE' };
  return new AppAIError(status === 422 && error?.code === 'token_replace_required' ? 'TOKEN_REPLACE_REQUIRED' : codes[status] || 'REQUEST_FAILED', status);
}

const exactFields = (data, fields) => data !== null && typeof data === 'object' && !Array.isArray(data)
  && Reflect.ownKeys(data).length === fields.length && fields.every(key => Object.hasOwn(data, key));
// revision 是不透明 CAS 快照，除校验传输格式外不解析、不自增、不构造下一版本。
const validRevision = value => typeof value === 'string' && /^(?:0|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.test(value);

export function providerBaseURL(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\u0000-\u001f\u007f\\@%?#]/u.test(value)) throw new AppAIError('INVALID_URL');
  let url;
  try { url = new URL(value); } catch { throw new AppAIError('INVALID_URL'); }
  const host = url.hostname.toLowerCase();
  const path = /^https:\/\/[^/]+(\/.*)?$/i.exec(value)?.[1] || '';
  if (!/^https:\/\//i.test(value) || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.port
    || !host.includes('.') || host.endsWith('.') || /^[\d.]+$/.test(host) || host.includes(':')
    || /(?:^|\.)(?:localhost|local|internal|invalid|test)$/.test(host)
    || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
    || !/^[A-Za-z0-9/._~-]*$/.test(path) || path.split('/').some(segment => segment === '.' || segment === '..')) throw new AppAIError('INVALID_URL');
  // 允许输入自定义公网域名不等于批准；最终批准名单与 SSRF 防护必须由服务器执行。
  return (url.origin + url.pathname).replace(/\/+$/, '');
}

const modelID = value => {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,200}$/.test(value)) throw new AppAIError('INVALID_MODEL');
  return value;
};

export function providerOriginChangeRequiresToken(saved, draft) {
  if (!saved?.token_configured || draft?.token_action !== 'keep') return false;
  try { return new URL(providerBaseURL(saved.base_url)).origin !== new URL(providerBaseURL(draft.base_url)).origin; }
  catch { return false; }
}

export function readProviderMetadata(data) {
  if (!exactFields(data, ['base_url', 'model_id', 'token_configured', 'revision']) || typeof data.base_url !== 'string'
    || typeof data.model_id !== 'string' || typeof data.token_configured !== 'boolean' || !validRevision(data.revision)) throw new AppAIError('INVALID_RESPONSE');
  try { providerBaseURL(data.base_url); modelID(data.model_id); } catch { throw new AppAIError('INVALID_RESPONSE'); }
  return Object.freeze({ base_url: data.base_url, model_id: data.model_id, token_configured: data.token_configured, revision: data.revision });
}

// 这是线上的严格 PUT 契约，不接收 UI 确认字段，也不从表单中合并未知属性。
export function providerPayload(data) {
  const fields = ['base_url', 'model_id', 'token_action', 'revision'];
  if (data?.token_action === 'replace') fields.push('api_token');
  if (!exactFields(data, fields) || !TOKEN_ACTIONS.includes(data.token_action)) throw new AppAIError('INVALID_BODY');
  if (!validRevision(data.revision)) throw new AppAIError('INVALID_REVISION');
  const payload = { base_url: providerBaseURL(data.base_url), model_id: modelID(data.model_id), token_action: data.token_action, revision: data.revision };
  if (data.token_action === 'replace') {
    if (typeof data.api_token !== 'string' || data.api_token.length > 8192 || /[\u0000-\u001f\u007f]/u.test(data.api_token)) throw new AppAIError('INVALID_TOKEN');
    const token = data.api_token.replace(/^ +| +$/g, '');
    if (!/^[\x21-\x7e]+$/.test(token)) throw new AppAIError('INVALID_TOKEN');
    payload.api_token = token;
  }
  return payload;
}

export const initialProviderState = () => ({ saved: null, draft: { base_url: '', model_id: '', token_action: 'keep', clear_confirmed: false }, loading: true, saving: false, needsReload: true, error: '', notice: '' });

// 每个挂载会话独立创建；请求代次与 AbortController 双重隔离旧响应。
// 令牌只在 save 的调用栈及 PUT 请求体中短暂存在，clearToken 清理调用方的密码框。
export function createProviderEditor(api, { onChange = () => {}, clearToken = () => {} } = {}) {
  let state = initialProviderState(), generation = 0, controller = null, disposed = false;
  const publish = patch => { state = { ...state, ...patch }; if (!disposed) onChange(state); };
  const invalidate = () => { generation += 1; controller?.abort(); controller = null; };
  const begin = () => {
    invalidate();
    const ticket = generation;
    controller = new AbortController();
    const signal = controller.signal;
    return { signal, current: () => !disposed && ticket === generation && !signal.aborted };
  };
  const accept = metadata => {
    const saved = readProviderMetadata(metadata);
    clearToken();
    publish({ saved, draft: { base_url: saved.base_url, model_id: saved.model_id, token_action: 'keep', clear_confirmed: false }, loading: false, saving: false, needsReload: false, error: '' });
  };
  return {
    getState: () => state,
    async load() {
      if (disposed) return false;
      const request = begin();
      clearToken();
      publish({ loading: true, saving: false, needsReload: true, error: '', notice: '' });
      try {
        const saved = await api.appAIProvider({ signal: request.signal });
        if (!request.current()) return false;
        accept(saved);
        return true;
      } catch (error) {
        if (request.current()) publish({ loading: false, error: sanitizeAppAIError(error, request.signal).message });
        return false;
      } finally { if (request.current()) controller = null; }
    },
    change(patch) {
      if (disposed || state.loading || state.saving) return;
      const draft = { ...state.draft };
      for (const key of ['base_url', 'model_id']) if (typeof patch[key] === 'string') draft[key] = patch[key];
      if (TOKEN_ACTIONS.includes(patch.token_action) && patch.token_action !== draft.token_action) {
        clearToken(); draft.token_action = patch.token_action; draft.clear_confirmed = false;
      } else if (typeof patch.clear_confirmed === 'boolean') draft.clear_confirmed = patch.clear_confirmed;
      publish({ draft, error: state.needsReload ? state.error : '', notice: '' });
    },
    async save(apiToken = '') {
      if (disposed || !state.saved || state.loading || state.saving || state.needsReload) return false;
      let payload;
      try {
        if (state.draft.token_action === 'clear' && !state.draft.clear_confirmed) throw new AppAIError('CLEAR_CONFIRMATION');
        if (providerOriginChangeRequiresToken(state.saved, state.draft)) throw new AppAIError('TOKEN_REPLACE_REQUIRED');
        payload = providerPayload({ base_url: state.draft.base_url, model_id: state.draft.model_id, token_action: state.draft.token_action, revision: state.saved.revision, ...(state.draft.token_action === 'replace' ? { api_token: apiToken } : {}) });
      } catch (error) { publish({ error: sanitizeAppAIError(error).message, notice: '' }); return false; }
      const request = begin();
      publish({ saving: true, error: '', notice: '' });
      try {
        const saved = await api.saveAppAIProvider(payload, { signal: request.signal });
        if (!request.current()) return false;
        accept(saved);
        publish({ notice: 'App AI 配置已保存，密码框已清空；本次只保存配置，未调用外部模型。' });
        return true;
      } catch (error) {
        if (request.current()) {
          const safe = sanitizeAppAIError(error, request.signal);
          publish({ saving: false, needsReload: ['CONFLICT', 'UNAUTHORIZED', 'FORBIDDEN', 'INVALID_RESPONSE'].includes(safe.code), error: safe.message });
        }
        return false;
      } finally { payload = null; apiToken = ''; if (request.current()) controller = null; }
    },
    cancel() {
      if (disposed || !controller) return;
      invalidate(); clearToken();
      publish({ loading: false, saving: false, needsReload: true, error: MESSAGES.CANCELLED, notice: '' });
    },
    dispose() {
      disposed = true; invalidate(); clearToken(); state = initialProviderState();
    },
  };
}
