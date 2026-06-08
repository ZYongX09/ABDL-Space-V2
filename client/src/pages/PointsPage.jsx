import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import PointsCard from '../components/PointsCard';
import LevelBadge from '../components/LevelBadge';

/**
 * PointsPage — 积分中心（增强版）
 */
export default function PointsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [expLogs, setExpLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [activeTab, setActiveTab] = useState('points'); // 'points' | 'exp'
  const [filter, setFilter] = useState('all'); // 'all' | 'earn' | 'spend'
  const [stats, setStats] = useState({
    todayEarned: 0,
    weekEarned: 0,
    monthEarned: 0,
  });

  useEffect(() => {
    if (user) fetchLogs();
  }, [user, page, activeTab]);

  async function fetchLogs() {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const endpoint = activeTab === 'points'
        ? `/api/users/${user.id}/points/logs?page=${page}&limit=20`
        : `/api/users/${user.id}/exp/logs?page=${page}&limit=20`;

      const res = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        const logData = json.logs || [];

        if (activeTab === 'points') {
          setLogs(logData);
          calculateStats(logData);
        } else {
          setExpLogs(logData);
        }
        setPagination(json.pagination);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  }

  function calculateStats(logData) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    const stats = logData.reduce((acc, log) => {
      if (log.amount <= 0) return acc;
      const logDate = new Date(log.created_at);

      if (logDate >= today) acc.todayEarned += log.amount;
      if (logDate >= weekAgo) acc.weekEarned += log.amount;
      if (logDate >= monthAgo) acc.monthEarned += log.amount;

      return acc;
    }, { todayEarned: 0, weekEarned: 0, monthEarned: 0 });

    setStats(stats);
  }

  function getTypeLabel(type) {
    const labels = {
      checkin: '每日签到',
      checkin_streak_7: '连续签到奖励',
      checkin_streak_30: '月度签到奖励',
      rating: '评价纸尿裤',
      newbie_rating: '新手评价奖励',
      post: '发帖',
      comment: '评论',
      like_received: '收到点赞',
      invite: '邀请注册',
      invite_first_rating: '邀请评价奖励',
      makeup_checkin: '补签',
      purchase: '购买',
      unlike: '点赞取消扣回',
      rating_delete: '删评扣回',
      post_delete: '删帖扣回',
      comment_delete: '删评论扣回',
    };
    return labels[type] || type;
  }

  function getTypeIcon(type) {
    // 颜色使用 CSS 变量（多主题适配），背景使用 -soft 半透明版本
    const icons = {
      checkin: { icon: 'fa-calendar-check', color: 'var(--checkin)', bg: 'var(--checkin-soft)' },
      checkin_streak_7: { icon: 'fa-fire', color: 'var(--streak)', bg: 'var(--streak-soft)' },
      checkin_streak_30: { icon: 'fa-fire-flame-curved', color: 'var(--streak-strong)', bg: 'var(--streak-soft)' },
      rating: { icon: 'fa-star', color: 'var(--rating)', bg: 'var(--rating-soft)' },
      newbie_rating: { icon: 'fa-star-half-stroke', color: 'var(--rating)', bg: 'var(--rating-soft)' },
      post: { icon: 'fa-file-lines', color: 'var(--post)', bg: 'var(--post-soft)' },
      comment: { icon: 'fa-comment', color: 'var(--comment)', bg: 'var(--comment-soft)' },
      like_received: { icon: 'fa-heart', color: 'var(--like)', bg: 'var(--like-soft)' },
      invite: { icon: 'fa-user-plus', color: 'var(--invite)', bg: 'var(--invite-soft)' },
      invite_first_rating: { icon: 'fa-gift', color: 'var(--points)', bg: 'var(--points-soft)' },
      makeup_checkin: { icon: 'fa-clock-rotate-left', color: 'var(--makeup)', bg: 'var(--makeup-soft)' },
      purchase: { icon: 'fa-cart-shopping', color: 'var(--points)', bg: 'var(--points-soft)' },
      unlike: { icon: 'fa-heart-crack', color: 'var(--muted-strong)', bg: 'var(--muted-bg)' },
      rating_delete: { icon: 'fa-trash', color: 'var(--spend)', bg: 'var(--streak-soft)' },
      post_delete: { icon: 'fa-trash', color: 'var(--spend)', bg: 'var(--streak-soft)' },
      comment_delete: { icon: 'fa-trash', color: 'var(--spend)', bg: 'var(--streak-soft)' },
    };
    return icons[type] || { icon: 'fa-circle', color: 'var(--muted-strong)', bg: 'var(--muted-bg)' };
  }

  function filterLogs(logData) {
    if (filter === 'all') return logData;
    if (filter === 'earn') return logData.filter(l => l.amount > 0);
    if (filter === 'spend') return logData.filter(l => l.amount < 0);
    return logData;
  }

  if (!user) {
    navigate('/login');
    return null;
  }

  const currentLogs = activeTab === 'points' ? logs : expLogs;
  const filteredLogs = filterLogs(currentLogs);

  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '20px',
      minHeight: '100vh',
      background: 'var(--bg)',
    }}>
      {/* 顶部卡片 */}
      <div style={{ marginBottom: '24px' }}>
        <LevelBadge />
      </div>

      {/* 统计卡片 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '12px',
        marginBottom: '24px',
      }}>
        <PointsCard />
        <div style={{
          background: 'linear-gradient(135deg, var(--checkin-soft), var(--checkin-softer))',
          border: '1px solid var(--checkin-border)',
          borderRadius: '16px',
          padding: '20px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}>
            <i className="fa-solid fa-chart-line" style={{ color: 'var(--checkin)', fontSize: '14px' }} />
            <span style={{ fontSize: '12px', color: 'var(--checkin)', fontWeight: '600' }}>收益统计</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>今日</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--checkin)' }}>+{stats.todayEarned}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>本周</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--checkin)' }}>+{stats.weekEarned}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>本月</span>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--checkin)' }}>+{stats.monthEarned}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 标签切换 */}
      <div style={{
        display: 'flex',
        background: 'var(--bg-card)',
        borderRadius: '12px',
        padding: '4px',
        marginBottom: '16px',
        border: '1px solid var(--border)',
      }}>
        {[
          { key: 'points', label: '积分', icon: 'fa-coins' },
          { key: 'exp', label: '经验', icon: 'fa-star' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setPage(1);
              setFilter('all');
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px',
              background: activeTab === tab.key ? 'var(--primary)' : 'transparent',
              color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              borderRadius: '10px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <i className={`fa-solid ${tab.icon}`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* 筛选器 */}
      {activeTab === 'points' && (
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '16px',
        }}>
          {[
            { key: 'all', label: '全部' },
            { key: 'earn', label: '收入' },
            { key: 'spend', label: '支出' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '8px 16px',
                background: filter === f.key ? 'var(--primary)15' : 'var(--bg-card)',
                color: filter === f.key ? 'var(--primary)' : 'var(--text-secondary)',
                border: `1px solid ${filter === f.key ? 'var(--primary)30' : 'var(--border)'}`,
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* 流水列表 */}
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <i className="fa-solid fa-list" style={{ color: 'var(--primary)', fontSize: '14px' }} />
            <span style={{
              fontSize: '15px',
              fontWeight: '600',
              color: 'var(--text)',
            }}>
              {activeTab === 'points' ? '积分明细' : '经验明细'}
            </span>
          </div>
          {pagination && (
            <span style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}>
              共 {pagination.total} 条
            </span>
          )}
        </div>

        {loading ? (
          <div style={{
            padding: '60px 24px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
          }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '32px', marginBottom: '16px', display: 'block' }} />
            加载中...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div style={{
            padding: '60px 24px',
            textAlign: 'center',
          }}>
            <i className="fa-solid fa-inbox" style={{
              fontSize: '48px',
              color: 'var(--border)',
              marginBottom: '16px',
              display: 'block',
            }} />
            <p style={{
              fontSize: '16px',
              fontWeight: '600',
              color: 'var(--text)',
              margin: '0 0 8px',
            }}>
              暂无记录
            </p>
            <p style={{
              fontSize: '14px',
              color: 'var(--text-secondary)',
              margin: 0,
            }}>
              {activeTab === 'points' ? '通过签到、评价、发帖等行为获得积分' : '通过各种行为获得经验值'}
            </p>
          </div>
        ) : (
          <div>
            {filteredLogs.map((log, index) => {
              const typeInfo = getTypeIcon(log.type);
              return (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '16px 20px',
                    borderBottom: index < filteredLogs.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* 图标 */}
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: typeInfo.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: '14px',
                    flexShrink: 0,
                  }}>
                    <i className={`fa-solid ${typeInfo.icon}`} style={{
                      fontSize: '16px',
                      color: typeInfo.color,
                    }} />
                  </div>

                  {/* 信息 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: '500',
                      color: 'var(--text)',
                      marginBottom: '4px',
                    }}>
                      {log.description || getTypeLabel(log.type)}
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                    }}>
                      <i className="fa-regular fa-clock" style={{ fontSize: '10px' }} />
                      <span>{new Date(log.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                  </div>

                  {/* 金额 */}
                  <div style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    color: log.amount > 0 ? 'var(--earn)' : 'var(--spend)',
                    fontFeatureSettings: 'tnum',
                  }}>
                    {log.amount > 0 ? '+' : ''}{log.amount}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 分页 */}
        {pagination && pagination.totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '12px',
            padding: '20px',
            borderTop: '1px solid var(--border)',
          }}>
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '13px',
                color: 'var(--text)',
                cursor: page === 1 ? 'not-allowed' : 'pointer',
                opacity: page === 1 ? 0.5 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              <i className="fa-solid fa-chevron-left" style={{ fontSize: '10px' }} />
              上一页
            </button>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}>
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum;
                if (pagination.totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= pagination.totalPages - 2) {
                  pageNum = pagination.totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    style={{
                      width: '36px',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: page === pageNum ? 'var(--primary)' : 'transparent',
                      color: page === pageNum ? '#fff' : 'var(--text-secondary)',
                      border: `1px solid ${page === pageNum ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
              disabled={page === pagination.totalPages}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '13px',
                color: 'var(--text)',
                cursor: page === pagination.totalPages ? 'not-allowed' : 'pointer',
                opacity: page === pagination.totalPages ? 0.5 : 1,
                transition: 'all 0.2s ease',
              }}
            >
              下一页
              <i className="fa-solid fa-chevron-right" style={{ fontSize: '10px' }} />
            </button>
          </div>
        )}
      </div>

      {/* 快捷入口 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '12px',
        marginTop: '24px',
      }}>
        {[
          { icon: 'fa-calendar-check', label: '每日签到', path: '/', color: 'var(--checkin)' },
          { icon: 'fa-star', label: '评价纸尿裤', path: '/diapers', color: 'var(--rating)' },
          { icon: 'fa-pen-to-square', label: '发帖赚积分', path: '/create-post', color: 'var(--post)' },
          { icon: 'fa-user-plus', label: '邀请好友', path: '/invite', color: 'var(--points)' },
        ].map((item, i) => (
          <button
            key={i}
            onClick={() => navigate(item.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = `${item.color}50`;
              e.currentTarget.style.boxShadow = `0 2px 8px ${item.color}20`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'var(--hover-bg)',
              border: `1px solid ${item.color}30`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <i className={`fa-solid ${item.icon}`} style={{ color: item.color, fontSize: '16px' }} />
            </div>
            <span style={{
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--text)',
            }}>
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
