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
          showToast(`升级到 Lv.${json.rewards.level_change.to}！`, 'success');
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
          showToast(`连续签到 ${json.data.streak} 天奖励 +${json.data.streak_bonus}！`, 'success');
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
        padding: '20px',
        background: 'var(--card-bg, #fff)',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        textAlign: 'center',
        color: 'var(--text-secondary)',
      }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '20px', marginBottom: '8px', display: 'block' }} />
        加载中...
      </div>
    );
  }

  const checkedIn = status?.checked_in_today;
  const streak = status?.streak || 0;

  return (
    <div style={{
      padding: '20px',
      background: checkedIn
        ? 'linear-gradient(135deg, #10B98115, #10B98108)'
        : 'var(--card-bg, #fff)',
      borderRadius: '16px',
      border: `1px solid ${checkedIn ? '#10B98130' : 'var(--border)'}`,
      transition: 'all 0.3s ease',
    }}>
      {/* 连续签到天数 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: checkedIn ? '#10B98120' : 'var(--primary)15',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <i className={`fa-solid ${checkedIn ? 'fa-calendar-check' : 'fa-calendar'}`} style={{
              fontSize: '18px',
              color: checkedIn ? '#10B981' : 'var(--primary)',
            }} />
          </div>
          <div>
            <div style={{
              fontSize: '15px',
              fontWeight: '600',
              color: 'var(--text)',
            }}>
              {checkedIn ? '今日已签到' : '每日签到'}
            </div>
            {streak > 0 && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginTop: '2px',
              }}>
                <i className="fa-solid fa-fire" style={{ fontSize: '10px', color: '#F59E0B' }} />
                连续签到 {streak} 天
              </div>
            )}
          </div>
        </div>

        {streak >= 7 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            background: streak >= 30 ? '#F59E0B15' : '#3B82F615',
            color: streak >= 30 ? '#F59E0B' : '#3B82F6',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '600',
          }}>
            <i className={`fa-solid ${streak >= 30 ? 'fa-fire-flame-curved' : 'fa-bolt'}`} style={{ fontSize: '10px' }} />
            {streak >= 30 ? '月签达人' : '周签达人'}
          </div>
        )}
      </div>

      {/* 签到按钮 */}
      <button
        onClick={handleCheckin}
        disabled={checkedIn || checkingIn}
        style={{
          width: '100%',
          padding: '14px',
          background: checkedIn
            ? '#10B98120'
            : 'linear-gradient(135deg, var(--primary), var(--primary-dark, #6366F1))',
          color: checkedIn ? '#10B981' : '#fff',
          border: 'none',
          borderRadius: '12px',
          fontSize: '15px',
          fontWeight: '600',
          cursor: checkedIn ? 'default' : 'pointer',
          opacity: checkingIn ? 0.7 : 1,
          transition: 'all 0.2s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          boxShadow: checkedIn ? 'none' : '0 2px 8px var(--primary)40',
        }}
      >
        <i className={`fa-solid ${checkedIn ? 'fa-check' : checkingIn ? 'fa-spinner fa-spin' : 'fa-calendar-check'}`} />
        {checkedIn ? '已签到' : checkingIn ? '签到中...' : '立即签到'}
      </button>

      {/* 补签入口 */}
      {!checkedIn && streak > 0 && (
        <button
          onClick={() => setShowMakeup(!showMakeup)}
          style={{
            width: '100%',
            padding: '10px',
            marginTop: '10px',
            background: 'transparent',
            border: '1px dashed var(--border)',
            borderRadius: '10px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.2s ease',
          }}
        >
          <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: '12px' }} />
          补签（消耗 50 积分）
        </button>
      )}

      {/* 补签确认 */}
      {showMakeup && (
        <div style={{
          marginTop: '12px',
          padding: '16px',
          background: 'var(--bg)',
          borderRadius: '12px',
          fontSize: '13px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}>
            <i className="fa-solid fa-info-circle" style={{ color: 'var(--primary)' }} />
            <span style={{ color: 'var(--text)' }}>补签昨天的签到，消耗 50 积分</span>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleMakeup}
              style={{
                flex: 1,
                padding: '10px',
                background: 'var(--primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <i className="fa-solid fa-check" />
              确认补签
            </button>
            <button
              onClick={() => setShowMakeup(false)}
              style={{
                flex: 1,
                padding: '10px',
                background: 'var(--card-bg, #fff)',
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
