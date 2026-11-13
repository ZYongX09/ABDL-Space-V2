import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { exactCount } from '../../appClients/model.js';
import { adminAPI } from '../../api';
import AdminLayout from './layout';
import { Card, Delta, Empty, ErrorBox, Loading, StatCard, Avatar, Toolbar } from './ui';
import { HBars, LinesChart } from './charts';
import { fmtFull, fmtNum } from './util';
import './member-ux.css';

const ACTIVITY_ITEMS = [
  { key: 'users', label: '新增用户' }, { key: 'posts', label: '新帖子' },
  { key: 'post_comments', label: '评论' }, { key: 'daily_checkins', label: '签到' },
  { key: 'likes', label: '点赞' }, { key: 'ratings', label: '评分' },
];
const TREND_KEYS = [
  { key: 'users', name: '新增用户', color: 'var(--ac-action)' },
  { key: 'posts', name: '新帖子', color: 'var(--ac-warning)' },
  { key: 'comments', name: '评论', color: 'var(--ac-comment)' },
  { key: 'checkins', name: '签到', color: 'var(--ac-success)' },
  { key: 'likes', name: '点赞', color: 'var(--ac-pink)' },
  { key: 'ratings', name: '评分', color: 'var(--ac-violet)' },
  { key: 'novels', name: '小说', color: 'var(--ac-series-novel)' },
];
const PRIMARY_TOTALS = [
  { key: 'users', label: '注册用户', icon: 'fa-users', tone: 'blue' },
  { key: 'appUsers', label: '原生 App 观测账号', icon: 'fa-mobile-screen', tone: 'green' },
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
  { key: 'reports', label: '内容举报', icon: 'fa-flag', href: '/admin/reports', action: '查看举报' },
  { key: 'friend_reports', label: '交友请求举报', icon: 'fa-user-group', href: '/admin/reports', action: '查看举报' },
  { key: 'novel_reports', label: '小说举报', icon: 'fa-book-skull', href: '/admin/novels', action: '进入小说审核' },
  { key: 'novel_appeals', label: '申诉待审', icon: 'fa-scale-balanced', href: '/admin/novels', action: '进入小说审核' },
  { key: 'security_24h', label: '24 小时安全事件', icon: 'fa-shield-halved', href: '/admin/security', action: '查看安全事件', event: true },
];
const INITIAL_RESOURCE = { data: null, loading: true, error: '', receivedAt: null };

