import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { adminSessionKey } from './access.js';
import { Card, Empty, ErrorBox, FormField, Loading, Pill, StatCard } from './ui';
import { fmtFull, fmtNum, parseTs } from './util';
import './advertising-ux.css';

const POLICY_FIELDS = [
  { key: 'ad_probability', label: '商家广告投放概率（%）', max: 100, hint: '0–100 的整数。仅从已启用的商家广告中选取。' },
  { key: 'fallback_probability', label: '官方 / 系统广告兜底概率（%）', max: 100, hint: '0–100 的整数。商家广告未命中时才使用兜底概率。' },
  { key: 'max_per_timeline', label: '每条时间线上限', max: 1, hint: '仅限 0 或 1。上限为 0 时不插入广告，即使总开关已开启。' },
  { key: 'min_interval_seconds', label: '最小投放间隔（秒）', max: 86400, hint: '0–86400 的整数。会被保存，但当前投放路径尚未读取此字段。' },
];
const STATUS_LABEL = { active: '已启用', paused: '已停用', draft: '草稿', archived: '已归档' };
const STATUS_TONE = { active: 'green', paused: 'amber', draft: 'slate', archived: 'slate' };
const TYPE_LABEL = { merchant: '商家广告', official: '官方广告', system: '系统广告' };
const STATUS_FILTERS = [['all', '全部状态'], ['active', '已启用'], ['paused', '已停用'], ['draft', '草稿'], ['archived', '已归档'], ['unknown', '未知状态']];
const readAds = () => adminAPI.advertising();
const readStats = () => adminAPI.advertisingStats();
const readPolicy = () => adminAPI.advertisingPolicy();
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const validTime = value => typeof value === 'string' && value.trim() !== '' && Number.isFinite(parseTs(value)?.getTime());

function parsePolicy(raw) {
  if (!isRecord(raw) || ![true, false, 0, 1].includes(raw.enabled)
    || !POLICY_FIELDS.every(field => Number.isInteger(raw[field.key]) && raw[field.key] >= 0 && raw[field.key] <= field.max)
    || !validTime(raw.updated_at)) throw new Error('投放策略响应不完整或字段无效，不能作为已保存策略。');
  return { ...raw, enabled: raw.enabled === true || raw.enabled === 1 };
}

function policyErrors(draft) {
  if (!draft) return {};
  return Object.fromEntries(POLICY_FIELDS.flatMap(field => {
    const value = draft[field.key];
    const valid = (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))
      && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= field.max;
    return valid ? [] : [[field.key, `请输入 0–${field.max} 的整数，不能为空。`]];
  }));
}

function samePolicy(left, right) {
  return !!left && !!right && left.enabled === right.enabled
    && POLICY_FIELDS.every(field => String(left[field.key]) === String(right[field.key]));
}

function parseAdRecord(raw) {
  if (!isRecord(raw) || !Number.isSafeInteger(raw.id) || raw.id <= 0 || typeof raw.title !== 'string' || !raw.title.trim()
    || !Number.isSafeInteger(raw.merchant_id) || raw.merchant_id <= 0 || typeof raw.status !== 'string' || typeof raw.ad_type !== 'string') {
    throw new Error('广告记录响应不完整，请重新读取列表。');
  }
  return raw;
}

function parseAds(raw) {
  const rows = raw?.items ?? raw?.ads;
  if (!Array.isArray(rows)) throw new Error('广告列表响应缺少 items / ads 数组。');
  rows.forEach(parseAdRecord);
  if (new Set(rows.map(ad => ad.id)).size !== rows.length) throw new Error('广告列表包含重复 ID。');
  return rows;
}

function parseStats(raw) {
  // 专用统计接口兼容明确的 stats 包装；显式无效包装不能回退到顶层数据。
  const stats = isRecord(raw) && Object.hasOwn(raw, 'stats') ? raw.stats : raw;
  if (!isRecord(stats) || !isCount(stats.impressions) || !isCount(stats.clicks)) throw new Error('广告统计响应不完整，无法确认累计数据。');
  return { impressions: stats.impressions, clicks: stats.clicks };
}

