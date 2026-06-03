import { useState, useEffect, useMemo } from 'react';
import PageLayout from '../components/PageLayout';

const SEV_COLORS = {
  P0: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)', text: '#ef4444', icon: '🔴' },
  P1: { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.4)', text: '#f97316', icon: '🟠' },
  P2: { bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.4)', text: '#eab308', icon: '🟡' },
  P3: { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.4)', text: '#3b82f6', icon: '🔵' },
};

const SEV_LABELS = { P0: '致命', P1: '高', P2: '中', P3: '低' };

export default function BugDashboard() {
  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('id');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    fetch('/bugs.json')
      .then(r => { if (!r.ok) throw new Error('加载失败'); return r.json(); })
      .then(data => { setBugs(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const stats = useMemo(() => {
    const s = { P0: 0, P1: 0, P2: 0, P3: 0, total: bugs.length };
    const components = {};
    bugs.forEach(b => {
      s[b.severity] = (s[b.severity] || 0) + 1;
      const c = b.component || 'other';
      if (!components[c]) components[c] = { total: 0, P0: 0, P1: 0, P2: 0, P3: 0 };
      components[c].total++;
      components[c][b.severity] = (components[c][b.severity] || 0) + 1;
    });
    const topComponents = Object.entries(components)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 12);
    return { ...s, components, topComponents };
  }, [bugs]);

  const filtered = useMemo(() => {
    let list = bugs;
    if (filter !== 'all') list = list.filter(b => b.severity === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(b =>
        b.desc.toLowerCase().includes(q) ||
        b.file.toLowerCase().includes(q) ||
        b.component.toLowerCase().includes(q) ||
        String(b.id).includes(q)
      );
    }
    list = [...list].sort((a, b) => {
      if (sortKey === 'id') return sortDir === 'asc' ? a.id - b.id : b.id - a.id;
      if (sortKey === 'severity') {
        const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
        return sortDir === 'asc' ? order[a.severity] - order[b.severity] : order[b.severity] - order[a.severity];
      }
      return 0;
    });
    return list;
  }, [bugs, filter, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  if (loading) return (
    <PageLayout hero={{ icon: 'fa-bug', title: 'Bug 追踪面板', subtitle: '加载中...' }}>
      <div className="flex items-center justify-center py-20"><div className="spinner" /></div>
    </PageLayout>
  );

  if (error) return (
    <PageLayout hero={{ icon: 'fa-bug', title: 'Bug 追踪面板', subtitle: '加载失败' }}>
      <div className="empty-state">
        <div className="icon"><i className="fa-solid fa-circle-exclamation" /></div>
        <h3>数据加载失败</h3>
        <p className="mt-2">{error}</p>
        <button className="btn btn-primary mt-4" onClick={() => window.location.reload()}>刷新重试</button>
      </div>
    </PageLayout>
  );

  return (
    <PageLayout hero={{ icon: 'fa-bug', title: 'Bug 追踪面板', subtitle: `ABDL Space 安全与质量审计 · ${stats.total} 个问题` }}>
      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {['P0', 'P1', 'P2', 'P3'].map(sev => (
          <div key={sev} onClick={() => setFilter(filter === sev ? 'all' : sev)}
            style={{
              background: filter === sev ? SEV_COLORS[sev].bg : 'var(--bg-card)',
              border: `2px solid ${filter === sev ? SEV_COLORS[sev].border : 'var(--border)'}`,
              borderRadius: 14, padding: '16px 14px', cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span>{SEV_COLORS[sev].icon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: SEV_COLORS[sev].text }}>{sev} {SEV_LABELS[sev]}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
              {stats[sev]}
            </div>
          </div>
        ))}
        <div style={{ background: 'var(--bg-card)', border: '2px solid var(--border)', borderRadius: 14, padding: '16px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span>📊</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>总计</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            {stats.total}
          </div>
        </div>
      </div>

      {/* Severity Bar */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 10 }}>
          {['P0', 'P1', 'P2', 'P3'].map(sev => (
            <div key={sev} style={{
              width: `${(stats[sev] / stats.total) * 100}%`,
              background: SEV_COLORS[sev].text,
              transition: 'width 0.5s ease',
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          {['P0', 'P1', 'P2', 'P3'].map(sev => (
            <span key={sev} style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {SEV_COLORS[sev].icon} {Math.round((stats[sev] / stats.total) * 100)}%
            </span>
          ))}
        </div>
      </div>

      {/* Top Components */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          <i className="fa-solid fa-folder-open mr-2" style={{ color: 'var(--primary-dark)' }} />
          问题最多的模块
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {stats.topComponents.map(([name, data]) => (
            <div key={name} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 10,
              background: 'var(--input-bg)', fontSize: 13,
            }}>
              <span style={{ fontWeight: 600, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name}
              </span>
              <span style={{
                background: SEV_COLORS.P2.bg, color: SEV_COLORS.P2.text,
                borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {data.total}
              </span>
              {data.P0 > 0 && <span style={{ fontSize: 10, color: SEV_COLORS.P0.text }}>🔴{data.P0}</span>}
              {data.P1 > 0 && <span style={{ fontSize: 10, color: SEV_COLORS.P1.text }}>🟠{data.P1}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          className="form-control"
          placeholder="搜索 Bug 描述、文件、编号..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <select className="form-control" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">全部严重度</option>
          <option value="P0">🔴 P0 致命</option>
          <option value="P1">🟠 P1 高</option>
          <option value="P2">🟡 P2 中</option>
          <option value="P3">🔵 P3 低</option>
        </select>
      </div>

      {/* Results count */}
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
        显示 {filtered.length} / {stats.total} 个 Bug
        {filter !== 'all' && <span> · 筛选: {SEV_COLORS[filter].icon} {filter}</span>}
        {search && <span> · 搜索: "{search}"</span>}
      </div>

      {/* Bug Table */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 20 }}>
        {/* Table Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '60px 50px 1fr',
          padding: '10px 16px', borderBottom: '2px solid var(--border)',
          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
        }}>
          <span onClick={() => toggleSort('id')} style={{ cursor: 'pointer' }}>
            ID {sortKey === 'id' && (sortDir === 'asc' ? '↑' : '↓')}
          </span>
          <span onClick={() => toggleSort('severity')} style={{ cursor: 'pointer' }}>
            级别 {sortKey === 'severity' && (sortDir === 'asc' ? '↑' : '↓')}
          </span>
          <span>描述</span>
        </div>

        {/* Rows */}
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-check-circle" style={{ fontSize: 32, marginBottom: 8, display: 'block', opacity: 0.4 }} />
              没有匹配的 Bug
            </div>
          ) : filtered.map(bug => {
            const sev = SEV_COLORS[bug.severity] || SEV_COLORS.P3;
            const expanded = expandedId === bug.id;
            return (
              <div key={bug.id}
                onClick={() => setExpandedId(expanded ? null : bug.id)}
                style={{
                  display: 'grid', gridTemplateColumns: '60px 50px 1fr',
                  padding: '10px 16px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                  background: expanded ? sev.bg : 'transparent',
                  transition: 'background 0.15s',
                  alignItems: 'start',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                  {bug.id}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: sev.text,
                  background: sev.bg, borderRadius: 6, padding: '2px 6px',
                  textAlign: 'center', whiteSpace: 'nowrap',
                }}>
                  {bug.severity}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, color: 'var(--text)',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: expanded ? 'normal' : 'nowrap',
                    lineHeight: 1.4,
                  }}>
                    {bug.desc}
                  </div>
                  {expanded && bug.file && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'monospace' }}>
                      <i className="fa-solid fa-file-code mr-1" />{bug.file}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', padding: '16px 0' }}>
        ABDL Space Bug 追踪面板 · 排查时间 2026-05-28 · 共 61 轮分析
      </div>
    </PageLayout>
  );
}
