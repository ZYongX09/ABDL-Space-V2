import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { safeMediaURL } from './model.js';
import '../pages/admin/admin.css';
import './console.css';

const NAV = [
  ['/merchant', '运营概览', 'grid'], ['/merchant/ads', '广告管理', 'ads'],
  ['/merchant/reports', '效果报表', 'chart'], ['/merchant/company', '企业资料', 'company'],
  ['/merchant/audit', '操作记录', 'audit'],
];
const PATHS = {
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  ads: 'M3 5h18v14H3z M7 9h6 M7 13h10 M7 16h7',
  chart: 'M4 3v17h17 M8 15v-4 M13 15V7 M18 15V4',
  company: 'M4 21V3h12v18 M16 9h4v12 M8 7h4 M8 11h4 M8 15h4 M8 21v-3h4v3',
  audit: 'M6 3h12v18H6z M9 7h6 M9 11h6 M9 15h4',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M21 21v-2a4 4 0 0 0-3-3.9 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 3a4 4 0 0 1 0 8',
  menu: 'M4 6h16 M4 12h16 M4 18h16', close: 'M6 6l12 12 M18 6 6 18',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
};
export function Icon({ name, ...props }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={PATHS[name] || PATHS.ads} /></svg>;
}
export function merchantTitle(pathname) {
  if (pathname === '/merchant/ads/new') return '新建广告';
  if (/^\/merchant\/ads\/[^/]+\/edit\/?$/.test(pathname)) return '编辑广告';
  if (pathname === '/merchant/merchants') return '企业管理';
  return NAV.find(([path]) => path === pathname)?.[1] || '商家控制台';
}
export default function MerchantLayout({ info, username, children, locked = false }) {
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const side = useRef(null);
  const menu = useRef(null);
  const content = useRef(null);
  useEffect(() => { setDrawer(false); content.current?.scrollTo(0, 0); document.title = `${merchantTitle(pathname)} · ABDL Space 商家控制台`; }, [pathname]);
  useEffect(() => {
    if (!drawer) return undefined;
    const previous = document.activeElement;
    side.current?.querySelector('button, a')?.focus();
    const closeOnDesktop = () => { if (window.innerWidth > 1023) setDrawer(false); };
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); setDrawer(false); }
      if (event.key === 'Tab') {
        const targets = [...(side.current?.querySelectorAll('button, a[href]') || [])];
        const first = targets[0]; const last = targets[targets.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey); window.addEventListener('resize', closeOnDesktop);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', closeOnDesktop); if (previous?.isConnected) previous.focus(); };
  }, [drawer]);
  const profile = info?.profile || info?.merchant;
  const links = info?.is_super_admin && info?.permissions?.can_manage_all ? [...NAV, ['/merchant/merchants', '企业管理', 'users']] : NAV;
  return <div className="admin-console merchant-console ac-admin-theme" data-merchant-host>
    <a className="mc-skip" href="#merchant-content">跳转到主内容</a>
    {drawer && <button type="button" className="mc-drawer-backdrop" aria-label="关闭导航" onClick={() => setDrawer(false)} />}
    <aside ref={side} id="merchant-navigation" className={`ac-side ${drawer ? 'open' : ''}`} role={drawer ? 'dialog' : undefined} aria-modal={drawer || undefined} aria-label="商家控制台导航">
      <div className="ac-side-head"><span className="ac-logo"><Icon name="company" /></span><div className="ac-side-brand"><div className="ac-side-title">商家控制台</div><div className="ac-side-sub">ABDL SPACE · BUSINESS</div></div><button type="button" className="ac-side-close" aria-label="关闭导航" onClick={() => setDrawer(false)}><Icon name="close" /></button></div>
      <div className="ac-side-body"><div className="ac-nav-group">运营工作台</div><nav aria-label="运营模块">{links.map(([path, label, icon]) => locked ? <span key={path} className="ac-nav-item mc-nav-disabled" aria-disabled="true"><Icon name={icon} /><span>{label}</span></span> : <NavLink key={path} to={path} end={path === '/merchant'} className={({ isActive }) => `ac-nav-item ${isActive ? 'active' : ''}`}><Icon name={icon} /><span>{label}</span></NavLink>)}</nav></div>
      <div className="mc-side-account"><span className="mc-avatar">{safeMediaURL(profile?.avatar_url) ? <img src={safeMediaURL(profile.avatar_url)} alt="" /> : <Icon name="company" />}</span><div className="ac-grow"><strong>{info?.is_super_admin ? '全平台运营' : profile?.display_name || '企业未开通'}</strong><small>{info?.is_super_admin ? '超级管理员' : locked ? '待验证商家权限' : '商家账户'}</small></div></div>
      <div className="ac-side-foot"><Link to="/" className="ac-topbar-link">返回社区 <Icon name="arrow" width="15" height="15" /></Link></div>
    </aside>
    <div className="ac-main" inert={drawer ? '' : undefined}>
      <header className="ac-topbar"><button type="button" ref={menu} className="ac-hamburger" aria-label="打开商家导航" aria-controls="merchant-navigation" aria-expanded={drawer} onClick={() => setDrawer(true)}><Icon name="menu" /></button><span className="ac-topbar-title">{merchantTitle(pathname)}</span><div className="ac-topbar-right"><span className="mc-role">{info?.is_super_admin ? '全平台运营' : '商家工作台'}</span><span className="ac-topbar-divider" /><span className="ac-topbar-username">{username || '未登录'}</span></div></header>
      <main ref={content} id="merchant-content" className="ac-content" tabIndex={-1}><div className="ac-content-inner ac-page-stack">{children ?? <Outlet />}</div></main>
    </div>
  </div>;
}
