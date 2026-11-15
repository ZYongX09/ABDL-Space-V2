import { canRetry, initialModerationState, postId, validateReason } from './model.js';

/** 状态只留当前管理页内存；不持久化原件或 URL。取消请求从不等于回滚。 */
export function createPostModerationController({ api, onChange = () => {}, onStored = () => {}, attempts = new Map(), createId = () => crypto.randomUUID(), createURL = blob => URL.createObjectURL(blob), revokeURL = url => URL.revokeObjectURL(url) }) {
  let state = initialModerationState(), live = true, generation = 0, active = null;
  const emit = patch => { state = { ...state, ...patch }; if (live) onChange(state); };
  const clearEvidence = () => { for (const url of Object.values(state.thumbnails)) revokeURL(url); emit({ snapshotText: '', thumbnails: {} }); };
  const begin = name => { if (!live || state.pending) return null; const request = { generation, abort: new AbortController() }; active = request; emit({ pending: name, error: '', message: '' }); return request; };
  const current = request => live && request.generation === generation && active === request;
  const finish = request => { if (current(request)) { active = null; emit({ pending: '' }); } };
  const failure = (error, patch = {}) => { clearEvidence(); emit({ error: error?.message || '处理请求失败；请重新核对状态', ...patch }); };
  const known = target => { attempts.set(String(target.post_id), { status: 'stored' }); emit({ target, phase: 'stored', acknowledged: false }); };

  async function readTarget() {
    if (!state.postId) return false;
    const request = begin('target'); if (!request) return false;
    const id = state.postId, prior = state.phase;
    clearEvidence();
    try {
      const target = await api.target(id, { signal: request.abort.signal });
      if (!current(request)) return false;
      if (target.moderation) {
        const wasUnknown = attempts.get(String(id))?.status === 'unknown';
        known(target);
        emit({ message: '案件已入库并永久留证；外部归档 / 删除进度以附件状态为准。' });
        if (wasUnknown) onStored(target);
      } else if (attempts.get(String(id))?.status === 'unknown') {
        emit({ target, phase: 'unknown', message: '尚未查询到案件，但原写入结果仍未确认。请继续查询回执，不要创建第二次处理。' });
      } else {
        attempts.delete(String(id));
        emit({ target, phase: 'ready', acknowledged: false, message: prior === 'conflict' ? '已重新读取源版本；理由已保留，请再次核对并确认。' : '' });
      }
      return true;
    } catch (error) {
      if (current(request)) failure(error, { phase: attempts.get(String(id))?.status === 'unknown' ? 'unknown' : state.target?.moderation ? 'stored' : prior === 'conflict' ? 'conflict' : 'read-error' });
      return false;
    } finally { finish(request); }
  }
  async function refreshCase() {
    if (!state.target?.moderation) return readTarget();
    const request = begin('detail'); if (!request) return false;
    clearEvidence();
    try {
      const result = await api.detail(state.target.moderation.id, state.postId, { signal: request.abort.signal });
      if (!current(request)) return false;
      known({ ...state.target, moderation: result.moderation }); emit({ retryAccepted: false }); return true;
    } catch (error) { if (current(request)) failure(error); return false; }
    finally { finish(request); }
  }
  async function submit({ confirmed = false } = {}) {
    if (!confirmed || state.phase !== 'ready' || !state.target || state.target.moderation || !state.acknowledged || state.pending || !live) return false;
    let body;
    try { body = { reason: validateReason(state.reason), source_revision: state.target.source_revision }; }
    catch (error) { failure(error); return false; }
    const id = state.postId, key = String(id);
    if (attempts.get(key)?.status === 'unknown' || attempts.get(key)?.status === 'stored') return false;
    const request = begin('create'); if (!request) return false;
    let operationId;
    try { operationId = createId(); }
    catch { failure(new Error('无法创建 UUID 操作标识，未发送处理请求')); finish(request); return false; }
    // 在请求发出前标记不明；关闭、超时、断网或会话取消都不能开放第二次处理。
    attempts.set(key, { status: 'unknown', operationId });
    emit({ phase: 'writing' }); clearEvidence();
    try {
      const target = await api.create(id, body, { operationId, signal: request.abort.signal });
      if (!current(request)) return false;
      known(target); emit({ message: '案件已入库并永久留证；附件任务仍可能待处理，不能视为 COS 已全部删除。' });
      onStored(target); return true;
    } catch (error) {
      if (!current(request)) return false;
      if (error?.status === 409) {
        attempts.set(key, { status: 'conflict', operationId });
        failure(error, { phase: 'conflict', acknowledged: false });
      } else failure(error, { phase: 'unknown', acknowledged: false, message: '写入结果未确认。只能查询回执；请勿重复处理或更换幂等键。' });
      return false;
    } finally { finish(request); }
  }
  async function snapshot() {
    if (!state.target?.moderation) return false;
    const request = begin('snapshot'); if (!request) return false;
    clearEvidence();
    try {
      const data = await api.snapshot(state.target.moderation.id, { signal: request.abort.signal });
      if (!current(request)) return false;
      emit({ snapshotText: JSON.stringify(data.snapshot, null, 2) }); return true;
    } catch (error) { if (current(request)) failure(error); return false; }
    finally { finish(request); }
  }
  async function thumbnail(assetId) {
    const moderation = state.target?.moderation;
    if (!moderation?.assets.some(asset => asset.id === assetId && asset.thumbnail_available) || state.thumbnails[assetId]) return false;
    const request = begin('thumbnail'); if (!request) return false;
    try {
      const blob = await api.thumbnail(moderation.id, assetId, { signal: request.abort.signal });
      if (!current(request)) return false;
      const url = createURL(blob);
      if (!current(request)) { revokeURL(url); return false; }
      emit({ thumbnails: { ...state.thumbnails, [assetId]: url } }); return true;
    } catch (error) { if (current(request)) failure(error); return false; }
    finally { finish(request); }
  }
  async function retry({ confirmed = false } = {}) {
    if (!confirmed || !canRetry(state.target?.moderation) || state.retryAccepted) return false;
    const request = begin('retry'); if (!request) return false;
    clearEvidence();
    try {
      const data = await api.retry(state.target.moderation.id, state.postId, { signal: request.abort.signal });
      if (!current(request)) return false;
      known({ ...state.target, moderation: data.moderation });
      emit({ retryAccepted: true, message: '安全任务重试调度已受理，不代表归档或删除完成。请主动刷新处理状态。' }); return true;
    } catch (error) {
      if (current(request)) failure(error, { retryAccepted: true, message: '重试调度结果未确认；请先主动刷新处理状态，不要连续重试。' }); return false;
    } finally { finish(request); }
  }
  return {
    getState: () => state,
    open: id => { if (!live || state.pending) return false; clearEvidence(); emit({ ...initialModerationState(), postId: postId(id), phase: attempts.get(String(id))?.status === 'unknown' ? 'unknown' : 'idle' }); return readTarget(); },
    changeReason: reason => { if (live && ['ready', 'conflict'].includes(state.phase) && !state.pending) emit({ reason, acknowledged: false, error: '' }); },
    acknowledge: acknowledged => { if (live && state.phase === 'ready' && !state.pending) emit({ acknowledged: !!acknowledged }); },
    readTarget, refreshCase, submit, snapshot, thumbnail, retry, clearEvidence,
    dispose: () => { live = false; generation++; active?.abort.abort(); active = null; for (const url of Object.values(state.thumbnails)) revokeURL(url); state = initialModerationState(); },
    block: () => { generation++; active?.abort.abort(); active = null; clearEvidence(); attempts.clear(); emit({ ...initialModerationState(), phase: 'blocked' }); live = false; },
  };
}
