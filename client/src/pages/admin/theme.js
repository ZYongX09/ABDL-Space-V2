/** 前台时间自动模式已解析出的 light/dark 直接沿用；多彩仅在后台跟随系统。 */
export function resolveAdminTheme(theme, systemDark = false) {
  return theme === 'light' || theme === 'dark' ? theme : systemDark ? 'dark' : 'light';
}

export function watchAdminTheme(theme, root = document.documentElement, media = window.matchMedia('(prefers-color-scheme: dark)')) {
  const apply = () => { root.dataset.adminTheme = resolveAdminTheme(theme, media.matches); };
  apply();
  if (theme !== 'light' && theme !== 'dark') media.addEventListener('change', apply);
  return () => {
    media.removeEventListener('change', apply);
    delete root.dataset.adminTheme;
  };
}
