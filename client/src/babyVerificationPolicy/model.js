export const BABY_VERIFICATION_POLICY_PATH = '/api/admin/app-clients/baby-verification-policy';
export const PROVINCES = Object.freeze([
  ['BJ', '北京市'], ['TJ', '天津市'], ['HE', '河北省'], ['SX', '山西省'], ['NM', '内蒙古自治区'],
  ['LN', '辽宁省'], ['JL', '吉林省'], ['HL', '黑龙江省'], ['SH', '上海市'], ['JS', '江苏省'],
  ['ZJ', '浙江省'], ['AH', '安徽省'], ['FJ', '福建省'], ['JX', '江西省'], ['SD', '山东省'],
  ['HA', '河南省'], ['HB', '湖北省'], ['HN', '湖南省'], ['GD', '广东省'], ['GX', '广西壮族自治区'],
  ['HI', '海南省'], ['CQ', '重庆市'], ['SC', '四川省'], ['GZ', '贵州省'], ['YN', '云南省'],
  ['XZ', '西藏自治区'], ['SN', '陕西省'], ['GS', '甘肃省'], ['QH', '青海省'], ['NX', '宁夏回族自治区'], ['XJ', '新疆维吾尔自治区'],
].map(([code, name]) => Object.freeze({ code: `CN-${code}`, name })));
const CODES = new Set(PROVINCES.map(item => item.code));
const MESSAGES = {
  INVALID_RESPONSE: '宝宝认证访问策略响应异常，请重新加载或联系服务器管理员。',
  INVALID_BODY: '请选择有效省份；开启策略时至少选择一个省份。',
  UNAUTHORIZED: '管理员会话已失效，请重新登录后加载策略。',
  FORBIDDEN: '当前账号无权管理此策略，请确认管理员身份。',
  CONFLICT: '策略已被其他管理员更新；草稿已保留，必须重新加载后再保存，不会自动重放。',
  UNAVAILABLE: '策略服务暂不可用；未将失败视为默认关闭，请重新加载确认。',
  REQUEST_FAILED: '策略请求结果未确认，草稿已保留；请重新加载后再保存，不会自动重试。',
  CANCELLED: '已取消当前请求；这不代表服务器写入被撤回，请重新加载确认。',
};
export class BabyVerificationPolicyError extends Error {
  constructor(code = 'REQUEST_FAILED', status) {
    const safe = Object.hasOwn(MESSAGES, code) ? code : 'REQUEST_FAILED';
    super(MESSAGES[safe]); this.name = safe === 'CANCELLED' ? 'AbortError' : 'BabyVerificationPolicyError'; this.code = safe;
    if (Number.isInteger(status) && status >= 400 && status <= 599) this.status = status;
  }
}
export function sanitizePolicyError(error, signal) {
  if (signal?.aborted || error?.name === 'AbortError') return new BabyVerificationPolicyError('CANCELLED');
  if (error instanceof BabyVerificationPolicyError) return new BabyVerificationPolicyError(error.code, error.status);
  return new BabyVerificationPolicyError(({ 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 409: 'CONFLICT', 422: 'INVALID_BODY', 503: 'UNAVAILABLE' })[error?.status], error?.status);
}
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function validPolicy(value) {
  return exact(value, ['enabled', 'province_codes', 'revision']) && typeof value.enabled === 'boolean'
    && typeof value.revision === 'string' && /^[\x21-\x7e]{1,128}$/.test(value.revision)
    && Array.isArray(value.province_codes) && value.province_codes.length <= 31 && new Set(value.province_codes).size === value.province_codes.length
    && value.province_codes.every(code => CODES.has(code)) && (!value.enabled || value.province_codes.length > 0);
}
export function policyPayload(value) {
  if (!validPolicy(value)) throw new BabyVerificationPolicyError('INVALID_BODY');
  return { enabled: value.enabled, province_codes: PROVINCES.filter(item => value.province_codes.includes(item.code)).map(item => item.code), revision: value.revision };
}
export function readPolicyResponse(value) {
  if (!exact(value, ['policy', 'provinces']) || !validPolicy(value.policy) || !Array.isArray(value.provinces) || value.provinces.length !== 31
    || new Set(value.provinces.map(item => item?.code)).size !== 31
    || value.provinces.some(item => !exact(item, ['code', 'name']) || !CODES.has(item.code) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 32)) throw new BabyVerificationPolicyError('INVALID_RESPONSE');
  return Object.freeze({ policy: Object.freeze({ ...policyPayload(value.policy), province_codes: Object.freeze([...policyPayload(value.policy).province_codes]) }), provinces: Object.freeze(PROVINCES.map(item => Object.freeze({ ...item, name: value.provinces.find(row => row.code === item.code).name }))) });
}
const draftFor = saved => ({ enabled: saved?.enabled ?? false, province_codes: [...(saved?.province_codes ?? [])] });
export const initialPolicyState = () => ({ saved: null, provinces: PROVINCES, draft: draftFor(null), loading: true, saving: false, needsReload: true, error: '', notice: '' });
export const isPolicyDirty = (saved, draft) => !!saved && (saved.enabled !== draft.enabled || saved.province_codes.length !== draft.province_codes.length || saved.province_codes.some(code => !draft.province_codes.includes(code)));

