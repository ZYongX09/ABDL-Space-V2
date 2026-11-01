import { NBW_UPSTREAM_HOST_PATH, nbwUpstreamPayload, readNBWUpstream, sanitizeNBWUpstreamError } from './model.js';

// 只注入现有认证 apiFetch，无缓存、离线默认或自动重试；不导出会话、不保存任何状态。
export function createNBWUpstreamAPI(request) {
  const invoke = async (method, mode, { signal } = {}) => {
    try {
      signal?.throwIfAborted();
      const data = await request(NBW_UPSTREAM_HOST_PATH, { method, cache: 'no-store', signal,
        ...(method === 'PUT' ? { body: JSON.stringify(nbwUpstreamPayload(mode)) } : {}) });
      signal?.throwIfAborted();
      return readNBWUpstream(data);
    } catch (error) { throw sanitizeNBWUpstreamError(error, signal); }
  };
  return {
    nbwUpstreamHost: (options = {}) => invoke('GET', undefined, options),
    saveNBWUpstreamHost: (mode, options = {}) => invoke('PUT', mode, options),
  };
}
