import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AccountSwitcher from './AccountSwitcher';

const NAV_ITEMS = [
  { to: '/', icon: 'fa-house', label: '广场', end: true },
  { to: '/messages', icon: 'fa-envelope', label: '私信' },
  { to: '/diapers', icon: 'fa-baby', label: '纸尿裤' },
  { to: '/rankings', icon: 'fa-trophy', label: '排行榜' },
  { to: '/recommend', icon: 'fa-wand-magic-sparkles', label: 'AI 推荐' },
];

export default function Sidebar() {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* 占位元素（折叠时撑开布局） */}
      <div className={`sidebar-placeholder ${expanded ? 'expanded' : ''}`} />

      {/* 侧边栏 */}
      <aside
        className={`sidebar-desktop sidebar-collapsible ${expanded ? 'expanded' : ''}`}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
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
            <NavLink to="/notifications" className="sidebar-icon-btn" title="通知">
              <i className="fa-solid fa-bell" />
            </NavLink>
          )}
        </div>

        {/* 搜索 */}
        <div className="sidebar-search-wrap">
          <i className="fa-solid fa-magnifying-glass sidebar-search-icon" />
          <input className="sidebar-search-input" placeholder="搜索..." />
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
