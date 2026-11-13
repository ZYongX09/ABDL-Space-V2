// 新的隔离测试宿主：不使用项目 index/main/vite 配置，绝不挂载 functions 或生产代理。
import { createServer as createHTTPServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseTranslationGlossaryFixtureJSON } from '../src/translationGlossary/fixture.js';
import { createAdminUXRouter, ADMIN_PAGE_DEFINITIONS, FIXTURE_DEFAULT_PORT, FIXTURE_PLATFORM } from './admin-ux-fixture-router.js';
import { fail, missing } from './admin-ux-fixture/core.js';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const VIRTUAL_ENTRY = '/@admin-ux/entry.jsx';
const VITE_ENV_PATH = '/@fs' + fileURLToPath(new URL('../client/env.mjs', import.meta.resolve('vite')));
export const FIXTURE_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob:; font-src 'self' data:; media-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'";
export const IMAGE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#e7edf4"/><circle cx="320" cy="210" r="110" fill="#4e7394"/><path d="M210 340h220" stroke="#a15e7c" stroke-width="18"/><text x="320" y="420" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#2c3e50">SYNTHETIC LOCAL ONLY</text></svg>';
const LOCAL_ASSETS = new Map([
  ['/fontawesome.min.css', 'text/css; charset=utf-8'],
  ['/webfonts/fa-solid-900.woff2', 'font/woff2'],
  ['/webfonts/fa-regular-400.woff2', 'font/woff2'],
  ['/webfonts/fa-brands-400.woff2', 'font/woff2'],
]);
const HTML = '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>隔离管理后台合成验收</title><link rel="stylesheet" href="/fontawesome.min.css"></head><body><div id="root"></div><script src="/__admin-ux/bootstrap.js"></script><script type="module" src="/@admin-ux/entry.jsx"></script></body></html>';
const BOOTSTRAP = `// 仅在独立测试 origin 生效，不进入生产入口。
const blocked = () => Promise.reject(new Error('隔离宿主禁止 Service Worker / 外部请求'));
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(items => Promise.all(items.map(item => item.unregister()))).catch(() => {});
  try { Object.defineProperty(navigator.serviceWorker, 'register', { value: blocked }); } catch {}
}
if ('caches' in window) caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key)))).catch(() => {});
for (const key of ['abdl_accounts', 'abdl_active_account', 'token', 'abdl_currentUser']) localStorage.removeItem(key);
localStorage.setItem('cookie_consent', JSON.stringify({ accepted: false, date: new Date().toISOString() }));
if (!['light','dark','colorful'].includes(localStorage.getItem('abdl_theme'))) localStorage.setItem('abdl_theme','light');
localStorage.setItem('abdl_auto_theme', 'false');
const originalFetch = window.fetch.bind(window);
window.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input, location.origin);
  if (url.origin !== location.origin) return blocked();
  return originalFetch(input, { ...options, redirect: 'error' });
};
const open = window.open.bind(window);
window.open = (url, ...args) => { if (url && new URL(url, location.origin).origin !== location.origin) return null; return open(url, ...args); };
document.addEventListener('click', event => { const link = event.target.closest?.('a[href]'); if (link && new URL(link.href, location.origin).origin !== location.origin) { event.preventDefault(); window.dispatchEvent(new CustomEvent('admin-ux-egress-blocked')); } }, true);
window.__ADMIN_UX_PLATFORM__ = ${JSON.stringify(FIXTURE_PLATFORM)};
window.__ADMIN_UX_PAGES__ = ${JSON.stringify(ADMIN_PAGE_DEFINITIONS.map(({ path, module, label }) => ({ path, module, label })))};
`;

export function isProtectedRequest(rawURL) {
  try {
    const rawPath = String(rawURL).split(/[?#]/, 1)[0];
    const candidates = [rawPath, new URL(rawURL, 'http://127.0.0.1').pathname];
    return candidates.some(value => {
      let path = value;
      for (let pass = 0; pass < 3; pass++) { const next = decodeURIComponent(path); if (next === path) break; path = next; }
      path = path.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
      return /^(?:\/api|\/oauth|\/__admin-ux)(?:\/|$)/.test(path);
    });
  } catch { return true; }
}

async function readJSON(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 96 * 1024) throw Object.assign(new Error('请求过大'), { status: 413 });
    chunks.push(buffer);
  }
  if (!size) return undefined;
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw Object.assign(new Error('只支持 JSON'), { status: 415 });
  const text = Buffer.concat(chunks).toString('utf8');
  try { return parseTranslationGlossaryFixtureJSON(text); }
  catch (error) { throw Object.assign(new Error('无效 JSON 或重复字段'), { status: error.status === 413 ? 413 : 400 }); }
}
function send(res, result) {
  res.writeHead(result.status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(result.data));
}

