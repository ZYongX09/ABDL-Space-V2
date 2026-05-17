/**
 * 生成外链提醒页 URL
 * @param {string} url - 目标外链
 * @returns {string} 跳转到 /external?url=... 的路径
 */
export function externalLinkUrl(url) {
  return `/external?url=${encodeURIComponent(url)}`;
}