function parseAdReceipt(raw, id, status) {
  const saved = parseAdRecord(raw);
  if (saved.id !== id || saved.status !== status || !Object.hasOwn(TYPE_LABEL, saved.ad_type) || !validTime(saved.updated_at)
    || !['impression_count', 'link_click_count', 'image_view_count', 'ad_navigation_count'].every(key => isCount(saved[key]))) {
    throw new Error('广告操作回执与目标不一致或不完整。');
  }
  return saved;
}

function knownRejection(error) {
  return Number.isInteger(error?.status) && error.status >= 400 && error.status < 500;
}

// 每个资源独立读取；失败保留旧快照，但不把它标记成当前有效数据。
function useAdvertisingResource(read, parse) {
  const [state, setState] = useState({ phase: 'loading', data: null, error: '' });
  const latest = useRef(state);
  const alive = useRef(false);
  const flight = useRef(false);
  const generation = useRef(0);
  const commit = useCallback(next => {
    latest.current = typeof next === 'function' ? next(latest.current) : next;
    setState(latest.current);
  }, []);
  const reload = useCallback(async () => {
    if (!alive.current || flight.current) return undefined;
    flight.current = true;
    const request = ++generation.current;
    commit(previous => ({ ...previous, phase: 'loading', error: '' }));
    try {
      const data = parse(await read());
      if (!alive.current || generation.current !== request) return undefined;
      commit({ phase: 'ready', data, error: '' });
      return data;
    } catch (error) {
      if (alive.current && generation.current === request) commit(previous => ({ ...previous, phase: 'error', error: error.message || '读取失败' }));
      return undefined;
    } finally {
      if (generation.current === request) flight.current = false;
    }
  }, [commit, parse, read]);
  useEffect(() => {
    alive.current = true;
    reload();
    return () => { alive.current = false; generation.current += 1; flight.current = false; };
  }, [reload]);
  const accept = useCallback(value => {
    if (!alive.current) return;
    generation.current += 1;
    flight.current = false;
    commit(previous => ({ phase: 'ready', data: typeof value === 'function' ? value(previous.data) : value, error: '' }));
  }, [commit]);
  const unconfirm = useCallback(error => {
    if (alive.current) commit(previous => ({ ...previous, phase: 'unknown', error }));
  }, [commit]);
  const isCurrent = useCallback(() => alive.current, []);
  const isReady = useCallback(() => alive.current && !flight.current && latest.current.phase === 'ready', []);
  const getSnapshot = useCallback(() => latest.current.data, []);
  return { ...state, reload, accept, unconfirm, isCurrent, isReady, getSnapshot };
}

function ResourceNotice({ resource, label, onRetry, disabled = false }) {
  if (resource.phase === 'loading') return <Loading text={resource.data === null ? `正在读取${label}…` : `正在重新读取${label}，下方为上次快照…`} />;
  if (resource.phase === 'ready') return null;
  return <div className="adux-resource">
    <ErrorBox msg={`${label}${resource.phase === 'unknown' ? '结果未确认' : '读取失败'}：${resource.error}`} />
    <p className="ac-section-note">{resource.data === null ? '尚无可信数据；不会将未知状态当作关闭、零值或空列表。' : '保留上次确认的快照，当前服务端状态尚未确认。'}</p>
    <button type="button" className="ac-btn" disabled={disabled} onClick={onRetry || resource.reload}>重新读取{label}</button>
  </div>;
}

function OperationFeedback({ feedback }) {
  if (!feedback?.message) return null;
  return <div className={`adux-feedback ${feedback.phase}`} role={feedback.phase === 'unknown' || feedback.phase === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback.message}</div>;
}

