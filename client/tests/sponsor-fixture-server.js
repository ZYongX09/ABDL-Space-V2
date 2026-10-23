import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSponsorFixture, SPONSOR_FIXTURE_IDENTITIES, SPONSOR_FIXTURE_SCENARIOS } from '../src/sponsors/fixture.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const defaultPort = /mobile/i.test(root) ? 8794 : 8793;
const ENTRY = '/__sponsor-fixture/app.js';
const VIRTUAL_ENTRY = '\0sponsor-fixture-app';
const labels = { regular: '普通用户', active: '有效赞助者', permanent: '永久赞助者', expired: '过期赞助者', guest: '未登录' };
const options = (values, selected, names = {}) => values.map(value => `<option value="${value}"${value === selected ? ' selected' : ''}>${names[value] || value}</option>`).join('');
const style = `body{margin:0;background:var(--bg,#f5f8fc);color:var(--text,#243044);font:16px system-ui}#fixture-banner{padding:12px 20px;background:#14263b;color:#fff;position:relative;z-index:99999}#fixture-banner a{color:#b9d9f0;margin-left:12px}.fixture-landing{max-width:760px;margin:24px auto;padding:20px}.fixture-landing fieldset{margin:20px 0;padding:16px}.fixture-landing label{display:block;margin:12px 0}.fixture-landing button,.fixture-landing select{font:inherit;padding:10px;margin:6px}.fixture-landing a{color:inherit}#sponsor-fixture-diagnostics{position:fixed;inset:auto 8px 8px;z-index:2147483647;max-height:40vh;overflow:auto;white-space:pre-wrap;background:#fff;color:#900;border:2px solid #900;padding:12px;font:13px monospace}#root{max-width:1200px;margin:0 auto;padding:16px}`;
const diagnostics = `'use strict';
window.__sponsorFixtureReport = function(message) {
  const panel = document.getElementById('sponsor-fixture-diagnostics');
  panel.hidden = false;
  panel.textContent += '本地 fixture 诊断：' + String(message) + '\\n';
};
window.addEventListener('error', function(event) {
  window.__sponsorFixtureReport(event.message || ('资源加载失败：' + (event.target.src || event.target.href || event.target.tagName)));
}, true);
window.addEventListener('unhandledrejection', function(event) { window.__sponsorFixtureReport(event.reason?.stack || event.reason); });
window.addEventListener('securitypolicyviolation', function(event) { window.__sponsorFixtureReport('已阻止外部资源：' + event.violatedDirective + ' ' + event.blockedURI); });
// 非同源资源一律由 CSP 拦截；外链只允许可信用户明确点击官方下单页，不做支付或自动跳转。
const official = function(value) {
  try { const url = new URL(value, location.href); return url.origin === 'https://ifdian.net' && url.pathname === '/order/create' && !url.username && !url.password && !url.hash; }
  catch { return false; }
};
let clickUntil = 0;
document.addEventListener('click', function(event) {
  if (event.isTrusted) clickUntil = performance.now() + 1000;
  const anchor = event.target.closest?.('a[href]');
  if (!anchor) return;
  const url = new URL(anchor.href, location.href);
  if (url.origin === location.origin) return;
  if (!event.isTrusted || !official(url.href)) { event.preventDefault(); event.stopImmediatePropagation(); window.__sponsorFixtureReport('已阻止非官方或非用户点击的外链'); return; }
  event.preventDefault(); event.stopImmediatePropagation();
  anchor.rel = 'noopener noreferrer';
  window.open(url.href, '_blank', 'noopener,noreferrer');
}, true);
const open = window.open.bind(window);
window.open = function(url, target, features) {
  try {
    const value = new URL(url, location.href);
    if (value.origin === location.origin || (official(value.href) && navigator.userActivation?.isActive && performance.now() <= clickUntil)) return open(value.href, target, features);
  } catch {}
  window.__sponsorFixtureReport('已阻止自动或非官方的外链打开');
  return null;
};`;
const landingScript = `'use strict';
localStorage.setItem('cookie_consent', JSON.stringify({ accepted: false, date: new Date().toISOString() }));
document.getElementById('fixture-setup').addEventListener('submit', async function(event) {
  event.preventDefault();
  const button = document.getElementById('prepare');
  const status = document.getElementById('fixture-status');
  button.disabled = true;
  try {
    const response = await fetch('/__sponsor-fixture/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: document.getElementById('identity').value, scenario: document.getElementById('scenario').value }) });
    if (!response.ok) throw new Error((await response.json()).error || '准备失败');
    const theme = document.getElementById('theme').value;
    localStorage.removeItem('abdl_accounts');
    localStorage.removeItem('abdl_active_account');
    localStorage.setItem('abdl_theme', theme === 'auto' ? 'light' : theme);
    localStorage.setItem('abdl_auto_theme', String(theme === 'auto'));
    localStorage.setItem('cookie_consent', JSON.stringify({ accepted: false, date: new Date().toISOString() }));
    location.href = '/settings';
  } catch (error) { status.textContent = error.message; window.__sponsorFixtureReport(error.message); button.disabled = false; }
});`;
const documentHTML = content => `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>赞助者中心 · 隔离测试</title><link rel="stylesheet" href="/fontawesome.min.css"><style>${style}</style></head><body><aside id="fixture-banner">赞助隔离测试：全部业务数据只在内存，不转发真实 API，禁止真实付款。<a href="/__sponsor-fixture">再次准备身份 / 场景 / 主题</a></aside><pre id="sponsor-fixture-diagnostics" role="alert" hidden></pre><script src="/__sponsor-fixture/diagnostics.js"></script>${content}</body></html>`;
const landingHTML = (identity, scenario) => documentHTML(`<main class="fixture-landing"><h1>赞助者中心本地 fixture</h1><p>本入口可反复使用。每次准备都会清空本进程的兑换、领取、历史、幂等与统计状态；不同服务进程之间不共享数据，不会修改线上身份。</p><p>只清除本地保存的账户 / 当前账户，设置主题，并拒绝非必要 Cookie；其他 localStorage 不动。准备身份不代表支付或兑换成功，不会预兑换。</p><form id="fixture-setup"><fieldset><legend>准备测试</legend><label>身份 <select id="identity">${options(SPONSOR_FIXTURE_IDENTITIES, identity, labels)}</select></label><label>场景 <select id="scenario">${options(SPONSOR_FIXTURE_SCENARIOS, scenario)}</select></label><label>主题 <select id="theme"><option value="light">浅色 light</option><option value="dark">深色 dark</option><option value="colorful">多彩 colorful</option><option value="auto">自动深浅色</option></select></label><button id="prepare" type="submit">准备并打开设置页</button><output id="fixture-status" role="status"></output></fieldset></form><p>测试兑换码：<code>TEST-MONTH</code>、<code>TEST-PERMANENT</code>（忽略空白和大小写，一次性）。</p><p>network-unknown：第一次兑换已处理但返回 HTTP 503，保持原请求和 UUID 重试可取得成功快照。config-change：第二次 catalog 由版本 1 更新至 2，之后不再变化。</p><p>unauthorized 保留普通页面登录身份，仅让赞助私有 API 返回 401；未登录身份则连 /api/auth/me 也返回 401。</p><a href="/settings">打开当前设置页 /settings（不重新准备）</a> · <a href="/__sponsor-fixture/stats">查看内存请求统计（无原始兑换码）</a></main><script src="/__sponsor-fixture/landing.js" defer></script>`);

