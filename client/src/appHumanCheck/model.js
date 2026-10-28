// 仅管理冻结策略；没有默认保存状态、秘密输入、持久化草稿或验证码发送动作。
export const APP_HUMAN_CHECK_POLICY_PATH = '/api/admin/app-human-check/policy';
export const HUMAN_POLICY_MODES = Object.freeze({ off: '关闭', risk: '按风险触发', always: '始终验证' });
export const DEFAULT_APP_HUMAN_POLICY = Object.freeze({ mode: 'off', email_window_seconds: 900, email_threshold: 2, source_window_seconds: 600, source_threshold: 5, source_distinct_emails: 3, revision: '0', turnstile_configured: false });
export const HUMAN_POLICY_FIELDS = Object.freeze(['mode', 'email_window_seconds', 'email_threshold', 'source_window_seconds', 'source_threshold', 'source_distinct_emails', 'revision']);
export const HUMAN_POLICY_LIMITS = Object.freeze({ email_window_seconds: [60, 86400], email_threshold: [1, 20], source_window_seconds: [60, 86400], source_threshold: [1, 200], source_distinct_emails: [1, 50] });
const MESSAGES = Object.freeze({
  INVALID_RESPONSE: '安全验证策略响应异常，请重新加载或联系服务器管理员。',
  INVALID_BODY: '策略字段无效：窗口须为 60–86400 秒整数，邮箱阈值 1–20，来源阈值 1–200，不同邮箱数 1–50 且不超过来源阈值。',
  UNAUTHORIZED: '管理员会话已失效，请重新登录后加载策略。',
  FORBIDDEN: '当前账号无权管理安全验证策略，请确认管理员身份。',
  CONFLICT: '策略已被其他管理员更新；草稿没有覆盖服务器，必须重新加载后再保存，不会自动重放。',
  UNAVAILABLE: '安全验证策略服务暂不可用；未将失败视为默认关闭，请重新加载确认。',
  REQUEST_FAILED: '策略请求失败，草稿已保留；服务器状态未确认，请重新加载后再保存。',
  CANCELLED: '已取消当前请求；这不代表服务器写入被撤回，请重新加载确认。',
});

export class AppHumanPolicyError extends Error {
  constructor(code = 'REQUEST_FAILED', status) {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'REQUEST_FAILED';
    super(MESSAGES[safeCode]);
    this.name = safeCode === 'CANCELLED' ? 'AbortError' : 'AppHumanPolicyError';
    this.code = safeCode;
    if (Number.isInteger(status) && status >= 400 && status <= 599) this.status = status;
  }
}

export function sanitizeHumanPolicyError(error, signal) {
  if (signal?.aborted || error?.name === 'AbortError') return new AppHumanPolicyError('CANCELLED');
  if (error instanceof AppHumanPolicyError) return new AppHumanPolicyError(error.code, error.status);
  const codes = { 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 409: 'CONFLICT', 422: 'INVALID_BODY', 503: 'UNAVAILABLE' };
  return new AppHumanPolicyError(codes[error?.status] || 'REQUEST_FAILED', error?.status);
}

