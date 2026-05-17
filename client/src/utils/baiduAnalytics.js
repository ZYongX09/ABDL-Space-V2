/**
 * 百度统计 — 仅在用户同意 Cookie 后加载
 */

const BAIDU_ID = '7a2eb68a000aad7949a7b9fd35788ec2';

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
  if (_loaded || !isConsented()) return;
  _loaded = true;

  window._hmt = window._hmt || [];
  const hm = document.createElement('script');
  hm.src = `https://hm.baidu.com/hm.js?${BAIDU_ID}`;
  hm.async = true;
  const s = document.getElementsByTagName('script')[0];
  s.parentNode.insertBefore(hm, s);
}

/**
 * 页面访问追踪（SPA 路由切换时调用）
 */
export function trackPageView(path) {
  if (!isConsented() || !window._hmt) return;
  window._hmt.push(['_trackPageview', path]);
}
