import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useVerifyModal — 验证码弹窗 Hook（使用 ABDLCaptcha 嵌入式 SDK）
 *
 * 流程:
 *   1. trigger(onPass) → 弹出弹窗
 *   2. ABDLCaptcha.render() 渲染验证组件
 *   3. 用户完成验证 → onSuccess(token)
 *   4. 存 token → 执行 onPass
 *
 * 返回: { trigger, VerifyModal, captchaToken }
 */
export function useVerifyModal() {
  const [show, setShow] = useState(false);
  const [animState, setAnimState] = useState('hidden');
  const [sdkReady, setSdkReady] = useState(false);
  const actionRef = useRef(null);
  const tokenRef = useRef(null);
  const containerRef = useRef(null);
  const rendererRef = useRef(null);

  // 检测 SDK 是否加载
  useEffect(() => {
    if (window.ABDLCaptcha) { setSdkReady(true); return; }
    const check = setInterval(() => {
      if (window.ABDLCaptcha) { setSdkReady(true); clearInterval(check); }
    }, 200);
    return () => clearInterval(check);
  }, []);

  const cleanup = useCallback(() => {
    setShow(false); setAnimState('hidden');
    actionRef.current = null;
    if (containerRef.current) containerRef.current.innerHTML = '';
  }, []);

  const trigger = useCallback((onPass) => {
    actionRef.current = onPass;
    tokenRef.current = null;
    setShow(true);
    setAnimState('entering');
    requestAnimationFrame(() => setAnimState('visible'));
  }, []);

  // 弹窗显示后渲染 SDK
  useEffect(() => {
    if (!show || !sdkReady || !containerRef.current) return;

    // 清空容器
    containerRef.current.innerHTML = '';

    // 从环境变量或配置获取 API Key
    const apiKey = window.__ABDL_CAPTCHA_KEY || '';

    try {
      console.log('[VerifyModal] rendering ABDLCaptcha, apiKey:', apiKey ? apiKey.slice(0, 11) + '...' : 'EMPTY');
      rendererRef.current = window.ABDLCaptcha.render(containerRef.current, {
        apiKey,
        onSuccess: (token) => {
          console.log('[VerifyModal] onSuccess, token:', token ? token.slice(0, 20) + '...' : 'EMPTY');
          tokenRef.current = token;
          const action = actionRef.current;
          console.log('[VerifyModal] action exists:', !!action);
          setTimeout(() => {
            setAnimState('exiting');
            setTimeout(() => {
              setShow(false);
              setAnimState('hidden');
              if (containerRef.current) containerRef.current.innerHTML = '';
              console.log('[VerifyModal] calling action');
              if (action) { action(); actionRef.current = null; }
            }, 250);
          }, 600);
        },
        onError: (err) => {
          console.error('Captcha error:', err);
        },
      });
    } catch (err) {
      console.error('ABDLCaptcha.render failed:', err);
    }
  }, [show, sdkReady, cleanup]);

  const handleClose = useCallback(() => {
    setAnimState('exiting');
    setTimeout(() => cleanup(), 200);
  }, [cleanup]);

  if (!show) return { trigger, VerifyModal: null, captchaToken: tokenRef };

  const backdropStyle = {
    position: 'fixed', inset: 0, zIndex: 400,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(2px)',
    opacity: animState === 'entering' ? 0 : animState === 'exiting' ? 0 : 1,
    transition: 'opacity 0.25s ease',
  };

  const cardStyle = {
    background: 'var(--bg-card)', color: 'var(--text)',
    borderRadius: '1.25rem', padding: '24px', maxWidth: 420, width: '90%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    transform: animState === 'entering' ? 'scale(0.9) translateY(16px)' : animState === 'exiting' ? 'scale(0.95) translateY(8px)' : 'scale(1) translateY(0)',
    opacity: animState === 'entering' ? 0 : animState === 'exiting' ? 0 : 1,
    transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease',
  };

  const VerifyModal = (
    <div style={backdropStyle} onClick={handleClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-shield-halved mr-2" style={{ color: 'var(--primary-dark)' }} />
            安全验证
          </h3>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div style={{ border: '1.5px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', padding: '12px' }}>
          <div ref={containerRef} />
        </div>
      </div>
    </div>
  );

  return { trigger, VerifyModal, captchaToken: tokenRef };
}
