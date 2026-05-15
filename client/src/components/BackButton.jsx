import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// 固定 tab 路径（侧边栏 / 底部菜单栏）
const FIXED_TAB_PATHS = new Set([
  '/', '/diapers', '/rankings', '/recommend', '/profile', '/settings', '/login',
]);

const STORAGE_KEY = '_navHistory';

function getHistory() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function pushHistory(path) {
  const h = getHistory();
  h.push(path);
  if (h.length > 20) h.shift();
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(h));
}

function isExternalOrEmpty(referrer) {
  if (!referrer) return true;
  try {
    return new URL(referrer).origin !== window.location.origin;
  } catch {
    return true;
  }
}

function shouldShowBack(currentPath) {
  // 当前页是固定 tab → 隐藏（用户点击侧边栏/底部菜单栏跳转的）
  if (FIXED_TAB_PATHS.has(currentPath)) return false;
  const history = getHistory();
  if (history.length <= 1) {
    // 首次加载：检查 referrer
    return !isExternalOrEmpty(document.referrer);
  }
  // 上一页是固定 tab → 隐藏
  const prev = history[history.length - 2];
  return prev && !FIXED_TAB_PATHS.has(prev);
}

export default function BackButton() {
  const location = useLocation();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    pushHistory(location.pathname);
    if (mounted.current) {
      setVisible(shouldShowBack(location.pathname));
    } else {
      mounted.current = true;
      setVisible(shouldShowBack(location.pathname));
    }
  }, [location.pathname]);

  if (!visible) return null;

  const btn = (
    <button
      onClick={() => navigate(-1)}
      aria-label="返回上一页"
      className="back-btn"
    >
      <i className="fa-solid fa-arrow-left" />
    </button>
  );

  // 移动端：固定定位，无需占位
  // PC 端：正常文档流，作为内容区顶部元素
  return (
    <div className="back-btn-wrap">
      <div className="back-btn-spacer" />
      {btn}
    </div>
  );
}
