import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { exchangeNBWCode } from '../utils/nbwOAuth';

const NBW_LOGO = 'https://img.abdl-space.top/file/nbwlogo.png';

/**
 * NBWChoicePage — NBW 用户未绑定时的选择页
 * 选择：绑定已有 ABDL Space 账号 / 注册新账号
 */
export default function NBWChoicePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login: authLogin } = useAuth();
  const toast = useToast();

  // 从 sessionStorage 读取 OAuth 数据（比 location.state 更可靠）
  const stored = (() => { try { return JSON.parse(sessionStorage.getItem('nbw_oauth_data') || '{}'); } catch { return {}; } })();
  const nbw_token = stored.nbw_token;
  const nbw_user = stored.nbw_user;
  // 读取后清除
  if (stored.nbw_token) sessionStorage.removeItem('nbw_oauth_data');

  const [mode, setMode] = useState(null); // null | 'bind' | 'register'
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (!nbw_token || !nbw_user) {
    return (
      <PageLayout hero={{ icon: 'fa-circle-xmark', title: '参数错误' }}>
        <div className="card max-w-md mx-auto text-center py-8">
          <p className="mb-4" style={{ color: 'var(--text-light)' }}>缺少授权信息，请重新登录</p>
          <Link to="/login" className="btn btn-primary">返回登录</Link>
        </div>
      </PageLayout>
    );
  }

  const handleBindExisting = async (e) => {
    e.preventDefault();
    if (!login.trim() || !password) { toast.error('请填写账号和密码'); return; }
    setLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || '';
      const res = await fetch(`${API_BASE}/api/auth/nbw/bind-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ login: login.trim(), password, nbw_token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      await authLogin({ login: login.trim(), password });
      toast.success('绑定并登录成功');
      window.location.href = '/';
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = () => {
    sessionStorage.setItem('nbw_register_data', JSON.stringify({
      nbw: true,
      nbw_token,
      username: nbw_user.username || '',
    }));
    navigate('/register', { replace: true });
  };

  // 选择页面
  if (!mode) {
    return (
      <PageLayout hero={{ icon: 'fa-right-to-bracket', title: '关联账户', subtitle: '宝宝新天地账号授权' }}>
        <div className="card max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-5 p-3 rounded-lg" style={{ background: 'var(--input-bg)' }}>
            <img src={nbw_user.avatar || NBW_LOGO} alt="" className="w-10 h-10 rounded-full object-cover" />
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>@{nbw_user.username}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>宝宝新天地账号</div>
            </div>
          </div>

          <p className="text-sm mb-5" style={{ color: 'var(--text-light)' }}>
            该宝宝新天地账号尚未关联 ABDL Space 账户，请选择操作方式：
          </p>

          <div className="space-y-3">
            <button
              className="w-full flex items-center gap-3 p-4 rounded-lg transition-all hover:opacity-80"
              style={{ background: 'var(--primary-light)', border: '1px solid var(--primary)', cursor: 'pointer' }}
              onClick={() => setMode('bind')}
            >
              <i className="fa-solid fa-link text-lg" style={{ color: 'var(--primary-dark)' }} />
              <div className="text-left">
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>绑定已有账号</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>用已有的 ABDL Space 账号登录并关联</div>
              </div>
            </button>

            <button
              className="w-full flex items-center gap-3 p-4 rounded-lg transition-all hover:opacity-80"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', cursor: 'pointer' }}
              onClick={handleRegister}
            >
              <i className="fa-solid fa-user-plus text-lg" style={{ color: 'var(--text-muted)' }} />
              <div className="text-left">
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>注册新账号</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>创建新的 ABDL Space 账号并关联</div>
              </div>
            </button>
          </div>

          <div className="mt-5 text-center">
            <Link to="/login" className="text-xs" style={{ color: 'var(--link-color)' }}>返回登录</Link>
          </div>
        </div>
      </PageLayout>
    );
  }

  // 绑定已有账号
  return (
    <PageLayout hero={{ icon: 'fa-link', title: '绑定已有账号' }}>
      <div className="card max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg" style={{ background: 'var(--input-bg)' }}>
          <img src={nbw_user.avatar || NBW_LOGO} alt="" className="w-8 h-8 rounded-full object-cover" />
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            登录后将自动绑定宝宝新天地账号 <strong style={{ color: 'var(--text)' }}>@{nbw_user.username}</strong>
          </div>
        </div>

        <form onSubmit={handleBindExisting}>
          <div className="mb-4 miui-input-group">
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>用户名 / 邮箱</label>
            <input className="form-control" value={login} onChange={e => setLogin(e.target.value)} placeholder="输入 ABDL Space 账号" autoFocus />
          </div>
          <div className="mb-5 miui-input-group">
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>密码</label>
            <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} placeholder="输入密码" />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? <i className="fa-solid fa-spinner fa-spin mr-2" /> : <i className="fa-solid fa-link mr-2" />}
            登录并绑定
          </button>
        </form>

        <div className="mt-4 flex justify-between text-xs">
          <button onClick={() => setMode(null)} className="cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--link-color)' }}>← 返回选择</button>
          <Link to="/forgot-password" style={{ color: 'var(--link-color)' }}>忘记密码？</Link>
        </div>
      </div>
    </PageLayout>
  );
}
