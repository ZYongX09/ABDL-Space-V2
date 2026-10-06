import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { createAppClientsFixture } from '../src/appClients/fixture.js';

const scenarios = ['normal', 'legacy-reminder', 'empty', 'unavailable', 'errors', 'save-error', 'slow'];
const initialUsers = () => [
  { id: 1, username: 'fixture_super', display_name: '本地超级管理员', role: 'admin', qq_bound: true },
  { id: 2, username: 'fixture_admin', display_name: '本地普通管理员', role: 'admin', qq_bound: false },
  { id: 3, username: 'fixture_user', display_name: '本地普通用户', role: 'user', qq_bound: null },
  { id: 4, username: 'fixture_member', display_name: '待提升的普通用户', role: 'user', qq_bound: false },
].map(user => ({ ...user, email: `${user.username}@example.invalid`, created_at: '2026-10-01T00:00:00Z', banned: false }));

const landing = `<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>本地后台验收</title><style>body{font:16px system-ui;max-width:720px;margin:40px auto;padding:20px;background:#f5f8fc;color:#2c3e50}fieldset{margin:20px 0;padding:16px}button,select{font:inherit;padding:10px;margin:5px}a{display:inline-block;margin:10px}</style><h1>本地后台验收（不向真实 API 发请求）</h1><p>全部数据与角色修改只保存在进程内存。非必要 Cookie 已排除，外部资源由本地 CSP 禁止。</p><fieldset><legend>前台主题（后台多彩跟随系统）</legend><select id="theme"><option value="light">明确浅色 light</option><option value="dark">明确深色 dark</option><option value="colorful">多彩 colorful / 后台系统深浅</option><option value="auto">时间自动（保留前台策略）</option></select></fieldset><fieldset><legend>测试身份</legend><button data-id="1">ID 1 超级管理员</button><button data-id="2">ID 2 管理员</button><button data-id="3">普通用户</button><button data-id="0">未登录</button><p><label>协议 <select id="mode"><option value="server">严格 server boolean</option><option value="legacy">旧响应缺失字段</option><option value="false">显式 false（ID1 不回退）</option></select></label><label>身份延迟 <select id="delay"><option value="0">无延迟</option><option value="2500">2500ms 验证中</option></select></label></p></fieldset><a href="/admin/users">用户管理</a><a href="/admin">管理概览</a><a href="/admin/sponsors">赞助管理</a><a href="/admin/unknown">未知路由</a><button id="reset">重置角色数据</button><output id="status"></output><script src="/__fixture/landing.js" defer></script></html>`;
// 该脚本只在 fixture 同源页面加载，仅操作 localStorage 与本地 /__fixture 接口。
const landingScript = `'use strict';
if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(registrations.map(registration => registration.unregister())));
if ('caches' in window) caches.keys().then(keys => Promise.all(keys.map(key => caches.delete(key))));
localStorage.setItem('cookie_consent', JSON.stringify({ accepted: false, date: new Date().toISOString() }));
const setSession = (body) => fetch('/__fixture/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(response => {
  if (!response.ok) throw new Error('session 请求失败');
});
const chooseIdentity = (button) => {
  const theme = document.querySelector('#theme').value;
  localStorage.setItem('abdl_theme', theme === 'auto' ? 'light' : theme);
  localStorage.setItem('abdl_auto_theme', String(theme === 'auto'));
  localStorage.removeItem('abdl_accounts');
  localStorage.removeItem('abdl_active_account');
  return setSession({ id: button.dataset.id, mode: document.querySelector('#mode').value, delay: document.querySelector('#delay').value }).then(() => { window.location.href = '/admin/users'; });
};
document.querySelectorAll('[data-id]').forEach(button => button.addEventListener('click', () => chooseIdentity(button)));
document.querySelector('#reset').addEventListener('click', () =>
  setSession({ reset: 1 }).then(() => { document.querySelector('#status').textContent = '已重置内存角色数据'; }));`;
// 仅 fixture 响应：不允许生产 API、统计脚本、验证码或外部头像发请求。
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; frame-src 'none'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'";

