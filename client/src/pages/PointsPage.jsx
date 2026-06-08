import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import PointsCard from '../components/PointsCard';
import LevelBadge from '../components/LevelBadge';

/**
 * PointsPage — 积分明细页面
 */
export default function PointsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    if (user) fetchLogs();
  }, [user, page]);

  async function fetchLogs() {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${user.id}/points/logs?page=${page}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setLogs(json.logs || []);
        setPagination(json.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch point logs:', err);
    } finally {
      setLoading(false);
    }
  }

  function getTypeLabel(type) {
    const labels = {
      checkin: '每日签到',
      checkin_streak_7: '连续 7 天奖励',
      checkin_streak_30: '连续 30 天奖励',
      rating: '评价纸尿裤',
      post: '发帖',
      comment: '评论',
      like_received: '收到点赞',
      invite: '邀请注册',
      makeup_checkin: '补签',
      purchase: '购买',
    };
    return labels[type] || type;
  }

  function getTypeIcon(type) {
    const icons = {
      checkin: '📅',
      checkin_streak_7: '⚡',
      checkin_streak_30: '🔥',
      rating: '⭐',
      post: '📝',
      comment: '💬',
      like_received: '❤️',
      invite: '👥',
      makeup_checkin: '🔄',
      purchase: '🛒',
    };
    return icons[type] || '📌';
  }

  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div style={{
      maxWidth: '600px',
      margin: '0 auto',
      padding: '20px',
      minHeight: '100vh',
      background: 'var(--bg)',
    }}>
      {/* 顶部卡片 */}
      <div style={{ marginBottom: '20px' }}>
        <LevelBadge />
      </div>
      <div style={{ marginBottom: '20px' }}>
        <PointsCard />
      </div>

      {/* 流水列表 */}
      <div style={{
        background: 'var(--card-bg, #f5f5f5)',
        borderRadius: '16px',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '16px',
          borderBottom: '1px solid var(--border)',
          fontSize: '14px',
          fontWeight: '600',
          color: 'var(--text)',
        }}>
          积分明细
        </div>

        {loading ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}>
            加载中...
          </div>
        ) : logs.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}>
            暂无积分记录
          </div>
        ) : (
          <div>
            {logs.map((log, index) => (
              <div
                key={log.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderBottom: index < logs.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: log.amount > 0 ? '#10B98115' : '#EF444415',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  marginRight: '12px',
                }}>
                  {getTypeIcon(log.type)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--text)',
                  }}>
                    {log.description || getTypeLabel(log.type)}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    marginTop: '2px',
                  }}>
                    {new Date(log.created_at).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: log.amount > 0 ? '#10B981' : '#EF4444',
                }}>
                  {log.amount > 0 ? '+' : ''}{log.amount}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 分页 */}
        {pagination && pagination.totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '8px',
            padding: '16px',
            borderTop: '1px solid var(--border)',
          }}>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              style={{
                padding: '6px 12px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '12px',
                cursor: page === 1 ? 'default' : 'pointer',
                opacity: page === 1 ? 0.5 : 1,
              }}
            >
              上一页
            </button>
            <span style={{
              padding: '6px 12px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}>
              {page} / {pagination.totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
              disabled={page === pagination.totalPages}
              style={{
                padding: '6px 12px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '12px',
                cursor: page === pagination.totalPages ? 'default' : 'pointer',
                opacity: page === pagination.totalPages ? 0.5 : 1,
              }}
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
