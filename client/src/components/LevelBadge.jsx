import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { calcLevel, calcLevelProgress, getLevelColor } from '../shared/level';

/**
 * LevelBadge — 等级徽章组件
 * 显示用户等级、经验条、积分余额
 */
export default function LevelBadge({ userId, compact = false }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const targetId = userId || user?.id;

  useEffect(() => {
    if (!targetId) return;
    fetchData();
  }, [targetId]);

  async function fetchData() {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${targetId}/level`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch level:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: compact ? '6px 12px' : '12px 16px',
        background: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        fontSize: compact ? '12px' : '14px',
        color: 'var(--text-secondary)',
      }}>
        <div style={{
          width: compact ? '28px' : '36px',
          height: compact ? '28px' : '36px',
          borderRadius: '50%',
          background: 'var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: compact ? '12px' : '14px' }} />
        </div>
        <span>加载中...</span>
      </div>
    );
  }

  if (!data) return null;

  const level = data.level;
  const progress = data.progress;
  const color = getLevelColor(level);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: compact ? '8px' : '12px',
      padding: compact ? '6px 12px' : '12px 16px',
      background: `linear-gradient(135deg, ${color}12, ${color}06)`,
      border: `1px solid ${color}25`,
      borderRadius: '16px',
      transition: 'all 0.3s ease',
    }}>
      {/* 等级图标 */}
      <div style={{
        width: compact ? '32px' : '44px',
        height: compact ? '32px' : '44px',
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${color}, ${color}CC)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: '700',
        fontSize: compact ? '13px' : '16px',
        boxShadow: `0 2px 8px ${color}40`,
        flexShrink: 0,
      }}>
        {level}
      </div>

      {/* 等级信息 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: compact ? '2px' : '6px',
        }}>
          <span style={{
            fontWeight: '700',
            fontSize: compact ? '14px' : '16px',
            color: 'var(--text)',
          }}>
            Lv.{level}
          </span>
          {!compact && (
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '12px',
              color: 'var(--text-secondary)',
              background: 'var(--bg)',
              padding: '2px 8px',
              borderRadius: '10px',
            }}>
              <i className="fa-solid fa-star" style={{ fontSize: '10px', color: 'var(--exp)' }} />
              {data.total_exp} EXP
            </span>
          )}
        </div>

        {/* 经验条 */}
        {!compact && (
          <div style={{
            width: '100%',
            height: '6px',
            background: 'var(--border)',
            borderRadius: '3px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.round(progress.progress * 100)}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${color}, ${color}CC)`,
              borderRadius: '3px',
              transition: 'width 0.5s ease',
            }} />
          </div>
        )}
      </div>

      {/* 倍率显示 */}
      {!compact && data.multipliers && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '4px',
          fontSize: '11px',
          color: 'var(--text-secondary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <i className="fa-solid fa-calendar-check" style={{ fontSize: '9px', color: 'var(--checkin)' }} />
            <span>签到 ×{data.multipliers.checkin}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <i className="fa-solid fa-coins" style={{ fontSize: '9px', color: 'var(--points)' }} />
            <span>积分 ×{data.multipliers.points}</span>
          </div>
        </div>
      )}
    </div>
  );
}
