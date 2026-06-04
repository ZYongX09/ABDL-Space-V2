import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '';
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

/**
 * useInlineVerify — 内嵌验证码 Hook（不弹窗，直接渲染在页面中）
 *
 * 用法:
 *   const { trigger, InlineVerify, verified } = useInlineVerify();
 *   // 在 JSX 中: {InlineVerify}
 *   // 触发: trigger()
 */
export function useInlineVerify() {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState('loading'); // loading | quantum | transition | turnstile-both | turnstile | done
  const [flow, setFlow] = useState(null);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [verified, setVerified] = useState(false);

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
    setActive(false); setPhase('loading'); setFlow(null); setError(null);
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

  const trigger = useCallback(() => {
    setVerified(false);
    tokenRef.current = null;
    setActive(true);
    setError(null);
  }, []);

  // 启动流程
  useEffect(() => {
    if (!active) return;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/captcha/risk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (!res.ok) throw new Error('Risk assessment failed');
        const data = await res.json();
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
  }, [active, retryCount]);

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

      const container = document.getElementById('inline-turnstile-container');
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
                finishVerify();
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
            setPhase('transition');
            setTimeout(() => setPhase('turnstile-both'), 600);
          } else {
            finishVerify();
          }
        },
        onError: () => setError('验证失败，请重试'),
      });
    } catch {
      setError('验证组件渲染失败');
    }
  }, [phase, flow]);

  // Turnstile 渲染（both 模式第二步）
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
                finishVerify();
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

  const finishVerify = useCallback(() => {
    setPhase('done');
    setVerified(true);
    setTimeout(() => cleanup(), 1200);
  }, [cleanup]);

  const getBorderColor = () => {
    if (phase === 'done') return '#5DAE60';
    if (phase === 'transition' || phase === 'turnstile-both') return '#D4A830';
    return 'var(--border)';
  };

  const getBorderStyle = () => {
    const color = getBorderColor();
    const base = { border: `1.5px solid ${color}`, borderRadius: '1rem', padding: '12px', minHeight: 60, transition: 'border-color 0.3s ease' };
    if (phase === 'transition' || phase === 'turnstile-both') {
      return { ...base, animation: 'inlineBorderFlash 1.2s ease-in-out infinite' };
    }
    return base;
  };

  const phaseLabel = {
    loading: '正在加载...',
    quantum: '请完成安全验证',
    transition: '验证中...',
    'turnstile-both': '验证中...',
    turnstile: '请完成人机验证',
    done: '验证通过 ✓',
  };

  const InlineVerify = !active ? null : (
    <>
      <style>{`
        @keyframes inlineBorderFlash {
          0%, 100% { border-color: #D4A830; }
          50% { border-color: rgba(212, 168, 48, 0.3); }
        }
      `}</style>
      <div style={{ marginTop: 12 }}>
        {/* 状态文字 */}
        <p style={{ fontSize: '.78rem', color: phase === 'done' ? '#5DAE60' : (phase === 'transition' || phase === 'turnstile-both') ? '#D4A830' : 'var(--text-muted)', marginBottom: 10, transition: 'color 0.3s', textAlign: 'center' }}>
          {error || phaseLabel[phase] || '正在加载...'}
        </p>

        {/* 验证区域 */}
        {flow === 'both' ? (
          <div style={getBorderStyle()}>
            {phase === 'quantum' && <div ref={quantumContainerRef} />}
            {phase === 'transition' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0', gap: 8 }}>
                <div style={{ width: 18, height: 18, border: '2.5px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>验证中...</span>
              </div>
            )}
            {phase === 'turnstile-both' && <div ref={turnstileBothContainerRef} style={{ display: 'flex', justifyContent: 'center' }} />}
            {phase === 'done' && (
              <div style={{ textAlign: 'center', padding: '4px 0', fontSize: '1.6rem', color: '#5DAE60' }}>
                <i className="fa-solid fa-circle-check" />
              </div>
            )}
          </div>
        ) : (
          <div style={getBorderStyle()}>
            {phase === 'quantum' && <div ref={quantumContainerRef} />}
            {phase === 'turnstile' && <div id="inline-turnstile-container" style={{ display: 'flex', justifyContent: 'center' }} />}
            {phase === 'done' && (
              <div style={{ textAlign: 'center', padding: '4px 0', fontSize: '1.6rem', color: '#5DAE60' }}>
                <i className="fa-solid fa-circle-check" />
              </div>
            )}
            {phase === 'loading' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 0', gap: 8 }}>
                <div style={{ width: 18, height: 18, border: '2.5px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>加载验证组件...</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <button
            className="btn btn-sm btn-outline"
            style={{ marginTop: 8, width: '100%', fontSize: '0.82rem' }}
            onClick={() => { setError(null); setRetryCount(c => c + 1); }}
          >
            重试
          </button>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );

  return { trigger, InlineVerify, verified, active, tokenRef };
}