export async function createAdminFixtureServer({ port = 8791, ui = false, scenario = 'normal', quiet = false } = {}) {
  const fixture = createAppClientsFixture(scenario);
  // 同源 Vite，API 永不送入 proxy；独立配置和预构建目录避免npm test并发污染dev依赖。
  const policy = csp.replace("connect-src 'self'", `connect-src 'self' ws://127.0.0.1:${port + 100} ws://localhost:${port + 100}`);
  const diagnostics = `<script>window.addEventListener('error',function(e){var panel=document.getElementById('fixture-error');if(!panel){panel=document.createElement('pre');panel.id='fixture-error';panel.style.cssText='position:fixed;inset:auto 10px 10px;z-index:999999;background:white;color:#900;padding:16px;white-space:pre-wrap';document.body.appendChild(panel)}panel.textContent+='本地入口错误：'+e.message+' '+(e.filename||'')+'\\n'});window.addEventListener('unhandledrejection',function(e){var panel=document.createElement('pre');panel.style.cssText='position:fixed;inset:auto 10px 10px;z-index:999999;background:white;color:#900;padding:16px';panel.textContent='本地未处理错误：'+String(e.reason);document.body.appendChild(panel)});</script>`;
  const vite = ui ? await createViteServer({ configFile: false, envFile: false, esbuild: { jsx: 'automatic' }, root: new URL('../', import.meta.url).pathname, cacheDir: `node_modules/.vite-admin-fixture-${port}`, resolve: { dedupe: ['react', 'react-dom'] }, optimizeDeps: { force: true, include: ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client', 'react-router-dom'] }, plugins: [react(), { name: 'fixture-diagnostics', transformIndexHtml: { order: 'pre', handler: html => html.replace(/<script>(?:(?!<\/script>)[\s\S])*?(?:captchaScript|hm\.baidu\.com)(?:(?!<\/script>)[\s\S])*?<\/script>/g, '').replace('<head>', '<head>' + diagnostics) } }], server: { middlewareMode: true, hmr: { port: port + 100 } }, define: { 'import.meta.env.VITE_API_BASE': JSON.stringify(''), 'import.meta.env.VITE_ADMIN_FIXTURE': JSON.stringify('1') } }) : null;
  let users = initialUsers(), currentId = 1, superMode = 'server', authDelay = 0, dataDelay = 0;
  const present = user => {
    const value = { ...user };
    if (superMode !== 'legacy') value.is_super_admin = superMode === 'false' ? false : user.id === 1 && user.role === 'admin';
    return value;
  };
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) { res.writeHead(403); res.end('仅允许本地测试来源'); return; }
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': policy, ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : {}), 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS' };
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/__fixture/start') { res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }); res.end(landing); return; }
    if (url.pathname === '/__fixture/landing.js') { res.writeHead(200, { ...headers, 'Content-Type': 'application/javascript; charset=utf-8' }); res.end(landingScript); return; }
    if (url.pathname === '/__fixture/session') {
      const qs = new URLSearchParams(url.searchParams);
      if (req.method === 'POST') {
        let text = '';
        for await (const chunk of req) { text += chunk; if (text.length > 8192) { res.writeHead(413, headers); res.end(JSON.stringify({ error: '请求过大' })); return; } }
        let body;
        try { body = text ? JSON.parse(text) : {}; } catch { res.writeHead(400, headers); res.end(JSON.stringify({ error: '无效请求体' })); return; }
        for (const [key, value] of Object.entries(body)) qs.set(key, String(value));
      }
      if (qs.has('reset')) users = initialUsers();
      if (qs.has('id')) currentId = Number(qs.get('id'));
      if (qs.has('mode')) superMode = qs.get('mode');
      if (qs.has('delay')) authDelay = Math.min(10000, Math.max(0, Number(qs.get('delay')) || 0));
      if (qs.has('dataDelay')) dataDelay = Math.min(10000, Math.max(0, Number(qs.get('dataDelay')) || 0));
      res.writeHead(200, headers); res.end(JSON.stringify({ currentId, superMode, authDelay, dataDelay })); return;
    }
    if (url.pathname === '/sw.js') {
      // 仅此本地origin停用PWA静态缓存，避免旧dev模块/React哈希混用。
      res.writeHead(200, { ...headers, 'Content-Type': 'application/javascript' });
      res.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',event=>event.waitUntil(self.registration.unregister()));"); return;
    }
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/__fixture') && vite) {
      res.setHeader('Content-Security-Policy', policy);
      res.setHeader('Cache-Control', 'no-store');
      vite.middlewares(req, res); return;
    }
    if (url.pathname === '/__fixture') {
      const next = url.searchParams.get('scenario');
      if (next && scenarios.includes(next)) fixture.setScenario(next);
      const safeScenario = scenarios.includes(next) ? next : fixture.getScenario();
      res.writeHead(200, headers); res.end(JSON.stringify({ scenario: safeScenario, scenarios })); return;
    }
    try {
      let text = '';
      for await (const chunk of req) { text += chunk; if (text.length > 20000) throw new Error('请求过大'); }
      const body = text ? JSON.parse(text) : null;
      // token 只映射本地账号ID；真实token/JWT不会被接受，更不会转发。
      const authorization = req.headers.authorization;
      const tokenId = /^Bearer fixture-(\d+)$/.exec(authorization || '')?.[1];
      const actor = authorization ? users.find(user => String(user.id) === tokenId) : users.find(user => user.id === currentId);
      const path = url.pathname;
      let result;
      const ok = data => ({ status: 200, data });
      const reject = (error, status = 403) => ({ status, data: { error } });
      const superActor = actor?.id === 1 && actor.role === 'admin';
      if (path === '/api/auth/me') result = actor ? ok(present(actor)) : reject('未登录', 401);
      else if (path.startsWith('/api/admin/') && !actor) result = reject('未登录', 401);
      else if (path.startsWith('/api/admin/') && actor.role !== 'admin') result = reject('仅管理员可访问');
      else if (path === '/api/admin/users' && req.method === 'GET') {
        const q = url.searchParams.get('q') || '', role = url.searchParams.get('role'), qq = url.searchParams.get('qq_bound');
        const rows = users.filter(user => (!role || user.role === role) && `${user.username} ${user.email}`.includes(q) && (!qq || (qq === 'bound' ? user.qq_bound === true : user.qq_bound === false))).map(present);
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1), limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit')) || 20));
        result = ok({ users: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) } });
      } else if (/^\/api\/admin\/users\/\d+\/detail$/.test(path) && req.method === 'GET') {
        const user = users.find(user => user.id === Number(path.split('/')[4]));
        result = user ? ok({ user: present(user), counts: { posts: 2, comments: 1, likes: 3, checkins: 5, points: 20 }, badges: [], tracking: { enabled: false }, trackEvents: [], recentPosts: [] }) : reject('用户不存在', 404);
      } else if (/^\/api\/admin\/users\/\d+\/role$/.test(path) && req.method === 'PATCH') {
        const user = users.find(user => user.id === Number(path.split('/')[4]));
        if (!superActor) result = reject('仅超级管理员可管理角色');
        else if (!user) result = reject('用户不存在', 404);
        else if (!['admin', 'user'].includes(body?.role)) result = reject('无效角色', 400);
        else if (user.id === 1 && body.role === 'user') result = reject('超级管理员不能降权');
        else { user.role = body.role; result = ok({ user: present(user), message: '角色已更新（仅本地内存）' }); }
      } else if (path === '/api/admin/add' && req.method === 'POST') {
        if (!superActor) result = reject('仅超级管理员可管理角色');
        else if (!Array.isArray(body?.user_ids) || !body.user_ids.length || body.user_ids.some(id => !Number.isSafeInteger(id) || !users.some(user => user.id === id))) result = reject('无效用户列表', 400);
        else { users.filter(user => body.user_ids.includes(user.id)).forEach(user => { user.role = 'admin'; }); result = ok({ message: '已提升（仅本地内存）' }); }
      } else if ((req.method === 'DELETE' || req.method === 'POST') && /\/users\//.test(path)) result = reject('本地 fixture 不执行封禁、追踪、删除或身份解绑');
      else result = fixture.respond(path, req.method, url.searchParams, body);
      // 延迟前快照响应，真正模拟旧请求晚到，而不是读取新身份。
      result = structuredClone(result);
      const delay = path === '/api/auth/me' ? authDelay : Math.max(dataDelay, fixture.delay(path, url.searchParams));
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      res.writeHead(result.status, headers); res.end(JSON.stringify(result.data));
      if (!quiet) console.log(`${req.method} ${path}${url.search} -> ${result.status}${delay ? ` (${delay}ms)` : ''}`);
    } catch (error) { res.writeHead(400, headers); res.end(JSON.stringify({ error: error.message })); }
  });
  return { server, async close() { server.closeAllConnections(); if (server.listening) await new Promise(resolve => server.close(resolve)); await vite?.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.APP_FIXTURE_PORT || 8791);
  const fixture = await createAdminFixtureServer({ port, ui: process.env.ADMIN_FIXTURE_UI === '1', scenario: process.env.APP_FIXTURE_SCENARIO || 'normal' });
  fixture.server.listen(port, '127.0.0.1', () => console.log(`本地 fixture：http://127.0.0.1:${port}/__fixture/start；所有保存仅在内存，不转发真实 API。`));
}
