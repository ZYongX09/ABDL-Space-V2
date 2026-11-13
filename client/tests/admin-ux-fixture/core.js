// 仅供隔离验收宿主使用；不持久化、不导入生产入口、不执行网络请求。
export const copy = value => structuredClone(value);
export const ok = data => ({ status: 200, data: copy(data) });
export const fail = (status, code, error = '本地合成验收响应；未访问真实服务') => ({ status, data: { error, code } });
export const missing = () => fail(404, 'fixture_not_found', '隔离宿主未定义此接口；请求已在 Vite 前终止，绝不转发');
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const IMAGE = '/__admin-ux/image.svg';
export const iso = seconds => new Date(seconds * 1000).toISOString();
export const nonempty = value => typeof value === 'string' && value.trim().length > 0;
export const isWrite = method => !['GET', 'HEAD', 'OPTIONS'].includes(method);
export function bounded(value, fallback, max = 200) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? Math.min(max, number) : fallback;
}
export function paginate(rows, params, key = 'items', defaultLimit = 20) {
  const limit = Math.max(1, bounded(params.get('limit'), defaultLimit) || defaultLimit);
  const page = Math.max(1, bounded(params.get('page'), 1, 100000) || 1);
  const offset = params.has('offset') ? bounded(params.get('offset'), 0, 100000) : (page - 1) * limit;
  return { [key]: rows.slice(offset, offset + limit), total: rows.length, pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) } };
}
export function search(rows, params, fields) {
  const query = (params.get('q') || params.get('query') || '').trim().toLowerCase();
  return rows.filter(row => fields.map(field => String(row[field] ?? '')).join(' ').toLowerCase().includes(query));
}
export function createRouteRegistry() {
  const routes = [];
  function add(feature, method, template, handler, options = {}) {
    const names = [];
    const escaped = template.split('/').map(part => {
      if (part.startsWith(':')) { names.push(part.slice(1)); return '([^/]+)'; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }).join('/');
    routes.push({ feature, method, template, regex: new RegExp(`^${escaped}$`), names, handler, ...options });
  }
  function match(path, method) {
    for (const route of routes) {
      if (route.method !== method) continue;
      const match = route.regex.exec(path);
      if (match) return { route, ids: Object.fromEntries(route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])])) };
    }
    return null;
  }
  return { add, match, routes };
}
// 将幂等行为限制在本地内存；每个功能仍保留真实客户端的请求/响应结构。
export function createReceipts() {
  const receipts = new Map();
  return (key, signature, perform) => {
    if (!UUID.test(key || '')) return fail(422, 'idempotency_required', '操作需要合成 UUID');
    if (receipts.has(key)) {
      const prior = receipts.get(key);
      return prior.signature === signature ? copy(prior.result) : fail(409, 'idempotency_conflict');
    }
    const result = perform();
    if (result.status < 300) receipts.set(key, { signature, result: copy(result) });
    return result;
  };
}
export function routeSignature(ctx) {
  return JSON.stringify([ctx.method, ctx.path, ctx.actor?.id, ctx.body]);
}
export const rowsForScenario = (scenario, rows) => scenario === 'empty' ? [] : rows;
