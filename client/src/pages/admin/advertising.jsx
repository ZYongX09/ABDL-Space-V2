import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Empty, ErrorBox, FormField, Loading, Pill, StatCard } from './ui';
import { fmtFull, fmtNum } from './util';

const POLICY_DEFAULT = { enabled: false, max_per_timeline: 1, min_interval_seconds: 8, ad_probability: 20, fallback_probability: 5 };

const POLICY_FIELDS = [
  { key: 'ad_probability', label: '商家广告投放概率', hint: '0-100 的整数。命中后从「投放中」的商家广告里取一条展示。' },
  { key: 'fallback_probability', label: '官方/系统广告兜底概率', hint: '0-100 的整数。官方与系统广告只走这条概率，商家广告未命中时才生效。' },
  { key: 'max_per_timeline', label: '每条时间线上限', hint: '0 或 1。当前投放固定只插 1 条，填 0 等同于关闭投放。' },
  { key: 'min_interval_seconds', label: '最小投放间隔（秒）', hint: '0-86400 的整数。该字段会被保存，但当前投放路径尚未读取它。' },
];

const STATUS_TONE = { active: 'green', paused: 'amber', draft: 'slate', archived: 'slate' };

function normalizePolicy(raw) {
  return {
    enabled: !!Number(raw?.enabled ?? 0),
    max_per_timeline: Number(raw?.max_per_timeline ?? POLICY_DEFAULT.max_per_timeline),
    min_interval_seconds: Number(raw?.min_interval_seconds ?? POLICY_DEFAULT.min_interval_seconds),
    ad_probability: Number(raw?.ad_probability ?? POLICY_DEFAULT.ad_probability),
    fallback_probability: Number(raw?.fallback_probability ?? POLICY_DEFAULT.fallback_probability),
  };
}

