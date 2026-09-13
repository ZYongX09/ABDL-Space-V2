import { useEffect, useMemo, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Delta, Empty, ErrorBox, Loading, StatCard, Avatar } from './ui';
import { fillDaily, HBars, LinesChart } from './charts';
import { fmtFull, fmtNum } from './util';

const ACTIVITY_ITEMS = [
  { key: 'users', label: '新增用户' },
  { key: 'posts', label: '新帖子' },
  { key: 'post_comments', label: '评论' },
  { key: 'daily_checkins', label: '签到' },
  { key: 'likes', label: '点赞' },
  { key: 'ratings', label: '评分' },
];

const TREND_KEYS = [
  { key: 'users', name: '新增用户', color: '#245f97' },
  { key: 'posts', name: '新帖子', color: '#a76100' },
  { key: 'comments', name: '评论', color: '#147a70' },
  { key: 'checkins', name: '签到', color: '#147a55' },
  { key: 'likes', name: '点赞', color: '#a43f72' },
  { key: 'ratings', name: '评分', color: '#6b4fb2' },
  { key: 'novels', name: '小说', color: '#4c61a8' },
];

const PRIMARY_TOTALS = [
  { key: 'users', label: '注册用户', icon: 'fa-users', tone: 'blue' },
  { key: 'appUsers', label: 'App 用户', icon: 'fa-mobile-screen', tone: 'green' },
  { key: 'posts', label: '帖子总数', icon: 'fa-file-lines', tone: 'amber' },
  { key: 'comments', label: '评论总数', icon: 'fa-comments', tone: 'violet' },
];

const SECONDARY_TOTALS = [
  { key: 'bannedUsers', label: '封禁账号', icon: 'fa-ban', tone: 'red' },
  { key: 'likes', label: '点赞总数', icon: 'fa-heart', tone: 'pink' },
  { key: 'checkins', label: '签到总数', icon: 'fa-calendar-check', tone: 'green' },
  { key: 'ratings', label: '评分总数', icon: 'fa-star', tone: 'violet' },
  { key: 'diapers', label: '产品条目', icon: 'fa-box-open', tone: 'amber' },
  { key: 'novels', label: '小说作品', icon: 'fa-book-open', tone: 'blue' },
  { key: 'badges', label: '徽章发放', icon: 'fa-medal', tone: 'amber' },
];

const PENDING_ITEMS = [
  { key: 'reports', label: '内容举报', icon: 'fa-flag', href: '/admin/reports' },
  { key: 'friend_reports', label: '交友请求举报', icon: 'fa-user-group', href: '/admin/reports' },
  { key: 'novel_reports', label: '小说举报', icon: 'fa-book-skull', href: '/admin/novels' },
  { key: 'novel_appeals', label: '申诉待审', icon: 'fa-scale-balanced', href: '/admin/novels' },
  { key: 'security_24h', label: '24 小时安全事件', icon: 'fa-shield-halved', href: '/admin/security' },
];

function weekDelta(overview, key) {
  const week = Number(overview?.week?.[key]) || 0;
  const previousWeek = Number(overview?.prevWeek?.[key]) || 0;
  if (previousWeek <= 0) return week > 0 ? '新增' : '—';
  const delta = Math.round(((week - previousWeek) / previousWeek) * 100);
  if (delta === 0) return '持平';
  return `${delta > 0 ? '+' : ''}${delta}%`;
}

