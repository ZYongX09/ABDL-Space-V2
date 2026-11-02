// 仅本地 Node fixture：策略保存在内存，不访问真实后端、模型或密钥。
import { randomUUID } from 'node:crypto';
import { DEFAULT_TRANSLATION_POLICY, TRANSLATION_POLICY_PATH, TRANSLATION_TIMEZONE, translationPolicyPayload } from './model.js';
export { TRANSLATION_POLICY_PATH } from './model.js';
export const TRANSLATION_POLICY_FIXTURE_CONTROL_PATH = '/__fixture/translation-policy';
export const TRANSLATION_POLICY_FIXTURE_SCENARIOS = Object.freeze(['normal', 'unavailable', 'save-error', 'conflict', 'invalid', 'invalid-save', 'slow']);
const failure = (status, error) => ({ status, data: { error } });

export function createTranslationPolicyFixture() {
  let metadata = { ...DEFAULT_TRANSLATION_POLICY }, scenario = 'normal';
  const snapshot = () => ({ ...metadata });
  return {
    delay(path) { return path === TRANSLATION_POLICY_PATH && scenario === 'slow' ? 1500 : 0; },
    control(method, body) {
      if (!['GET', 'POST'].includes(method)) return failure(405, '本地翻译策略控制只支持 GET/POST');
      if (method === 'POST') {
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['reset', 'scenario'].includes(key))
          || Object.hasOwn(body, 'reset') && body.reset !== true || Object.hasOwn(body, 'scenario') && !TRANSLATION_POLICY_FIXTURE_SCENARIOS.includes(body.scenario)) return failure(400, '无效本地翻译策略控制参数');
        if (body.reset) { metadata = { ...DEFAULT_TRANSLATION_POLICY }; scenario = 'normal'; }
        if (Object.hasOwn(body, 'scenario')) scenario = body.scenario;
      }
      return { status: 200, data: { scenario, scenarios: [...TRANSLATION_POLICY_FIXTURE_SCENARIOS], metadata: snapshot() } };
    },
    respond(path, method, query = new URLSearchParams(), input = null) {
      if (path !== TRANSLATION_POLICY_PATH) return failure(404, '本地翻译策略 fixture 未定义此接口');
      if (query.size) return failure(400, '翻译策略接口不接受查询参数');
      if (!['GET', 'PUT'].includes(method)) return failure(405, '翻译策略只支持 GET/PUT');
      if (scenario === 'unavailable') return failure(503, '本地模拟：翻译策略不可用');
      if (method === 'GET') return { status: 200, data: scenario === 'invalid' ? { enabled: metadata.enabled } : snapshot() };
      let payload;
      try { payload = translationPolicyPayload(input); } catch { return failure(422, '本地模拟：翻译策略字段无效'); }
      if (scenario === 'save-error') return failure(503, '本地模拟：翻译策略保存失败');
      if (scenario === 'conflict') {
        metadata = { ...metadata, revision: randomUUID() }; scenario = 'normal';
        return failure(409, '本地模拟：翻译策略已被其他管理员更新');
      }
      if (payload.revision !== metadata.revision) return failure(409, '本地模拟：翻译策略版本冲突');
      metadata = { ...payload, revision: randomUUID(), timezone: TRANSLATION_TIMEZONE };
      return { status: 200, data: scenario === 'invalid-save' ? { enabled: metadata.enabled } : snapshot() };
    },
  };
}
