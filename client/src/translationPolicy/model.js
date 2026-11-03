// 独立帖子翻译策略；默认值仅供本地 fixture，不作为读取失败时的已保存配置。
export const TRANSLATION_POLICY_PATH = '/api/admin/app-ai/translation-policy';
export const TRANSLATION_TIMEZONE = 'Asia/Shanghai';
export const TRANSLATION_POLICY_FIELDS = Object.freeze(['enabled', 'daily_limit', 'english_daily_limit', 'sponsor_daily_limit', 'sponsor_auto_allowed', 'cache_epoch', 'revision']);
export const TRANSLATION_POLICY_LIMITS = Object.freeze({ daily_limit: Object.freeze([0, 10000]), english_daily_limit: Object.freeze([0, 10000]), sponsor_daily_limit: Object.freeze([0, 10000]), cache_epoch: Object.freeze([1, Number.MAX_SAFE_INTEGER]) });
export const DEFAULT_TRANSLATION_POLICY = Object.freeze({ enabled: true, daily_limit: 5, english_daily_limit: 10, sponsor_daily_limit: 100, sponsor_auto_allowed: true, cache_epoch: 1, revision: '00000000-0000-4000-8000-000000000001', timezone: TRANSLATION_TIMEZONE });
const MESSAGES = Object.freeze({
  INVALID_RESPONSE: '翻译策略响应异常，请重新加载或联系服务器管理员；未使用默认值替代服务器状态。',
  INVALID_BODY: '翻译策略字段无效：三档每日额度必须是 0–10000 的整数，缓存世代必须是大于等于 1 的安全整数，且不能低于当前已加载的缓存世代。',
  UNAUTHORIZED: '管理员会话已失效，请重新登录后加载翻译策略。',
  FORBIDDEN: '当前账号无权管理翻译策略，请确认管理员身份。',
  CONFLICT: '翻译策略已被其他管理员更新；草稿没有覆盖服务器，必须重新加载后再保存，不会自动重放。',
  UNAVAILABLE: '翻译策略服务暂不可用；未将失败视为默认配置，请重新加载确认。',
  REQUEST_FAILED: '翻译策略请求失败，草稿已保留；服务器状态未确认，请重新加载后再保存。',
  CANCELLED: '已取消当前请求；这不代表服务器写入被撤回，请重新加载确认。',
});

export class TranslationPolicyError extends Error {
  constructor(code = 'REQUEST_FAILED', status) {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'REQUEST_FAILED';
    super(MESSAGES[safeCode]);
    this.name = safeCode === 'CANCELLED' ? 'AbortError' : 'TranslationPolicyError';
    this.code = safeCode;
    if (Number.isInteger(status) && status >= 400 && status <= 599) this.status = status;
  }
}

export function sanitizeTranslationPolicyError(error, signal) {
  if (signal?.aborted || error?.name === 'AbortError') return new TranslationPolicyError('CANCELLED');
  if (error instanceof TranslationPolicyError) return new TranslationPolicyError(error.code, error.status);
  const codes = { 400: 'INVALID_BODY', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 409: 'CONFLICT', 422: 'INVALID_BODY', 503: 'UNAVAILABLE' };
  return new TranslationPolicyError(codes[error?.status] || 'REQUEST_FAILED', error?.status);
}

const exactFields = (value, fields) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const validRevision = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const validValues = value => typeof value.enabled === 'boolean' && typeof value.sponsor_auto_allowed === 'boolean' && validRevision(value.revision)
  && Object.entries(TRANSLATION_POLICY_LIMITS).every(([key, [min, max]]) => Number.isSafeInteger(value[key]) && value[key] >= min && value[key] <= max);

export function translationPolicyPayload(value) {
  if (!exactFields(value, TRANSLATION_POLICY_FIELDS) || !validValues(value)) throw new TranslationPolicyError('INVALID_BODY');
  return Object.freeze(Object.fromEntries(TRANSLATION_POLICY_FIELDS.map(key => [key, value[key]])));
}

export function readTranslationPolicy(value) {
  if (!exactFields(value, [...TRANSLATION_POLICY_FIELDS, 'timezone']) || value.timezone !== TRANSLATION_TIMEZONE || !validValues(value)) throw new TranslationPolicyError('INVALID_RESPONSE');
  return Object.freeze({ ...Object.fromEntries(TRANSLATION_POLICY_FIELDS.map(key => [key, value[key]])), timezone: value.timezone });
}

export function translationPolicyDraft(saved) {
  return Object.freeze({ enabled: saved?.enabled ?? false, sponsor_auto_allowed: saved?.sponsor_auto_allowed ?? false,
    ...Object.fromEntries(Object.keys(TRANSLATION_POLICY_LIMITS).map(key => [key, saved ? String(saved[key]) : ''])) });
}

export function isTranslationPolicyDirty(saved, draft) {
  return !!saved && (saved.enabled !== draft.enabled || saved.sponsor_auto_allowed !== draft.sponsor_auto_allowed
    || Object.keys(TRANSLATION_POLICY_LIMITS).some(key => String(saved[key]) !== draft[key]));
}

export const initialTranslationPolicyState = () => Object.freeze({ saved: null, draft: translationPolicyDraft(null), loading: true, saving: false, needsReload: true, confirmReload: false, error: '', notice: '' });

