import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createObservationFixture, fixtureUser } from './fixture.js';
import { ROOT } from './api.js';

const SCENARIOS = ['normal', 'empty', 'large', 'slow', 'conflict', 'save-error', 'unavailable', 'schema-unavailable', 'invalid', 'unauthorized', 'forbidden'];
const html = '<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>定向观察 · 本地验收</title></head><body><div id="root"></div><script type="module" src="/@vite/client"></script><script type="module" src="/src/userObservation/fixture-entry.jsx"></script></body></html>';

/** 独立 loopback 入口，无 build config、Pages proxy 或生产认证修改。 */
export async function createObservationFixtureServer({ port = 8796, ui = true, scenario = 'normal' } = {}) {
  const fixture = createObservationFixture({ scenario });
  let actorId = 1;
  const vite = ui ? await createViteServer({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, cacheDir: `node_modules/.vite-user-observation-fixture-${port}`, esbuild: { jsx: 'automatic' }, plugins: [react()], resolve: { dedupe: ['react', 'react-dom'] }, optimizeDeps: { include: ['react', 'react-dom/client', 'react/jsx-runtime', 'react-router-dom'] }, server: { middlewareMode: true, hmr: { host: '127.0.0.1', port: port + 100 } }, define: { 'import.meta.env.VITE_API_BASE': JSON.stringify(''), 'import.meta.env.VITE_ADMIN_FIXTURE': JSON.stringify('1') } }) : null;
  const csp = `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:${port + 100}; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`;
  const server = createServer(async (req, res) => {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': csp, 'Referrer-Policy': 'no-referrer', Vary: 'Cookie, Authorization' };
    const send = (status, data) => { res.writeHead(status, headers); res.end(JSON.stringify(data)); };
    if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) { send(403, { error: '仅允许 loopback Host' }); return; }
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { send(403, { error: '禁止跨域来源' }); return; }
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      let body;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        let bytes = 0; const chunks = [];
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 16384) { send(413, { error: '请求过大' }); return; } chunks.push(chunk); }
        body = bytes ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      }
      if (url.pathname === '/__fixture/session') {
        if (req.method === 'POST') {
          if ([0, 1, 2, 3].includes(body.id)) actorId = body.id;
          if (SCENARIOS.includes(body.scenario)) fixture.setScenario(body.scenario);
        }
        send(200, { actorId, scenario: fixture.getScenario() }); return;
      }
      if (url.pathname === '/__fixture/calls') { send(200, { calls: fixture.calls, audit: fixture.audit }); return; }
      if (url.pathname === '/api/auth/me') { send(actorId ? 200 : 401, actorId ? { ...fixtureUser(actorId), role: actorId <= 2 ? 'admin' : 'user', is_super_admin: actorId === 1 } : { error: '未登录' }); return; }
      if (url.pathname === '/api/auth/logout' && req.method === 'POST') { actorId = 0; send(200, {}); return; }
      if (url.pathname.startsWith(ROOT)) {
        const result = structuredClone(fixture.respond(url.pathname, { method: req.method, params: url.searchParams, body, actorId, operationId: req.headers['idempotency-key'] }));
        if (fixture.delay()) await new Promise(resolve => setTimeout(resolve, fixture.delay()));
        send(result.status, result.data); return;
      }
      if (url.pathname === '/api/admin/security/stats') { send(200, { dayCount: 0, weekCount: 0, typeStats: [], scoreDistribution: [], trend: [] }); return; }
      if (url.pathname === '/api/admin/security/logs') { send(200, { logs: [], total: 0 }); return; }
      if (url.pathname === '/api/admin/users') { const users = [3, 4].map(id => ({ ...fixtureUser(id), email: `fixture${id}@example.invalid`, created_at: '2026-11-01T00:00:00Z' })); send(200, { users, pagination: { page: 1, total: 2, totalPages: 1 } }); return; }
      if (/^\/api\/admin\/users\/[34]\/detail$/.test(url.pathname)) { const id = Number(url.pathname.split('/')[4]); send(200, { user: fixtureUser(id), counts: {}, badges: [], tracking: { enabled: false }, trackEvents: [], recentPosts: [] }); return; }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/oauth/')) { send(404, { error: '本地 fixture 未实现此接口，绝不转发生产' }); return; }
      if (url.pathname === '/sw.js') { res.writeHead(200, { ...headers, 'Content-Type': 'application/javascript' }); res.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));"); return; }
      if (ui && (url.pathname === '/' || url.pathname.startsWith('/admin/'))) {
        res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }); res.end(await vite.transformIndexHtml(url.pathname, html)); return;
      }
      if (vite) { for (const [key, value] of Object.entries(headers)) if (key !== 'Content-Type') res.setHeader(key, value); vite.middlewares(req, res); return; }
      send(404, { error: '未启用本地 UI' });
    } catch { send(400, { error: '无效本地请求' }); }
  });
  return { server, fixture, async close() { server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); await vite?.close(); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.OBSERVATION_FIXTURE_PORT || 8796);
  const instance = await createObservationFixtureServer({ port });
  instance.server.listen(port, '127.0.0.1', () => console.log(`本地定向观察：http://127.0.0.1:${port}/admin/security?tab=user-observation&user_id=3（不转发真实 API）`));
}
