import { CONTENT_EDGE_HOSTS, normalizedContentPath, signContentClient, trustedContentClient } from './content-client.js';

const API_ORIGIN = 'https://abdl-space-api.zhx589.workers.dev';
const ACTION = '/settings/baby-verification';
const ESSENTIAL = new Set(['/login', '/auth/sign_in', '/register', '/auth/sign_up', '/forgot-password', '/beta-register', '/nbw-one-click-register', '/settings', '/account', '/baby-verification', ACTION, '/sponsors', '/orders', '/app', '/about', '/terms', '/privacy', '/cookies', '/minor-protection', '/nbw-bind-guide']);
export function isProtectedContentDocument(request) {
  const url = new URL(request.url), path = normalizedContentPath(request.url);
  if (!['GET', 'HEAD'].includes(request.method) || url.protocol !== 'https:' || !CONTENT_EDGE_HOSTS.includes(url.hostname)) return false;
  if (ESSENTIAL.has(path) || path === '/admin' || path === '/oauth' || path === '/api' || path === '/settings/security'
    || ['/api/', '/admin/', '/oauth/', '/auth/nbw/', '/orders/', '/c/', '/settings/security/', '/assets/', '/.well-known/'].some(prefix => path.startsWith(prefix))) return false;
  // Only explicit bootstrap/payment assets stay reachable. Data JSON, static demos and asset-looking content routes are not an extension-based bypass.
  if (['/robots.txt', '/sw.js', '/sw-policy.js', '/site.webmanifest', '/manifest.json', '/fontawesome.min.css', '/app-icon.png', '/intro-animation.js', '/apple-app-site-association', '/sponsors/payment-guide-1.png', '/sponsors/payment-guide-2.png'].includes(path)
    || path.startsWith('/webfonts/') || path.startsWith('/intro/')) return false;
  return true;
}
function decisionResponse(request, state) {
  const required = state === 'baby_verification_required';
  const message = required ? '请完成宝宝认证后继续访问内容。' : '内容暂时无法访问，请稍后重试。';
  const body = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${required ? '需要宝宝认证' : '内容暂时无法访问'}</title><main><h1>${required ? '需要宝宝认证' : '内容暂时无法访问'}</h1><p>${message}</p><p><a href="${ACTION}">前往宝宝认证</a></p><p><a href="/account">账户与安全</a> · <a href="/sponsors">赞助与订单</a> · <a href="/login">登录或切换账号</a></p></main></html>`;
  return new Response(request.method === 'HEAD' ? null : body, { status: required ? 403 : 503, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store, max-age=0', 'CDN-Cache-Control': 'no-store', 'Cloudflare-CDN-Cache-Control': 'no-store',
    'X-ABDL-Content-Access': required ? 'v1:required' : 'v1:unavailable', 'Vary': 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'", 'Referrer-Policy': 'no-referrer',
  } });
}
export async function checkWebContentAccess(context) {
  const { request } = context;
  if (!isProtectedContentDocument(request)) return null;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
  try {
    const secret = context.env?.AUTH_PROXY_HMAC_KEY;
    const client = await trustedContentClient(request, secret);
    // Verify the document-bound proof first. Only then may this server rebind it to the fixed access endpoint.
    const probe = new Request(`${API_ORIGIN}/api/access`, { method: 'GET' });
    const headers = new Headers({ Accept: 'application/json', 'Cache-Control': 'no-store' });
    for (const name of ['Cookie', 'Authorization']) if (request.headers.has(name)) headers.set(name, request.headers.get(name));
    await signContentClient(probe, headers, secret, client);
    const response = await fetch(probe.url, { method: 'GET', headers, redirect: 'manual', cache: 'no-store', signal: controller.signal });
    if (!response.ok) return decisionResponse(request, 'unavailable');
    const value = await response.json();
    if (value?.schema_version !== 1 || value.action_path !== ACTION || typeof value.message !== 'string') return decisionResponse(request, 'unavailable');
    if (value.state === 'open') return 'open';
    return decisionResponse(request, value.state === 'baby_verification_required' ? value.state : 'unavailable');
  } catch { return decisionResponse(request, 'unavailable'); }
  finally { clearTimeout(timer); }
}
export function contentDocumentHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'private, no-store, max-age=0'); headers.set('CDN-Cache-Control', 'no-store'); headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
  headers.set('X-ABDL-Content-Access', 'v1:open');
  const vary = headers.get('Vary') || '';
  if (vary !== '*') headers.set('Vary', [...new Set([...vary.split(',').map(item => item.trim()).filter(Boolean), 'Cookie', 'Authorization'])].join(', '));
  return headers;
}
