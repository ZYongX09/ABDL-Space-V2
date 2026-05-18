import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import ChatMessage from '../components/ChatMessage';
import NewConversation from '../components/NewConversation';
import { EmptyState, Spinner } from '../components/Feedback';
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
  const [showList, setShowList] = useState(!activeUserId); // mobile: show list or chat
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // 加载会话列表
  const loadConversations = useCallback(async () => {
    try {
      const data = await messagesAPI.conversations();
      setConversations(data.conversations || []);
    } catch (e) {
      toast.error(e.message);
    }
  }, [toast]);

  // 加载与某用户的消息
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

      // 获取对方用户信息
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

      // 标记已读
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

  // 自动滚动到底部
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
      <PageLayout hero={{ icon: 'fa-envelope', title: '私信' }}>
        <div className="empty-state">
          <div className="icon"><i className="fa-solid fa-comment-dots" /></div>
          <h3>请先登录</h3>
          <Link to="/login" className="btn btn-primary mt-4">去登录</Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout hero={{ icon: 'fa-envelope', title: '私信' }}>
      <div className="card overflow-hidden" style={{ padding: 0 }}>
        <div className="flex" style={{ height: 'calc(70vh)', minHeight: '400px' }}>
          {/* 左侧：会话列表 */}
          <div
            className={`border-r flex flex-col ${showList ? 'flex' : 'hidden'} md:flex`}
            style={{ borderColor: 'var(--border)', width: '100%', maxWidth: '100%', flexShrink: 0 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <h3 className="font-bold text-sm" style={{ color: 'var(--text)' }}>会话</h3>
              <button
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm"
                style={{ background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer' }}
                onClick={() => setShowNewConvo(true)}
                title="新私信"
              >
                <i className="fa-solid fa-pen" />
              </button>
            </div>

            {/* 会话列表 */}
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>
                  <i className="fa-solid fa-inbox text-3xl mb-3 block opacity-40" />
                  <p className="text-sm">暂无会话</p>
                  <button
                    className="btn btn-primary btn-sm mt-3"
                    onClick={() => setShowNewConvo(true)}
                  >
                    开始新私信
                  </button>
                </div>
              ) : (
                conversations.map(c => (
                  <button
                    key={c.user_id}
                    className="w-full flex items-center gap-3 p-4 text-left transition-colors border-b"
                    style={{
                      background: Number(activeUserId) === c.user_id ? 'var(--hover-bg)' : 'transparent',
                      borderColor: 'var(--border)',
                      border: 'none',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      color: 'var(--text)',
                    }}
                    onMouseOver={e => e.currentTarget.style.background = 'var(--hover-bg)'}
                    onMouseOut={e => e.currentTarget.style.background = Number(activeUserId) === c.user_id ? 'var(--hover-bg)' : 'transparent'}
                    onClick={() => openConversation(c.user_id)}
                  >
                    <div
                      className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}
                    >
                      {(c.username || '?')[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm truncate">{c.username || '用户'}</span>
                        <span className="text-[10px] flex-shrink-0 ml-2" style={{ color: 'var(--text-muted)' }}>
                          {c.last_message_at ? new Date(c.last_message_at).toLocaleDateString('zh-CN') : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-xs truncate" style={{ color: 'var(--text-light)' }}>
                          {c.last_message || '暂无消息'}
                        </p>
                        {c.unread > 0 && (
                          <span
                            className="flex-shrink-0 ml-2 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold"
                            style={{ background: 'var(--danger)', color: 'white' }}
                          >
                            {c.unread}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* 右侧：聊天视图 */}
          <div
            className={`flex flex-col flex-1 ${!showList ? 'flex' : 'hidden'} md:flex`}
            style={{ minWidth: 0 }}
          >
            {activeUserId ? (
              <>
                {/* Chat header */}
                <div className="flex items-center gap-3 p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                  <button
                    className="md:hidden w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ background: 'var(--input-bg)', color: 'var(--text)', border: 'none', cursor: 'pointer' }}
                    onClick={goBackToList}
                  >
                    <i className="fa-solid fa-arrow-left" />
                  </button>
                  {otherUser && (
                    <>
                      <Link
                        to={`/user/${otherUser.id}`}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                        style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', textDecoration: 'none' }}
                      >
                        {otherUser.username?.[0]?.toUpperCase() || '?'}
                      </Link>
                      <Link to={`/user/${otherUser.id}`} className="font-semibold text-sm hover:underline" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                        {otherUser.username}
                      </Link>
                    </>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4">
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <Spinner />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
                      <div className="text-center">
                        <i className="fa-regular fa-paper-plane text-3xl mb-2 block opacity-40" />
                        <p className="text-sm">发送第一条消息吧</p>
                      </div>
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

                {/* Input bar */}
                <div className="chat-input-bar">
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
                    className="btn btn-primary flex-shrink-0"
                    onClick={handleSend}
                    disabled={!input.trim() || sending}
                    style={{ height: '40px', padding: '0 16px' }}
                  >
                    {sending ? (
                      <i className="fa-solid fa-spinner fa-spin" />
                    ) : (
                      <i className="fa-solid fa-paper-plane" />
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
                <div className="text-center">
                  <i className="fa-solid fa-comments text-4xl mb-3 block opacity-30" />
                  <p className="text-sm">选择一个会话开始聊天</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 浮动新建按钮（移动端） */}
      {!activeUserId && (
        <button
          className="fixed bottom-24 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-lg md:hidden z-40"
          style={{ background: 'var(--primary)', color: 'white', border: 'none', cursor: 'pointer' }}
          onClick={() => setShowNewConvo(true)}
        >
          <i className="fa-solid fa-pen" />
        </button>
      )}

      {showNewConvo && <NewConversation onClose={() => setShowNewConvo(false)} />}
    </PageLayout>
  );
}
