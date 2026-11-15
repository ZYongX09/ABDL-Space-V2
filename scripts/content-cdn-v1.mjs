// REVIEWABLE CANDIDATE ONLY — NOT DEPLOYED / NOT ACTIVATED.
// Based on actual stored source-only main-cdn/mobile-cdn + cdn-auth-proxy.mjs read from
// /home/ZYongX/.local/share/abdl-registration-production/20261026/ (documented production 2026-10-26).
// Activation is BLOCKED pending authorized current deployed-source/origin/route/provenance review,
// matching AUTH_PROXY_HMAC_KEY availability (never print/read its value), backend policy/schema and full-chain checks.
// No Wrangler configuration, bindings, origin policies, cache rules or archive-guard activation are changed here.
import { attachAuthClientIp } from '../client/functions/_shared/auth-client-ip.js';
import { attachContentClient, CONTENT_EDGE_HOSTS } from '../client/functions/_shared/content-client.js';
const TARGETS = new Set(['abdl-space-v2.pages.dev', 'abdl-space-mobile-cwy.pages.dev']);
export const CONTENT_CDN_ACTIVATION = 'blocked-pending-authorized-current-source-and-chain-review';
export function createCdnProxy(target, includeGeo = false) {
  if (!TARGETS.has(target)) throw new Error('Unapproved proxy target');
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.protocol !== 'https:' || !CONTENT_EDGE_HOSTS.includes(url.hostname)) return new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
      url.hostname = target;
      const headers = new Headers(request.headers);
      // Retain historical display-only forwarding. None of these raw headers authorizes content access.
      if (includeGeo) {
        const ip = request.headers.get('CF-Connecting-IP');
        if (ip) headers.set('X-Real-Client-IP', ip);
        if (request.cf) {
          if (request.cf.country) headers.set('X-CF-Country', String(request.cf.country));
          if (request.cf.region) headers.set('X-CF-Region', String(request.cf.region));
          if (request.cf.city) headers.set('X-CF-City', String(request.cf.city));
        }
      }
      try {
        await attachAuthClientIp(request, headers, env?.AUTH_PROXY_HMAC_KEY);
        const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/';
        if (request.method === 'POST' && (path.startsWith('/api/auth/') || path === '/api/beta/beta-register' || path === '/api/admin/security/test-verification-code') && !headers.has('X-Auth-Client-Signature')) throw new Error('Auth proxy unavailable');
      } catch { return Response.json({ error: '验证入口暂时不可用，请稍后重试', code: 'AUTH_PROXY_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '30' } }); }
      // Includes GET/HEAD web documents and API calls. Synthetic/private/unproven sources stay unsigned.
      await attachContentClient(request, headers, env?.AUTH_PROXY_HMAC_KEY);
      return fetch(new Request(url, { method: request.method, headers, body: request.body, redirect: request.redirect, cache: 'no-store', ...(request.body ? { duplex: 'half' } : {}) }));
    },
  };
}
