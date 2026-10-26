const ENVELOPE_HEADERS = ['X-Auth-Client-IP', 'X-Auth-Client-Time', 'X-Auth-Client-Signature'];
const SYNTHETIC_CF_IP = '2a06:98c0:3600::103';

function isRealClientIp(ip) {
  return ip.length > 0 && ip.length <= 45 && /^[a-f0-9:.]+$/.test(ip) && ip !== SYNTHETIC_CF_IP;
}

export async function attachAuthClientIp(request, headers, secret, now = Date.now()) {
  // 先快照，兼容外层 Worker 直接传入 request.headers；旧 envelope 始终删除。
  const [incomingIp, incomingTime, incomingSignature] = ENVELOPE_HEADERS.map(name => request.headers.get(name) || '');
  for (const name of ENVELOPE_HEADERS) headers.delete(name);
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (request.method !== 'POST' || (!path.startsWith('/api/auth/') && path !== '/api/beta/beta-register' && path !== '/api/admin/security/test-verification-code')) return;
  if (typeof secret !== 'string' || secret.length < 32) return;

  let ip = (request.headers.get('CF-Connecting-IP') || '').trim().toLowerCase();
  const upstreamIp = incomingIp.trim().toLowerCase();
  const nowSeconds = Math.floor(now / 1000);
  const upstreamTime = Number(incomingTime);
  const canVerify = isRealClientIp(upstreamIp)
    && /^\d+$/.test(incomingTime)
    && Number.isSafeInteger(upstreamTime)
    && Math.abs(nowSeconds - upstreamTime) <= 30
    && /^[a-f0-9]{64}$/i.test(incomingSignature);
  if (!canVerify && !isRealClientIp(ip)) return;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
  if (canVerify) {
    const signature = Uint8Array.from(incomingSignature.match(/../g), byte => Number.parseInt(byte, 16));
    const upstreamData = `auth-proxy-ip:v1\n${request.method}\n${path}\n${incomingTime}\n${upstreamIp}`;
    if (await crypto.subtle.verify('HMAC', key, signature, encoder.encode(upstreamData))) ip = upstreamIp;
  }
  // 跨 Worker 的 synthetic 地址不是用户 IP；无有效上游证明时不签名。
  if (!isRealClientIp(ip)) return;
  const timestamp = String(nowSeconds);
  const data = `auth-proxy-ip:v1\n${request.method}\n${path}\n${timestamp}\n${ip}`;
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  headers.set(ENVELOPE_HEADERS[0], ip);
  headers.set(ENVELOPE_HEADERS[1], timestamp);
  headers.set(ENVELOPE_HEADERS[2], Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''));
}
