export default function ChatMessage({ message, showAvatar = true }) {
  const isOwn = message.isOwn;
  const initial = message.senderName?.[0]?.toUpperCase() || '?';

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isOwn && showAvatar && (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mr-2 mt-auto"
          style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}
        >
          {initial}
        </div>
      )}
      {!isOwn && !showAvatar && <div className="w-8 mr-2 flex-shrink-0" />}
      <div className="flex flex-col" style={{ maxWidth: '85%', minWidth: 0 }}>
        <div className={isOwn ? 'chat-bubble-own' : 'chat-bubble-other'}>
          {message.content}
        </div>
        <span
          className={`text-[10px] mt-1 ${isOwn ? 'text-right' : 'text-left'}`}
          style={{ color: 'var(--text-muted)' }}
        >
          {message.created_at ? new Date(message.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}
        </span>
      </div>
    </div>
  );
}
