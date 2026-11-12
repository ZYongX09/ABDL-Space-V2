const ENVELOPE_HEADERS = ['X-Auth-Client-IP', 'X-Auth-Client-Time', 'X-Auth-Client-Signature'];
const SYNTHETIC_CF_IP = '2a06:98c0:3600::103';
const OBSERVATION_HEADERS = ['X-Observation-Client-IP', 'X-Observation-Client-Time', 'X-Observation-Client-Signature'];

function normalizedObservationIp(value) {
  const ip = (value || '').trim().toLowerCase();
  if (!ip || ip.length > 45 || !/^[a-f0-9:.]+$/.test(ip)) return null;
  const ipv4 = part => /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(part) && part.split('.').every(byte => Number(byte) <= 255);
  if (!ip.includes(':')) return ipv4(ip) ? ip : null;
  if (ip.includes('.') && !ipv4(ip.slice(ip.lastIndexOf(':') + 1))) return null;
  try {
    // Pages does not enable nodejs_compat; URL validates IPv6 instead of importing node:net.
    const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    return normalized && normalized !== SYNTHETIC_CF_IP ? normalized : null;
  } catch { return null; }
}

/** Sign a distinct observation-only API envelope; this never expands legacy auth POST protection. */
export async function attachObservationClientIp(request, headers, secret, now = Date.now()) {
  const snapshot = names => names.map(name => request.headers.get(name) || '');
  const observation = snapshot(OBSERVATION_HEADERS);
  const legacy = snapshot(ENVELOPE_HEADERS);
  for (const name of OBSERVATION_HEADERS) headers.delete(name);
  const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
  if (path.length > 2048 || !/^\/api(?:\/|$)/.test(path) || typeof secret !== 'string' || secret.length < 32) return;
  let ip = normalizedObservationIp(request.headers.get('CF-Connecting-IP'));
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    const nowSeconds = Math.floor(now / 1000);
    const verify = async ([claimedIp, timestamp, signature], purpose, canonical) => {
      const normalized = normalizedObservationIp(claimedIp);
      if (!normalized || canonical && normalized !== claimedIp || !/^\d{10}$/.test(timestamp)
        || Math.abs(nowSeconds - Number(timestamp)) > 30 || !/^[a-f0-9]{64}$/.test(signature)) return null;
      // Legacy signatures bind their original lowercase spelling, not the new canonical spelling.
      if (!canonical && claimedIp !== claimedIp.toLowerCase()) return null;
      const bytes = Uint8Array.from(signature.match(/../g), byte => Number.parseInt(byte, 16));
      const data = `${purpose}\n${request.method}\n${path}\n${timestamp}\n${claimedIp}`;
      return await crypto.subtle.verify('HMAC', key, bytes, encoder.encode(data)) ? normalized : null;
    };
    ip = await verify(observation, 'observation-proxy-ip:v1', true) || await verify(legacy, 'auth-proxy-ip:v1', false) || ip;
    if (!ip) return;
    const timestamp = String(nowSeconds);
    const data = `observation-proxy-ip:v1\n${request.method}\n${path}\n${timestamp}\n${ip}`;
    const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    headers.set(OBSERVATION_HEADERS[0], ip);
    headers.set(OBSERVATION_HEADERS[1], timestamp);
    headers.set(OBSERVATION_HEADERS[2], Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join(''));
  } catch {
    // Observation evidence is optional; signing failures must not change API availability or log headers.
    for (const name of OBSERVATION_HEADERS) headers.delete(name);
  }
}

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
