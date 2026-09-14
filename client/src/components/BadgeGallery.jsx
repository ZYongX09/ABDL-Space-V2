import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { badgesAPI } from '../api';

/**
 * BadgeGallery — 徽章画廊组件
 * 展示用户已解锁的徽章，支持设置展示
 */
export default function BadgeGallery({ userId, editable = false }) {
  const { user } = useAuth();
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState(null);

  const targetId = userId || user?.id;

  useEffect(() => {
    if (!targetId) return;
    fetchBadges();
  }, [targetId]);

  async function fetchBadges() {
    try {
      setLoading(true);
      const json = await badgesAPI.getUserBadges(targetId);
      const list = Array.isArray(json.badges) ? json.badges : (json.badge ? [json.badge] : []);
      setBadges(list);
      setSelected(list.find(b => b.displayed)?.key || list.find(b => b.displayed)?.badge_key || null);
    } catch (err) {
      console.error('Failed to fetch badges:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      await badgesAPI.setDisplay(targetId, selected);
      setEditing(false);
      fetchBadges();
    } catch (err) {
      console.error('Failed to save badges:', err);
    }
  }

  function toggleBadge(key) {
    setSelected(selected === key ? null : key);
  }

  if (loading) {
    return (
      <div style={{
        padding: '20px',
        background: 'var(--bg-card)',
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

  if (badges.length === 0) {
    return (
      <div style={{
        padding: '32px 24px',
        background: 'var(--bg-card)',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        fontSize: '14px',
      }}>
        <i className="fa-solid fa-award" style={{
          fontSize: '48px',
          color: 'var(--border)',
          marginBottom: '16px',
          display: 'block',
        }} />
        <p style={{ margin: '0 0 4px', fontWeight: '600', color: 'var(--text)' }}>暂无徽章</p>
        <p style={{ margin: 0, fontSize: '13px' }}>完成特定成就即可解锁徽章</p>
      </div>
    );
  }

  return (
    <div style={{
      padding: '20px',
      background: 'var(--bg-card)',
      borderRadius: '16px',
      border: '1px solid var(--border)',
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <i className="fa-solid fa-award" style={{ color: 'var(--primary)', fontSize: '14px' }} />
          <span style={{
            fontSize: '15px',
            fontWeight: '600',
            color: 'var(--text)',
          }}>
            徽章 ({badges.length})
          </span>
        </div>
        {editable && (
          <button
            onClick={() => editing ? handleSave() : setEditing(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: editing ? 'var(--primary)' : 'transparent',
              color: editing ? '#fff' : 'var(--primary)',
              border: `1px solid ${editing ? 'var(--primary)' : 'var(--primary)30'}`,
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <i className={`fa-solid ${editing ? 'fa-check' : 'fa-pen'}`} style={{ fontSize: '10px' }} />
            {editing ? `保存 (${selected ? 1 : 0}/1)` : '编辑展示'}
          </button>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
        gap: '12px',
      }}>
        {badges.map(badge => (
          <div
            key={badge.key || badge.badge_key}
            onClick={() => editing && toggleBadge(badge.key || badge.badge_key)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '16px 8px',
              background: badge.displayed
                ? 'linear-gradient(135deg, var(--primary)15, var(--primary)08)'
                : 'var(--bg)',
              border: editing && selected === (badge.key || badge.badge_key)
                ? '2px solid var(--primary)'
                : badge.displayed
                  ? '1px solid var(--primary)30'
                  : '1px solid var(--border)',
              borderRadius: '12px',
              cursor: editing ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              opacity: editing && selected && selected !== (badge.key || badge.badge_key) ? 0.65 : 1,
            }}
          >
            <i className={`fa-solid ${badge.icon || 'fa-award'}`} style={{
              fontSize: '28px',
              color: badge.displayed ? 'var(--primary)' : 'var(--text-secondary)',
              marginBottom: '8px',
            }} />
            <div style={{
              fontSize: '11px',
              fontWeight: '600',
              color: 'var(--text)',
              textAlign: 'center',
              lineHeight: 1.3,
            }}>
              {badge.name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
