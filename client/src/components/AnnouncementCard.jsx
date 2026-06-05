import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { forumAPI } from '../api';

/** 右侧栏公告卡片 — 展示最新一条公告，超100字截断 */
export default function AnnouncementCard() {
  const [announcement, setAnnouncement] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    forumAPI.latestAnnouncement()
      .then(data => setAnnouncement(data.announcement))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || !announcement) return null;

  const truncated = announcement.content.length > 100;
  const displayContent = truncated
    ? announcement.content.slice(0, 100) + '...'
    : announcement.content;

  return (
    <div className="right-card" style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      padding: '16px',
    }}>
      <div className="flex items-center gap-2 mb-3">
        <i className="fa-solid fa-bullhorn" style={{ color: 'var(--primary)', fontSize: '14px' }} />
        <span style={{ fontWeight: 700, fontSize: '15px' }}>公告</span>
      </div>

      <Link to={`/forum/${announcement.id}`} style={{ textDecoration: 'none', color: 'var(--text)' }}>
        <p style={{ fontSize: '14px', lineHeight: '1.5', marginBottom: '8px' }}>
          {displayContent}
        </p>
        {truncated && (
          <span style={{ color: 'var(--primary)', fontSize: '13px' }}>查看全部</span>
        )}
      </Link>

      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
        {new Date(announcement.created_at + 'Z').toLocaleDateString('zh-CN')}
      </div>
    </div>
  );
}
