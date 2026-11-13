import { isSuperAdmin } from '../src/pages/admin/access.js';
import { DEFAULT_NBW_V2_POLICY, nbwV2PolicyPayload } from '../src/appClients/model.js';
import { createAppClientsFixture } from '../src/appClients/fixture.js';
import { APP_AI_PROVIDER_PATH, APP_AI_PROVIDER_TEST_PATH, createAppAIFixture } from '../src/appAI/fixture.js';
import { APP_HUMAN_CHECK_POLICY_PATH, createAppHumanCheckFixture } from '../src/appHumanCheck/fixture.js';
import { TRANSLATION_POLICY_PATH, createTranslationPolicyFixture } from '../src/translationPolicy/fixture.js';
import { TRANSLATION_GLOSSARY_PATH, createTranslationGlossaryFixture } from '../src/translationGlossary/fixture.js';
import { NBW_UPSTREAM_HOST_PATH, createNBWUpstreamFixture } from '../src/nbwUpstream/fixture.js';
import { createNovelFixture } from '../src/novelReview/fixture.js';
import { createObservationFixture } from '../src/userObservation/fixture.js';
import { createAlipayPolicyFixture } from './alipay-policy-fixture.js';
import { copy, createRouteRegistry, fail, isWrite, missing, ok } from './admin-ux-fixture/core.js';
import { createCommunityState, registerCommunityRoutes } from './admin-ux-fixture/community.js';
import { registerCatalogRoutes } from './admin-ux-fixture/catalog.js';
import { registerVerificationRoutes } from './admin-ux-fixture/verification.js';
import { registerSystemRoutes } from './admin-ux-fixture/system.js';
import { registerSponsorRoutes } from './admin-ux-fixture/sponsors.js';

export const FIXTURE_PLATFORM = 'web';
export const FIXTURE_DEFAULT_PORT = FIXTURE_PLATFORM === 'web' ? 8818 : 8819;
export const FIXTURE_SCENARIOS = Object.freeze(['normal', 'empty', 'slow', 'errorwrite', 'readonly', '409', '401', '403', 'longlists', 'errorread']);
export const FIXTURE_ROLES = Object.freeze(['superadmin', 'admin', 'user', 'loggedout']);
export const FIXTURE_THEMES = Object.freeze(['light', 'dark', 'colorful']);
export const FIXTURE_FEATURE_SCENARIOS = Object.freeze({
  appClients: ['normal', 'empty', 'unavailable', 'errors', 'save-error', 'slow', 'legacy-reminder', 'nbw-unavailable', 'nbw-invalid'],
  appAI: ['normal', 'unavailable', 'save-error', 'conflict', 'invalid', 'slow', 'test-error', 'test-timeout', 'test-rate-limited', 'test-invalid'],
  human: ['normal', 'unavailable', 'save-error', 'conflict', 'invalid', 'slow', 'configured'],
  translation: ['normal', 'unavailable', 'save-error', 'conflict', 'invalid', 'invalid-save', 'slow'],
  glossary: ['normal', 'empty', 'maximum', 'long', 'unavailable', 'save-error', 'conflict', 'invalid', 'invalid-save', 'slow'],
  nbw: ['normal', 'unavailable', 'save-error', 'slow', 'invalid'],
  novels: ['normal', 'slow', 'unavailable', 'conflict', 'body-mismatch', 'ai-unavailable', 'ai-stuck', 'policy-conflict'],
  observation: ['normal', 'empty', 'slow', 'large', 'unavailable', 'invalid', 'conflict', 'save-error', 'schema-unavailable'],
  alipay: ['normal', 'ready', 'missing-context', 'daily-exhausted', 'monthly-exhausted', 'stale', 'missing-api', 'load-error', 'invalid-data', 'save-error', 'save-unknown', 'conflict', 'slow-save', 'overview-empty', 'refund-failure'],
});

