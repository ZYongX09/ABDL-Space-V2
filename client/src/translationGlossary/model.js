export const TRANSLATION_GLOSSARY_PATH = '/api/admin/app-ai/translation-glossary';
export const TRANSLATION_GLOSSARY_SAVED_EVENT = 'translation-glossary-saved';
export const TRANSLATION_GLOSSARY_LIMITS = Object.freeze({ entries: 200, variants: 10, term: 120, note: 500, entriesBytes: 64 * 1024, requestBytes: 96 * 1024 });
export const TRANSLATION_GLOSSARY_CACHE_WARNING = '保存会显式失效共享译文，使后续请求重新生成译文，可能消耗发起者额度；不自动重译已显示内容，不清空当日已用或预留额度，也不重试结果未知（unknown）的旧调用。';
const MESSAGES = Object.freeze({
  INVALID_BODY: '词库字段无效（422 / glossary_invalid）；请检查 UUID、中文/英文变体及可选备注，草稿未保存。',
  INVALID_RESPONSE: '词库响应异常；未将失败视为空词库，请重新加载或联系服务器管理员。',
  ENTRY_LIMIT: '词库最多 200 条，不能继续添加。',
  VARIANT_LIMIT: '每条中文、英文各需 1–10 个非空同义词（每行一个），不能含无效 Unicode。',
  TERM_LIMIT: '每个同义词经 trim/NFC 规范化后最多 120 个 Unicode 码点，不按 UTF-16 长度计算。',
  NOTE_LIMIT: '可选备注经 trim/NFC 规范化后最多 500 个 Unicode 码点，不能含无效 Unicode。',
  DUPLICATE_ID: '词条 UUID 不能重复；请删除重复词条后重新添加。',
  AMBIGUOUS: '不同词条不能有同语言的重复变体：中文按 NFC 比较，英文忽略大小写；请合并同义词或修改重复词条。',
  BYTE_LIMIT: '规范化词条 JSON 不能超过 64 KiB，完整请求不能超过 96 KiB；请减少词条或备注。',
  UUID_UNAVAILABLE: '当前环境不能安全生成 UUID，请使用安全浏览器环境后重新添加；未使用不安全随机数。',
  UNAUTHORIZED: '管理员会话已失效（401），请重新登录；未保存草稿仍保留在当前页面内存，重新登录后须重新加载确认。',
  FORBIDDEN: '当前账号无权管理词库（403），请确认管理员身份；未保存草稿没有提交。',
  CONFLICT: '词库已被其他管理员更新（409 / glossary_conflict）；未保存草稿已保留，不会盲覆盖或自动重试。请先确认丢弃草稿并重新加载，再手动编辑保存。',
  UNAVAILABLE: '词库服务暂不可用（503 / translation_unavailable）；未将失败视为空词库，草稿已保留，请重新加载确认。',
  REQUEST_FAILED: '词库请求失败，草稿已保留；服务器写入状态未确认，请重新加载后再保存，不会自动重试。',
  CANCELLED: '已取消当前请求并保留草稿；取消不代表服务器写入已撤回，请重新加载确认，不会自动重试。',
});

export class TranslationGlossaryError extends Error {
  constructor(code = 'REQUEST_FAILED', status) {
    const safeCode = Object.hasOwn(MESSAGES, code) ? code : 'REQUEST_FAILED';
    super(MESSAGES[safeCode]);
    this.name = safeCode === 'CANCELLED' ? 'AbortError' : 'TranslationGlossaryError';
    this.code = safeCode;
    if (Number.isInteger(status) && status >= 400 && status <= 599) this.status = status;
  }
}

export function sanitizeTranslationGlossaryError(error, signal) {
  if (signal?.aborted || error?.name === 'AbortError') return new TranslationGlossaryError('CANCELLED');
  if (error instanceof TranslationGlossaryError) return new TranslationGlossaryError(error.code, error.status);
  const codes = { 400: 'INVALID_BODY', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 409: 'CONFLICT', 413: 'BYTE_LIMIT', 415: 'INVALID_BODY', 422: 'INVALID_BODY', 503: 'UNAVAILABLE' };
  return new TranslationGlossaryError(codes[error?.status] || 'REQUEST_FAILED', error?.status);
}

