import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/**
 * useVerifyModal — 验证码弹窗 Hook（支持 Turnstile + Quantum 混合验证）
 *
 * 流程:
 *   1. trigger(onPass) → 调用 /api/captcha/risk 获取风险等级
 *   2. low risk:  随机选择 turnstile 或 quantum
 *   3. high risk: 先 turnstile → 滑动切换 → quantum
 *   4. 验证通过 → 执行 onPass
 */
export function useVerifyModal() {
  const [show, setShow] = useState(false);
  const [animState, setAnimState] = useState('hidden');
  const [phase, setPhase] = useState('loading'); // loading | turnstile | quantum | done
  const [flow, setFlow] = useState(null);        // 'turnstile' | 'quantum' | 'both'
  const [risk, setRisk] = useState(null);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  // both 模式：卡片滑动位置 (0 = Turnstile, 1 = Quantum)
  const [slideIndex, setSlideIndex] = useState(0);

  const actionRef = useRef(null);
  const tokenRef = useRef(null);
  const turnstileSessionRef = useRef(null);
  const turnstileWidgetRef = useRef(null);
  const quantumContainerRef = useRef(null);
  const quantumRendererRef = useRef(null);
  const sdkReadyRef = useRef(!!window.ABDLCaptcha);

  // 检测 Quantum SDK 加载
  useEffect(() => {
    if (window.ABDLCaptcha) { sdkReadyRef.current = true; return; }
    const check = setInterval(() => {
      if (window.ABDLCaptcha) { sdkReadyRef.current = true; clearInterval(check); }
    }, 200);
    const timeout = setTimeout(() => { clearInterval(check); sdkReadyRef.current = true; }, 10000);
    return () => { clearInterval(check); clearTimeout(timeout); };
  }, []);

  // 加载 Turnstile 脚本
  const ensureTurnstile = useCallback(() => {
    return new Promise((resolve) => {
      if (window.turnstile) { resolve(true); return; }
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
  }, []);

  const cleanup = useCallback(() => {
    setShow(false); setAnimState('hidden');
    setPhase('loading'); setFlow(null); setRisk(null); setError(null);
    setSlideIndex(0);
    actionRef.current = null;
    turnstileSessionRef.current = null;
    if (turnstileWidgetRef.current) {
      try { window.turnstile?.remove(turnstileWidgetRef.current); } catch {}
      turnstileWidgetRef.current = null;
    }
    if (quantumRendererRef.current && typeof quantumRendererRef.current.destroy === 'function') {
      try { quantumRendererRef.current.destroy(); } catch {}
    }
    quantumRendererRef.current = null;
    if (quantumContainerRef.current) quantumContainerRef.current.textContent = '';
  }, []);

  const trigger = useCallback((onPass) => {
    actionRef.current = onPass;
    tokenRef.current = null;
    setShow(true);
    setAnimState('entering');
    setError(null);
    setSlideIndex(0);
    requestAnimationFrame(() => setAnimState('visible'));
  }, []);

  // 弹窗显示后启动流程
  useEffect(() => {
    if (!show) return;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/captcha/risk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) throw new Error('Risk assessment failed');
        const data = await res.json();
        setRisk(data.risk);
        setFlow(data.flow);

        if (data.flow === 'turnstile' || data.flow === 'both') {
          setPhase('turnstile');
        } else {
          setPhase('quantum');
        }
      } catch (err) {
        setError('安全验证服务异常，请刷新重试');
      }
    })();
  }, [show, retryCount]);

  // Turnstile 渲染
  useEffect(() => {
    if (phase !== 'turnstile') return;

    (async () => {
      const ok = await ensureTurnstile();
      if (!ok) { setError('Turnstile 加载失败'); return; }

      try {
        const res = await fetch(`${API_BASE}/api/captcha/challenge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'turnstile' }),
        });
        if (!res.ok) throw new Error('Challenge failed');
        const data = await res.json();
        turnstileSessionRef.current = data.session_id;
      } catch {
        setError('创建验证失败'); return;
      }

      const container = document.getElementById('turnstile-container');
      if (!container) return;

      const siteKey = window.__TURNSTILE_SITE_KEY || '';
      if (!siteKey) { setError('Turnstile 未配置'); return; }

      try {
        turnstileWidgetRef.current = window.turnstile.render(container, {
          sitekey: siteKey,
          callback: async (token) => {
            try {
              const res = await fetch(`${API_BASE}/api/captcha/turnstile/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  session_id: turnstileSessionRef.current,
                  token,
                }),
              });
              const result = await res.json();
              if (result.success) {
                tokenRef.current = token;
                if (flow === 'both') {
                  // 滑动切换到 Quantum 卡片
                  setSlideIndex(1);
                  setTimeout(() => setPhase('quantum'), 400);
                } else {
                  finishVerification();
                }
              } else {
                setError(result.locked ? '验证次数过多，请稍后再试' : '验证失败，请重试');
              }
            } catch {
              setError('验证请求失败');
            }
          },
          'error-callback': () => setError('Turnstile 加载异常'),
          theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
        });
      } catch {
        setError('Turnstile 渲染失败');
      }
    })();
  }, [phase, flow, ensureTurnstile]);

  // Quantum 渲染
  useEffect(() => {
    if (phase !== 'quantum') return;
    if (!sdkReadyRef.current || !window.ABDLCaptcha) return;
    if (!quantumContainerRef.current) return;

    quantumContainerRef.current.textContent = '';

    const apiKey = window.__ABDL_CAPTCHA_KEY || '';

    try {
      quantumRendererRef.current = window.ABDLCaptcha.render(quantumContainerRef.current, {
        apiKey,
        onSuccess: (token) => {
          tokenRef.current = token;
          finishVerification();
        },
        onError: () => setError('验证失败，请重试'),
      });
    } catch {
      setError('验证组件渲染失败');
    }
  }, [phase]);

  const finishVerification = useCallback(() => {
    setPhase('done');
    const action = actionRef.current;
    setTimeout(() => {
      setAnimState('exiting');
      setTimeout(() => {
        setShow(false);
        setAnimState('hidden');
        cleanup();
        if (action) { action(); actionRef.current = null; }
      }, 250);
    }, 600);
  }, [cleanup]);

  const handleClose = useCallback(() => {
    setAnimState('exiting');
    setTimeout(() => cleanup(), 200);
  }, [cleanup]);

  if (!show) return { trigger, VerifyModal: null, captchaToken: tokenRef };

  /* ---- 样式 ---- */
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
    overflow: 'hidden',
  };

  // both 模式卡片滑动容器
  const sliderStyle = flow === 'both' ? {
    display: 'flex',
    width: '200%',
    transform: `translateX(-${slideIndex * 50}%)`,
    transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  } : null;

  const slideCardStyle = flow === 'both' ? {
    width: '50%',
    flexShrink: 0,
    paddingRight: slideIndex === 0 ? '12px' : '0',
    paddingLeft: slideIndex === 1 ? '12px' : '0',
  } : null;

  const phaseLabel = {
    loading: '正在评估安全等级...',
    turnstile: flow === 'both' ? '第 1 步：请完成人机验证' : '请完成人机验证',
    quantum: flow === 'both' ? '第 2 步：请完成安全验证' : '请完成安全验证',
    done: '验证通过 ✓',
  };

  const VerifyModal = (
    <div style={backdropStyle} onClick={handleClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-shield-halved mr-2" style={{ color: 'var(--primary-dark)' }} />
            安全验证
            {risk && <span style={{ fontSize: '.7rem', color: 'var(--text-light)', marginLeft: '0.5rem' }}>({risk === 'high' ? '高' : '低'}风险)</span>}
          </h3>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* 进度条 (both 模式) */}
        {flow === 'both' && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
            <div style={{
              flex: 1, height: 3, borderRadius: 2,
              background: slideIndex >= 0 ? 'var(--primary)' : 'var(--border)',
              transition: 'background 0.3s',
            }} />
            <div style={{
              flex: 1, height: 3, borderRadius: 2,
              background: slideIndex >= 1 ? 'var(--primary)' : 'var(--border)',
              transition: 'background 0.3s',
            }} />
          </div>
        )}

        <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          {error || phaseLabel[phase] || '正在加载...'}
        </p>

        {/* both 模式：滑动卡片容器 */}
        {flow === 'both' ? (
          <div style={{ overflow: 'hidden', borderRadius: '1rem' }}>
            <div style={sliderStyle}>
              {/* Turnstile 卡片 */}
              <div style={slideCardStyle}>
                <div style={{ border: '1.5px solid var(--border)', borderRadius: '1rem', padding: '12px', minHeight: 80 }}>
                  <div id="turnstile-container" style={{ display: 'flex', justifyContent: 'center' }} />
                </div>
              </div>
              {/* Quantum 卡片 */}
              <div style={slideCardStyle}>
                <div style={{ border: '1.5px solid var(--border)', borderRadius: '1rem', padding: '12px', minHeight: 80 }}>
                  <div ref={quantumContainerRef} />
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* 单模式：普通容器 */
          <div style={{ border: '1.5px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', padding: '12px', minHeight: 80 }}>
            {phase === 'turnstile' && <div id="turnstile-container" style={{ display: 'flex', justifyContent: 'center' }} />}
            {phase === 'quantum' && <div ref={quantumContainerRef} />}
            {phase === 'loading' && (
              <div className="flex items-center justify-center py-6">
                <div className="spinner mr-2" />
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>加载验证组件...</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <button
            className="btn btn-sm btn-primary"
            style={{ marginTop: '0.75rem', width: '100%' }}
            onClick={() => { setError(null); setRetryCount(c => c + 1); }}
          >
            重试
          </button>
        )}
      </div>
    </div>
  );

  return { trigger, VerifyModal, captchaToken: tokenRef };
}
