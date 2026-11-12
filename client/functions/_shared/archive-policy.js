// 明确归档用途的产品标识；UA 可伪装，此列表不是身份认证或完整防复制保证。
export const ARCHIVE_PRODUCTS = Object.freeze(['archive.org_bot', 'ia_archiver', 'ia_archiver-web.archive.org', 'ArchiveBot', 'CCBot', 'heritrix']);
const ARCHIVE_TOKENS = new Set(ARCHIVE_PRODUCTS.map(product => product.toLowerCase()));
const ASSOCIATIONS = new Set(['/.well-known/assetlinks.json', '/.well-known/apple-app-site-association', '/apple-app-site-association']);

export function isArchiveCrawler(userAgent) {
  return typeof userAgent === 'string' && (userAgent.toLowerCase().match(/[a-z][a-z\d_.-]*/g) || []).some(product => ARCHIVE_TOKENS.has(product));
}

export function bypassArchiveGuard(pathname) {
  return pathname === '/robots.txt' || ASSOCIATIONS.has(pathname)
    || pathname === '/api' || pathname.startsWith('/api/')
    || pathname === '/oauth' || pathname.startsWith('/oauth/');
}

export function archiveResponseHeaders(response) {
  const headers = new Headers(response.headers);
  const directives = new Set((headers.get('X-Robots-Tag') || '').split(',').map(value => value.trim()).filter(Boolean));
  if (![...directives].some(value => value.toLowerCase() === 'noarchive')) directives.add('noarchive');
  headers.set('X-Robots-Tag', [...directives].join(', '));
  const vary = (headers.get('Vary') || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!vary.includes('*') && !vary.some(value => value.toLowerCase() === 'user-agent')) vary.push('User-Agent');
  headers.set('Vary', vary.join(', '));
  // SPA fallback 也可能出现在带 .js/.png 后缀的路径，按实际响应类型而不是 URL 判断。
  const type = (headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (type === 'text/html' || type === 'application/xhtml+xml') {
    headers.set('Cache-Control', 'private, no-store, max-age=0');
    headers.set('CDN-Cache-Control', 'no-store');
  }
  return headers;
}
