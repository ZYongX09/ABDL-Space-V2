import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * BadgeGallery — 徽章画廊组件
 * 展示用户已解锁的徽章，支持设置展示
 */
export default function BadgeGallery({ userId, editable = false }) {
  const { user } = useAuth();
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState([]);

  const targetId = userId || user?.id;

  useEffect(() => {
    if (!targetId) return;
    fetchBadges();
  }, [targetId]);

  async function fetchBadges() {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${targetId}/badges`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setBadges(json.badges || []);
        setSelected((json.badges || []).filter(b => b.displayed).map(b => b.key));
      }
    } catch (err) {
      console.error('Failed to fetch badges:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/${targetId}/badges/display`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ badge_keys: selected }),
      });
      if (res.ok) {
        setEditing(false);
        fetchBadges();
      }
    } catch (err) {
      console.error('Failed to save badges:', err);
    }
  }

  function toggleBadge(key) {
    if (selected.includes(key)) {
      setSelected(selected.filter(k => k !== key));
    } else if (selected.length < 3) {
      setSelected([...selected, key]);
    }
  }

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

  if (badges.length === 0) {
    return (
      <div style={{
        padding: '20px',
        background: 'var(--card-bg, #f5f5f5)',
        borderRadius: '16px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        fontSize: '14px',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏅</div>
        暂无徽章
      </div>
    );
  }

  return (
    <div style={{
      padding: '16px',
      background: 'var(--card-bg, #f5f5f5)',
      borderRadius: '16px',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
      }}>
        <div style={{
          fontSize: '14px',
          fontWeight: '600',
          color: 'var(--text)',
        }}>
          徽章 ({badges.length})
        </div>
        {editable && (
          <button
            onClick={() => editing ? handleSave() : setEditing(true)}
            style={{
              padding: '4px 12px',
              background: editing ? 'var(--primary)' : 'transparent',
              color: editing ? '#fff' : 'var(--primary)',
              border: '1px solid var(--primary)',
              borderRadius: '12px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {editing ? `保存 (${selected.length}/3)` : '编辑展示'}
          </button>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
        gap: '12px',
      }}>
        {badges.map(badge => (
          <div
            key={badge.key}
            onClick={() => editing && toggleBadge(badge.key)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '12px 8px',
              background: badge.displayed
                ? 'linear-gradient(135deg, var(--primary)15, var(--primary)08)'
                : 'var(--bg)',
              border: editing && selected.includes(badge.key)
                ? '2px solid var(--primary)'
                : badge.displayed
                  ? '1px solid var(--primary)30'
                  : '1px solid var(--border)',
              borderRadius: '12px',
              cursor: editing ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              opacity: editing && !selected.includes(badge.key) && selected.length >= 3 ? 0.5 : 1,
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '4px' }}>
              {badge.icon}
            </div>
            <div style={{
              fontSize: '11px',
              fontWeight: '600',
              color: 'var(--text)',
              textAlign: 'center',
              lineHeight: 1.2,
            }}>
              {badge.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
