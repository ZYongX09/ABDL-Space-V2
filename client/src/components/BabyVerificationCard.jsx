import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { babyVerificationAPI } from '../babyVerification/api.js';
import { statusMeta } from '../babyVerification/model.js';

function formatTime(value) {
	if (!value) return '—';
	return new Date(typeof value === 'number' ? value * 1000 : value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

export default function BabyVerificationCard() {
	const [data, setData] = useState(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	useEffect(() => {
		const controller = new AbortController();
		babyVerificationAPI.me(controller.signal).then(setData).catch(e => { if (e.name !== 'AbortError') setError(e.message); }).finally(() => setLoading(false));
		return () => controller.abort();
	}, []);
	const meta = statusMeta(data?.status || 'pending');
	return <section className="baby-verification-card card">
		<header><div><i className="fa-solid fa-shield-heart" /><h2>宝宝认证</h2></div>{data && <span className={`verification-pill ${meta.tone}`}>{meta.label}</span>}</header>
		{loading ? <p><i className="fa-solid fa-spinner fa-spin" /> 正在读取认证状态…</p> : error ? <p className="verification-error">{error}</p> : <>
			<div className="verification-quota"><span>今日认证额度</span><strong>{data.quota.remaining} / {data.quota.limit}</strong><small>{data.quota.resetAt ? `重置：${formatTime(data.quota.resetAt)}` : '额度由服务器实时计算'}</small></div>
			{data.reason && <p className="verification-reason">审核说明：{data.reason}</p>}
			{data.certificates.length > 0 && <div className="verification-certificates"><h3>我的证书</h3>{data.certificates.map(cert => <Link key={cert.id} to={`/c/${encodeURIComponent(cert.token)}`} referrerPolicy="no-referrer"><span>{cert.id}</span><span>{statusMeta(cert.status).label} <i className="fa-solid fa-chevron-right" /></span></Link>)}</div>}
			<div className="verification-app-notice"><i className="fa-solid fa-mobile-screen-button" /><div><strong>请在 Android App 完成认证拍摄</strong><p>网页端不提供认证照片或相册上传入口。拍摄完成后，可在这里查看状态、额度和证书链接。</p></div></div>
		</>}
	</section>;
}
