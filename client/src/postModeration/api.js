import { ROOT, caseId, postId, readCaseEnvelope, readSnapshot, readTarget, sourceRevision, validateReason } from './model.js';

const MESSAGES = { 401: '登录已失效，敏感留证显示已清空，请重新验证身份', 403: '当前会话无权访问，敏感留证显示已清空', 404: '帖子、案件或留证不存在，请重新核对', 409: '源内容或案件状态已变化；理由已保留，请重新读取后核对', 503: '处理服务暂不可用；未确认写入结果，请查询回执' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function boundedBytes(response, max) {
  if (Number(response.headers.get('Content-Length')) > max) throw new Error('留证响应过大，未展示不完整内容');
  if (!response.body?.getReader) {
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length > max) throw new Error('留证响应过大，未展示不完整内容');
    return data;
  }
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new Error('留证响应过大，未展示不完整内容'); } chunks.push(value); }
    const data = new Uint8Array(size); let offset = 0;
    for (const value of chunks) { data.set(value, offset); offset += value.byteLength; }
    return data;
  } finally { reader.releaseLock(); }
}

/** 使用同一 API 根与 cookie/Bearer；不经过公共帖子缓存、离线数据或自动写入重试。 */
export function createPostModerationAPI({ base = '', enabled = true, fetcher = (...args) => fetch(...args), getSession = () => ({}), isCurrent = () => true, onRejected = () => {}, timeoutMs = 30000 } = {}) {
  if (typeof base !== 'string' || base && !/^https?:\/\//.test(base)) throw new Error('管理 API 地址无效');
  const origin = base.replace(/\/$/, '');
  async function request(path, { method = 'GET', body, operationId, signal, binary = false } = {}, parse = value => value) {
    const session = getSession();
    const current = () => {
      signal?.throwIfAborted();
      const next = getSession();
      if (!isCurrent() || next?.user?.role !== 'admin' || String(next?.user?.id) !== String(session?.user?.id) || next?.token !== session?.token) throw new DOMException('管理员会话已变化', 'AbortError');
    };
    if (!enabled) throw new Error('违规处理必须连接服务端，不提供离线成功回执');
    if (session?.user?.role !== 'admin') throw Object.assign(new Error(MESSAGES[403]), { status: 403 });
    current();
    const headers = { Accept: binary ? 'image/*' : 'application/json' };
    if (session.token) headers.Authorization = `Bearer ${session.token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (operationId !== undefined) { if (!uuid.test(operationId)) throw new Error('缺少有效 UUID 幂等键，未发送请求'); headers['Idempotency-Key'] = operationId; }
    const controller = new AbortController(); let timer;
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    const cancel = () => { controller.abort(); rejectAbort(new DOMException('请求已取消；取消不代表撤销服务端写入', 'AbortError')); };
    signal?.addEventListener('abort', cancel, { once: true });
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('请求超时；未确认写入结果，请查询回执，不要重复处理')); }, timeoutMs); });
    try {
      const work = async () => {
        const response = await fetcher(`${origin}${ROOT}${path}`, { method, headers, credentials: 'include', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        current();
        if (response.status === 401 || response.status === 403) {
          const error = Object.assign(new Error(MESSAGES[response.status]), { status: response.status });
          onRejected(error); throw error;
        }
        if (!response.ok) throw Object.assign(new Error(MESSAGES[response.status] || `违规处理请求失败（${response.status}）；请重新核对状态`), { status: response.status });
        if (binary) {
          const type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
          if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(type)) throw new Error('缩略图格式异常，未展示');
          const bytes = await boundedBytes(response, 12 * 1024 * 1024); current();
          if (!bytes.length) throw new Error('缩略图为空，未展示');
          return new Blob([bytes], { type });
        }
        let data;
        try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBytes(response, 8 * 1024 * 1024))); }
        catch { throw new Error('服务端未返回完整有效 JSON；未确认写入结果，请查询回执'); }
        current(); return parse(data);
      };
      return await Promise.race([work(), timeout, aborted]);
    } catch (error) {
      if (error instanceof TypeError) throw new Error('网络不可用；未确认写入结果，请查询回执');
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }
  return {
    target: (id, options) => request(`/posts/${postId(id)}/moderation`, options, data => readTarget(data, id)),
    create: (id, input, options = {}) => {
      const body = { reason: validateReason(input?.reason), source_revision: sourceRevision(input?.source_revision) };
      if (!uuid.test(options.operationId || '')) throw new Error('缺少有效 UUID 幂等键，未发送请求');
      return request(`/posts/${postId(id)}/moderation`, { ...options, method: 'POST', body }, data => { const result = readTarget(data, id); if (!result.moderation) throw new Error('服务端尚未确认案件，必须查询回执'); return result; });
    },
    detail: (id, expectedPostId, options) => request(`/post-moderations/${caseId(id)}`, options, data => readCaseEnvelope(data, id, expectedPostId)),
    snapshot: (id, options) => request(`/post-moderations/${caseId(id)}/snapshot`, options, data => readSnapshot(data, id)),
    thumbnail: (id, assetId, options) => request(`/post-moderations/${caseId(id)}/assets/${caseId(assetId)}/thumbnail`, { ...options, binary: true }),
    retry: (id, expectedPostId, options) => request(`/post-moderations/${caseId(id)}/retry`, { ...options, method: 'POST', body: {} }, data => readCaseEnvelope(data, id, expectedPostId)),
  };
}
