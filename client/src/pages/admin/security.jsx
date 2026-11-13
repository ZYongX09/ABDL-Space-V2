import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import UserObservation from '../../userObservation/components.jsx';
import { useAuth } from '../../contexts/AuthContext';
import { adminSessionKey, isSuperAdmin } from './access.js';
import { createTestVerificationLookup } from './testVerificationCode.js';
import { adminAPI } from '../../api';
import AdminLayout from './layout';
import { Card, Empty, ErrorBox, Loading, Pagination, Pill, StatCard } from './ui';
import { HBars, MiniBars } from './charts';
import { fmtFull, fmtNum } from './util';

const PAGE_SIZE = 50;
const LEVEL_META = {
  critical: { label: '高危', color: 'var(--ac-danger)' },
  warning: { label: '警告', color: 'var(--ac-warning)' },
  info: { label: '提示', color: 'var(--ac-action)' },
  normal: { label: '正常', color: 'var(--ac-success)' },
};
function scoreTone(score) {
  const value = Number(score) || 0;
  if (value < 20) return 'red';
  if (value < 40) return 'amber';
  if (value < 60) return 'blue';
  return 'green';
}
export function TestVerificationCodeError({ error }) {
  if (!error) return null;
  return <p className="ac-field-error" role="alert">{error.message}{error.retryAfter ? `；请在 ${error.retryAfter} 秒后重试` : ''}</p>;
}
export function TestVerificationCodeView({ email, purpose, state, result, onEmail, onPurpose, onQuery, onClear }) {
  return <Card title="随机测试验证码查询" description="低频测试工具 · 仅超级管理员可查，仅限 @test.top；不提供固定万能码。" icon="fa-key">
    <details className="uo-disclosure"><summary>展开精确查询（敏感信息，仅显式读取）</summary>
      <form className="ac-form-grid" autoComplete="off" onSubmit={event => { event.preventDefault(); if (!state.pending) onQuery(); }}>
        <div className="ac-form-grid ac-form-grid-2">
          <label className="ac-form-field"><span className="ac-field-label">精确测试邮箱</span><input className="ac-input" type="email" required maxLength={73} placeholder="完整邮箱，例如 tester@test.top" value={email} onChange={event => onEmail(event.target.value)} autoComplete="off" spellCheck={false} disabled={state.pending} /></label>
          <label className="ac-form-field"><span className="ac-field-label">验证码用途</span><select className="ac-select" value={purpose} onChange={event => onPurpose(event.target.value)} disabled={state.pending}><option value="register">注册（register）</option><option value="reset">重置密码（reset）</option><option value="bind">绑定邮箱（bind）</option></select></label>
        </div>
        <p className="ac-field-hint">需先在对应流程获取验证码。必须显式查询，不支持通配或批量查询；到期、退出、切换账号或开始新查询时立即清空，不保存到本地存储，不提供一键复制。</p>
        <div className="uo-actions"><button type="submit" className="ac-btn primary" disabled={state.pending}>{state.pending ? '查询中…' : '查询测试验证码'}</button>{state.pending && <button type="button" className="ac-btn" onClick={onClear}>取消查询</button>}{result && <button type="button" className="ac-btn" onClick={onClear}>清空验证码显示</button>}</div>
        <TestVerificationCodeError error={state.error} />
        {result && <div role="status" className="security-code-result"><p>邮箱：{result.email}；用途：{result.type}</p><p>随机验证码：<strong><code>{result.code}</code></strong></p><p>到期时间：<time dateTime={new Date(result.expires_at * 1000).toISOString()}>{fmtFull(result.expires_at)}</time></p></div>}
      </form>
    </details>
  </Card>;
}
export function TestVerificationCodeCard({ user, token = '', request = adminAPI.getTestVerificationCode }) {
  const [email, setEmail] = useState('');
  const [purpose, setPurpose] = useState('register');
  const [state, setState] = useState({ pending: false, result: null, error: null });
  const sessionKey = adminSessionKey(user, token);
  const session = useRef({ user, token });
  session.current = { user, token };
  const lookup = useRef(null);
  useEffect(() => {
    const instance = createTestVerificationLookup({ request, getSession: () => session.current, onChange: next => setState({ ...next, sessionKey }), onRejected: (_error, key) => window.dispatchEvent(new CustomEvent('admin-session-rejected', { detail: { sessionKey: key } })) });
    lookup.current = instance;
    const block = () => instance.block();
    const rejected = event => { if (event.detail?.sessionKey === sessionKey) block(); };
    const storage = event => { if (!event.key || ['abdl_accounts', 'abdl_active_account', 'abdl_currentUser'].includes(event.key)) block(); };
    const expire = () => instance.expire();
    window.addEventListener('auth-session-changing', block); window.addEventListener('admin-session-rejected', rejected); window.addEventListener('storage', storage); window.addEventListener('pagehide', block); window.addEventListener('focus', expire); document.addEventListener('visibilitychange', expire);
    return () => { instance.dispose(); lookup.current = null; window.removeEventListener('auth-session-changing', block); window.removeEventListener('admin-session-rejected', rejected); window.removeEventListener('storage', storage); window.removeEventListener('pagehide', block); window.removeEventListener('focus', expire); document.removeEventListener('visibilitychange', expire); };
  }, [sessionKey, request]);
  if (!isSuperAdmin(user) || state.blocked) return null;
  const result = state.sessionKey === sessionKey && state.result?.expires_at * 1000 > Date.now() ? state.result : null;
  return <TestVerificationCodeView email={email} purpose={purpose} state={state} result={result} onEmail={value => { lookup.current?.clear(); setEmail(value); }} onPurpose={value => { lookup.current?.clear(); setPurpose(value); }} onQuery={() => lookup.current?.query({ email, type: purpose })} onClear={() => lookup.current?.clear()} />;
}