export const ADMIN_PAGE_DEFINITIONS = Object.freeze([
  { path: '/admin', module: 'overview', label: '概览', reads: ['/api/admin/stats/overview', '/api/admin/stats/trends', '/api/admin/app-clients/stats'] },
  { path: '/admin/users', module: 'users', label: '用户与 QQ 身份', reads: ['/api/admin/users'] },
  { path: '/admin/app-clients', module: 'appClients', label: 'App 管理', reads: ['/api/admin/app-clients/stats', '/api/admin/app-clients/users', '/api/admin/app-clients/reminder', '/api/admin/app-clients/policy', '/api/admin/app-clients/nbw-local-only', '/api/admin/nbw/policy', APP_AI_PROVIDER_PATH, APP_HUMAN_CHECK_POLICY_PATH, TRANSLATION_POLICY_PATH, TRANSLATION_GLOSSARY_PATH, NBW_UPSTREAM_HOST_PATH] },
  { path: '/admin/sponsors', module: 'sponsors', label: '赞助者（8 栏）', reads: ['/api/admin/sponsors/overview', '/api/admin/sponsors/payment-records', '/api/admin/sponsors/config', '/api/admin/sponsors/plans', '/api/admin/sponsors/users', '/api/admin/sponsors/codes', '/api/admin/sponsors/stock/', '/api/admin/sponsors/stock/batches', '/api/admin/sponsors/audit', '/api/admin/sponsors/alipay-policy'] },
  { path: '/admin/advertising', module: 'advertising', label: '广告投放', reads: ['/api/admin/advertising', '/api/admin/advertising/policy'] },
  { path: '/admin/baby-verifications', module: 'babyVerifications', label: '宝宝认证审核', reads: ['/api/admin/baby-verification/applications', '/api/admin/baby-verification/audit', '/api/admin/baby-verification/config'] },
  { path: '/admin/badges', module: 'badges', label: '徽章', reads: ['/api/admin/badges'] },
  { path: '/admin/posts', module: 'posts', label: '帖子', reads: ['/api/admin/posts'] },
  { path: '/admin/comments', module: 'comments', label: '评论', reads: ['/api/admin/comments'] },
  { path: '/admin/novels', module: 'novels', label: '小说完整审核', reads: ['/api/admin/novels/rebuild/reviews', '/api/admin/novels/rebuild/works', '/api/admin/novels/rebuild/reports', '/api/admin/novels/rebuild/ai-policy'] },
  { path: '/admin/reports', module: 'reports', label: '两类举报', reads: ['/api/reports/admin', '/api/friend-request/admin/reports'] },
  { path: '/admin/album-reports', module: 'albumReports', label: '相册举报（Web）', reads: ['/api/admin/album-reports'] },
  { path: '/admin/security', module: 'security', label: '安全与定向观察', reads: ['/api/admin/security/stats', '/api/admin/security/logs', '/api/admin/user-observation/policy', '/api/admin/user-observation/targets'] },
  { path: '/admin/settings', module: 'settings', label: '站点设置', reads: ['/api/admin/settings', '/api/admin/beta-mode', '/api/admin/blocked-emails'] },
  { path: '/admin/site-access', module: 'siteAccess', label: '站点状态', reads: ['/api/admin/site-access'] },
  { path: '/admin/diapers', module: 'diapers', label: '产品与品牌', reads: ['/api/admin/diapers', '/api/admin/brands'] },
  { path: '/admin/notifications', module: 'notifications', label: '推送管理', reads: ['/api/push/admin/stats', '/api/push/admin/logs', '/api/push/admin/platforms'] },
].filter(page => FIXTURE_PLATFORM === 'web' || page.module !== 'albumReports'));

export const KNOWN_FIXTURE_GAPS = Object.freeze([
  '这是合成验收宿主，不是生产业务正确性或真实后端事务的证明。',
  '退款复用原支付宝 fixture，仅返回 processing；不模拟真实支付、结算或最终退款到账。',
  '补货/对账使用明确标注的内存正向证据，不执行爱发电请求；不复刻外部未知订单的所有竞态。',
  '宝宝认证照片为本浏览器创建的几何 blob，只有页面认领后的显式查看返回；没有真实照片、上传或拍摄流程。',
  'empty 保持可编辑配置与授权结构有效；只清空列表/统计，不把缺配置伪装成成功。',
  'longlists 扩展新增列表并沿用原 App/小说/观察 fixture 的既有大数据，不保证每个独立控件都超过一页。',
  '管理页链接到前台详情/登录/证书页不在此宿主范围，显示范围提示而非伪造业务页面。',
  '未运行服务、测试、构建或浏览器 GUI；页面 owners 的后续新 API 会明确 404，需按契约增量补充。',
]);

