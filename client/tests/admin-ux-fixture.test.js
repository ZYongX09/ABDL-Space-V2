// node --test tests/admin-ux-fixture.test.js
// 本文件只定义测试；导入宿主/router 不打开端口、不启动 Vite、不调用真实服务。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { createAdminUXRouter, validateRouteCoverage, ADMIN_PAGE_DEFINITIONS, FIXTURE_PLATFORM, FIXTURE_SCENARIOS } from './admin-ux-fixture-router.js';
import { createAdminUXRequestHandler, FIXTURE_CSP, isProtectedRequest, validateUnknownAPINeverForwarded } from './admin-ux-fixture-server.js';
import { createAdminIdentityAPI } from '../src/adminIdentity/api.js';
import { createBabyVerificationAPI } from '../src/babyVerification/api.js';
import { createSponsorAdminAPI } from '../src/sponsors/adminAPI.js';
import { validatePlan } from '../src/sponsors/adminModel.js';
import { createUserObservationAPI } from '../src/userObservation/api.js';
import { createNovelReviewAPI } from '../src/novelReview/api.js';

const request = (router, path, method = 'GET', body, headers) => router.respond(path, { method, body, headers });
const json200 = async (router, path, method = 'GET', body, headers) => { const result = await request(router, path, method, body, headers); assert.equal(result.status, 200, `${method} ${path}: ${JSON.stringify(result.data)}`); return result.data; };
const fetcher = router => async (path, options = {}) => {
  const result = await request(router, path, options.method || 'GET', options.body ? JSON.parse(options.body) : undefined, options.headers);
  return new Response(JSON.stringify(result.data), { status: result.status, headers: { 'Content-Type': 'application/json' } });
};
const invokeHTTP = async (handler, { path = '/api/unknown', method = 'GET', body = '', headers = {} } = {}) => {
  const req = Readable.from(body ? [Buffer.from(body)] : []);
  Object.assign(req, { url: path, method, headers: { host: '127.0.0.1:8818', ...headers } });
  const res = { status: 0, body: '', headers: {}, headersSent: false, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, writeHead(status, headers = {}) { this.status = status; this.headersSent = true; for (const [key, value] of Object.entries(headers)) this.setHeader(key, value); }, end(body = '') { this.body += body; } };
  await handler(req, res); return res;
};

test('完整 17 Web / 16 Mobile 路由读覆盖，并与实际生产 route map 对齐', async () => {
  const router = createAdminUXRouter();
  const report = await validateRouteCoverage(router);
  assert.equal(report.expected, FIXTURE_PLATFORM === 'web' ? 17 : 16);
  assert.equal(report.covered, report.expected, JSON.stringify(report.pages.filter(page => !page.covered)));
  const source = await readFile(new URL(FIXTURE_PLATFORM === 'web' ? '../src/App.jsx' : '../src/AdminRoutes.jsx', import.meta.url), 'utf8');
  const real = [...source.matchAll(/<Route\s+path="(\/admin(?:\/[^"*]+)?)"/g)].map(match => match[1]);
  assert.deepEqual([...new Set(real)].sort(), ADMIN_PAGE_DEFINITIONS.map(page => page.path).sort());
});

test('unknown API/OAuth 永远就地 404/拒绝，不进入 Vite（独立校验函数）', async () => {
  const report = await validateUnknownAPINeverForwarded();
  assert.equal(report.forwarded, 0); assert.equal(report.passed, true, JSON.stringify(report.results));
  for (const path of ['/api', '/api/foo', '/oauth', '/oauth/authorize', '/%61pi/foo', '/api%2ffoo', '/API/foo']) assert.equal(isProtectedRequest(path), true, path);
  const router = createAdminUXRouter(); let forwards = 0;
  const handler = createAdminUXRequestHandler({ router, ui: false, vite: { middlewares() { forwards++; } } });
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const response = await invokeHTTP(handler, { path: '/api/admin/not-a-contract', method, body: method === 'GET' ? '' : '{}', headers: { 'content-type': 'application/json' } });
    assert.equal(response.status, 404); assert.equal(JSON.parse(response.body).code, 'fixture_not_found');
  }
  assert.equal(forwards, 0);
});

