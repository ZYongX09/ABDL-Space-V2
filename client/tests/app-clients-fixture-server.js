import { createServer } from 'node:http';
import { createAppClientsFixture } from '../src/appClients/fixture.js';

const scenarios = ['normal', 'legacy-reminder', 'empty', 'unavailable', 'errors', 'save-error', 'slow'];
const fixture = createAppClientsFixture(process.env.APP_FIXTURE_SCENARIO || 'normal');
const port = Number(process.env.APP_FIXTURE_PORT || 8791);
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.writeHead(403); res.end('仅允许本地测试来源'); return;
  }
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Vary': 'Origin' } : {}), 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === '/__fixture') {
    const next = url.searchParams.get('scenario');
    if (next && scenarios.includes(next)) fixture.setScenario(next);
    res.writeHead(200, headers); res.end(JSON.stringify({ scenario: fixture.getScenario(), scenarios })); return;
  }
  try {
    let text = '';
    for await (const chunk of req) { text += chunk; if (text.length > 20000) throw new Error('请求过大'); }
    // 在延迟前生成响应，便于验证真正的旧请求晚到情形。
    const result = fixture.respond(url.pathname, req.method, url.searchParams, text ? JSON.parse(text) : null);
    const delay = fixture.delay(url.pathname, url.searchParams);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    res.writeHead(result.status, headers); res.end(JSON.stringify(result.data));
    console.log(`${req.method} ${url.pathname}${url.search} -> ${result.status}${delay ? ` (${delay}ms)` : ''}`);
  } catch (error) { res.writeHead(400, headers); res.end(JSON.stringify({ error: error.message })); }
});
server.listen(port, '127.0.0.1', () => console.log(`本地 App fixture：http://127.0.0.1:${port}；当前场景 ${fixture.getScenario()}；所有保存仅在内存，不转发真实 API。`));
