import { useEffect, useRef, useState } from 'react';
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
      { key: 'sponsors', path: '/admin/sponsors', label: '赞助者管理', icon: 'fa-heart' },
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

const PAGE_META = {
  overview: { title: '仪表盘概览', description: '查看社区核心数据、运营趋势与待处理事项。' },
  users: { title: '用户管理', description: '查询用户、查看账户详情并执行账户治理操作。' },
  sponsors: { title: '赞助者管理', description: '管理赞助方案、用户权益、兑换码与库存。' },
  badges: { title: '徽章体系', description: '维护徽章资料，并管理徽章发放与持有者。' },
  posts: { title: '帖子管理', description: '检索、置顶和治理社区帖子内容。' },
  comments: { title: '评论管理', description: '检索帖子评论并处理违规内容。' },
  novels: { title: '小说作品', description: '审核与管理社区小说作品的发布状态。' },
  reports: { title: '举报中心', description: '集中处理内容举报与交友请求举报。' },
  push: { title: '推送通知', description: '向指定平台或用户发送通知并查看投递记录。' },
  diapers: { title: '纸尿裤与品牌', description: '维护产品资料、品牌信息与展示内容。' },
  security: { title: '安全中心', description: '查看安全事件、风险分布与近期日志。' },
  settings: { title: '站点设置', description: '维护运行模式、站点配置、邮箱治理与管理员账号安全。' },
};

export default function AdminLayout({ active = 'overview', children }) {
  const { user, loading } = useAuth();
  const [sideOpen, setSideOpen] = useState(false);
  const hamburgerRef = useRef(null);
  const sideRef = useRef(null);
  const meta = PAGE_META[active] || { title: '管理后台', description: '' };

  useEffect(() => {
    document.title = `${meta.title} — ABDL Space`;
    document.body.classList.add('admin-mode');
    return () => document.body.classList.remove('admin-mode');
  }, [meta.title]);

  useEffect(() => {
    if (!sideOpen) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const side = sideRef.current;
      const target = side?.querySelector('[aria-current="page"]')
        || side?.querySelector('a')
        || side?.querySelector('button');
      target?.focus();
    });
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSideOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [sideOpen]);

  const closeSide = () => {
    setSideOpen(false);
    window.requestAnimationFrame(() => hamburgerRef.current?.focus());
  };

  if (loading) {
    return (
      <div className="admin-console ac-access-state" role="status" aria-live="polite">
        <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
        <span>正在验证管理员身份…</span>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="admin-console ac-access-state">
        <div className="ac-access-card">
          <span className="ac-access-icon"><i className="fa-solid fa-lock" aria-hidden="true" /></span>
          <h1>仅管理员可访问</h1>
          <p>当前账户没有管理后台权限。</p>
          <a className="ac-btn primary" href="/">返回前台</a>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-console">
      {sideOpen && <button type="button" className="ac-side-mask" aria-label="关闭管理导航" onClick={closeSide} />}
      <aside ref={sideRef} id="admin-navigation" className={`ac-side ${sideOpen ? 'open' : ''}`} aria-label="管理后台导航">
        <div className="ac-side-head">
          <div className="ac-logo"><i className="fa-solid fa-baby" aria-hidden="true" /></div>
          <div className="ac-side-brand">
            <div className="ac-side-title">ABDL Space</div>
            <div className="ac-side-sub">管理控制台</div>
          </div>
          <button type="button" className="ac-side-close" aria-label="关闭管理导航" onClick={closeSide}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <nav className="ac-side-body">
          {NAV.map(group => (
            <div className="ac-nav-section" key={group.group}>
              <div className="ac-nav-group">{group.group}</div>
              {group.items.map(item => (
                <Link
                  key={item.key}
                  to={item.path}
                  className={`ac-nav-item ${active === item.key ? 'active' : ''}`}
                  aria-current={active === item.key ? 'page' : undefined}
                  onClick={() => setSideOpen(false)}
                >
                  <span className="ac-nav-icon"><i className={`fa-solid ${item.icon}`} aria-hidden="true" /></span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="ac-side-foot">
          <span className="ac-status-dot" aria-hidden="true" />
          <span>生产环境</span>
          <span className="ac-side-version">Web v2</span>
        </div>
      </aside>

      <div className="ac-main">
        <header className="ac-topbar">
          <button
            ref={hamburgerRef}
            type="button"
            className="ac-hamburger"
            aria-label="打开管理导航"
            aria-expanded={sideOpen}
            aria-controls="admin-navigation"
            onClick={() => setSideOpen(true)}
          >
            <i className="fa-solid fa-bars" aria-hidden="true" />
          </button>
          <div className="ac-topbar-title">{meta.title}</div>
          <div className="ac-topbar-right">
            <a className="ac-topbar-link" href="/">
              <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
              <span>返回前台</span>
            </a>
            <div className="ac-topbar-divider" aria-hidden="true" />
            <span className="ac-topbar-user">
              {user.avatar ? (
                <img className="ac-avatar" src={user.avatar} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} />
              ) : (
                <span className="ac-avatar ac-avatar-fallback"><i className="fa-solid fa-user" aria-hidden="true" /></span>
              )}
              <span className="ac-topbar-username">{user.username || user.display_name}</span>
            </span>
          </div>
        </header>
        <main className="ac-content">
          <div className="ac-content-inner">
            <div className="ac-page-heading">
              <div>
                <h1>{meta.title}</h1>
                {meta.description && <p>{meta.description}</p>}
              </div>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