export function SecurityOverview({ stats, loading, error, onRetry }) {
  const trendData = (stats?.trend || []).map(item => ({ date: `${String(new Date((item.hour || 0) * 1000).getHours()).padStart(2, '0')}:00`, count: item.cnt || 0 }));
  const typeMax = Math.max(1, ...(stats?.typeStats || []).map(item => item.cnt || 0));
  const levelMax = Math.max(1, ...(stats?.scoreDistribution || []).map(item => item.cnt || 0));
  return <section className="ac-page-stack" aria-label="安全概览统计" aria-busy={loading}>
    <div className="uo-actions"><p className="ac-section-note">事件汇总用于定位风险，不等于用户行为结论。{stats && (loading || error) ? '下方保留上次成功读取的统计。' : ''}</p><button type="button" className="ac-btn" disabled={loading} onClick={onRetry}>{loading ? '读取统计中…' : error ? '重试安全统计' : '刷新安全统计'}</button></div>
    <ErrorBox msg={error} />{loading && <Loading text="读取安全统计…" />}
    <div className="ac-stat-grid">
      <StatCard label="24 小时安全事件" value={stats ? fmtNum(stats.dayCount) : '—'} icon="fa-triangle-exclamation" tone="red" meta="近期风险活动" />
      <StatCard label="7 天安全事件" value={stats ? fmtNum(stats.weekCount) : '—'} icon="fa-clock-rotate-left" tone="amber" meta="短期风险趋势" />
      <StatCard label="事件类型" value={stats ? fmtNum(stats.typeStats?.length) : '—'} icon="fa-shield-halved" tone="blue" meta="近 7 天出现" />
      <StatCard label="活跃小时" value={stats ? fmtNum(stats.trend?.length) : '—'} icon="fa-bolt" tone="green" meta="近 24 小时" />
    </div>
    {stats && <div className="ac-grid-3">
      <Card title="24 小时事件趋势" description="按小时统计安全事件数量。" icon="fa-chart-column">{trendData.length ? <MiniBars data={trendData} color="var(--ac-action)" showLabels ariaLabel="近 24 小时安全事件趋势" /> : <Empty text="近 24 小时暂无事件" />}</Card>
      <Card title="事件类型分布" description="近 7 天出现频率最高的事件类型。" icon="fa-list">{stats.typeStats?.length ? <HBars items={stats.typeStats.map(item => ({ label: item.event_type, value: item.cnt }))} max={typeMax} /> : <Empty text="7 天内暂无事件" />}</Card>
      <Card title="风险等级分布" description="按风险等级汇总近 7 天安全事件。" icon="fa-gauge">{stats.scoreDistribution?.length ? <HBars items={stats.scoreDistribution.map(item => ({ label: LEVEL_META[item.level]?.label || item.level, value: item.cnt, color: LEVEL_META[item.level]?.color || 'var(--ac-text-muted)' }))} max={levelMax} /> : <Empty text="暂无等级数据" />}</Card>
    </div>}
  </section>;
}
function LogSensitiveDetails({ log }) {
  return <details className="uo-disclosure security-log-details"><summary>展开会话、UA 与请求详情</summary><dl>{[['Session', log.session_id], ['User Agent', log.user_agent], ['详情', log.details]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value == null || value === '' ? '—' : typeof value === 'string' ? value : JSON.stringify(value)}</dd></div>)}</dl></details>;
}
export function SecurityLogs({ logs, total, page, type, draftType, loading, error, onDraftType, onApply, onReset, onRetry, onPage }) {
  return <Card title="安全日志" description="明确应用事件类型筛选；敏感会话与请求内容仅在展开单条记录后展示，不提供一键复制。" icon="fa-list-ul">
    <form className="uo-actions" onSubmit={event => { event.preventDefault(); onApply(); }}><label className="ac-form-field"><span className="ac-field-label">事件类型</span><input className="ac-input" placeholder="输入精确事件类型，留空为全部" value={draftType} onChange={event => onDraftType(event.target.value)} /></label><button type="submit" className="ac-btn primary" disabled={loading}>应用筛选</button><button type="button" className="ac-btn" disabled={loading || !draftType && !type} onClick={onReset}>重置筛选</button><button type="button" className="ac-btn" disabled={loading} onClick={onRetry}>{error ? '重试日志' : '刷新日志'}</button></form>
    <p className="uo-scope-note" role="status">已应用：{type || '全部事件类型'} · 第 {page} 页 · 每页 {PAGE_SIZE} 条{draftType.trim() !== type ? '；输入已修改，尚未应用。' : '。'}{(loading || error) && logs ? ' 下方保留上次成功读取页，不代表新条件已读取成功。' : ''}</p>
    <ErrorBox msg={error} />{loading && <Loading text="读取安全日志…" />}
    {logs?.length > 0 && <><div className="ac-table-wrap ac-desktop-only"><table className="ac-table"><thead><tr>{['ID', '时间', '事件类型', '评分', 'IP', '敏感详情'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{logs.map(log => <tr key={log.id}><td>{log.id}</td><td>{fmtFull(log.created_at)}</td><td><code>{log.event_type}</code></td><td><Pill tone={scoreTone(log.score)}>{log.score}</Pill></td><td><code>{log.ip || '—'}</code></td><td><LogSensitiveDetails log={log} /></td></tr>)}</tbody></table></div><div className="ac-mobile-only uo-record-list">{logs.map(log => <article className="uo-record" key={log.id}><h3><code>{log.event_type}</code> <Pill tone={scoreTone(log.score)}>{log.score}</Pill></h3><dl><div><dt>ID</dt><dd>{log.id}</dd></div><div><dt>时间</dt><dd>{fmtFull(log.created_at)}</dd></div><div><dt>IP</dt><dd>{log.ip || '—'}</dd></div></dl><LogSensitiveDetails log={log} /></article>)}</div></>}
    {!loading && !error && logs?.length === 0 && <Empty text="没有匹配的日志" icon="fa-shield-halved" />}
    {logs && <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} total={total} onChange={next => { if (!loading) onPage(next); }} />}
  </Card>;
}

export default function AdminSecurity() {
  const [search, setSearch] = useSearchParams();
  const observationTab = search.get('tab') === 'user-observation';
  const initialUserId = search.get('user_id') || '';
  const { user, accounts, loading: authLoading } = useAuth();
  const token = accounts?.find(account => String(account.id) === String(user?.id))?.token || '';
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState('');
  const [logs, setLogs] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [draftType, setDraftType] = useState('');
  const [loading, setLoading] = useState(true);
  const [logsError, setLogsError] = useState('');
  const statsRead = useRef(0), logsRead = useRef(0);
  const loadStats = useCallback(async () => {
    const sequence = ++statsRead.current;
    setStatsLoading(true); setStatsError('');
    try { const result = await adminAPI.getSecurityStats(); if (sequence === statsRead.current) setStats(result); }
    catch (error) { if (sequence === statsRead.current) setStatsError(`安全统计加载失败：${error.message || '未知错误'}`); }
    finally { if (sequence === statsRead.current) setStatsLoading(false); }
  }, []);
  const loadLogs = useCallback(async (currentPage, eventType) => {
    const sequence = ++logsRead.current;
    setLoading(true); setLogsError('');
    try { const data = await adminAPI.getSecurityLogs(currentPage, PAGE_SIZE, eventType); if (sequence === logsRead.current) { setLogs(data.logs || []); setTotal(data.total || 0); } }
    catch (error) { if (sequence === logsRead.current) setLogsError(`日志加载失败：${error.message || '未知错误'}`); }
    finally { if (sequence === logsRead.current) setLoading(false); }
  }, []);
  useEffect(() => { if (!observationTab) loadStats(); return () => { statsRead.current += 1; }; }, [observationTab, loadStats]);
  useEffect(() => { if (!observationTab) loadLogs(page, type); return () => { logsRead.current += 1; }; }, [observationTab, page, type, loadLogs]);
  const apply = next => { if (page === 1 && type === next) loadLogs(1, next); else { setPage(1); setType(next); } };
  return <AdminLayout active="security">
    <div className="uo-tabs" role="tablist" aria-label="安全中心模块"><button type="button" className="ac-btn" role="tab" id="security-overview-tab" aria-controls="security-overview-panel" aria-selected={!observationTab} onClick={() => setSearch({})}>安全概览</button>{isSuperAdmin(user) && <button type="button" className="ac-btn" role="tab" id="user-observation-tab" aria-controls="user-observation-panel" aria-selected={observationTab} onClick={() => setSearch({ tab: 'user-observation' })}>定向用户观察</button>}</div>
    {observationTab ? <div id="user-observation-panel" role="tabpanel" aria-labelledby="user-observation-tab">{!authLoading && <UserObservation user={user} token={token} initialUserId={initialUserId} />}</div> : <div id="security-overview-panel" role="tabpanel" aria-labelledby="security-overview-tab" className="ac-page-stack security-ux">
      <SecurityOverview stats={stats} loading={statsLoading} error={statsError} onRetry={loadStats} />
      <SecurityLogs logs={logs} total={total} page={page} type={type} draftType={draftType} loading={loading} error={logsError} onDraftType={setDraftType} onApply={() => apply(draftType.trim())} onReset={() => { setDraftType(''); apply(''); }} onRetry={() => loadLogs(page, type)} onPage={setPage} />
      {!authLoading && isSuperAdmin(user) && <TestVerificationCodeCard key={adminSessionKey(user, token)} user={user} token={token} />}
    </div>}
  </AdminLayout>;
}
