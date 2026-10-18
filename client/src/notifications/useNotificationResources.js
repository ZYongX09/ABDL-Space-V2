import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { messagesAPI, notificationsAPI } from '../api';
import { createRequestScheduler } from './scheduler.js';

export function useNotificationResources(session) {
  const [scheduler] = useState(() => createRequestScheduler({ resources: {
    notifications: ({ signal }) => notificationsAPI.list({ signal }),
    conversations: ({ signal }) => messagesAPI.conversations({ signal }),
  } }));
  const snapshot = useSyncExternalStore(scheduler.subscribe, scheduler.getSnapshot, scheduler.getSnapshot);
  // 在账号切换的 layout 阶段作废旧代；不等下一轮 passive effect 才阻止旧结果。
  useLayoutEffect(() => { scheduler.setSession(session); }, [scheduler, session]);
  useEffect(() => {
    const onVisibility = () => scheduler.setVisible(!document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      scheduler.setVisible(false);
    };
  }, [scheduler]);
  const refreshNotifications = useCallback(() => scheduler.refresh('notifications'), [scheduler]);
  const refreshConversations = useCallback(() => scheduler.refresh('conversations'), [scheduler]);
  const clearUnread = useCallback(() => scheduler.invalidate('notifications', data => ({
    ...data, unread_count: 0,
    notifications: (data?.notifications || []).map(notification => ({ ...notification, read: true })),
  })), [scheduler]);
  const clearMessageUnread = useCallback(() => scheduler.invalidate('conversations', data => ({
    ...data, conversations: (data?.conversations || []).map(conversation => ({ ...conversation, unread: 0 })),
  })), [scheduler]);
  const markConversationRead = useCallback(async (userId, { signal } = {}) => {
    const generation = scheduler.capture();
    if (!scheduler.isCurrent(generation) || signal?.aborted) return;
    // 写请求只有一次；成功后取消在途旧 snapshot，不能用读前数据把徽标加回来。
    await messagesAPI.markRead(userId, { signal });
    if (!scheduler.isCurrent(generation) || signal?.aborted) return;
    scheduler.invalidate('conversations', data => ({
      ...data,
      conversations: (data?.conversations || []).map(conversation => String(conversation.user_id) === String(userId) ? { ...conversation, unread: 0 } : conversation),
    }));
  }, [scheduler]);
  const sessionPaused = snapshot.session === session && snapshot.paused;
  const current = snapshot.session === session && !sessionPaused;
  return {
    sessionPaused,
    notifications: current ? snapshot.resources.notifications.data : null,
    conversationSnapshot: current ? snapshot.resources.conversations.data : null,
    conversationsLoading: current && snapshot.resources.conversations.loading,
    conversationsError: current ? snapshot.resources.conversations.error : null,
    refreshNotifications, refreshConversations, clearUnread, clearMessageUnread, markConversationRead,
  };
}
