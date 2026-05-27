import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { verifyNBWState, isNBWBindState, isNBWMobileState, exchangeNBWCode, bindNBWAccount } from '../utils/nbwOAuth';

const NBW_LOGO = 'https://img.abdl-space.top/file/nbwlogo.png';

/**
 * NBWCallback — NewBabyWorld OAuth 回调页面
 * 根据 action 直接渲染不同内容，避免跨页面数据丢失
 */
export default function NBWCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();
  const toast = useToast();
  const handledRef = useRef(false);

  // 状态机：processing | choose | error
  const [state, setState] = useState('processing');
  const [nbwUser, setNbwUser] = useState(null); // { uid, username, avatar }
  const [nbwToken, setNbwToken] = useState(null);
  const [bindMode, setBindMode] = useState(null); // null | 'bind'
  const [loginVal, setLoginVal] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isFromMobile, setIsFromMobile] = useState(false);

  // 移动端跳转辅助
  const mobileRedirect = (path) => {
    window.location.href = `https://m.abdl-space.top${path}`;
  };

  useEffect(() => {
    if (handledRef.current) return;
    const code = searchParams.get('code');
    const oauthState = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      handledRef.current = true;
      toast.error('授权被取消或失败');
      navigate('/login', { replace: true });
      return;
    }
    if (!code) {
      handledRef.current = true;
      toast.error('缺少授权码');
      navigate('/login', { replace: true });
      return;
    }
    if (!verifyNBWState(oauthState)) {
      handledRef.current = true;
      navigate('/', { replace: true });
      return;
    }
    handledRef.current = true;

    const fromMobile = isNBWMobileState(oauthState);
    setIsFromMobile(fromMobile);

    // 绑定流程
    if (isNBWBindState(oauthState)) {
      (async () => {
        try {
          await bindNBWAccount(code);
          sessionStorage.setItem('nbw_just_bound', '1');
          toast.success('绑定成功');
          if (fromMobile) {
            mobileRedirect('/account');
          } else {
            navigate('/account', { replace: true });
          }
        } catch (e) {
          toast.error(e.message);
          setState('error');
        }
      })();
      return;
    }

    // 登录/选择流程
    (async () => {
      try {
        const result = await exchangeNBWCode(code);
        if (result.action === 'login') {
          toast.success('登录成功');
          if (fromMobile) {
            mobileRedirect('/');
          } else {
            navigate('/', { replace: true });
          }
        } else if (result.action === 'choose') {
          setNbwUser(result.nbw_user);
          setNbwToken(result.nbw_token);
          setState('choose');
        }
      } catch (e) {
        toast.error(e.message);
        setState('error');
      }
    })();
  }, []);

  // 绑定已有账号
  const handleBindExisting = async (e) => {
    e.preventDefault();
    if (!loginVal.trim() || !password) { toast.error('请填写账号和密码'); return; }
    setLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || '';
      const res = await fetch(`${API_BASE}/api/auth/nbw/bind-existing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ login: loginVal.trim(), password, nbw_token: nbwToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      sessionStorage.setItem('nbw_just_bound', '1');
      toast.success('绑定并登录成功');
      if (isFromMobile) {
        mobileRedirect('/');
      } else {
        window.location.href = '/';
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 注册新账号
  const handleRegister = () => {
    sessionStorage.setItem('nbw_register_data', JSON.stringify({
      nbw: true,
      nbw_token: nbwToken,
      username: nbwUser?.username || '',
    }));
    if (isFromMobile) {
      window.location.href = `https://m.abdl-space.top/register`;
    } else {
      navigate('/register', { replace: true });
    }
  };

  // 错误状态
  if (state === 'error') {
    return (
      <PageLayout hero={{ icon: 'fa-circle-xmark', title: '授权失败' }}>
        <div className="card max-w-md mx-auto text-center py-8">
          <i className="fa-solid fa-circle-xmark text-4xl mb-4" style={{ color: 'var(--danger)' }} />
          <p className="mb-4" style={{ color: 'var(--text-light)' }}>授权过程中出现问题</p>
          <Link to="/login" className="btn btn-primary">返回登录</Link>
        </div>
      </PageLayout>
    );
  }

  // 选择页面
  if (state === 'choose' && nbwUser) {
    // 绑定模式
    if (bindMode === 'bind') {
      return (
        <PageLayout hero={{ icon: 'fa-link', title: '绑定已有账号' }}>
          <div className="card max-w-md mx-auto">
            <div className="flex items-center gap-3 mb-4 p-3 rounded-lg" style={{ background: 'var(--input-bg)' }}>
              <img src={nbwUser.avatar || NBW_LOGO} alt="" className="w-8 h-8 rounded-full object-cover" />
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                登录后将自动绑定宝宝新天地账号 <strong style={{ color: 'var(--text)' }}>@{nbwUser.username}</strong>
              </div>
            </div>
            <form onSubmit={handleBindExisting}>
              <div className="mb-4 miui-input-group">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>用户名 / 邮箱</label>
                <input className="form-control" value={loginVal} onChange={e => setLoginVal(e.target.value)} placeholder="输入 ABDL Space 账号" autoFocus />
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
              <button onClick={() => setBindMode(null)} className="cursor-pointer" style={{ background: 'none', border: 'none', color: 'var(--link-color)' }}>← 返回选择</button>
              <Link to="/forgot-password" style={{ color: 'var(--link-color)' }}>忘记密码？</Link>
            </div>
          </div>
        </PageLayout>
      );
    }

    // 选择模式
    return (
      <PageLayout hero={{ icon: 'fa-right-to-bracket', title: '关联账户', subtitle: '宝宝新天地账号授权' }}>
        <div className="card max-w-md mx-auto">
          <div className="flex items-center gap-3 mb-5 p-3 rounded-lg" style={{ background: 'var(--input-bg)' }}>
            <img src={nbwUser.avatar || NBW_LOGO} alt="" className="w-10 h-10 rounded-full object-cover" />
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>@{nbwUser.username}</div>
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
              onClick={() => setBindMode('bind')}
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

  // 处理中
  return (
    <PageLayout hero={{ icon: 'fa-spinner', title: '授权中...' }}>
      <div className="card max-w-md mx-auto text-center py-8">
        <div className="spinner mx-auto mb-4" />
        <p style={{ color: 'var(--text-light)' }}>正在处理授权，请稍候...</p>
      </div>
    </PageLayout>
  );
}
