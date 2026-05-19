import { useState, useRef } from 'react';
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

const EXPAND_DELAY = 200; // ms

export default function Sidebar() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const [expanded, setExpanded] = useState(false);
  const timerRef = useRef(null);

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => setExpanded(true), EXPAND_DELAY);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setExpanded(false);
  };

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
            <i className="fa-solid fa-baby" />
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
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              title={item.label}
            >
              <i className={`fa-solid ${item.icon} sidebar-link-icon`} />
              <span className="sidebar-link-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* 底部 */}
        <div className="sidebar-footer">
          {user ? (
            <AccountSwitcher collapsed={!expanded} />
          ) : (
            <NavLink to="/login" className="sidebar-link" title="登录">
              <i className="fa-solid fa-right-to-bracket sidebar-link-icon" />
              <span className="sidebar-link-label">登录</span>
            </NavLink>
          )}
          <NavLink
            to="/settings"
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            title="设置"
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
