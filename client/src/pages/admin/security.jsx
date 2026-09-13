import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Empty, Loading, Pagination, Pill, StatCard } from './ui';
import { HBars, MiniBars } from './charts';
import { fmtFull, fmtNum } from './util';

const PAGE_SIZE = 50;
const LEVEL_META = {
  critical: { label: '高危', color: '#c83535' },
  warning: { label: '警告', color: '#a76100' },
  info: { label: '提示', color: '#245f97' },
  normal: { label: '正常', color: '#147a55' },
};

function scoreTone(score) {
  const value = Number(score) || 0;
  if (value < 20) return 'red';
  if (value < 40) return 'amber';
  if (value < 60) return 'blue';
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
      setStats(await adminAPI.getSecurityStats());
    } catch (error) {
      toast.error(`安全统计加载失败：${error.message || '未知错误'}`);
    }
  }, [toast]);

  const loadLogs = useCallback(async (currentPage, eventType) => {
    setLoading(true);
    try {
      const data = await adminAPI.getSecurityLogs(currentPage, PAGE_SIZE, eventType);
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (error) {
      toast.error(`日志加载失败：${error.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadLogs(page, type); }, [page, type, loadLogs]);

  const trendData = (stats?.trend || []).map(item => {
    const date = new Date((item.hour || 0) * 1000);
    return {
      date: `${String(date.getHours()).padStart(2, '0')}:00`,
      count: item.cnt || 0,
    };
  });
  const typeMax = stats?.typeStats?.[0]?.cnt || 1;
  const levelMax = stats?.scoreDistribution?.[0]?.cnt || 1;

  return (
    <AdminLayout active="security">
      <div className="ac-page-stack">
        <div className="ac-stat-grid">
          <StatCard label="24 小时安全事件" value={fmtNum(stats?.dayCount)} icon="fa-triangle-exclamation" tone="red" meta="近期风险活动" />
          <StatCard label="7 天安全事件" value={fmtNum(stats?.weekCount)} icon="fa-clock-rotate-left" tone="amber" meta="短期风险趋势" />
          <StatCard label="事件类型" value={fmtNum(stats?.typeStats?.length)} icon="fa-shield-halved" tone="blue" meta="近 7 天出现" />
          <StatCard label="活跃小时" value={fmtNum(stats?.trend?.length)} icon="fa-bolt" tone="green" meta="近 24 小时" />
        </div>

        <div className="ac-grid-3">
          <Card title="24 小时事件趋势" description="按小时统计安全事件数量。" icon="fa-chart-column">
            {trendData.length ? <MiniBars data={trendData} color="#245f97" showLabels ariaLabel="近 24 小时安全事件趋势" /> : <Empty text="近 24 小时暂无事件" icon="fa-chart-column" />}
          </Card>
          <Card title="事件类型分布" description="近 7 天出现频率最高的事件类型。" icon="fa-list">
            {(stats?.typeStats || []).length ? (
              <HBars items={stats.typeStats.map(item => ({ label: item.event_type, value: item.cnt }))} max={typeMax} />
            ) : <Empty text="7 天内暂无事件" icon="fa-list" />}
          </Card>
          <Card title="风险等级分布" description="按风险等级汇总近 7 天安全事件。" icon="fa-gauge">
            {(stats?.scoreDistribution || []).length ? (
              <HBars
                items={stats.scoreDistribution.map(item => ({
                  label: LEVEL_META[item.level]?.label || item.level,
                  value: item.cnt,
                  color: LEVEL_META[item.level]?.color || '#66758a',
                }))}
                max={levelMax}
              />
            ) : <Empty text="暂无等级数据" icon="fa-gauge" />}
          </Card>
        </div>

        <Card
          title="安全日志"
          description="按事件类型筛选并核对 IP、会话和请求详情。"
          icon="fa-list-ul"
          action={(
            <div className="ac-search">
              <i className="fa-solid fa-magnifying-glass fa-icon" aria-hidden="true" />
              <input className="ac-input" aria-label="按安全事件类型筛选" placeholder="输入事件类型" value={type} onChange={event => { setType(event.target.value); setPage(1); }} />
            </div>
          )}
          pad={false}
        >
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead><tr><th scope="col">ID</th><th scope="col">时间</th><th scope="col">事件类型</th><th scope="col">评分</th><th scope="col">IP</th><th scope="col">Session</th><th scope="col">User Agent</th><th scope="col">详情</th></tr></thead>
              <tbody>
                {(logs || []).map(log => (
                  <tr key={log.id}>
                    <td className="ac-cell-muted">{log.id}</td>
                    <td className="ac-cell-muted">{fmtFull(log.created_at)}</td>
                    <td><code>{log.event_type}</code></td>
                    <td><Pill tone={scoreTone(log.score)}>{log.score}</Pill></td>
                    <td><code>{log.ip || '-'}</code></td>
                    <td><div className="ac-cell-truncate" title={log.session_id || '-'}>{log.session_id || '-'}</div></td>
                    <td><div className="ac-cell-truncate" title={log.user_agent || '-'}>{log.user_agent || '-'}</div></td>
                    <td><div className="ac-cell-truncate" title={log.details || '-'}>{log.details || '-'}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !logs?.length && <Empty text="没有匹配的日志" icon="fa-shield-halved" />}
            {loading && !logs && <Loading />}
          </div>
          <div className="ac-card-foot">
            <Pagination page={page} totalPages={Math.ceil(total / PAGE_SIZE)} total={total} onChange={setPage} />
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}