// 虚拟入口只挂载真实 Settings 和必需 providers，不执行 App 的重定向、统计、验证码或 SW 启动。
const appEntry = mobile => `import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Settings from '/src/pages/Settings.jsx';
import SponsorCenter from '/src/sponsors/SponsorCenter.jsx';
import { AuthProvider } from '/src/contexts/AuthContext.jsx';
import { ThemeProvider } from '/src/contexts/ThemeContext.jsx';
import { ToastProvider } from '/src/contexts/ToastContext.jsx';
import { NsfwProvider } from '/src/contexts/NsfwContext.jsx';
import { MobileHeaderProvider } from '/src/contexts/MobileHeaderContext.jsx';
import '/src/styles/global.css';
${mobile ? "import '/src/styles/mobile.css';" : ''}
class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { window.__sponsorFixtureReport(error.stack || error.message); }
  render() { return this.state.failed ? React.createElement('p', { role: 'alert' }, '设置页发生错误，请查看下方 fixture 诊断并返回入口重新准备。') : this.props.children; }
}
let tree = React.createElement(Routes, null,
  React.createElement(Route, { path: '/settings', element: React.createElement(Settings) }),
  React.createElement(Route, { path: '/sponsors', element: React.createElement(SponsorCenter) }),
  React.createElement(Route, { path: '*', element: React.createElement(Navigate, { to: '/settings', replace: true }) }));
for (const Provider of [MobileHeaderProvider, NsfwProvider, ToastProvider, AuthProvider, ThemeProvider, BrowserRouter, Boundary]) tree = React.createElement(Provider, null, tree);
createRoot(document.getElementById('root')).render(tree);`;
const notificationStub = `const noop = async () => false;
const state = { notifications: [], unreadCount: 0, messageUnreadCount: 0, pushSupported: false, pushSubscribed: false, subscribeToPush: noop, unsubscribeFromPush: noop, fetchUnread: noop, fetchMessageUnread: noop };
export function NotificationProvider({ children }) { return children; }
export const useNotifications = () => state;`;
const pushStub = `const noop = async () => false;
export { noop as isPushSupported, noop as isPushSubscribed, noop as subscribePush, noop as unsubscribePush, noop as syncExistingSubscription };`;

