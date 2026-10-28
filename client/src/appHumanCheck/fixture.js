// 仅本地 Node fixture：元数据在内存，绝不配置真实 widget、发送邮件或出站。
import { randomUUID } from 'node:crypto';
import { APP_HUMAN_CHECK_POLICY_PATH, DEFAULT_APP_HUMAN_POLICY, humanPolicyPayload } from './model.js';
export { APP_HUMAN_CHECK_POLICY_PATH } from './model.js';
export const APP_HUMAN_CHECK_FIXTURE_CONTROL_PATH = '/__fixture/app-human-check';
export const HUMAN_POLICY_FIXTURE_SCENARIOS = Object.freeze(['normal', 'unavailable', 'save-error', 'conflict', 'invalid', 'slow', 'configured']);
const failure = (status, error) => ({ status, data: { error } });

export function createAppHumanCheckFixture() {
  let metadata = { ...DEFAULT_APP_HUMAN_POLICY }, scenario = 'normal';
  const snapshot = () => ({ ...metadata });
  return {
    delay(path) { return path === APP_HUMAN_CHECK_POLICY_PATH && scenario === 'slow' ? 1500 : 0; },
    control(method, body) {
      if (!['GET', 'POST'].includes(method)) return failure(405, '本地策略控制只支持 GET/POST');
      if (method === 'POST') {
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['reset', 'scenario'].includes(key))
          || Object.hasOwn(body, 'reset') && body.reset !== true || Object.hasOwn(body, 'scenario') && !HUMAN_POLICY_FIXTURE_SCENARIOS.includes(body.scenario)) return failure(400, '无效本地策略控制参数');
        if (body.reset) { metadata = { ...DEFAULT_APP_HUMAN_POLICY }; scenario = 'normal'; }
        if (Object.hasOwn(body, 'scenario')) scenario = body.scenario;
        if (scenario === 'configured') metadata = { ...metadata, turnstile_configured: true };
      }
      return { status: 200, data: { scenario, scenarios: [...HUMAN_POLICY_FIXTURE_SCENARIOS], metadata: snapshot() } };
    },
    respond(path, method, query = new URLSearchParams(), input = null) {
      if (path !== APP_HUMAN_CHECK_POLICY_PATH) return failure(404, '本地策略 fixture 未定义此接口');
      if (query.size) return failure(400, '策略接口不接受查询参数');
      if (!['GET', 'PUT'].includes(method)) return failure(405, '策略只支持 GET/PUT');
      if (scenario === 'unavailable') return failure(503, '本地模拟：策略不可用');
      if (method === 'GET') return { status: 200, data: scenario === 'invalid' ? { mode: metadata.mode } : snapshot() };
      let payload;
      try { payload = humanPolicyPayload(input); } catch { return failure(422, '本地模拟：策略字段无效'); }
      if (scenario === 'save-error') return failure(503, '本地模拟：保存失败');
      if (scenario === 'conflict') {
        metadata = { ...metadata, revision: randomUUID() }; scenario = 'normal';
        return failure(409, '本地模拟：策略已被其他管理员更新');
      }
      if (payload.revision !== metadata.revision) return failure(409, '本地模拟：版本冲突');
      metadata = { ...payload, revision: randomUUID(), turnstile_configured: metadata.turnstile_configured };
      return { status: 200, data: snapshot() };
    },
  };
}