// 每个挂载、StrictMode setup 与账号会话都有独立代次；取消并不承诺撤回服务端写入。
export function createTranslationPolicyEditor(api, { onChange = () => {} } = {}) {
  let state = initialTranslationPolicyState(), generation = 0, controller = null, disposed = false;
  const publish = patch => { state = Object.freeze({ ...state, ...patch }); if (!disposed) onChange(state); };
  const invalidate = () => { generation += 1; controller?.abort(); controller = null; };
  const begin = () => {
    invalidate();
    const ticket = generation;
    controller = new AbortController();
    const signal = controller.signal;
    return { signal, current: () => !disposed && ticket === generation && !signal.aborted };
  };
  const accept = value => {
    const saved = readTranslationPolicy(value);
    publish({ saved, draft: translationPolicyDraft(saved), loading: false, saving: false, needsReload: false, confirmReload: false, error: '', notice: '' });
  };
  return {
    getState: () => state,
    async load() {
      if (disposed) return false;
      const request = begin();
      publish({ loading: true, saving: false, needsReload: true, error: '', notice: '' });
      try {
        const result = await api.translationPolicy({ signal: request.signal });
        if (!request.current()) return false;
        accept(result); return true;
      } catch (error) {
        if (request.current()) publish({ loading: false, error: sanitizeTranslationPolicyError(error, request.signal).message });
        return false;
      } finally { if (request.current()) controller = null; }
    },
    requestReload() {
      if (disposed || state.loading || state.saving) return;
      if (isTranslationPolicyDirty(state.saved, state.draft)) publish({ confirmReload: true });
      else void this.load();
    },
    confirmReload() { if (!disposed && state.confirmReload) { publish({ confirmReload: false }); return this.load(); } return Promise.resolve(false); },
    cancelReload() { if (!disposed) publish({ confirmReload: false }); },
    async refreshMetadata() {
      if (disposed) return false;
      if (!state.saved) return this.load();
      const request = begin();
      publish({ loading: true, saving: false, needsReload: true, error: '', notice: '词库已保存，正在确认翻译策略缓存世代和版本；策略草稿不会被覆盖。' });
      try {
        const result = await api.translationPolicy({ signal: request.signal });
        if (!request.current()) return false;
        const saved = readTranslationPolicy(result);
        // 读取期间编辑被冻结；已脏草稿只能显式重载，不能把旧世代/旧额度当新版本保存。
        if (isTranslationPolicyDirty(state.saved, state.draft)) publish({ saved, loading: false, needsReload: true, notice: '词库更新后的策略版本及缓存世代已刷新；未保存策略草稿已保留。请重新加载确认后手动编辑保存，不能盲覆盖。' });
        else { accept(saved); publish({ notice: '词库更新后的翻译策略缓存世代与版本已刷新；未调用 AI。' }); }
        return true;
      } catch (error) {
        if (request.current()) publish({ loading: false, error: sanitizeTranslationPolicyError(error, request.signal).message });
        return false;
      } finally { if (request.current()) controller = null; }
    },
    change(patch) {
      if (disposed || state.loading || state.saving || state.needsReload || state.confirmReload || !patch || typeof patch !== 'object') return;
      const draft = { ...state.draft };
      for (const key of ['enabled', 'sponsor_auto_allowed']) if (typeof patch[key] === 'boolean') draft[key] = patch[key];
      for (const key of Object.keys(TRANSLATION_POLICY_LIMITS)) if (typeof patch[key] === 'string') draft[key] = patch[key];
      publish({ draft: Object.freeze(draft), error: '', notice: '' });
    },
    async save() {
      if (disposed || !state.saved || state.loading || state.saving || state.needsReload || state.confirmReload) return false;
      let payload;
      try {
        const numbers = Object.fromEntries(Object.keys(TRANSLATION_POLICY_LIMITS).map(key => {
          if (!/^\d{1,16}$/.test(state.draft[key])) throw new TranslationPolicyError('INVALID_BODY');
          return [key, Number(state.draft[key])];
        }));
        if (numbers.cache_epoch < state.saved.cache_epoch) throw new TranslationPolicyError('INVALID_BODY');
        payload = translationPolicyPayload({ enabled: state.draft.enabled, sponsor_auto_allowed: state.draft.sponsor_auto_allowed, ...numbers, revision: state.saved.revision });
      } catch (error) { publish({ error: sanitizeTranslationPolicyError(error).message, notice: '' }); return false; }
      const request = begin();
      publish({ saving: true, error: '', notice: '' });
      try {
        const result = await api.saveTranslationPolicy(payload, { signal: request.signal });
        if (!request.current()) return false;
        accept(result);
        publish({ notice: '翻译策略已保存；仅更新策略，未调用 AI、测试供应商或修改密钥，也未清空当日额度账本。' });
        return true;
      } catch (error) {
        if (request.current()) publish({ saving: false, needsReload: true, error: sanitizeTranslationPolicyError(error, request.signal).message });
        return false;
      } finally { if (request.current()) controller = null; }
    },
    cancel() {
      if (disposed || !controller) return;
      invalidate(); publish({ loading: false, saving: false, needsReload: true, error: MESSAGES.CANCELLED, notice: '' });
    },
    dispose() { disposed = true; invalidate(); state = initialTranslationPolicyState(); },
  };
}