export function AdvertisingPolicyPanel({ resource, canManage }) {
  const toast = useToast();
  const [draft, setDraft] = useState(null);
  const baseline = useRef(null);
  const lock = useRef(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  useEffect(() => {
    if (resource.phase !== 'ready' || !resource.data) return;
    const previous = baseline.current;
    baseline.current = resource.data;
    setDraft(current => !current || samePolicy(current, previous) ? { ...resource.data } : current);
  }, [resource.data, resource.phase]);
  const errors = policyErrors(draft);
  const dirty = !!draft && !samePolicy(draft, resource.data);
  const editable = canManage && resource.phase === 'ready' && !!draft && !saving;
  const reload = async () => {
    if (!canManage || lock.current) return;
    const saved = await resource.reload();
    if (saved && resource.isCurrent()) setFeedback({ phase: 'read', message: '已重新读取服务端策略；未提交的草稿不会被覆盖，请核对后再保存。' });
  };
  const savePolicy = async event => {
    event?.preventDefault();
    if (!editable || !resource.isReady() || resource.getSnapshot() !== resource.data || lock.current || !dirty || Object.keys(errors).length) return;
    lock.current = true;
    setSaving(true);
    setFeedback({ phase: 'busy', message: '正在保存投放策略，请勿重复提交。' });
    const next = { enabled: draft.enabled, ...Object.fromEntries(POLICY_FIELDS.map(field => [field.key, Number(draft[field.key])])) };
    try {
      const saved = parsePolicy(await adminAPI.updateAdvertisingPolicy(next));
      if (!samePolicy(saved, next)) throw new Error('策略回执与本次提交不一致。');
      if (!resource.isCurrent()) return;
      resource.accept(saved);
      setDraft({ ...saved });
      const message = `投放策略已保存；服务端确认广告总开关为${saved.enabled ? '开启' : '关闭'}。`;
      setFeedback({ phase: 'success', message });
      toast.success(message);
    } catch (error) {
      if (!resource.isCurrent()) return;
      if (knownRejection(error)) {
        setFeedback({ phase: 'error', message: `策略保存被拒绝，草稿已保留：${error.message}` });
      } else {
        const message = `策略保存结果未确认，可能已生效；草稿已保留。请先重新读取策略，不要直接重试写入。${error.message || ''}`;
        resource.unconfirm(message);
        setFeedback({ phase: 'unknown', message });
      }
    } finally {
      lock.current = false;
      if (resource.isCurrent()) setSaving(false);
    }
  };
  return <Card title="投放策略" description="先读取服务端策略，再编辑草稿。单条广告的启停不会改变全站总开关。" icon="fa-sliders"
    action={<button type="button" className="ac-btn" disabled={saving || resource.phase === 'loading'} onClick={reload}>重新读取策略</button>}>
    <ResourceNotice resource={resource} label="投放策略" onRetry={reload} disabled={saving} />
    <div className="adux-policy-summary" aria-live="polite">
      <Pill tone={resource.phase === 'ready' && resource.data?.enabled ? 'green' : 'slate'}>
        {resource.data ? `${resource.phase === 'ready' ? '服务端已确认' : '上次确认'}：总开关${resource.data.enabled ? '开启' : '关闭'}` : '总开关状态未知'}
      </Pill>
      {resource.data && <span className="ac-section-note">确认快照更新时间：{fmtFull(resource.data.updated_at)}</span>}
      <span className="adux-draft-state" role="status">{saving ? '保存中' : !draft ? '等待有效读取' : dirty ? '有未保存草稿' : resource.phase === 'ready' ? '与服务端已保存策略一致' : '草稿保留，等待重新核实'}</span>
    </div>
    {draft && <form className="adux-policy-form" onSubmit={savePolicy} noValidate>
      <fieldset className="adux-fieldset" disabled={!editable}>
        <legend className="adux-sr-only">投放策略草稿</legend>
        <label className="adux-switch-row" htmlFor="advertising-policy-enabled">
          <span><strong>开启全站广告投放</strong><small>这是草稿开关，保存并收到完整回执后才会确认。</small></span>
          <input id="advertising-policy-enabled" type="checkbox" role="switch" checked={draft.enabled} onChange={event => { setDraft(current => ({ ...current, enabled: event.target.checked })); setFeedback(null); }} />
        </label>
        <div className="adux-policy-grid">
          {POLICY_FIELDS.map(field => <FormField key={field.key} label={field.label} htmlFor={`advertising-policy-${field.key}`}
            hint={<span id={`advertising-hint-${field.key}`}>{field.hint}</span>}
            error={errors[field.key] ? <span id={`advertising-error-${field.key}`}>{errors[field.key]}</span> : undefined}>
            <input id={`advertising-policy-${field.key}`} className="ac-input ac-input-full" type="number" min="0" max={field.max} step="1" inputMode="numeric"
              value={draft[field.key]} aria-invalid={!!errors[field.key]} aria-describedby={`advertising-hint-${field.key}${errors[field.key] ? ` advertising-error-${field.key}` : ''}`}
              onChange={event => { setDraft(current => ({ ...current, [field.key]: event.target.value })); setFeedback(null); }} />
          </FormField>)}
        </div>
      </fieldset>
      <div className="adux-save-bar">
        <div><strong>{dirty ? `草稿总开关：${draft.enabled ? '开启' : '关闭'}（未保存）` : '没有未保存更改'}</strong><span>读取失败或回执异常时，不会用默认值覆盖草稿。</span></div>
        <div className="adux-actions">
          <button type="button" className="ac-btn" disabled={!editable || !dirty} onClick={() => { if (!lock.current) { setDraft({ ...resource.data }); setFeedback(null); } }}>恢复已读取策略</button>
          <button type="submit" className="ac-btn primary" disabled={!editable || !dirty || Object.keys(errors).length > 0}>{saving ? '保存中…' : '保存策略'}</button>
        </div>
      </div>
    </form>}
    <OperationFeedback feedback={feedback} />
    <p className="ac-section-note adux-policy-note">赞助者不会看到任何广告；广告只插入默认信息流，带搜索词或筛选时不下发。商家广告走投放概率，官方与系统广告走兜底概率。总开关开启也不代表每条广告必定展示。</p>
  </Card>;
}

function AdStatus({ ad, unconfirmed }) {
  return <Pill tone={unconfirmed ? 'amber' : STATUS_TONE[ad.status] || 'slate'}>{unconfirmed ? `待核实（上次：${STATUS_LABEL[ad.status] || ad.status}）` : STATUS_LABEL[ad.status] || `未知状态：${ad.status}`}</Pill>;
}

export function AdvertisingAdsPanel({ resource, canManage }) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [operations, setOperations] = useState({});
  // 桌面表格与移动卡片共用此锁；同一事件周期的双击也只能提交一次。
  const locks = useRef(new Set());
  const uncertain = useRef(new Set());
  const rows = resource.data;
  const counts = rows ? Object.fromEntries(STATUS_FILTERS.map(([value]) => [value, rows.filter(ad => value === 'all' || (value === 'unknown' ? !Object.hasOwn(STATUS_LABEL, ad.status) : ad.status === value)).length])) : null;
  const search = query.trim().toLocaleLowerCase();
  const visible = rows?.filter(ad => (filter === 'all' || (filter === 'unknown' ? !Object.hasOwn(STATUS_LABEL, ad.status) : ad.status === filter))
    && (!search || `${ad.id} ${ad.title} ${ad.merchant_name || ''} ${ad.merchant_id}`.toLocaleLowerCase().includes(search)));
  const busy = Object.values(operations).some(operation => operation.phase === 'busy');
  const reload = async () => {
    if (!canManage || locks.current.size) return;
    const loaded = await resource.reload();
    if (loaded && resource.isCurrent()) { uncertain.current.clear(); setOperations({}); }
  };
  const setStatus = async ad => {
    const current = resource.getSnapshot()?.find(row => row.id === ad.id);
    if (!canManage || !resource.isReady() || !current || current.status !== ad.status || locks.current.has(ad.id) || uncertain.current.has(ad.id)
      || !Object.hasOwn(STATUS_LABEL, ad.status) || !Object.hasOwn(TYPE_LABEL, ad.ad_type)) return;
    locks.current.add(ad.id);
    const status = ad.status === 'active' ? 'paused' : 'active';
    const label = status === 'active' ? '启用' : '停用';
    setOperations(previous => ({ ...previous, [ad.id]: { phase: 'busy', message: `正在${label}广告 #${ad.id}…` } }));
    try {
      const saved = parseAdReceipt(await adminAPI.advertisingAction(ad.id, status === 'active' ? 'approve' : 'disable'), ad.id, status);
      if (!resource.isCurrent()) return;
      resource.accept(previous => previous.map(row => row.id === ad.id ? { ...row, ...saved } : row));
      setOperations(previous => ({ ...previous, [ad.id]: { phase: 'success', message: `广告 #${ad.id} 已${label}，服务端回执已确认。` } }));
    } catch (error) {
      if (!resource.isCurrent()) return;
      if (!knownRejection(error)) uncertain.current.add(ad.id);
      setOperations(previous => ({ ...previous, [ad.id]: knownRejection(error)
        ? { phase: 'error', message: `广告 #${ad.id} ${label}被拒绝：${error.message}` }
        : { phase: 'unknown', message: `广告 #${ad.id} ${label}结果未确认，可能已生效。请重新读取广告列表后再操作。${error.message || ''}` } }));
    } finally {
      locks.current.delete(ad.id);
    }
  };
  const actions = (ad, view) => {
    const operation = operations[ad.id];
    const label = ad.status === 'active' ? '停用' : '启用';
    const known = Object.hasOwn(STATUS_LABEL, ad.status) && Object.hasOwn(TYPE_LABEL, ad.ad_type);
    return <div className="adux-record-actions">
      <button type="button" className={`ac-btn ${ad.status === 'active' ? '' : 'primary'}`} data-ad-action={ad.id} data-view={view}
        aria-label={`${label}广告 #${ad.id}`} aria-busy={operation?.phase === 'busy'}
        disabled={!canManage || resource.phase !== 'ready' || !known || operation?.phase === 'busy' || operation?.phase === 'unknown'}
        onClick={() => setStatus(ad)}>{operation?.phase === 'busy' ? '处理中…' : operation?.phase === 'unknown' ? '请先重新读取' : known ? label : '状态或类型未知'}</button>
      <OperationFeedback feedback={operation} />
    </div>;
  };
  const adCopy = ad => <div className="adux-ad-copy"><strong>{ad.title}</strong><small>#{ad.id} · {TYPE_LABEL[ad.ad_type] || `未知类型：${ad.ad_type}`}</small>{ad.body && <p>{ad.body}</p>}{ad.landing_url && <span className="adux-url">落地地址：{ad.landing_url}</span>}</div>;
  return <Card title="广告投放" description="启用表示该广告可参与投放；实际展示仍受全站策略与投放时间限制。" icon="fa-bullhorn"
    action={<button type="button" className="ac-btn" disabled={busy || resource.phase === 'loading'} onClick={reload}>重新读取广告</button>}>
    <div className="adux-filters" role="group" aria-label="按广告状态筛选">
      {STATUS_FILTERS.map(([value, label]) => <button type="button" key={value} className={`adux-filter ${filter === value ? 'selected' : ''}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}<span>{counts ? counts[value] : '—'}</span></button>)}
    </div>
    <div className="adux-list-toolbar">
      <label className="adux-search" htmlFor="advertising-search"><span>搜索广告</span><input id="advertising-search" type="search" className="ac-input" placeholder="标题、商家或广告 ID" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <p className="ac-section-note" role="status">当前筛选：{STATUS_FILTERS.find(([value]) => value === filter)[1]}{search ? ` · 搜索「${query.trim()}」` : ''} · {visible ? `${visible.length} / ${rows.length} 条` : '数量未知'}</p>
    </div>
    <ResourceNotice resource={resource} label="广告列表" onRetry={reload} disabled={busy} />
    {rows !== null && visible.length === 0 && <div className="adux-empty"><Empty icon="fa-rectangle-ad" text={rows.length ? '没有符合当前筛选的广告' : resource.phase === 'ready' ? '服务端已确认：暂无广告投放' : '上次读取列表为空，当前数量未知'} />{(filter !== 'all' || search) && <button type="button" className="ac-btn" onClick={() => { setFilter('all'); setQuery(''); }}>清除筛选</button>}</div>}
    {!!visible?.length && <>
      <div className="ac-table-wrap ac-desktop-only"><table className="ac-table adux-ad-table"><thead><tr><th scope="col">广告内容</th><th scope="col">商家</th><th scope="col">状态</th><th scope="col">累计曝光</th><th scope="col">操作</th></tr></thead><tbody>
        {visible.map(ad => <tr key={ad.id}><td>{adCopy(ad)}</td><td><div className="adux-merchant">{ad.merchant_name || `商家 #${ad.merchant_id}`}<small>商家 ID：{ad.merchant_id}</small></div></td><td><AdStatus ad={ad} unconfirmed={resource.phase !== 'ready' || operations[ad.id]?.phase === 'unknown'} /></td><td>{isCount(ad.impression_count) ? fmtNum(ad.impression_count) : '—'}</td><td>{actions(ad, 'desktop')}</td></tr>)}
      </tbody></table></div>
      <div className="adux-records ac-mobile-only">{visible.map(ad => <article className="adux-record" key={ad.id} aria-label={`广告 #${ad.id}`}>
        <div className="adux-record-head">{adCopy(ad)}<AdStatus ad={ad} unconfirmed={resource.phase !== 'ready' || operations[ad.id]?.phase === 'unknown'} /></div>
        <dl className="adux-record-meta"><div><dt>商家</dt><dd>{ad.merchant_name || `商家 #${ad.merchant_id}`}</dd></div><div><dt>累计曝光</dt><dd>{isCount(ad.impression_count) ? fmtNum(ad.impression_count) : '—'}</dd></div></dl>
        {actions(ad, 'mobile')}
      </article>)}</div>
    </>}
    <p className="ac-section-note adux-list-note">最多读取最近 500 条广告；筛选与搜索只作用于已读取列表，不改变上方全量累计统计。</p>
  </Card>;
}

export function AdvertisingWorkspace({ canManage }) {
  const ads = useAdvertisingResource(readAds, parseAds);
  const stats = useAdvertisingResource(readStats, parseStats);
  const policy = useAdvertisingResource(readPolicy, parsePolicy);
  const snapshotNote = resource => resource.phase === 'ready' ? '' : resource.data === null ? '尚未确认' : '上次读取，当前未确认';
  return <div className="ac-page-stack adux-page">
    <div className="ac-stat-grid">
      <StatCard label="累计曝光" value={stats.data ? fmtNum(stats.data.impressions) : '—'} icon="fa-rectangle-ad" tone="blue" meta={snapshotNote(stats) || '全量广告累计曝光'} />
      <StatCard label="累计互动" value={stats.data ? fmtNum(stats.data.clicks) : '—'} icon="fa-arrow-pointer" tone="green" meta={snapshotNote(stats) || '链接点击 + 图片查看 + 广告跳转'} />
      <StatCard label="已读取广告" value={ads.data ? fmtNum(ads.data.length) : '—'} icon="fa-bullhorn" tone="amber" meta={snapshotNote(ads) || '含草稿与归档，最多 500 条'} />
    </div>
    <ResourceNotice resource={stats} label="广告统计" />
    <AdvertisingAdsPanel resource={ads} canManage={canManage} />
    <AdvertisingPolicyPanel resource={policy} canManage={canManage} />
  </div>;
}

export default function AdminAdvertising() {
  const { user, loading, accounts = [] } = useAuth();
  const canManage = !loading && user?.role === 'admin';
  const account = accounts.find(item => String(item.id) === String(user?.id));
  return <AdminLayout active="advertising">{canManage && <AdvertisingWorkspace key={adminSessionKey(user, account?.token || '')} canManage={canManage} />}</AdminLayout>;
}
