import { createDecisionOperationStore } from '../babyVerification/model.js';

export const REVIEW_STATUSES = Object.freeze(['pending', 'reviewing', 'approved', 'rejected']);
export const NOVEL_ADMIN_ROOT = '/api/admin/novels/rebuild';
export const NOVEL_REASON_MAX = 2000;
export function validateNovelReason(value) {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error('操作理由不能为空。'), { code: 'LOCAL_VALIDATION' });
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
    return { actor_id: integer(entry.actor_id, '审计操作者', 1), actor_name: string(entry.actor_name, '审计操作者名称'), action: string(entry.action, '审计操作', true), reason: string(entry.reason, '审计理由'), created_at: integer(entry.created_at, '审计时间') };
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
    changes: value.changes == null ? null : readChanges(value.changes), audit: value.audit == null ? null : readAudit(value.audit) };
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
  return { chapter_id: chapter.id, body_sha256: value.body_sha256, offset, next_offset: value.next_offset, findings: string(value.findings, 'AI 检查意见') };
}
export function reviewAvailability(item, adminId) {
  const claimed = item?.claimed_by != null;
  const own = claimed && adminId != null && String(item.claimed_by) === String(adminId);
  const reviewing = item?.status === 'reviewing' && own;
  return { claim: item?.status === 'pending' && !claimed, release: reviewing, approve: reviewing, reject: reviewing, ai: reviewing, claimedByOther: claimed && !own };
}
export function statusMeta(status) {
  return ({ pending: ['待审核', 'amber'], reviewing: ['审核中', 'blue'], approved: ['已通过', 'green'], rejected: ['已驳回', 'red'], uploading: ['上传中', 'slate'], published: ['已发布', 'green'], withdrawn: ['已下架', 'red'], draft: ['草稿', 'slate'], dismissed: ['已忽略', 'slate'], resolved: ['已处理', 'green'] })[status] ?? [status || '未知', 'slate'];
}
export function safeReviewError(error) {
  const status = error?.status;
  const codes = { 401: '登录已失效，请重新登录；旧会话的内容已清空。', 403: '管理员权限已失效，请确认当前账号；旧会话的内容已清空。', 404: '记录不存在或当前不可访问。', 409: '记录已被更新或由其他管理员认领。理由草稿已保留，请重新加载详情后再操作。', 408: '请求超时，服务器结果未确认，请刷新后再试。', 504: '请求超时，服务器结果未确认，请刷新后再试。', 503: '服务未配置或暂不可用，未将请求视为成功。' };
  const message = error?.code === 'TIMEOUT' ? '请求超时，未确认完成。请重试或刷新服务器状态。' : codes[status] || (['INVALID_RESPONSE', 'AI_UNAVAILABLE', 'LOCAL_VALIDATION'].includes(error?.code) ? error.message : '请求失败，服务器结果未确认；请重试或重新加载。');
  return Object.assign(new Error(message), { status, code: error?.code || 'REQUEST_FAILED' });
}
const localError = message => Object.assign(new Error(message), { code: 'LOCAL_VALIDATION' });
const checkedReason = validateNovelReason;
const initialAI = () => ({ status: 'idle', completedChapters: 0, totalChapters: 0, chunks: 0, chapter_id: null, offset: 0, results: [], message: '' });
export const initialReviewState = () => ({ mode: 'reviews', filter: { status: 'pending', query: '', cursor: null }, page: null, loading: false, listError: '', selected: null, detailLoading: false, detailError: '', work: null, workLoading: false, workError: '', historyLoading: false, historyError: '', bodies: {}, bodyLoading: false, bodyError: '', reason: '', saving: false, needsReload: false, error: '', notice: '', blocked: false, ai: initialAI() });

