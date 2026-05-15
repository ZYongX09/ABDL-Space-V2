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

const QuantumVerify = forwardRef(function QuantumVerify({ onVerified, onReset }, ref) {
  const canvasRef = useRef(null);
  const initAttempts = useRef(getSavedAttempts()).current;

  const stateRef = useRef({
    correctOrder: [], userSequence: [], successfulEdges: [],
    isVerified: false, attemptCount: initAttempts,
    expireTime: 0, isDragging: false, lastActiveNodeId: null,
    cooldownUntil: 0, hoveredNode: null,
  });

  const [status, setStatus] = useState('按高亮顺序点击节点');
  const [attempts, setAttempts] = useState(initAttempts);
  const [verified, setVerified] = useState(false);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const st = stateRef.current;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 网格
    ctx.strokeStyle = 'rgba(168, 216, 240, 0.12)';
    ctx.lineWidth = 0.6;
    for (let i = 0; i < canvas.width; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 40) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    // 已连接路径
    for (const edge of st.successfulEdges) {
      const fromN = NODES.find(n => n.id === edge.from);
      const toN = NODES.find(n => n.id === edge.to);
      if (fromN && toN) {
        const grad = ctx.createLinearGradient(fromN.x, fromN.y, toN.x, toN.y);
        grad.addColorStop(0, '#A8D8F0'); grad.addColorStop(1, '#FFB7C5');
        ctx.beginPath(); ctx.moveTo(fromN.x, fromN.y); ctx.lineTo(toN.x, toN.y);
        ctx.strokeStyle = grad; ctx.lineWidth = 4;
        ctx.shadowBlur = 8; ctx.shadowColor = '#A8D8F0'; ctx.stroke(); ctx.shadowBlur = 0;
      }
    }

    // 获取下一个正确节点
    const nextId = !st.isVerified && st.userSequence.length < st.correctOrder.length
      ? st.correctOrder[st.userSequence.length] : null;

    // 节点
    for (const node of NODES) {
      const activated = st.userSequence.includes(node.id);
      const isNext = node.id === nextId;
      const hovered = st.hoveredNode === node.id && !activated;

      // 下一个节点：高亮光圈
      if (isNext) {
        const t = Date.now() / 200;
        const r = 26 + Math.sin(t) * 3;
        ctx.beginPath(); ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 183, 197, ${0.5 + Math.sin(t) * 0.3})`;
        ctx.lineWidth = 2.5; ctx.stroke();
      }

      // 悬停外圈
      if (hovered) {
        ctx.beginPath(); ctx.arc(node.x, node.y, 24, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(168, 216, 240, 0.5)';
        ctx.lineWidth = 2.5; ctx.stroke();
      }

      // 外圈
      ctx.beginPath(); ctx.arc(node.x, node.y, 18, 0, Math.PI * 2);
      ctx.fillStyle = activated ? 'rgba(168, 216, 240, 0.35)' : isNext ? 'rgba(255, 183, 197, 0.2)' : hovered ? 'rgba(168, 216, 240, 0.25)' : 'rgba(168, 216, 240, 0.1)';
      ctx.fill();

      // 内圈
      ctx.beginPath(); ctx.arc(node.x, node.y, 12, 0, Math.PI * 2);
      ctx.fillStyle = activated ? '#A8D8F0' : isNext ? '#F0A0B8' : hovered ? '#8CC8E8' : '#6AAEC8';
      ctx.fill();

      // 中心点
      ctx.beginPath(); ctx.arc(node.x, node.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();

      // 标签
      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = activated ? '#A8D8F0' : isNext ? '#FFB7C5' : hovered ? '#A8D8F0' : '#7F8C9B';
      ctx.shadowBlur = (activated || isNext || hovered) ? 6 : 2;
      ctx.shadowColor = (activated || isNext) ? '#A8D8F0' : 'transparent';
      ctx.fillText(node.id, node.x - 7, node.y - 14);
      ctx.shadowBlur = 0;
    }

    // 水印
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(127, 140, 155, 0.4)';
    ctx.textAlign = 'right';
    ctx.fillText('ABDL-Space CAPTCHA', canvas.width - 10, canvas.height - 8);
    ctx.textAlign = 'start';

    if (st.isVerified) {
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = 'rgba(123, 198, 126, 0.7)';
      ctx.fillText('验证通过', canvas.width / 2 - 44, canvas.height - 12);
    }
  }, []);

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
    if (st.attemptCount >= MAX_ATTEMPTS) {
      setStatus('超过最大尝试次数，请5分钟后再试');
      onReset?.('locked'); return false;
    }
    setStatus('顺序错误，请重试');
    st.cooldownUntil = Date.now() + COOLDOWN_MS;
    setTimeout(() => {
      if (!st.isVerified) {
        st.userSequence = []; st.successfulEdges = [];
        setStatus('按高亮顺序点击节点');
      }
    }, 800);
    return false;
  }, [onVerified, onReset]);

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
      if (st.userSequence.length === st.correctOrder.length) completeVerification(true);
      return true;
    }
    completeVerification(false);
    return false;
  }, [generateChallenge, completeVerification]);

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
      // 点击空白区域，判为失败
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
