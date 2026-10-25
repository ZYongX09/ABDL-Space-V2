import { nbwLocalOnlyPayload, nbwV2PolicyPayload, policyPayload, readNbwLocalOnly, readNbwV2Policy, readPolicy, readReminder, readStats, readUsers, reminderPayload, usersQuery } from './model.js';

// 注入现有 apiFetch，继续使用统一管理员会话；不缓存，也不伪造离线统计。
export function createAppClientsAPI(request) {
  const fetchCurrent = (path, options = {}) => request(path, { ...options, cache: 'no-store' });
  return {
    appClientNbwLocalOnly: async (options = {}) => readNbwLocalOnly(await fetchCurrent('/api/admin/app-clients/nbw-local-only', options)),
    saveAppClientNbwLocalOnly: async (form, options = {}) => readNbwLocalOnly(await fetchCurrent('/api/admin/app-clients/nbw-local-only', { ...options, method: 'PUT', body: JSON.stringify(nbwLocalOnlyPayload(form)) })),
    nbwV2Policy: async (options = {}) => readNbwV2Policy(await fetchCurrent('/api/admin/nbw/policy', options)),
    saveNbwV2Policy: async (form, options = {}) => readNbwV2Policy(await fetchCurrent('/api/admin/nbw/policy', { ...options, method: 'PUT', body: JSON.stringify(nbwV2PolicyPayload(form)) })),
    appClientReminder: async (options = {}) => readReminder(await fetchCurrent('/api/admin/app-clients/reminder', options)),
    saveAppClientReminder: async (form, options = {}) => readReminder(await fetchCurrent('/api/admin/app-clients/reminder', { ...options, method: 'PUT', body: JSON.stringify(reminderPayload(form)) })),
    appClientPolicy: async (options = {}) => readPolicy(await fetchCurrent('/api/admin/app-clients/policy', options)),
    saveAppClientPolicy: async (form, options = {}) => readPolicy(await fetchCurrent('/api/admin/app-clients/policy', { ...options, method: 'PUT', body: JSON.stringify(policyPayload(form)) })),
    appClientStats: async (options = {}) => readStats(await fetchCurrent('/api/admin/app-clients/stats', options)),
    appClientUsers: async (params = {}, options = {}) => readUsers(await fetchCurrent(`/api/admin/app-clients/users?${usersQuery(params)}`, options)),
  };
}
