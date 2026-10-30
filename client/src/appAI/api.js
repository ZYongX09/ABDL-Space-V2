import { APP_AI_PROVIDER_PATH, APP_AI_PROVIDER_TEST_PATH, AppAIError, providerPayload, readProviderMetadata, readProviderTestResult, sanitizeAppAIError, sanitizeProviderTestError } from './model.js';

export const APP_AI_TEST_TIMEOUT_MS = 20000;

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
  const testDraft = async (data, { signal } = {}) => {
    const controller = new AbortController();
    let timer, body, payload, timedOut = false, rejectAbort;
    const abort = () => controller.abort();
    try {
      signal?.throwIfAborted();
      payload = providerPayload(data);
      if (payload.token_action === 'clear') throw new AppAIError('MISSING_TOKEN');
      body = JSON.stringify(payload);
      signal?.addEventListener('abort', abort, { once: true });
      const interrupted = new Promise((_, reject) => {
        rejectAbort = () => reject(new AppAIError(timedOut ? 'TEST_TIMEOUT' : 'TEST_CANCELLED'));
        controller.signal.addEventListener('abort', rejectAbort, { once: true });
      });
      // 总截止覆盖请求与响应体读取；即使传输层忽略 abort 也不再等待，不自动重试。
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, APP_AI_TEST_TIMEOUT_MS);
      const result = await Promise.race([
        request(APP_AI_PROVIDER_TEST_PATH, { method: 'POST', cache: 'no-store', signal: controller.signal, body }),
        interrupted,
      ]);
      controller.signal.throwIfAborted();
      return readProviderTestResult(result, payload.model_id);
    } catch (error) { throw timedOut ? new AppAIError('TEST_TIMEOUT') : sanitizeProviderTestError(error, signal); }
    finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
      body = undefined; payload = undefined; data = undefined;
    }
  };
  return {
    appAIProvider: (options = {}) => invoke('GET', undefined, options),
    saveAppAIProvider: (data, options = {}) => invoke('PUT', data, options),
    testAppAIProvider: (data, options = {}) => testDraft(data, options),
  };
}
