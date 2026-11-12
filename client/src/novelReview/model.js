import { createDecisionOperationStore } from '../babyVerification/model.js';

export const REVIEW_STATUSES = Object.freeze(['pending', 'reviewing', 'approved', 'rejected']);
export const AUTO_REVIEW_STATUSES = Object.freeze(['queued', 'running', 'needs_human', 'passed', 'cancelled']);
export const AUTO_REVIEW_FILTERS = Object.freeze(['all', 'needs_human', 'queued', 'running']);
export const NOVEL_AI_LIMITS = Object.freeze({ daily_call_limit: 10000, job_call_limit: 2048 });
export const AUTO_REVIEW_TEXT_MAX = 1000;
export const AUTO_REVIEW_FINDINGS_MAX = 256;
export const NOVEL_ADMIN_ROOT = '/api/admin/novels/rebuild';
export const NOVEL_REASON_MAX = 2000;
export function validateNovelReason(value, { required = true } = {}) {
  if (value === undefined && !required) value = '';
  if (typeof value !== 'string' || (required && !value.trim())) throw Object.assign(new Error('操作理由不能为空或格式无效。'), { code: 'LOCAL_VALIDATION' });
  if (value.length > NOVEL_REASON_MAX || value.includes('\0')) throw Object.assign(new Error(`操作理由最多 ${NOVEL_REASON_MAX} 字，且不能含空字符。`), { code: 'LOCAL_VALIDATION' });
  return value.trim();
}
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = message => Object.assign(new Error(message || '小说审核响应不完整，请重新加载；未将该响应视为成功。'), { code: 'INVALID_RESPONSE' });
const string = (value, field, required = false) => {
  if (typeof value !== 'string' || (required && !value.trim())) throw invalid(`${field}格式无效，请重新加载。`);
  return value;
};
export const identifier = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 160) throw invalid('记录编号格式无效。');
  return value;
};
const integer = (value, field, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum) throw invalid(`${field}格式无效。`);
  return value;
};
const strings = (value, field) => {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) throw invalid(`${field}格式无效。`);
  return [...value];
};
const hash = value => {
  if (typeof value !== 'string' || !/^[a-f\d]{64}$/i.test(value)) throw invalid('章节内容校验值无效，请重新加载。');
  return value;
};
const boundedText = (value, field, max = AUTO_REVIEW_TEXT_MAX, required = false) => {
  const result = string(value, field, required);
  if (result.length > max || result.includes('\0')) throw invalid(`${field}过长或含空字符，请重新加载。`);
  return result;
};
const nullableText = (value, field, max) => value === null ? null : boundedText(value, field, max);
// 新 DTO 只读取已知字段；兼容服务端新增字段，但不把未校验字段带入摘要或策略表单。
export function readAutoReview(value) {
  if (value == null) return null;
  if (!record(value) || !AUTO_REVIEW_STATUSES.includes(value.status) || !Array.isArray(value.findings) || value.findings.length > AUTO_REVIEW_FINDINGS_MAX) throw invalid('自动审核摘要格式无效，请重新加载。');
  const completed = integer(value.completed_chunks, '自动审核已完成分块'), total = integer(value.total_chunks, '自动审核总分块');
  if (completed > total) throw invalid('自动审核分块进度无效。');
  return {
    status: value.status, policy_version: boundedText(value.policy_version, '自动审核策略版本', 160, true), completed_chunks: completed, total_chunks: total,
    reason: nullableText(value.reason, '自动审核原因'), failure_code: nullableText(value.failure_code, '自动审核失败代码', 160),
    findings: value.findings.map(finding => {
      if (!record(finding)) throw invalid('自动审核意见格式无效。');
      return { chapter_id: finding.chapter_id === null ? null : identifier(finding.chapter_id), field: nullableText(finding.field, '自动审核字段', 160), reason: boundedText(finding.reason, '自动审核意见', AUTO_REVIEW_TEXT_MAX, true), evidence: nullableText(finding.evidence, '自动审核依据') };
    }), updated_at: integer(value.updated_at, '自动审核更新时间'),
  };
}
export function readNovelAIPolicy(value) {
  if (!record(value) || typeof value.enabled !== 'boolean') throw invalid('小说自动审核策略格式无效；未使用默认配置。');
  const result = { enabled: value.enabled, revision: boundedText(value.revision, '自动审核策略版本', 160, true) };
  for (const [field, max] of Object.entries(NOVEL_AI_LIMITS)) {
    result[field] = integer(value[field], 'AI 调用次数上限', 1);
    if (result[field] > max) throw invalid('AI 调用次数上限超出范围。');
  }
  return result;
}
export function novelAIPolicyPayload(value) {
  try { return readNovelAIPolicy(value); }
  catch { throw Object.assign(new Error('自动审核策略无效：每日调用次数须为 1–10000，单任务调用次数须为 1–2048 的整数，并携带已加载版本。'), { code: 'LOCAL_VALIDATION' }); }
}
export function changedChapterIds(item) {
  const changed = new Set((item?.changes?.chapters ?? []).filter(chapter => ['added', 'updated'].includes(chapter.kind)).map(chapter => chapter.id));
  return (item?.chapters ?? []).filter(chapter => changed.has(chapter.id)).map(chapter => chapter.id);
}
export function manualAIIdentity(item, selectedIds) {
  const selected = new Set(selectedIds);
  return JSON.stringify({ review_id: item.id, version: item.version, chapters: item.chapters.filter(chapter => selected.has(chapter.id)).map(chapter => ({ id: chapter.id, generation: chapter.generation, body_sha256: chapter.body_sha256 })) });
}
export function matchesAutoReviewFilter(item, filter = 'all') {
  if (filter === 'all') return true;
  if (filter === 'needs_human') return !item.auto_review || ['needs_human', 'cancelled'].includes(item.auto_review.status);
  return item.auto_review?.status === filter;
}
export function autoReviewMeta(status) {
  return ({ queued: ['自动审核排队中', 'amber'], running: ['自动审核中', 'blue'], needs_human: ['自动审核需人工处理', 'red'], passed: ['自动审核已通过', 'green'], cancelled: ['自动审核已取消', 'slate'] })[status] ?? ['无自动审核记录', 'slate'];
}
function author(value) {
  if (!record(value)) throw invalid('作者信息缺失。');
  return { id: integer(value.id, '作者编号', 1), username: string(value.username, '作者用户名'), display_name: string(value.display_name ?? '', '作者名称'), avatar: string(value.avatar ?? '', '作者头像'), url: string(value.url ?? '', '作者链接') };
}
function metadata(value) {
  if (!record(value)) throw invalid();
  return {
    id: identifier(value.id), title: string(value.title, '作品标题', true), description: string(value.description, '作品简介'),
    work_type: string(value.work_type, '作品类型', true), cover_url: value.cover_url == null ? null : string(value.cover_url, '封面'),
    tags: strings(value.tags, '标签'), statements: strings(value.statements, '声明'), source: string(value.source, '来源'), authorization: string(value.authorization, '授权说明'),
    completed: typeof value.completed === 'boolean' ? value.completed : (() => { throw invalid('完结状态缺失。'); })(), author: author(value.author),
  };
}
export function readChapter(value) {
  if (!record(value)) throw invalid();
  return { ...value, id: identifier(value.id), title: string(value.title, '章节标题'), sort_order: integer(value.sort_order, '章节顺序'), word_count: integer(value.word_count, '章节字数'), generation: integer(value.generation, '章节代次'), body_sha256: hash(value.body_sha256) };
}
function readChanges(value) {
  if (!record(value) || !Array.isArray(value.chapters)) throw invalid('版本差异响应格式无效。');
  return { metadata: strings(value.metadata, '元数据差异'), chapters: value.chapters.map(chapter => {
    if (!record(chapter) || !['added', 'updated', 'unchanged'].includes(chapter.kind)) throw invalid('章节差异响应格式无效。');
    return { id: identifier(chapter.id), title: string(chapter.title, '差异章节标题'), kind: chapter.kind };
  }) };
}
function readAudit(value) {
  if (!Array.isArray(value)) throw invalid('审核历史响应格式无效。');
  return value.map(entry => {
    if (!record(entry)) throw invalid('审核历史响应格式无效。');
    if (entry.actor_type != null) boundedText(entry.actor_type, '审计操作者类型', 32, true);
    return { ...(entry.actor_type != null ? { actor_type: entry.actor_type } : {}), ...(entry.actor_type === 'system' ? {} : { actor_id: integer(entry.actor_id, '审计操作者', 1) }), actor_name: string(entry.actor_name, '审计操作者名称'), action: string(entry.action, '审计操作', true), reason: string(entry.reason, '审计理由'), created_at: integer(entry.created_at, '审计时间') };
  });
}
export function readReview(value, detail = false) {
  if (!record(value) || ![...REVIEW_STATUSES, 'uploading'].includes(value.status)) throw invalid('审核状态响应无效。');
  if (detail && !Array.isArray(value.chapters)) throw invalid('服务端没有返回完整候选目录。');
  const chapters = (value.chapters ?? []).map(readChapter);
  if (new Set(chapters.map(item => item.id)).size !== chapters.length) throw invalid('候选目录含有重复章节。');
  return { ...value, ...metadata(value), work_id: identifier(value.work_id), status: value.status, version: integer(value.version, '审核版本', 1), owner_id: integer(value.owner_id, '作者编号', 1),
    claimed_by: value.claimed_by == null ? null : integer(value.claimed_by, '认领管理员', 1), base_release_id: value.base_release_id == null ? null : identifier(value.base_release_id),
    submitted_at: integer(value.submitted_at, '提交时间'), reason: value.reason == null ? null : string(value.reason, '审核理由'), chapters,
    changes: value.changes == null ? null : readChanges(value.changes), audit: value.audit == null ? null : readAudit(value.audit), auto_review: readAutoReview(value.auto_review) };
}
export function readWork(value) {
  if (!record(value) || !['draft', 'pending', 'published', 'rejected', 'withdrawn'].includes(value.status)) throw invalid('作品状态响应无效。');
  return { ...value, ...metadata(value), release_id: value.release_id == null ? null : identifier(value.release_id),
    status: value.status, chapter_count: integer(value.chapter_count, '章节数量'), word_count: integer(value.word_count, '作品字数'),
    ...(Array.isArray(value.chapters) ? { chapters: value.chapters.map(readChapter) } : {}) };
}
export function readReport(value) {
  if (!record(value)) throw invalid('举报响应格式无效。');
  return { ...value, id: identifier(value.id), work_id: identifier(value.work_id), reason: string(value.reason, '举报理由', true), status: string(value.status, '举报状态', true) };
}
export function readPage(value, parser) {
  if (!record(value) || !Array.isArray(value.items)) throw invalid('列表响应格式无效；未将失败显示为空队列。');
  if (value.next_cursor != null && typeof value.next_cursor !== 'string') throw invalid('分页游标格式无效。');
  return { items: value.items.map(item => parser(item)), next_cursor: value.next_cursor ?? null };
}
export function readBody(value, expected) {
  if (!record(value) || value.id !== expected.id || value.generation !== expected.generation || value.body_sha256 !== expected.body_sha256) throw invalid('章节版本或校验值与候选目录不符，请刷新审核详情。');
  // 正文绝不 trim、slice 或作为 HTML 注入，空章节也是完整正文。
  return { id: value.id, title: string(value.title, '章节标题'), body: string(value.body, '完整章节正文'), generation: value.generation, body_sha256: hash(value.body_sha256) };
}
export function readAIChunk(value, chapter, offset) {
  if (!record(value) || !['complete', 'unavailable'].includes(value.status)) throw invalid('AI 分块响应无效；没有确认完整覆盖。');
  if (value.status === 'unavailable') throw Object.assign(new Error('统一 App AI 服务未配置或暂不可用；本次未完成检查，也未作审核决定。'), { code: 'AI_UNAVAILABLE' });
  if (value.chapter_id !== chapter.id || value.body_sha256 !== chapter.body_sha256) throw invalid('AI 结果不属于当前候选章节，请重新加载。');
  if (value.next_offset !== null && (!Number.isSafeInteger(value.next_offset) || value.next_offset <= offset)) throw invalid('AI 分块游标没有前进；已停止，不能标记完整覆盖。');
  return { chapter_id: chapter.id, body_sha256: value.body_sha256, offset, next_offset: value.next_offset, findings: boundedText(value.findings, 'AI 检查意见', 16000) };
}
export function reviewAvailability(item, adminId) {
  const claimed = item?.claimed_by != null;
  const own = claimed && adminId != null && String(item.claimed_by) === String(adminId);
  const active = adminId != null && ['pending', 'reviewing'].includes(item?.status);
  return { claim: active && !own, release: active && own && item.status === 'reviewing', approve: active, reject: active, ai: active, claimedByOther: claimed && !own };
}
export function statusMeta(status) {
  return ({ pending: ['待审核', 'amber'], reviewing: ['审核中', 'blue'], approved: ['已通过', 'green'], rejected: ['已驳回', 'red'], uploading: ['上传中', 'slate'], published: ['已发布', 'green'], withdrawn: ['已下架', 'red'], draft: ['草稿', 'slate'], dismissed: ['已忽略', 'slate'], resolved: ['已处理', 'green'] })[status] ?? [status || '未知', 'slate'];
}
export function safeReviewError(error) {
  const status = error?.status;
  const codes = { 401: '登录已失效，请重新登录；旧会话的内容已清空。', 403: '管理员权限已失效，请确认当前账号；旧会话的内容已清空。', 404: '记录不存在或当前不可访问。', 409: '记录版本或状态已更新（可能来自自动审核或其他管理员）。理由草稿已保留，请重新加载详情后再操作。', 408: '请求超时，服务器结果未确认，请刷新后再试。', 504: '请求超时，服务器结果未确认，请刷新后再试。', 503: '服务未配置或暂不可用，未将请求视为成功。' };
  const message = error?.code === 'TIMEOUT' ? '请求超时，未确认完成。请重试或刷新服务器状态。' : codes[status] || (['INVALID_RESPONSE', 'AI_UNAVAILABLE', 'LOCAL_VALIDATION'].includes(error?.code) ? error.message : '请求失败，服务器结果未确认；请重试或重新加载。');
  return Object.assign(new Error(message), { status, code: error?.code || 'REQUEST_FAILED' });
}
const localError = message => Object.assign(new Error(message), { code: 'LOCAL_VALIDATION' });
const checkedReason = validateNovelReason;
const initialAI = () => ({ status: 'idle', completedChapters: 0, totalChapters: 0, chunks: 0, chapter_id: null, offset: 0, results: [], message: '', identity: null });
const policyDraft = saved => ({ enabled: saved?.enabled ?? false, daily_call_limit: saved ? String(saved.daily_call_limit) : '', job_call_limit: saved ? String(saved.job_call_limit) : '' });
const initialPolicy = () => ({ saved: null, draft: policyDraft(null), loading: false, saving: false, needsReload: true, error: '', notice: '' });
export const initialReviewState = () => ({ mode: 'reviews', filter: { status: 'pending', auto_filter: 'all', query: '', cursor: null }, page: null, loading: false, listError: '', selected: null, detailLoading: false, detailError: '', work: null, workLoading: false, workError: '', historyLoading: false, historyError: '', bodies: {}, bodyLoading: false, bodyError: '', reason: '', saving: false, needsReload: false, error: '', notice: '', blocked: false, selectedChapterIds: [], ai: initialAI(), policy: initialPolicy() });

