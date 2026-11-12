import { archiveResponseHeaders, bypassArchiveGuard, isArchiveCrawler } from './_shared/archive-policy.js';

export async function onRequest(context) {
  const { request } = context;
  const pathname = new URL(request.url).pathname;
  // 保留现有 App/API、OAuth、WebSocket 及系统应用关联响应，不重建其响应对象。
  if (bypassArchiveGuard(pathname)) return context.next();
  if (isArchiveCrawler(request.headers.get('User-Agent'))) {
    return new Response(request.method === 'HEAD' ? null : 'Forbidden\n', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'private, no-store, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vary': 'User-Agent',
        'X-Robots-Tag': 'noarchive',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  const response = await context.next();
  if (response.status === 101) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: archiveResponseHeaders(response),
  });
}