// 与宝宝认证审核相同的显式认领/理由/操作幂等模式，并增加账号、请求代次和候选版本隔离。
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
    const page = state.mode === 'reviews' && state.page ? { ...state.page, items: state.page.items.map(item => item.id === selected.id ? selected : item).filter(item => !state.filter.status || item.status === state.filter.status) } : state.page;
    publish({ selected, page, detailLoading: false, needsReload: false, error: '', detailError: '' });
  };
  const controller = {
    getState: () => state,
    block,
    async loadList({ mode = state.mode, status = mode === 'reviews' ? 'pending' : '', query = '', cursor = null } = {}) {
      if (!alive()) return false;
      if (!['reviews', 'works', 'reports', 'creators'].includes(mode)) return false;
      if (mode === 'reviews' && !REVIEW_STATUSES.includes(status)) return false;
      if (mode !== state.mode) controller.close();
      const request = begin('list');
      publish({ mode, filter: { status, query, cursor }, page: null, loading: mode !== 'creators', listError: '', notice: '' });
      if (mode === 'creators') return true;
      try {
        const method = mode === 'reviews' ? api.listReviews : mode === 'works' ? api.works : api.reports;
        const page = await method({ status, query, cursor, limit: 20 }, { signal: request.signal });
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
      publish({ selected: null, detailLoading: true, detailError: '', work: null, workLoading: false, workError: '', historyLoading: false, historyError: '', bodies: {}, bodyLoading: false, bodyError: '', reason, saving: false, error: '', notice: '', needsReload: true, ai: initialAI() });
      try {
        const item = snapshot(await api.review(id, { signal: request.signal }));
        if (!request.current()) return false;
        if (item.id !== id) throw invalid('审核详情编号不符。');
        replaceReview(item); return true;
      } catch (error) {
        if (request.current()) { if ([401, 403].includes(error?.status)) block(); else publish({ detailLoading: false, detailError: safeReviewError(error).message }); }
        return false;
      }
    },
    close() {
      cancelDetail();
      publish({ selected: null, detailLoading: false, detailError: '', work: null, workLoading: false, workError: '', historyLoading: false, historyError: '', bodies: {}, bodyLoading: false, bodyError: '', reason: '', saving: false, needsReload: false, error: '', notice: '', ai: initialAI() });
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
        body = ['approve', 'reject'].includes(action) ? { decision: action, reason: checkedReason(state.reason), version: item.version } : {};
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
        publish({ saving: false, reason: '', bodies: {}, ai: initialAI(), notice: action === 'approve' ? '服务器已确认人工通过。' : action === 'reject' ? '服务器已确认人工驳回。' : action === 'claim' ? '服务器已确认认领。请通读候选全文再作决定。' : '服务器已确认释放审核。' });
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
    async startAI() {
      if (!alive() || !state.selected || state.saving || state.needsReload || state.ai.status === 'running' || !reviewAvailability(state.selected, adminId).ai) return false;
      const item = state.selected;
      if (!item.chapters.length) { publish({ ai: { ...initialAI(), status: 'error', message: '候选目录为空，不能声称已覆盖全文。' } }); return false; }
      const previous = state.ai;
      const resume = ['cancelled', 'error'].includes(previous.status) && previous.review_id === item.id && previous.version === item.version;
      let progress = { ...(resume ? previous : initialAI()), status: 'running', review_id: item.id, version: item.version, totalChapters: item.chapters.length, message: '' };
      const request = begin('ai');
      publish({ ai: progress });
      try {
        for (let index = progress.completedChapters; index < item.chapters.length; index += 1) {
          const chapter = item.chapters[index];
          let offset = index === progress.completedChapters ? progress.offset : 0;
          while (true) {
            if (!request.current()) return false;
            progress = { ...progress, chapter_id: chapter.id, offset };
            publish({ ai: progress });
            const fingerprint = JSON.stringify({ version: item.version, chapter_id: chapter.id, offset });
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
        publish({ ai: { ...progress, status: 'complete', chapter_id: null, message: '服务端分块已覆盖全部候选章节。AI 仅供参考，尚未作任何人工审核决定。' } });
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
