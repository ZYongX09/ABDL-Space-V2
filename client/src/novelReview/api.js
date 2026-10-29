import { NOVEL_ADMIN_ROOT, REVIEW_STATUSES, identifier, readBody, readPage, readReport, readReview, readWork, validateNovelReason } from './model.js';

const invalid = message => Object.assign(new Error(message), { code: 'INVALID_RESPONSE' });
const segment = value => encodeURIComponent(identifier(String(value)));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// 复用现有 apiFetch 的 cookie/Bearer 身份；不引入离线模拟、缓存、自动重试或独立 AI provider。
export function createNovelReviewAPI(request, { createId = () => crypto.randomUUID(), timeoutMs = 45000 } = {}) {
  const query = params => {
    const values = new URLSearchParams();
    for (const key of ['status', 'query', 'cursor', 'limit']) if (params?.[key] != null && params[key] !== '') values.set(key, String(params[key]));
    return values.size ? `?${values}` : '';
  };
  async function invoke(path, { signal, operationId, body } = {}, parser = value => value) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    let timer, timedOut = false;
    const headers = { Accept: 'application/json' };
    if (body !== undefined) {
      const key = operationId || createId();
      if (!uuid.test(key)) throw invalid('操作幂等键格式无效。');
      headers['Content-Type'] = 'application/json';
      headers['Idempotency-Key'] = key;
    }
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    const abort = () => { controller.abort(); rejectAbort(Object.assign(new Error('请求已取消。'), { name: 'AbortError' })); };
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; controller.abort(); reject(Object.assign(new Error('小说审核请求超时。'), { code: 'TIMEOUT' })); }, timeoutMs); });
    try {
      const data = await Promise.race([request(`${NOVEL_ADMIN_ROOT}${path}`, { method: body === undefined ? 'GET' : 'POST', headers, cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }), timeout, aborted]);
      signal?.throwIfAborted();
      return parser(data);
    } catch (error) {
      if (timedOut) throw Object.assign(new Error('小说审核请求超时。'), { code: 'TIMEOUT' });
      throw error;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  const success = value => { if (value?.success !== true) throw invalid('服务器未确认治理操作完成。'); return value; };
  const fullReview = value => readReview(value, true);
  const govern = (path, body, options, field, actions) => {
    if (!actions.includes(body?.[field])) return Promise.reject(invalid('治理操作无效。'));
    let reason;
    try { reason = validateNovelReason(body.reason); } catch (error) { return Promise.reject(error); }
    return invoke(path, { ...options, body: { [field]: body[field], reason } }, success);
  };
  return {
    listReviews: (params = {}, options) => {
      if (!REVIEW_STATUSES.includes(params.status ?? 'pending')) return Promise.reject(invalid('审核筛选状态无效。'));
      return invoke(`/reviews${query({ ...params, status: params.status ?? 'pending' })}`, options, value => readPage(value, readReview));
    },
    review: (id, options) => invoke(`/reviews/${segment(id)}`, options, fullReview),
    chapter: (id, chapterId, options) => invoke(`/reviews/${segment(id)}/chapters/${segment(chapterId)}`, options),
    // 用于独立消费者加载正文时显式绑定目录版本，不允许退化成截断预览。
    chapterBody: async (id, chapter, options) => readBody(await invoke(`/reviews/${segment(id)}/chapters/${segment(chapter.id)}`, options), chapter),
    claim: (id, options) => invoke(`/reviews/${segment(id)}/claim`, { ...options, body: {} }, fullReview),
    release: (id, options) => invoke(`/reviews/${segment(id)}/release`, { ...options, body: {} }, fullReview),
    decide: (id, body, options) => {
      if (!['approve', 'reject'].includes(body?.decision) || !Number.isSafeInteger(body.version) || body.version < 1) return Promise.reject(invalid('人工决定需要明确理由及当前审核版本。'));
      let reason;
      try { reason = validateNovelReason(body.reason); } catch (error) { return Promise.reject(error); }
      return invoke(`/reviews/${segment(id)}/decision`, { ...options, body: { decision: body.decision, reason, version: body.version } }, value => {
        const review = fullReview(value?.review);
        if (value.work !== null && value.work !== undefined) readWork(value.work);
        return { ...value, review };
      });
    },
    ai: (id, body, options) => {
      if (typeof body?.chapter_id !== 'string' || !Number.isSafeInteger(body?.offset) || body.offset < 0) return Promise.reject(invalid('AI 检查需要章节与有效分块偏移。'));
      return invoke(`/reviews/${segment(id)}/ai`, { ...options, body: { chapter_id: body.chapter_id, offset: body.offset } });
    },
    works: (params, options) => invoke(`/works${query(params)}`, options, value => readPage(value, readWork)),
    work: (id, options) => invoke(`/works/${segment(id)}`, options, value => {
      if (!Array.isArray(value?.chapters) || !Array.isArray(value?.reviews)) throw invalid('服务端没有返回完整作品目录与审核版本历史。');
      if (value.reviews_next_cursor != null && typeof value.reviews_next_cursor !== 'string') throw invalid('作品审核历史游标无效。');
      return { ...readWork(value), reviews: value.reviews.map(fullReview), reviews_next_cursor: value.reviews_next_cursor ?? null };
    }),
    workReviews: (id, params, options) => invoke(`/works/${segment(id)}/reviews${query(params)}`, options, value => readPage(value, fullReview)),
    workAction: (id, body, options) => govern(`/works/${segment(id)}/action`, body, options, 'action', ['withdraw', 'restore']),
    reports: (params, options) => invoke(`/reports${query(params)}`, options, value => readPage(value, readReport)),
    reportDecision: (id, body, options) => govern(`/reports/${segment(id)}/decision`, body, options, 'decision', ['dismiss', 'withdraw']),
    creatorAction: (id, body, options) => govern(`/creators/${segment(id)}/action`, body, options, 'action', ['suspend', 'restore']),
  };
}
