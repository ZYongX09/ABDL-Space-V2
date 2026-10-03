import { policyPayload, readPolicy, readStats, readUsers, usersQuery } from './model.js';

// 注入现有 apiFetch，继续使用统一管理员会话；不缓存，也不伪造离线统计。
export function createAppClientsAPI(request) {
  const fetchCurrent = (path, options = {}) => request(path, { ...options, cache: 'no-store' });
  return {
    appClientPolicy: async (options = {}) => readPolicy(await fetchCurrent('/api/admin/app-clients/policy', options)),
    saveAppClientPolicy: async (form, options = {}) => readPolicy(await fetchCurrent('/api/admin/app-clients/policy', { ...options, method: 'PUT', body: JSON.stringify(policyPayload(form)) })),
    appClientStats: async (options = {}) => readStats(await fetchCurrent('/api/admin/app-clients/stats', options)),
    appClientUsers: async (params = {}, options = {}) => readUsers(await fetchCurrent(`/api/admin/app-clients/users?${usersQuery(params)}`, options)),
  };
}
