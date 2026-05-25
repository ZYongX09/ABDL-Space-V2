import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { verifyNBWState, isNBWBindState, exchangeNBWCode, bindNBWAccount } from '../utils/nbwOAuth';

/**
 * NBWCallback — NewBabyWorld OAuth 回调页面
 *
 * 流程：
 * 1. 验证 state 防 CSRF
 * 2. 将 code 发送给后端换取 token + 用户信息
 * 3. 后端返回 { action: 'login', token, user } 或 { action: 'register', nbw_user }
 * 4. login → 直接登录跳转首页
 * 5. register → 跳转注册页，预填邮箱/用户名
 */
export default function NBWCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login: authLogin } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('processing'); // processing | error
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
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

    if (!verifyNBWState(state)) {
      // state 已被消费或无效，导航离开
      handledRef.current = true;
      navigate('/', { replace: true });
      return;
    }
    handledRef.current = true;

    // 绑定流程
    if (isNBWBindState(state)) {
      (async () => {
        try {
          await bindNBWAccount(code);
          sessionStorage.setItem('nbw_just_bound', '1');
          toast.success('绑定成功');
          navigate('/account', { replace: true });
        } catch (e) {
          toast.error(e.message);
          setStatus('error');
        }
      })();
      return;
    }

    // 登录/注册流程

    (async () => {
      try {
        const result = await exchangeNBWCode(code);

        if (result.action === 'login') {
          // 已注册用户，直接登录
          toast.success('登录成功');
          navigate('/', { replace: true });
        } else if (result.action === 'choose') {
          // 未绑定，让用户选择绑定已有或注册新账号
          navigate('/auth/nbw/choose', {
            replace: true,
            state: {
              nbw_code: result.nbw_code,
              nbw_user: result.nbw_user,
            },
          });
        } else if (result.action === 'register') {
          // 兼容旧接口
          const nbwUser = result.nbw_user;
          navigate('/register', {
            replace: true,
            state: {
              nbw: true,
              nbw_code: result.nbw_code,
              email: nbwUser.email || '',
              username: nbwUser.username || '',
            },
          });
        }
      } catch (e) {
        toast.error(e.message);
        setStatus('error');
      }
    })();
  }, [searchParams, navigate, toast]);

  if (status === 'error') {
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

  return (
    <PageLayout hero={{ icon: 'fa-spinner', title: '授权中...' }}>
      <div className="card max-w-md mx-auto text-center py-8">
        <div className="spinner mx-auto mb-4" />
        <p style={{ color: 'var(--text-light)' }}>正在处理授权，请稍候...</p>
      </div>
    </PageLayout>
  );
}
