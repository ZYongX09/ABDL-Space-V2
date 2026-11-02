import { TRANSLATION_POLICY_PATH, readTranslationPolicy, sanitizeTranslationPolicyError, translationPolicyPayload } from './model.js';

// 仅注入既有认证 apiFetch；没有离线默认、公开缓存、重试或供应商调用入口。
export function createTranslationPolicyAPI(request) {
  const invoke = async (method, input, { signal } = {}) => {
    try {
      signal?.throwIfAborted();
      const data = await request(TRANSLATION_POLICY_PATH, { method, cache: 'no-store', signal,
        ...(method === 'PUT' ? { body: JSON.stringify(translationPolicyPayload(input)) } : {}) });
      signal?.throwIfAborted();
      return readTranslationPolicy(data);
    } catch (error) { throw sanitizeTranslationPolicyError(error, signal); }
  };
  return {
    translationPolicy: (options = {}) => invoke('GET', undefined, options),
    saveTranslationPolicy: (input, options = {}) => invoke('PUT', input, options),
  };
}
