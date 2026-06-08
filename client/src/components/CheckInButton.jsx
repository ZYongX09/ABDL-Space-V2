import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

/**
 * CheckInButton — 签到按钮组件
 * 显示签到状态、连续签到天数、补签功能
 */
export default function CheckInButton() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [showMakeup, setShowMakeup] = useState(false);

  useEffect(() => {
    if (user) fetchStatus();
  }, [user]);

  async function fetchStatus() {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/checkin/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setStatus(json);
      }
    } catch (err) {
      console.error('Failed to fetch checkin status:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckin() {
    if (checkingIn) return;
    setCheckingIn(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok) {
        showToast(`签到成功！+${json.rewards.total_points} 积分 +${json.rewards.total_exp} 经验`, 'success');
        if (json.rewards.level_change) {
          showToast(`🎉 升级到 Lv.${json.rewards.level_change.to}！`, 'success');
        }
        fetchStatus();
      } else {
        showToast(json.error || '签到失败', 'error');
      }
    } catch (err) {
      showToast('签到失败', 'error');
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleMakeup() {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/checkin/makeup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ target_date: yesterday }),
      });
      const json = await res.json();
      if (res.ok) {
        showToast(`补签成功！消耗 ${json.data.cost} 积分`, 'success');
        if (json.data.streak_bonus > 0) {
          showToast(`🎉 连续签到 ${json.data.streak} 天奖励 +${json.data.streak_bonus}！`, 'success');
        }
        fetchStatus();
        setShowMakeup(false);
      } else {
        showToast(json.error || '补签失败', 'error');
      }
    } catch (err) {
      showToast('补签失败', 'error');
    }
  }

  if (!user) return null;

  if (loading) {
    return (
      <div style={{
        padding: '16px',
        background: 'var(--card-bg, #f5f5f5)',
        borderRadius: '16px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
      }}>
        加载中...
      </div>
    );
  }

  const checkedIn = status?.checked_in_today;
  const streak = status?.streak || 0;

  return (
    <div style={{
      padding: '16px',
      background: checkedIn
        ? 'linear-gradient(135deg, #10B98115, #05966908)'
        : 'var(--card-bg, #f5f5f5)',
      borderRadius: '16px',
      border: checkedIn ? '1px solid #10B98130' : '1px solid var(--border)',
    }}>
      {/* 连续签到天数 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
      }}>
        <div>
          <div style={{
            fontSize: '14px',
            fontWeight: '600',
            color: 'var(--text)',
          }}>
            {checkedIn ? '✅ 今日已签到' : '每日签到'}
          </div>
          {streak > 0 && (
            <div style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginTop: '4px',
            }}>
              连续签到 {streak} 天
            </div>
          )}
        </div>
        {streak >= 7 && (
          <div style={{
            padding: '4px 8px',
            background: streak >= 30 ? '#F59E0B20' : '#3B82F620',
            color: streak >= 30 ? '#F59E0B' : '#3B82F6',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: '600',
          }}>
            {streak >= 30 ? '🔥 月签达人' : '⚡ 周签达人'}
          </div>
        )}
      </div>

      {/* 签到按钮 */}
      <button
        onClick={handleCheckin}
        disabled={checkedIn || checkingIn}
        style={{
          width: '100%',
          padding: '12px',
          background: checkedIn
            ? '#10B98120'
            : 'linear-gradient(135deg, var(--primary), var(--primary-dark, #6366F1))',
          color: checkedIn ? '#10B981' : '#fff',
          border: 'none',
          borderRadius: '12px',
          fontSize: '14px',
          fontWeight: '600',
          cursor: checkedIn ? 'default' : 'pointer',
          opacity: checkingIn ? 0.7 : 1,
          transition: 'all 0.2s ease',
        }}
      >
        {checkedIn ? '已签到' : checkingIn ? '签到中...' : '签到'}
      </button>

      {/* 补签入口 */}
      {!checkedIn && streak > 0 && (
        <button
          onClick={() => setShowMakeup(!showMakeup)}
          style={{
            width: '100%',
            padding: '8px',
            marginTop: '8px',
            background: 'transparent',
            border: '1px dashed var(--border)',
            borderRadius: '8px',
            fontSize: '12px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          补签（消耗 50 积分）
        </button>
      )}

      {/* 补签确认 */}
      {showMakeup && (
        <div style={{
          marginTop: '8px',
          padding: '12px',
          background: 'var(--bg)',
          borderRadius: '8px',
          fontSize: '13px',
        }}>
          <p style={{ margin: '0 0 8px 0', color: 'var(--text)' }}>
            补签昨天的签到，消耗 50 积分
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleMakeup}
              style={{
                flex: 1,
                padding: '8px',
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              确认补签
            </button>
            <button
              onClick={() => setShowMakeup(false)}
              style={{
                flex: 1,
                padding: '8px',
                background: 'var(--card-bg, #f5f5f5)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
