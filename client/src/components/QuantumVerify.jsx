import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

const NODES = [
  { id: 'α', x: 90, y: 65 },
  { id: 'β', x: 270, y: 45 },
  { id: 'γ', x: 440, y: 75 },
  { id: 'δ', x: 400, y: 195 },
  { id: 'ε', x: 140, y: 210 },
];

const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 2000;

/* ====== 粒子系统 ====== */
class Particle {
  constructor(x, y, color, speed, life, size) {
    this.x = x; this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const v = speed * (0.5 + Math.random());
    this.vx = Math.cos(angle) * v;
    this.vy = Math.sin(angle) * v;
    this.life = life; this.maxLife = life;
    this.color = color; this.size = size;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy += 0.04; this.vx *= 0.99; this.vy *= 0.99;
    this.life--;
  }
  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  get dead() { return this.life <= 0; }
}

/* ====== 浮动背景粒子 ====== */
class BgParticle {
  constructor(w, h) {
    this.x = Math.random() * w; this.y = Math.random() * h;
    this.r = 1 + Math.random() * 1.5;
    this.speed = 0.15 + Math.random() * 0.25;
    this.angle = Math.random() * Math.PI * 2;
    this.alpha = 0.15 + Math.random() * 0.2;
    this.w = w; this.h = h;
    this.hue = Math.random() > 0.5 ? 200 : 340;
    this.isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  }
  update() {
    this.x += Math.cos(this.angle) * this.speed;
    this.y += Math.sin(this.angle) * this.speed;
    this.angle += (Math.random() - 0.5) * 0.03;
    if (this.x < -10) this.x = this.w + 10;
    if (this.x > this.w + 10) this.x = -10;
    if (this.y < -10) this.y = this.h + 10;
    if (this.y > this.h + 10) this.y = -10;
  }
  draw(ctx) {
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.isDark ? `hsl(${this.hue}, 60%, 55%)` : `hsl(${this.hue}, 80%, 78%)`;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/**
 * QuantumVerify — 节点序列验证组件
 *
 * Props:
 *   onVerified(answer?)  — 验证完成回调。本地模式无参数；服务端模式传 answer 字符串
 *   onReset(reason)      — 锁定/重置回调
 *   serverOrder          — 服务端下发的正确节点顺序（字符串数组），为 null 则本地生成
 */
const QuantumVerify = forwardRef(function QuantumVerify({ onVerified, onReset, serverOrder }, ref) {
  const canvasRef = useRef(null);

  const stateRef = useRef({
    correctOrder: [], userSequence: [], successfulEdges: [],
    isVerified: false, attemptCount: 0,
    expireTime: 0, isDragging: false, lastActiveNodeId: null,
    cooldownUntil: 0, hoveredNode: null,
    particles: [],
    bgParticles: [],
    edgeDashOffset: 0,
    nodeScales: {},
    shakeX: 0, shakeY: 0, shakeFrames: 0,
    successBurst: false,
    bgInit: false,
    isServerMode: false,
  });

  const [status, setStatus] = useState('按高亮顺序点击节点');
  const [attempts, setAttempts] = useState(0);
  const [verified, setVerified] = useState(false);

  /* 生成成功点击粒子 */
  const spawnHitParticles = useCallback((x, y) => {
    const colors = ['#A8D8F0', '#FFB7C5', '#fff', '#7BC67E', '#F0C040'];
    for (let i = 0; i < 18; i++) {
      stateRef.current.particles.push(
        new Particle(x, y, colors[i % colors.length], 2.5 + Math.random() * 2, 30 + Math.random() * 20, 2 + Math.random() * 2.5)
      );
    }
  }, []);

  /* 生成验证通过大爆炸 */
  const spawnSuccessBurst = useCallback((canvas) => {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const colors = ['#A8D8F0', '#FFB7C5', '#7BC67E', '#F0C040', '#fff'];
    for (let i = 0; i < 50; i++) {
      stateRef.current.particles.push(
        new Particle(cx, cy, colors[i % colors.length], 3 + Math.random() * 4, 50 + Math.random() * 30, 2.5 + Math.random() * 3)
      );
    }
  }, []);

  /* 触发抖动 */
  const triggerShake = useCallback(() => {
    stateRef.current.shakeFrames = 12;
  }, []);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const st = stateRef.current;

    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const isDark = theme === 'dark';
    const isColorful = theme === 'colorful';
    const gridColor = isDark ? 'rgba(100, 120, 150, 0.12)' : isColorful ? 'rgba(140, 100, 180, 0.12)' : 'rgba(168, 216, 240, 0.1)';
    const labelDefault = isDark ? '#A0AAB8' : isColorful ? '#6B5B8A' : '#7F8C9B';
    const nodeDefaultFill = isDark ? '#4A5568' : isColorful ? 'rgba(140, 100, 180, 0.2)' : 'rgba(168, 216, 240, 0.08)';
    const nodeDefaultInner = isDark ? '#718096' : isColorful ? '#9B7DC8' : '#6AAEC8';

    if (!st.bgInit) {
      for (let i = 0; i < 20; i++) st.bgParticles.push(new BgParticle(canvas.width, canvas.height));
      st.bgInit = true;
    }

    let sx = 0, sy = 0;
    if (st.shakeFrames > 0) {
      sx = (Math.random() - 0.5) * 6;
      sy = (Math.random() - 0.5) * 4;
      st.shakeFrames--;
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.clearRect(-10, -10, canvas.width + 20, canvas.height + 20);

    for (const p of st.bgParticles) { p.update(); p.draw(ctx); }

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    st.edgeDashOffset -= 0.3;
    for (let i = 0; i < canvas.width; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 40) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    for (const edge of st.successfulEdges) {
      const fromN = NODES.find(n => n.id === edge.from);
      const toN = NODES.find(n => n.id === edge.to);
      if (fromN && toN) {
        const grad = ctx.createLinearGradient(fromN.x, fromN.y, toN.x, toN.y);
        grad.addColorStop(0, '#A8D8F0'); grad.addColorStop(1, '#FFB7C5');
        ctx.beginPath(); ctx.moveTo(fromN.x, fromN.y); ctx.lineTo(toN.x, toN.y);
        ctx.strokeStyle = grad; ctx.lineWidth = 3.5;
        ctx.shadowBlur = 10; ctx.shadowColor = '#A8D8F0';
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = st.edgeDashOffset;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
      }
    }

    st.particles = st.particles.filter(p => { p.update(); p.draw(ctx); return !p.dead; });

    const nextId = !st.isVerified && st.userSequence.length < st.correctOrder.length
      ? st.correctOrder[st.userSequence.length] : null;

    for (const node of NODES) {
      const activated = st.userSequence.includes(node.id);
      const isNext = node.id === nextId;
      const hovered = st.hoveredNode === node.id && !activated;

      if (!st.nodeScales[node.id]) st.nodeScales[node.id] = 1;
      const targetScale = activated ? 1.15 : hovered ? 1.08 : 1;
      st.nodeScales[node.id] += (targetScale - st.nodeScales[node.id]) * 0.2;
      const sc = st.nodeScales[node.id];

      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.scale(sc, sc);

      if (isNext) {
        const t = Date.now() / 250;
        const pulse = Math.sin(t) * 0.5 + 0.5;
        const r = 26 + pulse * 5;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 183, 197, ${0.3 + pulse * 0.4})`;
        ctx.lineWidth = 2; ctx.stroke();
        const r2 = 32 + pulse * 8;
        ctx.beginPath(); ctx.arc(0, 0, r2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 183, 197, ${0.08 + pulse * 0.1})`;
        ctx.lineWidth = 1; ctx.stroke();
      }

      if (hovered) {
        ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(168, 216, 240, 0.5)';
        ctx.lineWidth = 2.5; ctx.stroke();
      }

      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fillStyle = activated ? 'rgba(168, 216, 240, 0.35)' : isNext ? 'rgba(255, 183, 197, 0.2)' : hovered ? 'rgba(168, 216, 240, 0.25)' : nodeDefaultFill;
      ctx.fill();

      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fillStyle = activated ? '#A8D8F0' : isNext ? '#F0A0B8' : hovered ? '#8CC8E8' : nodeDefaultInner;
      ctx.fill();

      const blink = 0.7 + Math.sin(Date.now() / 300 + node.x) * 0.3;
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${blink})`;
      ctx.fill();

      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = activated ? '#A8D8F0' : isNext ? '#FFB7C5' : hovered ? '#A8D8F0' : labelDefault;
      ctx.shadowBlur = (activated || isNext || hovered) ? 8 : 2;
      ctx.shadowColor = (activated || isNext) ? '#A8D8F0' : 'transparent';
      ctx.fillText(node.id, -7, -16);
      ctx.shadowBlur = 0;

      ctx.restore();
    }

    ctx.font = '10px sans-serif';
    ctx.fillStyle = isDark ? 'rgba(160, 170, 185, 0.3)' : isColorful ? 'rgba(100, 80, 140, 0.3)' : 'rgba(127, 140, 155, 0.35)';
    ctx.textAlign = 'right';
    ctx.fillText('ABDL-Space CAPTCHA', canvas.width - 10, canvas.height - 8);
    ctx.textAlign = 'start';

    if (st.isVerified) {
      const elapsed = Date.now() - (st.verifyTime || 0);
      const alpha = Math.min(1, elapsed / 500);
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = '#7BC67E';
      ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(123,198,126,0.5)';
      ctx.fillText('验证通过', canvas.width / 2 - 44, canvas.height - 14);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    if (st.isVerified && !st.successBurst) {
      st.successBurst = true;
      st.verifyTime = Date.now();
      spawnSuccessBurst(canvas);
    }

    ctx.restore();
  }, [spawnSuccessBurst]);

  useEffect(() => {
    let running = true;
    let visible = true;
    const loop = () => { if (!running || !visible) return; drawCanvas(); requestAnimationFrame(loop); };
    // BUG-681: Pause animation when not visible
    const canvas = canvasRef.current;
    if (canvas) {
      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible && running) loop();
      }, { threshold: 0.1 });
      observer.observe(canvas);
      loop();
      return () => { running = false; observer.disconnect(); };
    }
    loop();
    return () => { running = false; };
  }, [drawCanvas]);

  /* 初始化挑战（本地模式） */
  const generateLocalChallenge = useCallback(() => {
    const st = stateRef.current;
    st.correctOrder = [...NODES].sort(() => Math.random() - 0.5).map(n => n.id);
    st.userSequence = [];
    st.successfulEdges = [];
    st.isVerified = false;
    st.expireTime = Date.now() + 30000;
    st.cooldownUntil = 0;
    st.successBurst = false;
    st.verifyTime = 0;
    st.nodeScales = {};
    st.isServerMode = false;
    st.attemptCount = 0;
    setVerified(false);
    setAttempts(0);
    setStatus('按高亮顺序点击节点');
  }, []);

  /* 初始化挑战（服务端模式） */
  const applyServerChallenge = useCallback((order) => {
    const st = stateRef.current;
    st.correctOrder = order;
    st.userSequence = [];
    st.successfulEdges = [];
    st.isVerified = false;
    st.expireTime = Date.now() + 300000; // 5 min TTL from server
    st.cooldownUntil = 0;
    st.successBurst = false;
    st.verifyTime = 0;
    st.nodeScales = {};
    st.isServerMode = true;
    st.attemptCount = 0;
    setVerified(false);
    setAttempts(0);
    setStatus('按高亮顺序点击节点');
  }, []);

  /* 根据 serverOrder prop 切换模式 */
  useEffect(() => {
    if (serverOrder && Array.isArray(serverOrder) && serverOrder.length > 0) {
      applyServerChallenge(serverOrder);
    } else if (!serverOrder) {
      generateLocalChallenge();
    }
  }, [serverOrder, applyServerChallenge, generateLocalChallenge]);

  const resetAttempt = useCallback(() => {
    const st = stateRef.current;
    if (st.isVerified) return;
    st.userSequence = [];
    st.successfulEdges = [];
    st.lastActiveNodeId = null;
    st.isDragging = false;
    st.nodeScales = {};
    setStatus('序列已重置，请重试');
  }, []);

  useImperativeHandle(ref, () => ({
    reset: resetAttempt,
    newChallenge: generateLocalChallenge,
    isVerified: () => stateRef.current.isVerified,
  }));

  const completeVerification = useCallback((success) => {
    const st = stateRef.current;
    if (st.isVerified) return success;
    if (success) {
      st.isVerified = true; setVerified(true); setStatus('验证通过');
      // 服务端模式: 传 answer 字符串给父组件去后端验证
      // 本地模式: 直接回调
      const answer = st.isServerMode ? st.userSequence.join(',') : undefined;
      onVerified?.(answer);
      return true;
    }
    st.attemptCount++;
    setAttempts(st.attemptCount);
    triggerShake();
    if (st.attemptCount >= MAX_ATTEMPTS) {
      setStatus('超过最大尝试次数，请5分钟后再试');
      onReset?.('locked'); return false;
    }
    setStatus('顺序错误，请重试');
    st.cooldownUntil = Date.now() + COOLDOWN_MS;
    setTimeout(() => {
      if (!st.isVerified) {
        st.userSequence = []; st.successfulEdges = [];
        st.nodeScales = {};
        setStatus('按高亮顺序点击节点');
      }
    }, 800);
    return false;
  }, [onVerified, onReset, triggerShake]);

  const tryAddNode = useCallback((nodeId) => {
    const st = stateRef.current;
    if (st.isVerified) return false;
    if (st.cooldownUntil && Date.now() < st.cooldownUntil) return false;
    if (Date.now() > st.expireTime) {
      setStatus('挑战已过期');
      if (!st.isServerMode) {
        setTimeout(generateLocalChallenge, 1000);
      }
      return false;
    }
    if (st.userSequence.includes(nodeId)) return false;
    if (nodeId === st.correctOrder[st.userSequence.length]) {
      const prev = st.userSequence.length > 0 ? st.userSequence[st.userSequence.length - 1] : null;
      st.userSequence.push(nodeId);
      if (prev) st.successfulEdges.push({ from: prev, to: nodeId });
      const node = NODES.find(n => n.id === nodeId);
      if (node) spawnHitParticles(node.x, node.y);
      st.nodeScales[nodeId] = 1.4;
      if (st.userSequence.length === st.correctOrder.length) completeVerification(true);
      return true;
    }
    completeVerification(false);
    return false;
  }, [generateLocalChallenge, completeVerification, spawnHitParticles]);

  const getNodeUnderCursor = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const cx = (clientX - rect.left) * (canvas.width / rect.width);
    const cy = (clientY - rect.top) * (canvas.height / rect.height);
    for (const node of NODES) {
      if (Math.hypot(node.x - cx, node.y - cy) < 28) return node.id;
    }
    return null;
  }, []);

  const onPointerDown = useCallback((e) => {
    const st = stateRef.current;
    if (st.isVerified || st.attemptCount >= MAX_ATTEMPTS) return;
    if (st.cooldownUntil && Date.now() < st.cooldownUntil) return;
    const hit = getNodeUnderCursor(e.clientX, e.clientY);
    if (hit && !st.userSequence.includes(hit)) {
      st.isDragging = true; st.lastActiveNodeId = hit; tryAddNode(hit);
    } else if (!hit) {
      completeVerification(false);
    }
  }, [getNodeUnderCursor, tryAddNode, completeVerification]);

  const onPointerMove = useCallback((e) => {
    const st = stateRef.current;
    const hit = getNodeUnderCursor(e.clientX, e.clientY);
    st.hoveredNode = hit;
    if (!st.isDragging || st.isVerified || st.attemptCount >= MAX_ATTEMPTS) return;
    if (hit && hit !== st.lastActiveNodeId && !st.userSequence.includes(hit)) {
      tryAddNode(hit); st.lastActiveNodeId = hit;
    }
  }, [getNodeUnderCursor, tryAddNode]);

  const onPointerUp = useCallback(() => {
    stateRef.current.isDragging = false; stateRef.current.lastActiveNodeId = null;
  }, []);

  const onPointerLeave = useCallback(() => {
    stateRef.current.isDragging = false; stateRef.current.lastActiveNodeId = null; stateRef.current.hoveredNode = null;
  }, []);

  const locked = attempts >= MAX_ATTEMPTS;

  return (
    <div className="quantum-verify">
      <canvas
        ref={canvasRef} width={550} height={260}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerLeave={onPointerLeave}
        style={{
          width: '100%', maxWidth: 550, height: 'auto', borderRadius: '1rem',
          border: `1.5px solid ${verified ? 'var(--success)' : locked ? 'var(--danger)' : 'var(--border)'}`,
          cursor: verified ? 'default' : 'crosshair',
          touchAction: 'none', display: 'block', margin: '0 auto',
        }}
      />
      <div className="text-center mt-1.5 space-y-1">
        <div className="text-xs font-semibold" style={{ color: verified ? 'var(--success)' : locked ? 'var(--danger)' : 'var(--text)' }}>
          {verified ? <><i className="fa-solid fa-circle-check mr-1" />{status}</>
            : locked ? <><i className="fa-solid fa-lock mr-1" />{status}</>
            : <><i className="fa-solid fa-circle-info mr-1" />{status}</>}
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>尝试次数: {attempts} / {MAX_ATTEMPTS}</div>
        {!locked && !verified && (
          <div className="flex gap-2 justify-center">
            <button type="button" className="btn btn-outline btn-sm" onClick={resetAttempt} style={{ fontSize: '0.65rem', padding: '2px 10px' }}>
              <i className="fa-solid fa-rotate-left" /> 重置
            </button>
            {!stateRef.current.isServerMode && (
              <button type="button" className="btn btn-outline btn-sm" onClick={generateLocalChallenge} style={{ fontSize: '0.65rem', padding: '2px 10px' }}>
                <i className="fa-solid fa-bolt" /> 换一题
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default QuantumVerify;
