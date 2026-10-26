import { APP_AI_PROVIDER_PATH, providerPayload, readProviderMetadata, sanitizeAppAIError } from './model.js';

// 只注入现有 apiFetch，继续使用统一管理员 cookie/token；不导出会话、不缓存、不做离线兜底。
export function createAppAIAPI(request) {
  const invoke = async (method, data, { signal } = {}) => {
    let body;
    try {
      signal?.throwIfAborted();
      if (method === 'PUT') body = JSON.stringify(providerPayload(data));
      const metadata = await request(APP_AI_PROVIDER_PATH, { method, cache: 'no-store', signal, ...(method === 'PUT' ? { body } : {}) });
      signal?.throwIfAborted();
      return readProviderMetadata(metadata);
    } catch (error) { throw sanitizeAppAIError(error, signal); }
    finally { body = undefined; }
  };
  return {
    appAIProvider: (options = {}) => invoke('GET', undefined, options),
    saveAppAIProvider: (data, options = {}) => invoke('PUT', data, options),
  };
}
