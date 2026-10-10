import { COUNTERS } from '../src/merchant/model.js';

export const isLoopback = host => ['127.0.0.1', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1'].includes(host);
const svg = kind => `<svg xmlns="http://www.w3.org/2000/svg" width="${kind === 'ad' ? 800 : 160}" height="${kind === 'ad' ? 420 : 160}" viewBox="${kind === 'ad' ? '0 0 800 420' : '0 0 160 160'}"><rect width="100%" height="100%" fill="#e8eef5"/><rect x="${kind === 'ad' ? 48 : 22}" y="${kind === 'ad' ? 48 : 22}" width="${kind === 'ad' ? 704 : 116}" height="${kind === 'ad' ? 324 : 116}" rx="12" fill="#ffffff" stroke="#64748b"/><text x="50%" y="52%" text-anchor="middle" fill="#334155" font-family="sans-serif" font-size="${kind === 'ad' ? 36 : 26}">${kind === 'ad' ? '本机测试广告素材' : '企业'}</text></svg>`;
const media = kind => `https://merchant-fixture.invalid/media/${kind}.svg`;
const counterKeys = [...COUNTERS.map(([key]) => key), 'ad_count', 'active_ads'];
function profile(id = 41) { return { id, user_id: 7 + id, username: `merchant${id}`, display_name: `本机测试企业 ${id}`, avatar_url: media('avatar'), status: 'active', identity_locked: true, description: '本机 fixture 企业，用于验收后台交互。', contact_name: '测试联系人', contact_email: 'fixture@example.invalid', website_url: 'https://example.invalid', ad_count: 12, impressions: 3600, clicks: 72 }; }
function createState(scenario) {
  const isSuper = scenario === 'super'; const company = profile();
  if (scenario === 'inactive') company.status = 'suspended';
  if (scenario === 'missing') { company.display_name = ''; company.avatar_url = ''; company.identity_locked = false; }
  const items = Array.from({ length: 23 }, (_, i) => ({ id: i + 101, merchant_id: i % 2 ? 42 : 41, title: `本机验收广告 ${i + 1}`, body: `第 ${i + 1} 条真实 fixture API 返回内容，用于验证搜索、分页、编辑、预览和操作确认。`, landing_url: 'https://example.invalid/products', image_url: i % 3 ? '' : media('ad'), status: ['active', 'draft', 'paused'][i % 3], starts_at: i % 2 ? null : '2026-10-01T00:00:00.000Z', ends_at: null, advertiser_name: isSuper ? `运营指定企业 ${i + 1}` : null, advertiser_avatar_url: isSuper ? media('avatar') : null, merchant_name: isSuper ? `运营指定企业 ${i + 1}` : company.display_name, merchant_avatar: media('avatar'), ad_type: isSuper ? 'official' : 'merchant', impressions: (i + 1) * 160, clicks: (i + 1) * 7 }));
  return { scenario, isSuper, company, identityRequired: scenario === 'missing', items, merchants: Array.from({ length: 14 }, (_, i) => ({ ...profile(41 + i), status: i % 4 === 1 ? 'suspended' : 'active' })), audit: Array.from({ length: 26 }, (_, i) => ({ id: i + 1, actor_id: 7, actor_name: isSuper ? 'fixture-super' : 'fixture-ordinary', action: ['ad_create', 'ad_update', 'ad_clone'][i % 3], entity_type: 'ad', entity_id: 101 + i, detail_json: JSON.stringify({ status: 'draft', title: `本机验收广告 ${i + 1}` }), created_at: new Date(Date.UTC(2026, 9, 10, 10, 0, i)).toISOString() })) };
}
function page(items, params) {
  const current = Math.max(1, Number(params.get('page')) || 1); const limit = Math.min(50, Math.max(1, Number(params.get('limit')) || 10));
  return { items: items.slice((current - 1) * limit, current * limit), pagination: { page: current, limit, total: items.length, totalPages: Math.ceil(items.length / limit) } };
}
export function merchantFixturePlugin() {
  const states = new Map(); const requests = [];
  const getState = scenario => { if (!states.has(scenario)) states.set(scenario, createState(scenario)); return states.get(scenario); };
  return {
    name: 'merchant-fixture-loopback-only', enforce: 'pre',
    config() { return { server: { host: '127.0.0.1', strictPort: true, proxy: undefined, headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; worker-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" } } }; },
    configResolved(config) {
      if (config.command !== 'serve' || !isLoopback(config.server.host)) throw new Error('merchant-fixture 仅允许 Vite serve 且只可绑定 loopback；禁止构建或公开访问。');
      if (config.server.proxy && Object.keys(config.server.proxy).length) throw new Error('merchant-fixture 不允许生产代理。');
    },
    transformIndexHtml: { order: 'pre', handler() { return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>商家后台本机验收</title><style>body{margin:0;font-family:system-ui,sans-serif}button,input,textarea,select{font:inherit}</style></head><body><div id="root"></div><script type="module" src="/tests/merchant-fixture-entry.jsx"></script></body></html>'; } },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const host = new URL(`http://${req.headers.host || 'invalid'}`).hostname;
        const json = (value, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(value)); };
        if (!isLoopback(host) || !isLoopback(req.socket.remoteAddress)) return json({ error: 'Fixture is loopback-only.' }, 403);
        const url = new URL(req.url, 'http://127.0.0.1'); const path = url.pathname;
        if (path === '/sw.js') { res.statusCode = 404; return res.end(); }
        if (path.startsWith('/__merchant-fixture/media/')) { res.setHeader('Content-Type', 'image/svg+xml'); res.setHeader('Cache-Control', 'no-store'); return res.end(svg(path.endsWith('/ad.svg') ? 'ad' : 'avatar')); }
        if (path === '/__merchant-fixture/requests') return json({ requests });
        if (path === '/__merchant-fixture/reset' && req.method === 'POST') { states.clear(); requests.length = 0; return json({ ok: true }); }
        if (!path.startsWith('/api/')) return next();
        const scenario = ['ordinary', 'super', 'missing', 'error', 'inactive', 'anonymous'].includes(req.headers['x-merchant-fixture']) ? req.headers['x-merchant-fixture'] : 'ordinary';
        const state = getState(scenario); requests.push({ scenario, method: req.method, path: `${path}${url.search}` });
        if (requests.length > 500) requests.shift();
        if (scenario === 'anonymous') return json({ error: '请先登录。' }, 401);
        if (!path.startsWith('/api/merchant/') && path !== '/api/images/upload') return json({ error: 'Fixture 已阻断非商家 API，不访问生产服务。' }, 404);
        if (scenario === 'error' && path === '/api/merchant/info') return json({ error: '本机 fixture：权限接口暂时不可用，请手动重试。' }, 503);
        if (path === '/api/images/upload' && req.method === 'POST') { for await (const chunk of req) { void chunk; } return json({ url: media('avatar') }); }
        let body = {};
        if (['POST', 'PATCH'].includes(req.method)) {
          try { let text = ''; for await (const chunk of req) { text += chunk; if (text.length > 100000) throw new Error('too large'); } body = text ? JSON.parse(text) : {}; }
          catch { return json({ error: '请求体无效。' }, 400); }
        }
        const record = (action, entity, entityId, detail) => state.audit.unshift({ id: Date.now(), actor_id: 7, actor_name: `fixture-${scenario}`, action, entity_type: entity, entity_id: entityId, detail_json: JSON.stringify(detail), created_at: new Date().toISOString() });
        if (path === '/api/merchant/info') return json({ profile: state.isSuper ? null : state.company, merchant: state.isSuper ? null : state.company, authorized: true, active: state.isSuper || state.company.status === 'active', is_super_admin: state.isSuper, permissions: { can_manage_all: state.isSuper, can_override_advertiser: state.isSuper, can_edit_identity: state.isSuper }, identity_required: state.identityRequired });
        if (state.company.status === 'suspended' && !state.isSuper) return json({ error: '商家已暂停。' }, 403);
        if (path === '/api/merchant/identity' && req.method === 'POST') { if (!state.identityRequired) return json({ error: '企业身份已锁定。' }, 409); Object.assign(state.company, body, { identity_locked: true }); state.identityRequired = false; state.items.forEach(item => { item.merchant_name = body.display_name; item.merchant_avatar = body.avatar_url; }); record('merchant_identity', 'merchant', 41, body); return json(state.company); }
        if (state.identityRequired) return json({ error: '请先登记企业身份。' }, 403);
        if (path === '/api/merchant/profile') {
          if (req.method === 'GET') return json(state.isSuper ? null : state.company);
          if (!state.isSuper && ('display_name' in body || 'avatar_url' in body)) return json({ error: '企业身份不可修改。' }, 403);
          Object.assign(state.company, body); record('merchant_profile_update', 'merchant', 41, body); return json(state.company);
        }
        if (path === '/api/merchant/audit') return json(page(state.audit, url.searchParams));
        if (path === '/api/merchant/merchants') return state.isSuper ? json(page(state.merchants, url.searchParams)) : json({ error: '仅超级管理员可管理企业。' }, 403);
        const statusMatch = path.match(/^\/api\/merchant\/merchants\/(\d+)\/status$/);
        if (statusMatch) { if (!state.isSuper) return json({ error: '无权访问。' }, 403); const merchant = state.merchants.find(item => item.id === Number(statusMatch[1])); if (!merchant) return json({ error: '企业不存在。' }, 404); merchant.status = body.status; record('merchant_status_update', 'merchant', merchant.id, body); return json(merchant); }
        const ads = () => state.items.filter(item => (state.isSuper || item.merchant_id === 41) && (!url.searchParams.get('merchant_id') || item.merchant_id === Number(url.searchParams.get('merchant_id'))) && (!url.searchParams.get('ad_id') || item.id === Number(url.searchParams.get('ad_id'))));
        if (path === '/api/merchant/stats') {
          const from = url.searchParams.get('from'); const to = url.searchParams.get('to');
          const days = Math.floor((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
          if (!Number.isFinite(days) || days < 1 || days > 93) return json({ error: '请选择 1–93 天范围。' }, 400);
          const items = ads();
          const daily = Array.from({ length: days }, (_, i) => ({ date: new Date(Date.parse(from) + i * 86400000).toISOString().slice(0, 10), impressions: items.length * (17 + i % 11), clicks: items.length * (3 + i % 4), link_clicks: items.length * (1 + i % 2), image_views: items.length, ad_navigations: items.length, ad_count: items.length, active_ads: items.filter(item => item.status === 'active').length }));
          const totals = Object.fromEntries(counterKeys.map(key => [key, ['ad_count', 'active_ads'].includes(key) ? daily[0][key] : daily.reduce((sum, row) => sum + row[key], 0)]));
          return json({ ...totals, daily });
        }
        const applyAd = (item, payload) => Object.assign(item, payload, { ad_type: state.isSuper ? 'official' : 'merchant', merchant_name: state.isSuper ? payload.advertiser_name || item.advertiser_name || '全平台运营' : state.company.display_name, merchant_avatar: state.isSuper ? payload.advertiser_avatar_url || item.advertiser_avatar_url || media('avatar') : state.company.avatar_url });
        if (path === '/api/merchant/ads') {
          if (req.method === 'GET') { const q = (url.searchParams.get('q') || '').toLowerCase(); const status = url.searchParams.get('status'); return json(page(ads().filter(item => (!status || item.status === status) && `${item.title} ${item.body}`.toLowerCase().includes(q)), url.searchParams)); }
          if (!state.isSuper && ('advertiser_name' in body || 'advertiser_avatar_url' in body)) return json({ error: '普通商家不可覆盖企业身份。' }, 403);
          const item = applyAd({ id: Math.max(...state.items.map(ad => ad.id)) + 1, merchant_id: 41, impressions: 0, clicks: 0 }, body); state.items.unshift(item); record('ad_create', 'ad', item.id, body); return json(item, 201);
        }
        const adMatch = path.match(/^\/api\/merchant\/ads\/(\d+)(\/clone)?$/);
        if (adMatch) {
          const item = state.items.find(ad => ad.id === Number(adMatch[1]) && (state.isSuper || ad.merchant_id === 41)); if (!item) return json({ error: '广告不存在。' }, 404);
          if (adMatch[2]) { const cloned = { ...item, id: Math.max(...state.items.map(ad => ad.id)) + 1, title: `${item.title}（副本）`, status: 'draft', impressions: 0, clicks: 0 }; state.items.unshift(cloned); record('ad_clone', 'ad', cloned.id, { source_id: item.id }); return json(cloned, 201); }
          if (req.method === 'DELETE') { item.status = 'archived'; record('ad_archive', 'ad', item.id, { status: 'archived' }); return json(item); }
          if (req.method === 'PATCH') { if (!state.isSuper && ('advertiser_name' in body || 'advertiser_avatar_url' in body)) return json({ error: '普通商家不可覆盖企业身份。' }, 403); applyAd(item, body); record('ad_update', 'ad', item.id, body); }
          return json(item);
        }
        return json({ error: 'Fixture 路由不存在。' }, 404);
      });
    },
  };
}
