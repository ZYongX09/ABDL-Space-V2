import { useState, useEffect, useMemo } from 'react';
import PageLayout from '../components/PageLayout';
import { LoadingSkeleton, EmptyState } from '../components/Feedback';
import { notificationsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useToast } from '../contexts/ToastContext';
import { Link, useNavigate } from 'react-router-dom';

const FILTER_MENU = [
  { id: 'all', label: '全部通知', icon: 'fa-bell' },
  { id: 'like', label: '点赞', icon: 'fa-heart' },
  { id: 'comment', label: '评论', icon: 'fa-comment' },
  { id: 'follow', label: '关注', icon: 'fa-user-plus' },
  { id: 'mention', label: '@提及', icon: 'fa-at' },
];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const { user } = useAuth();
  const { clearUnread } = useNotifications();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      try {
        const data = await notificationsAPI.list();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
        if (data.unread_count > 0) {
          await notificationsAPI.readAll();
          clearUnread();
          setNotifications(prev => prev.map(n => ({ ...n, read: true })));
          setUnreadCount(0);
        }
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // 客户端按 type 过滤
  const filtered = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'mention') {
      return notifications.filter(n => /@\S+/.test(n.message || ''));
    }
    return notifications.filter(n => n.type === filter);
  }, [notifications, filter]);

  // 各类型计数
  const counts = useMemo(() => {
    const c = { all: notifications.length, like: 0, comment: 0, follow: 0, mention: 0 };
    for (const n of notifications) {
      if (n.type && c[n.type] !== undefined) c[n.type]++;
      if (/@\S+/.test(n.message || '')) c.mention++;
    }
    return c;
  }, [notifications]);

  if (!user) {
    return (
      <PageLayout hero={{ icon: 'fa-bell', title: '通知' }}>
        <div className="card text-center py-8">
          <p style={{ color: 'var(--text-light)' }}>请先登录</p>
          <Link to="/login" className="btn btn-primary mt-4">去登录</Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout hero={{ icon: 'fa-bell', title: '通知', subtitle: unreadCount > 0 ? `${unreadCount} 条未读` : '所有互动通知' }}>
      <div className="settings-layout">
        <nav className="settings-menu" aria-label="通知类型过滤">
          {FILTER_MENU.map(m => (
            <button
              key={m.id}
              onClick={() => setFilter(m.id)}
              className={`settings-menu-item ${filter === m.id ? 'active' : ''}`}
              style={{ fontFamily: 'inherit' }}
            >
              <i className={`fa-solid ${m.icon}`} style={{ width: 18, textAlign: 'center' }} />
              <span>{m.label}</span>
              {counts[m.id] > 0 && (
                <span className="ml-auto text-xs" style={{ opacity: 0.7 }}>{counts[m.id]}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {loading ? (
            <LoadingSkeleton count={4} height={70} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="fa-bell-slash"
              title={filter === 'all' ? '暂无通知' : '该类型暂无通知'}
              description="新的互动通知会出现在这里"
            />
          ) : (
            <div className="space-y-2">
              {filtered.map(n => {
                const link = n.post_id ? `/forum/${n.post_id}` : n.target_type === 'post' ? `/forum/${n.target_id}` : null;
                return (
                  <div
                    key={n.id}
                    className="card flex items-center gap-3"
                    style={{
                      padding: '1rem',
                      borderLeft: n.read ? 'none' : '3px solid var(--primary)',
                      opacity: n.read ? 0.7 : 1,
                      cursor: link ? 'pointer' : 'default',
                    }}
                    onClick={() => link && navigate(link)}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: n.type === 'like' ? 'rgba(232, 131, 124, 0.15)'
                          : n.type === 'comment' ? 'rgba(168, 216, 240, 0.2)'
                          : n.type === 'follow' ? 'rgba(155, 138, 251, 0.15)'
                          : 'var(--primary-light)',
                        color: n.type === 'like' ? 'var(--danger)'
                          : n.type === 'follow' ? '#9b8afb'
                          : 'var(--primary-dark)',
                      }}
                    >
                      <i className={`fa-solid ${
                        n.type === 'like' ? 'fa-heart'
                        : n.type === 'comment' ? 'fa-comment'
                        : n.type === 'follow' ? 'fa-user-plus'
                        : 'fa-bell'
                      } text-sm`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ color: 'var(--text)' }}>{n.message}</p>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {new Date(n.created_at + 'Z').toLocaleString('zh-CN')}
                      </span>
                    </div>
                    {link && <i className="fa-solid fa-chevron-right text-xs" style={{ color: 'var(--text-muted)' }} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