// 沿用 AppHumanCheckPolicyCard 的独立内存编辑器：CAS 冲突/未知结果不重放，换会话废弃在途响应。
export function createPolicyEditor(api, { onChange = () => {} } = {}) {
  let state = initialPolicyState(), generation = 0, controller = null, disposed = false;
  const publish = patch => { state = { ...state, ...patch }; if (!disposed) onChange(state); };
  const invalidate = () => { generation += 1; controller?.abort(); controller = null; };
  const begin = () => { invalidate(); const ticket = generation; controller = new AbortController(); const signal = controller.signal; return { signal, current: () => !disposed && ticket === generation && !signal.aborted }; };
  const accept = value => { const { policy: saved, provinces } = readPolicyResponse(value); publish({ saved, provinces, draft: draftFor(saved), loading: false, saving: false, needsReload: false, error: '', notice: '' }); };
  return {
    getState: () => state,
    async load() {
      if (disposed) return false;
      const request = begin(); publish({ loading: true, saving: false, needsReload: true, error: '', notice: '' });
      try { const value = await api.babyVerificationPolicy({ signal: request.signal }); if (!request.current()) return false; accept(value); return true; }
      catch (error) { if (request.current()) publish({ loading: false, error: sanitizePolicyError(error, request.signal).message }); return false; }
      finally { if (request.current()) controller = null; }
    },
    change(patch) {
      if (disposed || state.loading || state.saving || state.needsReload) return;
      const draft = { ...state.draft };
      if (typeof patch.enabled === 'boolean') draft.enabled = patch.enabled;
      if (Array.isArray(patch.province_codes)) draft.province_codes = [...patch.province_codes];
      publish({ draft, error: '', notice: '' });
    },
    async save() {
      if (disposed || !state.saved || state.loading || state.saving || state.needsReload) return false;
      let payload;
      try { payload = policyPayload({ ...state.draft, revision: state.saved.revision }); }
      catch (error) { publish({ error: sanitizePolicyError(error).message }); return false; }
      const request = begin(); publish({ saving: true, error: '', notice: '' });
      try { const value = await api.saveBabyVerificationPolicy(payload, { signal: request.signal }); if (!request.current()) return false; accept(value); publish({ notice: '宝宝认证访问策略已保存，对后续请求生效。' }); return true; }
      catch (error) { if (request.current()) publish({ saving: false, needsReload: true, error: sanitizePolicyError(error, request.signal).message }); return false; }
      finally { if (request.current()) controller = null; }
    },
    cancel() { if (disposed || !controller) return; invalidate(); publish({ loading: false, saving: false, needsReload: true, error: MESSAGES.CANCELLED, notice: '' }); },
    dispose() { disposed = true; invalidate(); state = initialPolicyState(); },
  };
}
