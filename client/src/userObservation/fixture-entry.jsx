import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext.jsx';
import { ToastProvider } from '../contexts/ToastContext.jsx';
import { ThemeProvider, useTheme } from '../contexts/ThemeContext.jsx';
import AdminRouteGate from '../pages/admin/gate.jsx';
import AdminSecurity from '../pages/admin/security.jsx';
import AdminUsers from '../pages/admin/users.jsx';
import '../styles/global.css';

function FixtureControls() {
  const { setTheme } = useTheme();
  const control = async body => {
    window.dispatchEvent(new Event('auth-session-changing'));
    await fetch('/__fixture/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    window.location.assign('/admin/security?tab=user-observation&user_id=3');
  };
  return <aside className="ac-admin-theme" style={{ position: 'relative', zIndex: 100, marginLeft: 'max(8px, calc(100vw - 1000px))', padding: 8, background: 'var(--ac-surface)', color: 'var(--ac-text)' }}><strong>仅本地模拟 · 不连接生产 API</strong><div className="uo-actions"><button className="ac-btn" onClick={() => control({ id: 1 })}>超管</button><button className="ac-btn" onClick={() => control({ id: 2 })}>普通管理员</button><button className="ac-btn" onClick={() => control({ id: 0 })}>退出并清空</button><label>预设场景 <select className="ac-select" defaultValue="normal" onChange={event => control({ scenario: event.target.value })}>{['normal', 'empty', 'large', 'slow', 'conflict', 'save-error', 'unavailable', 'schema-unavailable', 'invalid', 'unauthorized', 'forbidden'].map(value => <option key={value}>{value}</option>)}</select></label><label>主题 <select className="ac-select" onChange={event => setTheme(event.target.value)} defaultValue="light"><option value="light">浅色</option><option value="dark">深色</option><option value="colorful">多彩（后台跟随系统）</option></select></label></div></aside>;
}
createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeProvider><AuthProvider><ToastProvider><BrowserRouter><FixtureControls /><Routes><Route element={<AdminRouteGate />}><Route path="/admin/security" element={<AdminSecurity />} /><Route path="/admin/users" element={<AdminUsers />} /></Route><Route path="*" element={<Navigate to="/admin/security?tab=user-observation&user_id=3" replace />} /></Routes></BrowserRouter></ToastProvider></AuthProvider></ThemeProvider></React.StrictMode>);
