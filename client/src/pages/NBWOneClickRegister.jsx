import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const NBW_LOGO = 'https://img.abdl-space.top/file/nbwlogo.png';
const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * NBWOneClickRegister — 一键注册 NBW 新账号页面
 * 阶段1: 加载中 → 获取注册链接
 * 阶段2: 跳转补充信息
 * 阶段3: iframe + 轮询检测注册状态
 */
export default function NBWOneClickRegister() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [phase, setPhase] = useState(1); // 1=加载中, 2=跳转补充信息, 3=iframe
  const [registerUrl, setRegisterUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const timerRef = useRef(null);
  const phase3StartRef = useRef(null);

  const checkRegisterStatus = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/nbw/check-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('abdl_token') || ''}`,
        },
        credentials: 'include',
        body: JSON.stringify({ email: user?.email }),
      });
      const data = await res.json();
      if (data.registered) {
        // 注册成功，直接绑定
        const bindRes = await fetch(`${API_BASE}/api/auth/nbw/bind-by-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('abdl_token') || ''}`,
          },
          credentials: 'include',
          body: JSON.stringify({ email: user?.email }),
        });
        const bindData = await bindRes.json();
        if (bindRes.ok) {
          toast.success('绑定成功！');
          navigate('/');
        } else {
          toast.error(bindData.error || '绑定失败');
        }
      }
    } catch (e) {
      console.error('Check register status failed:', e);
    } finally {
      setChecking(false);
    }
  }, [user, navigate, toast, checking]);

  // 阶段1：获取注册链接
  useEffect(() => {
    if (phase !== 1 || !user?.email) return;

    const fetchRegisterUrl = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/nbw/get-register-url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('abdl_token') || ''}`,
          },
          credentials: 'include',
          body: JSON.stringify({ email: user.email }),
        });
        const data = await res.json();
        if (data.code === 200 && data.data?.register_url) {
          setRegisterUrl(data.data.register_url);
          setPhase(2);
        } else {
          setError(data.msg || '获取注册链接失败');
        }
      } catch (e) {
        setError('网络错误: ' + e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRegisterUrl();
  }, [phase, user]);

  // 阶段3：轮询检测注册状态（渐进加速：0-10s→10s一次，10-20s→5s一次，20s+→3s一次）
  useEffect(() => {
    if (phase !== 3) return;
    phase3StartRef.current = Date.now();

    const poll = () => {
      const elapsed = (Date.now() - phase3StartRef.current) / 1000;
      let interval = 10000;
      if (elapsed >= 20) interval = 3000;
      else if (elapsed >= 10) interval = 5000;

      checkRegisterStatus();
      timerRef.current = setTimeout(poll, interval);
    };

    timerRef.current = setTimeout(poll, 10000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, checkRegisterStatus]);

  // 阶段1：加载中
  if (phase === 1) {
    return (
      <PageLayout hero={{ icon: 'fa-spinner fa-spin', title: '一键注册', subtitle: '正在为您创建宝宝新天地账号...' }}>
        <div className="card max-w-md mx-auto text-center py-8">
          <div className="mb-4">
            <i className="fa-solid fa-circle-notch fa-spin text-4xl" style={{ color: 'var(--primary)' }} />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-light)' }}>
            正在向宝宝新天地获取注册链接...
          </p>
          {error && (
            <div className="mt-4">
              <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>
              <button className="btn btn-outline mt-3" onClick={() => navigate('/nbw-bind-guide')}>
                返回
              </button>
            </div>
          )}
        </div>
      </PageLayout>
    );
  }

  // 阶段2：跳转补充信息
  if (phase === 2) {
    return (
      <PageLayout hero={{ icon: 'fa-circle-check', title: '第一步已完成' }}>
        <div className="card max-w-md mx-auto text-center py-8">
          <div className="mb-4">
            <img src={NBW_LOGO} alt="" className="w-16 h-16 mx-auto rounded-xl object-contain" />
          </div>
          <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>
            第一步已完成
          </h3>
          <p className="text-sm mb-6" style={{ color: 'var(--text-light)' }}>
            但您需要前往宝宝新天地补充个人信息
          </p>
          <button
            className="btn btn-primary w-full"
            onClick={() => setPhase(3)}
          >
            <i className="fa-solid fa-arrow-right mr-2" />
            去宝宝新天地补充信息
          </button>
          <div className="mt-4">
            <button
              className="text-xs cursor-pointer"
              style={{ background: 'none', border: 'none', color: 'var(--link-color)' }}
              onClick={() => navigate('/nbw-bind-guide')}
            >
              ← 返回
            </button>
          </div>
        </div>
      </PageLayout>
    );
  }

  // 阶段3：iframe + 轮询
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* 顶部横栏 */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface)', flexShrink: 0,
        }}
      >
        <button
          onClick={() => setPhase(2)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', fontSize: 14 }}
        >
          <i className="fa-solid fa-arrow-left mr-2" />
          返回
        </button>
        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          宝宝新天地注册
        </span>
        <button
          onClick={checkRegisterStatus}
          disabled={checking}
          className="btn btn-primary btn-sm"
          style={{ fontSize: 12, padding: '4px 12px' }}
        >
          {checking ? <i className="fa-solid fa-spinner fa-spin" /> : '完成'}
        </button>
      </div>

      {/* iframe 主体 */}
      <iframe
        src={registerUrl}
        style={{ flex: 1, border: 'none', width: '100%' }}
        title="NBW 注册"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}
