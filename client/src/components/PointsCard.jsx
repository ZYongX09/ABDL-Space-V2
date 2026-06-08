import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * PointsCard — 积分余额卡片组件
 */
export default function PointsCard({ userId }) {
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
      const res = await fetch(`/api/users/${targetId}/points`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch points:', err);
    } finally {
      setLoading(false);
    }
  }

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

  if (!data) return null;

  return (
    <div style={{
      padding: '24px',
      background: 'linear-gradient(135deg, #F59E0B15, #F59E0B08)',
      border: '1px solid #F59E0B25',
      borderRadius: '16px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '16px',
      }}>
        <div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px',
          }}>
            <i className="fa-solid fa-coins" style={{ color: '#F59E0B', fontSize: '14px' }} />
            <span style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              fontWeight: '600',
            }}>
              积分余额
            </span>
          </div>
          <div style={{
            fontSize: '32px',
            fontWeight: '700',
            color: '#F59E0B',
            lineHeight: 1,
            fontFeatureSettings: 'tnum',
          }}>
            {data.balance.toLocaleString()}
          </div>
        </div>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '14px',
          background: '#F59E0B20',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <i className="fa-solid fa-wallet" style={{ fontSize: '20px', color: '#F59E0B' }} />
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: '20px',
        fontSize: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <i className="fa-solid fa-arrow-trend-up" style={{ fontSize: '10px', color: '#10B981' }} />
          <span style={{ color: 'var(--text-secondary)' }}>累计获得</span>
          <span style={{ color: '#10B981', fontWeight: '600' }}>
            +{data.total_earned.toLocaleString()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <i className="fa-solid fa-arrow-trend-down" style={{ fontSize: '10px', color: '#EF4444' }} />
          <span style={{ color: 'var(--text-secondary)' }}>累计消耗</span>
          <span style={{ color: '#EF4444', fontWeight: '600' }}>
            -{data.total_spent.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