export default function AdminAdvertising() {
  const toast = useToast();
  const [ads, setAds] = useState([]);
  const [stats, setStats] = useState(null);
  const [policy, setPolicy] = useState(POLICY_DEFAULT);
  const [policyUpdatedAt, setPolicyUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [policySaving, setPolicySaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [list, summary, currentPolicy] = await Promise.all([
        adminAPI.advertising(),
        adminAPI.advertisingStats(),
        adminAPI.advertisingPolicy(),
      ]);
      setAds(list?.items || list?.ads || []);
      setStats(summary?.stats || summary || {});
      setPolicy(normalizePolicy(currentPolicy));
      setPolicyUpdatedAt(currentPolicy?.updated_at || null);
    } catch (loadError) { setError(loadError.message || '广告数据加载失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => {
    try { await adminAPI.advertisingAction(id, status === 'active' ? 'approve' : 'disable'); await load(); }
    catch (actionError) { setError(actionError.message || '操作失败'); }
  };

  const savePolicy = async () => {
    const next = {
      enabled: !!policy.enabled,
      max_per_timeline: Number(policy.max_per_timeline),
      min_interval_seconds: Number(policy.min_interval_seconds),
      ad_probability: Number(policy.ad_probability),
      fallback_probability: Number(policy.fallback_probability),
    };
    const inRange = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
    if (!inRange(next.max_per_timeline, 0, 1) || !inRange(next.min_interval_seconds, 0, 86400)
      || !inRange(next.ad_probability, 0, 100) || !inRange(next.fallback_probability, 0, 100)) {
      toast.error('请填写整数：上限 0-1，间隔 0-86400，概率 0-100');
      return;
    }
    setPolicySaving(true);
    try {
      const saved = await adminAPI.updateAdvertisingPolicy(next);
      setPolicy(normalizePolicy(saved));
      setPolicyUpdatedAt(saved?.updated_at || null);
      toast.success(next.enabled ? '投放策略已保存，全站广告已开启' : '投放策略已保存，全站广告已关闭');
    } catch (saveError) { toast.error(saveError.message || '策略保存失败'); }
    finally { setPolicySaving(false); }
  };

  return <AdminLayout active="advertising">
    <div className="ac-page-stack">
      <ErrorBox msg={error} />

      <div className="ac-stat-grid">
        <StatCard label="投放总数" value={fmtNum(stats?.impressions)} icon="fa-rectangle-ad" tone="blue" meta="累计曝光" />
        <StatCard label="点击总量" value={fmtNum(stats?.clicks)} icon="fa-arrow-pointer" tone="green" meta="链接点击 + 图片查看 + 广告跳转" />
        <StatCard label="广告条数" value={fmtNum(ads.length)} icon="fa-bullhorn" tone="amber" meta="含草稿与已归档" />
      </div>

      <Card
        title="投放策略"
        description="全站广告总开关与概率。关闭后所有信息流都不再插入广告，与单条广告状态无关。"
        icon="fa-sliders"
        action={(
          <button type="button" className="ac-btn primary" disabled={policySaving || loading} onClick={savePolicy}>
            {policySaving && <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />}
            {policySaving ? '保存中' : '保存策略'}
          </button>
        )}
      >
        {loading ? <Loading text="正在读取投放策略…" /> : (
          <div className="ac-form-grid">
            <label className="ac-check-row">
              <input type="checkbox" checked={policy.enabled} onChange={event => setPolicy(current => ({ ...current, enabled: event.target.checked }))} />
              <span>开启全站广告投放</span>
              <Pill tone={policy.enabled ? 'green' : 'slate'}>{policy.enabled ? '投放中' : '已关闭'}</Pill>
            </label>
            <div className="ac-form-grid ac-form-grid-2">
              {POLICY_FIELDS.map(field => (
                <FormField key={field.key} label={field.label} hint={field.hint} htmlFor={`advertising-policy-${field.key}`}>
                  <input
                    id={`advertising-policy-${field.key}`}
                    className="ac-input ac-input-full"
                    type="number"
                    min="0"
                    max={field.key === 'min_interval_seconds' ? 86400 : field.key === 'max_per_timeline' ? 1 : 100}
                    step="1"
                    value={policy[field.key]}
                    onChange={event => setPolicy(current => ({ ...current, [field.key]: event.target.value }))}
                  />
                </FormField>
              ))}
            </div>
            <p className="ac-section-note">
              赞助者不会看到任何广告；广告只插入默认信息流（带搜索词或筛选时不下发）。官方与系统广告仅走兜底概率，商家广告仅走投放概率。
              {policyUpdatedAt ? ` 上次保存：${fmtFull(policyUpdatedAt)}` : ''}
            </p>
          </div>
        )}
      </Card>

      {loading ? <Loading text="正在加载广告投放…" /> : ads.length ? (
        <Card title="广告投放" description="审核并管理商家广告内容。停用后该广告立即停止投放。" icon="fa-bullhorn">
          <div className="ac-list">
            {ads.map(ad => (
              <div className="ac-list-row" key={ad.id}>
                <span className="ac-list-row-icon"><i className="fa-solid fa-rectangle-ad" aria-hidden="true" /></span>
                <span className="ac-list-copy">
                  <span className="ac-list-title">{ad.title || ad.content || '未命名广告'}</span>
                  <span className="ac-list-meta">商家：{ad.merchant_name || ad.merchant_id || '—'} · {ad.ad_type === 'merchant' ? '商家广告' : ad.ad_type === 'system' ? '系统广告' : '官方广告'}</span>
                </span>
                <Pill tone={STATUS_TONE[ad.status] || 'slate'}>{ad.status || 'draft'}</Pill>
                <div className="ac-action-group">
                  {ad.status === 'active'
                    ? <button type="button" className="ac-btn" onClick={() => setStatus(ad.id, 'paused')}>停用</button>
                    : <button type="button" className="ac-btn primary" onClick={() => setStatus(ad.id, 'active')}>启用</button>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : <Card title="广告投放"><Empty icon="fa-rectangle-ad" text="暂无广告投放" /></Card>}
    </div>
  </AdminLayout>;
}