/** 创建但不监听；CLI 才绑定 loopback，ui 默认开启，测试可用 ui:false。 */
export async function createSponsorFixtureServer({ port = Number(process.env.SPONSOR_FIXTURE_PORT || defaultPort), ui = true,
  identity = 'regular', scenario = 'normal', quiet = false } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65435) throw new TypeError('fixture 端口必须为 0–65435 的整数');
  const fixture = createSponsorFixture(scenario);
  fixture.setup({ identity, scenario });
  let vite = null, cacheDir = null;
  const policy = `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:${port + 100} ws://localhost:${port + 100}; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`;
  if (ui) {
    try {
      const [{ createServer: createViteServer }, { default: react }, { default: tailwind }, { default: autoprefixer }, { default: tailwindConfig }] = await Promise.all([
        import('vite'), import('@vitejs/plugin-react'), import('tailwindcss'), import('autoprefixer'), import(pathToFileURL(join(root, 'tailwind.config.js')).href),
      ]);
      cacheDir = await mkdtemp(join(tmpdir(), 'abdl-sponsor-fixture-'));
      vite = await createViteServer({ root, configFile: false, envFile: false, envPrefix: [], appType: 'custom', cacheDir,
        // 显式固定 CSS 输入，绝对路径 CLI 也不受 shell cwd 的 PostCSS/Tailwind 查找影响。
        css: { postcss: { plugins: [tailwind({ ...tailwindConfig, content: [join(root, 'index.html'), join(root, 'src/**/*.{js,jsx,ts,tsx}')] }), autoprefixer()] } },
        esbuild: { jsx: 'automatic' }, resolve: { dedupe: ['react', 'react-dom'] },
        define: { 'import.meta.env.VITE_API_BASE': JSON.stringify(''), 'import.meta.env.VITE_CAPTCHA_KEY': JSON.stringify(''), 'import.meta.env.VITE_TURNSTILE_SITE_KEY': JSON.stringify('') },
        optimizeDeps: { entries: [], noDiscovery: true, include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', 'react-router-dom', '@simplewebauthn/browser'] },
        server: { middlewareMode: true, proxy: {}, hmr: port === 0 ? false : { host: '127.0.0.1', port: port + 100 }, fs: { strict: true } },
        plugins: [{ name: 'isolated-sponsor-fixture', enforce: 'pre',
          resolveId(id) { if (id === ENTRY) return VIRTUAL_ENTRY; },
          load(id) { if (id === VIRTUAL_ENTRY) return appEntry(/mobile/i.test(root)); },
          transform(_code, id) {
            if (id.split('?')[0].endsWith('/contexts/NotificationContext.jsx')) return { code: notificationStub, map: null };
            if (id.split('?')[0].endsWith('/utils/pushManager.js')) return { code: pushStub, map: null };
          },
        }, react()],
      });
    } catch (error) { await vite?.close(); if (cacheDir) await rm(cacheDir, { recursive: true, force: true }); throw error; }
  }
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', policy);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type });
      res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
    };
    try {
      // 防 DNS rebinding/跨站 setup：只接受当前 loopback origin，不提供 CORS 或任意代理。
      const host = req.headers.host;
      const match = /^(localhost|127\.0\.0\.1)(?::\d{1,5})?$/.exec(host || '');
      if (!match || (req.headers.origin && req.headers.origin !== `http://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') {
        send(403, { error: '仅允许当前本地 fixture 来源', code: 'fixture_origin' }); return;
      }
      const url = new URL(req.url, `http://${host}`);
      if (url.origin !== `http://${host}`) { send(403, { error: '禁止转发外部地址', code: 'fixture_origin' }); return; }
      const path = decodeURIComponent(url.pathname);
      const fixturePath = path === '/__sponsor-fixture/setup' || path === '/__sponsor-fixture/stats';
      // 所有 /api（含未知接口、方法及编码后的路径）在 Vite 之前终结，永远不会落到真实后端。
      if (path === '/api' || path.startsWith('/api/') || fixturePath) {
        const acceptsBody = (req.method === 'POST' && ['/__sponsor-fixture/setup', '/api/v1/sponsors/redeem', '/api/v1/sponsors/claims'].includes(path))
          || (req.method === 'PUT' && path === '/api/v1/sponsors/color');
        if (!acceptsBody) {
          // 未知 /api 即使附带无效 JSON 也固定 404，不读体、不交给 Vite。
          req.resume();
          const result = fixture.respond(path, req.method, url.searchParams);
          send(result.status, result.data);
          return;
        }
        let text = '', length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 32768) { send(413, { error: '请求内容过大', code: 'invalid_request' }); return; }
          text += chunk;
        }
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch { send(400, { error: 'JSON 请求格式不正确', code: 'invalid_request' }); return; }
        const result = fixture.respond(path, req.method, url.searchParams, body);
        send(result.status, result.data);
        if (!quiet) console.log(`${req.method} ${path} -> ${result.status}`); // 不输出 query、body、兑换码、token。
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { send(404, { error: '本地 fixture 未定义此接口', code: 'fixture_not_found' }); return; }
      if (path === '/__sponsor-fixture' || path === '/__sponsor-fixture/') {
        send(200, landingHTML(identity, scenario), 'text/html; charset=utf-8'); return;
      }
      if (path === '/__sponsor-fixture/landing.js' || path === '/__sponsor-fixture/diagnostics.js') {
        send(200, path.endsWith('/landing.js') ? landingScript : diagnostics, 'application/javascript; charset=utf-8'); return;
      }
      if (path === '/sw.js' || path.startsWith('/oauth') || (path.startsWith('/__sponsor-fixture/') && path !== ENTRY)) {
        send(404, { error: '隔离 fixture 不提供此资源', code: 'fixture_not_found' }); return;
      }
      if (path === '/settings' || path === '/sponsors' || path === '/') {
        if (!vite) { send(503, { error: 'ui:false；请用默认 ui:true 启动页面', code: 'fixture_ui_disabled' }); return; }
        const html = documentHTML(`<div id="root"></div><script type="module" src="${ENTRY}"></script>`);
        send(200, await vite.transformIndexHtml(path, html), 'text/html; charset=utf-8'); return;
      }
      if (vite) { vite.middlewares(req, res, () => send(404, { error: '本地资源不存在', code: 'fixture_not_found' })); return; }
      send(404, { error: '本地 fixture 未定义此资源', code: 'fixture_not_found' });
    } catch {
      if (!res.headersSent) send(400, { error: '本地 fixture 请求格式不正确', code: 'invalid_request' });
      else res.end();
    }
  });
  let closed = false;
  return { server, fixture, vite, port,
    async close() {
      if (closed) return;
      closed = true;
      server.closeAllConnections();
      if (server.listening) await new Promise(resolve => server.close(resolve));
      await vite?.close();
      if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.SPONSOR_FIXTURE_PORT || defaultPort);
  const app = await createSponsorFixtureServer({ port, ui: process.env.SPONSOR_FIXTURE_UI !== '0',
    scenario: process.env.SPONSOR_FIXTURE_SCENARIO || 'normal', identity: process.env.SPONSOR_FIXTURE_IDENTITY || 'regular' });
  app.server.once('error', error => { console.error(error.message); void app.close().finally(() => { process.exitCode = 1; }); });
  app.server.listen(port, '127.0.0.1', () => console.log(`赞助隔离 fixture：http://127.0.0.1:${port}/__sponsor-fixture；数据仅在内存，不转发真实 API，禁止真实付款。`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
}
