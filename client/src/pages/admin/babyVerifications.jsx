import { useCallback, useEffect, useRef, useState } from 'react';
import AdminLayout from './layout.jsx';
import { babyVerificationAPI } from '../../babyVerification/api.js';
import { createDecisionOperationStore, statusMeta, validateReason } from '../../babyVerification/model.js';
import { Card, Empty, ErrorBox, Loading, Pagination, Pill, Toolbar } from './ui.jsx';
import { fmtFull } from './util.js';
import { useToast } from '../../contexts/ToastContext.jsx';
import './baby-verifications.css';

const FILTERS = ['', 'pending', 'reviewing', 'approved', 'rejected'];

function Photo({ verificationId, photo }) {
	const [state, setState] = useState({ loading: false, url: '', error: '', revealed: false });
	const abort = useRef(null);
	const expiry = useRef(null);
	const clear = useCallback(() => { abort.current?.abort(); clearTimeout(expiry.current); abort.current = null; expiry.current = null; setState({ loading: false, url: '', error: '', revealed: false }); }, []);
	useEffect(() => clear, [clear]);
	const reveal = async () => {
		if (state.url) { setState(s => ({ ...s, revealed: !s.revealed })); return; }
		abort.current = new AbortController(); setState(s => ({ ...s, loading: true, error: '' }));
		try {
			const access = await babyVerificationAPI.admin.photo(verificationId, photo.id, abort.current.signal);
			setState({ loading: false, url: access.url, error: '', revealed: true });
			if (access.expiresAt) {
				const expiresAt = typeof access.expiresAt === 'number' ? access.expiresAt * 1000 : new Date(access.expiresAt).getTime();
				expiry.current = setTimeout(clear, Math.max(0, expiresAt - Date.now()));
			}
		} catch (error) { if (error.name !== 'AbortError') setState({ loading: false, url: '', error: error.message, revealed: false }); }
	};
	return <div className="bv-photo"><button type="button" onClick={reveal} aria-label={`${state.revealed ? '隐藏' : '查看'}${photo.label || '认证照片'}`}>
		{state.url ? <img src={state.url} alt={photo.label || '认证照片'} className={state.revealed ? '' : 'blurred'} referrerPolicy="no-referrer" /> : <span><i className={`fa-solid ${state.loading ? 'fa-spinner fa-spin' : 'fa-eye-slash'}`} />点击后请求短期照片地址</span>}
	</button>{state.error && <small role="alert">{state.error}</small>}<div>{photo.label || `照片 ${photo.id}`}</div></div>;
}

