import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { babyVerificationAPI } from '../babyVerification/api.js';
import { classifyVerificationOrigin, identifier, statusMeta } from '../babyVerification/model.js';

function formatTime(value) {
	if (!value) return '—';
	return new Date(typeof value === 'number' ? value * 1000 : value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

export default function CertificateVerify() {
	const { token = '' } = useParams();
	const [result, setResult] = useState(null);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(true);
	const [copied, setCopied] = useState('');
	const canonicalUrl = useMemo(() => `https://abdl-space.top/c/${encodeURIComponent(token)}`, [token]);
	const origin = classifyVerificationOrigin(window.location.href, token);
	const official = origin !== 'unofficial';

	useEffect(() => {
		document.querySelector('meta[name="robots"]')?.remove();
		const robots = document.createElement('meta');
		robots.name = 'robots'; robots.content = 'noindex, nofollow, noarchive'; document.head.appendChild(robots);
		const controller = new AbortController();
		setLoading(true); setError(''); setResult(null);
		try { identifier(token, '证书令牌'); } catch { setLoading(false); setResult({ status: 'unknown', certificate: null }); return () => robots.remove(); }
		babyVerificationAPI.verify(token, controller.signal).then(setResult).catch(loadError => {
			if (loadError.name !== 'AbortError') setError(loadError.message || '网络连接失败，请稍后重试');
		}).finally(() => setLoading(false));
		return () => { controller.abort(); robots.remove(); };
	}, [token]);

	const copy = async (value, key) => {
		try { await navigator.clipboard.writeText(value); setCopied(key); setTimeout(() => setCopied(''), 1800); } catch { setCopied('fail'); }
	};
	const meta = statusMeta(result?.status || 'unknown');

	return <main className="certificate-page">
		<section className="certificate-card" aria-live="polite">
			<div className="certificate-brand"><i className="fa-solid fa-shield-heart" /> ABDL Space 官方认证</div>
			{loading ? <div className="certificate-loading"><i className="fa-solid fa-spinner fa-spin" /><p>正在实时核验证书状态…</p></div> : error ? <>
				<div className="certificate-status network"><i className="fa-solid fa-cloud-arrow-down" /><h1>暂时无法核验</h1><p>{error}</p></div>
				<button className="btn btn-primary" onClick={() => window.location.reload()}>重新核验</button>
			</> : <>
					<div className={`certificate-status ${meta.tone}`}><i className={`fa-solid ${meta.icon}`} /><h1>{meta.label}</h1>
						<p>{result.status === 'active' ? '此证书由 ABDL Space 签发，当前状态有效。' : result.status === 'revoked' ? '此证书已被官方吊销，请勿继续作为有效凭证使用。' : result.status === 'superseded' ? '此证书已被补发证书替代，旧证书不再有效。' : '未查到对应证书，请核对二维码或链接是否完整。'}</p>
					</div>
					{result.certificate && <dl className="certificate-details">
						{result.certificate.id && <div><dt>证书编号</dt><dd>{result.certificate.id}</dd></div>}
						{(result.certificate.displayName || result.certificate.username) && <div><dt>认证用户</dt><dd>{result.certificate.displayName || result.certificate.username}</dd></div>}
						{result.certificate.generation != null && <div><dt>证书代次</dt><dd>{result.certificate.generation}</dd></div>}
						{result.certificate.issuedAt && <div><dt>签发时间</dt><dd>{formatTime(result.certificate.issuedAt)}</dd></div>}
						{result.status === 'revoked' && <div><dt>吊销时间</dt><dd>{formatTime(result.certificate.revokedAt)}</dd></div>}
						{result.status === 'revoked' && <div><dt>吊销原因</dt><dd>{result.certificate.revokeReason || '未提供'}</dd></div>}
						{result.status === 'superseded' && <div><dt>替代时间</dt><dd>{formatTime(result.certificate.supersededAt)}</dd></div>}
					</dl>}
			</>}
			<div className="certificate-qr"><QRCodeSVG value={canonicalUrl} size={152} level="M" marginSize={2} /><div><strong>官方验真地址</strong><code>{canonicalUrl}</code><button className="btn btn-outline btn-sm" onClick={() => copy(canonicalUrl, 'url')}>{copied === 'url' ? '已复制' : '复制链接'}</button></div></div>
				<div className={`certificate-origin ${official ? 'official' : 'warning'}`}><i className={`fa-solid ${official ? 'fa-lock' : 'fa-triangle-exclamation'}`} /><span>{origin === 'canonical' ? '当前为主站规范验真地址 abdl-space.top。' : origin === 'mobile' ? '当前为移动版官方验真入口 m.abdl-space.top；二维码与复制链接统一使用主站规范地址。' : '当前地址未通过官方验真地址校验，请复制上方主站规范地址重新核验。'}</span></div>
				<p className="certificate-privacy">本页面不会将证书令牌发送给第三方脚本，也不会缓存核验结果。</p>
				<a href="/" rel="noreferrer" className="certificate-home">返回 ABDL Space</a>
		</section>
	</main>;
}
