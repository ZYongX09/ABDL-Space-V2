import { useCallback, useEffect, useId, useRef, useState } from 'react';
import AdminLayout from './layout.jsx';
import { babyVerificationAPI } from '../../babyVerification/api.js';
import { adminActionAvailability, canViewPhoto, configRequest, createDecisionOperationStore, statusMeta, validateReason } from '../../babyVerification/model.js';
import { Card, Empty, ErrorBox, Loading, Pagination, Pill, Toolbar, useConfirm, useDialogLifecycle } from './ui.jsx';
import { fmtFull } from './util.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import './baby-verifications.css';

const FILTERS = ['', 'submitted', 'reviewing', 'approved', 'rejected'];
const ACTION_LABEL = { claim: '认领审核', release: '释放审核', approve: '通过', reject: '驳回', revoke: '吊销', reissue: '补发证书' };
const CONFIG_FIELDS = [
  ['declarationVersion', '声明版本', 'text', null, null, '声明版本由服务端校验；修改不会替代对现有申请的审核。'],
  ['freeMonthlyLimit', '普通用户月额度', 'number', 0, 1000, '每月可用次数，0–1000。'],
  ['sponsorMonthlyLimit', '赞助用户月额度', 'number', 0, 1000, '每月可用次数，0–1000。'],
  ['captureTtlSeconds', '拍摄会话有效期（秒）', 'number', 60, 86400, '60–86400 秒。'],
  ['uploadTtlSeconds', '上传授权有效期（秒）', 'number', 60, 86400, '60–86400 秒。'],
  ['maxEvidenceSize', '单张照片上限（字节）', 'number', 1024, 52428800, '1024–52428800 字节；不会在此读取照片。'],
];
const shown = value => value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);

export function BabyVerificationPhoto(props) {
  const { verificationId, photo, canView, accessScope = '' } = props;
  // 目标、证据或认领会话变化时同步隔离旧 URL，不等 effect 才清空敏感展示。
  return <BabyVerificationPhotoSession key={JSON.stringify([verificationId, photo.id, canView, accessScope])} {...props} />;
}

function BabyVerificationPhotoSession({ verificationId, photo, canView, isClaimedByCurrentAdmin }) {
  const [state, setState] = useState({ loading: false, url: '', error: '', revealed: false });
  const abort = useRef(null), expiry = useRef(null);
  const dispose = useCallback(() => { abort.current?.abort(); clearTimeout(expiry.current); abort.current = null; expiry.current = null; }, []);
  const clear = useCallback(() => { dispose(); setState({ loading: false, url: '', error: '', revealed: false }); }, [dispose]);
  useEffect(() => dispose, [dispose]);
  const reveal = async () => {
    if (!canView || state.loading) return;
    if (state.url) { setState(current => ({ ...current, revealed: !current.revealed })); return; }
    const request = new AbortController(); abort.current = request;
    setState(current => ({ ...current, loading: true, error: '' }));
    try {
      const access = await babyVerificationAPI.admin.photo(verificationId, photo.id, request.signal);
      if (request.signal.aborted || abort.current !== request) return;
      const expiresAt = typeof access.expiresAt === 'number' ? access.expiresAt * 1000 : new Date(access.expiresAt).getTime();
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) { clear(); return; }
      setState({ loading: false, url: access.url, error: '', revealed: true });
      expiry.current = setTimeout(clear, Math.max(0, expiresAt - Date.now()));
    } catch (error) {
      if (!request.signal.aborted && abort.current === request && error.name !== 'AbortError') setState({ loading: false, url: '', error: error.message, revealed: false });
    }
  };
  const message = !canView ? (isClaimedByCurrentAdmin && photo.status !== 'ready' ? '照片仍在校验' : '请先认领审核') : '';
  return <div className="bv-photo"><button type="button" onClick={reveal} disabled={!canView || state.loading} aria-label={`${state.revealed ? '隐藏' : '查看'}${photo.label || '认证照片'}`}>
    {canView && state.url ? <img src={state.url} alt={photo.label || '认证照片'} className={state.revealed ? '' : 'blurred'} referrerPolicy="no-referrer" /> : <span><i className={`fa-solid ${state.loading ? 'fa-spinner fa-spin' : 'fa-eye-slash'}`} aria-hidden="true" />{message || '点击后请求短期照片地址'}</span>}
  </button>{state.error && <small role="alert">{state.error}；请显式点击照片重试。</small>}<div>{photo.label || `照片 ${photo.id}`} · {photo.status || '状态未提供'}</div></div>;
}