const exactFields = (value, required, optional = []) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && required.every(key => Object.hasOwn(value, key)) && Reflect.ownKeys(value).every(key => [...required, ...optional].includes(key));
const validUUID = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export const glossaryCodePoints = value => [...value].length;
export const glossaryJSONBytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const validUnicode = value => typeof value === 'string' && ![...value].some(char => char.length === 1 && char.charCodeAt(0) >= 0xd800 && char.charCodeAt(0) <= 0xdfff);
const normalizeText = value => value.trim().normalize('NFC');
const fail = code => { throw new TranslationGlossaryError(code); };

// 先校验原始数组界限，再规范化并去重；跨词条同语言歧义始终拒绝。后端仍为权威。
export function normalizeTranslationGlossaryEntries(input) {
  if (!Array.isArray(input)) fail('INVALID_BODY');
  if (input.length > TRANSLATION_GLOSSARY_LIMITS.entries) fail('ENTRY_LIMIT');
  const ids = new Set(), seen = { chinese: new Set(), english: new Set() };
  const entries = Array.from(input, entry => {
    if (!exactFields(entry, ['id', 'chinese', 'english'], ['note']) || !validUUID(entry.id)) fail('INVALID_BODY');
    const id = entry.id.toLowerCase();
    if (ids.has(id)) fail('DUPLICATE_ID');
    ids.add(id);
    const languages = {};
    for (const language of ['chinese', 'english']) {
      const values = entry[language];
      if (!Array.isArray(values) || values.length < 1 || values.length > TRANSLATION_GLOSSARY_LIMITS.variants) fail('VARIANT_LIMIT');
      const local = new Set(), normalized = [];
      for (const value of values) {
        if (!validUnicode(value)) fail('VARIANT_LIMIT');
        const term = normalizeText(value);
        if (!term) fail('VARIANT_LIMIT');
        if (glossaryCodePoints(term) > TRANSLATION_GLOSSARY_LIMITS.term) fail('TERM_LIMIT');
        const key = language === 'english' ? term.toLowerCase() : term;
        if (local.has(key)) continue;
        if (seen[language].has(key)) fail('AMBIGUOUS');
        local.add(key); normalized.push(term);
      }
      for (const key of local) seen[language].add(key);
      languages[language] = Object.freeze(normalized);
    }
    const rawNote = Object.hasOwn(entry, 'note') ? entry.note : '';
    if (!validUnicode(rawNote)) fail('NOTE_LIMIT');
    const note = normalizeText(rawNote);
    if (glossaryCodePoints(note) > TRANSLATION_GLOSSARY_LIMITS.note) fail('NOTE_LIMIT');
    return Object.freeze({ id, chinese: languages.chinese, english: languages.english, note });
  });
  if (glossaryJSONBytes(entries) > TRANSLATION_GLOSSARY_LIMITS.entriesBytes) fail('BYTE_LIMIT');
  return Object.freeze(entries);
}

export function translationGlossaryPayload(value) {
  if (!exactFields(value, ['entries', 'revision']) || !validUUID(value.revision)) fail('INVALID_BODY');
  const payload = Object.freeze({ entries: normalizeTranslationGlossaryEntries(value.entries), revision: value.revision.toLowerCase() });
  if (glossaryJSONBytes(payload) > TRANSLATION_GLOSSARY_LIMITS.requestBytes) fail('BYTE_LIMIT');
  return payload;
}

export function readTranslationGlossary(value) {
  try { return translationGlossaryPayload(value); }
  catch { throw new TranslationGlossaryError('INVALID_RESPONSE'); }
}

