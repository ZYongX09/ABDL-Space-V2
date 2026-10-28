import { APP_HUMAN_CHECK_POLICY_PATH, humanPolicyPayload, readHumanPolicy, sanitizeHumanPolicyError } from './model.js';

// 只注入现有认证 apiFetch，无缓存、离线默认、自动重试或公开配置入口。
export function createAppHumanCheckAPI(request) {
  const invoke = async (method, input, { signal } = {}) => {
    try {
      signal?.throwIfAborted();
      const data = await request(APP_HUMAN_CHECK_POLICY_PATH, { method, cache: 'no-store', signal,
        ...(method === 'PUT' ? { body: JSON.stringify(humanPolicyPayload(input)) } : {}) });
      signal?.throwIfAborted();
      return readHumanPolicy(data);
    } catch (error) { throw sanitizeHumanPolicyError(error, signal); }
  };
  return {
    appHumanCheckPolicy: (options = {}) => invoke('GET', undefined, options),
    saveAppHumanCheckPolicy: (input, options = {}) => invoke('PUT', input, options),
  };
}
