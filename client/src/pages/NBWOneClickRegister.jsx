import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { NBWError, fetchNBWJSON, getNBWEndpointState, nbwEndpointKey, refreshNBWEndpoints, registrationNBWURL } from '../utils/nbwEndpoints.js';
import { useNBWEndpoints } from '../utils/useNBWEndpoints.js';

const NBW_LOGO = 'https://img.abdl-space.top/file/nbwlogo.png';

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
  const [iframeLoading, setIframeLoading] = useState(true);
  const timerRef = useRef(null);
  const phase3StartRef = useRef(null);
  const snapshotRef = useRef(null);
  const registrationRequest = useRef(null);
  const checkingRef = useRef(false);
  const mountedRef = useRef(false);
  const sessionGeneration = useRef(0);
  const identityRef = useRef('');
  const phaseRef = useRef(phase);
  identityRef.current = `${user?.id ?? ''}:${user?.email ?? ''}`;
  phaseRef.current = phase;
  const acquire = () => {
    const identity = identityRef.current, session = sessionGeneration.current, step = phaseRef.current;
    return () => mountedRef.current && identity === identityRef.current && session === sessionGeneration.current && step === phaseRef.current;
  };
  useEffect(() => {
    mountedRef.current = true;
    const invalidate = () => { sessionGeneration.current += 1; setError('当前账户或会话已变更，请重新打开注册页面。'); };
    window.addEventListener('auth-session-changing', invalidate);
    return () => { mountedRef.current = false; window.removeEventListener('auth-session-changing', invalidate); };
  }, []);
  const { endpoints } = useNBWEndpoints();
  const snapshotChanged = !!snapshotRef.current && nbwEndpointKey(snapshotRef.current) !== nbwEndpointKey(endpoints);
  const safeRegisterUrl = !snapshotChanged && registerUrl && endpoints?.remote_mode === 'full' ? registrationNBWURL(registerUrl, endpoints) : '';

  useEffect(() => {
    if (snapshotChanged) setError('宝宝新天地配置已更新，请返回后重新开始注册。');
  }, [snapshotChanged]);
  const ensureSnapshot = async () => {
    const current = await refreshNBWEndpoints({ force: true });
    if (!snapshotRef.current || nbwEndpointKey(current) !== nbwEndpointKey(snapshotRef.current)) throw new NBWError('NBW_ENDPOINT_CHANGED');
    if (current.remote_mode !== 'full') throw new NBWError('NBW_REMOTE_DISABLED');
  };

  const checkRegisterStatus = useCallback(async () => {
    if (checkingRef.current || !snapshotRef.current || error) return;
    checkingRef.current = true; setChecking(true);
    const current = acquire();
    try {
      await ensureSnapshot();
      if (!current()) return;
      const key = nbwEndpointKey(snapshotRef.current);
      const data = await fetchNBWJSON('/api/auth/nbw/check-register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user?.email }),
      });
      if (!current()) return;
      if (key !== nbwEndpointKey(getNBWEndpointState().endpoints)) throw new NBWError('NBW_ENDPOINT_CHANGED');
      if (data.registered) {
        await ensureSnapshot();
        if (!current()) return;
        await fetchNBWJSON('/api/auth/nbw/bind-by-email', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user?.email }),
        });
        if (!current()) return;
        if (key !== nbwEndpointKey(getNBWEndpointState().endpoints)) throw new NBWError('NBW_ENDPOINT_CHANGED');
        toast.success('绑定成功！'); navigate('/');
      }
    } catch (e) { if (current()) setError(e.message); }
    finally { checkingRef.current = false; if (current()) setChecking(false); }
  }, [user?.email, navigate, toast, error]);

  // 阶段1：获取注册链接
  useEffect(() => {
    if (phase !== 1 || !user?.email) return;
    let active = true;
    const fetchRegisterUrl = async () => {
      try {
        // StrictMode 的第二次 setup 只观察这次有限请求，不重复注册写入。
        const lease = acquire();
        const transaction = registrationRequest.current || (registrationRequest.current = (async () => {
          const current = await refreshNBWEndpoints({ force: true });
          if (!lease()) throw new NBWError('NBW_ENDPOINT_CHANGED');
          if (current.remote_mode !== 'full') throw new NBWError('NBW_REMOTE_DISABLED');
          snapshotRef.current = current;
          const data = await fetchNBWJSON('/api/auth/nbw/get-register-url', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email }),
          });
          if (!lease() || nbwEndpointKey(current) !== nbwEndpointKey(getNBWEndpointState().endpoints)) throw new NBWError('NBW_ENDPOINT_CHANGED');
          if (data.code !== 200 || !data.data?.register_url) throw new NBWError('NBW_INVALID_RESPONSE');
          return registrationNBWURL(data.data.register_url, current);
        })());
        const url = await transaction;
        if (active && lease()) { setRegisterUrl(url); setPhase(2); }
      } catch (e) { if (active && mountedRef.current) setError(e.message); }
      finally { if (active && mountedRef.current) setLoading(false); }
    };
    void fetchRegisterUrl();
    return () => { active = false; };
  }, [phase, user?.email]);

  // 阶段3：轮询检测注册状态（渐进加速：0-10s→10s一次，10-20s→5s一次，20s+→3s一次）
  useEffect(() => {
    if (phase !== 3 || error || snapshotChanged) return;
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
  }, [phase, checkRegisterStatus, error, snapshotChanged]);

  if (error && phase !== 1) return (
    <PageLayout hero={{ icon: 'fa-circle-xmark', title: '注册操作已停止' }}>
      <div className="card max-w-md mx-auto text-center py-8">
        <p role="alert">{error}</p>
        <button className="btn btn-outline mt-3" onClick={() => navigate('/nbw-bind-guide')}>返回后重新开始</button>
      </div>
    </PageLayout>
  );

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
            disabled={!safeRegisterUrl}
            onClick={async () => {
              const current = acquire();
              try { await ensureSnapshot(); if (current()) setPhase(3); } catch (e) { if (current()) setError(e.message); }
            }}
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

      {/* iframe 加载动画 */}
      {iframeLoading && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface)',
        }}>
          <i className="fa-solid fa-circle-notch fa-spin text-3xl mb-3" style={{ color: 'var(--primary)' }} />
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>正在加载宝宝新天地注册页面...</span>
        </div>
      )}

      {/* iframe 主体 */}
      <iframe
        src={safeRegisterUrl || undefined}
        referrerPolicy="no-referrer"
        style={{ flex: 1, border: 'none', width: '100%', display: iframeLoading ? 'none' : 'block' }}
        title="宝宝新天地 注册"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onLoad={() => setIframeLoading(false)}
      />
    </div>
  );
}
