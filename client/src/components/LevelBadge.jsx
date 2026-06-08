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
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: compact ? '4px 8px' : '8px 12px',
        background: 'var(--card-bg, #f5f5f5)',
        borderRadius: '20px',
        fontSize: compact ? '12px' : '14px',
        color: 'var(--text-secondary)',
      }}>
        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--border)' }} />
        <span>Loading...</span>
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
      gap: compact ? '6px' : '10px',
      padding: compact ? '4px 10px' : '8px 14px',
      background: `linear-gradient(135deg, ${color}15, ${color}08)`,
      border: `1px solid ${color}30`,
      borderRadius: '24px',
      transition: 'all 0.3s ease',
    }}>
      {/* 等级图标 */}
      <div style={{
        width: compact ? '28px' : '36px',
        height: compact ? '28px' : '36px',
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${color}, ${color}CC)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontWeight: '700',
        fontSize: compact ? '12px' : '14px',
        boxShadow: `0 2px 8px ${color}40`,
      }}>
        {level}
      </div>

      {/* 等级信息 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '2px',
        }}>
          <span style={{
            fontWeight: '600',
            fontSize: compact ? '13px' : '15px',
            color: 'var(--text)',
          }}>
            Lv.{level}
          </span>
          {!compact && (
            <span style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
            }}>
              {data.total_exp} EXP
            </span>
          )}
        </div>

        {/* 经验条 */}
        {!compact && (
          <div style={{
            width: '100%',
            height: '4px',
            background: 'var(--border)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${Math.round(progress.progress * 100)}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${color}, ${color}CC)`,
              borderRadius: '2px',
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
          gap: '2px',
          fontSize: '11px',
          color: 'var(--text-secondary)',
        }}>
          <span>签到 ×{data.multipliers.checkin}</span>
          <span>积分 ×{data.multipliers.points}</span>
        </div>
      )}
    </div>
  );
}
