// 独立 loopback fixture；没有生产代理/真实 NBW/全局 fetch 替换。全部合成数据仅保内存。
import { createServer as createHTTPServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { NBW_PRIMARY_ORIGIN as P, NBW_BACKUP_ORIGIN as B } from '../src/utils/nbwEndpoints.js';

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; frame-src 'none'; font-src 'self' data:; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'";
export async function createNBWBrowserFixture({ port = 8796, ui = true } = {}) {
  let mode = 'backup', revision = 1, remoteMode = 'full', scenario = 'normal', delay = 0, holdAuthorization = false;
  const waiting = new Set();
  const contexts = new Map(), events = [];
  const boundedEvent = event => { events.push(event); if (events.length > 100) events.shift(); };
  const endpoints = () => ({ schema_version: 1, revision: `fixture-${revision}`, mode, api_origin: mode === 'primary' ? P : B, authorize_origin: mode === 'primary' ? P : B, public_origin: mode === 'primary' ? P : B, media_origin: mode === 'primary' ? P : B, ttl_seconds: 30, remote_mode: remoteMode });
  const controls = new Set(['mode', 'remote_mode', 'scenario', 'delay_ms', 'reset', 'hold_authorization', 'release_authorization']);
  const scenarios = ['normal', 'unavailable', 'invalid', 'old-server', 'context-expired', 'context-consumed', 'register-evil'];
  const vite = ui ? await createViteServer({ configFile: false, envFile: false, root: new URL('../', import.meta.url).pathname,
    cacheDir: 'node_modules/.vite-nbw-browser-fixture', appType: 'custom', plugins: [react(), {
      name: 'loopback-nbw-fixture-navigation-capture',
      transform(code, id) {
        // 只替换 fixture 中的导航发送点，保留生产 strict授权 URL 校验/会话 state/context。
        // DOM 不改写、不放松 allowlist，也绝不把生产 NBW 网络请求代理回本地。
        if (id.endsWith('/src/utils/nbwOAuth.js')) return code.replace('window.location.assign(authorization.authorizationURL);', "window.dispatchEvent(new CustomEvent('nbw-fixture-navigation', { detail: authorization.authorizationURL }));");
      },
    }], define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') }, server: { middlewareMode: true, proxy: {}, hmr: false } }) : null;
  const server = createHTTPServer(async (req, res) => {
    const host = req.headers.host || '';
    const local = /^((?:localhost|127\.0\.0\.1)(?::\d+)?)$/.test(host);
    const origin = `http://${host}`;
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': CSP, Vary: 'Origin, Referer, User-Agent, X-App-Version-Code, X-ABDL-NBW-Protocol' };
    const finish = (status, data) => { res.writeHead(status, headers); res.end(JSON.stringify(data)); };
    if (!local || req.headers.origin && req.headers.origin !== origin) { finish(403, { error: '仅限当前loopback来源', code: 'FIXTURE_ORIGIN_INVALID' }); return; }
    const url = new URL(req.url, origin);
    try {
      let text = '';
      for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 16384) { finish(413, { error: '请求过大' }); return; } }
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { finish(400, { error: '无效本地请求' }); return; }
      if (url.pathname === '/__fixture/nbw/control') {
        if (req.method === 'POST') {
          if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !controls.has(key))
            || body.mode !== undefined && !['primary', 'backup'].includes(body.mode)
            || body.remote_mode !== undefined && !['full', 'read_only', 'local_only'].includes(body.remote_mode)
            || body.scenario !== undefined && !scenarios.includes(body.scenario)
            || body.delay_ms !== undefined && (!Number.isInteger(body.delay_ms) || body.delay_ms < 0 || body.delay_ms > 3000)) { finish(422, { error: '无效本地控制参数' }); return; }
          if (body.reset === true) { mode = 'backup'; revision++; remoteMode = 'full'; scenario = 'normal'; delay = 0; contexts.clear(); events.length = 0; holdAuthorization = false; for (const release of waiting) release(); }
          if (typeof body.hold_authorization === 'boolean') holdAuthorization = body.hold_authorization;
          if (body.release_authorization === true) { holdAuthorization = false; for (const release of waiting) release(); }
          if (body.mode !== undefined) { mode = body.mode; revision++; }
          if (body.remote_mode !== undefined) { remoteMode = body.remote_mode; revision++; }
          if (body.scenario !== undefined) scenario = body.scenario;
          if (body.delay_ms !== undefined) delay = body.delay_ms;
        } else if (req.method !== 'GET') { finish(405, { error: '仅GET/POST' }); return; }
        finish(200, { endpoints: endpoints(), scenario, delay_ms: delay, hold_authorization: holdAuthorization, waiting: waiting.size, scenarios, events: [...events], safety: '外部图片/iframe/API由CSP阻断，authorize只捕获URL绝不导航或访问NBW' }); return;
      }
      if (url.pathname === '/api/nbw/endpoints') {
        const data = endpoints();
        boundedEvent({ path: url.pathname, revision: data.revision });
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (scenario === 'unavailable') { finish(503, { error: '本地配置不可用', code: 'NBW_ENDPOINTS_UNAVAILABLE' }); return; }
        finish(200, scenario === 'invalid' ? { ...data, media_origin: 'https://evil.invalid' } : data); return;
      }
      if (url.pathname === '/api/auth/nbw/config') {
        const state = url.searchParams.get('state');
        if (!state || scenario === 'old-server') { finish(200, { client_id: 'fixture-client', redirect_uri: `${origin}/auth/nbw/callback` }); return; }
        const explicit = req.headers.origin, referer = req.headers.referer;
        let refererOrigin; try { refererOrigin = referer ? new URL(referer).origin : null; } catch {}
        if (explicit ? explicit !== origin : refererOrigin !== origin) { finish(400, { error: '缺少可信同站来源', code: 'NBW_OAUTH_CONTEXT_INVALID' }); return; }
        if (url.searchParams.size !== 1 || !/^[A-Za-z0-9_-]{16,128}$/.test(state)) { finish(400, { error: '无效state', code: 'NBW_OAUTH_CONTEXT_INVALID' }); return; }
        const data = endpoints(), context = `fixture-context-${contexts.size + 1}`;
        const redirect = `${origin}/auth/nbw/callback`;
        contexts.set(context, { state, endpoints: data, origin, used: false });
        boundedEvent({ path: url.pathname, source: explicit ? 'Origin' : 'Referer', origin, selected: data.mode, revision: data.revision });
        if (holdAuthorization) await new Promise(resolve => {
          const release = () => { waiting.delete(release); resolve(); };
          waiting.add(release); req.once('close', release);
        });
        finish(200, { client_id: 'fixture-client', redirect_uri: redirect, endpoints: data, authorization_url: `${data.authorize_origin}/oauth/authorize.php?${new URLSearchParams({ client_id: 'fixture-client', redirect_uri: redirect, response_type: 'code', state })}`, oauth_context: context, expires_in: 600 }); return;
      }
      if (['/api/auth/nbw/callback', '/api/auth/nbw/bind'].includes(url.pathname)) {
        const context = contexts.get(body?.oauth_context);
        if (!context || context.state !== body?.state || !/^fixture-code-[A-Za-z0-9_-]+$/.test(body?.code || '')) { finish(400, { error: '本地上下文无效', code: 'NBW_OAUTH_CONTEXT_INVALID' }); return; }
        if (context.used || scenario === 'context-consumed') { finish(409, { error: '本地上下文已消费', code: 'NBW_OAUTH_CONTEXT_CONSUMED' }); return; }
        if (scenario === 'context-expired') { finish(410, { error: '本地上下文已过期', code: 'NBW_OAUTH_CONTEXT_EXPIRED' }); return; }
        context.used = true;
        boundedEvent({ path: url.pathname, pinned_mode: context.endpoints.mode, current_mode: mode, pinned_revision: context.endpoints.revision });
        finish(200, url.pathname.endsWith('/bind') ? { message: '绑定成功（仅合成）' } : { action: 'choose', nbw_token: 'fixture-signed-bind-token', nbw_user: { uid: '42', username: '本地测试', avatar: `${P}/fixture-avatar.png` } }); return;
      }
      if (url.pathname === '/api/auth/nbw/get-register-url') { finish(200, { code: 200, data: { register_url: `${scenario === 'register-evil' ? 'https://evil.invalid' : mode === 'primary' ? P : B}/member.php?mod=register&signature=fixture%2Bsig` } }); return; }
      if (url.pathname === '/api/auth/nbw/check-register') { finish(200, { registered: false }); return; }
      if (url.pathname === '/__fixture/nbw' || url.pathname === '/') {
        const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NBW全链路本地验收</title></head><body><div id="root"></div><script type="module" src="/tests/nbw-browser-fixture-entry.jsx"></script></body></html>';
        res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }); res.end(vite ? await vite.transformIndexHtml(url.pathname, html) : html); return;
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/oauth/') || url.pathname.startsWith('/__fixture/')) { finish(404, { error: '本地fixture拒绝未知路径，不代理生产' }); return; }
      if (vite && (url.pathname.startsWith('/src/') || url.pathname.startsWith('/tests/') || url.pathname.startsWith('/node_modules/') || url.pathname.startsWith('/@'))) { res.setHeader('Content-Security-Policy', CSP); vite.middlewares(req, res); return; }
      finish(404, { error: '仅允许本地fixture资源' });
    } catch { if (!res.headersSent) finish(400, { error: '本地fixture请求失败，不回显输入' }); }
  });
  return { server, async close() { for (const release of waiting) release(); server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); await vite?.close(); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.NBW_FIXTURE_PORT || 8796), fixture = await createNBWBrowserFixture({ port });
  fixture.server.listen(port, '127.0.0.1', () => console.log(`NBW安全本地fixture http://127.0.0.1:${port}/__fixture/nbw；仅内存合成数据，禁止真实授权和外网代理。`));
}
