import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/**
 * useVerifyModal — 验证码弹窗 Hook（支持 Turnstile + Quantum 混合验证）
 *
 * 流程:
 *   1. trigger(onPass) → 调用 /api/captcha/risk 获取风险等级
 *   2. low risk:  随机选择 turnstile 或 quantum
 *   3. high risk: 先 quantum（灰色边框）→ 二次验证 turnstile（黄色闪烁边框）→ 完成（绿色边框）
 *   4. 验证通过 → 执行 onPass
 */
export function useVerifyModal() {
  const [show, setShow] = useState(false);
  const [animState, setAnimState] = useState('hidden');
  const [phase, setPhase] = useState('loading'); // loading | quantum | transition | turnstile | done
  const [flow, setFlow] = useState(null);        // 'turnstile' | 'quantum' | 'both'
  const [risk, setRisk] = useState(null);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const actionRef = useRef(null);
  const tokenRef = useRef(null);
  const turnstileSessionRef = useRef(null);
  const turnstileWidgetRef = useRef(null);
  const quantumContainerRef = useRef(null);
  const turnstileBothContainerRef = useRef(null);
  const quantumRendererRef = useRef(null);
  const sdkReadyRef = useRef(!!window.ABDLCaptcha);

  useEffect(() => {
    if (window.ABDLCaptcha) { sdkReadyRef.current = true; return; }
    const check = setInterval(() => {
      if (window.ABDLCaptcha) { sdkReadyRef.current = true; clearInterval(check); }
    }, 200);
    const timeout = setTimeout(() => { clearInterval(check); sdkReadyRef.current = true; }, 10000);
    return () => { clearInterval(check); clearTimeout(timeout); };
  }, []);

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
    actionRef.current = null;
    tokenRef.current = null;
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
    if (turnstileBothContainerRef.current) turnstileBothContainerRef.current.textContent = '';
  }, []);

  const trigger = useCallback((onPass) => {
    actionRef.current = onPass;
    tokenRef.current = null;
    setShow(true);
    setAnimState('entering');
    setError(null);
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

        if (data.flow === 'both') {
          setPhase('quantum');
        } else if (data.flow === 'turnstile') {
          setPhase('turnstile');
        } else {
          setPhase('quantum');
        }
      } catch (err) {
        setError('安全验证服务异常，请刷新重试');
      }
    })();
  }, [show, retryCount]);

  // Turnstile 渲染（单模式）
  useEffect(() => {
    if (phase !== 'turnstile' || flow === 'both') return;

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
                body: JSON.stringify({ session_id: turnstileSessionRef.current, token }),
              });
              const result = await res.json();
              if (result.success) {
                tokenRef.current = token;
                finishVerification();
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

    try {
      quantumRendererRef.current = window.ABDLCaptcha.render(quantumContainerRef.current, {
        apiBase: API_BASE,
        onSuccess: (token) => {
          tokenRef.current = token;
          if (flow === 'both') {
            // Quantum 通过 → 切换到 transition 状态（显示提示文字）
            setPhase('transition');
            // 延迟后渲染 Turnstile
            setTimeout(() => setPhase('turnstile-both'), 600);
          } else {
            finishVerification();
          }
        },
        onError: () => setError('验证失败，请重试'),
      });
    } catch {
      setError('验证组件渲染失败');
    }
  }, [phase, flow]);

  // Turnstile 渲染（both 模式的第二步）
  useEffect(() => {
    if (phase !== 'turnstile-both') return;

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

      if (!turnstileBothContainerRef.current) return;
      const siteKey = window.__TURNSTILE_SITE_KEY || '';
      if (!siteKey) { setError('Turnstile 未配置'); return; }

      try {
        turnstileWidgetRef.current = window.turnstile.render(turnstileBothContainerRef.current, {
          sitekey: siteKey,
          callback: async (token) => {
            try {
              const res = await fetch(`${API_BASE}/api/captcha/turnstile/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: turnstileSessionRef.current, token }),
              });
              const result = await res.json();
              if (result.success) {
                tokenRef.current = token;
                finishVerification();
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
  }, [phase, ensureTurnstile]);

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

  /* ---- 边框颜色 ---- */
  const getBorderColor = () => {
    if (phase === 'done') return '#5DAE60';                          // 绿色
    if (phase === 'transition' || phase === 'turnstile-both') return '#D4A830'; // 黄色
    return 'var(--border)';                                           // 默认灰色
  };

  /* ---- 边框样式（黄色闪烁） ---- */
  const getBorderStyle = () => {
    const color = getBorderColor();
    const base = { border: `2px solid ${color}`, borderRadius: '1rem', padding: '16px', minHeight: 80, transition: 'border-color 0.3s ease' };
    if (phase === 'transition' || phase === 'turnstile-both') {
      return { ...base, animation: 'borderFlash 1.2s ease-in-out infinite' };
    }
    return base;
  };

  /* ---- 样式 ---- */
  const backdropStyle = {
    position: 'fixed', inset: 0, zIndex: 400,
    background: 'var(--bg)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    visibility: animState === 'hidden' ? 'hidden' : 'visible',
    pointerEvents: animState === 'hidden' ? 'none' : 'auto',
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

  const phaseLabel = {
    loading: '正在评估安全等级...',
    quantum: '按高亮顺序点击节点，需在 10 秒内完成',
    transition: '验证中...',
    'turnstile-both': '验证中...',
    turnstile: '请完成验证',
    done: '验证通过 ✓',
  };

  const VerifyModal = (
    <>
      <style>{`
        @keyframes borderFlash {
          0%, 100% { border-color: #D4A830; }
          50% { border-color: rgba(212, 168, 48, 0.3); }
        }
      `}</style>
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

          {/* 进度条（both 模式） */}
          {flow === 'both' && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              <div style={{
                flex: 1, height: 3, borderRadius: 2,
                background: ['quantum', 'transition', 'turnstile-both', 'done'].includes(phase) ? 'var(--primary)' : 'var(--border)',
                transition: 'background 0.3s',
              }} />
              <div style={{
                flex: 1, height: 3, borderRadius: 2,
                background: ['turnstile-both', 'done'].includes(phase) ? 'var(--primary)' : 'var(--border)',
                transition: 'background 0.3s',
              }} />
            </div>
          )}

          <p style={{ fontSize: '.8rem', color: phase === 'done' ? '#5DAE60' : (phase === 'transition' || phase === 'turnstile-both') ? '#D4A830' : 'var(--text-muted)', marginBottom: '0.75rem', transition: 'color 0.3s' }}>
            {error || phaseLabel[phase] || '正在加载...'}
          </p>

          {/* ---- 内容区 ---- */}
          {flow === 'both' ? (
            /* both 模式：单容器，根据 phase 切换内容和边框 */
            <div style={getBorderStyle()}>
              {phase === 'quantum' && <div ref={quantumContainerRef} />}
              {phase === 'transition' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0' }}>
                  <div className="spinner" style={{ marginRight: 10 }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>正在切换验证方式...</span>
                </div>
              )}
              {(phase === 'turnstile-both') && <div ref={turnstileBothContainerRef} style={{ display: 'flex', justifyContent: 'center' }} />}
              {phase === 'done' && (
                <div style={{ textAlign: 'center', padding: '8px 0', fontSize: '1.8rem', color: '#5DAE60' }}>
                  <i className="fa-solid fa-circle-check" />
                </div>
              )}
            </div>
          ) : (
            /* 单模式 */
            <div style={{ border: '2px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', padding: '16px', minHeight: 80, transition: 'border-color 0.3s' }}>
              {phase === 'quantum' && <div ref={quantumContainerRef} />}
              {phase === 'turnstile' && <div id="turnstile-container" style={{ display: 'flex', justifyContent: 'center' }} />}
              {phase === 'done' && (
                <div style={{ textAlign: 'center', padding: '8px 0', fontSize: '1.8rem', color: '#5DAE60' }}>
                  <i className="fa-solid fa-circle-check" />
                </div>
              )}
              {phase === 'loading' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0' }}>
                  <div className="spinner" style={{ marginRight: 10 }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>加载验证组件...</span>
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
    </>
  );

  return { trigger, VerifyModal, captchaToken: tokenRef };
}
