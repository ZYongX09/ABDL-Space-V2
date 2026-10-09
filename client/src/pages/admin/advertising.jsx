import { useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import AdminLayout from './layout';
import { Card, Empty, ErrorBox, Loading, Pill } from './ui';
import { fmtNum } from './util';

export default function AdminAdvertising() {
  const [ads, setAds] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    try {
      const [list, summary] = await Promise.all([adminAPI.advertising(), adminAPI.advertisingStats()]);
      setAds(list?.ads || list?.data?.ads || []);
      setStats(summary?.stats || summary || {});
    } catch (loadError) { setError(loadError.message || '广告数据加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const action = async (id, type) => { try { await adminAPI.advertisingAction(id, type); await load(); } catch (actionError) { setError(actionError.message || '操作失败'); } };
  return <AdminLayout active="advertising">
    <div className="ac-page-stack">
      <ErrorBox msg={error} />
      <div className="ac-stat-grid">
        <Card title="投放总数" icon="fa-rectangle-ad"><strong>{fmtNum(stats?.impressions ?? stats?.ad_count ?? stats?.total_ads)}</strong></Card>
        <Card title="待审核" icon="fa-hourglass-half"><strong>{fmtNum(stats?.pending ?? stats?.pending_count)}</strong></Card>
        <Card title="点击总量" icon="fa-arrow-pointer"><strong>{fmtNum(stats?.clicks ?? stats?.total_clicks)}</strong></Card>
      </div>
      {loading ? <Loading text="正在加载广告投放…" /> : ads.length ? <Card title="广告投放" description="审核并管理商家广告内容。" icon="fa-bullhorn"><div className="ac-list">{ads.map(ad => <div className="ac-list-row" key={ad.id}><span className="ac-list-row-icon"><i className="fa-solid fa-rectangle-ad" aria-hidden="true" /></span><span className="ac-list-copy"><span className="ac-list-title">{ad.title || ad.content || '未命名广告'}</span><span className="ac-list-meta">商家：{ad.merchant_name || ad.merchant_id || '—'}</span></span><Pill tone={ad.status === 'active' || ad.enabled ? 'green' : ad.status === 'pending' ? 'amber' : 'slate'}>{ad.status || (ad.enabled ? '启用' : '停用')}</Pill><div className="ac-action-group">{ad.status === 'pending' && <button type="button" className="ac-btn primary" onClick={() => action(ad.id, 'approve')}>通过</button>}{(ad.status === 'active' || ad.enabled) && <button type="button" className="ac-btn" onClick={() => action(ad.id, 'disable')}>停用</button>}</div></div>)}</div></Card> : <Card title="广告投放"><Empty icon="fa-rectangle-ad" text="暂无广告投放" /></Card>}
    </div>
  </AdminLayout>;
}
