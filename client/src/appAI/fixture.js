// 仅 Node 本地 fixture 使用：不持久化、不发外部请求，甚至不保存收到的假令牌，只记录是否配置。
import { randomUUID } from 'node:crypto';
import { APP_AI_PROTOCOL, APP_AI_PROVIDER_PATH, APP_AI_PROVIDER_TEST_PATH, APP_AI_TEST_RESULT_TEXT, DEFAULT_APP_AI_PROVIDER, providerOriginChangeRequiresToken, providerPayload } from './model.js';
export { APP_AI_PROVIDER_PATH, APP_AI_PROVIDER_TEST_PATH } from './model.js';

export const APP_AI_FIXTURE_CONTROL_PATH = '/__fixture/app-ai';
export const APP_AI_FIXTURE_SCENARIOS = Object.freeze(['normal', 'unavailable', 'save-error', 'conflict', 'invalid', 'slow', 'test-error', 'test-timeout', 'test-rate-limited', 'test-invalid', 'test-slow']);
const failure = (status, error, code) => ({ status, data: { error, ...(code ? { code } : {}) } });

export function createAppAIFixture() {
  let metadata = { ...DEFAULT_APP_AI_PROVIDER }, scenario = 'normal';
  const snapshot = () => ({ ...metadata });
  return {
    reset() { metadata = { ...DEFAULT_APP_AI_PROVIDER }; scenario = 'normal'; },
    delay(path) { return ([APP_AI_PROVIDER_PATH, APP_AI_PROVIDER_TEST_PATH].includes(path) && scenario === 'slow') || (path === APP_AI_PROVIDER_TEST_PATH && scenario === 'test-slow') ? 1500 : 0; },
    control(method, body) {
      if (!['GET', 'POST'].includes(method)) return failure(405, '本地 AI 控制仅支持读取或 POST');
      if (method === 'POST') {
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['reset', 'scenario'].includes(key))
          || (Object.hasOwn(body, 'reset') && body.reset !== true) || (Object.hasOwn(body, 'scenario') && !APP_AI_FIXTURE_SCENARIOS.includes(body.scenario))) return failure(400, '无效本地 AI 控制参数');
        if (body.reset === true) { metadata = { ...DEFAULT_APP_AI_PROVIDER }; scenario = 'normal'; }
        if (Object.hasOwn(body, 'scenario')) scenario = body.scenario;
      }
      return { status: 200, data: { scenario, scenarios: [...APP_AI_FIXTURE_SCENARIOS], metadata: snapshot() } };
    },
    respond(path, method, query = new URLSearchParams(), body = null) {
      const testing = path === APP_AI_PROVIDER_TEST_PATH;
      if (path !== APP_AI_PROVIDER_PATH && !testing) return failure(404, '本地 AI fixture 未定义此接口');
      if (query.size) return failure(400, '本地 AI 接口不接受查询参数');
      if (!(testing ? ['POST'] : ['GET', 'PUT']).includes(method)) return failure(405, testing ? 'App AI 草稿测试仅支持 POST' : 'App AI 配置仅支持 GET/PUT');
      if (scenario === 'unavailable') return failure(503, '本地模拟：App AI 配置服务暂不可用', 'storage_unavailable');
      if (method === 'GET') {
        if (scenario === 'invalid') return { status: 200, data: { base_url: metadata.base_url, model_id: metadata.model_id, revision: metadata.revision } };
        return { status: 200, data: snapshot() };
      }
      let payload;
      try { payload = providerPayload(body); } catch { return failure(422, '本地模拟：App AI 请求字段无效', 'invalid_request'); }
      if (providerOriginChangeRequiresToken(metadata, payload)) return failure(422, '更换接口来源需替换或清除令牌', 'token_replace_required');
      if (!testing && scenario === 'save-error') return failure(503, '本地模拟：App AI 保存失败，配置未改变');
      if (scenario === 'conflict') {
        if (!testing) { metadata = { ...metadata, revision: randomUUID() }; scenario = 'normal'; }
        return failure(409, '本地模拟：配置已被另一管理员更新，请重新加载', 'revision_conflict');
      }
      if (payload.revision !== metadata.revision) return failure(409, '本地模拟：配置版本冲突，请重新加载', 'revision_conflict');
      if (testing) {
        if (payload.token_action === 'clear' || (payload.token_action === 'keep' && !metadata.token_configured)) return failure(422, '本地模拟：没有可用令牌', 'missing_token');
        if (scenario === 'test-error') return failure(502, '本地模拟：接口请求失败', 'http');
        if (scenario === 'test-timeout') return failure(502, '本地模拟：接口请求超时', 'timeout');
        if (scenario === 'test-rate-limited') return failure(429, '本地模拟：测试请求过于频繁', 'rate_limited');
        if (scenario === 'test-invalid') return { status: 200, data: { success: true } };
        // 不保存草稿/版本/假令牌，不记录 payload，不返回上游任意正文。
        return { status: 200, data: { success: true, protocol: APP_AI_PROTOCOL, model_id: payload.model_id, latency_ms: 12, result_text: APP_AI_TEST_RESULT_TEXT } };
      }
      metadata = { base_url: payload.base_url, model_id: payload.model_id, token_configured: payload.token_action === 'keep' ? metadata.token_configured : payload.token_action === 'replace', revision: randomUUID() };
      // payload.api_token 不存储、不返回；这里只模拟配置状态，不验证真实供应商令牌。
      return { status: 200, data: snapshot() };
    },
  };
}
