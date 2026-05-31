import { useState, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import { LoadingSkeleton, EmptyState } from '../components/Feedback';
import { notificationsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useToast } from '../contexts/ToastContext';
import { Link, useNavigate } from 'react-router-dom';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
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
        // 打开页面自动标记已读
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



  if (!user) {
    return (
      <>
      <PageLayout hero={{ icon: 'fa-bell', title: '通知' }}>
        <div className="empty-state">
          <div className="icon"><i className="fa-solid fa-bell" /></div>
          <h3>请先登录</h3>
          <Link to="/login" className="btn btn-primary mt-4">去登录</Link>
        </div>
      </PageLayout>
      </>
    );
  }

  return (
    <>
    <PageLayout hero={{ icon: 'fa-bell', title: '通知', subtitle: unreadCount > 0 ? `${unreadCount} 条未读` : undefined }}>
      {loading ? (
        <LoadingSkeleton count={4} height={70} />
      ) : notifications.length === 0 ? (
        <EmptyState icon="fa-bell-slash" title="暂无通知" description="新的互动通知会出现在这里" />
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const link = n.post_id ? `/forum/${n.post_id}` : n.target_type === 'post' ? `/forum/${n.target_id}` : null;
            const Wrapper = link ? 'div' : 'div';
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
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: n.type === 'like' ? 'rgba(232, 131, 124, 0.15)' : n.type === 'comment' ? 'rgba(168, 216, 240, 0.2)' : 'var(--primary-light)',
                  color: n.type === 'like' ? 'var(--danger)' : 'var(--primary-dark)',
                }}
              >
                <i className={`fa-solid ${n.type === 'like' ? 'fa-heart' : n.type === 'comment' ? 'fa-comment' : 'fa-bell'} text-sm`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm" style={{ color: 'var(--text)' }}>{n.message}</p>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {new Date(n.created_at).toLocaleString('zh-CN')}
                </span>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </PageLayout>
    </>
  );
}
