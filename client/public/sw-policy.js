const workerScope = typeof self === 'undefined' ? globalThis : self;

workerScope.shouldCacheRequest = function shouldCacheRequest(request, origin) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== origin) return false;
  if (url.pathname.startsWith('/c/')) return false;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return false;
  if (request.headers.has('Authorization')) return false;
  return true;
};
