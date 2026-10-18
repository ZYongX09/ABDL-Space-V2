import React, { createContext, useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link } from 'react-router-dom';
import { NotificationProvider, useNotifications } from '../src/contexts/NotificationContext.jsx';
import { ToastProvider, useToast } from '../src/contexts/ToastContext.jsx';
import MessagesPage from '../src/pages/MessagesPage.jsx';

const Auth = createContext();
export const useFixtureAuth = () => useContext(Auth);
const accounts = [{ id: 1, token: 'fixture-A' }, { id: 3, token: 'fixture-B' }];
function Controls() {
  const { user, setAccount, revise } = useFixtureAuth();
  const { unreadCount, messageUnread, conversations, refreshConversations, fetchUnread, markConversationRead } = useNotifications();
  const { error, toasts } = useToast();
  const [diagnostics, setDiagnostics] = useState({});
  const inspect = async () => {
    const state = await fetch('/__fixture/state').then(response => response.json());
    setDiagnostics({ scenario: state.scenario, calls: state.calls, events: state.events.slice(-8) });
  };
  const scenario = async value => { await fetch('/__fixture/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: value }) }); await inspect(); };
  useEffect(() => { void inspect(); }, []);
  const visibility = hidden => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  return <section>
    <h1>D1 本地真实 React effects 验收</h1>
    <p>仅本地合成数据；无生产 env/代理、统计、字体、SW、NSFW 或推送。StrictMode 开启，调度真实 30 秒/超时 15 秒。</p>
    <p>账号 {user ? user.id === 1 ? 'A' : 'B' : '未登录'}；通知 {unreadCount}；私信未读 {messageUnread}；toast数 {toasts.length}</p>
    <div>{['success', '429', '401', 'slow', 'messages-error', 'send-slow', 'load-send-error'].map(value => <button key={value} onClick={() => scenario(value)}>场景 {value}</button>)}</div>
    <div><button onClick={() => setAccount('A')}>账号 A</button><button onClick={() => setAccount('B')}>账号 B</button><button onClick={() => setAccount(null)}>注销</button><button onClick={revise}>同账号资料刷新</button><button onClick={() => error('手动toast，不能触发消息重拉')}>插入 toast</button></div>
    <div><button onClick={() => { void refreshConversations(); void fetchUnread(); }}>手动刷新（遵守冷却）</button><button onClick={() => { void markConversationRead(2).catch(error); }}>手动已读（单次写）</button><button onClick={() => visibility(true)}>模拟隐藏</button><button onClick={() => visibility(false)}>模拟恢复可见</button><button onClick={inspect}>查看请求计数</button></div>
    <nav><Link to="/messages">会话列表</Link> <Link to="/messages?user=2">打开会话 2</Link> <Link to="/messages?user=4">打开会话 4</Link></nav>
    <pre id="d1-snapshot">{JSON.stringify({ conversations, unreadCount, messageUnread }, null, 2)}</pre>
    <pre id="d1-diagnostics">{JSON.stringify(diagnostics, null, 2)}</pre>
  </section>;
}
function Fixture() {
  const [user, setUser] = useState({ id: 1, username: 'fixture-A' });
  const [mounted, setMounted] = useState(true);
  const setAccount = account => {
    const id = account === 'A' ? 1 : account === 'B' ? 3 : null;
    localStorage.setItem('abdl_accounts', JSON.stringify(accounts));
    if (id) localStorage.setItem('abdl_active_account', String(id)); else localStorage.removeItem('abdl_active_account');
    setUser(id ? { id, username: `fixture-${account}` } : null);
  };
  return <Auth.Provider value={{ user, accounts, setAccount, revise: () => setUser(previous => previous ? { ...previous, username: previous.username + '.' } : null) }}>
    <button onClick={() => setMounted(value => !value)}>{mounted ? '卸载' : '重新挂载'} Provider 与聊天页</button>
    {mounted && <ToastProvider><NotificationProvider><Controls /><MessagesPage /></NotificationProvider></ToastProvider>}
  </Auth.Provider>;
}
localStorage.setItem('abdl_accounts', JSON.stringify(accounts));
localStorage.setItem('abdl_active_account', '1');
const style = document.createElement('style');
style.textContent = 'body{font:16px system-ui;margin:20px;--text:#222;--text-muted:#666;--primary:#3367aa}button,a{margin:5px;padding:8px}pre{white-space:pre-wrap;font-size:13px;background:#eee;padding:12px}.msg-container{display:flex;border:1px solid #aaa;padding:12px;gap:24px}.msg-chat{flex:1}.msg-messages{min-height:120px}.toast-container{background:#fee;padding:8px}.msg-convo-item{display:block}';
document.head.appendChild(style);
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><Fixture /></BrowserRouter></React.StrictMode>);
