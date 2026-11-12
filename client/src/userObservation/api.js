import { isSuperAdmin } from '../pages/admin/access.js';
import { auditId, day, filters, integer, object, policyInput, readExport, readGeneration, readIP, readDay, readLegacy, readPage, readPolicy, readRequest, readStatus, readTarget, readTargetDetail, reason, reasonRevision, revision, readIPAddress, targetInput, text, TIMEZONE, userId } from './model.js';

export const ROOT = '/api/admin/user-observation';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const query = value => { const params = new URLSearchParams(); for (const [key, val] of Object.entries(value)) if (val != null && val !== '') params.set(key, String(val)); return params.size ? `?${params}` : ''; };
async function boundedJSON(response) {
  const max = 2 * 1024 * 1024;
  if (Number(response.headers.get('Content-Length')) > max) throw new Error('响应过大');
  if (!response.body?.getReader) { const value = await response.text(); if (new TextEncoder().encode(value).length > max) throw new Error('响应过大'); return JSON.parse(value); }
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > max) { await reader.cancel(); throw new Error('响应过大'); } chunks.push(value); }
    const buffer = new Uint8Array(bytes); let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  } finally { reader.releaseLock(); }
}
const errorMessages = { 401: '登录已过期，敏感数据已清空', 403: '当前会话无权执行此操作，敏感数据已清空', 404: '目标或功能不存在，请核对用户 ID 与服务端部署', 409: '服务端版本或状态已变化；表单已保留，请重新读取后再确认', 503: '观察服务暂不可用；未确认任何操作成功，请稍后重读' };

