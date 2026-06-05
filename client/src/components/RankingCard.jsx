import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { rankingsAPI } from '../api';
import { useTheme } from '../contexts/ThemeContext';

/** 右侧栏排行榜卡片 — 显示前5名 */
export default function RankingCard() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  useEffect(() => {
    rankingsAPI.get('hot', undefined, 5)
      .then(data => setItems(data.rankings || data.diapers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <div className="right-card" style={{
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius)',
      border: '1px solid var(--border)',
      padding: '16px',
    }}>
      <div className="flex items-center gap-2 mb-3">
        <i className="fa-solid fa-trophy" style={{ color: 'var(--warning)', fontSize: '14px' }} />
        <span style={{ fontWeight: 700, fontSize: '15px' }}>纸尿裤排行</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((item, i) => (
          <Link
            key={item.id}
            to={`/diaper/${item.id}`}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              textDecoration: 'none', color: 'var(--text)',
              padding: '6px 8px', borderRadius: 'var(--radius-sm)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover-bg)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {/* 排名 */}
            <span style={{
              width: '20px', height: '20px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '11px', fontWeight: 700,
              background: i < 3 ? 'var(--primary)' : 'var(--input-bg)',
              color: i < 3 ? '#fff' : 'var(--text-muted)',
              flexShrink: 0,
            }}>
              {i + 1}
            </span>

            {/* 信息 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.brand} {item.model}
              </div>
            </div>

            {/* 评分 */}
            {item.avg_score > 0 && (
              <span style={{ fontSize: '12px', color: 'var(--warning)', fontWeight: 600, flexShrink: 0 }}>
                ★ {item.avg_score}
              </span>
            )}
          </Link>
        ))}
      </div>

      <Link to="/rankings" style={{
        display: 'block', textAlign: 'center', marginTop: '12px',
        fontSize: '13px', color: 'var(--primary)', textDecoration: 'none',
        fontWeight: 600,
      }}>
        查看完整榜单 →
      </Link>
    </div>
  );
}
