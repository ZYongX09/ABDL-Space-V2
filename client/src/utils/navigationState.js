/**
 * 跨路由导航状态：列表数据缓存 + 滚动位置记忆。
 *
 * 从列表点进帖子详情时列表组件会被卸载。返回时若重新拉取，用户会看到骨架屏并被弹回顶部。
 * 这里做两件事：
 *  - 列表数据按列表自身的 key 缓存在内存里，返回时同步恢复，不再发请求；
 *  - 滚动位置按 history entry 的 location.key 记忆，返回（POP）时还原。
 *
 * 滚动位置落到 sessionStorage，整页刷新后同一个 entry 仍能还原；数据缓存只在内存里，
 * 刷新即失效，不会长期驻留旧列表。
 */
const SCROLL_STORE_KEY = 'abdl:scrollPositions';
const SCROLL_STORE_LIMIT = 40;

const feedStates = new Map();

/** 读取某个列表的缓存数据，没有则返回 null。 */
export function readFeedState(key) {
  return feedStates.get(key) ?? null;
}

/** 写入某个列表的缓存数据。 */
export function writeFeedState(key, state) {
  feedStates.set(key, state);
}

let scrollStore = null;

function loadScrollStore() {
  if (scrollStore) return scrollStore;
  scrollStore = {};
  try {
    const raw = sessionStorage.getItem(SCROLL_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) scrollStore = parsed;
  } catch {
    // sessionStorage 不可用（隐私模式/被禁用）时退化为纯内存，不影响导航。
  }
  return scrollStore;
}

function persistScrollStore() {
  try {
    const entries = Object.entries(loadScrollStore());
    if (entries.length > SCROLL_STORE_LIMIT) {
      scrollStore = Object.fromEntries(entries.slice(entries.length - SCROLL_STORE_LIMIT));
    }
    sessionStorage.setItem(SCROLL_STORE_KEY, JSON.stringify(scrollStore));
  } catch {
    // 写入失败只影响刷新后的还原，忽略即可。
  }
}

function currentScrollY() {
  return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
}

/** 记住某个 history entry 当前的滚动位置。滚动过程中节流调用即可。 */
export function rememberScroll(key) {
  if (!key) return;
  loadScrollStore()[key] = currentScrollY();
  persistScrollStore();
}

/**
 * 还原某个 history entry 的滚动位置。
 *
 * 返回列表时路由是懒加载 + Suspense，首帧可能只渲染出 fallback，页面高度不足会让浏览器把
 * 目标位置截断。因此在若干帧内反复尝试，直到页面够高或达到尝试上限。
 */
export function restoreScroll(key) {
  if (!key) return false;
  const target = loadScrollStore()[key];
  if (!target) return false;

  let attempts = 0;
  const apply = () => {
    const scroller = document.scrollingElement || document.documentElement;
    const max = Math.max(0, scroller.scrollHeight - window.innerHeight);
    window.scrollTo({ top: Math.min(target, max), behavior: 'instant' });
    if (currentScrollY() < target - 2 && attempts < 20) {
      attempts += 1;
      requestAnimationFrame(apply);
    }
  };
  apply();
  return true;
}
