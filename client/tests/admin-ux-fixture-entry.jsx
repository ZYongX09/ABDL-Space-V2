// 真实后台组件的测试专用入口；不导入 App/main/index，不替换真实 gate/API/controller。
import React, { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '/src/contexts/AuthContext.jsx';
import { ThemeProvider, useTheme } from '/src/contexts/ThemeContext.jsx';
import { ToastProvider } from '/src/contexts/ToastContext.jsx';
import AdminRouteGate, { AdminUnknownRoute } from '/src/pages/admin/gate.jsx';
import ErrorBoundary from '/src/components/ErrorBoundary.jsx';
import '/src/styles/global.css';
import '/src/styles/siteAccess.css';
import '/src/pages/admin/admin.css';
import './admin-ux-fixture/controls.css';

const pageDefinitions = window.__ADMIN_UX_PAGES__ || [];
const modules = import.meta.glob('/src/pages/admin/*.jsx');
const components = Object.fromEntries(pageDefinitions.map(page => [page.path, lazy(modules[`/src/pages/admin/${page.module}.jsx`])]));
const mobileStyles = Promise.resolve(); // Web root 没有 mobile.css；禁止引入不存在的条件模块。
const json = async (path, body) => {
  const response = await fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `本地宿主错误 ${response.status}`);
  return data;
};

function FixtureControls({ state, onState, refresh }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { refreshUser } = useAuth();
  const [role, setRole] = useState(state.role);
  const [scenario, setScenario] = useState(state.scenario);
  const [feature, setFeature] = useState('appAI');
  const [featureScenario, setFeatureScenario] = useState('normal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const act = async (body, remount = true) => {
    setBusy(true); setError('');
    try { const next = await json('/__admin-ux/setup', body); onState(next); if (remount) refresh(); else await refreshUser(); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  };
  return <aside className="admin-ux-controls" aria-label="隔离合成验收控制台">
    <details open={pathname === '/__admin-ux/start'}>
      <summary>隔离合成验收 · {state.platform} · {state.role} · {state.scenario} · API 外发 0</summary>
      <p>此条不是产品页面。下方为真实管理路由、页面、API 和控制器；所有写入只在本进程内存。照片是本浏览器生成的几何图；不支付、不推送、不请求外部 AI。</p>
      <div className="admin-ux-control-grid">
        <label>合成角色<select aria-label="合成角色" value={role} onChange={event => setRole(event.target.value)}>{state.roles.map(value => <option key={value} value={value}>{({ superadmin: '超级管理员', admin: '普通管理员', user: '普通用户', loggedout: '未登录' })[value]}</option>)}</select></label>
        <label>全局场景<select aria-label="全局场景" value={scenario} onChange={event => setScenario(event.target.value)}>{state.scenarios.map(value => <option key={value} value={value}>{({ normal: '正常读写', empty: '空列表 / 零统计', slow: '延迟 1800ms', errorwrite: '写入失败 503', readonly: '只读（写入拒绝）', 409: '版本冲突 409', 401: 'API 会话失效 401', 403: 'API 拒绝 403', longlists: '长列表 / 分页', errorread: '读取失败 503' })[value]}</option>)}</select></label>
        <label>真实主题<select aria-label="真实主题" value={theme} onChange={event => setTheme(event.target.value)}>{state.themes.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <div className="admin-ux-actions"><button type="button" disabled={busy} onClick={() => act({ role, scenario })}>应用角色与场景（重建合成数据）</button><button type="button" disabled={busy} onClick={() => act({ reset: true })}>重置内存数据</button><button type="button" disabled={busy} onClick={() => act({ role }, false)}>仅切换角色（保留页面，测真实 gate）</button></div>
      <div className="admin-ux-control-grid">
        <label>原 fixture 功能<select aria-label="原 fixture 功能" value={feature} onChange={event => { setFeature(event.target.value); setFeatureScenario('normal'); }}>{Object.keys(state.featureOptions).map(value => <option key={value}>{value}</option>)}</select></label>
        <label>功能专用场景<select aria-label="功能专用场景" value={featureScenario} onChange={event => setFeatureScenario(event.target.value)}>{state.featureOptions[feature].map(value => <option key={value}>{value}</option>)}</select></label>
        <button type="button" disabled={busy} onClick={() => act({ feature, featureScenario })}>应用功能场景（不重置数据）</button>
      </div>
      <label>真实后台页面<select aria-label="真实后台页面" value={pageDefinitions.some(page => page.path === pathname) ? pathname : ''} onChange={event => { if (event.target.value) navigate(event.target.value); }}><option value="">选择路由</option>{pageDefinitions.map(page => <option key={page.path} value={page.path}>{page.label} · {page.path}</option>)}</select></label>
      <nav aria-label="真实后台路由清单">{pageDefinitions.map(page => <Link key={page.path} to={page.path}>{page.label}</Link>)}<Link to="/admin/unknown">未知管理路由</Link></nav>
      <details><summary>已知合成边界与最近 API</summary><ul>{state.gaps.map(gap => <li key={gap}>{gap}</li>)}</ul><button type="button" onClick={async () => { try { onState(await json('/__admin-ux/state')); } catch (error) { setError(error.message); } }}>刷新请求记录</button><pre>{state.requests.map(call => `${call.method} ${call.path} → ${call.status}`).join('\n') || '尚无业务请求'}</pre></details>
      {error && <p role="alert">{error}</p>}
    </details>
  </aside>;
}

function OutOfScope() {
  return <main className="admin-ux-scope"><h1>此路径不在管理后台合成验收范围</h1><p>没有挂载生产前台、OAuth 或登录表单。请使用上方合成角色控制和真实管理路由；不会导航到外站。</p><Link to="/admin">返回真实管理概览</Link></main>;
}
function Harness() {
  const [state, setState] = useState(null);
  const [epoch, setEpoch] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => { json('/__admin-ux/state').then(setState).catch(error => setError(error.message)); }, []);
  if (error) return <main role="alert">隔离宿主初始化失败：{error}</main>;
  if (!state) return <main role="status">正在读取合成验收控制…</main>;
  return <ThemeProvider><AuthProvider key={epoch}><ToastProvider>
    <FixtureControls state={state} onState={setState} refresh={() => setEpoch(value => value + 1)} />
    <div className={state.platform === 'mobile' ? 'admin-host' : undefined}>
      <ErrorBoundary><Suspense fallback={<div role="status" className="admin-console ac-access-state">正在加载真实后台页面…</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/__admin-ux/start" element={<Navigate to="/admin" replace />} />
          <Route element={<AdminRouteGate />}>
            {pageDefinitions.map(page => { const Page = components[page.path]; return <Route key={page.path} path={page.path} element={<Page />} />; })}
            <Route path="/admin/*" element={<AdminUnknownRoute />} />
          </Route>
          <Route path="*" element={<OutOfScope />} />
        </Routes>
      </Suspense></ErrorBoundary>
    </div>
  </ToastProvider></AuthProvider></ThemeProvider>;
}

async function start() {
  await mobileStyles;
  // URL 必须由当前浏览器创建；Node blob URL 在浏览器不可用，绝不使用它。
  const svg = await fetch('/__admin-ux/image.svg').then(response => response.text());
  const photoURL = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await json('/__admin-ux/setup', { photoURL });
  window.addEventListener('pagehide', () => URL.revokeObjectURL(photoURL), { once: true });
  createRoot(document.getElementById('root')).render(<BrowserRouter><Harness /></BrowserRouter>);
}
start().catch(error => { const root = document.getElementById('root'); root.setAttribute('role', 'alert'); root.textContent = `合成入口未启动：${error.message}`; });