// 独立可复用 HTTP 边界；unknown API/OAuth 永不调用 vite/next/proxy。
export function createAdminUXRequestHandler({ router, vite = null, ui = true, transformIndexHtml = html => html } = {}) {
  if (!router) throw new TypeError('需要独立内存 router');
  return async function handle(req, res) {
    res.setHeader('Content-Security-Policy', FIXTURE_CSP);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    const host = req.headers.host || '127.0.0.1';
    if (!/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)) { send(res, fail(403, 'local_host_required')); return; }
    const ownOrigin = `http://${host}`;
    if (req.headers.origin && req.headers.origin !== ownOrigin) { send(res, fail(403, 'same_origin_required')); return; }
    if (req.headers['sec-fetch-site'] === 'cross-site') { send(res, fail(403, 'same_origin_required')); return; }
    let url; try { url = new URL(req.url, ownOrigin); } catch { send(res, fail(400, 'invalid_url')); return; }
    if (url.origin !== ownOrigin) { send(res, fail(403, 'same_origin_required')); return; }
    try {
      if (url.pathname === '/violation.png' && ['GET', 'HEAD'].includes(req.method)) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(req.method === 'HEAD' ? '' : IMAGE_SVG); return; }
      if (url.pathname === '/__admin-ux/bootstrap.js' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' }); res.end(BOOTSTRAP); return; }
      if (url.pathname === '/__admin-ux/image.svg' && ['GET', 'HEAD'].includes(req.method)) { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end(req.method === 'HEAD' ? '' : IMAGE_SVG); return; }
      // API/OAuth/control 先于任何 Vite 中间件。大小限制、JSON 语法错误也就地终止。
      if (isProtectedRequest(req.url)) {
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readJSON(req) : undefined;
        send(res, await router.respond(url.pathname + url.search, { method: req.method, body, headers: req.headers })); return;
      }
      if (LOCAL_ASSETS.has(url.pathname) && ['GET', 'HEAD'].includes(req.method)) {
        const asset = await readFile(join(ROOT, 'public', url.pathname.slice(1)));
        res.writeHead(200, { 'Content-Type': LOCAL_ASSETS.get(url.pathname) }); res.end(req.method === 'HEAD' ? '' : asset); return;
      }
      // Vite 客户端的固定非敏感模块；其路径含 dist，不能误作项目构建输出拒绝。
      if (vite && ['GET', 'HEAD'].includes(req.method) && url.pathname === VITE_ENV_PATH) { vite.middlewares(req, res, () => send(res, missing())); return; }
      // 没有 SW/manifest、生产 HTML 或 env/config/functions 静态读取入口。
      if (/\.(?:env|pem|key)(?:\.|$)|(?:^|\/)\.(?:env|git|wrangler)|(?:^|\/)(?:functions|dist)(?:\/|$)|\/(?:sw\.js|service-worker\.js|manifest[^/]*|index\.html)$/.test(url.pathname)) { send(res, missing()); return; }
      if (ui && req.method === 'GET' && !url.pathname.startsWith('/@') && !url.pathname.startsWith('/src/') && !url.pathname.startsWith('/node_modules/') && !url.pathname.startsWith('/tests/') && !url.pathname.startsWith('/webfonts/') && !url.pathname.startsWith('/fontawesome.min.css/') && !/\.[A-Za-z0-9]+$/.test(url.pathname)) {
        const html = await transformIndexHtml(HTML);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return;
      }
      if (vite && ['GET', 'HEAD'].includes(req.method) && /^(?:\/@|\/src\/|\/node_modules\/|\/tests\/admin-ux-fixture(?:-entry\.jsx|\/)|\/violation\.png)/.test(url.pathname)) { vite.middlewares(req, res, () => send(res, missing())); return; }
      send(res, missing());
    } catch (error) { if (!res.headersSent) send(res, fail([400, 413, 415].includes(error.status) ? error.status : 500, 'synthetic_host_error', '隔离宿主拒绝此请求；不会重试或转发')); else res.end(); }
  };
}

