/**
 * 百度统计 — 仅在用户同意 Cookie 后加载
 */

const BAIDU_ID = '45f30315297c806e5581a3703a7e2a9a';

let _loaded = false;

export function isConsented() {
  try {
    const data = JSON.parse(localStorage.getItem('cookie_consent'));
    return data?.accepted === true;
  } catch {
    return false;
  }
}

export function loadBaiduAnalytics() {
  if (_loaded) return;
  _loaded = true;
  // 脚本已在 index.html 中加载，此处仅标记已加载
}

/**
 * 页面访问追踪（SPA 路由切换时调用）
 */
export function trackPageView(path) {
  if (!isConsented() || !window._hmt) return;
  window._hmt.push(['_trackPageview', path]);
}
