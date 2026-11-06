import { createServer } from 'node:http';
import process from 'node:process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ALIPAY_FIXTURE_SCENARIOS, createAlipayPolicyFixture } from './alipay-policy-fixture.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const defaultPort = /mobile/i.test(root) ? 8814 : 8813;
const ENTRY = '/__alipay-policy-fixture/app.js';
const VIRTUAL_ENTRY = '\0alipay-policy-fixture-app';
const themes = ['light', 'dark', 'colorful'];
const labels = { normal: '默认关闭 / 审核中', ready: '人工受限许可 / 样本可购', 'missing-context': '无商家上下文（不可取，不是 0）', 'daily-exhausted': '日额度耗尽', 'monthly-exhausted': '月额度耗尽', stale: '一小时前旧样本', 'unknown-reason': '未来禁用原因', 'missing-api': '接口缺失 404', 'load-error': '读取错误 503', 'invalid-data': '未知 enum / 拒绝响应', 'save-error': '保存错误 503', 'save-unknown': '写入已受理但回包失败', conflict: '另一管理员修改 / CAS 409', 'concurrent-after-save': '保存后又被另一管理员修改', 'slow-save': '保存延迟 2.5 秒 / 双击', unauthorized: '会话过期 401', forbidden: '无权限 403', overview: '概览正常 + 明细分页', 'overview-empty': '概览全 0 / 明细为空', 'records-page': '明细分页含未兑换爱发电', 'refund-failure': '退款失败 503' };
const selectOptions = (values, selected) => values.map(value => `<option value="${value}"${value === selected ? ' selected' : ''}>${labels[value] || value}</option>`).join('');
const diagnostics = `window.__alipayFixtureReport = function(error) {
  const panel = document.getElementById('fixture-diagnostics'); panel.hidden = false; panel.textContent += String(error) + '\\n';
};
window.addEventListener('error', event => window.__alipayFixtureReport(event.message || '本地资源加载失败'), true);
window.addEventListener('unhandledrejection', event => window.__alipayFixtureReport(event.reason?.stack || event.reason));
window.addEventListener('securitypolicyviolation', event => window.__alipayFixtureReport('CSP 已阻止外部资源：' + event.blockedURI));
document.addEventListener('click', event => {
  const link = event.target.closest?.('a[href]');
  if (link && new URL(link.href, location.href).origin !== location.origin) { event.preventDefault(); event.stopImmediatePropagation(); }
}, true);
window.open = function() { window.__alipayFixtureReport('隔离 fixture 禁止打开外部页面'); return null; };`;
const setupScript = `document.getElementById('fixture-setup').addEventListener('submit', async event => {
  event.preventDefault(); const output = document.getElementById('fixture-status'); const button = document.getElementById('prepare'); button.disabled = true;
  try {
    const response = await fetch('/__alipay-policy-fixture/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: document.getElementById('scenario').value }), cache: 'no-store' });
    if (!response.ok) throw new Error('本地场景准备失败');
    location.href = '/admin/sponsors?tab=config&fixtureTheme=' + encodeURIComponent(document.getElementById('theme').value);
  } catch (error) { output.textContent = error.message; button.disabled = false; }
});`;
const html = body => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>支付宝门禁 · 隔离管理测试</title><style>body{margin:0;background:var(--app-admin-canvas,#f5f8fc);color:var(--app-admin-text,#243044);font:15px system-ui}#fixture-banner{padding:12px 20px;background:#14263b;color:#fff}#fixture-banner a{color:#b9d9f0;margin-left:12px}.fixture-landing{max-width:900px;margin:auto;padding:20px}.fixture-landing label{display:block;margin:16px 0}.fixture-landing select,.fixture-landing button{font:inherit;padding:10px;max-width:100%}.fixture-toolbar{display:flex;flex-wrap:wrap;gap:10px;padding:16px}.fixture-toolbar button,.fixture-toolbar select{font:inherit;min-height:44px;padding:8px;color:var(--ac-text);background:var(--ac-surface);border:1px solid var(--ac-border);border-radius:8px}#fixture-diagnostics{position:fixed;inset:auto 8px 8px;max-height:35vh;overflow:auto;z-index:9999;background:#fff;color:#900;border:2px solid #900;padding:12px;white-space:pre-wrap}#root{max-width:1280px;margin:auto}</style></head><body><aside id="fixture-banner">支付宝门禁隔离 fixture：全部数据仅本地内存，不转发真实 API，不下单，不付款，不读写浏览器账户或凭据。<a href="/__alipay-policy-fixture">重新准备场景 / 主题</a><a href="/__alipay-policy-fixture/stats">请求统计</a></aside><pre id="fixture-diagnostics" role="alert" hidden></pre><script src="/__alipay-policy-fixture/diagnostics.js"></script>${body}</body></html>`;
const landing = (scenario, theme) => html(`<main class="fixture-landing"><h1>支付宝新购门禁 · 本地 UI 验收</h1><p>挂载真实 SponsorAdmin 配置页和真实 adminAPI，仅 AuthContext 使用内存测试身份。只读 mock 其他栏目；不会修改原赞助 fixture 或访问线上。</p><form id="fixture-setup"><label>场景 <select id="scenario">${selectOptions(ALIPAY_FIXTURE_SCENARIOS, scenario)}</select></label><label>前台主题 <select id="theme">${selectOptions(themes, theme)}</select></label><button id="prepare" type="submit">准备并打开真实配置页</button><output id="fixture-status" role="status"></output></form><p>请以 360px / 1280px 分别检查 light、dark、colorful；多彩后台仍沿用共享管理端跟随系统深浅，不另加彩色后台。</p><p>slow-save 检查 pending 双击；conflict 检查草稿和理由保留、读取最新与人工采用基准；save-unknown 检查结果未知不假保存；concurrent-after-save 检查成功回执后并发变更不可被悄悄覆盖。顶部测试身份可切换，旧账户响应不得渗透。</p><p>API 统计只记 method/path，不记录表单或凭据。重新准备将重置本地场景。</p></main><script src="/__alipay-policy-fixture/setup.js" defer></script>`);
const authStub = `import { createContext, useContext } from 'react';
export const FixtureAuthContext = createContext({ user: null, accounts: [] });
export const useAuth = () => useContext(FixtureAuthContext);`;
const appEntry = mobile => `import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import SponsorAdmin from '/src/sponsors/SponsorAdmin.jsx';
import { FixtureAuthContext } from '/src/contexts/AuthContext.jsx';
import { watchAdminTheme } from '/src/pages/admin/theme.js';
import '/src/styles/global.css';
${mobile ? "import '/src/styles/mobile.css';" : ''}
import '/src/pages/admin/admin.css';
class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { window.__alipayFixtureReport(error.stack || error.message); }
  render() { return this.state.failed ? React.createElement('p', { role: 'alert' }, '真实管理页发生错误，请查看 fixture 诊断') : this.props.children; }
}
function Fixture() {
  const [identity, setIdentity] = useState('A');
  const [theme, setTheme] = useState(() => { const value = new URLSearchParams(location.search).get('fixtureTheme'); return ['light','dark','colorful'].includes(value) ? value : 'light'; });
  useEffect(() => { document.documentElement.dataset.theme = theme; return watchAdminTheme(theme); }, [theme]);
  const user = identity === 'guest' ? null : { id: identity === 'A' ? 9901 : 9902, username: 'fixture_admin_' + identity, role: 'admin' };
  return React.createElement('main', { className: 'ac-admin-theme' },
    React.createElement('div', { className: 'fixture-toolbar', 'aria-label': '仅测试身份与主题' },
      ...['A','B','guest'].map(value => React.createElement('button', { key: value, type: 'button', onClick: () => setIdentity(value), 'aria-pressed': value === identity }, value === 'guest' ? '退出模拟会话' : '切换管理员 ' + value)),
      React.createElement('label', null, '主题 ', React.createElement('select', { value: theme, onChange: event => setTheme(event.target.value) }, ...['light','dark','colorful'].map(value => React.createElement('option', { key: value, value }, value))))),
    React.createElement(FixtureAuthContext.Provider, { value: { user, accounts: [] } }, user ? React.createElement(SponsorAdmin, { key: user.id }) : React.createElement('p', { role: 'status' }, '未登录模拟身份：管理数据已卸载')));
}
createRoot(document.getElementById('root')).render(React.createElement(Boundary, null, React.createElement(BrowserRouter, null, React.createElement(Fixture))));`;

export async function createAlipayPolicyFixtureServer({ port = Number(process.env.ALIPAY_POLICY_FIXTURE_PORT || defaultPort), ui = true, scenario = 'normal' } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65435) throw new TypeError('fixture 端口必须为 0–65435');
  const fixture = createAlipayPolicyFixture(scenario);
  let vite = null, cacheDir = null;
  if (ui) {
    try {
      const [{ createServer: createViteServer }, { default: react }, { default: tailwind }, { default: autoprefixer }, { default: tailwindConfig }] = await Promise.all([
        import('vite'), import('@vitejs/plugin-react'), import('tailwindcss'), import('autoprefixer'), import(pathToFileURL(join(root, 'tailwind.config.js')).href),
      ]);
      cacheDir = await mkdtemp(join(tmpdir(), 'abdl-alipay-policy-fixture-'));
      vite = await createViteServer({ root, configFile: false, envFile: false, envPrefix: [], appType: 'custom', cacheDir,
        css: { postcss: { plugins: [tailwind({ ...tailwindConfig, content: [join(root, 'index.html'), join(root, 'src/**/*.{js,jsx,ts,tsx}')] }), autoprefixer()] } },
        esbuild: { jsx: 'automatic' }, resolve: { dedupe: ['react', 'react-dom'] },
        define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') },
        optimizeDeps: { entries: [], noDiscovery: true, include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client', 'react-router-dom'] },
        server: { middlewareMode: true, proxy: {}, hmr: port === 0 ? false : { host: '127.0.0.1', port: port + 100 }, fs: { strict: true } },
        plugins: [{ name: 'isolated-alipay-policy-fixture', enforce: 'pre',
          resolveId(id) { if (id === ENTRY) return VIRTUAL_ENTRY; },
          load(id) { if (id === VIRTUAL_ENTRY) return appEntry(/mobile/i.test(root)); },
          transform(_source, id) { if (id.split('?')[0].endsWith('/contexts/AuthContext.jsx')) return { code: authStub, map: null }; },
        }, react()],
      });
    } catch (error) { await vite?.close(); if (cacheDir) await rm(cacheDir, { recursive: true, force: true }); throw error; }
  }
  const policy = `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:${port + 100} ws://localhost:${port + 100}; img-src 'self' data:; font-src 'self' data:; media-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'`;
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', policy); res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type }); res.end(type.startsWith('application/json') ? JSON.stringify(data) : data); };
    try {
      const host = req.headers.host;
      if (!/^(localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(host || '') || (req.headers.origin && req.headers.origin !== `http://${host}`) || req.headers['sec-fetch-site'] === 'cross-site') { req.resume(); send(403, { code: 'fixture_origin', error: '只接受当前 loopback 来源' }); return; }
      const url = new URL(req.url, `http://${host}`);
      if (url.origin !== `http://${host}`) { req.resume(); send(403, { error: '禁止转发外部地址' }); return; }
      const path = decodeURIComponent(url.pathname);
      if (path === '/api' || path.startsWith('/api/') || ['/__alipay-policy-fixture/setup', '/__alipay-policy-fixture/stats'].includes(path)) {
        const acceptsBody = (req.method === 'PUT' && path === '/api/admin/sponsors/alipay-policy')
          || (req.method === 'POST' && (path === '/__alipay-policy-fixture/setup' || /^\/api\/payments\/alipay\/orders\/[^/]+\/refunds$/.test(path)));
        let body = null;
        if (acceptsBody) {
          let text = '', length = 0;
          for await (const chunk of req) { length += chunk.length; if (length > 32768) { send(413, { error: '请求内容过大' }); return; } text += chunk; }
          try { body = text ? JSON.parse(text) : null; } catch { send(400, { error: 'JSON 请求格式不正确' }); return; }
        } else req.resume();
        const result = fixture.respond(path, req.method, body, url.searchParams);
        if (result.delay) await new Promise(resolve => setTimeout(resolve, result.delay));
        send(result.status, result.data); return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') { req.resume(); send(404, { error: '隔离 fixture 不提供此接口' }); return; }
      if (path === '/__alipay-policy-fixture' || path === '/__alipay-policy-fixture/') { send(200, landing(ALIPAY_FIXTURE_SCENARIOS.includes(url.searchParams.get('scenario')) ? url.searchParams.get('scenario') : scenario, themes.includes(url.searchParams.get('theme')) ? url.searchParams.get('theme') : 'light'), 'text/html; charset=utf-8'); return; }
      if (path === '/__alipay-policy-fixture/setup.js' || path === '/__alipay-policy-fixture/diagnostics.js') { send(200, path.endsWith('/setup.js') ? setupScript : diagnostics, 'application/javascript; charset=utf-8'); return; }
      if (path === '/sw.js' || path.startsWith('/oauth') || (path.startsWith('/__alipay-policy-fixture/') && path !== ENTRY)) { send(404, { error: '隔离 fixture 不提供此资源' }); return; }
      if (path === '/admin/sponsors' || path === '/') {
        if (!vite) { send(503, { error: 'ui:false，请默认启动 UI fixture' }); return; }
        send(200, await vite.transformIndexHtml(path, html(`<div id="root"></div><script type="module" src="${ENTRY}"></script>`)), 'text/html; charset=utf-8'); return;
      }
      if (vite) { vite.middlewares(req, res, () => send(404, { error: '本地资源不存在' })); return; }
      send(404, { error: '隔离 fixture 不提供此资源' });
    } catch { if (!res.headersSent) send(400, { error: '本地 fixture 请求格式不正确' }); else res.end(); }
  });
  let closed = false;
  return { server, fixture, port, async close() {
    if (closed) return; closed = true; server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    await vite?.close(); if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
  } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await createAlipayPolicyFixtureServer({ scenario: process.env.ALIPAY_POLICY_FIXTURE_SCENARIO || 'normal', ui: process.env.ALIPAY_POLICY_FIXTURE_UI !== '0' });
  app.server.once('error', error => { console.error(error.message); void app.close().finally(() => { process.exitCode = 1; }); });
  app.server.listen(app.port, '127.0.0.1', () => console.log(`支付宝门禁隔离 fixture：http://127.0.0.1:${app.port}/__alipay-policy-fixture；仅内存数据，禁止真实付款。`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
}
