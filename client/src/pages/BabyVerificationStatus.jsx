import { Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout.jsx';
import BabyVerificationCard from '../components/BabyVerificationCard.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function BabyVerificationStatus() {
	const { user, loading } = useAuth();
	return <PageLayout hero={{ icon: 'fa-shield-heart', title: '宝宝认证', subtitle: '查看认证审核状态、今日额度与已签发证书' }}>
		{loading ? <div className="card text-center"><i className="fa-solid fa-spinner fa-spin" /> 正在验证登录状态…</div> : user ? <BabyVerificationCard /> : <section className="card text-center"><h2>登录后查看认证信息</h2><p style={{ color: 'var(--text-muted)', margin: '10px 0 16px' }}>证书公开验真无需登录；个人认证状态与额度需要当前账号。</p><Link className="btn btn-primary" to="/login">前往登录</Link></section>}
	</PageLayout>;
}
