import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { notificationsAPI, messagesAPI } from '../api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();
const POLL_INTERVAL = 30 * 1000; // 30秒

export function NotificationProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [messageUnread, setMessageUnread] = useState(0);
  const [toasts, setToasts] = useState([]); // 实时弹窗队列
  const lastNotifIdsRef = useRef(new Set());
  const lastMsgTimeRef = useRef(null);
  const { user } = useAuth();

  // 弹窗自动消失
  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  // 拉取通知
  const fetchUnread = useCallback(async () => {
    if (!user) { setUnreadCount(0); return; }
    try {
      const data = await notificationsAPI.list();
      const newCount = data.unread_count || 0;
      setUnreadCount(newCount);

      // 检测新通知 → 弹窗
      const notifs = data.notifications || [];
      const newNotifs = notifs.filter(n => !n.read && !lastNotifIdsRef.current.has(n.id));
      if (lastNotifIdsRef.current.size > 0 && newNotifs.length > 0) {
        newNotifs.forEach(n => {
          addToast({
            type: 'notification',
            icon: n.type === 'like' ? 'fa-heart' : n.type === 'comment' ? 'fa-comment' : 'fa-bell',
            iconColor: n.type === 'like' ? 'var(--danger)' : 'var(--primary-dark)',
            title: '新通知',
            message: n.message,
            link: '/notifications',
          });
        });
      }
      lastNotifIdsRef.current = new Set(notifs.map(n => n.id));
    } catch {}
  }, [user, addToast]);

  // 拉取私信未读
  const fetchMessageUnread = useCallback(async () => {
    if (!user) { setMessageUnread(0); return; }
    try {
      const data = await messagesAPI.conversations();
      const convos = data.conversations || [];
      const total = convos.reduce((sum, c) => sum + (c.unread || 0), 0);
      setMessageUnread(total);

      // 检测新私信 → 弹窗
      const latestTime = convos.reduce((max, c) => {
        const t = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
        return t > max ? t : max;
      }, 0);
      if (lastMsgTimeRef.current !== null && latestTime > lastMsgTimeRef.current) {
        const newConvos = convos.filter(c =>
          c.unread > 0 && c.last_message_at && new Date(c.last_message_at).getTime() > lastMsgTimeRef.current
        );
        newConvos.forEach(c => {
          addToast({
            type: 'message',
            icon: 'fa-envelope',
            iconColor: 'var(--accent)',
            title: c.username || '新私信',
            message: c.last_message || '发来了一条消息',
            link: '/messages',
          });
        });
      }
      lastMsgTimeRef.current = latestTime || Date.now();
    } catch {}
  }, [user, addToast]);

  useEffect(() => {
    fetchUnread();
    fetchMessageUnread();
    if (!user) {
      lastNotifIdsRef.current.clear();
      lastMsgTimeRef.current = null;
      setToasts([]);
      return;
    }
    let timer1 = null, timer2 = null
    const startPolling = () => {
      timer1 = setInterval(fetchUnread, POLL_INTERVAL);
      timer2 = setInterval(fetchMessageUnread, POLL_INTERVAL);
    }
    const stopPolling = () => { clearInterval(timer1); clearInterval(timer2); timer1 = timer2 = null }
    const onVisibility = () => {
      if (document.hidden) stopPolling()
      else { fetchUnread(); fetchMessageUnread(); startPolling() }
    }
    document.addEventListener('visibilitychange', onVisibility)
    if (!document.hidden) startPolling()
    return () => { stopPolling(); document.removeEventListener('visibilitychange', onVisibility) };
  }, [user, fetchUnread, fetchMessageUnread]);

  const clearUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const clearMessageUnread = useCallback(() => {
    setMessageUnread(0);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{
      unreadCount, messageUnread, toasts,
      fetchUnread, fetchMessageUnread,
      clearUnread, clearMessageUnread,
      dismissToast,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