// 只在显式调用此函数/CLI 时创建 Vite；import 本文件不会启动服务或构建。
export async function createAdminUXFixtureServer({ port = FIXTURE_DEFAULT_PORT, ui = true, role = 'superadmin', scenario = 'normal' } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('无效本地端口');
  const router = createAdminUXRouter({ role, scenario });
  let vite = null, cacheDir = null;
  try {
    if (ui) {
      const [{ createServer }, { default: react }, { default: tailwindcss }, { default: autoprefixer }, { default: tailwindConfig }] = await Promise.all([import('vite'), import('@vitejs/plugin-react'), import('tailwindcss'), import('autoprefixer'), import(pathToFileURL(join(ROOT, 'tailwind.config.js')).href)]);
      cacheDir = await mkdtemp(join(tmpdir(), `admin-ux-${FIXTURE_PLATFORM}-`));
      const virtualId = '\0admin-ux-fixture-entry';
      vite = await createServer({
        root: ROOT, configFile: false, envFile: false, envPrefix: [], publicDir: false, appType: 'custom', cacheDir,
        esbuild: { jsx: 'automatic' }, resolve: { dedupe: ['react', 'react-dom'] },
        define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/', DEV: true, PROD: false, SSR: false, MODE: 'admin-ux-fixture', VITE_API_BASE: '', VITE_ADMIN_FIXTURE: '1' }) },
        css: { postcss: { plugins: [tailwindcss({ ...tailwindConfig, content: [{ raw: '<div></div>', extension: 'html' }, join(ROOT, 'src/**/*.{js,jsx}') ] }), autoprefixer()] } },
        optimizeDeps: { include: ['react', 'react-dom/client', 'react-router-dom', 'react/jsx-runtime'], entries: [join(ROOT, 'tests/admin-ux-fixture-entry.jsx')] },
        plugins: [{ name: 'isolated-admin-ux-virtual-entry', enforce: 'pre', resolveId(id) { if (id === VIRTUAL_ENTRY) return virtualId; }, load(id) { if (id === virtualId) return "import '/tests/admin-ux-fixture-entry.jsx';"; } }, react()],
        server: { middlewareMode: true, hmr: false, ws: false, proxy: {}, fs: { strict: true, allow: [ROOT], deny: ['.env', '.env.*', '**/*.{crt,pem,key}', '**/.git/**', '**/.wrangler/**'] } },
      });
    }
    const handler = createAdminUXRequestHandler({ router, vite, ui, transformIndexHtml: html => vite ? vite.transformIndexHtml('/admin', html) : html });
    const server = createHTTPServer(handler);
    return { server, router, handler, port, async close() { server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); await vite?.close(); if (cacheDir) await rm(cacheDir, { recursive: true, force: true }); } };
  } catch (error) { await vite?.close(); if (cacheDir) await rm(cacheDir, { recursive: true, force: true }); throw error; }
}

// 可用伪中间件独立验证，完全不打开端口；正式测试复用这个函数。
export async function validateUnknownAPINeverForwarded() {
  const { Readable } = await import('node:stream');
  const paths = ['/api', '/api/unknown', '/api/admin/not-implemented', '/oauth', '/oauth/authorize', '/%61pi/unknown', '//api/unknown', '/api%2funknown', '/api/unknown?target=https://example.invalid'];
  let forwarded = 0;
  const router = createAdminUXRouter();
  const handler = createAdminUXRequestHandler({ router, ui: false, vite: { middlewares() { forwarded++; } } });
  const results = [];
  for (const path of paths) {
    const req = Readable.from([]); Object.assign(req, { url: path, method: 'GET', headers: { host: '127.0.0.1:8818' } });
    const res = { headers: {}, status: 0, body: '', headersSent: false, setHeader(key, value) { this.headers[key] = value; }, writeHead(status, headers = {}) { this.status = status; this.headersSent = true; Object.assign(this.headers, headers); }, end(body = '') { this.body += body; } };
    await handler(req, res); results.push({ path, status: res.status, local: [400, 403, 404].includes(res.status) });
  }
  return { passed: forwarded === 0 && results.every(result => result.local), forwarded, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const value = name => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const port = Number(value('--port') || FIXTURE_DEFAULT_PORT);
  const app = await createAdminUXFixtureServer({ port, ui: !args.includes('--api-only'), role: value('--role') || 'superadmin', scenario: value('--scenario') || 'normal' });
  app.server.once('error', async error => { console.error(`隔离宿主未启动：${error.code || error.message}（不自动换端口）`); await app.close(); process.exitCode = 1; });
  app.server.listen(port, '127.0.0.1', () => console.log(`隔离合成后台 ${FIXTURE_PLATFORM}: http://127.0.0.1:${port}/admin （所有 API/OAuth 本地终止；无代理/真实付款/推送/AI）`));
  const stop = async () => { await app.close(); process.exitCode = 0; };
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
}
