// 仅本地 Node fixture：上游域名在内存中于两个固定域名间切换，绝不发起真实 NBW 出站调用或记录请求体。
import { NBW_BACKUP_HOST, NBW_PRIMARY_HOST, NBW_UPSTREAM_HOST_PATH, DEFAULT_NBW_UPSTREAM, nbwUpstreamPayload } from './model.js';
export { NBW_UPSTREAM_HOST_PATH } from './model.js';

export const NBW_UPSTREAM_FIXTURE_CONTROL_PATH = '/__fixture/nbw-upstream';
export const NBW_UPSTREAM_FIXTURE_SCENARIOS = Object.freeze(['normal', 'unavailable', 'save-error', 'slow', 'invalid']);
const failure = (status, error) => ({ status, data: { error } });

export function createNBWUpstreamFixture() {
  let metadata = { ...DEFAULT_NBW_UPSTREAM }, scenario = 'normal';
  const snapshot = () => ({ ...metadata });
  return {
    delay(path) { return path === NBW_UPSTREAM_HOST_PATH && scenario === 'slow' ? 1500 : 0; },
    control(method, body) {
      if (!['GET', 'POST'].includes(method)) return failure(405, '本地上游域名控制只支持 GET/POST');
      if (method === 'POST') {
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['reset', 'scenario'].includes(key))
          || (Object.hasOwn(body, 'reset') && body.reset !== true) || (Object.hasOwn(body, 'scenario') && !NBW_UPSTREAM_FIXTURE_SCENARIOS.includes(body.scenario))) return failure(400, '无效本地上游域名控制参数');
        if (body.reset === true) { metadata = { ...DEFAULT_NBW_UPSTREAM }; scenario = 'normal'; }
        if (Object.hasOwn(body, 'scenario')) scenario = body.scenario;
      }
      return { status: 200, data: { scenario, scenarios: [...NBW_UPSTREAM_FIXTURE_SCENARIOS], metadata: snapshot() } };
    },
    respond(path, method, query = new URLSearchParams(), body = null) {
      if (path !== NBW_UPSTREAM_HOST_PATH) return failure(404, '本地上游域名 fixture 未定义此接口');
      if (query.size) return failure(400, '上游域名接口不接受查询参数');
      if (!['GET', 'PUT'].includes(method)) return failure(405, '上游域名只支持 GET/PUT');
      if (scenario === 'unavailable') return failure(503, '本地模拟：上游域名服务暂不可用');
      if (method === 'GET') return { status: 200, data: scenario === 'invalid' ? { mode: metadata.mode } : snapshot() };
      if (!body || typeof body !== 'object' || Array.isArray(body) || Reflect.ownKeys(body).length !== 1 || !Object.hasOwn(body, 'mode')) return failure(422, '本地模拟：上游域名请求无效');
      let mode;
      try { ({ mode } = nbwUpstreamPayload(body.mode)); } catch { return failure(422, '本地模拟：上游域名请求无效'); }
      if (scenario === 'save-error') return failure(503, '本地模拟：上游域名保存失败');
      metadata = { mode, host: mode === 'primary' ? NBW_PRIMARY_HOST : NBW_BACKUP_HOST, primary_host: NBW_PRIMARY_HOST, backup_host: NBW_BACKUP_HOST };
      return { status: 200, data: snapshot() };
    },
  };
}
