import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', icon: 'fa-comments', label: '广场' },
  { to: '/diapers', icon: 'fa-baby', label: '纸尿裤' },
  { to: '/recommend', icon: 'fa-wand-magic-sparkles', label: 'AI' },
  { to: '/profile', icon: 'fa-user', label: '我的' },
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