const exactFields = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const validRevision = value => typeof value === 'string' && /^(?:0|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/.test(value);
const validValues = value => Object.hasOwn(HUMAN_POLICY_MODES, value.mode) && typeof value.mode === 'string' && validRevision(value.revision)
  && Object.entries(HUMAN_POLICY_LIMITS).every(([key, [min, max]]) => Number.isSafeInteger(value[key]) && value[key] >= min && value[key] <= max)
  && value.source_distinct_emails <= value.source_threshold;

export function humanPolicyPayload(value) {
  if (!exactFields(value, HUMAN_POLICY_FIELDS) || !validValues(value)) throw new AppHumanPolicyError('INVALID_BODY');
  return Object.fromEntries(HUMAN_POLICY_FIELDS.map(key => [key, value[key]]));
}

export function readHumanPolicy(value) {
  if (!exactFields(value, [...HUMAN_POLICY_FIELDS, 'turnstile_configured']) || typeof value.turnstile_configured !== 'boolean' || !validValues(value)) throw new AppHumanPolicyError('INVALID_RESPONSE');
  return Object.freeze({ ...Object.fromEntries(HUMAN_POLICY_FIELDS.map(key => [key, value[key]])), turnstile_configured: value.turnstile_configured });
}

export function humanPolicyDraft(saved) {
  return { mode: saved?.mode ?? 'off', ...Object.fromEntries(Object.keys(HUMAN_POLICY_LIMITS).map(key => [key, saved ? String(saved[key]) : ''])) };
}

export function isHumanPolicyDirty(saved, draft) {
  return !!saved && (saved.mode !== draft.mode || Object.keys(HUMAN_POLICY_LIMITS).some(key => String(saved[key]) !== draft[key]));
}

export const initialHumanPolicyState = () => ({ saved: null, draft: humanPolicyDraft(null), loading: true, saving: false, needsReload: true, error: '', notice: '' });

// 每次挂载与 StrictMode effect setup 各有独立代次。取消/换号不把晚到响应视为当前保存成功。
export function createHumanPolicyEditor(api, { onChange = () => {} } = {}) {
  let state = initialHumanPolicyState(), generation = 0, controller = null, disposed = false;
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
    const saved = readHumanPolicy(value);
    publish({ saved, draft: humanPolicyDraft(saved), loading: false, saving: false, needsReload: false, error: '', notice: '' });
  };
  return {
    getState: () => state,
    async load() {
      if (disposed) return false;
      const request = begin();
      publish({ loading: true, saving: false, needsReload: true, error: '', notice: '' });
      try {
        const result = await api.appHumanCheckPolicy({ signal: request.signal });
        if (!request.current()) return false;
        accept(result); return true;
      } catch (error) {
        if (request.current()) publish({ loading: false, error: sanitizeHumanPolicyError(error, request.signal).message });
        return false;
      } finally { if (request.current()) controller = null; }
    },
    change(patch) {
      if (disposed || state.loading || state.saving || state.needsReload) return;
      const draft = { ...state.draft };
      if (typeof patch.mode === 'string' && Object.hasOwn(HUMAN_POLICY_MODES, patch.mode)) draft.mode = patch.mode;
      for (const key of Object.keys(HUMAN_POLICY_LIMITS)) if (typeof patch[key] === 'string') draft[key] = patch[key];
      publish({ draft, error: '', notice: '' });
    },
    async save() {
      if (disposed || !state.saved || state.loading || state.saving || state.needsReload) return false;
      let payload;
      try {
        const numbers = Object.fromEntries(Object.keys(HUMAN_POLICY_LIMITS).map(key => {
          if (!/^\d{1,5}$/.test(state.draft[key])) throw new AppHumanPolicyError('INVALID_BODY');
          return [key, Number(state.draft[key])];
        }));
        payload = humanPolicyPayload({ mode: state.draft.mode, ...numbers, revision: state.saved.revision });
      } catch (error) { publish({ error: sanitizeHumanPolicyError(error).message, notice: '' }); return false; }
      const request = begin();
      publish({ saving: true, error: '', notice: '' });
      try {
        const result = await api.saveAppHumanCheckPolicy(payload, { signal: request.signal });
        if (!request.current()) return false;
        accept(result);
        publish({ notice: '安全验证策略已保存；本次仅更新策略，未发送验证码邮件，也未加载或验证 Turnstile 组件。' });
        return true;
      } catch (error) {
        if (request.current()) publish({ saving: false, needsReload: true, error: sanitizeHumanPolicyError(error, request.signal).message });
        return false;
      } finally { if (request.current()) controller = null; }
    },
    cancel() {
      if (disposed || !controller) return;
      invalidate(); publish({ loading: false, saving: false, needsReload: true, error: MESSAGES.CANCELLED, notice: '' });
    },
    dispose() { disposed = true; invalidate(); state = initialHumanPolicyState(); },
  };
}
