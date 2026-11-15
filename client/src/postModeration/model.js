export const ROOT = '/api/admin';
export const MAX_REASON = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = () => Object.assign(new Error('违规处理响应格式异常；未确认操作成功，请查询回执'), { code: 'INVALID_RESPONSE' });
const object = value => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid(); return value; };
export function postId(value) {
  const id = typeof value === 'string' && /^[1-9]\d*$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('帖子 ID 无效');
  return id;
}
export function caseId(value) { if (typeof value !== 'string' || !UUID.test(value)) throw invalid(); return value; }
export function validateReason(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('处理理由必须是无 NUL 字符的纯文本');
  const reason = value.trim();
  if (!reason || reason.length > MAX_REASON) throw new Error('请填写 1–500 字的非空处理理由');
  return reason;
}
export const legalNotice = reason => `根据互联网用户公众账号信息服务管理规定，此内容由于 ${validateReason(reason)} 已被屏蔽`;
export function sourceRevision(value) {
  if (typeof value !== 'string' || !value || value.length > 256 || /[\s\0]/.test(value)) throw invalid();
  return value;
}
export const ARCHIVE_LABELS = Object.freeze({ pending: '归档待处理', verified: '已验证归档', blocked: '归档受阻，需人工核查', external: '外部资源，需人工处理' });
export const DELETE_LABELS = Object.freeze({ pending: '删除待处理', deleted: '已确认删除', blocked: '删除受阻，保留源文件', external: '非托管资源，不自动删除' });
// 不把任意服务端错误字符串（可能带来源地址或内部键）透传到管理视图。
export const ERROR_LABELS = Object.freeze({ shared_reference: '共享引用，保留源文件并人工核查', shared_asset: '共享资源，保留源文件并人工核查', manual_review: '需人工核查；不会绕过归档与删除安全检查' });
export function readCase(value, expectedPostId) {
  const data = object(value), reason = validateReason(data.reason);
  if (data.notice !== legalNotice(reason) || !Array.isArray(data.assets)) throw invalid();
  const id = postId(data.post_id);
  if (expectedPostId !== undefined && id !== postId(expectedPostId)) throw invalid();
  const assets = data.assets.map(value => {
    const asset = object(value);
    if (!Object.hasOwn(ARCHIVE_LABELS, asset.archive_state) || !Object.hasOwn(DELETE_LABELS, asset.delete_state) || !Number.isSafeInteger(asset.position) || asset.position < 0 || typeof asset.thumbnail_available !== 'boolean' || asset.error_code !== null && typeof asset.error_code !== 'string') throw invalid();
    return { id: caseId(asset.id), position: asset.position, archive_state: asset.archive_state, delete_state: asset.delete_state, thumbnail_available: asset.thumbnail_available, error_code: asset.error_code === null ? null : Object.hasOwn(ERROR_LABELS, asset.error_code) ? asset.error_code : 'manual_review' };
  });
  if (new Set(assets.map(asset => asset.id)).size !== assets.length) throw invalid();
  return { id: caseId(data.id), post_id: id, author_id: postId(data.author_id), actor_id: postId(data.actor_id), reason, notice: data.notice, created_at: typeof data.created_at === 'string' || Number.isSafeInteger(data.created_at) ? data.created_at : null, assets };
}
export function readTarget(value, expectedPostId) {
  const data = object(value);
  if (data.schema_version !== 1 || !Object.hasOwn(data, 'moderation')) throw invalid();
  const id = postId(data.post_id);
  if (expectedPostId !== undefined && id !== postId(expectedPostId)) throw invalid();
  return { schema_version: 1, post_id: id, source_revision: sourceRevision(data.source_revision), moderation: data.moderation === null ? null : readCase(data.moderation, id) };
}
export function readCaseEnvelope(value, expectedCaseId, expectedPostId) {
  const data = object(value);
  if (data.schema_version !== 1) throw invalid();
  const moderation = readCase(data.moderation, expectedPostId);
  if (moderation.id !== caseId(expectedCaseId)) throw invalid();
  return { schema_version: 1, moderation };
}
export function readSnapshot(value, expectedCaseId) {
  const data = object(value);
  if (data.schema_version !== 1 || data.case_id !== caseId(expectedCaseId)) throw invalid();
  object(data.snapshot);
  return { schema_version: 1, case_id: data.case_id, snapshot: data.snapshot };
}
export function assetSummary(assets) {
  if (!assets.length) return '无附件任务；文字原件永久留证';
  if (assets.some(asset => ['blocked', 'external'].includes(asset.archive_state) || ['blocked', 'external'].includes(asset.delete_state))) return '部分受阻 / 需人工处理；未宣称全部删除';
  if (assets.every(asset => asset.archive_state === 'verified' && asset.delete_state === 'deleted')) return '附件归档已验证，删除已确认';
  return '附件任务处理中；归档与 COS 删除尚未全部确认';
}
export const canRetry = moderation => !!moderation?.assets.some(asset => asset.archive_state === 'pending' || asset.delete_state === 'pending');
export const initialModerationState = () => ({ postId: null, target: null, reason: '', acknowledged: false, phase: 'idle', pending: '', error: '', message: '', snapshotText: '', thumbnails: {}, retryAccepted: false });