export function knownCount(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
const countText = value => knownCount(value) === null ? '—' : fmtNum(value);

export function weekDelta(overview, key) {
  const week = knownCount(overview?.week?.[key]);
  const previousWeek = knownCount(overview?.prevWeek?.[key]);
  if (week === null || previousWeek === null) return '数据未提供';
  if (previousWeek === 0) return week > 0 ? '新增' : '持平';
  const delta = Math.round(((week - previousWeek) / previousWeek) * 100);
  return delta === 0 ? '持平' : `${delta > 0 ? '+' : ''}${delta}%`;
}

export function trendRows(trends, key) {
  if (!Array.isArray(trends?.series?.[key])) return null;
  return trends.series[key].filter(item => item?.d && knownCount(item.c) !== null)
    .map(item => ({ date: item.d, count: Number(item.c) })).sort((a, b) => a.date.localeCompare(b.date));
}

export function OverviewResourceNotice({ resource, label, onRetry }) {
  return <div className="ac-member-resource" aria-busy={resource.loading}>
    {resource.loading && !resource.data && <Loading text={`正在读取${label}…`} />}
    {resource.loading && resource.data && <p className="ac-member-notice" role="status">正在刷新{label}，下方保留上次成功数据。</p>}
    {resource.error && <div className="ac-member-retry"><ErrorBox msg={`${label}：${resource.error}${resource.data ? '；下方为上次成功数据，并非最新结果。' : '；尚无可用数据。'}`} /><button type="button" className="ac-btn" disabled={resource.loading} onClick={onRetry}>重试{label}</button></div>}
  </div>;
}

export function OverviewTasks({ overview }) {
  return <div className="ac-list ac-member-tasks">{PENDING_ITEMS.map(item => {
    const count = knownCount(overview?.pending?.[item.key]);
    return <Link className="ac-list-row" key={item.key} to={item.href}>
      <span className="ac-list-row-icon"><i className={`fa-solid ${item.icon}`} aria-hidden="true" /></span>
      <span className="ac-list-copy"><span className="ac-list-title">{item.label}</span><span className="ac-list-meta ac-member-block">{item.action}{item.event ? ' · 事件量不等于待办量' : ''}</span></span>
      <span className={`ac-pill ${count > 0 ? 'amber' : 'slate'}`}>{count === null ? '数量未提供' : item.event ? `${fmtNum(count)} 条事件` : count > 0 ? `${fmtNum(count)} 待处理` : '0 待处理'}</span>
    </Link>;
  })}</div>;
}

export default function AdminOverview() {
  const [overviewResource, setOverviewResource] = useState(INITIAL_RESOURCE);
  const [trendResource, setTrendResource] = useState(INITIAL_RESOURCE);
  const [appStats, setAppStats] = useState(INITIAL_RESOURCE);
  const [range, setRange] = useState(30);
  const [trendKey, setTrendKey] = useState('users');
  const requests = useRef({ overview: 0, trends: 0, app: 0 });
  const alive = useRef(true);
  useEffect(() => {
    // 请求计数器对象在此挂载期间不替换；cleanup 递增最新值，而非 setup 时的数字快照。
    const counters = requests.current;
    alive.current = true;
    return () => { alive.current = false; counters.overview++; counters.trends++; counters.app++; };
  }, []);

  const readResource = useCallback(async (key, read, setResource, extra = {}) => {
    const request = ++requests.current[key];
    setResource(current => ({ ...current, loading: true, error: '' }));
    try {
      const data = await read();
      if (alive.current && request === requests.current[key]) setResource({ data, loading: false, error: '', receivedAt: Date.now(), ...extra });
    } catch (error) {
      if (alive.current && request === requests.current[key]) setResource(current => ({ ...current, loading: false, error: error.message || '加载失败' }));
    }
  }, []);
  const loadOverview = useCallback(() => readResource('overview', () => adminAPI.overview(), setOverviewResource), [readResource]);
  const loadTrends = useCallback(() => readResource('trends', () => adminAPI.trends(range), setTrendResource, { range }), [range, readResource]);
  const loadAppStats = useCallback(() => readResource('app', () => adminAPI.appClientStats(), setAppStats), [readResource]);
  useEffect(() => { loadOverview(); loadAppStats(); }, [loadOverview, loadAppStats]);
  useEffect(() => { loadTrends(); }, [loadTrends]);

  const overview = overviewResource.data;
  const chartData = useMemo(() => trendRows(trendResource.data, trendKey), [trendResource.data, trendKey]);
  const currentTrend = TREND_KEYS.find(item => item.key === trendKey) || TREND_KEYS[0];
  const loadedRange = trendResource.range ?? range;
  const lastUpdated = overview?.generatedAt || overview?.updated_at;
  const refreshing = overviewResource.loading || trendResource.loading || appStats.loading;
  const collection = (key, emptyText, render) => !overview ? <p className="ac-section-note">{overviewResource.loading ? '等待运营总览数据…' : '运营总览不可用，请在上方重试。'}</p> : !Array.isArray(overview[key])
    ? <p className="ac-section-note">接口未提供此项数据，不能判定为空。</p>
    : overview[key].length ? render(overview[key]) : <Empty text={emptyText} />;

  return <AdminLayout active="overview"><div className="ac-page-stack ac-member-ux">
    <Toolbar result={overviewResource.receivedAt ? `总览读取于 ${new Date(overviewResource.receivedAt).toLocaleTimeString('zh-CN')}` : '统计未就绪；— 表示未提供，不是 0'}>
      <button type="button" className="ac-btn" disabled={refreshing} onClick={() => { loadOverview(); loadTrends(); loadAppStats(); }}><i className={`fa-solid ${refreshing ? 'fa-spinner fa-spin' : 'fa-rotate'}`} aria-hidden="true" />{refreshing ? '读取中…' : '刷新全部统计'}</button>
      <Link className="ac-btn" to="/admin/reports">处理举报</Link><Link className="ac-btn" to="/admin/users">管理用户</Link>
    </Toolbar>
    <OverviewResourceNotice resource={overviewResource} label="运营总览" onRetry={loadOverview} />
    <div className="ac-stat-grid ac-overview-primary">
      {PRIMARY_TOTALS.map(item => item.key === 'appUsers' ? <Link key={item.key} to="/admin/app-clients" title="查看认证原生时间线请求的精确观测统计">
        <StatCard label={item.label} value={appStats.data?.available && knownCount(appStats.data?.totals?.observed_users) !== null ? exactCount(appStats.data.totals.observed_users) : '—'} icon={item.icon} tone={item.tone} meta={appStats.loading ? '正在读取观测数据…' : appStats.error ? '读取失败；已有数字为上次成功数据' : appStats.data?.available === false ? '统计不可用（不是 0）' : '迁移后认证时间线请求 · 非安装量；查看明细'} />
      </Link> : <StatCard key={item.key} label={item.label} value={countText(overview?.totals?.[item.key])} icon={item.icon} tone={item.tone} meta={lastUpdated ? `更新于 ${fmtFull(lastUpdated)}` : overview ? '接口未提供统计生成时间' : '尚未取得统计'} />)}
    </div>
    <OverviewResourceNotice resource={appStats} label="App 观测统计" onRetry={loadAppStats} />
    <div className="ac-overview-secondary">{SECONDARY_TOTALS.map(item => <StatCard compact key={item.key} label={item.label} value={countText(overview?.totals?.[item.key])} icon={item.icon} tone={item.tone} />)}</div>
    {overview && <Card title="今日运营" description="今日、昨日与近七天按接口原值展示；缺失指标不作为零计算。" icon="fa-bolt">
      <div className="ac-activity-grid">{ACTIVITY_ITEMS.map(item => <div className="ac-activity-item" key={item.key}>
        <div className="ac-activity-head"><span className="ac-activity-label">{item.label}</span>{knownCount(overview.today?.[item.key]) !== null && knownCount(overview.yesterday?.[item.key]) !== null ? <Delta cur={overview.today[item.key]} prev={overview.yesterday[item.key]} /> : <span className="ac-cell-muted">昨日对比未提供</span>}</div>
        <div className="ac-activity-value">{countText(overview.today?.[item.key])}</div>
        <div className="ac-activity-meta">近 7 天 {countText(overview.week?.[item.key])} · 环比 {weekDelta(overview, item.key)}</div>
      </div>)}</div>
    </Card>}
    <Card title={`近 ${range} 天趋势`} description="总览与趋势独立读取；只绘制接口返回日期，不将缺失日期补为零。" icon="fa-chart-line" action={<div className="ac-action-group" aria-label="趋势时间范围">{[7, 30, 60, 90].map(days => <button type="button" key={days} className={`ac-btn ${range === days ? 'primary' : ''}`} aria-pressed={range === days} onClick={() => setRange(days)}>{days} 天</button>)}<button type="button" className="ac-btn" disabled={trendResource.loading} onClick={loadTrends}>刷新趋势</button></div>}>
      <div className="ac-tabs" role="tablist" aria-label="趋势指标">{TREND_KEYS.map(item => <button type="button" role="tab" key={item.key} className={`ac-tab ${trendKey === item.key ? 'active' : ''}`} aria-selected={trendKey === item.key} onClick={() => setTrendKey(item.key)}>{item.name}</button>)}</div>
      <OverviewResourceNotice resource={trendResource} label="趋势" onRetry={loadTrends} />
      {trendResource.data && <><p className="ac-section-note">当前图表：近 {loadedRange} 天 · {currentTrend.name}{loadedRange !== range ? `；所选 ${range} 天尚未读取成功，当前仍是旧范围。` : ''}</p>{chartData === null ? <p className="ac-section-note">接口未提供该指标序列，不能判定为零。</p> : chartData.length ? <>
        <LinesChart title={`${currentTrend.name}近 ${loadedRange} 天趋势`} datasets={[{ name: currentTrend.name, color: currentTrend.color, values: chartData.map(item => item.count) }]} labels={chartData.map(item => item.date)} />
        <details className="ac-member-disclosure"><summary>查看每日数值（{chartData.length} 条，不依赖悬停）</summary><table className="ac-table ac-member-small-table"><caption className="ac-member-sr">{currentTrend.name}每日数值</caption><thead><tr><th scope="col">日期</th><th scope="col">数量</th></tr></thead><tbody>{chartData.map(item => <tr key={item.date}><th scope="row">{item.date}</th><td>{countText(item.count)}</td></tr>)}</tbody></table></details>
      </> : <Empty text="接口已返回该指标空序列，暂无可绘制记录" />}</>}
    </Card>
    <div className="ac-overview-grid">
      <Card title="待处理事项" description="仅展示接口提供的数量；安全事件量不是待办量。" icon="fa-list-check"><OverviewTasks overview={overview} /></Card>
      <Card title="近 30 天地域分布" description="发帖量最高的十个地区。" icon="fa-map-location-dot">{collection('provinces', '暂无地域数据', items => <HBars items={items.map(item => ({ label: item.name || '未知', value: item.c }))} unit=" 帖" />)}</Card>
      <Card title="徽章持有排行" description="按当前持有人数排序。" icon="fa-medal">{collection('topBadges', '暂无徽章数据', items => <HBars items={items.map(item => ({ label: item.name, value: item.c }))} color="var(--ac-warning)" />)}</Card>
    </div>
    <div className="ac-overview-grid ac-overview-grid-wide">
      <Card title="最新注册" description="近期加入社区的用户；管理详情在用户管理中查看。" icon="fa-user-plus">{collection('recentUsers', '暂无新注册', items => <div className="ac-list">{items.map(user => <div className="ac-list-row ac-member-recent-user" key={user.id}><Avatar src={user.avatar} size={32} /><div className="ac-list-copy"><a className="ac-list-title ac-link-button" href={`/user/${user.id}`}>@{user.username}</a><div className="ac-list-meta">ID {user.id}</div></div><span className="ac-list-time">{fmtFull(user.created_at)}</span></div>)}</div>)}</Card>
      <Card title="最新帖子" description="展开可阅读完整内容，无需悬停。" icon="fa-comment-dots">{collection('recentPosts', '暂无帖子', items => <div className="ac-list">{items.map(post => <details className="ac-member-disclosure" key={post.id}><summary>#{post.id} · @{post.username} · {fmtFull(post.created_at)}</summary><p className="ac-member-long">{post.content}</p><a className="ac-btn" href={`/forum/${post.id}`}>查看帖子</a></details>)}</div>)}</Card>
    </div>
  </div></AdminLayout>;
}
