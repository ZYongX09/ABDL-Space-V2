import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AccountSwitcher from './AccountSwitcher';

const NAV_ITEMS = [
  { to: '/', icon: 'fa-comments', label: '广场', end: true },
  { to: '/diapers', icon: 'fa-baby', label: '纸尿裤' },
  { to: '/rankings', icon: 'fa-trophy', label: '排行榜' },
  { to: '/recommend', icon: 'fa-wand-magic-sparkles', label: 'AI 推荐' },
];

export default function Sidebar() {
  const { user } = useAuth();

  return (
    <aside
      className="sidebar-desktop w-60 flex flex-col h-screen sticky top-0 overflow-y-auto"
      style={{ background: 'var(--bg-sidebar)', borderRight: '1px solid var(--border)' }}
    >
      {/* Logo + 消息图标 */}
      <div className="px-5 py-4 flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0"
          style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}
        >
          <i className="fa-solid fa-baby" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm whitespace-nowrap" style={{ color: 'var(--text)' }}>ABDL Space</div>
          <div className="text-xs whitespace-nowrap" style={{ color: 'var(--text-light)' }}>纸尿裤社区</div>
        </div>
        {user && (
          <div className="flex items-center gap-1">
            <NavLink to="/notifications" className="relative p-1.5 rounded-lg hover:opacity-70 transition-opacity" style={{ color: 'var(--text-light)' }} title="通知">
              <i className="fa-solid fa-bell text-sm" />
            </NavLink>
          </div>
        )}
      </div>

      {/* 搜索 */}
      <div className="px-4 mb-3 relative">
        <i
          className="fa-solid fa-magnifying-glass absolute left-7 top-1/2 -translate-y-1/2 text-sm"
          style={{ color: 'var(--text-muted)' }}
        />
        <input className="sidebar-search-input" placeholder="搜索..." />
      </div>

      {/* 导航 */}
      <nav className="flex-1">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
          >
            <i className={`fa-solid ${item.icon} w-5 text-center`} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* 底部：用户 + 设置 */}
      <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
        {user ? (
          <AccountSwitcher />
        ) : (
          <NavLink to="/login" className="sidebar-link">
            <i className="fa-solid fa-right-to-bracket w-5 text-center" />
            <span>登录</span>
          </NavLink>
        )}

        <NavLink
          to="/settings"
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <i className="fa-solid fa-gear w-5 text-center" />
          <span>设置</span>
        </NavLink>
      </div>
    </aside>
  );
}
