import { useState, useRef, useCallback, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import AccountSwitcher from './AccountSwitcher';

const NAV_ITEMS = [
  { to: '/', icon: 'fa-solid fa-house', label: '广场', end: true },
  { to: '/messages', icon: 'fa-solid fa-envelope', label: '私信' },
  { to: '/diapers', icon: 'fa-solid fa-baby', label: '纸尿裤' },
  { to: '/rankings', icon: 'fa-solid fa-trophy', label: '排行榜' },
  { to: '/recommend', icon: 'fa-solid fa-wand-magic-sparkles', label: 'AI 推荐' },
];

const HOVER_DELAY = 80;
const MAX_RIPPLE_DELAY = 150; // ms
const RIPPLE_SPEED = 0.6; // px → ms 衰减系数

export default function Sidebar() {
  const { user } = useAuth();
  const { unreadCount, messageUnread } = useNotifications();
  const [expanded, setExpanded] = useState(false);
  const [hoverAnchorY, setHoverAnchorY] = useState(null);
  const timerRef = useRef(null);
  const navRef = useRef(null);
  const itemRefs = useRef({});

  const handleMouseEnter = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    timerRef.current = setTimeout(() => {
      setExpanded(true);
      // anchorY 在下一帧设置，此时 expanded 已触发重渲染，项目位置已更新
      requestAnimationFrame(() => setHoverAnchorY(relY));
    }, HOVER_DELAY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setExpanded(false);
    setHoverAnchorY(null);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // 计算某个导航项的弹性延迟
  const getRippleDelay = useCallback((itemKey) => {
    if (hoverAnchorY === null || !expanded) return 0;
    const el = itemRefs.current[itemKey];
    if (!el) return 0;
    const itemCenter = el.offsetTop + el.offsetHeight / 2;
    const dist = Math.abs(itemCenter - hoverAnchorY);
    return Math.min(dist * RIPPLE_SPEED, MAX_RIPPLE_DELAY);
  }, [hoverAnchorY, expanded]);

  return (
    <>
      {/* 占位元素（折叠时撑开布局） */}
      <div className={`sidebar-placeholder ${expanded ? 'expanded' : ''}`} />

      {/* 侧边栏 */}
      <aside
        className={`sidebar-desktop sidebar-collapsible ${expanded ? 'expanded' : ''}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Logo */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src="https://img.abdl-space.top/file/1779879250278_ABDL_icon.svg" alt="ABDL Space" style={{ width: 24, height: 24 }} />
          </div>
          <div className="sidebar-header-text">
            <div className="sidebar-title">ABDL Space</div>
            <div className="sidebar-subtitle">纸尿裤社区</div>
          </div>
          {user && (
            <NavLink to="/notifications" className="sidebar-icon-btn" title="通知" style={{ position: 'relative' }}>
              <i className="fa-solid fa-bell" />
              {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </NavLink>
          )}
        </div>

        {/* 导航 */}
        <nav className="sidebar-nav" ref={navRef}>
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              ref={el => { if (el) itemRefs.current[item.to] = el; }}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link sidebar-ripple-item ${isActive ? 'active' : ''} ${expanded ? 'ripple-expanded' : ''}`}
              title={item.label}
              style={{
                position: 'relative',
                '--ripple-delay': `${getRippleDelay(item.to)}ms`,
              }}
            >
              <i className={`fa-solid ${item.icon} sidebar-link-icon`} />
              <span className="sidebar-link-label">{item.label}</span>
              {item.to === '/messages' && messageUnread > 0 && (
                <span className="notif-badge" style={{
                  position: 'absolute', top: '8px', right: '12px',
                  minWidth: '16px', height: '16px', borderRadius: '8px',
                  fontSize: '10px', lineHeight: '16px', textAlign: 'center',
                  padding: '0 4px', background: 'var(--danger)', color: '#fff',
                  fontWeight: 700,
                }}>
                  {messageUnread > 99 ? '99+' : messageUnread}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* 底部 */}
        <div className="sidebar-footer">
          {user ? (
            <AccountSwitcher collapsed={!expanded} />
          ) : (
            <NavLink
              to="/login"
              ref={el => { if (el) itemRefs.current['_login'] = el; }}
              className={`sidebar-link sidebar-ripple-item ${expanded ? 'ripple-expanded' : ''}`}
              title="登录"
              style={{ '--ripple-delay': `${getRippleDelay('_login')}ms` }}
            >
              <i className="fa-solid fa-right-to-bracket sidebar-link-icon" />
              <span className="sidebar-link-label">登录</span>
            </NavLink>
          )}
          <NavLink
            to="/settings"
            ref={el => { if (el) itemRefs.current['_settings'] = el; }}
            className={({ isActive }) => `sidebar-link sidebar-ripple-item ${isActive ? 'active' : ''} ${expanded ? 'ripple-expanded' : ''}`}
            title="设置"
            style={{ '--ripple-delay': `${getRippleDelay('_settings')}ms` }}
          >
            <i className="fa-solid fa-gear sidebar-link-icon" />
            <span className="sidebar-link-label">设置</span>
          </NavLink>
        </div>
      </aside>

      {/* 毛玻璃遮罩（展开时覆盖内容区） */}
      {expanded && (
        <div
          className="sidebar-overlay"
          onMouseEnter={() => setExpanded(false)}
        />
      )}
    </>
  );
}
