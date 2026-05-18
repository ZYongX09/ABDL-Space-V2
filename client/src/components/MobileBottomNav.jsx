import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', icon: 'fa-regular fa-house', label: '首页' },
  { to: '/messages', icon: 'fa-regular fa-envelope', label: '私信' },
  { to: '/diapers', icon: 'fa-regular fa-baby', label: '纸尿裤' },
  { to: '/recommend', icon: 'fa-regular fa-wand-magic-sparkles', label: 'AI' },
  { to: '/profile', icon: 'fa-regular fa-user', label: '我的' },
];

export default function MobileBottomNav() {
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
          <i className={`fa-solid ${tab.icon}`} />
        </NavLink>
      ))}
    </nav>
  );
}