// 复用宝宝认证审核的操作幂等存储，并增加账号、请求代次和候选版本隔离；认领仅用于协作。
// 所有候选正文、AI 结果和操作键只存在当前页面内存，离开或换号即销毁。
export function createNovelReviewController(api, { adminId, onChange = () => {}, getSession = () => '', createId } = {}) {
  let state = initialReviewState(), disposed = false, epoch = 0;
  const ownerSession = getSession();
  const lanes = new Map();
  let operations = createDecisionOperationStore(createId);
  const alive = () => !disposed && !state.blocked && ownerSession === getSession();
  const publish = patch => { state = { ...state, ...patch }; if (!disposed) onChange(state); };
  const cancel = lane => { lanes.get(lane)?.abort(); lanes.delete(lane); };
  const cancelDetail = () => { for (const lane of ['detail', 'work', 'history', 'body', 'ai', 'action']) cancel(lane); };
  const begin = lane => {
    cancel(lane);
    const controller = new AbortController(), ticket = epoch;
    lanes.set(lane, controller);
    return { signal: controller.signal, current: () => alive() && ticket === epoch && lanes.get(lane) === controller && !controller.signal.aborted };
  };
  const block = () => {
    epoch += 1; for (const lane of [...lanes.keys()]) cancel(lane);
    operations = createDecisionOperationStore(createId);
    publish({ ...initialReviewState(), blocked: true, error: '会话已变化，请重新进入小说审核。旧账号内容与待处理操作已清空。' });
  };
  const fail = (error, patch = {}) => {
    if ([401, 403].includes(error?.status)) { block(); return; }
    publish({ ...patch, error: safeReviewError(error).message, notice: '' });
  };
  const snapshot = value => readReview(value, true);
  const replaceReview = selected => {
    const page = state.mode === 'reviews' && state.page ? { ...state.page, items: state.page.items.map(item => item.id === selected.id ? selected : item).filter(item => (!state.filter.status || item.status === state.filter.status) && matchesAutoReviewFilter(item, state.filter.auto_filter)) } : state.page;
    publish({ selected, page, detailLoading: false, needsReload: false, error: '', detailError: '' });
  };
  const publishPolicy = patch => publish({ policy: { ...state.policy, ...patch } });
  const acceptPolicy = saved => publishPolicy({ saved, draft: policyDraft(saved), loading: false, saving: false, needsReload: false, error: '', notice: '' });
  const controller = {
    getState: () => state,
    block,
    async loadPolicy() {
      if (!alive() || state.policy.loading || state.policy.saving) return false;
      const request = begin('policy');
      publishPolicy({ loading: true, needsReload: true, error: '', notice: '' });
      try {
        const saved = readNovelAIPolicy(await api.aiPolicy({ signal: request.signal }));
        if (!request.current()) return false;
        acceptPolicy(saved); return true;
      } catch (error) {
        if (request.current()) { if ([401, 403].includes(error?.status)) block(); else publishPolicy({ loading: false, error: safeReviewError(error).message }); }
        return false;
      }
    },
    changePolicy(patch) {
      if (!alive() || !state.policy.saved || state.policy.loading || state.policy.saving || state.policy.needsReload) return;
      const draft = { ...state.policy.draft };
      if (typeof patch?.enabled === 'boolean') draft.enabled = patch.enabled;
      for (const key of Object.keys(NOVEL_AI_LIMITS)) if (typeof patch?.[key] === 'string') draft[key] = patch[key];
      publishPolicy({ draft, error: '', notice: '' });
    },
    async savePolicy() {
      const policy = state.policy;
      if (!alive() || !policy.saved || policy.loading || policy.saving || policy.needsReload) return false;
      let body, fingerprint, operation;
      try {
        const values = {};
        for (const field of Object.keys(NOVEL_AI_LIMITS)) {
          if (!/^\d{1,5}$/.test(policy.draft[field])) throw localError('调用次数上限必须是范围内的整数；不是 token 预算。');
          values[field] = Number(policy.draft[field]);
        }
        body = novelAIPolicyPayload({ ...values, enabled: policy.draft.enabled, revision: policy.saved.revision });
        fingerprint = JSON.stringify(body);
        operation = operations.acquire('ai-policy', 'save', fingerprint);
      } catch (error) { publishPolicy({ error: safeReviewError(error).message, notice: '' }); return false; }
      const request = begin('policy');
      publishPolicy({ saving: true, error: '', notice: '' });
      try {
        const saved = readNovelAIPolicy(await api.saveAIPolicy(body, { signal: request.signal, operationId: operation }));
        if (!request.current()) return false;
        if (saved.revision === body.revision || ['enabled', ...Object.keys(NOVEL_AI_LIMITS)].some(field => saved[field] !== body[field])) throw invalid('策略保存响应未确认新版本与调用次数，不能视为保存成功。');
        operations.settle('ai-policy', 'save', fingerprint);
        acceptPolicy(saved);
        publishPolicy({ notice: '服务器已确认保存自动审核策略；仅影响自动审核，不禁用手动辅助检查，也未调用 AI。' });
        return true;
      } catch (error) {
        operations.reject('ai-policy', 'save', fingerprint, error);
        if (request.current()) {
          if ([401, 403].includes(error?.status)) block();
          else publishPolicy({ saving: false, needsReload: error?.status === 409 || error?.code === 'INVALID_RESPONSE', error: error?.status === 409 ? '自动审核策略已被其他管理员更新；草稿已保留，未覆盖服务器。请重新加载策略后再保存，不会自动重放。' : safeReviewError(error).message });
        }
        return false;
      }
    },
    async loadList({ mode = state.mode, status = mode === 'reviews' ? 'pending' : '', auto_filter = 'all', query = '', cursor = null } = {}) {
      if (!alive()) return false;
      if (!['reviews', 'works', 'reports', 'creators'].includes(mode)) return false;
      if (mode === 'reviews' && (!REVIEW_STATUSES.includes(status) || !AUTO_REVIEW_FILTERS.includes(auto_filter))) return false;
      if (mode !== state.mode) controller.close();
      const request = begin('list');
      publish({ mode, filter: { status, auto_filter: mode === 'reviews' ? auto_filter : 'all', query, cursor }, page: null, loading: mode !== 'creators', listError: '', notice: '' });
      if (mode === 'creators') return true;
      try {
        const method = mode === 'reviews' ? api.listReviews : mode === 'works' ? api.works : api.reports;
        const page = await method({ status, query, cursor, limit: 20, ...(mode === 'reviews' ? { auto_filter } : {}) }, { signal: request.signal });
        if (!request.current()) return false;
        publish({ page: readPage(page, mode === 'reviews' ? readReview : mode === 'works' ? readWork : readReport), loading: false });
        return true;
      } catch (error) {
        if (request.current()) { if ([401, 403].includes(error?.status)) block(); else publish({ loading: false, listError: safeReviewError(error).message }); }
        return false;
      }
    },
    async open(id, { preserveReason = false } = {}) {
      if (!alive()) return false;
      cancelDetail();
      const request = begin('detail'), reason = preserveReason ? state.reason : '';
      publish({ selected: null, detailLoading: true, detailError: '', work: null, workLoading: false, workError: '', historyLoading: false, historyError: '', bodies: {}, bodyLoading: false, bodyError: '', reason, saving: false, error: '', notice: '', needsReload: true, selectedChapterIds: [], ai: initialAI() });
      try {
        const item = snapshot(await api.review(id, { signal: request.signal }));
        if (!request.current()) return false;
        if (item.id !== id) throw invalid('审核详情编号不符。');
        replaceReview(item);
        publish({ selectedChapterIds: changedChapterIds(item) }); return true;
      } catch (error) {
        if (request.current()) { if ([401, 403].includes(error?.status)) block(); else publish({ detailLoading: false, detailError: safeReviewError(error).message }); }
        return false;
      }
    },
    close() {
      cancelDetail();
      publish({ selected: null, detailLoading: false, detailError: '', work: null, workLoading: false, workError: '', historyLoading: false, historyError: '', bodies: {}, bodyLoading: false, bodyError: '', reason: '', saving: false, needsReload: false, error: '', notice: '', selectedChapterIds: [], ai: initialAI() });
    },
    async openWork(id) {
      if (!alive()) return false;
      controller.close();
      const request = begin('work');
      publish({ workLoading: true, workError: '' });
      try {
        const value = await api.work(id, { signal: request.signal });
        if (!request.current()) return false;
        const work = readWork(value);
        if (work.id !== id || !Array.isArray(work.chapters) || !Array.isArray(value.reviews)) throw invalid('作品详情缺少完整目录或审核版本历史。');
        if (value.reviews_next_cursor != null && typeof value.reviews_next_cursor !== 'string') throw invalid('作品审核历史游标无效。');
        const reviews = value.reviews.map(snapshot);
        if (reviews.some(review => review.work_id !== id) || new Set(reviews.map(review => review.id)).size !== reviews.length) throw invalid('作品审核历史包含其他作品或重复记录。');
        publish({ work: { ...work, reviews, reviews_next_cursor: value.reviews_next_cursor ?? null }, workLoading: false });
        return true;
      } catch (error) {
        if (request.current()) { if ([401, 403].includes(error?.status)) block(); else publish({ workLoading: false, workError: safeReviewError(error).message }); }
        return false;
      }
    },
    async loadMoreHistory() {
      if (!alive() || !state.work?.reviews_next_cursor || state.historyLoading) return false;
      const work = state.work, cursor = work.reviews_next_cursor, request = begin('history');
      publish({ historyLoading: true, historyError: '' });
      try {
        const page = readPage(await api.workReviews(work.id, { cursor, limit: 20 }, { signal: request.signal }), snapshot);
        if (!request.current()) return false;
        if (page.next_cursor === cursor) throw invalid('作品审核历史游标没有前进，已停止加载。');
        if (page.items.some(review => review.work_id !== work.id)) throw invalid('审核历史不属于当前作品，已停止加载。');
        const existing = new Set(work.reviews.map(review => review.id));
        const added = page.items.filter(review => { if (existing.has(review.id)) return false; existing.add(review.id); return true; });
        publish({ work: { ...work, reviews: [...work.reviews, ...added], reviews_next_cursor: page.next_cursor }, historyLoading: false });
        return true;
      } catch (error) {
        if (request.current()) { if ([401, 403].includes(error?.status)) block(); else publish({ historyLoading: false, historyError: safeReviewError(error).message }); }
        return false;
      }
    },
    changeReason(reason) { if (alive() && !state.saving) publish({ reason, error: '', notice: '' }); },
    async mutate(action) {
      if (!alive() || !state.selected || state.saving || state.needsReload || !reviewAvailability(state.selected, adminId)[action]) return false;
      const item = state.selected;
      let body, operation;
      try {
        body = ['approve', 'reject'].includes(action) ? { decision: action, reason: checkedReason(state.reason, { required: false }), version: item.version } : {};
        operation = operations.acquire(item.id, action, JSON.stringify(body));
      } catch (error) { fail(error); return false; }
      controller.cancelAI(); cancel('body');
      const request = begin('action');
      publish({ saving: true, bodyLoading: false, error: '', notice: '' });
      try {
        const result = await (body.decision ? api.decide(item.id, body, { signal: request.signal, operationId: operation }) : api[action](item.id, { signal: request.signal, operationId: operation }));
        if (!request.current()) return false;
        const next = snapshot(body.decision ? result.review : result);
        if (next.id !== item.id || next.version <= item.version || (body.decision && next.status !== (action === 'approve' ? 'approved' : 'rejected')) || (action === 'claim' && (next.status !== 'reviewing' || String(next.claimed_by) !== String(adminId))) || (action === 'release' && (next.status !== 'pending' || next.claimed_by != null))) throw invalid();
        operations.settle(item.id, action, JSON.stringify(body));
        replaceReview(next);
        publish({ saving: false, reason: '', bodies: {}, selectedChapterIds: state.selectedChapterIds.filter(id => next.chapters.some(chapter => chapter.id === id)), ai: initialAI(), notice: action === 'approve' ? '服务器已确认人工通过。' : action === 'reject' ? '服务器已确认人工驳回。' : action === 'claim' ? '服务器已确认认领 / 接手；认领仅作协作提示，不限制其他管理员决定。' : '服务器已确认释放审核。' });
        return true;
      } catch (error) {
        operations.reject(item.id, action, JSON.stringify(body), error);
        if (request.current()) fail(error, { saving: false, needsReload: error?.status === 409 || error?.code === 'INVALID_RESPONSE' });
        return false;
      }
    },
    async loadBodies(chapterId = null) {
      if (!alive() || !state.selected || state.saving || state.needsReload) return false;
      const item = state.selected;
      const chapters = item.chapters.filter(chapter => chapterId == null || chapter.id === chapterId);
      if (!chapters.length) { publish({ bodyError: '没有可加载的候选章节。' }); return false; }
      const request = begin('body');
      publish({ bodyLoading: true, bodyError: '' });
      try {
        for (const chapter of chapters) {
          if (!request.current()) return false;
          if (state.bodies[chapter.id]) continue;
          const body = readBody(await api.chapter(item.id, chapter.id, { signal: request.signal }), chapter);
          if (!request.current()) return false;
          publish({ bodies: { ...state.bodies, [chapter.id]: body } });
        }
        if (request.current()) publish({ bodyLoading: false });
        return true;
      } catch (error) {
        if (request.current()) { if ([401, 403].includes(error?.status)) block(); else publish({ bodyLoading: false, bodyError: safeReviewError(error).message, needsReload: error?.status === 409 || error?.code === 'INVALID_RESPONSE' }); }
        return false;
      }
    },
    cancelBodies() { cancel('body'); if (alive()) publish({ bodyLoading: false, bodyError: '已停止加载，已加载正文保留；其余章节尚未加载。' }); },
    selectAIChapters(ids) {
      if (!alive() || !state.selected || state.saving || state.needsReload || !Array.isArray(ids) || ids.some(id => !state.selected.chapters.some(chapter => chapter.id === id))) return false;
      const wanted = new Set(ids), selectedChapterIds = state.selected.chapters.filter(chapter => wanted.has(chapter.id)).map(chapter => chapter.id);
      if (JSON.stringify(selectedChapterIds) === JSON.stringify(state.selectedChapterIds)) return true;
      cancel('ai');
      // 改选（包括改选后又选回）不复用任何旧覆盖进度或未确认分块操作键。
      operations.settle(state.selected.id, 'ai', JSON.stringify({ identity: state.ai.identity, chapter_id: state.ai.chapter_id, offset: state.ai.offset }));
      publish({ selectedChapterIds, ai: { ...initialAI(), message: '所选章节已更改；旧分块进度已清空。' } });
      return true;
    },
    selectChangedAIChapters() { return controller.selectAIChapters(changedChapterIds(state.selected)); },
    async startAI() {
      if (!alive() || !state.selected || state.saving || state.needsReload || state.ai.status === 'running' || !reviewAvailability(state.selected, adminId).ai) return false;
      const item = state.selected, selected = new Set(state.selectedChapterIds), chapters = item.chapters.filter(chapter => selected.has(chapter.id));
      if (!chapters.length) { publish({ ai: { ...initialAI(), status: 'error', message: '请先选择要手动检查的章节；未发送 AI 请求。' } }); return false; }
      const previous = state.ai, identity = manualAIIdentity(item, state.selectedChapterIds);
      const resume = ['cancelled', 'error'].includes(previous.status) && previous.identity === identity;
      let progress = { ...(resume ? previous : initialAI()), status: 'running', review_id: item.id, version: item.version, identity, totalChapters: chapters.length, message: '' };
      const request = begin('ai');
      publish({ ai: progress });
      try {
        for (let index = progress.completedChapters; index < chapters.length; index += 1) {
          const chapter = chapters[index];
          let offset = index === progress.completedChapters ? progress.offset : 0;
          while (true) {
            if (!request.current()) return false;
            progress = { ...progress, chapter_id: chapter.id, offset };
            publish({ ai: progress });
            const fingerprint = JSON.stringify({ identity, chapter_id: chapter.id, offset });
            const key = operations.acquire(item.id, 'ai', fingerprint);
            let chunk;
            try { chunk = readAIChunk(await api.ai(item.id, { chapter_id: chapter.id, offset }, { signal: request.signal, operationId: key }), chapter, offset); }
            catch (error) { operations.reject(item.id, 'ai', fingerprint, error?.code === 'AI_UNAVAILABLE' ? { status: 422 } : error); throw error; }
            if (!request.current()) return false;
            operations.settle(item.id, 'ai', fingerprint);
            progress = { ...progress, chunks: progress.chunks + 1, results: [...progress.results, chunk], offset: chunk.next_offset ?? 0, completedChapters: chunk.next_offset === null ? index + 1 : index };
            publish({ ai: progress });
            if (chunk.next_offset === null) break;
            offset = chunk.next_offset;
          }
        }
        if (!request.current()) return false;
        publish({ ai: { ...progress, status: 'complete', chapter_id: null, message: `服务端分块已完成本次所选 ${chapters.length} 章的辅助检查；不代表未选章节或整部作品已检查，未作审核决定。` } });
        return true;
      } catch (error) {
        if (request.current()) { if ([401, 403].includes(error?.status)) block(); else publish({ ai: { ...progress, status: 'error', message: safeReviewError(error).message }, needsReload: error?.status === 409 || error?.code === 'INVALID_RESPONSE' }); }
        return false;
      }
    },
    cancelAI() {
      cancel('ai');
      if (alive() && state.ai.status === 'running') publish({ ai: { ...state.ai, status: 'cancelled', message: '已取消后续 AI 请求；在途调用可能已由服务端处理。保留已确认分块，未完成部分不计为覆盖。' } });
    },
    async govern(kind, targetId, action, reason) {
      if (!alive() || state.saving) return false;
      const methods = { work: api.workAction, report: api.reportDecision, creator: api.creatorAction };
      const actions = { work: ['withdraw', 'restore'], report: ['dismiss', 'withdraw'], creator: ['suspend', 'restore'] };
      let body, operation;
      try {
        if (!actions[kind]?.includes(action)) throw localError('治理操作无效。');
        identifier(String(targetId));
        if (kind === 'creator' && !/^[1-9]\d*$/.test(String(targetId))) throw localError('请输入正整数作者账号 ID。');
        body = { [kind === 'report' ? 'decision' : 'action']: action, reason: checkedReason(reason) };
        operation = operations.acquire(`${kind}/${targetId}`, action, JSON.stringify(body));
      } catch (error) { fail(error); return false; }
      const request = begin('action'); publish({ saving: true, error: '', notice: '' });
      try {
        const result = await methods[kind](String(targetId), body, { signal: request.signal, operationId: operation });
        if (!request.current()) return false;
        if (result?.success !== true) throw invalid();
        operations.settle(`${kind}/${targetId}`, action, JSON.stringify(body));
        publish({ saving: false, notice: '治理操作已由服务器确认。请刷新列表核对当前状态。' });
        return true;
      } catch (error) {
        operations.reject(`${kind}/${targetId}`, action, JSON.stringify(body), error);
        if (request.current()) fail(error, { saving: false });
        return false;
      }
    },
    dispose() { disposed = true; epoch += 1; for (const lane of [...lanes.keys()]) cancel(lane); operations = createDecisionOperationStore(createId); state = initialReviewState(); },
  };
  return controller;
}
