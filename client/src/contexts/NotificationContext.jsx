import { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { accountSessionKey } from '../notifications/scheduler.js';
import { useNotificationResources } from '../notifications/useNotificationResources.js';
import { useAuth } from './AuthContext';
import { isPushSupported, isPushSubscribed, subscribePush as doSubscribePush, unsubscribePush as doUnsubscribePush, syncExistingSubscription } from '../utils/pushManager';

const NotificationContext = createContext();
const EMPTY_CONVERSATIONS = [];

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]); // 实时弹窗队列
  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const lastNotifIdsRef = useRef(new Set());
  const lastMsgTimeRef = useRef(null);
  const { user, accounts } = useAuth();
  const session = accountSessionKey(user, accounts);
  const {
    notifications, conversationSnapshot, conversationsLoading, conversationsError, sessionPaused,
    refreshNotifications: fetchUnread, refreshConversations, clearUnread, clearMessageUnread, markConversationRead,
  } = useNotificationResources(session);
  const conversations = conversationSnapshot?.conversations || EMPTY_CONVERSATIONS;
  const unreadCount = notifications?.unread_count || 0;
  const messageUnread = conversations.reduce((sum, conversation) => sum + (conversation.unread || 0), 0);

  useLayoutEffect(() => {
    lastNotifIdsRef.current.clear();
    lastMsgTimeRef.current = null;
    setToasts([]);
  }, [session, sessionPaused]);

  useEffect(() => {
    isPushSupported().then(supported => {
      setPushSupported(supported);
      if (supported) {
        // 先同步已存在的订阅到后端（处理用户通过系统弹窗允许通知的情况）
        syncExistingSubscription().then(() => {
          isPushSubscribed().then(subscribed => setPushSubscribed(subscribed));
        });
      }
    });
  }, []);

  const subscribeToPush = useCallback(async () => {
    try {
      const result = await doSubscribePush();
      if (result) {
        setPushSubscribed(true);
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[Push] subscribe failed:', e);
      return false;
    }
  }, []);

  const unsubscribeFromPush = useCallback(async () => {
    try {
      await doUnsubscribePush();
      setPushSubscribed(false);
      return true;
    } catch (e) {
      console.warn('[Push] unsubscribe failed:', e);
      return false;
    }
  }, []);

  // 弹窗自动消失
  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);

  // 仅对已被调度器接纳的 snapshot 发弹窗，失败、旧代和资料刷新不会触发请求。
  useEffect(() => {
    if (!notifications) return;
    const notifs = notifications.notifications || [];
    const newNotifs = notifs.filter(n => !n.read && !lastNotifIdsRef.current.has(n.id));
    if (lastNotifIdsRef.current.size > 0) newNotifs.forEach(n => addToast({
      type: 'notification',
      icon: n.type === 'like' ? 'fa-heart' : n.type === 'comment' ? 'fa-comment' : 'fa-bell',
      iconColor: n.type === 'like' ? 'var(--danger)' : 'var(--primary-dark)',
      title: '新通知', message: n.message, link: '/notifications',
    }));
    lastNotifIdsRef.current = new Set(notifs.map(n => n.id));
  }, [notifications, addToast]);

  useEffect(() => {
    if (!conversationSnapshot) return;
    const convos = conversationSnapshot.conversations || [];
    const latestTime = convos.reduce((max, c) => Math.max(max, c.last_message_at ? new Date(c.last_message_at).getTime() : 0), 0);
    if (lastMsgTimeRef.current !== null && latestTime > lastMsgTimeRef.current) {
      convos.filter(c => c.unread > 0 && c.last_message_at && new Date(c.last_message_at).getTime() > lastMsgTimeRef.current)
        .forEach(c => addToast({
          type: 'message', icon: 'fa-envelope', iconColor: 'var(--accent)',
          title: c.username || '新私信', message: c.last_message || '发来了一条消息', link: '/messages',
        }));
    }
    lastMsgTimeRef.current = latestTime || Date.now();
  }, [conversationSnapshot, addToast]);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{
      unreadCount, messageUnread, toasts,
      fetchUnread, fetchMessageUnread: refreshConversations,
      conversations, conversationsLoading, conversationsError, sessionPaused, refreshConversations, markConversationRead,
      clearUnread, clearMessageUnread,
      dismissToast,
      pushSupported, pushSubscribed,
      subscribeToPush, unsubscribeFromPush,
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