const freezeDraft = entries => Object.freeze(entries.map(entry => Object.freeze({ id: entry.id, chineseText: entry.chineseText, englishText: entry.englishText, note: entry.note })));
export const translationGlossaryDraft = saved => freezeDraft((saved?.entries || []).map(entry => ({ id: entry.id, chineseText: entry.chinese.join('\n'), englishText: entry.english.join('\n'), note: entry.note })));
export const isTranslationGlossaryDirty = (saved, draft) => !!saved && JSON.stringify(translationGlossaryDraft(saved)) !== JSON.stringify(draft);
export function translationGlossaryDraftPayload(saved, draft) {
  if (!saved || !Array.isArray(draft)) fail('INVALID_BODY');
  return translationGlossaryPayload({ revision: saved.revision, entries: draft.map(entry => {
    const original = saved.entries.find(value => value.id === entry.id);
    // 已存术语允许合法换行；未改动的语言字段保留原数组，避免编辑备注时隐式拆词。
    const variants = language => original && entry[`${language}Text`] === original[language].join('\n') ? original[language] : entry[`${language}Text`].split(/\r\n?|\n/).filter(value => value.trim());
    return { id: entry.id, chinese: variants('chinese'), english: variants('english'), note: entry.note };
  }) });
}
export function searchTranslationGlossary(draft, query) {
  const key = normalizeText(query).toLowerCase();
  return draft.filter(entry => [entry.chineseText, entry.englishText, entry.note].some(value => value.normalize('NFC').toLowerCase().includes(key)));
}

export const initialTranslationGlossaryState = () => Object.freeze({ saved: null, draft: Object.freeze([]), query: '', loading: true, saving: false, needsReload: true, confirm: '', error: '', errorCode: '', notice: '' });

