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
  const [phase, setPhase] = useState('loading');
  const [flow, setFlow] = useState(null);
  const [risk, setRisk] = useState(null);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Quantum 状态
  const [qNodes, setQNodes] = useState([]);
  const [qOrder, setQOrder] = useState([]);
  const [qSessionId, setQSessionId] = useState('');
  const [qCtx, setQCtx] = useState('');
  const [qUserSeq, setQUserSeq] = useState([]);
  const [qEdges, setQEdges] = useState([]);
  const [qAttempts, setQAttempts] = useState(0);
  const [qHovered, setQHovered] = useState(null);
  const [qVerified, setQVerified] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [hint, setHint] = useState('');

  const actionRef = useRef(null);
  const tokenRef = useRef(null);
  const turnstileSessionRef = useRef(null);
  const turnstileWidgetRef = useRef(null);
  const turnstileBothContainerRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const staleRef = useRef(false);
  const clickTimesRef = useRef([]);
  const startTimeRef = useRef(0);

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
    staleRef.current = true;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setShow(false); setAnimState('hidden');
    setPhase('loading'); setFlow(null); setRisk(null); setError(null);
    setQNodes([]); setQOrder([]); setQSessionId(''); setQCtx('');
    setQUserSeq([]); setQEdges([]); setQAttempts(0); setQVerified(false);
    actionRef.current = null; tokenRef.current = null;
    turnstileSessionRef.current = null;
    if (turnstileWidgetRef.current) {
      try { window.turnstile?.remove(turnstileWidgetRef.current); } catch {}
      turnstileWidgetRef.current = null;
    }
  }, []);

  const trigger = useCallback((onPass) => {
    staleRef.current = false;
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
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        if (!res.ok) throw new Error('Risk assessment failed');
        const data = await res.json();
        setRisk(data.risk); setFlow(data.flow);
        if (data.flow === 'both') setPhase('quantum');
        else if (data.flow === 'turnstile') setPhase('turnstile');
        else setPhase('quantum');
      } catch { setError('安全验证服务异常，请刷新重试'); }
    })();
  }, [show, retryCount]);

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
      if (staleRef.current) { clearInterval(timerRef.current); return; }
      const remaining = Math.max(0, 10000 - (Date.now() - start));
      setCountdown(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        clearInterval(timerRef.current);
        setHint('超时，正在重新加载...');
        setTimeout(() => { if (!staleRef.current) createQuantumChallenge(); }, 800);
      }
    }, 200);
  }

  async function createQuantumChallenge() {
    try {
      const res = await fetch(`${API_BASE}/api/captcha/challenge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'quantum' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Challenge failed');
      setQNodes(data.challenge.nodes || []);
      setQOrder(data.challenge.order || []);
      setQSessionId(data.session_id);
      setQCtx(data.challenge.ctx || '');
      setQUserSeq([]); setQEdges([]); setQAttempts(0); setQVerified(false);
      setQHovered(null);
      startTimeRef.current = Date.now();
      clickTimesRef.current = [];
      startCountdown();
    } catch (err) { setError(err.message); }
  }

  function handleQuantumClick(nodeId) {
    if (qVerified || qAttempts >= 5) return;
    if (qUserSeq.includes(nodeId)) return;
    clickTimesRef.current.push(Date.now() - startTimeRef.current);

    const expected = qOrder[qUserSeq.length];
    if (nodeId === expected) {
      const prev = qUserSeq.length > 0 ? qUserSeq[qUserSeq.length - 1] : null;
      const newSeq = [...qUserSeq, nodeId];
      const newEdges = prev ? [...qEdges, { from: prev, to: nodeId }] : qEdges;
      setQUserSeq(newSeq); setQEdges(newEdges);
      if (newSeq.length === qOrder.length) submitQuantum(newSeq);
    } else {
      const newAttempts = qAttempts + 1;
      setQAttempts(newAttempts); setQUserSeq([]); setQEdges([]);
      if (newAttempts >= 5) {
        if (timerRef.current) clearInterval(timerRef.current);
        setError('已锁定，请稍后重试');
      } else {
        setHint('顺序错误，请重试');
        setTimeout(() => { setHint('按高亮顺序点击节点，需在 10 秒内完成'); setQUserSeq([]); setQEdges([]); }, 1500);
      }
    }
  }

  async function submitQuantum(sequence) {
    try {
      const behavior = {
        clickTimes: clickTimesRef.current,
        totalTime: Date.now() - startTimeRef.current,
        screen: `${screen.width}x${screen.height}`,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      const res = await fetch(`${API_BASE}/api/captcha/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: qSessionId, answer: sequence.join(','), ctx: qCtx, behavior }),
      });
      const result = await res.json();
      if (result.success) {
        tokenRef.current = result.token;
        if (timerRef.current) clearInterval(timerRef.current);
        setQVerified(true); setHint('验证通过 ✓');
        if (flow === 'both') {
          setPhase('transition');
          setTimeout(() => setPhase('turnstile-both'), 600);
        } else { finishVerification(); }
      } else {
        setQAttempts(a => a + 1); setQUserSeq([]); setQEdges([]);
        if (result.locked) setError('已锁定，请稍后重试');
        else { setError(`验证失败，剩余 ${result.attempts_left} 次`); setTimeout(() => setError(null), 2000); }
      }
    } catch { setError('网络错误'); }
  }

  // Quantum Canvas 绘制
  useEffect(() => {
    if (phase !== 'quantum' || !canvasRef.current || qNodes.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    let animId;

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(100,120,150,0.08)'; ctx.lineWidth = 0.5;
      for (let i = 0; i < W; i += 40) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke(); }
      for (let i = 0; i < H; i += 40) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke(); }

      for (const edge of qEdges) {
        const f = qNodes.find(n => n.id === edge.from), t = qNodes.find(n => n.id === edge.to);
        if (f && t) {
          const g = ctx.createLinearGradient(f.x, f.y, t.x, t.y);
          g.addColorStop(0, '#A8D8F0'); g.addColorStop(1, '#FFB7C5');
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = g; ctx.lineWidth = 3; ctx.shadowBlur = 8; ctx.shadowColor = '#A8D8F0';
          ctx.stroke(); ctx.shadowBlur = 0;
        }
      }

      const nextId = !qVerified && qUserSeq.length < qOrder.length ? qOrder[qUserSeq.length] : null;

      for (const node of qNodes) {
        const activated = qUserSeq.includes(node.id);
        const isNext = node.id === nextId;
        const hovered = qHovered === node.id && !activated;
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

      if (qVerified) {
        ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#7BC67E';
        ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(123,198,126,0.5)';
        ctx.fillText('验证通过', W / 2 - 40, H - 14); ctx.shadowBlur = 0;
      }
      animId = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(animId);
  }, [phase, qNodes, qUserSeq, qEdges, qHovered, qVerified, qOrder]);

  function getCanvasNode(e) {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvasRef.current.width / rect.width);
    const y = (e.clientY - rect.top) * (canvasRef.current.height / rect.height);
    for (const n of qNodes) if (Math.hypot(n.x - x, n.y - y) < 28) return n.id;
    return null;
  }

  // Turnstile 渲染（单模式）
  useEffect(() => {
    if (phase !== 'turnstile' || flow === 'both') return;
    renderTurnstile('turnstile-container', false);
  }, [phase, flow]);

  // Turnstile 渲染（both 模式第二步）
  useEffect(() => {
    if (phase !== 'turnstile-both') return;
    renderTurnstile(null, true);
  }, [phase]);

  async function renderTurnstile(containerId, isBoth) {
    const ok = await ensureTurnstile();
    if (!ok) { setError('Turnstile 加载失败'); return; }
    try {
      const res = await fetch(`${API_BASE}/api/captcha/challenge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'turnstile' }),
      });
      const data = await res.json();
      turnstileSessionRef.current = data.session_id;
    } catch { setError('创建验证失败'); return; }

    const container = isBoth ? turnstileBothContainerRef.current : document.getElementById(containerId);
    if (!container) return;
    const siteKey = window.__TURNSTILE_SITE_KEY || '';
    if (!siteKey) { setError('Turnstile 未配置'); return; }

    try {
      turnstileWidgetRef.current = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: async (token) => {
          if (staleRef.current) return;
          try {
            const res = await fetch(`${API_BASE}/api/captcha/turnstile/verify`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: turnstileSessionRef.current, token }),
            });
            const result = await res.json();
            if (result.success) { tokenRef.current = token; finishVerification(); }
            else setError(result.locked ? '验证次数过多，请稍后再试' : '验证失败，请重试');
          } catch { setError('验证请求失败'); }
        },
        'error-callback': () => setError('Turnstile 加载异常'),
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
      });
    } catch { setError('Turnstile 渲染失败'); }
  }

  const finishVerification = useCallback(() => {
    setPhase('done');
    const action = actionRef.current;
    setTimeout(() => {
      setAnimState('exiting');
      setTimeout(() => { setShow(false); setAnimState('hidden'); cleanup(); if (action) { action(); actionRef.current = null; } }, 250);
    }, 600);
  }, [cleanup]);

  const handleClose = useCallback(() => {
    setAnimState('exiting');
    setTimeout(() => cleanup(), 200);
  }, [cleanup]);

  if (!show) return { trigger, VerifyModal: null, captchaToken: tokenRef };

  const getBorderColor = () => {
    if (phase === 'done') return '#5DAE60';
    if (phase === 'transition' || phase === 'turnstile-both') return '#D4A830';
    return 'var(--border)';
  };
  const getBorderStyle = () => {
    const color = getBorderColor();
    const base = { border: `2px solid ${color}`, borderRadius: '1rem', padding: '16px', minHeight: 80, transition: 'border-color 0.3s ease' };
    if (phase === 'transition' || phase === 'turnstile-both') return { ...base, animation: 'borderFlash 1.2s ease-in-out infinite' };
    return base;
  };

  const backdropStyle = {
    position: 'fixed', inset: 0, zIndex: 400, background: 'var(--bg)',
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
    transition: '验证中...', 'turnstile-both': '验证中...',
    turnstile: '请完成验证', done: '验证通过 ✓',
  };

  const VerifyModal = (
    <>
      <style>{`@keyframes borderFlash { 0%,100%{border-color:#D4A830} 50%{border-color:rgba(212,168,48,0.3)} }`}</style>
      <div style={backdropStyle} onClick={handleClose}>
        <div style={cardStyle} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-base" style={{ color: 'var(--text)' }}>
              <i className="fa-solid fa-shield-halved mr-2" style={{ color: 'var(--primary-dark)' }} />安全验证
            </h3>
            <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          {flow === 'both' && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              <div style={{ flex: 1, height: 3, borderRadius: 2, background: ['quantum','transition','turnstile-both','done'].includes(phase) ? 'var(--primary)' : 'var(--border)', transition: 'background 0.3s' }} />
              <div style={{ flex: 1, height: 3, borderRadius: 2, background: ['turnstile-both','done'].includes(phase) ? 'var(--primary)' : 'var(--border)', transition: 'background 0.3s' }} />
            </div>
          )}

          <p style={{ fontSize: '.8rem', color: phase === 'done' ? '#5DAE60' : (phase === 'transition' || phase === 'turnstile-both') ? '#D4A830' : 'var(--text-muted)', marginBottom: '0.75rem', transition: 'color 0.3s' }}>
            {error || (hint || phaseLabel[phase]) || '正在加载...'}
          </p>

          {flow === 'both' ? (
            <div style={getBorderStyle()}>
              {phase === 'quantum' && qNodes.length > 0 && (
                <canvas ref={canvasRef} width={550} height={260}
                  style={{ width: '100%', height: 'auto', borderRadius: 10, cursor: 'crosshair', display: 'block' }}
                  onClick={e => { const id = getCanvasNode(e); if (id) handleQuantumClick(id); }}
                  onMouseMove={e => setQHovered(getCanvasNode(e))}
                  onMouseLeave={() => setQHovered(null)}
                />
              )}
              {phase === 'transition' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0' }}>
                  <div className="spinner" style={{ marginRight: 10 }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>正在切换验证方式...</span>
                </div>
              )}
              {phase === 'turnstile-both' && <div ref={turnstileBothContainerRef} style={{ display: 'flex', justifyContent: 'center' }} />}
              {phase === 'done' && (
                <div style={{ textAlign: 'center', padding: '8px 0', fontSize: '1.8rem', color: '#5DAE60' }}>
                  <i className="fa-solid fa-circle-check" />
                </div>
              )}
            </div>
          ) : (
            <div style={{ border: '2px solid var(--border)', borderRadius: '1rem', overflow: 'hidden', padding: '16px', minHeight: 80, transition: 'border-color 0.3s' }}>
              {phase === 'quantum' && qNodes.length > 0 && (
                <canvas ref={canvasRef} width={550} height={260}
                  style={{ width: '100%', height: 'auto', borderRadius: 10, cursor: 'crosshair', display: 'block' }}
                  onClick={e => { const id = getCanvasNode(e); if (id) handleQuantumClick(id); }}
                  onMouseMove={e => setQHovered(getCanvasNode(e))}
                  onMouseLeave={() => setQHovered(null)}
                />
              )}
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

          {/* Quantum 底部栏 */}
          {phase === 'quantum' && qNodes.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span style={{ flex: 1, fontSize: '0.72rem', color: 'var(--text-light)' }}>{hint}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', padding: '2px 8px', borderRadius: 8, background: countdown <= 3 ? 'rgba(239,71,111,0.1)' : 'rgba(0,0,0,0.04)', color: countdown <= 3 ? '#ef476f' : 'var(--text-muted)', fontWeight: countdown <= 3 ? 600 : 400 }}>{countdown}s</span>
              <span>尝试: {qAttempts}/5</span>
              <button type="button" onClick={() => { setQUserSeq([]); setQEdges([]); setHint('按高亮顺序点击节点，需在 10 秒内完成'); startCountdown(); }}
                style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--input-bg)', fontSize: '0.72rem', cursor: 'pointer', color: 'var(--text)' }}>重置</button>
            </div>
          )}
          {phase === 'quantum' && qNodes.length > 0 && (
            <div style={{ height: 2, background: 'var(--border)', borderRadius: '0 0 10px 10px', overflow: 'hidden', marginTop: 4 }}>
              <div style={{ height: '100%', width: `${Math.min(100, ((10 - countdown) / 10) * 100)}%`, background: countdown <= 3 ? '#ef476f' : 'var(--primary)', transition: 'width 0.2s linear', borderRadius: 2 }} />
            </div>
          )}

          {error && (
            <button className="btn btn-sm btn-primary" style={{ marginTop: '0.75rem', width: '100%' }}
              onClick={() => { setError(null); setRetryCount(c => c + 1); }}>重试</button>
          )}
        </div>
      </div>
    </>
  );

  return { trigger, VerifyModal, captchaToken: tokenRef };
}