function Detail({ item, onChanged, onClose }) {
	const toast = useToast();
	const [reason, setReason] = useState('');
	const [busy, setBusy] = useState(false);
	const decisionOperations = useRef(createDecisionOperationStore());
	const action = async (name, needsReason = false) => {
		setBusy(true);
		let checked;
		let stableOperationId;
		try {
			checked = needsReason ? validateReason(reason) : undefined;
			if (name === 'approve' || name === 'reject') stableOperationId = decisionOperations.current.acquire(item.id, name, checked);
			const next = await babyVerificationAPI.admin[name](item.id, checked, item, stableOperationId);
			if (stableOperationId) decisionOperations.current.settle(item.id, name, checked);
			onChanged(next); setReason(''); toast.success('操作已由服务器确认');
		} catch (error) {
			if (stableOperationId) decisionOperations.current.reject(item.id, name, checked, error);
			toast.error(error.message);
		} finally { setBusy(false); }
	};
	return <div className="bv-detail-mask" role="presentation" onMouseDown={onClose}><aside className="bv-detail" role="dialog" aria-modal="true" aria-label="认证审核详情" onMouseDown={e => e.stopPropagation()}>
		<header><div><h2>{item.displayName || item.username || `用户 ${item.userId}`}</h2><p>申请 {item.id} · 提交 {fmtFull(item.submittedAt)}</p></div><button className="ac-icon-button" onClick={onClose}><i className="fa-solid fa-xmark" /></button></header>
		<section className="bv-profile"><h3>已认证个人资料信息</h3><dl>{Object.entries(item.profile || {}).filter(([, value]) => value != null && value !== '').map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></section>
		<section><h3>服务端认证要求与照片</h3><p className="bv-sensitive-note">照片默认模糊且未加载。仅在点击单张照片后请求短期 URL；离开详情即清空。</p><div className="bv-photos">{item.photos.map(photo => <Photo key={photo.id} verificationId={item.id} photo={photo} />)}{!item.photos.length && <Empty text="服务端未返回照片清单" />}</div></section>
		<section><h3>审核操作</h3><textarea className="ac-input" rows="3" value={reason} onChange={e => setReason(e.target.value)} placeholder="通过、驳回、吊销或补发均需填写明确理由" maxLength="500" />
			<div className="bv-actions"><button className="ac-btn" disabled={busy} onClick={() => action(item.claimedBy ? 'release' : 'claim')}>{item.claimedBy ? '释放审核' : '认领审核'}</button><button className="ac-btn primary" disabled={busy} onClick={() => action('approve', true)}>通过</button><button className="ac-btn danger" disabled={busy} onClick={() => action('reject', true)}>驳回</button><button className="ac-btn danger" disabled={busy} onClick={() => action('revoke', true)}>吊销</button><button className="ac-btn" disabled={busy} onClick={() => action('reissue', true)}>补发证书</button></div>
		</section>{item.certificate?.token && <a className="ac-btn" href={`/c/${encodeURIComponent(item.certificate.token)}`} target="_blank" rel="noreferrer">打开证书验真页</a>}
	</aside></div>;
}

export default function AdminBabyVerifications() {
	const toast = useToast();
	const [tab, setTab] = useState('reviews');
	const [status, setStatus] = useState('pending');
	const [page, setPage] = useState(1);
	const [data, setData] = useState(null);
	const [selected, setSelected] = useState(null);
	const [audit, setAudit] = useState(null);
	const [config, setConfig] = useState(null);
	const [configReason, setConfigReason] = useState('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const load = useCallback(async () => { setLoading(true); setError(''); try {
			if (tab === 'reviews') setData(await babyVerificationAPI.admin.list({ status, page, limit: 20 }));
			if (tab === 'audit') setAudit(await babyVerificationAPI.admin.audit({ page, limit: 50 }));
			if (tab === 'config') setConfig(await babyVerificationAPI.admin.config());
		} catch (e) { setError(e.message); } finally { setLoading(false); } }, [tab, status, page]);
	useEffect(() => { load(); }, [load]);
	const open = async item => { try { setSelected(await babyVerificationAPI.admin.detail(item.id)); } catch (e) { toast.error(e.message); } };
	const changed = next => { setSelected(next); setData(current => current ? { ...current, items: current.items.map(item => item.id === next.id ? next : item) } : current); };
	const saveConfig = async () => { try { setConfig(await babyVerificationAPI.admin.saveConfig(config, configReason)); setConfigReason(''); toast.success('配置已保存'); } catch (e) { toast.error(e.message); } };
	return <AdminLayout active="baby-verifications"><div className="ac-page-stack baby-verification-admin">
		<div className="bv-tabs">{[['reviews', '审核队列'], ['audit', '审计记录'], ['config', '认证配置']].map(([value, label]) => <button key={value} className={`ac-btn ${tab === value ? 'primary' : ''}`} onClick={() => { setTab(value); setPage(1); }}>{label}</button>)}</div>
		{tab === 'reviews' && <><div className="ac-stat-grid"><Card title="待审核"><strong className="bv-stat">{data?.pending ?? '—'}</strong></Card><Card title="当前筛选"><strong className="bv-stat">{data?.total ?? '—'}</strong></Card></div><Toolbar result={`共 ${data?.total ?? 0} 条`}><select className="ac-select" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>{FILTERS.map(value => <option key={value} value={value}>{value ? statusMeta(value).label : '全部状态'}</option>)}</select><button className="ac-btn" onClick={load}>刷新</button></Toolbar></>}
		<ErrorBox msg={error} />{loading ? <Loading /> : tab === 'reviews' ? <Card pad={false}>{data?.items.length ? <div className="ac-table-scroll"><table className="ac-table"><thead><tr><th>用户</th><th>状态</th><th>提交时间</th><th>照片</th><th>认领</th><th>操作</th></tr></thead><tbody>{data.items.map(item => { const meta = statusMeta(item.status); return <tr key={item.id}><td><strong>{item.displayName || item.username || item.userId}</strong><small>{item.id}</small></td><td><Pill tone={meta.tone}>{meta.label}</Pill></td><td>{fmtFull(item.submittedAt)}</td><td>{item.photoCount}</td><td>{item.claimedBy || '未认领'}</td><td><button className="ac-btn" onClick={() => open(item)}>详情审核</button></td></tr>; })}</tbody></table></div> : <Empty text="没有匹配的认证申请" />}</Card> : tab === 'audit' ? <Card title="认证审计"><pre className="bv-audit">{JSON.stringify(audit?.items || [], null, 2)}</pre></Card> : config && <Card title="认证配置" description="配置由后端校验版本并记录审计。"><div className="bv-config"><label><input type="checkbox" checked={config.enabled} onChange={e => setConfig({ ...config, enabled: e.target.checked })} /> 启用认证</label><label>声明版本<input className="ac-input" value={config.declarationVersion} onChange={e => setConfig({ ...config, declarationVersion: e.target.value })} /></label><label>普通用户月额度<input className="ac-input" type="number" value={config.freeMonthlyLimit} onChange={e => setConfig({ ...config, freeMonthlyLimit: Number(e.target.value) })} /></label><label>赞助用户月额度<input className="ac-input" type="number" value={config.sponsorMonthlyLimit} onChange={e => setConfig({ ...config, sponsorMonthlyLimit: Number(e.target.value) })} /></label><label>拍摄会话有效期（秒）<input className="ac-input" type="number" value={config.captureTtlSeconds} onChange={e => setConfig({ ...config, captureTtlSeconds: Number(e.target.value) })} /></label><label>上传授权有效期（秒）<input className="ac-input" type="number" value={config.uploadTtlSeconds} onChange={e => setConfig({ ...config, uploadTtlSeconds: Number(e.target.value) })} /></label><label>单张照片上限（字节）<input className="ac-input" type="number" value={config.maxEvidenceSize} onChange={e => setConfig({ ...config, maxEvidenceSize: Number(e.target.value) })} /></label><label>修改理由<input className="ac-input" value={configReason} maxLength="500" onChange={e => setConfigReason(e.target.value)} /></label><button className="ac-btn primary" onClick={saveConfig}>保存配置</button></div></Card>}
		{tab !== 'config' && <Pagination page={page} totalPages={Math.max(1, Math.ceil(((tab === 'reviews' ? data?.total : audit?.total) || 0) / (tab === 'reviews' ? 20 : 50)))} total={(tab === 'reviews' ? data?.total : audit?.total) || 0} onChange={setPage} />}{selected && <Detail item={selected} onChanged={changed} onClose={() => setSelected(null)} />}
	</div></AdminLayout>;
}