test('malformed/重复字段/过大/非 JSON 请求被拒绝，未知写入不返回通用成功', async () => {
  const router = createAdminUXRouter(); const handler = createAdminUXRequestHandler({ router, ui: false });
  for (const body of ['{', '{"key":"a","key":"b"}', '{"key":"a","\\u006bey":"b"}']) {
    const response = await invokeHTTP(handler, { path: '/api/admin/settings', method: 'PUT', body, headers: { 'content-type': 'application/json' } });
    assert.equal(response.status, 400);
  }
  assert.equal((await invokeHTTP(handler, { path: '/api/admin/settings', method: 'PUT', body: '{}', headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await invokeHTTP(handler, { path: '/api/admin/settings', method: 'PUT', body: JSON.stringify({ key: 'x', value: 'x'.repeat(100000) }), headers: { 'content-type': 'application/json' } })).status, 413);
  for (const [path, method] of [['/api/admin/settings', 'PUT'], ['/api/admin/diapers', 'POST'], ['/api/admin/badges', 'POST'], ['/api/admin/sponsors/config', 'PUT'], ['/api/admin/baby-verification/config', 'PUT']]) assert.ok((await request(router, path, method, {})).status >= 400, `${method} ${path}`);
});

test('真实角色投影与权限：superadmin/admin/user/loggedout；不接受生产 bearer', async () => {
  const router = createAdminUXRouter();
  for (const [role, id, status] of [['superadmin', 1, 200], ['admin', 2, 200], ['user', 3, 403], ['loggedout', null, 401]]) {
    assert.equal(router.setup({ role }).status, 200);
    const me = await request(router, '/api/auth/me'); assert.equal(me.status, id ? 200 : 401);
    if (id) { assert.equal(me.data.user.id, id); assert.equal(me.data.user.is_super_admin, role === 'superadmin'); }
    assert.equal((await request(router, '/api/admin/users')).status, status);
  }
  router.setup({ role: 'superadmin' });
  assert.equal((await request(router, '/api/admin/users', 'GET', undefined, { authorization: 'Bearer real-jwt-is-never-accepted' })).status, 401);
  router.setup({ role: 'admin' });
  assert.equal((await request(router, '/api/admin/user-observation/policy')).status, 403);
  assert.equal((await request(router, '/api/admin/users/4/role', 'PATCH', { role: 'admin' })).status, 403);
});

test('全局故障在 handler 前阻止写入；恢复 normal 保持未写状态', async () => {
  const router = createAdminUXRouter();
  for (const [scenario, status] of [['errorwrite', 503], ['readonly', 403], ['409', 409], ['401', 401], ['403', 403]]) {
    router.setup({ scenario });
    const before = router.state().posts[0].pinned;
    assert.equal((await request(router, '/api/admin/posts/101/pin', 'POST', {})).status, status);
    assert.equal(router.state().posts[0].pinned, before);
  }
  assert.deepEqual(router.status().scenarios, [...FIXTURE_SCENARIOS]);
  assert.equal(router.setup({ scenario: 'invented' }).status, 422);
});

test('normal 用户治理/QQ 使用真实 identity API 和版本/幂等契约', async () => {
  const router = createAdminUXRouter(); const api = createAdminIdentityAPI({ fetcher: fetcher(router) });
  const identity = await api.detail(3); assert.equal(identity.methods.qq.bound, true);
  const body = { reason: '本地合成解绑验收', confirm_username: identity.user.username, expected_binding_version: identity.methods.qq.updated_at, operation_id: randomUUID() };
  const receipt = await api.unbindQQ(3, body); assert.equal(receipt.qq_bound, false);
  assert.deepEqual(await api.unbindQQ(3, body), receipt);
  assert.equal((await request(router, '/api/admin/identities/users/3/qq/unbind', 'POST', { ...body, operation_id: randomUUID() })).status, 409);
  await json200(router, '/api/admin/users/4/role', 'PATCH', { role: 'admin' });
  assert.equal((await json200(router, '/api/admin/users/4/detail')).user.role, 'admin');
  assert.equal((await request(router, '/api/admin/users/4/ban', 'POST', {})).status, 403);
  await json200(router, '/api/admin/users/4/role', 'PATCH', { role: 'user' });
  assert.equal((await json200(router, '/api/admin/users/4/ban', 'POST', {})).banned, true);
  await json200(router, '/api/admin/users/4', 'DELETE');
  assert.equal((await request(router, '/api/admin/users/4/detail')).status, 404);
});

test('normal 帖子/评论与两种举报都有持久到内存的写后读', async () => {
  const router = createAdminUXRouter();
  assert.equal((await json200(router, '/api/admin/posts/101/pin', 'POST', {})).pinned, false);
  await json200(router, '/api/admin/posts/101/nsfw', 'PATCH', { has_nsfw: true });
  assert.equal((await json200(router, '/api/admin/posts')).posts.find(post => post.id === 101).has_nsfw, true);
  await json200(router, '/api/admin/comments/201', 'DELETE');
  assert.ok(!(await json200(router, '/api/admin/comments')).comments.some(comment => comment.id === 201));
  await json200(router, '/api/reports/admin/301', 'PATCH', { action: 'resolve', delete_content: true });
  assert.ok((await json200(router, '/api/reports/admin?status=resolved')).reports.some(report => report.id === 301));
  await json200(router, '/api/friend-request/admin/reports/401/accept', 'POST', {});
  await json200(router, '/api/friend-request/admin/reports/402/dismiss', 'POST', { reply: '合成驳回说明' });
  assert.equal((await json200(router, '/api/friend-request/admin/reports?status=dismissed')).reports.find(report => report.id === 402).admin_reply, '合成驳回说明');
});

test('normal 产品/品牌和徽章 CRUD、持有人颁发/收回', async () => {
  const router = createAdminUXRouter();
  const created = await json200(router, '/api/admin/diapers', 'POST', { brand: '合成品牌', model: '新条目', sizes: [] });
  await json200(router, `/api/admin/diapers/${created.id}`, 'PATCH', { model: '编辑后' });
  assert.equal((await json200(router, '/api/admin/diapers')).diapers.find(row => row.id === created.id).model, '编辑后');
  await json200(router, `/api/admin/diapers/${created.id}`, 'DELETE');
  await json200(router, '/api/admin/brands', 'POST', { name: '新合成品牌' });
  const brand = (await json200(router, '/api/admin/brands')).brands.find(row => row.name === '新合成品牌');
  await json200(router, '/api/admin/brands', 'POST', { ...brand, description: '编辑品牌' });
  await json200(router, `/api/admin/brands/${brand.id}`, 'DELETE');
  await json200(router, '/api/admin/badges', 'POST', { key: 'synthetic_new', name: '测试徽章' });
  await json200(router, '/api/admin/badges/synthetic_new', 'PATCH', { name: '已编辑' });
  await json200(router, '/api/admin/badges/grant', 'POST', { badge_key: 'synthetic_new', user_id: 3 });
  assert.equal((await json200(router, '/api/admin/badges/synthetic_new/holders')).total, 1);
  await json200(router, '/api/admin/badges/revoke', 'POST', { badge_key: 'synthetic_new', username: 'fixture_user' });
  assert.equal((await json200(router, '/api/admin/badges/synthetic_new/holders')).total, 0);
  await json200(router, '/api/admin/badges/synthetic_new', 'DELETE');
});

test('normal 宝宝审核真实 parser、认领/照片授权/决定/证书代次与 CAS 配置', async () => {
  const router = createAdminUXRouter(); const api = createBabyVerificationAPI({ fetcher: fetcher(router), getToken: () => '' });
  assert.equal(router.setup({ photoURL: 'blob:http://127.0.0.1:8818/550e8400-e29b-41d4-a716-446655440000' }).status, 200);
  let item = await api.admin.detail('application-1');
  await assert.rejects(api.admin.photo(item.id, item.photos[0].id));
  item = await api.admin.claim(item.id, undefined, item); assert.equal(item.status, 'reviewing');
  const photo = await api.admin.photo(item.id, item.photos[0].id); assert.ok(photo.url.startsWith('blob:http://127.0.0.1:'));
  // 这里只验证协议；真实浏览器 blob 由 entry.jsx 创建，不宣称 Node URL 能被浏览器读取。
  item = await api.admin.approve(item.id, '完整合成资料核对通过', item, randomUUID()); assert.equal(item.status, 'approved');
  const oldGeneration = item.certificate.generation; assert.ok(Number.isSafeInteger(oldGeneration));
  item = await api.admin.reissue(item.id, '合成补发', item, randomUUID()); assert.equal(item.certificate.generation, oldGeneration + 1);
  item = await api.admin.revoke(item.id, '合成吊销', item, randomUUID()); assert.equal(item.certificate.status, 'revoked');
  const config = await api.admin.config(); const updated = await api.admin.saveConfig({ ...config, freeMonthlyLimit: 3 }, '合成配置调整'); assert.equal(updated.version, config.version + 1);
  await assert.rejects(api.admin.saveConfig(config, '旧版冲突'), error => error.status === 409);
  assert.ok((await api.admin.audit({})).items.length > 1);
});

test('normal 站点设置、站点 revision、广告回执与推送均只写内存', async () => {
  const router = createAdminUXRouter();
  await json200(router, '/api/admin/settings', 'PUT', { key: 'fixture_key', value: '合成值' });
  assert.ok((await json200(router, '/api/admin/settings')).settings.some(row => row.key === 'fixture_key'));
  await json200(router, '/api/admin/beta-mode', 'PUT', { enabled: true, allowedRoutes: ['/about'], message: '合成提示' });
  await json200(router, '/api/admin/blocked-emails', 'POST', { email: 'new@example.invalid', reason: '合成' });
  await json200(router, '/api/admin/blocked-emails/new%40example.invalid', 'DELETE');
  const site = await json200(router, '/api/admin/site-access');
  const saved = await json200(router, '/api/admin/site-access', 'PUT', { ...site, web_mode: 'limited' }); assert.notEqual(saved.revision, site.revision);
  assert.equal((await request(router, '/api/admin/site-access', 'PUT', site)).status, 409);
  const policy = await json200(router, '/api/admin/advertising/policy');
  assert.equal((await json200(router, '/api/admin/advertising/policy', 'PUT', { ...policy, enabled: true })).enabled, 1);
  const ad = await json200(router, '/api/admin/advertising/ads/1301', 'PATCH', { status: 'paused' }); assert.equal(ad.id, 1301); assert.equal(ad.status, 'paused'); assert.ok(ad.updated_at);
  if (FIXTURE_PLATFORM === 'mobile') { const codes = router.state().adCodes.length; const receipt = await json200(router, '/api/admin/advertising/registration-codes', 'POST', { code: 'SYNTHETIC12345678', count: 50 }); assert.equal(receipt.success, true); assert.match(receipt.masked_code, /^[A-Za-z0-9_-]{3}\*{3}[A-Za-z0-9_-]{2}$/); assert.equal(router.state().adCodes.length, codes + 1); }
  const logs = router.state().pushLogs.length;
  const sent = await json200(router, '/api/push/admin/send', 'POST', { title: '合成发送', body: '不投递真实通知', platform: 'web', targetType: 'all' });
  assert.equal(sent.success, true); assert.equal(sent.webSent, 1); assert.equal(sent.failed, 0);
  const tested = await json200(router, '/api/push/admin/test', 'POST', { user_id: 3 });
  assert.equal(tested.success, true); assert.equal(tested.sent, 2);
  assert.equal(router.state().pushLogs.length, logs + 2);
});

test('normal 赞助 8 栏真实 API：配置/套餐/用户/额度/码批次/库存/对账/审计', async () => {
  const router = createAdminUXRouter(); const api = createSponsorAdminAPI({ fetcher: fetcher(router) });
  assert.ok((await api.overview()).channels.alipay.total_count > 0);
  assert.ok((await api.paymentRecords({})).items.length > 0);
  const config = await api.config(); const saved = await api.saveConfig({ config, expected_version: config.version, reason: '合成配置保存' }); assert.equal(saved.version, config.version + 1);
  const plans = await api.plans(); const plan = plans.items[0];
  for (const candidate of plans.items) {
    assert.doesNotThrow(() => validatePlan(candidate));
    assert.equal(new URL(candidate.purchase_url).searchParams.has('viokrz_ex'), false);
  }
  // 不把旧用户端 URL 的额外参数放宽成合法管理写入。
  const invalidURL = new URL(plan.purchase_url); invalidURL.searchParams.set('viokrz_ex', '0');
  await assert.rejects(api.updatePlan(plan.id, { plan: { ...plan, purchase_url: invalidURL.href }, expected_version: plan.version, reason: '合成非法参数回归' }), error => error.code === 'invalid_plan');
  const changed = await api.updatePlan(plan.id, { plan: { ...plan, description: '本地编辑' }, expected_version: plan.version, reason: '合成套餐更新' }); assert.equal(changed.version, plan.version + 1);
  await api.createPlan({ plan: { ...plan, id: 'synthetic-plan', purchase_url: '', afdian_plan_id: '', afdian_sku_id: '' }, reason: '合成创建' });
  assert.ok((await api.users({})).total > 0);
  const granted = await api.grant(5, { plan_id: 'week', reason: '合成授予', operation_id: randomUUID() }); assert.equal(granted.sponsor.active, true);
  await api.quota(5, { adjustment: 2, reason: '合成额度', operation_id: randomUUID() });
  assert.equal((await api.revoke(5, { reason: '合成撤销', operation_id: randomUUID() })).sponsor.active, false);
  const batch = await api.createBatch({ plan_id: 'month', count: 2, reason: '合成生成', operation_id: randomUUID() });
  assert.equal((await api.exportBatch(batch.id, { reason: '仅合成导出' })).codes.length, 2);
  const codes = await api.codes({}); const code = codes.items.find(row => row.batch_id === batch.id);
  await api.codeState(code.id, { disabled: true, reason: '合成停用' });
  assert.ok((await api.codes({ state: 'disabled' })).items.some(row => row.id === code.id));
  const stock = (await api.stock()).items[0];
  await api.saveStock(stock.plan_id, { setting: { ...stock, enabled: false }, reason: '合成库存保存' });
  await api.checkStock(stock.plan_id, { reason: '合成检查' });
  assert.equal((await api.refill(stock.plan_id, { count: 1, reason: '仅合成补货', operation_id: randomUUID() })).state, 'confirmed');
  assert.ok((await api.stockBatches({})).total > 0);
  assert.equal((await api.reconcile('synthetic-stock-seed', { reason: '核对合成证据' })).state, 'confirmed');
  assert.ok((await api.audit({})).total > 1);
});

test('复用小说完整快照与定向观察 API，保留真实 generation/策略读写', async () => {
  const router = createAdminUXRouter();
  const novel = createNovelReviewAPI(async (path, options = {}) => {
    const result = await request(router, path, options.method || 'GET', options.body ? JSON.parse(options.body) : undefined, options.headers);
    if (result.status !== 200) throw Object.assign(new Error(result.data.error), { status: result.status });
    return result.data;
  });
  assert.ok((await novel.listReviews({})).items.length > 0);
  assert.ok((await novel.works({})).items.length > 0);
  const review = await novel.review('review-pending');
  assert.ok((await novel.chapterBody(review.id, review.chapters[0])).body.length > 12000);
  const observation = createUserObservationAPI({ fetcher: fetcher(router), getSession: () => ({ user: router.status().user, token: '' }) });
  const policy = await observation.policy(); assert.equal(policy.timezone, 'Asia/Shanghai');
  const target = await observation.target(3); assert.equal(target.user.id, 3);
});

test('Web 相册举报只展示本地预览、全量屏蔽集合幂等、处理状态可重读', { skip: FIXTURE_PLATFORM !== 'web' }, async () => {
  const router = createAdminUXRouter(); const path = '/api/admin/album-reports/album-report-2';
  const report = await json200(router, path); assert.equal(report.photos[0].preview_url, '/__admin-ux/image.svg');
  const body = { photo_ids: report.photos.map(photo => photo.id), operation_id: randomUUID() };
  const receipt = await json200(router, `${path}/block`, 'POST', body); assert.equal(receipt.blocked_photo_ids.length, 2);
  assert.deepEqual(await json200(router, `${path}/block`, 'POST', body), receipt);
  await json200(router, `${path}/resolve`, 'POST', {}); assert.equal((await json200(router, path)).status, 'resolved');
});

test('empty/longlists、状态实例相互隔离，配置保留可用结构', async () => {
  const empty = createAdminUXRouter({ scenario: 'empty' });
  for (const [path, key] of [['/api/admin/users', 'users'], ['/api/admin/posts', 'posts'], ['/api/admin/comments', 'comments'], ['/api/admin/badges', 'badges'], ['/api/admin/diapers', 'diapers'], ['/api/admin/sponsors/users', 'items']]) assert.equal((await json200(empty, path))[key].length, 0);
  assert.ok((await json200(empty, '/api/admin/sponsors/config')).version);
  const long = createAdminUXRouter({ scenario: 'longlists' }); const users = await json200(long, '/api/admin/users?page=2'); assert.equal(users.users.length, 20); assert.ok(users.pagination.totalPages > 2);
  const first = createAdminUXRouter(), second = createAdminUXRouter();
  await json200(first, '/api/admin/posts/101', 'DELETE'); assert.ok((await json200(second, '/api/admin/posts')).posts.some(post => post.id === 101));
});

test('宿主只开放现有图标资产白名单，不依赖未安装npm图标包或任意public路径', async () => {
  const handler = createAdminUXRequestHandler({ router: createAdminUXRouter(), ui: true });
  const html = await invokeHTTP(handler, { path: '/admin' });
  assert.equal(html.status, 200); assert.match(html.body, /href="\/fontawesome\.min\.css"/);
  for (const [path, mime] of [['/fontawesome.min.css', 'text/css; charset=utf-8'], ['/webfonts/fa-solid-900.woff2', 'font/woff2'], ['/webfonts/fa-regular-400.woff2', 'font/woff2'], ['/webfonts/fa-brands-400.woff2', 'font/woff2']]) {
    const result = await invokeHTTP(handler, { path });
    assert.equal(result.status, 200); assert.equal(result.headers['content-type'], mime); assert.ok(result.body.length > 0);
    assert.equal((await invokeHTTP(handler, { path, method: 'HEAD' })).body, '');
  }
  for (const path of ['/webfonts/unknown.woff2', '/public/fontawesome.min.css', '/webfonts/../.env', '/fontawesome.min.css/extra']) assert.equal((await invokeHTTP(handler, { path })).status, 404);
  const entry = await readFile(new URL('./admin-ux-fixture-entry.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(entry, /@fortawesome\/fontawesome-free/);
});

test('宿主 CSP/loopback/无 env 配置和虚拟入口，不导入生产 main/index/config/proxy', async () => {
  assert.match(FIXTURE_CSP, /connect-src 'self';/); assert.match(FIXTURE_CSP, /worker-src 'none'/); assert.match(FIXTURE_CSP, /frame-src 'none'/);
  const handler = createAdminUXRequestHandler({ router: createAdminUXRouter(), ui: false });
  for (const headers of [{ host: 'api.abdl-space.top' }, { origin: 'https://example.invalid' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await invokeHTTP(handler, { headers })).status, 403);
  for (const path of ['/.env', '/.env.production', '/sw.js', '/manifest.json', '/functions/api/proxy.js', '/dist/index.html']) assert.equal((await invokeHTTP(handler, { path })).status, 404);
  const server = await readFile(new URL('./admin-ux-fixture-server.js', import.meta.url), 'utf8');
  assert.match(server, /configFile: false, envFile: false, envPrefix: \[\]/); assert.match(server, /proxy: \{\}/); assert.match(server, /hmr: false/);
  const entry = await readFile(new URL('./admin-ux-fixture-entry.jsx', import.meta.url), 'utf8');
  assert.match(entry, /AdminRouteGate/); assert.match(entry, /URL\.createObjectURL\(new Blob/);
  assert.doesNotMatch(entry, /import .*\/src\/(?:App|main)\b/);
});
