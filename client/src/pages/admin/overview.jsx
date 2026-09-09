import { useEffect, useMemo, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Delta, ErrorBox, Loading, Empty, Avatar } from './ui';
import { LinesChart, HBars } from './charts';
import { fmtFull, fmtNum } from './util';

const STAT_TABLES = {
  users: { label: '注册用户', color: '#3B82F6' },
  posts: { label: '帖子', color: '#F59E0B' },
  post_comments: { label: '评论', color: '#14B8A6' },
  ratings: { label: '评分', color: '#8B5CF6' },
  daily_checkins: { label: '签到', color: '#10B981' },
  likes: { label: '点赞', color: '#EC4899' },
};

const TREND_KEYS = [
  { key: 'users', name: '新增用户', color: '#3B82F6' },
  { key: 'posts', name: '新帖子', color: '#F59E0B' },
  { key: 'comments', name: '评论', color: '#14B8A6' },
  { key: 'checkins', name: '签到', color: '#10B981' },
  { key: 'likes', name: '点赞', color: '#EC4899' },
  { key: 'ratings', name: '评分', color: '#8B5CF6' },
  { key: 'novels', name: '小说', color: '#6366F1' },
];

const TOTALS = [
  { key: 'users', label: '注册用户', icon: 'fa-user-plus', color: '#3B82F6', tKey: 'users' },
  { key: 'appUsers', label: '已装 App', icon: 'fa-mobile-screen', color: '#0EA5E9', tKey: null },
  { key: 'bannedUsers', label: '封禁账号', icon: 'fa-ban', color: '#F43F5E', tKey: null },
  { key: 'posts', label: '帖子总数', icon: 'fa-file-lines', color: '#F59E0B', tKey: 'posts' },
  { key: 'comments', label: '评论总数', icon: 'fa-comments', color: '#14B8A6', tKey: 'post_comments' },
  { key: 'likes', label: '点赞总数', icon: 'fa-heart', color: '#EC4899', tKey: 'likes' },
  { key: 'checkins', label: '签到总数', icon: 'fa-calendar-check', color: '#10B981', tKey: 'daily_checkins' },
  { key: 'ratings', label: '评分总数', icon: 'fa-star', color: '#8B5CF6', tKey: 'ratings' },
  { key: 'diapers', label: '纸尿裤条目', icon: 'fa-box-open', color: '#D97706', tKey: null },
  { key: 'novels', label: '小说作品', icon: 'fa-book-open', color: '#6366F1', tKey: null },
  { key: 'badges', label: '徽章发放', icon: 'fa-medal', color: '#B45309', tKey: null },
];

const PENDING_ITEMS = [
  { key: 'reports', label: '内容举报', icon: 'fa-flag', href: '/admin/reports' },
  { key: 'friend_reports', label: '交友请求举报', icon: 'fa-user-group', href: '/admin/reports' },
  { key: 'novel_reports', label: '小说举报', icon: 'fa-book-skull', href: '/admin/novels' },
  { key: 'novel_appeals', label: '申诉待审', icon: 'fa-scale-balanced', href: '/admin/novels' },
  { key: 'security_24h', label: '24h 安全事件', icon: 'fa-shield-halved', href: '/admin/security' },
];

function weekDelta(ov, key) {
  const w = Number(ov?.week?.[key]) || 0;
  const pw = Number(ov?.prevWeek?.[key]) || 0;
  if (pw <= 0) return w > 0 ? '新增' : '—';
  const d = Math.round(((w - pw) / pw) * 100);
  if (d === 0) return '持平';
  return `${d > 0 ? '+' : ''}${d}%`;
}

