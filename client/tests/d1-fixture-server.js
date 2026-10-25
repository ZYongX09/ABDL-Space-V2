import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';

// 独立于生产 vite.config/index/main，永远不加载代理、env、SW、统计、NSFW或推送。
export async function createD1FixtureServer({ port = 8795, quiet = false } = {}) {
  const cacheDir = await mkdtemp(join(tmpdir(), 'd1-browser-fixture-'));
  const state = { scenario: 'success', delay: 20_000, calls: {}, events: [], unread: { A: 3, B: 5 } };
  const html = '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>D1 本地 effects 验收</title></head><body><div id="root"></div><script type="module" src="/tests/d1-fixture-entry.jsx"></script></body></html>';
  const csp = `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:${port + 100} ws://localhost:${port + 100}; img-src 'self' data:; font-src 'self'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`;
  const vite = await createViteServer({ configFile: false, envFile: false, cacheDir,
    root: new URL('../', import.meta.url).pathname, appType: 'custom',
    resolve: { dedupe: ['react', 'react-dom'] },
    define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') },
    server: { middlewareMode: true, hmr: { port: port + 100 }, proxy: {} },
    optimizeDeps: { include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client', 'react-router-dom'] },
    plugins: [react(), { name: 'd1-local-only', transform(_code, id) {
      if (id.endsWith('/contexts/AuthContext.jsx')) return 'export { useFixtureAuth as useAuth } from "/tests/d1-fixture-entry.jsx";';
      if (id.endsWith('/contexts/MobileHeaderContext.jsx')) return 'const registerActions = () => {}; export const useMobileHeaderActions = () => ({ registerActions });';
      if (id.endsWith('/utils/pushManager.js')) return 'export const isPushSupported = async () => false; export const isPushSubscribed = async () => false; export const subscribePush = async () => false; export const unsubscribePush = async () => {}; export const syncExistingSubscription = async () => {};';
    } }],
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Security-Policy', csp);
    res.setHeader('Cache-Control', 'no-store');
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${port}` && origin !== `http://localhost:${port}`) { res.writeHead(403); res.end(); return; }
    const json = (status, data, headers = {}) => { if (!res.destroyed) { res.writeHead(status, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(data)); } };
    if (url.pathname === '/__fixture/state') { json(200, state); return; }
    if (url.pathname === '/__fixture/config' && req.method === 'POST') {
      let text = '';
      for await (const chunk of req) { text += chunk; if (text.length > 4096) { json(413, {}); return; } }
      let data;
      try { data = JSON.parse(text); } catch { json(400, {}); return; }
      if (['success', '429', '401', 'slow', 'messages-error', 'send-slow', 'load-send-error'].includes(data.scenario)) state.scenario = data.scenario;
      if (data.reset) { state.calls = {}; state.events = []; state.unread = { A: 3, B: 5 }; }
      json(200, state); return;
    }
    if (url.pathname.startsWith('/api/')) {
      const account = /Bearer fixture-B/.test(req.headers.authorization || '') ? 'B' : 'A';
      const key = `${account} ${req.method} ${url.pathname}`;
      state.calls[key] = (state.calls[key] || 0) + 1;
      const event = { key, started: Date.now(), scenario: state.scenario, aborted: false };
      state.events.push(event); if (state.events.length > 8) state.events.shift();
      res.on('close', () => { if (!res.writableEnded) event.aborted = true; });
      // 启动时捕获响应，slow 模式可复现 read 后在途旧 snapshot 的竞态。
      const payload = url.pathname === '/api/notifications' ? { unread_count: 2, notifications: [{ id: 1, message: `通知 ${account}`, read: false }] }
        : url.pathname === '/api/messages/conversations' ? { conversations: [{ user_id: 2, username: `peer-${account}`, unread: state.unread[account], last_message: `snapshot-${account}`, last_message_at: '2026-10-18T10:00:00Z' }] }
        : /^\/api\/messages\/\d+$/.test(url.pathname) ? { messages: [{ id: 1, sender_id: 2, content: `消息-${account}`, created_at: '2026-10-18T10:00:00Z' }] }
        : { message: 'fixture only' };
      const scenario = state.scenario;
      if ((scenario === 'slow' && req.method === 'GET') || (scenario === 'send-slow' && url.pathname === '/api/messages' && req.method === 'POST') || (scenario === 'load-send-error' && /^\/api\/messages\/\d+$/.test(url.pathname))) await new Promise(resolve => setTimeout(resolve, state.delay));
      if (scenario === 'load-send-error' && url.pathname === '/api/messages' && req.method === 'POST') { json(503, { error: '本地发送失败（打断旧 load 后不能卡住 loading）' }); return; }
      if (scenario === '429') {
        // 手动验收用：故意以 text/plain 返回，覆盖 apiFetch 非 JSON 错误 metadata 分支。
        json(429, { error: 'fixture 429' }, { 'Content-Type': 'text/plain' });
        return;
      }
      if (scenario === '401') {
        json(401, { error: 'fixture 401' }, { 'Content-Type': 'text/plain' });
        return;
      }
      if (scenario === 'messages-error' && /^\/api\/messages\/\d+$/.test(url.pathname)) { json(503, { error: '本地消息失败，不应由 toast 重渲染重拉', code: 'FIXTURE_MESSAGE_ERROR' }); return; }
      if (/\/read$/.test(url.pathname) && req.method === 'POST') state.unread[account] = 0;
      json(200, payload); event.finished = Date.now(); return;
    }
    if (url.pathname === '/' || url.pathname === '/messages') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(await vite.transformIndexHtml(url.pathname, html)); return;
    }
    if (url.pathname === '/sw.js') { res.writeHead(404); res.end(); return; }
    vite.middlewares(req, res);
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  if (!quiet) console.log(`D1 fixture 仅本地 http://127.0.0.1:${port}/messages?user=2（无生产代理/外联）`);
  return { port, state, close: async () => { await new Promise(resolve => server.close(resolve)); await vite.close(); await rm(cacheDir, { recursive: true, force: true }); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = await createD1FixtureServer({ port: Number(process.argv[2]) || 8795 });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void fixture.close().then(() => process.exit(0)); });
}