export function BabyVerificationDetail({ item, onChanged, onClose, adminId }) {
  const toast = useToast(), confirm = useConfirm();
  const permissions = adminActionAvailability(item, adminId);
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const operations = useRef(createDecisionOperationStore()), acting = useRef(false), panelRef = useRef(null);
  const titleId = useId(), reasonId = useId();
  const close = useCallback(() => { if (!acting.current) onClose(); }, [onClose]);
  useDialogLifecycle(true, close, panelRef, { initialFocus: 'first' });
  const action = async (name, needsReason = false) => {
    if (acting.current || !permissions[name]) return;
    let checked;
    try { checked = needsReason ? validateReason(reason) : undefined; setError(''); }
    catch (failure) { setError(failure.message); return; }
    acting.current = true; setBusy(true);
    let stableOperationId;
    try {
      if (needsReason && !await confirm({ title: `${ACTION_LABEL[name]} · 申请 ${item.id}`, message: `请核对用户 ${item.displayName || item.username || item.userId}（ID ${item.userId}）及服务端当前状态。${name === 'reissue' ? '补发将生成新的证书代次，旧证书的有效性由服务端决定。' : name === 'revoke' ? '吊销会改变当前证书的有效状态，不能仅凭历史资料推断应执行此操作。' : '审核结果与理由将写入服务端审计。'} 理由：${checked}`, okText: `确认${ACTION_LABEL[name]}`, danger: name !== 'approve' })) return;
      if (['approve', 'reject', 'revoke', 'reissue'].includes(name)) stableOperationId = operations.current.acquire(item.id, name, checked);
      const next = await babyVerificationAPI.admin[name](item.id, checked, item, stableOperationId);
      if (name === 'claim' || name === 'release') {
        const refreshed = await babyVerificationAPI.admin.detail(item.id);
        onChanged(refreshed); setReason(''); toast.success('操作已由服务器确认'); return;
      }
      if (stableOperationId) operations.current.settle(item.id, name, checked);
      onChanged(next); setReason(''); toast.success('操作已由服务器确认');
    } catch (failure) {
      if (stableOperationId) operations.current.reject(item.id, name, checked, failure);
      setError(failure.message); toast.error(failure.message);
    } finally { acting.current = false; setBusy(false); }
  };
  const certificateMeta = item.certificate ? statusMeta(item.certificate.status) : null;
  const actor = item.certificate?.revokedByName || item.certificate?.revokedBy;
  const hasActions = Object.keys(ACTION_LABEL).some(name => permissions[name]);
  return <div className="bv-detail-mask" role="presentation" onMouseDown={close}><aside ref={panelRef} className="bv-detail" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1} onMouseDown={event => event.stopPropagation()}>
    <header><div><h2 id={titleId}>{item.displayName || item.username || `用户 ${item.userId}`}</h2><p>申请 {item.id} · 用户 ID {item.userId}</p><p><Pill tone={statusMeta(item.status).tone}>{statusMeta(item.status).label}</Pill> · 提交 {fmtFull(item.submittedAt)}</p></div><button type="button" className="ac-icon-button" aria-label="关闭认证审核详情" data-autofocus disabled={busy} onClick={close}><i className="fa-solid fa-xmark" aria-hidden="true" /></button></header>
    <section className="bv-review-summary"><h3>审核与认领</h3><dl><div><dt>用户名</dt><dd>{item.username || '—'}</dd></div><div><dt>最近更新</dt><dd>{fmtFull(item.updatedAt)}</dd></div><div><dt>认领管理员</dt><dd>{item.claimedBy || '未认领'}</dd></div><div><dt>认领到期</dt><dd>{fmtFull(item.claimExpiresAt)}</dd></div></dl>{item.reason && <p>服务端审核说明：{item.reason}</p>}</section>
    <section className="bv-profile"><details className="bv-disclosure"><summary>显式展开已认证个人资料信息</summary><p className="bv-sensitive-note">仅用于当前申请审核，不提供一键复制；收起不会读取照片。</p><dl>{Object.entries(item.profile || {}).filter(([, value]) => value != null && value !== '').map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{shown(value)}</dd></div>)}</dl>{!Object.keys(item.profile || {}).length && <p>服务端未返回个人资料。</p>}</details></section>
    <section><h3>证书信息</h3>{item.certificate ? <dl className="bv-certificate-details"><div><dt>证书状态</dt><dd><Pill tone={certificateMeta.tone}>{certificateMeta.label}</Pill></dd></div><div><dt>Generation（证书代次）</dt><dd>{item.certificate.generation ?? '—'}</dd></div><div><dt>证书编号</dt><dd>{item.certificate.id}</dd></div><div><dt>签发时间</dt><dd>{fmtFull(item.certificate.issuedAt)}</dd></div>{item.certificate.revokedAt && <div><dt>吊销时间</dt><dd>{fmtFull(item.certificate.revokedAt)}</dd></div>}{item.certificate.revokeReason && <div><dt>吊销原因</dt><dd>{item.certificate.revokeReason}</dd></div>}{actor && <div><dt>吊销操作者</dt><dd>{actor}</dd></div>}</dl> : <Empty text="当前申请没有证书" />}{item.certificate?.token && <a className="ac-btn" href={`/c/${encodeURIComponent(item.certificate.token)}`} target="_blank" rel="noreferrer">打开证书验真页</a>}</section>
    <section><h3>服务端认证要求与照片</h3><p className="bv-sensitive-note">照片默认模糊且未加载。仅认领管理员显式点击单张照片后请求短期 URL；到期、认领变化或离开详情即清空，不预加载。</p><div className="bv-photos">{item.photos.map(photo => <BabyVerificationPhoto key={`${item.id}-${photo.id}`} verificationId={item.id} photo={photo} canView={canViewPhoto(item, photo, adminId)} accessScope={JSON.stringify([adminId, item.claimedBy, item.claimExpiresAt])} isClaimedByCurrentAdmin={permissions.claimedByCurrentAdmin} />)}{!item.photos.length && <Empty text="服务端未返回照片清单" />}</div></section>
    <section className="bv-decision"><h3>审核操作</h3><ErrorBox msg={error} />{hasActions ? <><label className="ac-form-field" htmlFor={reasonId}><span className="ac-field-label">审核 / 证书操作理由</span><textarea id={reasonId} className="ac-textarea" rows={3} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} placeholder="通过、驳回、吊销或补发均需填写明确理由" maxLength={500} /><span className="ac-field-hint">决策理由必填，1–500 字；先校验理由，再确认操作。错误时保留您的输入。</span></label><div className="bv-actions">{Object.entries(ACTION_LABEL).filter(([name]) => permissions[name]).map(([name, label]) => <button type="button" className={`ac-btn ${name === 'approve' ? 'primary' : ['reject', 'revoke'].includes(name) ? 'danger' : ''}`} disabled={busy} key={name} onClick={() => action(name, !['claim', 'release'].includes(name))}>{label}</button>)}</div>{busy && <p role="status">正在确认 / 提交，其他审核操作与关闭暂不可用…</p>}</> : <p className="bv-readonly">{permissions.claimedByOtherAdmin ? `该申请已由管理员 ${item.claimedBy} 认领，当前为只读。` : '当前状态没有可执行的管理操作。'}</p>}</section>
  </aside></div>;
}

