import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './admin.css';

const NAV = [
  {
    group: '运营',
    items: [
      { key: 'overview', path: '/admin', label: '仪表盘概览', icon: 'fa-gauge-high' },
    ],
  },
  {
    group: '成员',
    items: [
      { key: 'users', path: '/admin/users', label: '用户管理', icon: 'fa-users' },
      { key: 'badges', path: '/admin/badges', label: '徽章体系', icon: 'fa-medal' },
    ],
  },
  {
    group: '内容',
    items: [
      { key: 'posts', path: '/admin/posts', label: '帖子', icon: 'fa-file-lines' },
      { key: 'comments', path: '/admin/comments', label: '评论', icon: 'fa-comments' },
      { key: 'novels', path: '/admin/novels', label: '小说作品', icon: 'fa-book-open' },
    ],
  },
  {
    group: '互动治理',
    items: [
      { key: 'reports', path: '/admin/reports', label: '举报中心', icon: 'fa-flag' },
      { key: 'push', path: '/admin/notifications', label: '推送通知', icon: 'fa-bell' },
      { key: 'diapers', path: '/admin/diapers', label: '纸尿裤 / 品牌', icon: 'fa-tags' },
    ],
  },
  {
    group: '系统',
    items: [
      { key: 'security', path: '/admin/security', label: '安全中心', icon: 'fa-shield-halved' },
      { key: 'settings', path: '/admin/settings', label: '站点设置', icon: 'fa-gear' },
    ],
  },
];

const TITLES = {
  overview: '仪表盘概览',
  users: '用户管理',
  badges: '徽章体系',
  posts: '帖子管理',
  comments: '评论管理',
  novels: '小说作品',
  reports: '举报中心',
  push: '推送通知',
  diapers: '纸尿裤 / 品牌',
  security: '安全中心',
  settings: '站点设置',
};

export default function AdminLayout({ active = 'overview', children }) {
  const { user } = useAuth();
  const [sideOpen, setSideOpen] = useState(false);

  useEffect(() => {
    document.title = `${TITLES[active] || '管理后台'} — ABDL Space`;
  }, [active]);

  if (!user || user.role !== 'admin') {
    return (
      <div className="admin-console" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-lock" style={{ fontSize: 34, display: 'block', marginBottom: 12, opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>仅管理员可访问</p>
          <a className="ac-btn primary" href="/" style={{ marginTop: 14 }}>返回前台</a>
        </div>
      </div>
    );
  }

  const cur = NAV.flatMap(g => g.items).find(i => i.key === active);

  return (
    <div className="admin-console">
      {sideOpen && <div className="ac-side-mask" onClick={() => setSideOpen(false)} />}
      <aside className={`ac-side ${sideOpen ? 'open' : ''}`}>
        <div className="ac-side-head">
          <div className="ac-logo"><i className="fa-solid fa-baby" /></div>
          <div>
            <div className="ac-side-title">ABDL Space 控制台</div>
            <div className="ac-side-sub">COMMUNITY OPERATIONS</div>
          </div>
        </div>
        <div className="ac-side-body">
          {NAV.map(g => (
            <div key={g.group}>
              <div className="ac-nav-group">{g.group}</div>
              {g.items.map(it => (
                <Link
                  key={it.key}
                  to={it.path}
                  className={`ac-nav-item ${active === it.key ? 'active' : ''}`}
                  onClick={() => setSideOpen(false)}
                >
                  <i className={`fa-solid ${it.icon} fa-icon`} />
                  {it.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
        <div className="ac-side-foot">
          <i className="fa-solid fa-circle-info" />
          生产环境 · v2 web
        </div>
      </aside>

      <div className="ac-main">
        <header className="ac-topbar">
          <button className="ac-hamburger" onClick={() => setSideOpen(true)}>
            <i className="fa-solid fa-bars" />
          </button>
          <span className="ac-crumb">
            ABDL Space 管理后台 <i className="fa-solid fa-angle-right" style={{ fontSize: 10, margin: '0 6px', opacity: 0.5 }} />
            <b>{cur ? cur.label : '...'}</b>
          </span>
          <div className="ac-topbar-right">
            <a className="ac-topbar-link" href="/">
              <i className="fa-solid fa-arrow-up-right-from-square" /> 返回前台
            </a>
            <span className="ac-topbar-user">
              {user.avatar && <img className="ac-avatar" src={user.avatar} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />}
              <span>{user.username || user.display_name}</span>
            </span>
          </div>
        </header>
        <div className="ac-content">
          <div className="ac-content-inner">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}