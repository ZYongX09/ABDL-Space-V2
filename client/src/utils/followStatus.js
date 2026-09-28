export const FOLLOW_STATUS_BATCH_SIZE = 99;

export function normalizeFollowIds(userIds) {
  const ids = [];
  const seen = new Set();
  for (const value of userIds || []) {
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) continue;
    const id = Number(text);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export async function fetchFollowStatuses(userIds, fetchBatch) {
  const ids = normalizeFollowIds(userIds);
  const statuses = {};
  for (let i = 0; i < ids.length; i += FOLLOW_STATUS_BATCH_SIZE) {
    const batch = ids.slice(i, i + FOLLOW_STATUS_BATCH_SIZE);
    const result = await fetchBatch(batch);
    for (const id of batch) {
      if (!result || !Object.prototype.hasOwnProperty.call(result, String(id))) {
        throw new Error('批量关注状态响应不完整');
      }
    }
    Object.assign(statuses, result);
  }
  return statuses;
}
