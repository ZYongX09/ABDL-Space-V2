/**
 * Cloudflare Pages Function — /oauth/* 代理到后端 Worker
 *
 * 与 /api/* 代理逻辑一致，确保 Moshidon 等客户端的
 * POST /oauth/token 请求能到达后端。
 */

const API_ORIGIN = 'https://abdl-space-api.zhx589.workers.dev';

export async function onRequest(context) {
  const { request } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    const origin = request.headers.get('Origin') || '*';
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Captcha-Token',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const url = new URL(request.url);
  const backendUrl = API_ORIGIN + url.pathname + url.search;

  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Host', url.host);
  headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }

  let response;
  try {
    response = await fetch(backendUrl, init);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'API proxy failed', detail: String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const responseHeaders = new Headers();
  for (const [key, value] of response.headers.entries()) {
    const lower = key.toLowerCase();
    if (lower === 'transfer-encoding' || lower === 'connection' || lower === 'content-encoding' || lower === 'content-length') {
      continue;
    }
    responseHeaders.set(key, value);
  }

  if (!responseHeaders.has('Access-Control-Allow-Origin')) {
    responseHeaders.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
