const workerScope = typeof self === 'undefined' ? globalThis : self;

workerScope.shouldCacheRequest = function shouldCacheRequest(request, origin) {
  if (request.method !== 'GET') return false;
  if (request.mode === 'navigate' || request.destination === 'document') return false;
  const url = new URL(request.url);
  if (url.origin !== origin) return false;
  if (url.pathname.startsWith('/c/')) return false;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return false;
  if (request.headers.has('Authorization')) return false;
  return url.pathname.startsWith('/assets/')
    || /\.(?:png|jpe?g|webp|svg|ico|css|js|woff2?|ttf)$/i.test(url.pathname);
};
