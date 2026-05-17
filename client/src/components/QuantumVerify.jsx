import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

const NODES = [
  { id: 'α', x: 90, y: 65 },
  { id: 'β', x: 270, y: 45 },
  { id: 'γ', x: 440, y: 75 },
  { id: 'δ', x: 400, y: 195 },
  { id: 'ε', x: 140, y: 210 },
];

const MAX_ATTEMPTS = 5;
const LOCK_DURATION = 300000;
const CHALLENGE_TTL = 30000;
const COOLDOWN_MS = 2000;
const LS_KEYS = ['qv_attempts', 'qv_a', 'qv_t'];

function getSavedAttempts() {
  try {
    let maxCount = 0;
    for (const key of LS_KEYS) {
      const saved = localStorage.getItem(key);
      if (saved) {
        const data = JSON.parse(saved);
        if (Date.now() - data.ts < LOCK_DURATION) maxCount = Math.max(maxCount, data.count);
        else localStorage.removeItem(key);
      }
    }
    return maxCount;
  } catch { return 0; }
}
function saveAttempts(count) {
  const payload = JSON.stringify({ count, ts: Date.now() });
  try { for (const key of LS_KEYS) localStorage.setItem(key, payload); } catch {}
}
function clearAttempts() {
  try { for (const key of LS_KEYS) localStorage.removeItem(key); } catch {}
}
function seededRandom(seed) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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