export default function AdminOverview() {
  const toast = useToast();
  const [ov, setOv] = useState(null);
  const [trends, setTrends] = useState(null);
  const [range, setRange] = useState(30);
  const [tKey, setTKey] = useState('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [o, t] = await Promise.all([adminAPI.overview(), adminAPI.trends(range)]);
      setOv(o);
      setTrends(t);
    } catch (e) {
      setError(e.message || '加载失败');
      toast.error('统计加载失败: ' + (e.message || ''));
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range]);

  const chart = useMemo(() => {
    if (!trends) return null;
    const series = trends.series?.[tKey] || [];
    return series; // 直接交给 LinesChart 由其补齐日期
  }, [trends, tKey]);

  return (
    <AdminLayout active="overview">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && !ov && <Loading />}
        {error && <ErrorBox msg={error} />}

        {/* 核心指标 */}
        <div className="ac-stat-grid">
          {TOTALS.map(t => (
            <div className="ac-stat" key={t.key}>
              <span className="ac-stat-icon" style={{ background: t.color + '18', color: t.color }}>
                <i className={`fa-solid ${t.icon}`} />
              </span>
              <div className="ac-stat-num">{fmtNum(ov?.totals?.[t.key])}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="ac-stat-label">{t.label}</span>
                {t.tKey && <Delta cur={ov?.today?.[t.tKey]} prev={ov?.yesterday?.[t.tKey]} />}
              </div>
            </div>
          ))}
        </div>

        {/* 今日动态 */}
        <Card
          title="今日活跃"
          icon="fa-bolt"
          action={<span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>对比昨日 · 环比上周</span>}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
            {Object.keys(STAT_TABLES).map(k => (
              <div key={k}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-light)' }}>{STAT_TABLES[k].label}</span>
                  <Delta cur={ov?.today?.[k]} prev={ov?.yesterday?.[k]} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtNum(ov?.today?.[k])}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>今日</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>
                  近7天 {fmtNum(ov?.week?.[k])} · 环比 {weekDelta(ov, k)}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 趋势 */}
        <Card
          title={`近 ${range} 天趋势`}
          icon="fa-chart-line"
          action={
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[7, 30, 60, 90].map(r => (
                <a key={r} className={`ac-btn ${range === r ? 'primary' : ''}`} style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setRange(r)}>{r}天</a>
              ))}
            </div>
          }
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {TREND_KEYS.map(k => (
              <a key={k.key} className={`ac-btn ${tKey === k.key ? 'primary' : ''}`} style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setTKey(k.key)}>
                {k.name}
              </a>
            ))}
          </div>
          {chart ? (
            <LinesChart
              datasets={[{
                name: TREND_KEYS.find(k => k.key === tKey)?.name || tKey,
                color: TREND_KEYS.find(k => k.key === tKey)?.color || '#3B82F6',
                values: trendFilled(chart, trends?.days || range).map(d => d.count),
              }]}
              labels={trendFilled(chart, trends?.days || range).map(d => d.date)}
            />
          ) : <Loading />}
        </Card>

        {/* 待办 + 分布 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          <Card title="待办工单" icon="fa-list-check">
            {PENDING_ITEMS.map(it => (
              <a key={it.key} href={it.href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 2px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' }}>
                <i className={`fa-solid ${it.icon}`} style={{ width: 20, textAlign: 'center', color: 'var(--primary-dark)', fontSize: 13 }} />
                <span style={{ fontSize: 13, flex: 1 }}>{it.label}</span>
                <span className={`ac-pill ${Number(ov?.pending?.[it.key]) > 0 ? 'amber' : 'slate'}`}>
                  {Number(ov?.pending?.[it.key]) > 0 ? `${fmtNum(ov.pending[it.key])} 待处理` : '已清空'}
                </span>
              </a>
            ))}
          </Card>

          <Card title="近 30 天地域分布（Top 10）" icon="fa-map-location-dot">
            {(ov?.provinces || []).length ? (
              <HBars
                items={(ov.provinces || []).map(p => ({ label: p.name || '未知', value: p.c }))}
                max={ov.provinces?.[0]?.c || 1}
                unit=" 帖"
              />
            ) : <Empty text="暂无地域数据" />}
          </Card>

          <Card title="徽章持有排行" icon="fa-medal">
            {(ov?.topBadges || []).length ? (
              <HBars
                items={(ov.topBadges || []).map(b => ({ label: b.name, value: b.c }))}
                max={ov.topBadges?.[0]?.c || 1}
                color="#B45309"
              />
            ) : <Empty text="暂无徽章" />}
          </Card>
        </div>

        {/* 最新动态 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
          <Card title="最新注册" icon="fa-user-plus">
            {(ov?.recentUsers || []).length ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(ov.recentUsers || []).map(u => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <Avatar src={u.avatar} size={30} />
                    <a href={`/user/${u.id}`} style={{ color: 'var(--text)', fontWeight: 500, fontSize: 13, textDecoration: 'none', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</a>
                    <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtFull(u.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : <Empty text="暂无新注册" />}
          </Card>

          <Card title="最新帖子" icon="fa-comment-dots">
            {(ov?.recentPosts || []).length ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {(ov.recentPosts || []).map(p => (
                  <a key={p.id} href={`/forum/${p.id}`} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)', alignItems: 'flex-start' }}>
                    <i className="fa-solid fa-file-lines" style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.content}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>@{p.username} · {fmtFull(p.created_at)}</div>
                    </div>
                  </a>
                ))}
              </div>
            ) : <Empty>暂无帖子</Empty>}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}

/* 趋势序列补齐为 days 天 {date,count}（后端只返回有数据的日子，缺日补 0） */
function trendFilled(series, days) {
  const map = {};
  (series || []).forEach(s => { map[s.d] = Number(s.c) || 0; });
  const out = [];
  const p = (n) => String(n).padStart(2, '0');
  for (let i = days - 1; i >= 0; i--) {
    const t = new Date(Date.now() + 8 * 3600 * 1000);
    t.setUTCDate(t.getUTCDate() - i);
    const date = `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
    out.push({ date, count: map[date] || 0 });
  }
  return out;
}