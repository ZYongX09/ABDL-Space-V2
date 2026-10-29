import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createAdminFixtureServer } from './app-clients-fixture-server.js';
import { createNovelFixture } from '../src/novelReview/fixture.js';

const DEFAULT_PORT = new URL('../', import.meta.url).pathname.includes('/abdl-space-mobile/') ? 8814 : 8813;
const scenarios = ['normal', 'conflict', 'ai-unavailable', 'ai-stuck', 'body-mismatch', 'slow', 'unavailable', 'unauthorized', 'forbidden'];
const landing = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>小说审核本地验收</title><style>body{font:16px system-ui;padding:24px;max-width:900px;margin:auto}button,select{font:inherit;padding:12px;margin:8px}p{line-height:1.8}</style>
<h1>两站小说审核 · 仅内存验收</h1><p>不连接生产账号、API 或外部 AI。合成数据只保存在当前本地进程；重新启动即重置。完整章节、认领、人工决策、版本冲突、AI 分块 / 取消、作品下架恢复、评论举报删评和创作者限制均使用实际 React 页面。作品历史为 73 条，首次 50 条、后续 20 + 3 条。</p>
<label>主题<select id="theme"><option>light</option><option>dark</option><option>colorful</option></select></label>
<label>管理员<select id="actor"><option value="1">本地管理员 1</option><option value="2">本地管理员 2</option></select></label>
<label>场景<select id="scenario">${scenarios.map(value => `<option>${value}</option>`).join('')}</select></label>
<label>每次 API 延迟<select id="delay"><option value="0">无额外延迟</option><option value="1500">1500 ms</option><option value="3000">3000 ms</option></select></label>
<p><button id="start">进入真实审核页面</button><button id="apply">仅应用场景与延迟（不切账号）</button><output id="result" role="status"></output></p>
<p>在另一个标签页打开本入口，点「仅应用场景与延迟」可对正在审核的页面注入冲突、延迟或故障。管理员 2 进入可核对他人认领只读；新入口的账号写入会触发同源旧页 storage 隔离。</p><p><a href="/__novel/state" target="_blank">查看内存请求记录与作品 / 评论状态</a></p>
<script>
const config=async(changeActor)=>{const response=await fetch('/__novel/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(changeActor?{actorId:Number(document.getElementById('actor').value)}:{}),scenario:document.getElementById('scenario').value,delay:Number(document.getElementById('delay').value)})});if(!response.ok)throw new Error('本地场景配置失败');document.getElementById('result').textContent='已应用本地场景，未调用生产或真实 AI';};
document.getElementById('apply').onclick=()=>config(false);
document.getElementById('start').onclick=async()=>{await config(true);const id=document.getElementById('actor').value;if('serviceWorker'in navigator){const registrations=await navigator.serviceWorker.getRegistrations();await Promise.all(registrations.map(registration=>registration.unregister()));}if('caches'in window){const keys=await caches.keys();await Promise.all(keys.map(key=>caches.delete(key)));}localStorage.setItem('abdl_theme',document.getElementById('theme').value);localStorage.setItem('abdl_auto_theme','false');localStorage.setItem('abdl_accounts',JSON.stringify([1,2].map(accountId=>({id:accountId,username:'fixture_admin_'+accountId,role:'admin',token:'fixture-'+accountId}))));localStorage.setItem('abdl_active_account',id);localStorage.setItem('cookie_consent',JSON.stringify({accepted:false,date:new Date().toISOString()}));location.href='/admin/novels';};
</script></html>`;

// 复用既有无生产代理的 Vite 后台壳；仅在本地进程内拦截小说 API 与合成身份。
export async function createNovelFixtureServer({ port = DEFAULT_PORT, ui = false } = {}) {
  const host = await createAdminFixtureServer({ port, ui, quiet: true });
  const inherited = host.server.listeners('request');
  host.server.removeAllListeners('request');
  const fixture = createNovelFixture();
  let actorId = 1;
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" };
  const send = (res, data, status = 200) => { res.writeHead(status, headers); res.end(JSON.stringify(data)); };
  host.server.on('request', async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const novel = url.pathname.startsWith('/api/admin/novels/rebuild');
    if (!novel && !url.pathname.startsWith('/__novel') && !['/api/auth/me', '/api/auth/logout'].includes(url.pathname)) { for (const listener of inherited) listener(req, res); return; }
    const boundPort = host.server.address()?.port || port;
    if (req.headers.origin && !new RegExp(`^http://(?:127\\.0\\.0\\.1|localhost):${boundPort}$`).test(req.headers.origin)) { send(res, { error: '仅本地验收来源可访问' }, 403); return; }
    try {
      if (url.pathname === '/__novel/start') { res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }); res.end(landing); return; }
      let body;
      if (req.method !== 'GET') { let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 20000) throw new Error('本地请求过大'); } body = text ? JSON.parse(text) : {}; }
      if (url.pathname === '/__novel/config' && req.method === 'POST') { if ([1, 2].includes(body.actorId)) actorId = body.actorId; send(res, fixture.configure(body)); return; }
      if (url.pathname === '/__novel/state') { send(res, fixture.state()); return; }
      const tokenId = /^Bearer fixture-([12])$/.exec(req.headers.authorization || '')?.[1];
      if (req.headers.authorization && !tokenId) { send(res, { error: '本地 fixture 不接受真实 token' }, 403); return; }
      if (url.pathname === '/api/auth/me') { if (tokenId) actorId = Number(tokenId); send(res, { id: actorId, username: `fixture_admin_${actorId}`, display_name: `本地管理员 ${actorId}`, role: 'admin', is_super_admin: actorId === 1 }); return; }
      if (url.pathname === '/api/auth/logout') { send(res, {}); return; }
      if (novel) {
        const result = await fixture.respond(url.pathname, { method: req.method, params: url.searchParams, body, operationId: req.headers['idempotency-key'], actorId: tokenId ? Number(tokenId) : actorId });
        send(res, result.data, result.status); return;
      }
      send(res, { error: '本地验收路由不存在' }, 404);
    } catch { send(res, { error: '本地内存 API 请求格式无效' }, 400); }
  });
  return { ...host, fixture };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.NOVEL_FIXTURE_PORT || DEFAULT_PORT);
  const host = await createNovelFixtureServer({ port, ui: true });
  host.server.listen(port, '127.0.0.1', () => console.log(`小说审核本地验收 http://127.0.0.1:${port}/__novel/start（仅内存，未连接生产 API 或 AI）`));
}
