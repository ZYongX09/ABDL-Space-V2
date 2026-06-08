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
        background: 'var(--card-bg, #f5f5f5)',
        borderRadius: '16px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
      }}>
        加载中...
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{
      padding: '20px',
      background: 'linear-gradient(135deg, #F59E0B15, #F59E0B08)',
      border: '1px solid #F59E0B25',
      borderRadius: '16px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '12px',
      }}>
        <div>
          <div style={{
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginBottom: '4px',
          }}>
            积分余额
          </div>
          <div style={{
            fontSize: '28px',
            fontWeight: '700',
            color: '#F59E0B',
            lineHeight: 1,
          }}>
            {data.balance.toLocaleString()}
          </div>
        </div>
        <div style={{
          fontSize: '24px',
        }}>
          💰
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: '16px',
        fontSize: '12px',
        color: 'var(--text-secondary)',
      }}>
        <div>
          <span>累计获得: </span>
          <span style={{ color: '#10B981', fontWeight: '600' }}>
            +{data.total_earned.toLocaleString()}
          </span>
        </div>
        <div>
          <span>累计消耗: </span>
          <span style={{ color: '#EF4444', fontWeight: '600' }}>
            -{data.total_spent.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}
