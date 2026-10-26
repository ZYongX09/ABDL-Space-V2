// 仅 Node 本地 fixture 使用：不持久化、不发外部请求，甚至不保存收到的假令牌，只记录是否配置。
import { randomUUID } from 'node:crypto';
import { APP_AI_PROVIDER_PATH, DEFAULT_APP_AI_HOSTS, DEFAULT_APP_AI_PROVIDER, providerOriginChangeRequiresToken, providerPayload } from './model.js';
export { APP_AI_PROVIDER_PATH } from './model.js';

export const APP_AI_FIXTURE_CONTROL_PATH = '/__fixture/app-ai';
export const APP_AI_FIXTURE_SCENARIOS = Object.freeze(['normal', 'unavailable', 'save-error', 'conflict', 'invalid', 'slow']);
const failure = (status, error) => ({ status, data: { error } });

export function createAppAIFixture() {
  let metadata = { ...DEFAULT_APP_AI_PROVIDER }, scenario = 'normal';
  const snapshot = () => ({ ...metadata });
  return {
    reset() { metadata = { ...DEFAULT_APP_AI_PROVIDER }; scenario = 'normal'; },
    delay(path) { return path === APP_AI_PROVIDER_PATH && scenario === 'slow' ? 1500 : 0; },
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
      if (path !== APP_AI_PROVIDER_PATH) return failure(404, '本地 AI fixture 未定义此接口');
      if (query.size) return failure(400, '本地 AI 接口不接受查询参数');
      if (!['GET', 'PUT'].includes(method)) return failure(405, 'App AI 配置仅支持 GET/PUT');
      if (scenario === 'unavailable') return failure(503, '本地模拟：App AI 配置服务暂不可用');
      if (method === 'GET') {
        if (scenario === 'invalid') return { status: 200, data: { base_url: metadata.base_url, model_id: metadata.model_id, revision: metadata.revision } };
        return { status: 200, data: snapshot() };
      }
      let payload;
      try { payload = providerPayload(body); } catch { return failure(400, '本地模拟：App AI 请求字段无效'); }
      if (!DEFAULT_APP_AI_HOSTS.includes(new URL(payload.base_url).hostname)) return failure(400, '本地模拟：主机未获服务器环境批准');
      if (providerOriginChangeRequiresToken(metadata, payload)) return { status: 422, data: { error: '更换接口来源需替换或清除令牌', code: 'token_replace_required' } };
      if (scenario === 'save-error') return failure(503, '本地模拟：App AI 保存失败，配置未改变');
      if (scenario === 'conflict') {
        metadata = { ...metadata, revision: randomUUID() };
        scenario = 'normal';
        return failure(409, '本地模拟：配置已被另一管理员更新，请重新加载');
      }
      if (payload.revision !== metadata.revision) return failure(409, '本地模拟：配置版本冲突，请重新加载');
      metadata = { base_url: payload.base_url, model_id: payload.model_id, token_configured: payload.token_action === 'keep' ? metadata.token_configured : payload.token_action === 'replace', revision: randomUUID() };
      // payload.api_token 不存储、不返回；这里只模拟配置状态，不验证真实供应商令牌。
      return { status: 200, data: snapshot() };
    },
  };
}