export function BabyVerificationPagination({ data, loading, error, page, limit, onChange }) {
  if (!data || loading || error) return null;
  return <Pagination page={page} totalPages={Math.max(1, Math.ceil(data.total / limit))} total={data.total} onChange={onChange} />;
}

export function BabyVerificationQueue({ data, status, loading, error, onStatus, onRetry, onOpen, openingId }) {
  return <>
    <div className="ac-stat-grid"><Card title="待审核"><strong className="bv-stat">{data?.pending ?? '—'}</strong><p className="ac-section-note">服务端返回的待审核数</p></Card><Card title="当前筛选"><strong className="bv-stat">{data?.total ?? '—'}</strong><p className="ac-section-note">{status ? statusMeta(status).label : '全部状态'}</p></Card></div>
    <Toolbar result={data ? `${loading || error ? '上次成功读取：' : ''}共 ${data.total} 条 · 本页 ${data.items.length} 条` : loading ? '正在首次读取队列，数量尚未确认' : error ? '队列读取失败，数量尚未确认' : '尚未成功读取队列'}><label className="ac-form-field"><span className="ac-field-label">申请状态</span><select className="ac-select" value={status} onChange={event => onStatus(event.target.value)} disabled={loading}>{FILTERS.map(value => <option key={value} value={value}>{value ? statusMeta(value).label : '全部状态'}</option>)}</select></label><button type="button" className="ac-btn" disabled={loading} onClick={onRetry}>{loading ? '读取队列中…' : error ? '重试审核队列' : '刷新队列'}</button></Toolbar>
    <ErrorBox msg={error} />{loading && <Loading text="读取认证审核队列…" />}
    <Card title="认证申请" description="先打开详情核对，再认领审核；队列不请求或预加载照片。" pad={false}>
      {data?.items.length > 0 && <><div className="ac-table-wrap ac-desktop-only"><table className="ac-table"><thead><tr>{['用户 / 申请', '状态', '提交时间', '照片', '认领', '操作'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{data.items.map(item => <tr key={item.id}><td><strong>{item.displayName || item.username || item.userId}</strong><small>@{item.username || '—'} · 用户 ID {item.userId}</small><small>申请 {item.id}</small></td><td><Pill tone={statusMeta(item.status).tone}>{statusMeta(item.status).label}</Pill></td><td>{fmtFull(item.submittedAt)}</td><td>{item.photoCount}</td><td>{item.claimedBy || '未认领'}<small>到期 {fmtFull(item.claimExpiresAt)}</small></td><td><button type="button" className="ac-btn" disabled={!!openingId} onClick={() => onOpen(item)}>{openingId === item.id ? '读取详情中…' : '详情审核'}</button></td></tr>)}</tbody></table></div><div className="ac-mobile-only bv-record-list">{data.items.map(item => <article className="bv-record" key={item.id}><header><h3>{item.displayName || item.username || item.userId}</h3><Pill tone={statusMeta(item.status).tone}>{statusMeta(item.status).label}</Pill></header><dl>{[['用户名', item.username], ['用户 ID', item.userId], ['申请编号', item.id], ['提交时间', fmtFull(item.submittedAt)], ['照片数量', item.photoCount], ['认领管理员', item.claimedBy || '未认领'], ['认领到期', fmtFull(item.claimExpiresAt)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{shown(value)}</dd></div>)}</dl><button type="button" className="ac-btn" disabled={!!openingId} onClick={() => onOpen(item)}>{openingId === item.id ? '读取详情中…' : '详情审核'}</button></article>)}</div></>}
      {!loading && !error && data?.items.length === 0 && <Empty text="没有匹配的认证申请" />}
      {(loading || error) && data && <p className="bv-sensitive-note">保留上次成功读取的队列；不能据此确认新筛选已读取成功。</p>}
    </Card>
  </>;
}

export function BabyVerificationAudit({ audit, loading, error, onRetry }) {
  return <Card title="认证审计" description="只读审计记录；按动作、申请及操作者逐条核对。原始字段保留在单条展开区，不自动复制。" action={<button type="button" className="ac-btn" disabled={loading} onClick={onRetry}>{loading ? '读取审计中…' : error ? '重试认证审计' : '刷新审计'}</button>}>
    <ErrorBox msg={error} />{loading && <Loading text="读取认证审计…" />}
    <div className="bv-record-list">{audit?.items.map((item, index) => <article className="bv-record" key={item.id ?? item.audit_id ?? index}><header><h3>{shown(item.action ?? item.event_type ?? item.operation)}</h3><span>{fmtFull(item.created_at ?? item.timestamp)}</span></header><dl>{[['审计编号', item.id ?? item.audit_id], ['申请编号', item.application_id ?? item.request_id], ['操作者', item.admin_username ?? item.actor_id ?? item.admin_id ?? item.created_by], ['理由', item.reason ?? item.note ?? item.decision_note]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{shown(value)}</dd></div>)}</dl><details className="bv-disclosure"><summary>展开本条完整审计字段</summary><dl>{Object.entries(item).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{shown(value)}</dd></div>)}</dl></details></article>)}</div>
    {!loading && !error && audit?.items.length === 0 && <Empty text="没有认证审计记录" />}
    {(loading || error) && audit && <p className="bv-sensitive-note">下方 / 当前记录为上次成功读取页；审计读取失败不代表没有记录。</p>}
  </Card>;
}

export function BabyVerificationConfig({ config, reason, dirty, busy, loading, error, saveError, saved, onChange, onReason, onSave, onRetry, onReset }) {
  const reasonId = useId();
  return <Card title="认证配置" description="低频配置；后端仍负责版本校验与审计。离开配置页签不会丢失未保存表单。" action={<button type="button" className="ac-btn" disabled={busy || loading || dirty} onClick={onRetry}>{loading ? '读取配置中…' : error ? '重试认证配置' : '重读配置'}</button>}>
    <ErrorBox msg={error} />{loading && <Loading text="读取认证配置…" />}
    {config && <form className="bv-config" onSubmit={event => { event.preventDefault(); onSave(); }}>
      <p className="bv-config-state" role="status">{busy ? '正在确认 / 保存…' : dirty ? '有未保存修改；保存前请核对版本与理由。' : saved ? '配置已由服务端确认保存。' : '配置已读取，尚无未保存修改。'} 服务端版本：<code>{config.version}</code></p>
      <fieldset disabled={busy || loading}><legend>认证开关与声明</legend><label className="bv-check"><input type="checkbox" checked={config.enabled} onChange={event => onChange({ ...config, enabled: event.target.checked })} />启用认证</label><p className="ac-field-hint">此处只保存配置，不执行审核或读取照片。</p>
        {CONFIG_FIELDS.map(([key, label, type, min, max, hint]) => <label className="ac-form-field" key={key}><span className="ac-field-label">{label}</span><input className="ac-input" type={type} required min={min ?? undefined} max={max ?? undefined} maxLength={type === 'text' ? 64 : undefined} step={type === 'number' ? 1 : undefined} value={config[key]} onChange={event => onChange({ ...config, [key]: type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value })} /><span className="ac-field-hint">{hint}</span></label>)}
      </fieldset>
      <label className="ac-form-field" htmlFor={reasonId}><span className="ac-field-label">修改理由（必填）</span><textarea id={reasonId} className="ac-textarea" value={reason} required maxLength={500} rows={2} disabled={busy || loading} onChange={event => onReason(event.target.value)} /><span className="ac-field-hint">1–500 字；先校验再确认，保存失败保留输入。</span></label>
      <ErrorBox msg={saveError} /><div className="bv-actions"><button type="submit" className="ac-btn primary" disabled={busy || loading || !dirty}>{busy ? '保存中…' : '保存认证配置'}</button><button type="button" className="ac-btn" disabled={busy || loading || !dirty} onClick={onReset}>撤回未保存修改</button></div>
    </form>}
  </Card>;
}

export default function AdminBabyVerifications() {
  const toast = useToast(), confirm = useConfirm();
  const { user } = useAuth();
  const [tab, setTab] = useState('reviews'), [status, setStatus] = useState('submitted'), [page, setPage] = useState(1);
  const [data, setData] = useState(null), [selected, setSelected] = useState(null), [audit, setAudit] = useState(null);
  const [config, setConfig] = useState(null), [savedConfig, setSavedConfig] = useState(null), [configReason, setConfigReason] = useState('');
  const [pending, setPending] = useState({ reviews: true }), [errors, setErrors] = useState({}), [configBusy, setConfigBusy] = useState(false), [configSaved, setConfigSaved] = useState(false);
  const [openingId, setOpeningId] = useState(''), [detailError, setDetailError] = useState('');
  const detailRead = useRef(0), reads = useRef({ reviews: 0, audit: 0, config: 0 }), configWriting = useRef(false);
  const dirty = !!config && (JSON.stringify(config) !== JSON.stringify(savedConfig) || !!configReason);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const tabId = useId();
  const load = useCallback(async () => {
    const section = tab, sequence = ++reads.current[section];
    setPending(current => ({ ...current, [section]: true })); setErrors(current => ({ ...current, [section]: '' }));
    try {
      const result = section === 'reviews' ? await babyVerificationAPI.admin.list({ status, page, limit: 20 }) : section === 'audit' ? await babyVerificationAPI.admin.audit({ page, limit: 50 }) : await babyVerificationAPI.admin.config();
      if (sequence !== reads.current[section]) return;
      if (section === 'reviews') setData(result);
      if (section === 'audit') setAudit(result);
      if (section === 'config' && !dirtyRef.current && !configWriting.current) { setConfig(result); setSavedConfig(result); }
    } catch (failure) { if (sequence === reads.current[section]) setErrors(current => ({ ...current, [section]: failure.message })); }
    finally { if (sequence === reads.current[section]) setPending(current => ({ ...current, [section]: false })); }
  }, [tab, status, page]);
  useEffect(() => { const generations = reads.current; load(); return () => { generations[tab] += 1; }; }, [load, tab]);
  useEffect(() => { const generations = reads.current; return () => { detailRead.current += 1; Object.keys(generations).forEach(name => { generations[name] += 1; }); }; }, []);
  const open = async item => {
    const sequence = ++detailRead.current; setOpeningId(item.id); setDetailError('');
    try { const next = await babyVerificationAPI.admin.detail(item.id); if (sequence === detailRead.current) setSelected(next); }
    catch (failure) { if (sequence === detailRead.current) setDetailError(`申请 ${item.id} 详情读取失败：${failure.message}`); }
    finally { if (sequence === detailRead.current) setOpeningId(''); }
  };
  const changed = next => { setSelected(next); setData(current => current ? { ...current, items: current.items.map(item => item.id === next.id ? next : item) } : current); };
  const saveConfig = async () => {
    if (configWriting.current) return;
    let checked;
    try { checked = validateReason(configReason); configRequest(config, checked); setErrors(current => ({ ...current, configSave: '' })); }
    catch (failure) { setErrors(current => ({ ...current, configSave: failure.message })); return; }
    configWriting.current = true; setConfigBusy(true);
    try {
      if (!await confirm({ title: '保存认证配置', message: `确认以服务端版本 ${config.version} 保存认证开关、声明及额度 / 有效期限制。理由：${checked}。服务端将校验版本并记录审计，不会读取任何照片。`, okText: '确认保存配置' })) return;
      const next = await babyVerificationAPI.admin.saveConfig(config, checked);
      setConfig(next); setSavedConfig(next); setConfigReason(''); setConfigSaved(true); toast.success('配置已保存');
    } catch (failure) { setErrors(current => ({ ...current, configSave: failure.message })); toast.error(failure.message); }
    finally { configWriting.current = false; setConfigBusy(false); }
  };
  const changeTab = value => { if (!configWriting.current) { detailRead.current += 1; setOpeningId(''); setDetailError(''); setTab(value); setPage(1); } };
  return <AdminLayout active="baby-verifications"><div className="ac-page-stack baby-verification-admin">
    <div className="bv-tabs" role="tablist" aria-label="认证管理模块">{[['reviews', '审核队列'], ['audit', '审计记录'], ['config', '认证配置']].map(([value, label]) => <button type="button" role="tab" id={`${tabId}-${value}-tab`} aria-controls={`${tabId}-${value}-panel`} aria-selected={tab === value} key={value} className={`ac-btn ${tab === value ? 'primary' : ''}`} disabled={configBusy} onClick={() => changeTab(value)}>{label}{value === 'config' && dirty ? ' · 未保存' : ''}</button>)}</div>
    <div id={`${tabId}-${tab}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${tab}-tab`} className="ac-page-stack">
      {tab === 'reviews' && <><BabyVerificationQueue data={data} status={status} loading={pending.reviews} error={errors.reviews} onStatus={value => { setStatus(value); setPage(1); }} onRetry={load} onOpen={open} openingId={openingId} /><ErrorBox msg={detailError} /></>}
      {tab === 'audit' && <BabyVerificationAudit audit={audit} loading={pending.audit || !audit && !errors.audit} error={errors.audit} onRetry={load} />}
      {tab === 'config' && <BabyVerificationConfig config={config} reason={configReason} dirty={dirty} busy={configBusy} loading={pending.config} error={errors.config} saveError={errors.configSave} saved={configSaved} onChange={value => { setConfig(value); setConfigSaved(false); }} onReason={value => { setConfigReason(value); setConfigSaved(false); }} onSave={saveConfig} onRetry={load} onReset={() => { setConfig(savedConfig); setConfigReason(''); setErrors(current => ({ ...current, configSave: '' })); }} />}
      {tab !== 'config' && <BabyVerificationPagination data={tab === 'reviews' ? data : audit} loading={pending[tab]} error={errors[tab]} page={page} limit={tab === 'reviews' ? 20 : 50} onChange={setPage} />}
    </div>
    {selected && <BabyVerificationDetail key={selected.id} item={selected} onChanged={changed} onClose={() => setSelected(null)} adminId={user?.id} />}
  </div></AdminLayout>;
}
