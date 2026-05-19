import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import MobileHeader from '../components/MobileHeader';
import ChatMessage from '../components/ChatMessage';
import NewConversation from '../components/NewConversation';
import { Spinner } from '../components/Feedback';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { messagesAPI } from '../api';

export default function MessagesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeUserId = searchParams.get('user');

  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [showList, setShowList] = useState(!activeUserId);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const data = await messagesAPI.conversations();
      setConversations(data.conversations || []);
    } catch (e) {
      toast.error(e.message);
    }
  }, [toast]);

  const loadMessages = useCallback(async (userId) => {
    if (!userId) return;
    try {
      setLoading(true);
      const data = await messagesAPI.getMessages(Number(userId));
      const msgs = (data.messages || []).map(m => ({
        ...m,
        isOwn: m.sender_id === user?.id,
      }));
      setMessages(msgs);

      const API_BASE = import.meta.env.VITE_API_BASE || '';
      if (API_BASE) {
        try {
          const res = await fetch(`${API_BASE}/api/users/${userId}`);
          if (res.ok) {
            const udata = await res.json();
            setOtherUser(udata.user || udata);
          } else {
            setOtherUser({ id: Number(userId), username: '用户' });
          }
        } catch {
          setOtherUser({ id: Number(userId), username: '用户' });
        }
      } else {
        const users = JSON.parse(localStorage.getItem('abdl_users') || '{}');
        const u = Object.values(users).find(uu => uu.id === Number(userId));
        setOtherUser(u ? { id: u.id, username: u.username } : { id: Number(userId), username: '用户' });
      }

      await messagesAPI.markRead(Number(userId));
      loadConversations();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [user, toast, loadConversations]);

  useEffect(() => {
    if (!user) return;
    loadConversations();
  }, [user, loadConversations]);

  useEffect(() => {
    if (activeUserId) {
      loadMessages(activeUserId);
      setShowList(false);
    } else {
      setShowList(true);
      setMessages([]);
      setOtherUser(null);
    }
  }, [activeUserId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !activeUserId || sending) return;
    setSending(true);
    try {
      await messagesAPI.send(Number(activeUserId), input.trim());
      setInput('');
      await loadMessages(activeUserId);
      inputRef.current?.focus();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSending(false);
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
    loadConversations();
  };

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
    <MobileHeader
      title="私信"
      actions={[
        { icon: 'fa-solid fa-user-plus', onClick: () => setShowNewConvo(true), title: '新私信' },
      ]}
    />
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

          <div className="msg-list">
            {loading ? (
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
              conversations.map(c => (
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
                  className="btn btn-primary"
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