export default function AdminOverview() {
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [trends, setTrends] = useState(null);
  const [range, setRange] = useState(30);
  const [trendKey, setTrendKey] = useState('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [overviewResult, trendsResult] = await Promise.all([adminAPI.overview(), adminAPI.trends(range)]);
      setOverview(overviewResult);
      setTrends(trendsResult);
    } catch (loadError) {
      const message = loadError.message || '加载失败';
      setError(message);
      toast.error(`统计加载失败：${message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [range]);

  const chartData = useMemo(() => {
    if (!trends) return [];
    return fillDaily(trends.series?.[trendKey] || [], trends.days || range);
  }, [trends, trendKey, range]);

  const currentTrend = TREND_KEYS.find(item => item.key === trendKey) || TREND_KEYS[0];
  const lastUpdated = overview?.generatedAt || overview?.updated_at;

  return (
    <AdminLayout active="overview">
      <div className="ac-page-stack">
        {loading && !overview && <Loading text="正在汇总运营数据…" />}
        <ErrorBox msg={error} />

        <div className="ac-stat-grid ac-overview-primary">
          {PRIMARY_TOTALS.map(item => (
            <StatCard
              key={item.key}
              label={item.label}
              value={fmtNum(overview?.totals?.[item.key])}
              icon={item.icon}
              tone={item.tone}
              meta={lastUpdated ? `更新于 ${fmtFull(lastUpdated)}` : '累计数据'}
            />
          ))}
        </div>

        <div className="ac-overview-secondary">
          {SECONDARY_TOTALS.map(item => (
            <StatCard
              compact
              key={item.key}
              label={item.label}
              value={fmtNum(overview?.totals?.[item.key])}
              icon={item.icon}
              tone={item.tone}
            />
          ))}
        </div>

        <Card
          title="今日运营"
          description="今日实时数据，并与昨日和近七天表现对照。"
          icon="fa-bolt"
        >
          <div className="ac-activity-grid">
            {ACTIVITY_ITEMS.map(item => (
              <div className="ac-activity-item" key={item.key}>
                <div className="ac-activity-head">
                  <span className="ac-activity-label">{item.label}</span>
                  <Delta cur={overview?.today?.[item.key]} prev={overview?.yesterday?.[item.key]} />
                </div>
                <div className="ac-activity-value">{fmtNum(overview?.today?.[item.key])}</div>
                <div className="ac-activity-meta">近 7 天 {fmtNum(overview?.week?.[item.key])} · 环比 {weekDelta(overview, item.key)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title={`近 ${range} 天趋势`}
          description="切换时间范围和指标，观察运营数据变化。"
          icon="fa-chart-line"
          action={(
            <div className="ac-action-group" aria-label="趋势时间范围">
              {[7, 30, 60, 90].map(days => (
                <button type="button" key={days} className={`ac-btn ${range === days ? 'primary' : ''}`} aria-pressed={range === days} onClick={() => setRange(days)}>{days} 天</button>
              ))}
            </div>
          )}
        >
          <div className="ac-tabs" role="tablist" aria-label="趋势指标" style={{ marginBottom: 14 }}>
            {TREND_KEYS.map(item => (
              <button
                type="button"
                role="tab"
                key={item.key}
                className={`ac-tab ${trendKey === item.key ? 'active' : ''}`}
                aria-selected={trendKey === item.key}
                onClick={() => setTrendKey(item.key)}
              >{item.name}</button>
            ))}
          </div>
          {trends ? (
            <LinesChart
              title={`${currentTrend.name}近 ${range} 天趋势`}
              datasets={[{ name: currentTrend.name, color: currentTrend.color, values: chartData.map(item => item.count) }]}
              labels={chartData.map(item => item.date)}
            />
          ) : <Loading />}
        </Card>

        <div className="ac-overview-grid">
          <Card title="待处理事项" description="需要管理员关注的治理与安全事项。" icon="fa-list-check">
            <div className="ac-list">
              {PENDING_ITEMS.map(item => {
                const count = Number(overview?.pending?.[item.key]) || 0;
                return (
                  <a className="ac-list-row" key={item.key} href={item.href}>
                    <span className="ac-list-row-icon"><i className={`fa-solid ${item.icon}`} aria-hidden="true" /></span>
                    <span className="ac-list-copy"><span className="ac-list-title">{item.label}</span></span>
                    <span className={`ac-pill ${count > 0 ? 'amber' : 'slate'}`}>{count > 0 ? `${fmtNum(count)} 待处理` : '已清空'}</span>
                  </a>
                );
              })}
            </div>
          </Card>

          <Card title="近 30 天地域分布" description="发帖量最高的十个地区。" icon="fa-map-location-dot">
            {(overview?.provinces || []).length ? (
              <HBars items={overview.provinces.map(item => ({ label: item.name || '未知', value: item.c }))} max={overview.provinces?.[0]?.c || 1} unit=" 帖" />
            ) : <Empty text="暂无地域数据" icon="fa-map-location-dot" />}
          </Card>

          <Card title="徽章持有排行" description="按当前持有人数排序。" icon="fa-medal">
            {(overview?.topBadges || []).length ? (
              <HBars items={overview.topBadges.map(item => ({ label: item.name, value: item.c }))} max={overview.topBadges?.[0]?.c || 1} color="#a76100" />
            ) : <Empty text="暂无徽章数据" icon="fa-medal" />}
          </Card>
        </div>

        <div className="ac-overview-grid ac-overview-grid-wide">
          <Card title="最新注册" description="近期加入社区的用户。" icon="fa-user-plus">
            {(overview?.recentUsers || []).length ? (
              <div className="ac-list">
                {overview.recentUsers.map(user => (
                  <div className="ac-list-row" key={user.id}>
                    <Avatar src={user.avatar} size={32} />
                    <div className="ac-list-copy">
                      <a className="ac-list-title ac-link-button" href={`/user/${user.id}`}>{user.username}</a>
                    </div>
                    <span className="ac-list-time">{fmtFull(user.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : <Empty text="暂无新注册" icon="fa-user-plus" />}
          </Card>

          <Card title="最新帖子" description="社区最近发布的内容。" icon="fa-comment-dots">
            {(overview?.recentPosts || []).length ? (
              <div className="ac-list">
                {overview.recentPosts.map(post => (
                  <a className="ac-list-row" key={post.id} href={`/forum/${post.id}`}>
                    <span className="ac-list-row-icon"><i className="fa-solid fa-file-lines" aria-hidden="true" /></span>
                    <div className="ac-list-copy">
                      <div className="ac-list-title">{post.content}</div>
                      <div className="ac-list-meta">@{post.username} · {fmtFull(post.created_at)}</div>
                    </div>
                  </a>
                ))}
              </div>
            ) : <Empty text="暂无帖子" icon="fa-file-lines" />}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
