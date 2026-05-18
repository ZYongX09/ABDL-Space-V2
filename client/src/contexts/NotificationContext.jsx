import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { notificationsAPI } from '../api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();
const POLL_INTERVAL = 30 * 1000; // 30秒

export function NotificationProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const { user } = useAuth();

  const fetchUnread = useCallback(async () => {
    if (!user) { setUnreadCount(0); return; }
    try {
      const data = await notificationsAPI.list();
      setUnreadCount(data.unread_count || 0);
    } catch {}
  }, [user]);

  useEffect(() => {
    fetchUnread();
    if (!user) return;
    const timer = setInterval(fetchUnread, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [user, fetchUnread]);

  const clearUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return (
    <NotificationContext.Provider value={{ unreadCount, fetchUnread, clearUnread }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
