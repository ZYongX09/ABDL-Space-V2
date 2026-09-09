import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Pagination, Loading, Empty, Pill } from './ui';
import { fmtFull, fmtNum } from './util';

const PAGE_SIZE = 50;

const LEVEL_META = {
  critical: { label: '高危', color: '#DC2626' },
  warning: { label: '警告', color: '#F59E0B' },
  info: { label: '提示', color: '#3B82F6' },
  normal: { label: '正常', color: '#10B981' },
};

function scoreTone(s) {
  const n = Number(s) || 0;
  if (n < 20) return 'red';
  if (n < 40) return 'amber';
  if (n < 60) return 'blue';
  return 'green';
}

export default function AdminSecurity() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    try {
      const s = await adminAPI.getSecurityStats();
      setStats(s);
    } catch (e) {
      toast.error('安全统计加载失败: ' + (e.message || ''));
    }
  }, [toast]);

  const loadLogs = useCallback(async (p, t) => {
    setLoading(true);
    try {
      const d = await adminAPI.getSecurityLogs(p, PAGE_SIZE, t);
      setLogs(d.logs || []);
      setTotal(d.total || 0);
    } catch (e) {
      toast.error('日志加载失败: ' + (e.message || ''));
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadLogs(page, type); }, [page, type, loadLogs]);

  const hourLabels = (stats?.trend || []).map(t => {
    const d = new Date((t.hour || 0) * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:00`;
  });
  const hourCnt = (stats?.trend || []).map(t => t.cnt || 0);

  return (
    <AdminLayout active="security">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 概览卡 */}
        <div className="ac-stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          <div className="ac-stat">
            <span className="ac-stat-icon" style={{ background: 'rgba(220,38,38,.12)', color: '#DC2626' }}><i className="fa-solid fa-triangle-exclamation" /></span>
            <div className="ac-stat-num">{fmtNum(stats?.dayCount)}</div>
            <span className="ac-stat-label">24 小时内安全事件</span>
          </div>
          <div className="ac-stat">
            <span className="ac-stat-icon" style={{ background: 'rgba(245,158,11,.14)', color: '#D97706' }}><i className="fa-solid fa-clock-rotate-left" /></span>
            <div className="ac-stat-num">{fmtNum(stats?.weekCount)}</div>
            <span className="ac-stat-label">7 天内安全事件</span>
          </div>
          <div className="ac-stat">
            <span className="ac-stat-icon" style={{ background: 'rgba(59,130,246,.12)', color: '#2563EB' }}><i className="fa-solid fa-shield-halved" /></span>
            <div className="ac-stat-num">{fmtNum(stats?.typeStats?.length)}</div>
            <span className="ac-stat-label">事件类型数（7天）</span>
          </div>
          <div className="ac-stat">
            <span className="ac-stat-icon" style={{ background: 'rgba(16,185,129,.12)', color: '#059669' }}><i className="fa-solid fa-bolt" /></span>
            <div className="ac-stat-num">{fmtNum(stats?.trend?.length)}</div>
            <span className="ac-stat-label">24h 活跃小时数</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {/* 24h 趋势 */}
          <Card title="24 小时事件趋势" icon="fa-chart-column">
            {stats && (stats.trend || []).length ? (
              <Bars labels={hourLabels} values={hourCnt} height={140} />
            ) : <Empty text="近 24 小时暂无事件" icon="fa-chart-column" />}
          </Card>

          {/* 类型分布 */}
          <Card title="事件类型分布（7 天）" icon="fa-list">
            {(stats?.typeStats || []).length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.typeStats.map(t => (
                  <div key={t.event_type} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                    <code style={{ color: 'var(--text)', minWidth: 120 }}>{t.event_type}</code>
                    <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'var(--input-bg)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(t.cnt / (stats.typeStats?.[0]?.cnt || 1)) * 100}%`, borderRadius: 4, background: 'var(--primary)' }} />
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{t.cnt}</span>
                  </div>
                ))}
              </div>
            ) : <Empty text="7 天内暂无事件" />}
          </Card>

          {/* 等级分布 */}
          <Card title="风险等级分布（7 天）" icon="fa-gauge">
            {(stats?.scoreDistribution || []).length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.scoreDistribution.map(s => {
                  const meta = LEVEL_META[s.level] || { label: s.level, color: 'var(--text-muted)' };
                  return (
                    <div key={s.level} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                      <span style={{ minWidth: 40 }}>{meta.label}</span>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--input-bg)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${(s.cnt / (stats.scoreDistribution[0]?.cnt || 1)) * 100}%`, borderRadius: 4, background: meta.color }} />
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{s.cnt}</span>
                    </div>
                  );
                })}
              </div>
            ) : <Empty text="暂无数据" />}
          </Card>
        </div>

        {/* 日志 */}
        <Card
          title="安全日志"
          icon="fa-list-ul"
          action={<input className="ac-input" placeholder="按事件类型过滤" value={type} onChange={e => { setType(e.target.value); setPage(1); }} style={{ width: 180 }} />}
        >
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr>
                  <th style={{ width: 70 }}>ID</th>
                  <th>时间</th>
                  <th>事件类型</th>
                  <th>评分</th>
                  <th>IP</th>
                  <th>Session</th>
                  <th>UserAgent</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {(logs || []).map(l => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.id}</td>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtFull(l.created_at)}</td>
                    <td><code style={{ fontSize: 12, color: 'var(--primary-dark)' }}>{l.event_type}</code></td>
                    <td><Pill tone={scoreTone(l.score)}>{l.score}</Pill></td>
                    <td style={{ fontSize: 12.5, fontFamily: 'monospace' }}>{l.ip || '-'}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.session_id || '-'}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.user_agent || '-'}</td>
                    <td style={{ fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.details || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !logs?.length && <Empty text="没有匹配的日志" icon="fa-flag" />}
            {loading && !logs && <Loading />}
          </div>
          <div style={{ marginTop: 12 }}>
            <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} total={total} onChange={setPage} />
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}

/* 简单柱状图（无依赖） */
function Bars({ labels, values, height = 140, color = 'var(--primary)' }) {
  const max = Math.max(...values, 1);
  return (
    <svg viewBox={`0 0 320 ${height}`} style={{ width: '100%', display: 'block' }}>
      {values.map((v, i) => {
        const x = (i / values.length) * 320 + 1.5;
        const w = Math.max(320 / values.length - 3, 2);
        const barH = Math.max((v / max) * (height - 22), v > 0 ? 2 : 0);
        return (
          <g key={i}>
            <rect x={x} y={height - 8 - barH} width={w} height={barH} rx={2} fill={color} opacity={v > 0 ? 1 : 0.08} />
            <text x={x + w / 2} y={height - 8 - barH - 3} fontSize={8} fill="var(--text-muted)" textAnchor="middle">{v > 0 ? v : ''}</text>
          </g>
        );
      })}
      {labels.length <= 12 && labels.map((lb, i) => (
        <text key={lb + i} x={i * (320 / labels.length) + 320 / labels.length / 2} y={height - 1} fontSize={8} fill="var(--text-muted)" textAnchor="middle">{lb}</text>
      ))}
    </svg>
  );
}