export function createAdminUXRouter({ platform = FIXTURE_PLATFORM, scenario: initialScenario = 'normal', role: initialRole = 'superadmin', now = () => Math.floor(Date.now() / 1000) } = {}) {
  if (!FIXTURE_SCENARIOS.includes(initialScenario) || !FIXTURE_ROLES.includes(initialRole)) throw new TypeError('无效合成场景或角色');
  let scenario = initialScenario, role = initialRole, photo = '', state, registry, factories;
  let featureScenarios = {}, calls = [];
  const seed = () => {
    state = createCommunityState({ scenario, now: now() }); registry = createRouteRegistry();
    const appClients = createAppClientsFixture(scenario === 'empty' ? 'empty' : 'normal');
    const appAI = createAppAIFixture(), human = createAppHumanCheckFixture(), translation = createTranslationPolicyFixture();
    const glossary = createTranslationGlossaryFixture({ onSaved: () => translation.advanceCacheEpoch() });
    if (scenario !== 'empty') {
      const initial = glossary.respond(TRANSLATION_GLOSSARY_PATH, 'GET').data;
      glossary.respond(TRANSLATION_GLOSSARY_PATH, 'PUT', new URLSearchParams(), { revision: initial.revision, entries: [{ id: '00000000-0000-4000-8000-000000000101', chinese: ['合成术语', '合成别称'], english: ['Synthetic term', 'Synthetic alias'], note: '仅本地验收，不向外部模型发送。' }] });
    }
    const nbw = createNBWUpstreamFixture(), novels = createNovelFixture(), observation = createObservationFixture({ now: () => now() * 1000, scenario: scenario === 'empty' ? 'empty' : scenario === 'longlists' ? 'large' : 'normal' });
    const alipay = createAlipayPolicyFixture(scenario === 'empty' ? 'overview-empty' : 'normal', { now });
    factories = { appClients, appAI, human, translation, glossary, nbw, novels, observation, alipay };
    const options = { scenario: () => scenario, now, platform, appClients, photoURL: () => photo, alipay };
    registerCatalogRoutes(registry, state, options);
    registerCommunityRoutes(registry, state, options);
    registerVerificationRoutes(registry, state, options);
    registerSystemRoutes(registry, state, options);
    registerSponsorRoutes(registry, state, options);
    const { add } = registry;
    const delegated = factory => ctx => factory.respond(ctx.path, ctx.method, ctx.params, ctx.body);
    for (const suffix of ['stats', 'users']) add('app-clients', 'GET', `/api/admin/app-clients/${suffix}`, delegated(appClients));
    for (const suffix of ['policy', 'reminder', 'nbw-local-only']) for (const method of ['GET', 'PUT']) add('app-clients', method, `/api/admin/app-clients/${suffix}`, delegated(appClients));
    let nbwPolicy = copy(DEFAULT_NBW_V2_POLICY);
    for (const method of ['GET', 'PUT']) add('app-clients', method, '/api/admin/nbw/policy', ctx => {
      if (ctx.method === 'PUT') { try { nbwPolicy = nbwV2PolicyPayload(ctx.body); } catch { return fail(422, 'invalid_nbw_policy'); } }
      return ok(nbwPolicy);
    });
    for (const [factory, path] of [[appAI, APP_AI_PROVIDER_PATH], [human, APP_HUMAN_CHECK_POLICY_PATH], [translation, TRANSLATION_POLICY_PATH], [glossary, TRANSLATION_GLOSSARY_PATH], [nbw, NBW_UPSTREAM_HOST_PATH]]) for (const method of ['GET', 'PUT']) add('app-clients', method, path, delegated(factory));
    add('app-clients', 'POST', APP_AI_PROVIDER_TEST_PATH, delegated(appAI));
    const novelHandler = async ctx => {
      const result = await novels.respond(ctx.path, { method: ctx.method, params: ctx.params, body: ctx.body, operationId: ctx.operationId, actorId: ctx.actor.id });
      if (scenario === 'empty' && ctx.method === 'GET' && Array.isArray(result.data?.items)) return ok({ ...result.data, items: [], next_cursor: null });
      return result;
    };
    const novelRoot = '/api/admin/novels/rebuild';
    for (const path of ['/ai-policy', '/reviews', '/reviews/:id', '/reviews/:id/chapters/:chapterId', '/works', '/works/:id', '/works/:id/reviews', '/reports']) add('novels', 'GET', novelRoot + path, novelHandler);
    add('novels', 'PUT', novelRoot + '/ai-policy', novelHandler);
    for (const path of ['/reviews/:id/claim', '/reviews/:id/release', '/reviews/:id/decision', '/reviews/:id/ai', '/works/:id/action', '/reports/:id/decision', '/creators/:id/action']) add('novels', 'POST', novelRoot + path, novelHandler);
    const observationHandler = ctx => observation.respond(ctx.path, { method: ctx.method, params: ctx.params, body: ctx.body, actorId: isSuperAdmin(ctx.actor) ? 1 : 2, operationId: ctx.operationId });
    const observationRoot = '/api/admin/user-observation';
    for (const path of ['/policy', '/targets', '/targets/:id', '/targets/:id/days', '/targets/:id/ips', '/targets/:id/requests', '/legacy/:id']) add('security', 'GET', observationRoot + path, observationHandler, { superOnly: true });
    for (const path of ['/policy', '/targets/:id']) add('security', 'PUT', observationRoot + path, observationHandler, { superOnly: true });
    for (const path of ['/targets/:id/clear-day', '/targets/:id/export', '/targets/:id/export-authorization', '/legacy/:id/stop', '/legacy/:id/unban']) add('security', 'POST', observationRoot + path, observationHandler, { superOnly: true });
    calls = []; featureScenarios = {};
  };
  seed();
  const actor = () => state.users.find(user => user.id === ({ superadmin: 1, admin: 2, user: 3, loggedout: 0 })[role]) || null;
  const status = () => ({ platform, role, scenario, user: actor() ? copy(actor()) : null, scenarios: [...FIXTURE_SCENARIOS], roles: [...FIXTURE_ROLES], themes: [...FIXTURE_THEMES], featureScenarios: copy(featureScenarios), featureOptions: copy(FIXTURE_FEATURE_SCENARIOS), pages: copy(ADMIN_PAGE_DEFINITIONS.filter(page => platform === 'web' || page.module !== 'albumReports')), gaps: [...KNOWN_FIXTURE_GAPS], requests: copy(calls.slice(-80)), isolation: { memoryOnly: true, forwards: 0, apiBeforeVite: true, externalServices: false } });
  function setup(body = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['scenario', 'role', 'reset', 'feature', 'featureScenario', 'photoURL'].includes(key))) return fail(422, 'invalid_fixture_setup');
    if (body.scenario !== undefined && !FIXTURE_SCENARIOS.includes(body.scenario) || body.role !== undefined && !FIXTURE_ROLES.includes(body.role) || body.reset !== undefined && typeof body.reset !== 'boolean') return fail(422, 'invalid_fixture_setup');
    if (body.feature !== undefined && (!Object.hasOwn(FIXTURE_FEATURE_SCENARIOS, body.feature) || !FIXTURE_FEATURE_SCENARIOS[body.feature].includes(body.featureScenario))) return fail(422, 'invalid_feature_scenario');
    if (body.photoURL !== undefined && (typeof body.photoURL !== 'string' || !/^blob:http:\/\/(?:127\.0\.0\.1|localhost):\d+\/[0-9a-f-]{36}$/i.test(body.photoURL))) return fail(422, 'invalid_synthetic_photo');
    if (body.scenario !== undefined) scenario = body.scenario;
    if (body.role !== undefined) role = body.role;
    if (body.reset === true || body.scenario !== undefined) seed();
    if (body.photoURL !== undefined) photo = body.photoURL;
    if (body.feature) {
      const factory = factories[body.feature];
      if (body.feature === 'appClients' || body.feature === 'observation') factory.setScenario(body.featureScenario);
      else if (body.feature === 'novels') factory.configure({ scenario: body.featureScenario });
      else if (body.feature === 'alipay') factory.setup(body.featureScenario);
      else { const result = factory.control('POST', { scenario: body.featureScenario }); if (result.status !== 200) return result; }
      featureScenarios[body.feature] = body.featureScenario;
    }
    return ok(status());
  }
  async function respond(rawPath, { method = 'GET', body, headers = {} } = {}) {
    method = String(method).toUpperCase();
    let url; try { url = new URL(rawPath, 'http://127.0.0.1'); } catch { return fail(400, 'invalid_url'); }
    const path = url.pathname;
    if (path === '/__admin-ux/state' && method === 'GET') return ok(status());
    if (path === '/__admin-ux/setup' && method === 'POST') return setup(body);
    const authorization = headers.authorization || headers.Authorization;
    // 忽略 Cookie/JWT/生产凭据；只接受当前合成身份对应的明确 fixture token。
    let current = actor();
    if (authorization && authorization !== `Bearer fixture-${current?.id}`) current = null;
    if (path === '/api/auth/me' && method === 'GET') return current ? ok({ user: current }) : fail(401, 'unauthorized');
    if (path === '/api/auth/logout' && method === 'POST') { role = 'loggedout'; return ok({}); }
    if (path === '/api/nbw/endpoints' && method === 'GET') return ok({ schema_version: 1, revision: 'synthetic-discovery-1', mode: 'primary', api_origin: 'https://www.newbabyworld.top', authorize_origin: 'https://www.newbabyworld.top', public_origin: 'https://www.newbabyworld.top', media_origin: 'https://www.newbabyworld.top', ttl_seconds: 30, remote_mode: 'local_only' });
    let matched; try { matched = registry.match(path, method); } catch { return fail(400, 'invalid_path'); }
    if (!matched) { calls.push({ method, path, status: 404 }); return missing(); }
    const ctx = { path, method, params: url.searchParams, body, headers, actor: current, ids: matched.ids, operationId: headers['idempotency-key'] || headers['Idempotency-Key'] || '' };
    let result;
    if (!current) result = fail(401, 'unauthorized');
    else if (current.role !== 'admin' || matched.route.superOnly && !isSuperAdmin(current)) result = fail(403, 'forbidden');
    else if (scenario === '401' || scenario === '403') result = fail(Number(scenario), scenario === '401' ? 'unauthorized' : 'forbidden');
    else if (isWrite(method) && ['readonly', 'errorwrite', '409'].includes(scenario)) result = fail(scenario === 'readonly' ? 403 : scenario === '409' ? 409 : 503, scenario === 'readonly' ? 'fixture_readonly' : scenario === '409' ? 'revision_conflict' : 'synthetic_write_failure');
    else if (scenario === 'errorread' && !isWrite(method)) result = fail(503, 'synthetic_read_failure');
    else if (isWrite(method) && body !== undefined && body !== null && (typeof body !== 'object' || Array.isArray(body))) result = fail(422, 'invalid_request_object');
    else if (['POST', 'PUT', 'PATCH'].includes(method) && (body === undefined || body === null)) result = fail(400, 'body_required');
    else {
      try { result = await matched.route.handler(ctx); }
      catch { result = fail(422, 'invalid_fixture_request', '合成请求字段与既有契约不匹配；状态未确认为成功'); }
    }
    const snapshot = copy(result || missing());
    calls.push({ method, path, status: snapshot.status }); if (calls.length > 200) calls.shift();
    const delays = Object.values(factories).filter(factory => typeof factory.delay === 'function').map(factory => factory.delay(path, url.searchParams) || 0);
    const delay = Math.max(scenario === 'slow' ? 1800 : 0, snapshot.delay || 0, ...delays);
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    return snapshot;
  }
  return { respond, setup, status, routes: () => registry.routes.map(({ feature, method, template }) => ({ feature, method, template })), state: () => state };
}

// 独立可重用校验：不启动服务，只检查真实页面路由与入口读契约，失败由调用者处理。
export async function validateRouteCoverage(router, pages = ADMIN_PAGE_DEFINITIONS) {
  const result = [];
  for (const page of pages) {
    const endpoints = [];
    for (const path of page.reads) { const response = await router.respond(path); endpoints.push({ path, status: response.status }); }
    result.push({ path: page.path, module: page.module, covered: endpoints.every(endpoint => endpoint.status === 200), endpoints });
  }
  return { expected: pages.length, covered: result.filter(page => page.covered).length, pages: result };
}