// 草稿只在当前挂载内存中存在；所有网络失败、取消和 CAS 冲突都禁止自动重放。
export function createTranslationGlossaryEditor(api, { onChange = () => {}, uuid = () => globalThis.crypto.randomUUID() } = {}) {
  let state = initialTranslationGlossaryState(), generation = 0, controller = null, disposed = false;
  const publish = patch => { state = Object.freeze({ ...state, ...patch }); if (!disposed) onChange(state); };
  const invalidate = () => { generation++; controller?.abort(); controller = null; };
  const begin = () => {
    invalidate();
    const ticket = generation;
    controller = new AbortController();
    const signal = controller.signal;
    return { signal, current: () => !disposed && ticket === generation && !signal.aborted };
  };
  const report = (error, patch = {}) => { const safe = sanitizeTranslationGlossaryError(error); publish({ error: safe.message, errorCode: safe.code, notice: '', ...patch }); };
  const accept = value => {
    const saved = readTranslationGlossary(value);
    publish({ saved, draft: translationGlossaryDraft(saved), loading: false, saving: false, needsReload: false, confirm: '', error: '', errorCode: '', notice: '' });
  };
  const editable = () => !disposed && !!state.saved && !state.loading && !state.saving && !state.needsReload && !state.confirm;
  const editor = {
    getState: () => state,
    async load({ discard = false } = {}) {
      if (disposed) return false;
      if (!discard && isTranslationGlossaryDirty(state.saved, state.draft)) { publish({ confirm: 'reload', notice: '' }); return false; }
      const request = begin();
      publish({ loading: true, saving: false, needsReload: true, confirm: '', error: '', errorCode: '', notice: '' });
      try {
        const value = await api.translationGlossary({ signal: request.signal });
        if (!request.current()) return false;
        accept(value); return true;
      } catch (error) {
        if (request.current()) report(error, { loading: false });
        return false;
      } finally { if (request.current()) controller = null; }
    },
    search(query) { if (!disposed && typeof query === 'string') publish({ query }); },
    add() {
      if (!editable()) return false;
      if (state.draft.length >= TRANSLATION_GLOSSARY_LIMITS.entries) { report(new TranslationGlossaryError('ENTRY_LIMIT')); return false; }
      let id;
      try { id = uuid(); if (!validUUID(id) || state.draft.some(entry => entry.id.toLowerCase() === id.toLowerCase())) throw new Error(); }
      catch { report(new TranslationGlossaryError('UUID_UNAVAILABLE')); return false; }
      publish({ draft: freezeDraft([...state.draft, { id: id.toLowerCase(), chineseText: '', englishText: '', note: '' }]), query: '', error: '', errorCode: '', notice: '已添加到草稿；请填写中英文同义词，再显式保存全部词库。' });
      return true;
    },
    change(id, patch) {
      if (!editable() || !patch || typeof patch !== 'object') return;
      publish({ draft: freezeDraft(state.draft.map(entry => entry.id !== id ? entry : { ...entry, ...Object.fromEntries(['chineseText', 'englishText', 'note'].filter(key => typeof patch[key] === 'string').map(key => [key, patch[key]])) })), error: '', errorCode: '', notice: '' });
    },
    remove(id) {
      if (!editable()) return;
      publish({ draft: freezeDraft(state.draft.filter(entry => entry.id !== id)), error: '', errorCode: '', notice: '仅从草稿删除，尚未生效；保存全部词库后才会删除服务器词条，放弃草稿可恢复。' });
    },
    requestSave() {
      if (!editable() || !isTranslationGlossaryDirty(state.saved, state.draft)) return false;
      try { translationGlossaryDraftPayload(state.saved, state.draft); }
      catch (error) { report(error); return false; }
      publish({ confirm: 'save', error: '', errorCode: '', notice: '' }); return true;
    },
    async save() {
      if (disposed || state.confirm !== 'save' || !state.saved || state.loading || state.saving || state.needsReload) return false;
      let payload;
      try { payload = translationGlossaryDraftPayload(state.saved, state.draft); }
      catch (error) { report(error, { confirm: '' }); return false; }
      const request = begin();
      publish({ saving: true, confirm: '', error: '', errorCode: '', notice: '' });
      try {
        const value = await api.saveTranslationGlossary(payload, { signal: request.signal });
        if (!request.current()) return false;
        accept(value);
        publish({ notice: '全部词库已保存；仅更新术语和共享译文缓存世代，未调用 AI、修改供应商或密钥，未清空当日额度账本。' });
        return true;
      } catch (error) {
        if (request.current()) report(error, { saving: false, needsReload: true });
        return false;
      } finally { if (request.current()) controller = null; }
    },
    requestDiscard() {
      if (disposed || state.loading || state.saving || !isTranslationGlossaryDirty(state.saved, state.draft)) return;
      publish({ confirm: 'discard', notice: '' });
    },
    confirmDiscard() {
      if (disposed || state.confirm !== 'discard') return;
      publish({ draft: translationGlossaryDraft(state.saved), confirm: '', notice: '已放弃本页未保存更改，恢复最后成功读取的快照；未向服务器写入。' });
    },
    confirmReload() { return state.confirm === 'reload' ? editor.load({ discard: true }) : Promise.resolve(false); },
    cancelConfirmation() { if (!disposed) publish({ confirm: '' }); },
    cancel() {
      if (disposed || !controller) return;
      invalidate(); report(new TranslationGlossaryError('CANCELLED'), { loading: false, saving: false, needsReload: true, confirm: '' });
    },
    dispose() { disposed = true; invalidate(); state = initialTranslationGlossaryState(); },
  };
  return editor;
}

export function bindTranslationGlossarySession(editor, target, onReset) {
  const changing = () => {
    editor.dispose(); target.removeEventListener('auth-session-changing', changing);
    onReset({ ...initialTranslationGlossaryState(), loading: false, error: '管理员会话已变更，词库草稿已从当前组件内存清除；请在当前账号下重新打开管理页面。' });
  };
  target.addEventListener('auth-session-changing', changing);
  return () => { target.removeEventListener('auth-session-changing', changing); editor.dispose(); };
}
