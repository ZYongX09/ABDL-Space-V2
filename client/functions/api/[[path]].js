/**
 * Cloudflare Pages Function — /api/* 代理到后端 Worker
 *
 * 用途：
 * - 前端用相对路径 /api/* 部署在 abdl-space.top (CF Pages 静态)
 * - 实际 API 在 abdl-space-api.zhx589.workers.dev
 * - 此 function 把所有 /api/* 请求透明代理到后端
 *
 * 注意：
 * - 保留原请求 method / headers / body
 * - 添加 X-Forwarded-Host 让后端知道原始域名
 * - 不缓存
 */

const API_ORIGIN = 'https://abdl-space-api.zhx589.workers.dev';

export async function onRequest(context) {
  const { request } = context;

  // CORS preflight - 直接返回
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

  // 构造后端 URL：/api/xxx → https://abdl-space-api.zhx589.workers.dev/api/xxx
  const url = new URL(request.url);
  const backendUrl = API_ORIGIN + url.pathname + url.search;

  // 复制原请求 headers
  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Host', url.host);
  headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

  // 构造 fetch
  const init = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  // GET/HEAD 不带 body
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    // duplex 是 streaming body 必需的
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

  // 复制响应 headers，但跳过 hop-by-hop 和 content-encoding（避免 decode 问题）
  const responseHeaders = new Headers();
  for (const [key, value] of response.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower === 'transfer-encoding' ||
      lower === 'connection' ||
      lower === 'content-encoding' ||
      lower === 'content-length'
    ) {
      continue;
    }
    responseHeaders.set(key, value);
  }

  // 确保 CORS 头（兜底，正常情况后端已经返回）
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