/** 专用直连：不经过公共 API 缓存，不使用离线数据，不把未知响应字段传给 UI/复制。 */
export function createUserObservationAPI({ base = '', fetcher = (...args) => fetch(...args), getSession = () => ({}), isCurrent = () => true, enabled = true, timeoutMs = 30000, now = Date.now } = {}) {
  if (typeof base !== 'string' || base && !/^https?:\/\//.test(base)) throw new Error('观察 API 地址无效');
  const origin = base.replace(/\/$/, '');
  async function request(path, method, body, reader, options = {}) {
    const session = getSession();
    const current = () => { options.signal?.throwIfAborted(); if (!isCurrent() || !isSuperAdmin(getSession()?.user) || getSession()?.token !== session.token || String(getSession()?.user?.id) !== String(session.user?.id)) throw new DOMException('会话已变化', 'AbortError'); };
    if (!enabled) throw new Error('定向观察需要连接服务端，不提供离线替代数据');
    if (!isSuperAdmin(session.user)) throw Object.assign(new Error('仅超级管理员可读取或操作定向观察'), { status: 403 });
    current();
    const headers = { Accept: 'application/json' };
    if (session.token) headers.Authorization = `Bearer ${session.token}`;
    if (method !== 'GET') {
      if (!uuid(options.operationId)) throw new Error('写入缺少有效操作标识，未发送请求');
      headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] = options.operationId;
    }
    const abort = new AbortController();
    const cancel = () => abort.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs);
    try {
      const response = await fetcher(`${origin}${ROOT}${path}`, { method, headers, credentials: 'include', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: abort.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      current();
      // 401/403 即使不是 JSON 也必须撤销当前敏感会话。
      if (response.status === 401 || response.status === 403) throw Object.assign(new Error(errorMessages[response.status]), { status: response.status });
      let data;
      try { data = await boundedJSON(response); } catch { throw Object.assign(new Error('服务端响应无法解析；未确认操作成功，请重新读取'), { status: response.status }); }
      current();
      if (!response.ok) throw Object.assign(new Error(errorMessages[response.status] || `观察请求失败（${response.status}），未确认操作成功`), { status: response.status, code: typeof data?.code === 'string' ? text(data.code, 100) : '' });
      return reader(data);
    } catch (error) {
      current();
      if (abort.signal.aborted && !options.signal?.aborted) throw new Error('观察请求超时；写入可能已受理，请先重新读取，不要改换操作标识盲目重试');
      if (error instanceof TypeError) throw new Error('观察服务网络不可用；未确认操作成功，请重新读取');
      throw error;
    } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); }
  }
  const targetPath = id => `/targets/${userId(id)}`;
  const paged = (path, input, reader, opts, config) => request(`${path}${query(filters(input, config))}`, 'GET', undefined, data => readPage(data, reader, 200, config?.withTimezone !== false, config?.withGeneration === true), opts);
  return {
    policy: options => request('/policy', 'GET', undefined, data => { object(data); if (data.timezone !== TIMEZONE || typeof data.schema_available !== 'boolean') throw new Error('观察策略响应格式异常'); return { policy: readPolicy(data), timezone: TIMEZONE, schema_available: data.schema_available }; }, options),
    savePolicy: (input, options) => request('/policy', 'PUT', policyInput(input), data => ({ policy: readPolicy(data), audit_id: auditId(data) }), options),
    targets: (input = {}, options) => paged('/targets', input, value => ({ ...readTarget(value), status: readStatus(value.status) }), options, { requireDay: false, allowDay: false, requests: false, withTimezone: false }),
    target: (id, options) => request(targetPath(id), 'GET', undefined, readTargetDetail, options),
    saveTarget: (id, input, options) => request(targetPath(id), 'PUT', targetInput(input, now()), data => ({ target: readTarget(object(data).target), status: readStatus(data.status), audit_id: auditId(data) }), options),
    days: (id, input = {}, options) => paged(`${targetPath(id)}/days`, input, readDay, options, { requireDay: false, allowDay: false, requests: false }),
    ips: (id, input = {}, options) => paged(`${targetPath(id)}/ips`, input, readIP, options, { requireDay: false, requests: false, withGeneration: true }),
    requests: (id, input, options) => paged(`${targetPath(id)}/requests`, input, readRequest, options, { withGeneration: true }),
    clearDay: (id, input, options) => request(`${targetPath(id)}/clear-day`, 'POST', { day: day(input?.day), ...reasonRevision(input) }, data => ({ deleted_requests: integer(data.deleted_requests, 0, Number.MAX_SAFE_INTEGER), deleted_ips: integer(data.deleted_ips, 0, Number.MAX_SAFE_INTEGER), revision: revision(data.revision), audit_id: auditId(data) }), options),
    exportDay: (id, input, options) => request(`${targetPath(id)}/export`, 'POST', { ...filters(input), reason: reason(input?.reason) }, readExport, options),
    authorizeExport: (id, input, options) => {
      if (input?.scope !== 'current_page') throw new Error('仅允许当前页复制授权');
      return request(`${targetPath(id)}/export-authorization`, 'POST', { day: day(input.day), scope: 'current_page', reason: reason(input.reason), count: integer(input.count, 0, 200), generation: readGeneration(input.generation) }, data => ({ audit_id: auditId(data) }), options);
    },
    legacy: (id, options) => request(`/legacy/${userId(id)}`, 'GET', undefined, readLegacy, options),
    stopLegacy: (id, input, options) => request(`/legacy/${userId(id)}/stop`, 'POST', reasonRevision(input), data => { if (data.tracking !== false) throw new Error('服务端未确认停止旧追踪'); return { tracking: false, rule_revision: revision(data.rule_revision), audit_id: auditId(data) }; }, options),
    unbanLegacy: (id, input, options) => {
      if (!Array.isArray(input?.ips) || !input.ips.length || input.ips.length > 100) throw new Error('请明确选择 1–100 个已复核的旧机制封禁 IP');
      const ips = [...new Set(input.ips.map(readIPAddress))];
      return request(`/legacy/${userId(id)}/unban`, 'POST', { ips, ...reasonRevision(input) }, data => ({ deleted_bans: integer(data.deleted_bans, 0, 100), rule_revision: revision(data.rule_revision), audit_id: auditId(data) }), options);
    },
  };
}
