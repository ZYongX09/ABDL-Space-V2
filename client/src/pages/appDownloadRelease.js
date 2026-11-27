const DOWNLOAD_ORIGINS = new Set([
  'https://r2.abdl-space.top',
  'https://img.abdl-space.top',
  'https://abdl-1339643562.cos.ap-shanghai.myqcloud.com',
]);

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai',
});
const sizeFormatter = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 });

function getDownloadUrl(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || !DOWNLOAD_ORIGINS.has(url.origin)) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function normalizeRelease(data) {
  if (data?.hasUpdate === false && (data.message == null || data.message === '暂无版本信息')) {
    return { status: 'empty' };
  }
  const downloadUrl = getDownloadUrl(data?.downloadUrl);
  if (data?.hasUpdate !== true || !downloadUrl) return { status: 'error' };

  const timestamp = typeof data.releasedAt === 'string' ? Date.parse(data.releasedAt) : NaN;
  return {
    status: 'ready',
    downloadUrl,
    version: typeof data.versionName === 'string' ? data.versionName.trim() : '',
    date: Number.isFinite(timestamp) ? dateFormatter.format(timestamp) : '',
    size: Number.isFinite(data.apkSize) && data.apkSize > 0
      ? `${sizeFormatter.format(data.apkSize / 1024 ** 2)} MB`
      : '',
    changelog: typeof data.changelog === 'string' ? data.changelog.trim() : '',
  };
}
