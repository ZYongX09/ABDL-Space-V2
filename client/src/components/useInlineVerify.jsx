import { useState, useRef, useCallback, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * useInlineVerify — 内嵌验证码 Hook（直接调内部 API，不走 embed.js SDK）
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
  const quantumRendererRef = useRef(null);
  const sdkReadyRef = useRef(!!window.ABDLCaptcha);
  const canvasRef = useRef(null);

  // Quantum SDK 状态
  const [quantumState, setQuantumState] = useState({
    nodes: [], order: [], sessionId: null, ctx: null, timeoutMs: 10000,
    userSequence: [], successfulEdges: [], attemptCount: 0,
    isVerified: false, hoveredNode: null, timerExpired: false,
  });
  const [countdown, setCountdown] = useState(10);
  const [hint, setHint] = useState('按高亮顺序点击节点，每个节点只能点一次');
  const timerRef = useRef(null);

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
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
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
    if (timerRef.current) clearInterval(timerRef.current);
    if (turnstileWidgetRef.current) {
      try { window.turnstile?.remove(turnstileWidgetRef.current); } catch {}
      turnstileWidgetRef.current = null;
    }
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
    renderTurnstile('inline-turnstile-container', 'single');
  }, [phase, flow]);

  // Quantum — 创建 challenge
  useEffect(() => {
    if (phase !== 'quantum') return;
    createQuantumChallenge();
  }, [phase]);

  // 倒计时
  function startCountdown() {
    setCountdown(10);
    setHint('按高亮顺序点击节点，需在 10 秒内完成');
    if (timerRef.current) clearInterval(timerRef.current);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 10000 - elapsed);
      setCountdown(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setQuantumState(s => ({ ...s, timerExpired: true, userSequence: [], successfulEdges: [] }));
        setHint('超时，正在重新加载...');
        setTimeout(() => createQuantumChallenge(), 800);
      }
    }, 200);
  }

  function resetQuantum() {
    setQuantumState(s => ({ ...s, userSequence: [], successfulEdges: [], timerExpired: false }));
    setHint('按高亮顺序点击节点，需在 10 秒内完成');
    startCountdown();
  }

  // Quantum — 渲染 Canvas
  useEffect(() => {
    if (phase !== 'quantum' || !quantumState.sessionId) return;
    if (!canvasRef.current) return;
    drawQuantum();
  }, [quantumState, phase]);

  // Turnstile 渲染（both 模式第二步）
  useEffect(() => {
    if (phase !== 'turnstile-both') return;
    renderTurnstile('inline-turnstile-both-container', 'both');
  }, [phase]);

  async function createQuantumChallenge() {
    try {
      const res = await fetch(`${API_BASE}/api/captcha/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'quantum' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create challenge');

      setQuantumState({
        nodes: data.challenge.nodes || [],
        order: data.challenge.order || [],
        sessionId: data.session_id,
        ctx: data.challenge.ctx || '',
        timeoutMs: data.challenge.timeoutMs || 10000,
        userSequence: [],
        successfulEdges: [],
        attemptCount: 0,
        isVerified: false,
        hoveredNode: null,
        timerExpired: false,
      });
      startCountdown();
    } catch (err) {
      setError(err.message);
    }
  }

  async function renderTurnstile(containerId, mode) {
    const ok = await ensureTurnstile();
    if (!ok) { setError('Turnstile 加载失败'); return; }

    try {
      const res = await fetch(`${API_BASE}/api/captcha/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'turnstile' }),
      });
      const data = await res.json();
      turnstileSessionRef.current = data.session_id;
    } catch {
      setError('创建验证失败'); return;
    }

    const container = document.getElementById(containerId);
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
              if (mode === 'both') {
                finishVerify();
              } else {
                finishVerify();
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
  }

  function handleQuantumClick(nodeId) {
    const st = quantumState;
    if (st.isVerified || st.timerExpired || st.attemptCount >= 5) return;
    if (st.userSequence.includes(nodeId)) return;

    const expected = st.order[st.userSequence.length];
    if (nodeId === expected) {
      const prev = st.userSequence.length > 0 ? st.userSequence[st.userSequence.length - 1] : null;
      const newSeq = [...st.userSequence, nodeId];
      const newEdges = prev ? [...st.successfulEdges, { from: prev, to: nodeId }] : st.successfulEdges;
      setQuantumState(s => ({ ...s, userSequence: newSeq, successfulEdges: newEdges }));

      if (newSeq.length === st.order.length) {
        submitQuantum(newSeq);
      }
    } else {
      const newAttempts = st.attemptCount + 1;
      setQuantumState(s => ({ ...s, attemptCount: newAttempts, userSequence: [], successfulEdges: [] }));
      if (newAttempts >= 5) {
        if (timerRef.current) clearInterval(timerRef.current);
        setError('已锁定，请稍后重试');
      } else {
        setHint('顺序错误，请重试');
        setTimeout(() => {
          setHint('按高亮顺序点击节点，需在 10 秒内完成');
          setQuantumState(s => ({ ...s, userSequence: [], successfulEdges: [] }));
        }, 1500);
      }
    }
  }

  async function submitQuantum(sequence) {
    try {
      const res = await fetch(`${API_BASE}/api/captcha/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: quantumState.sessionId,
          answer: sequence.join(','),
          ctx: quantumState.ctx,
        }),
      });
      const result = await res.json();
      if (result.success) {
        tokenRef.current = result.token;
        if (timerRef.current) clearInterval(timerRef.current);
        setQuantumState(s => ({ ...s, isVerified: true }));
        setHint('验证通过 ✓');
        if (flow === 'both') {
          setPhase('transition');
          setTimeout(() => setPhase('turnstile-both'), 600);
        } else {
          finishVerify();
        }
      } else {
        const newAttempts = quantumState.attemptCount + 1;
        setQuantumState(s => ({ ...s, attemptCount: newAttempts, userSequence: [], successfulEdges: [] }));
        if (result.locked) {
          setError('已锁定，请稍后重试');
        } else {
          setError(`验证失败，剩余 ${result.attempts_left} 次`);
          setTimeout(() => { setError(null); }, 2000);
        }
      }
    } catch {
      setError('网络错误');
    }
  }

  // Canvas 绘制
  function drawQuantum() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const st = quantumState;

    const drawFrame = () => {
      ctx.clearRect(0, 0, W, H);

      // 背景网格
      ctx.strokeStyle = 'rgba(100,120,150,0.08)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < W; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
      for (let i = 0; i < H; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke(); }

      // 已激活的边
      for (const edge of st.successfulEdges) {
        const f = st.nodes.find(n => n.id === edge.from), t = st.nodes.find(n => n.id === edge.to);
        if (f && t) {
          const g = ctx.createLinearGradient(f.x, f.y, t.x, t.y);
          g.addColorStop(0, '#A8D8F0'); g.addColorStop(1, '#FFB7C5');
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.shadowBlur = 8; ctx.shadowColor = '#A8D8F0';
          ctx.stroke(); ctx.shadowBlur = 0;
        }
      }

      const nextId = !st.isVerified && st.userSequence.length < st.order.length ? st.order[st.userSequence.length] : null;

      for (const node of st.nodes) {
        const activated = st.userSequence.includes(node.id);
        const isNext = node.id === nextId;
        const hovered = st.hoveredNode === node.id && !activated;

        ctx.save(); ctx.translate(node.x, node.y);

        if (isNext) {
          const t = Date.now() / 250, pulse = Math.sin(t) * 0.5 + 0.5;
          ctx.beginPath(); ctx.arc(0, 0, 26 + pulse * 5, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,183,197,${0.3 + pulse * 0.4})`; ctx.lineWidth = 2; ctx.stroke();
        }
        if (hovered) { ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(168,216,240,0.5)'; ctx.lineWidth = 2.5; ctx.stroke(); }

        ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2);
        ctx.fillStyle = activated ? 'rgba(168,216,240,0.35)' : isNext ? 'rgba(255,183,197,0.2)' : hovered ? 'rgba(168,216,240,0.25)' : 'rgba(100,120,150,0.15)';
        ctx.fill();

        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fillStyle = activated ? '#A8D8F0' : isNext ? '#F0A0B8' : hovered ? '#8CC8E8' : '#718096';
        ctx.fill();

        const blink = 0.7 + Math.sin(Date.now() / 300 + node.x) * 0.3;
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${blink})`; ctx.fill();

        ctx.font = 'bold 15px sans-serif';
        ctx.fillStyle = activated ? '#A8D8F0' : isNext ? '#FFB7C5' : hovered ? '#A8D8F0' : '#A0AAB8';
        ctx.fillText(node.id, -7, -16);
        ctx.restore();
      }

      if (st.isVerified) {
        ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#7BC67E';
        ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(123,198,126,0.5)';
        ctx.fillText('验证通过', W / 2 - 40, H - 14); ctx.shadowBlur = 0;
      }

      requestAnimationFrame(drawFrame);
    };
    drawFrame();
  }

  function getCanvasNode(e) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    for (const n of quantumState.nodes) {
      if (Math.hypot(n.x - x, n.y - y) < 28) return n.id;
    }
    return null;
  }

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
    quantum: '按高亮顺序点击节点，需在 10 秒内完成',
    transition: '验证中...',
    'turnstile-both': '验证中...',
    turnstile: '请完成滑动验证',
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
        <p style={{ fontSize: '.78rem', color: phase === 'done' ? '#5DAE60' : (phase === 'transition' || phase === 'turnstile-both') ? '#D4A830' : 'var(--text-muted)', marginBottom: 10, transition: 'color 0.3s', textAlign: 'center' }}>
          {error || phaseLabel[phase] || '正在加载...'}
        </p>

        {flow === 'both' ? (
          <div style={getBorderStyle()}>
            {phase === 'quantum' && quantumState.nodes.length > 0 && (
              <canvas
                ref={canvasRef}
                width={550} height={260}
                style={{ width: '100%', height: 'auto', borderRadius: 10, cursor: 'crosshair', display: 'block' }}
                onClick={e => { const id = getCanvasNode(e); if (id) handleQuantumClick(id); }}
                onMouseMove={e => { const id = getCanvasNode(e); setQuantumState(s => ({ ...s, hoveredNode: id })); }}
                onMouseLeave={() => setQuantumState(s => ({ ...s, hoveredNode: null }))}
              />
            )}
            {phase === 'transition' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0', gap: 8 }}>
                <div style={{ width: 18, height: 18, border: '2.5px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>验证中...</span>
              </div>
            )}
            {phase === 'turnstile-both' && <div id="inline-turnstile-both-container" style={{ display: 'flex', justifyContent: 'center' }} />}
            {phase === 'done' && (
              <div style={{ textAlign: 'center', padding: '4px 0', fontSize: '1.6rem', color: '#5DAE60' }}>
                <i className="fa-solid fa-circle-check" />
              </div>
            )}
          </div>
        ) : (
          <div style={getBorderStyle()}>
            {phase === 'quantum' && quantumState.nodes.length > 0 && (
              <canvas
                ref={canvasRef}
                width={550} height={260}
                style={{ width: '100%', height: 'auto', borderRadius: 10, cursor: 'crosshair', display: 'block' }}
                onClick={e => { const id = getCanvasNode(e); if (id) handleQuantumClick(id); }}
                onMouseMove={e => { const id = getCanvasNode(e); setQuantumState(s => ({ ...s, hoveredNode: id })); }}
                onMouseLeave={() => setQuantumState(s => ({ ...s, hoveredNode: null }))}
              />
            )}
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

        {quantumState.nodes.length > 0 && phase === 'quantum' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            <span style={{ flex: 1, fontSize: '0.72rem', color: quantumState.isVerified ? '#5DAE60' : quantumState.timerExpired ? '#ef476f' : 'var(--text-light)' }}>{hint}</span>
            <span style={{
              fontVariantNumeric: 'tabular-nums',
              padding: '2px 8px',
              borderRadius: 8,
              background: countdown <= 3 ? 'rgba(239,71,111,0.1)' : 'rgba(0,0,0,0.04)',
              color: countdown <= 3 ? '#ef476f' : 'var(--text-muted)',
              fontWeight: countdown <= 3 ? 600 : 400,
            }}>{countdown}s</span>
            <span>尝试: {quantumState.attemptCount}/5</span>
            <button
              type="button"
              onClick={resetQuantum}
              style={{
                padding: '3px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'var(--input-bg)',
                fontSize: '0.72rem', cursor: 'pointer', color: 'var(--text)',
              }}
              onMouseEnter={e => { e.target.style.borderColor = 'var(--primary)'; e.target.style.color = 'var(--primary-dark)'; }}
              onMouseLeave={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.color = 'var(--text)'; }}
            >重置</button>
          </div>
        )}

        {/* 进度条 */}
        {quantumState.nodes.length > 0 && phase === 'quantum' && (
          <div style={{ height: 2, background: 'var(--border)', borderRadius: '0 0 10px 10px', overflow: 'hidden', marginTop: 4 }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, ((10 - countdown) / 10) * 100)}%`,
              background: countdown <= 3 ? '#ef476f' : 'var(--primary)',
              transition: 'width 0.2s linear',
              borderRadius: 2,
            }} />
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
