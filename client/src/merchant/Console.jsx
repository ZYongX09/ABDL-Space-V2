import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Link, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ConfirmProvider, useConfirm } from '../pages/admin/ui.jsx';
import MerchantLayout from './Layout.jsx';
import { AD_STATUSES, COUNTERS, EMPTY_AD, accessState, adForm, adPayload, auditDetail, defaultDateRange, formatNumber, identityPayload, profilePayload, safeMediaURL, safeURL, statsCSV, validateDateRange } from './model.js';

const MerchantContext = createContext(null);
const useMerchant = () => useContext(MerchantContext);
function useResource(load) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ loading: true, data: null, error: '' });
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    setState({ loading: true, data: null, error: '' });
    Promise.resolve().then(() => load(controller.signal)).then(data => { if (current) setState({ loading: false, data, error: '' }); }).catch(error => { if (current && error.name !== 'AbortError') setState({ loading: false, data: null, error: error.message || '数据加载失败。' }); });
    return () => { current = false; controller.abort(); };
  }, [load, revision]);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  return { ...state, reload };
}
function useOperation() {
  const [state, setState] = useState({ busy: false, error: '', message: '' });
  const live = useRef(true); const pending = useRef(false);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const run = async (task, success, message = '操作成功，已重新读取数据。') => {
    if (!live.current || pending.current) return;
    pending.current = true; setState({ busy: true, error: '', message: '' });
    try { const result = await task(); if (live.current) { await success?.(result); if (live.current) setState({ busy: false, error: '', message }); } }
    catch (error) { if (live.current && error.name !== 'AbortError') setState({ busy: false, error: error.message || '操作失败。', message: '' }); }
    finally { pending.current = false; if (live.current) setState(value => ({ ...value, busy: false })); }
  };
  return { ...state, run };
}
function Notice({ error, message, retry }) {
  if (!error && !message) return null;
  return <div className={`mc-notice ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}><span>{error || message}</span>{retry && <button type="button" className="ac-btn" onClick={retry}>重新读取</button>}</div>;
}
function ResourceState({ resource, children }) {
  if (resource.loading) return <div className="mc-loading" role="status">正在读取数据…</div>;
  if (resource.error) return <Notice error={resource.error} retry={resource.reload} />;
  return children;
}
function Heading({ title, description, children }) {
  return <div className="ac-page-heading"><div><div className="ac-page-eyebrow">MERCHANT CONSOLE</div><h1>{title}</h1><p>{description}</p></div><div className="ac-page-actions">{children}</div></div>;
}
function Card({ title, note, children, actions, className = '' }) {
  return <section className={`ac-card ${className}`}>{title && <div className="ac-card-head"><div><h2 className="mc-card-title">{title}</h2>{note && <p className="mc-muted">{note}</p>}</div>{actions}</div>}<div className="ac-card-body">{children}</div></section>;
}
function Field({ label, hint, children }) {
  const id = useId();
  return <div className="mc-field"><label className="ac-field-label" htmlFor={id}>{label}</label>{typeof children === 'function' ? children(id) : children}{hint && <small className="ac-field-hint">{hint}</small>}</div>;
}
function TextField({ label, hint, value, onChange, textarea = false, ...props }) {
  const Tag = textarea ? 'textarea' : 'input';
  return <Field label={label} hint={hint}>{id => <Tag id={id} className={textarea ? 'ac-textarea' : 'ac-input'} value={value ?? ''} onChange={onChange} {...props} />}</Field>;
}
function UploadField({ label, value, onChange, api, disabled = false, onBusy }) {
  const [uploading, setUploading] = useState(false); const [error, setError] = useState('');
  const live = useRef(true); const controller = useRef(null); const onBusyRef = useRef(onBusy); onBusyRef.current = onBusy;
  useEffect(() => { live.current = true; return () => { live.current = false; controller.current?.abort(); onBusyRef.current?.(false); }; }, []);
  const choose = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    controller.current?.abort(); controller.current = new AbortController();
    setUploading(true); onBusyRef.current?.(true); setError('');
    try { const url = await api.upload(file, { signal: controller.current.signal }); if (live.current) onChange(url); }
    catch (failure) { if (live.current && failure.name !== 'AbortError') setError(failure.message); }
    finally { if (live.current) { setUploading(false); onBusyRef.current?.(false); } }
  };
  return <div className="mc-upload"><TextField label={`${label} HTTPS 地址`} type="url" value={value} disabled={disabled || uploading} onChange={event => { setError(''); onChange(event.target.value); }} hint="可粘贴 HTTPS 地址，或选择 JPG / PNG / GIF / WebP（不超过 10MB）。" /><Field label={`上传${label}`}>{id => <input id={id} className="mc-file" type="file" accept="image/jpeg,image/png,image/gif,image/webp" disabled={disabled || uploading} onChange={choose} />}</Field>{uploading && <p role="status" className="mc-muted">正在上传…</p>}{error && <Notice error={error} />}</div>;
}
function Badge({ status }) { return <span className={`mc-badge ${status}`}>{AD_STATUSES[status] || ({ suspended: '已暂停', active: '正常' })[status] || status}</span>; }
function Empty({ children }) { return <div className="ac-empty">{children}</div>; }
function Pagination({ pagination, onChange, disabled = false }) {
  const { page, total, totalPages } = pagination;
  return <div className="mc-pagination"><span className="mc-muted">共 {formatNumber(total)} 条 · 第 {page} / {Math.max(totalPages, 1)} 页</span><div className="ac-action-group"><button className="ac-btn" type="button" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}>上一页</button><Field label="跳转页码">{id => <select id={id} className="ac-select" value={page} disabled={disabled || totalPages < 2} onChange={event => onChange(Number(event.target.value))}>{Array.from({ length: Math.max(totalPages, page, 1) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select>}</Field><button className="ac-btn" type="button" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}>下一页</button></div></div>;
}
function usePageFilters() {
  const [search, setSearch] = useSearchParams();
  const page = Math.max(1, Number.parseInt(search.get('page') || '1', 10) || 1);
  const update = patch => setSearch(previous => { const next = new URLSearchParams(previous); for (const [key, value] of Object.entries(patch)) value === '' || value == null ? next.delete(key) : next.set(key, String(value)); return next; });
  return { search, page, update };
}
function KPIs({ stats, extra = true }) {
  const columns = extra ? [['ad_count', '广告总数'], ['active_ads', '投放中'], ...COUNTERS] : COUNTERS;
  return <div className="mc-kpis">{columns.map(([key, label]) => <div className="ac-card mc-kpi" key={key}><span>{label}</span><strong>{formatNumber(stats[key])}</strong></div>)}</div>;
}
function dateTime(value) { return value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—'; }
function AdTable({ items, actions }) {
  if (!items.length) return <Empty>没有匹配的广告。</Empty>;
  return <div className="ac-table-wrap"><table className="ac-table mc-ads-table"><thead><tr><th scope="col">广告内容</th><th scope="col">企业 / 类型</th><th scope="col">状态 / 排期</th><th scope="col">曝光</th><th scope="col">点击</th><th scope="col">操作</th></tr></thead><tbody>{items.map(ad => <tr key={ad.id}><td><div className="mc-ad-cell">{safeMediaURL(ad.image_url) && <img className="mc-thumb" src={safeMediaURL(ad.image_url)} alt="" loading="lazy" />}<div className="ac-grow"><Link className="mc-title-link" to={`/merchant/ads/${encodeURIComponent(ad.id)}/edit`}>{ad.title || `广告 #${ad.id}`}</Link><p className="mc-clamp">{ad.body || '图片广告'}</p><small className="mc-muted">ID {ad.id}</small></div></div></td><td><span>{ad.merchant_name || '—'}</span><small className="mc-block mc-muted">{ad.ad_type === 'official' ? '官方广告' : '商家广告'}</small></td><td><Badge status={ad.status} /><small className="mc-block mc-muted">开始 {dateTime(ad.starts_at)}</small><small className="mc-block mc-muted">结束 {dateTime(ad.ends_at)}</small></td><td>{formatNumber(ad.impressions)}</td><td>{formatNumber(ad.clicks)}</td><td><div className="mc-row-actions">{actions ? actions(ad) : <Link className="ac-btn" to={`/merchant/ads/${encodeURIComponent(ad.id)}/edit`}>查看 / 编辑</Link>}</div></td></tr>)}</tbody></table></div>;
}
function Overview() {
  const { api, info } = useMerchant();
  const [range] = useState(defaultDateRange);
  const load = useCallback(signal => Promise.all([api.stats(range, { signal }), api.ads({ page: 1, limit: 5 }, { signal })]), [api, range]);
  const resource = useResource(load);
  return <><Heading title="运营概览" description={`${info.is_super_admin ? '全平台' : '当前企业'}运营数据 · ${range.from} 至 ${range.to}（UTC）`}><Link className="ac-btn primary" to="/merchant/ads/new">新建广告</Link><button className="ac-btn" disabled={resource.loading} onClick={resource.reload}>刷新数据</button></Heading><ResourceState resource={resource}>{resource.data && <><KPIs stats={resource.data[0]} /><Card title="近期广告" note="展示服务器返回的最近 5 条广告。" actions={<Link className="ac-btn" to="/merchant/ads">全部广告</Link>}><AdTable items={resource.data[1].items} /></Card></>}</ResourceState></>;
}
function Ads() {
  const { api, info } = useMerchant(); const confirm = useConfirm();
  const { search, page, update } = usePageFilters();
  const q = search.get('q') || ''; const status = search.get('status') || ''; const merchantId = info.permissions.can_manage_all ? search.get('merchant_id') || '' : '';
  const [query, setQuery] = useState(q); const [merchant, setMerchant] = useState(merchantId);
  useEffect(() => { setQuery(q); setMerchant(merchantId); }, [q, merchantId]);
  const load = useCallback(signal => api.ads({ page, limit: 10, q, status, ...(merchantId ? { merchant_id: merchantId } : {}) }, { signal }), [api, page, q, status, merchantId]);
  const resource = useResource(load); const operation = useOperation();
  const change = async (ad, action) => {
    const labels = { archive: '归档', pause: '暂停投放', activate: '启用投放', clone: '复制为草稿' };
    if (!(await confirm({ title: `${labels[action]}广告`, message: `确认${labels[action]}「${ad.title || `广告 #${ad.id}`}」？${action === 'archive' ? '归档后不再参与投放。' : ''}`, danger: action === 'archive', okText: labels[action] }))) return;
    operation.run(() => action === 'archive' ? api.archiveAd(ad.id) : action === 'clone' ? api.cloneAd(ad.id) : api.updateAd(ad.id, { status: action === 'pause' ? 'paused' : 'active' }), resource.reload);
  };
  return <><Heading title="广告管理" description="按关键词、状态筛选广告；发布状态与排期共同决定实际投放。"><Link className="ac-btn primary" to="/merchant/ads/new">新建广告</Link></Heading><Card><form className="mc-filters" onSubmit={event => { event.preventDefault(); update({ q: query.trim(), merchant_id: merchant.trim(), page: 1 }); }}><TextField label="搜索广告" value={query} onChange={event => setQuery(event.target.value)} maxLength={120} /><Field label="广告状态">{id => <select id={id} className="ac-select" value={status} onChange={event => update({ status: event.target.value, page: 1 })}><option value="">全部状态</option>{Object.entries(AD_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}</Field>{info.permissions.can_manage_all && <TextField label="企业 ID" value={merchant} inputMode="numeric" onChange={event => setMerchant(event.target.value)} />}<button className="ac-btn primary" type="submit">筛选</button><button className="ac-btn" type="button" disabled={resource.loading || operation.busy} onClick={resource.reload}>刷新</button></form></Card><Notice {...operation} retry={operation.error ? resource.reload : undefined} /><ResourceState resource={resource}>{resource.data && <Card><AdTable items={resource.data.items} actions={ad => <><Link className="ac-btn" to={`/merchant/ads/${encodeURIComponent(ad.id)}/edit`}>编辑</Link>{ad.status !== 'archived' && <button className="ac-btn" disabled={operation.busy} onClick={() => change(ad, ad.status === 'active' ? 'pause' : 'activate')}>{ad.status === 'active' ? '暂停' : '启用'}</button>}<button className="ac-btn" disabled={operation.busy} onClick={() => change(ad, 'clone')}>复制草稿</button>{ad.status !== 'archived' && <button className="ac-btn danger" disabled={operation.busy} onClick={() => change(ad, 'archive')}>归档</button>}</>} /><Pagination pagination={resource.data.pagination} disabled={operation.busy} onChange={next => update({ page: next })} /></Card>}</ResourceState></>;
}
function Preview({ form, profile, override = false }) {
  const name = override ? form.advertiser_name || profile?.display_name : profile?.display_name;
  const avatar = override ? form.advertiser_avatar_url || profile?.avatar_url : profile?.avatar_url;
  const image = safeMediaURL(form.image_url); const landing = safeURL(form.landing_url);
  return <Card title="图文预览" note="仅预览当前输入；保存后以服务端校验的展示身份为准。" className="mc-preview"><div className="mc-preview-identity"><span className="mc-avatar">{safeMediaURL(avatar) ? <img src={safeMediaURL(avatar)} alt="企业头像" /> : <span aria-hidden="true">企</span>}</span><div><strong>{name || '未设置展示名称'}</strong><small className="mc-block mc-muted">{override ? '官方广告' : '商家广告'}</small></div></div>{form.title && <h3>{form.title}</h3>}{form.body && <p className="mc-preview-body">{form.body}</p>}{image && <img className="mc-preview-image" src={image} alt="广告素材预览" />}{landing && <span className="mc-preview-link">落地页 · {landing}</span>}<div className="mc-preview-schedule"><Badge status={form.status} /><small>排期使用本地输入时间，提交时转换为 UTC。</small></div></Card>;
}
function EditorForm({ source, id }) {
  const { api, info } = useMerchant(); const navigate = useNavigate(); const operation = useOperation();
  const [form, setForm] = useState(() => adForm(source)); const [imageBusy, setImageBusy] = useState(false); const [avatarBusy, setAvatarBusy] = useState(false);
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const profile = info.profile || info.merchant; const override = info.is_super_admin && info.permissions.can_override_advertiser;
  if (source?.status === 'archived') return <Card title="此广告已归档"><p className="mc-muted">归档广告不可编辑；请从广告列表复制为草稿后再修改。</p><Link className="ac-btn" to="/merchant/ads">返回广告列表</Link></Card>;
  const save = event => { event.preventDefault(); operation.run(() => { const payload = adPayload(form, override); return id ? api.updateAd(id, payload) : api.createAd(payload); }, () => navigate('/merchant/ads')); };
  return <><Heading title={id ? '编辑广告' : '新建广告'} description="编辑内容、展示身份与排期；右侧实时预览。"><Link className="ac-btn" to="/merchant/ads">返回广告列表</Link></Heading><Notice {...operation} /><div className="mc-editor-grid"><form className="ac-page-stack" onSubmit={save}><Card title="广告内容"><div className="ac-form-grid"><TextField label="广告标题" value={form.title} maxLength={120} onChange={event => change('title', event.target.value)} hint="可选，最多 120 字。" /><TextField label="广告正文" textarea rows={7} maxLength={5000} value={form.body} onChange={event => change('body', event.target.value)} hint="正文和图片至少填写一项，最多 5000 字。" /><TextField label="落地页地址" type="url" value={form.landing_url} onChange={event => change('landing_url', event.target.value)} hint="可选，HTTP / HTTPS 地址。" /><UploadField label="广告图片" api={api} value={form.image_url} onChange={value => change('image_url', value)} onBusy={setImageBusy} disabled={operation.busy} /></div></Card><Card title="展示身份" note={override ? '每条官方广告可单独设置企业名称和头像；留空时由服务端决定回退身份。' : '企业名称和头像在注册时锁定，广告只能使用企业固定身份。'}>{override ? <div className="ac-form-grid"><TextField label="广告企业名称" maxLength={120} value={form.advertiser_name} onChange={event => change('advertiser_name', event.target.value)} /><UploadField label="企业头像" api={api} value={form.advertiser_avatar_url} onChange={value => change('advertiser_avatar_url', value)} onBusy={setAvatarBusy} disabled={operation.busy} /></div> : <div className="ac-form-grid ac-form-grid-2"><TextField label="企业名称（只读）" value={profile?.display_name} readOnly /><TextField label="企业头像地址（只读）" value={profile?.avatar_url} readOnly /></div>}</Card><Card title="投放排期" note="未设置开始或结束时间时不限制对应边界；启用广告仍受排期限制。"><div className="ac-form-grid"><Field label="保存状态">{fieldId => <select id={fieldId} className="ac-select" value={form.status} onChange={event => change('status', event.target.value)}><option value="draft">草稿</option><option value="active">启用投放</option><option value="paused">暂停</option></select>}</Field><div className="ac-form-grid ac-form-grid-2"><TextField label="开始时间（本地时间）" type="datetime-local" value={form.starts_at} onChange={event => change('starts_at', event.target.value)} /><TextField label="结束时间（本地时间）" type="datetime-local" value={form.ends_at} onChange={event => change('ends_at', event.target.value)} /></div><div className="ac-action-group"><button className="ac-btn primary" type="submit" disabled={operation.busy || imageBusy || avatarBusy}>{operation.busy ? '保存中…' : '保存广告'}</button><Link className="ac-btn" to="/merchant/ads">取消</Link></div></div></Card></form><Preview form={form} profile={profile} override={override} /></div></>;
}
function EditAd() {
  const { api } = useMerchant(); const { id } = useParams();
  const load = useCallback(signal => api.ad(id, { signal }), [api, id]); const resource = useResource(load);
  return <ResourceState resource={resource}>{resource.data && <EditorForm key={id} id={id} source={resource.data} />}</ResourceState>;
}
function Company() {
  const { api, info, refreshInfo } = useMerchant();
  const load = useCallback(signal => api.profile({ signal }), [api]); const resource = useResource(load);
  return <><Heading title="企业资料" description="维护联系信息；普通商家的企业名称和头像注册后不可修改。" /><ResourceState resource={resource}>{resource.data && resource.data.profile !== null ? <CompanyForm profile={resource.data} api={api} info={info} onSaved={() => { resource.reload(); refreshInfo(); }} /> : !resource.loading && !resource.error && <Card title="当前账户没有企业资料"><p className="mc-muted">超级管理员可以直接运营全平台广告，在广告编辑页单独设置展示身份，无需激活商家。</p><Link className="ac-btn primary" to="/merchant/ads">进入广告管理</Link></Card>}</ResourceState></>;
}
function CompanyForm({ profile, api, info, onSaved }) {
  const [form, setForm] = useState(() => ({ ...profile })); const operation = useOperation(); const [uploading, setUploading] = useState(false);
  const canEdit = info.is_super_admin && info.permissions.can_edit_identity;
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  return <form className="mc-company-grid" onSubmit={event => { event.preventDefault(); operation.run(() => api.updateProfile(profilePayload(form, canEdit)), onSaved, '企业资料已保存。'); }}><Card title="企业身份" note={canEdit ? '超级管理员可修改当前企业身份。' : '企业身份已锁定，与广告展示身份一致。'}><div className="ac-form-grid"><span className="mc-avatar mc-avatar-large">{safeMediaURL(form.avatar_url) ? <img src={safeMediaURL(form.avatar_url)} alt="企业头像" /> : <span>企</span>}</span><TextField label={canEdit ? '企业名称' : '企业名称（只读）'} value={form.display_name} readOnly={!canEdit} maxLength={120} onChange={event => change('display_name', event.target.value)} />{canEdit ? <UploadField label="企业头像" value={form.avatar_url} api={api} onChange={value => change('avatar_url', value)} onBusy={setUploading} /> : <TextField label="企业头像地址（只读）" value={form.avatar_url} readOnly />}<p className="mc-muted">企业 ID · {profile.id ?? '—'}</p></div></Card><Card title="联系资料"><div className="ac-form-grid"><Notice {...operation} /><div className="ac-form-grid ac-form-grid-2"><TextField label="联系人" value={form.contact_name} maxLength={120} onChange={event => change('contact_name', event.target.value)} /><TextField label="联系邮箱" type="email" value={form.contact_email} maxLength={254} onChange={event => change('contact_email', event.target.value)} /></div><TextField label="企业网站" type="url" value={form.website_url} onChange={event => change('website_url', event.target.value)} /><TextField label="企业简介" textarea rows={7} maxLength={5000} value={form.description} onChange={event => change('description', event.target.value)} /><button className="ac-btn primary mc-fit" disabled={operation.busy || uploading}>{operation.busy ? '保存中…' : '保存联系资料'}</button></div></Card></form>;
}
function Reports() {
  const { api, info } = useMerchant(); const [search, setSearch] = useSearchParams();
  const [defaults] = useState(defaultDateRange);
  const from = search.get('from') || defaults.from; const to = search.get('to') || defaults.to; const adId = search.get('ad_id') || ''; const merchantId = info.permissions.can_manage_all ? search.get('merchant_id') || '' : '';
  const [filter, setFilter] = useState({ from, to, ad_id: adId, merchant_id: merchantId }); const [filterError, setFilterError] = useState('');
  useEffect(() => { setFilter({ from, to, ad_id: adId, merchant_id: merchantId }); }, [from, to, adId, merchantId]);
  const load = useCallback(signal => { validateDateRange(from, to); return api.stats({ from, to, ...(adId ? { ad_id: adId } : {}), ...(merchantId ? { merchant_id: merchantId } : {}) }, { signal }); }, [api, from, to, adId, merchantId]);
  const resource = useResource(load);
  const change = (key, value) => setFilter(current => ({ ...current, [key]: value }));
  const apply = event => { event.preventDefault(); try { validateDateRange(filter.from, filter.to); setFilterError(''); setSearch(Object.fromEntries(Object.entries(filter).filter(([, value]) => value))); } catch (error) { setFilterError(error.message); } };
  const download = () => { if (!resource.data) return; const blob = new Blob([statsCSV(resource.data.daily)], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `merchant-report-${from}-${to}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  return <><Heading title="效果报表" description="UTC 日期范围，包含起止当天；单次最多 93 天。"><button className="ac-btn" disabled={!resource.data || resource.loading} onClick={download}>导出每日 CSV</button></Heading><Card><form className="mc-filters" onSubmit={apply}><TextField label="开始日期（UTC）" type="date" value={filter.from} required onChange={event => change('from', event.target.value)} /><TextField label="结束日期（UTC）" type="date" value={filter.to} required onChange={event => change('to', event.target.value)} /><TextField label="广告 ID（可选）" value={filter.ad_id} inputMode="numeric" onChange={event => change('ad_id', event.target.value)} />{info.permissions.can_manage_all && <TextField label="企业 ID（可选）" value={filter.merchant_id} inputMode="numeric" onChange={event => change('merchant_id', event.target.value)} />}<button className="ac-btn primary">查询报表</button><button type="button" className="ac-btn" disabled={resource.loading} onClick={resource.reload}>刷新</button></form><Notice error={filterError} /></Card><ResourceState resource={resource}>{resource.data && <><KPIs stats={resource.data} /><DailyChart daily={resource.data.daily} /><Card title="每日明细" note="空表表示服务器尚未返回该范围的每日数据。">{resource.data.daily.length ? <div className="ac-table-wrap"><table className="ac-table"><thead><tr><th scope="col">日期（UTC）</th>{COUNTERS.map(([key, label]) => <th scope="col" key={key}>{label}</th>)}</tr></thead><tbody>{resource.data.daily.map(row => <tr key={row.date}><th scope="row">{row.date}</th>{COUNTERS.map(([key]) => <td key={key}>{formatNumber(row[key])}</td>)}</tr>)}</tbody></table></div> : <Empty>该日期范围没有每日统计。</Empty>}</Card></>}</ResourceState></>;
}
function DailyChart({ daily }) {
  const [metric, setMetric] = useState('impressions'); const label = COUNTERS.find(([key]) => key === metric)?.[1];
  const max = Math.max(1, ...daily.map(row => row[metric])); const width = 800; const height = 160; const point = (row, i) => `${daily.length === 1 ? width / 2 : i * width / Math.max(1, daily.length - 1)},${height - row[metric] / max * (height - 12)}`;
  return <Card title="每日趋势" actions={<Field label="趋势指标">{id => <select id={id} className="ac-select" value={metric} onChange={event => setMetric(event.target.value)}>{COUNTERS.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>}</Field>}>{daily.length ? <><svg className="mc-chart" viewBox={`-8 -8 ${width + 16} ${height + 24}`} role="img" aria-label={`${label}每日趋势；精确值见每日明细表`}><title>{label}每日趋势</title><path d={`M0 ${height}H${width}`} className="mc-chart-axis" /><polyline points={daily.map(point).join(' ')} fill="none" className="mc-chart-line" vectorEffect="non-scaling-stroke" />{daily.map((row, i) => { const [cx, cy] = point(row, i).split(','); return <circle key={row.date} cx={cx} cy={cy} r="3" className="mc-chart-point"><title>{row.date} · {label} {row[metric]}</title></circle>; })}</svg><div className="mc-chart-labels"><span>{daily[0].date}</span><span>峰值 {formatNumber(max === 1 && daily.every(row => !row[metric]) ? 0 : max)}</span><span>{daily[daily.length - 1].date}</span></div></> : <Empty>该日期范围没有趋势数据。</Empty>}</Card>;
}
const ACTION_LABELS = { merchant_registered: '开通商家', identity_completed: '登记企业身份', profile_updated: '更新企业资料', ad_created: '创建广告', ad_updated: '修改广告', ad_archive: '归档广告', ad_clone: '复制广告', merchant_status_changed: '修改企业状态' };
function Audit() {
  const { api } = useMerchant(); const { page, update } = usePageFilters();
  const load = useCallback(signal => api.audit({ page, limit: 20 }, { signal }), [api, page]); const resource = useResource(load);
  return <><Heading title="操作记录" description="仅展示服务器返回的真实操作记录。"><button className="ac-btn" disabled={resource.loading} onClick={resource.reload}>刷新记录</button></Heading><ResourceState resource={resource}>{resource.data && <Card>{resource.data.items.length ? <div className="ac-table-wrap"><table className="ac-table mc-audit-table"><thead><tr><th scope="col">时间</th><th scope="col">操作者</th><th scope="col">操作</th><th scope="col">对象</th><th scope="col">详情</th></tr></thead><tbody>{resource.data.items.map(row => <tr key={row.id}><td className="ac-cell-nowrap">{dateTime(row.created_at)}</td><td>{row.actor_name || `用户 #${row.actor_id}`}</td><td>{ACTION_LABELS[row.action] || row.action}</td><td>{row.entity_type} #{row.entity_id}</td><td><details><summary>查看记录 #{row.id}</summary><pre className="mc-audit-detail">{auditDetail(row.detail_json)}</pre></details></td></tr>)}</tbody></table></div> : <Empty>暂无操作记录。</Empty>}<Pagination pagination={resource.data.pagination} onChange={next => update({ page: next })} /></Card>}</ResourceState></>;
}
function Merchants() {
  const { api, info } = useMerchant();
  if (!info.is_super_admin || !info.permissions.can_manage_all) return <Card title="无权访问"><p className="mc-muted">企业管理仅对超级管理员开放。</p><Link className="ac-btn" to="/merchant">返回概览</Link></Card>;
  return <MerchantsList api={api} />;
}
function MerchantsList({ api }) {
  const { page, update } = usePageFilters(); const operation = useOperation(); const confirm = useConfirm();
  const load = useCallback(signal => api.merchants({ page, limit: 10 }, { signal }), [api, page]); const resource = useResource(load);
  const toggle = async merchant => {
    const status = merchant.status === 'active' ? 'suspended' : 'active'; const label = status === 'active' ? '恢复' : '暂停';
    if (!(await confirm({ title: `${label}企业`, message: `确认${label}「${merchant.display_name}」？${status === 'suspended' ? '暂停后企业广告不再投放。' : ''}`, danger: status === 'suspended', okText: label }))) return;
    operation.run(() => api.merchantStatus(merchant.id, status), resource.reload);
  };
  return <><Heading title="企业管理" description="管理已注册企业的投放权限；暂停或恢复操作会写入审计记录。"><button className="ac-btn" disabled={resource.loading || operation.busy} onClick={resource.reload}>刷新企业</button></Heading><Notice {...operation} retry={operation.error ? resource.reload : undefined} /><ResourceState resource={resource}>{resource.data && <Card>{resource.data.items.length ? <div className="ac-table-wrap"><table className="ac-table mc-merchants-table"><thead><tr><th scope="col">企业</th><th scope="col">关联账户</th><th scope="col">联系信息</th><th scope="col">状态</th><th scope="col">广告 / 曝光 / 点击</th><th scope="col">操作</th></tr></thead><tbody>{resource.data.items.map(merchant => <tr key={merchant.id}><td><div className="mc-ad-cell"><span className="mc-avatar">{safeMediaURL(merchant.avatar_url) ? <img src={safeMediaURL(merchant.avatar_url)} alt="" /> : '企'}</span><div><strong>{merchant.display_name}</strong><small className="mc-block mc-muted">ID {merchant.id} · {merchant.identity_locked ? '身份已锁定' : '身份待登记'}</small></div></div></td><td>{merchant.username || '—'}<small className="mc-block mc-muted">用户 #{merchant.user_id}</small></td><td>{merchant.contact_name || '—'}<small className="mc-block mc-muted">{merchant.contact_email || '—'}</small></td><td><span className={`mc-badge ${merchant.status}`}>{merchant.status === 'active' ? '正常' : '已暂停'}</span></td><td>{formatNumber(merchant.ad_count)} / {formatNumber(merchant.impressions)} / {formatNumber(merchant.clicks)}</td><td><div className="mc-row-actions"><Link className="ac-btn" to={`/merchant/ads?merchant_id=${encodeURIComponent(merchant.id)}`}>广告</Link><Link className="ac-btn" to={`/merchant/reports?merchant_id=${encodeURIComponent(merchant.id)}`}>报表</Link><button className={`ac-btn ${merchant.status === 'active' ? 'danger' : ''}`} disabled={operation.busy} onClick={() => toggle(merchant)}>{merchant.status === 'active' ? '暂停' : '恢复'}</button></div></td></tr>)}</tbody></table></div> : <Empty>暂无注册企业。</Empty>}<Pagination pagination={resource.data.pagination} disabled={operation.busy} onChange={next => update({ page: next })} /></Card>}</ResourceState></>;
}
function Enrollment({ info, api, refreshInfo, identityOnly = false }) {
  const profile = info.profile || info.merchant;
  const [form, setForm] = useState({ code: '', display_name: profile?.display_name || '', avatar_url: profile?.avatar_url || '' });
  const operation = useOperation(); const confirm = useConfirm(); const [uploading, setUploading] = useState(false);
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    let payload; try { payload = identityPayload(form, !identityOnly); } catch (error) { operation.run(() => { throw error; }); return; }
    if (!(await confirm({ title: '确认锁定企业身份', message: `企业名称「${payload.display_name}」及头像只能登记一次，提交后普通商家不可修改。请确认展示身份正确。`, okText: '确认登记' }))) return;
    operation.run(() => identityOnly ? api.identity(payload) : api.activate(payload), refreshInfo, '企业身份已登记。');
  };
  return <div className="mc-enrollment"><Heading title={identityOnly ? '完善企业身份' : '开通商家服务'} description={identityOnly ? '旧商家资料需要补登记企业名称和头像；无需注册码。' : '使用平台发放的注册码开通企业。企业名称和头像只可登记一次。'} /><Card title="登记企业身份"><form onSubmit={submit} className="ac-form-grid"><Notice {...operation} />{!identityOnly && <TextField label="商家注册码" value={form.code} required autoComplete="off" onChange={event => change('code', event.target.value)} />}<TextField label="企业名称" value={form.display_name} required maxLength={120} onChange={event => change('display_name', event.target.value)} /><UploadField label="企业头像" api={api} value={form.avatar_url} onChange={value => change('avatar_url', value)} onBusy={setUploading} disabled={operation.busy} />{safeMediaURL(form.avatar_url) && <span className="mc-avatar mc-avatar-large"><img src={safeMediaURL(form.avatar_url)} alt="待登记的企业头像" /></span>}<p className="mc-notice">提交后企业名称和头像将锁定。普通广告统一使用此身份。</p><button className="ac-btn primary mc-fit" disabled={operation.busy || uploading}>{operation.busy ? '提交中…' : identityOnly ? '确认登记企业身份' : '确认开通并锁定身份'}</button></form></Card></div>;
}
function Unknown() { return <Card title="商家页面不存在"><p className="mc-muted">请选择侧栏中的运营模块。</p><Link className="ac-btn" to="/merchant">返回运营概览</Link></Card>; }
export default function MerchantConsole({ api, username = '', loggedIn = true, authLoading = false }) {
  const load = useCallback(signal => loggedIn && !authLoading ? api.info({ signal }) : Promise.resolve(null), [api, loggedIn, authLoading]);
  const resource = useResource(load); const info = resource.data; const state = accessState(info);
  if (authLoading || resource.loading) return <MerchantLayout username={username} locked><div className="mc-loading" role="status">正在验证商家权限…</div></MerchantLayout>;
  if (!loggedIn) return <MerchantLayout username={username} locked><Card title="请先登录"><p className="mc-muted">商家控制台与当前社区账户关联。</p><Link className="ac-btn primary" to="/login?redirect=%2Fmerchant">前往登录</Link></Card></MerchantLayout>;
  if (resource.error) return <MerchantLayout username={username} locked><Heading title="无法读取商家权限" description="未加载任何广告或统计，请手动重试。" /><Notice error={resource.error} retry={resource.reload} /></MerchantLayout>;
  if (state !== 'ready') return <ConfirmProvider><MerchantLayout info={info} username={username} locked>{state === 'activate' || state === 'identity' ? <Enrollment info={info} api={api} refreshInfo={resource.reload} identityOnly={state === 'identity'} /> : <Card title={state === 'suspended' ? '企业已暂停' : '商家权限未启用'}><p className="mc-muted">当前账户不可加载广告或统计。请联系平台处理权限，处理完成后手动重新验证。</p><button className="ac-btn" onClick={resource.reload}>重新验证权限</button></Card>}</MerchantLayout></ConfirmProvider>;
  return <MerchantContext.Provider value={{ api, info, refreshInfo: resource.reload }}><ConfirmProvider><Routes><Route element={<MerchantLayout info={info} username={username} />}><Route path="/merchant" element={<Overview />} /><Route path="/merchant/ads" element={<Ads />} /><Route path="/merchant/ads/new" element={<EditorForm source={EMPTY_AD} />} /><Route path="/merchant/ads/:id/edit" element={<EditAd />} /><Route path="/merchant/reports" element={<Reports />} /><Route path="/merchant/company" element={<Company />} /><Route path="/merchant/audit" element={<Audit />} /><Route path="/merchant/merchants" element={<Merchants />} /><Route path="*" element={<Unknown />} /></Route></Routes></ConfirmProvider></MerchantContext.Provider>;
}
