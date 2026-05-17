import { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import MobileBottomNav from './components/MobileBottomNav';
import BackToTop from './components/BackToTop';
import BackButton from './components/BackButton';
import ScrollProgress from './components/ScrollProgress';
import ErrorBoundary from './components/ErrorBoundary';
import ForumFeed from './pages/ForumFeed';
import PostDetail from './pages/PostDetail';
import Home from './pages/Home';
import DiaperDetail from './pages/DiaperDetail';
import Rankings from './pages/Rankings';
import ComparePage from './pages/ComparePage';
import Recommendations from './pages/Recommendations';
import TermWiki from './pages/TermWiki';
import About from './pages/About';
import CookiePolicy from './pages/CookiePolicy';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import Login from './pages/Login';
import Register from './pages/Register';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import UserPage from './pages/UserPage';
import MessagesPage from './pages/MessagesPage';
import NotificationsPage from './pages/NotificationsPage';
import AdminPage from './pages/AdminPage';
import ExternalLink from './pages/ExternalLink';
import { useExternalLinkInterceptor } from './hooks/useExternalLinkInterceptor';

const ROUTE_TITLES = {
  '/': '论坛 — ABDL Space',
  '/diapers': '纸尿裤列表 — ABDL Space',
  '/rankings': '排行榜 — ABDL Space',
  '/compare': '对比工具 — ABDL Space',
  '/recommend': 'AI 推荐 — ABDL Space',
  '/termwiki': '术语 Wiki — ABDL Space',
  '/profile': '个人中心 — ABDL Space',
  '/login': '登录 — ABDL Space',
  '/register': '注册 — ABDL Space',
  '/messages': '私信 — ABDL Space',
  '/notifications': '通知 — ABDL Space',
  '/admin': '管理后台 — ABDL Space',
  '/external': '外部链接 — ABDL Space',
  '/about': '关于 — ABDL Space',
  '/settings': '设置 — ABDL Space',
};

function getTitle(pathname) {
  if (ROUTE_TITLES[pathname]) return ROUTE_TITLES[pathname];
  if (pathname.startsWith('/diaper/')) return '纸尿裤详情 — ABDL Space';
  if (pathname.startsWith('/forum/')) return '帖子详情 — ABDL Space';
  if (pathname.startsWith('/user/')) return '用户主页 — ABDL Space';
  return 'ABDL Space';
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.title = getTitle(pathname);
  }, [pathname]);
  return null;
}

export default function App() {
  const navigate = useNavigate();
  const { user } = useAuth();
  useExternalLinkInterceptor();

  // 全局键盘快捷键
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      const key = e.key.toLowerCase();
      // Alt+数字导航
      const navMap = { '1': '/', '2': '/diapers', '3': '/rankings', '4': '/recommend', '5': '/profile' };
      if (e.altKey && navMap[key]) { e.preventDefault(); navigate(navMap[key]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <div className="app-layout">
      <ScrollToTop />
      <Sidebar />
      <div className="app-main-content">
        <div className="container mx-auto px-5 py-6 max-w-[860px] page-enter">
          <BackButton />
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<ForumFeed />} />
              <Route path="/forum/:id" element={<PostDetail />} />
              <Route path="/diapers" element={<Home />} />
              <Route path="/diaper/:id" element={<DiaperDetail />} />
              <Route path="/rankings" element={<Rankings />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/recommend" element={<Recommendations />} />
              <Route path="/termwiki" element={<TermWiki />} />
              <Route path="/about" element={<About />} />
              <Route path="/cookies" element={<CookiePolicy />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/user/:id" element={<UserPage />} />
              <Route path="/messages" element={<MessagesPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/external" element={<ExternalLink />} />
            </Routes>
          </ErrorBoundary>
        </div>
        <footer className="text-center py-5 text-xs space-y-2" style={{ color: 'var(--text-muted)' }}>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <i className="fa-solid fa-baby" style={{ color: 'var(--primary)' }} />
            <span>ABDL Space v2 · © {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <a href="/" style={{ color: 'var(--link-color)', textDecoration: 'none' }}>论坛</a>
            <a href="/termwiki" style={{ color: 'var(--link-color)', textDecoration: 'none' }}><i className="fa-solid fa-book mr-1" />术语 Wiki</a>
            <a href="/settings" style={{ color: 'var(--link-color)', textDecoration: 'none' }}><i className="fa-solid fa-gear mr-1" />设置</a>
            <a href="/about" style={{ color: 'var(--link-color)', textDecoration: 'none' }}><i className="fa-solid fa-circle-info mr-1" />关于</a>
            {user?.role === 'admin' && (
              <a href="/admin" style={{ color: 'var(--link-color)', textDecoration: 'none' }}><i className="fa-solid fa-shield-halved mr-1" />管理</a>
            )}
          </div>
        </footer>
      </div>
      <MobileBottomNav />
      <ScrollProgress />
      <BackToTop />
    </div>
  );
}
