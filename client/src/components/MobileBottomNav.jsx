import { NavLink } from 'react-router-dom';
import { useNotifications } from '../contexts/NotificationContext';

const TABS = [
  { to: '/', icon: 'fa-solid fa-house', label: '首页' },
  { to: '/messages', icon: 'fa-solid fa-envelope', label: '私信', badge: 'message' },
  { to: '/diapers', icon: 'fa-solid fa-baby', label: '纸尿裤' },
  { to: '/recommend', icon: 'fa-solid fa-wand-magic-sparkles', label: 'AI' },
  { to: '/profile', icon: 'fa-solid fa-user', label: '我的' },
];

export default function MobileBottomNav() {
  const { messageUnread } = useNotifications();

  return (
    <nav className="bottom-nav-floating">
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/'}
          className={({ isActive }) => isActive ? 'active' : ''}
          title={tab.label}
        >
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <i className={`fa-solid ${tab.icon}`} />
            {tab.badge === 'message' && messageUnread > 0 && (
              <span className="notif-badge" style={{
                position: 'absolute', top: '-6px', right: '-10px',
                minWidth: '16px', height: '16px', borderRadius: '8px',
                fontSize: '10px', lineHeight: '16px', textAlign: 'center',
                padding: '0 4px', background: 'var(--danger)', color: '#fff',
                fontWeight: 700,
              }}>
                {messageUnread > 99 ? '99+' : messageUnread}
              </span>
            )}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}
