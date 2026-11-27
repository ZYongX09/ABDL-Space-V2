import communityDark from '../assets/app-download/community-dark.webp';
import communityLight from '../assets/app-download/community-light.webp';
import rankingsDark from '../assets/app-download/rankings-dark.webp';
import rankingsLight from '../assets/app-download/rankings-light.webp';
import readingDark from '../assets/app-download/reading-dark.webp';
import readingLight from '../assets/app-download/reading-light.webp';

// 后端还没有为某个槽位配置截图时，下载页使用随前端一同发布的实机截图。
// 管理员上传后，后端图片优先；删除槽位后又回到这里的内置图。
export const DOWNLOAD_SCREENSHOT_FALLBACK = {
  'community-light': { url: communityLight, width: 719, height: 1519 },
  'community-dark': { url: communityDark, width: 672, height: 1521 },
  'rankings-light': { url: rankingsLight, width: 672, height: 1536 },
  'rankings-dark': { url: rankingsDark, width: 647, height: 1475 },
  'reading-light': { url: readingLight, width: 604, height: 1425 },
  'reading-dark': { url: readingDark, width: 604, height: 1425 },
};

export function fallbackDownloadScreenshot(feature, theme) {
  const primary = theme === 'light' ? 'light' : 'dark';
  const alternate = primary === 'light' ? 'dark' : 'light';
  return DOWNLOAD_SCREENSHOT_FALLBACK[`${feature}-${primary}`] ?? DOWNLOAD_SCREENSHOT_FALLBACK[`${feature}-${alternate}`] ?? null;
}
