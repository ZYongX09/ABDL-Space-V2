// content-access:v1. Source-only; never read a forwarded IP/geo claim as edge evidence.
export const CONTENT_CLIENT_HEADERS = Object.freeze(['X-Content-Client-IP', 'X-Content-Client-Country', 'X-Content-Client-Region', 'X-Content-Client-Time', 'X-Content-Client-Signature']);
export const CONTENT_EDGE_HOSTS = Object.freeze(['abdl-space.top', 'www.abdl-space.top', 'm.abdl-space.top', 'admin.abdl-space.top', 'merchant.abdl-space.top', 'abdl-space-v2.pages.dev', 'abdl-space-mobile-cwy.pages.dev']);
export const normalizedContentPath = url => new URL(url).pathname.replace(/\/+$/, '') || '/';
const validCountry = value => typeof value === 'string' && /^(?:[A-Z]{2})?$/.test(value);
const validRegion = value => typeof value === 'string' && /^(?:[A-Z0-9]{2,3})?$/.test(value);
export function publicContentIp(value) {
  if (typeof value !== 'string' || value.length > 45 || !/^[a-fA-F0-9:.]+$/.test(value)) return null;
  if (!value.includes(':')) {
    if (!/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value)) return null;
    const [a, b, c, d] = value.split('.').map(Number);
    if ([a, b, c, d].some(byte => byte > 255) || a === 0 || a === 10 || a === 127 || a >= 224
      || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31
      || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99)
      || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113) return null;
    return value;
  }
  try {
    const ip = new URL(`http://[${value}]/`).hostname.slice(1, -1);
    // Only public global-unicast IPv6; reject mapped/private/documentation and CF cross-zone synthetic (including aliases).
    if (!/^[23]/.test(ip) || ip === '2a06:98c0:3600::103' || /^2001:(?:db8|0|2|10|20)(?::|$)/.test(ip) || /^3fff:/.test(ip)) return null;
    return ip;
  } catch { return null; }
}
const keyFor = secret => crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const usableSecret = secret => typeof secret === 'string' && secret.length >= 32;
const canonical = (request, timestamp, client) => `content-access:v1\n${request.method}\n${normalizedContentPath(request.url)}\n${timestamp}\n${client.ip}\n${client.country}\n${client.region}`;
export function stripContentClientHeaders(headers) {
  // Strip every caller-supplied content extension as well as the response-only decision header.
  for (const name of [...headers.keys()]) if (/^x-content-client-/i.test(name) || name.toLowerCase() === 'x-abdl-content-access') headers.delete(name);
}
export async function trustedContentClient(request, secret, now = Date.now(), edgeHosts = CONTENT_EDGE_HOSTS) {
  const path = normalizedContentPath(request.url);
  if (!usableSecret(secret) || path.length > 2048 || !/^[A-Z]+$/.test(request.method)) return null;
  const [ip, country, region, timestamp, signature] = CONTENT_CLIENT_HEADERS.map(name => request.headers.get(name) || '');
  const publicIp = publicContentIp(ip);
  try {
    if (publicIp && publicIp === ip && validCountry(country) && validRegion(region) && /^\d{10}$/.test(timestamp)
      && Math.abs(Math.floor(now / 1000) - Number(timestamp)) <= 30 && /^[a-f0-9]{64}$/.test(signature)) {
      const client = { ip, country, region };
      const bytes = Uint8Array.from(signature.match(/../g), byte => Number.parseInt(byte, 16));
      if (await crypto.subtle.verify('HMAC', await keyFor(secret), bytes, new TextEncoder().encode(canonical(request, timestamp, client)))) return client;
    }
  } catch { return null; }
  // request.cf is a platform property, not an incoming header. Only exact own origins can use the direct edge fallback.
  if (new URL(request.url).protocol !== 'https:' || !edgeHosts.includes(new URL(request.url).hostname) || request.headers.has('CF-Worker') || !request.cf || typeof request.cf !== 'object') return null;
  const directIp = publicContentIp(request.headers.get('CF-Connecting-IP'));
  const directCountry = request.cf.country ?? '', directRegion = request.cf.regionCode ?? '';
  if (!directIp || !validCountry(directCountry) || !validRegion(directRegion)) return null;
  return { ip: directIp, country: directCountry, region: directRegion };
}
export async function signContentClient(request, headers, secret, client, now = Date.now()) {
  stripContentClientHeaders(headers);
  if (!usableSecret(secret) || !client || publicContentIp(client.ip) !== client.ip || !validCountry(client.country) || !validRegion(client.region) || normalizedContentPath(request.url).length > 2048) return false;
  try {
    const timestamp = String(Math.floor(now / 1000));
    const digest = await crypto.subtle.sign('HMAC', await keyFor(secret), new TextEncoder().encode(canonical(request, timestamp, client)));
    [client.ip, client.country, client.region, timestamp, Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')].forEach((value, index) => headers.set(CONTENT_CLIENT_HEADERS[index], value));
    return true;
  } catch { stripContentClientHeaders(headers); return false; }
}
export async function attachContentClient(request, headers, secret, now = Date.now()) {
  // Snapshot/verify before stripping, including when request.headers aliases headers.
  const client = await trustedContentClient(request, secret, now);
  await signContentClient(request, headers, secret, client, now);
  return client;
}
