const ENVELOPE_HEADERS = ['X-Auth-Client-IP', 'X-Auth-Client-Time', 'X-Auth-Client-Signature'];

export async function attachAuthClientIp(request, headers, secret, now = Date.now()) {
  for (const name of ENVELOPE_HEADERS) headers.delete(name);
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (request.method !== 'POST' || (!path.startsWith('/api/auth/') && path !== '/api/beta/beta-register' && path !== '/api/admin/security/test-verification-code')) return;
  if (typeof secret !== 'string' || secret.length < 32) return;
  const ip = (request.headers.get('CF-Connecting-IP') || '').trim().toLowerCase();
  if (!ip || ip.length > 45 || !/^[a-f0-9:.]+$/.test(ip)) return;
  const timestamp = String(Math.floor(now / 1000));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = `auth-proxy-ip:v1\n${request.method}\n${path}\n${timestamp}\n${ip}`;
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  headers.set(ENVELOPE_HEADERS[0], ip);
  headers.set(ENVELOPE_HEADERS[1], timestamp);
  headers.set(ENVELOPE_HEADERS[2], Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''));
}