const QuantumVerify = forwardRef(function QuantumVerify({ onVerified, onReset }, ref) {
  const canvasRef = useRef(null);
  const initAttempts = useRef(getSavedAttempts()).current;

  const stateRef = useRef({
    correctOrder: [], userSequence: [], successfulEdges: [],
    isVerified: false, attemptCount: initAttempts,
    expireTime: 0, isDragging: false, lastActiveNodeId: null,
    cooldownUntil: 0, hoveredNode: null,
    // 动画状态
    particles: [],
    bgParticles: [],
    edgeDashOffset: 0,
    nodeScales: {},
    shakeX: 0, shakeY: 0, shakeFrames: 0,
    successBurst: false,
    bgInit: false,
  });

  const [status, setStatus] = useState('按高亮顺序点击节点');
  const [attempts, setAttempts] = useState(initAttempts);
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

    // 检测主题
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const isDark = theme === 'dark';
    const isColorful = theme === 'colorful';
    // 主题适配色
    const gridColor = isDark ? 'rgba(100, 120, 150, 0.12)' : isColorful ? 'rgba(140, 100, 180, 0.12)' : 'rgba(168, 216, 240, 0.1)';
    const labelDefault = isDark ? '#A0AAB8' : isColorful ? '#6B5B8A' : '#7F8C9B';
    const nodeDefaultFill = isDark ? '#4A5568' : isColorful ? 'rgba(140, 100, 180, 0.2)' : 'rgba(168, 216, 240, 0.08)';
    const nodeDefaultInner = isDark ? '#718096' : isColorful ? '#9B7DC8' : '#6AAEC8';
    const centerDot = isDark ? 'rgba(255,255,255,0.8)' : '#fff';

    // 初始化背景粒子
    if (!st.bgInit) {
      for (let i = 0; i < 20; i++) st.bgParticles.push(new BgParticle(canvas.width, canvas.height));
      st.bgInit = true;
    }

    // 抖动偏移
    let sx = 0, sy = 0;
    if (st.shakeFrames > 0) {
      sx = (Math.random() - 0.5) * 6;
      sy = (Math.random() - 0.5) * 4;
      st.shakeFrames--;
    }

    ctx.save();
    ctx.translate(sx, sy);
    ctx.clearRect(-10, -10, canvas.width + 20, canvas.height + 20);

    // 背景粒子
    for (const p of st.bgParticles) { p.update(); p.draw(ctx); }

    // 网格
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    st.edgeDashOffset -= 0.3;
    for (let i = 0; i < canvas.width; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 40) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // 已连接路径 — 流光效果
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

    // 粒子更新 & 绘制
    st.particles = st.particles.filter(p => { p.update(); p.draw(ctx); return !p.dead; });

    // 获取下一个正确节点
    const nextId = !st.isVerified && st.userSequence.length < st.correctOrder.length
      ? st.correctOrder[st.userSequence.length] : null;

    // 节点
    for (const node of NODES) {
      const activated = st.userSequence.includes(node.id);
      const isNext = node.id === nextId;
      const hovered = st.hoveredNode === node.id && !activated;

      // 节点缩放动画
      if (!st.nodeScales[node.id]) st.nodeScales[node.id] = 1;
      const targetScale = activated ? 1.15 : hovered ? 1.08 : 1;
      st.nodeScales[node.id] += (targetScale - st.nodeScales[node.id]) * 0.2;
      const sc = st.nodeScales[node.id];

      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.scale(sc, sc);

      // 下一个节点：呼吸光圈
      if (isNext) {
        const t = Date.now() / 250;
        const pulse = Math.sin(t) * 0.5 + 0.5;
        const r = 26 + pulse * 5;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 183, 197, ${0.3 + pulse * 0.4})`;
        ctx.lineWidth = 2; ctx.stroke();
        // 外扩散环
        const r2 = 32 + pulse * 8;
        ctx.beginPath(); ctx.arc(0, 0, r2, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 183, 197, ${0.08 + pulse * 0.1})`;
        ctx.lineWidth = 1; ctx.stroke();
      }

      // 悬停外圈
      if (hovered) {
        ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(168, 216, 240, 0.5)';
        ctx.lineWidth = 2.5; ctx.stroke();
      }

      // 外圈
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fillStyle = activated ? 'rgba(168, 216, 240, 0.35)' : isNext ? 'rgba(255, 183, 197, 0.2)' : hovered ? 'rgba(168, 216, 240, 0.25)' : nodeDefaultFill;
      ctx.fill();

      // 内圈
      ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fillStyle = activated ? '#A8D8F0' : isNext ? '#F0A0B8' : hovered ? '#8CC8E8' : nodeDefaultInner;
      ctx.fill();

      // 中心点 — 闪烁
      const blink = 0.7 + Math.sin(Date.now() / 300 + node.x) * 0.3;
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${isDark ? '255,255,255' : '255,255,255'},${blink})`;
      ctx.fill();

      // 标签
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = activated ? '#A8D8F0' : isNext ? '#FFB7C5' : hovered ? '#A8D8F0' : labelDefault;
      ctx.shadowBlur = (activated || isNext || hovered) ? 8 : 2;
      ctx.shadowColor = (activated || isNext) ? '#A8D8F0' : 'transparent';
      ctx.fillText(node.id, -7, -16);
      ctx.shadowBlur = 0;

      ctx.restore();
    }

    // 水印
    ctx.font = '10px sans-serif';
    ctx.fillStyle = isDark ? 'rgba(160, 170, 185, 0.3)' : isColorful ? 'rgba(100, 80, 140, 0.3)' : 'rgba(127, 140, 155, 0.35)';
    ctx.textAlign = 'right';
    ctx.fillText('ABDL-Space CAPTCHA', canvas.width - 10, canvas.height - 8);
    ctx.textAlign = 'start';

    if (st.isVerified) {
      // 验证通过 — 渐入文字
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

    // 触发验证通过粒子爆炸
    if (st.isVerified && !st.successBurst) {
      st.successBurst = true;
      st.verifyTime = Date.now();
      spawnSuccessBurst(canvas);
    }

    ctx.restore();
  }, [spawnSuccessBurst]);

  useEffect(() => {
    let running = true;
    const loop = () => { if (!running) return; drawCanvas(); requestAnimationFrame(loop); };
    loop();
    return () => { running = false; };
  }, [drawCanvas]);

  const generateChallenge = useCallback(() => {
    const st = stateRef.current;
    const seed = Date.now() + Math.random() * 999999;
    const rng = seededRandom(seed);
    st.correctOrder = shuffle(['α', 'β', 'γ', 'δ', 'ε'], rng);
    st.userSequence = [];
    st.successfulEdges = [];
    st.isVerified = false;
    st.expireTime = Date.now() + CHALLENGE_TTL;
    st.cooldownUntil = 0;
    st.successBurst = false;
    st.verifyTime = 0;
    st.nodeScales = {};
    setVerified(false);
    setStatus('按高亮顺序点击节点');
  }, []);

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
    newChallenge: generateChallenge,
    isVerified: () => stateRef.current.isVerified,
  }));

  const completeVerification = useCallback((success) => {
    const st = stateRef.current;
    if (st.isVerified) return success;
    if (success) {
      st.isVerified = true; setVerified(true); setStatus('验证通过');
      clearAttempts(); onVerified?.(); return true;
    }
    st.attemptCount++;
    setAttempts(st.attemptCount);
    saveAttempts(st.attemptCount);
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
      setStatus('挑战已过期，正在刷新...');
      setTimeout(generateChallenge, 1000); return false;
    }
    if (st.userSequence.includes(nodeId)) return false;
    if (nodeId === st.correctOrder[st.userSequence.length]) {
      const prev = st.userSequence.length > 0 ? st.userSequence[st.userSequence.length - 1] : null;
      st.userSequence.push(nodeId);
      if (prev) st.successfulEdges.push({ from: prev, to: nodeId });
      // 粒子爆发
      const node = NODES.find(n => n.id === nodeId);
      if (node) spawnHitParticles(node.x, node.y);
      // 缩放弹跳
      st.nodeScales[nodeId] = 1.4;
      if (st.userSequence.length === st.correctOrder.length) completeVerification(true);
      return true;
    }
    completeVerification(false);
    return false;
  }, [generateChallenge, completeVerification, spawnHitParticles]);

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
    if (st.showOrderUntil && Date.now() < st.showOrderUntil) return;
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

  useEffect(() => { generateChallenge(); }, [generateChallenge]);

  const locked = attempts >= MAX_ATTEMPTS;

  // 挂载时检查是否已锁定
  useEffect(() => {
    if (initAttempts >= MAX_ATTEMPTS) {
      setStatus('超过最大尝试次数，请5分钟后再试');
      onReset?.('locked');
    }
  }, []);

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
            <button type="button" className="btn btn-outline btn-sm" onClick={generateChallenge} style={{ fontSize: '0.65rem', padding: '2px 10px' }}>
              <i className="fa-solid fa-bolt" /> 换一题
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export default QuantumVerify;
