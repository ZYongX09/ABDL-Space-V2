import { TRANSLATION_GLOSSARY_PATH, readTranslationGlossary, sanitizeTranslationGlossaryError, translationGlossaryPayload } from './model.js';

// 只注入已有认证 apiFetch；不缓存、不离线降级、不重试，不提供 AI/供应商入口。
export function createTranslationGlossaryAPI(request) {
  const invoke = async (method, input, { signal } = {}) => {
    try {
      signal?.throwIfAborted();
      const data = await request(TRANSLATION_GLOSSARY_PATH, { method, cache: 'no-store', signal,
        ...(method === 'PUT' ? { body: JSON.stringify(translationGlossaryPayload(input)) } : {}) });
      signal?.throwIfAborted();
      return readTranslationGlossary(data);
    } catch (error) { throw sanitizeTranslationGlossaryError(error, signal); }
  };
  return {
    translationGlossary: (options = {}) => invoke('GET', undefined, options),
    saveTranslationGlossary: (input, options = {}) => invoke('PUT', input, options),
  };
}
