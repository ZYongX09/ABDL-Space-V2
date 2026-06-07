import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AnnouncementCard from './AnnouncementCard';
import RankingCard from './RankingCard';

/**
 * 右侧栏 — 搜索 + 公告 + 排行榜 + Footer
 * sticky 布局，独立滚动
 */
export default function RightSidebar() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/search?q=${encodeURIComponent(search.trim())}`);
    }
  };

  return (
    <aside className="home-right">
      {/* 搜索栏 */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, padding: '12px 0' }}>
        <form onSubmit={handleSearch} style={{ position: 'relative' }}>
          <i className="fa-solid fa-magnifying-glass" style={{
            position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', fontSize: '14px', pointerEvents: 'none',
          }} />
          <input
            className="form-control"
            placeholder="搜索帖子..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              paddingLeft: '38px', borderRadius: '20px',
              background: 'var(--input-bg)', border: '1px solid transparent',
            }}
          />
        </form>
      </div>

      {/* 公告卡片 */}
      <AnnouncementCard />

      {/* 排行榜卡片 */}
      <RankingCard />

      {/* Footer */}
      <footer style={{ padding: '16px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <a href="/about" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>关于</a>
          <a href="/privacy" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>隐私</a>
          <a href="/terms" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>条款</a>
          <a href="/termwiki" style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>术语 Wiki</a>
        </div>
        <div style={{ marginTop: '8px' }}>ABDL Space v2 · © {new Date().getFullYear()}</div>
      </footer>
    </aside>
  );
}
