import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import ChatMessage from '../components/ChatMessage';
import NewConversation from '../components/NewConversation';
import { Spinner } from '../components/Feedback';
import { useAuth } from '../contexts/AuthContext';
import { useMobileHeaderActions } from '../contexts/MobileHeaderContext';
import { useToast } from '../contexts/ToastContext';
import { messagesAPI } from '../api';
import { useNotifications } from '../contexts/NotificationContext';
import { accountSessionKey, runWithDeadline } from '../notifications/scheduler.js';

export default function MessagesPage() {
  const { user, accounts } = useAuth();
  const userId = user?.id;
  const session = accountSessionKey(user, accounts);
  const { error: showError } = useToast();
  const { conversations, conversationsLoading, sessionPaused, refreshConversations, markConversationRead } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeUserId = searchParams.get('user');

  const [convoSearch, setConvoSearch] = useState('');
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const { registerActions } = useMobileHeaderActions();

  useEffect(() => {
    registerActions(
      [{ icon: 'fa-solid fa-user-plus', onClick: () => setShowNewConvo(true), title: '新私信' }],
      []
    );
    return () => registerActions([], []);
  }, [registerActions]);
  const [showList, setShowList] = useState(!activeUserId);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const requestRef = useRef(null);
  const generationRef = useRef(0);
  // effect 只认稳定账号 session + 会话 ID。A-B-A 也必须作废最初 A 的结果。
  useLayoutEffect(() => {
    generationRef.current++;
    requestRef.current?.abort();
    setMessages([]);
    setOtherUser(null);
    setInput('');
    setSending(false);
    setShowNewConvo(false);
    return () => { requestRef.current?.abort(); };
  }, [session, sessionPaused, activeUserId]);

  const loadMessages = useCallback(async (peerId) => {
    if (!session || sessionPaused || !peerId || document.hidden) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const generation = ++generationRef.current;
    const current = () => !controller.signal.aborted && generation === generationRef.current;
    setLoading(true);
    try {
      await runWithDeadline(async signal => {
        const data = await messagesAPI.getMessages(Number(peerId), { signal });
        if (!current() || signal.aborted) return;
        setMessages((data.messages || []).map(message => ({ ...message, isOwn: message.sender_id === userId })));
        const API_BASE = import.meta.env.VITE_API_BASE || '';
        let other = { id: Number(peerId), username: '用户' };
        if (API_BASE) {
          try {
            const response = await fetch(`${API_BASE}/api/users/${peerId}`, { credentials: 'include', signal });
            if (response.ok) { const data = await response.json(); other = data.user || data; }
          } catch (error) {
            if (signal.aborted) throw error;
          }
        } else {
          const users = JSON.parse(localStorage.getItem('abdl_users') || '{}');
          const offlineUser = Object.values(users).find(candidate => candidate.id === Number(peerId));
          if (offlineUser) other = { id: offlineUser.id, username: offlineUser.username };
        }
        if (!current() || signal.aborted) return;
        setOtherUser(other);
        await markConversationRead(Number(peerId), { signal });
      }, { signal: controller.signal });
    } catch (error) {
      if (current() && error.name !== 'AbortError') showError(error.message);
    } finally {
      if (current()) setLoading(false);
    }
  }, [session, sessionPaused, userId, showError, markConversationRead]);

  useEffect(() => {
    setShowList(!activeUserId);
    setLoading(false);
    if (session && activeUserId) void loadMessages(activeUserId);
    const onVisibility = () => {
      if (document.hidden) {
        generationRef.current++;
        requestRef.current?.abort();
        setLoading(false);
        setSending(false);
      }
      // 恢复可见不增加聊天周期；只由用户选择会话或发送成功重新加载消息。
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      requestRef.current?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [session, activeUserId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !activeUserId || sending || sessionPaused) return;
    setSending(true);
    const generation = generationRef.current;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    // 发送接管可能尚在加载的会话；旧 load 的 guarded finally 不再负责清 UI。
    setLoading(false);
    try {
      await runWithDeadline(signal => messagesAPI.send(Number(activeUserId), input.trim(), { signal }), { signal: controller.signal });
      if (controller.signal.aborted || generation !== generationRef.current) return;
      setInput('');
      setSending(false);
      await loadMessages(activeUserId);
      inputRef.current?.focus();
    } catch (error) {
      if (!controller.signal.aborted && generation === generationRef.current) showError(error.message);
    } finally {
      if (!controller.signal.aborted && generation === generationRef.current) setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openConversation = (userId) => {
    setSearchParams({ user: String(userId) });
    setShowList(false);
  };

  const goBackToList = () => {
    setSearchParams({});
    setShowList(true);
    setMessages([]);
    setOtherUser(null);
    void refreshConversations();
  };

  if (sessionPaused) {
    return <div className="text-center py-12"><p>登录已过期，请重新登录</p><Link to="/login" className="btn btn-primary mt-3">去登录</Link></div>;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center" style={{ minHeight: '60vh' }}>
        <div className="text-center">
          <i className="fa-solid fa-lock text-4xl mb-3 block" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          <h3 className="font-bold mb-2" style={{ color: 'var(--text)' }}>请先登录</h3>
          <Link to="/login" className="btn btn-primary btn-sm mt-2">去登录</Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="msg-container">
        {/* 左侧：会话列表 */}
        <div className={`msg-sidebar ${showList ? 'show' : ''}`}>
          <div className="msg-sidebar-header">
            <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>私信</h3>
            <button
              className="msg-icon-btn"
              onClick={() => setShowNewConvo(true)}
              title="新私信"
            >
              <i className="fa-solid fa-square-plus" />
            </button>
          </div>

          <div className="px-3 pb-2">
            <input
              className="form-control"
              placeholder="搜索会话..."
              value={convoSearch}
              onChange={e => setConvoSearch(e.target.value)}
              style={{ fontSize: '0.8rem', padding: '6px 10px' }}
            />
          </div>

          <div className="msg-list">
            {conversationsLoading && conversations.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                <Spinner />
                <p className="text-sm mt-3">加载中...</p>
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                <i className="fa-solid fa-inbox text-3xl mb-3 block opacity-40" />
                <p className="text-sm">暂无会话</p>
                <button className="btn btn-primary btn-sm mt-3" onClick={() => setShowNewConvo(true)}>
                  开始新私信
                </button>
              </div>
            ) : (
              conversations
                .filter(c => !convoSearch || (c.username || '').toLowerCase().includes(convoSearch.toLowerCase()))
                .map(c => (
                <button
                  key={c.user_id}
                  className={`msg-convo-item ${Number(activeUserId) === c.user_id ? 'active' : ''}`}
                  onClick={() => openConversation(c.user_id)}
                >
                  <div className="msg-avatar">
                    {c.avatar
                      ? <img src={c.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                      : (c.username || '?')[0]?.toUpperCase()
                    }
                  </div>
                  <div className="msg-convo-info">
                    <div className="msg-convo-top">
                      <span className="msg-convo-name">{c.username || '用户'}</span>
                      <span className="msg-convo-time">
                        {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString('zh-CN') : ''}
                      </span>
                    </div>
                    <div className="msg-convo-bottom">
                      <p className="msg-convo-preview">{c.last_message || '暂无消息'}</p>
                      {c.unread > 0 && <span className="msg-unread">{c.unread}</span>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 右侧：聊天视图 */}
        <div className={`msg-chat ${!showList ? 'show' : ''}`}>
          {activeUserId ? (
            <>
              <div className="msg-chat-header">
                <button className="msg-back-btn" onClick={goBackToList}>
                  <i className="fa-solid fa-arrow-left" />
                </button>
                {otherUser && (
                  <>
                    <Link
                      to={`/user/${otherUser.id}`}
                      className="msg-avatar msg-avatar-sm"
                    >
                      {otherUser.avatar
                        ? <img src={otherUser.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                        : otherUser.username?.[0]?.toUpperCase() || '?'
                      }
                    </Link>
                    <Link to={`/user/${otherUser.id}`} className="msg-chat-name">
                      {otherUser.username}
                    </Link>
                  </>
                )}
              </div>

              <div className="msg-messages">
                {loading ? (
                  <div className="flex items-center justify-center h-full"><Spinner /></div>
                ) : messages.length === 0 ? (
                  <div className="msg-empty">
                    <i className="fa-solid fa-paper-plane text-3xl mb-2 block opacity-40" />
                    <p className="text-sm">发送第一条消息吧</p>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, i) => {
                      const prev = messages[i - 1];
                      const showAvatar = !msg.isOwn && (!prev || prev.sender_id !== msg.sender_id);
                      return <ChatMessage key={msg.id} message={msg} showAvatar={showAvatar} />;
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <div className="msg-input-bar">
                <textarea
                  ref={inputRef}
                  className="form-control flex-1"
                  placeholder="输入消息..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  style={{ resize: 'none', minHeight: '40px', maxHeight: '100px' }}
                />
                <button
                  className="btn btn-primary miui-press"
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  style={{ height: '40px', padding: '0 16px', flexShrink: 0 }}
                >
                  {sending ? <i className="fa-solid fa-spinner fa-spin" /> : <i className="fa-solid fa-paper-plane" />}
                </button>
              </div>
            </>
          ) : (
            <div className="msg-empty">
              <i className="fa-solid fa-comments text-4xl mb-3 block opacity-30" />
              <p className="text-sm">选择一个会话开始聊天</p>
            </div>
          )}
        </div>
      </div>

      {/* 移动端浮动按钮 */}
      {!activeUserId && (
        <button
          className="msg-fab"
          onClick={() => setShowNewConvo(true)}
        >
          <i className="fa-solid fa-square-plus" />
        </button>
      )}

      {showNewConvo && <NewConversation onClose={() => setShowNewConvo(false)} />}
    </>
  );
}
