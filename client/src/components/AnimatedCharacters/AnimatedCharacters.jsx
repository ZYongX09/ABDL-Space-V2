import { useState, useEffect, useRef, useCallback } from 'react';
import './AnimatedCharacters.css';

/* ===== 眼球组件：接收鼠标坐标 prop ===== */
function EyeBall({ size = 48, pupilSize = 16, maxDistance = 10, eyeColor, pupilColor, isBlinking, forceLookX, forceLookY, mouseX, mouseY }) {
  const eyeRef = useRef(null);

  const calcPos = () => {
    if (forceLookX !== undefined && forceLookY !== undefined) return { x: forceLookX, y: forceLookY };
    if (!eyeRef.current) return { x: 0, y: 0 };
    const r = eyeRef.current.getBoundingClientRect();
    const dx = mouseX - (r.left + r.width / 2);
    const dy = mouseY - (r.top + r.height / 2);
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
    const angle = Math.atan2(dy, dx);
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
  };
  const pos = calcPos();

  return (
    <div ref={eyeRef} className="ac-eye" style={{
      width: size, height: isBlinking ? 2 : size,
      backgroundColor: eyeColor,
    }}>
      {!isBlinking && <div className="ac-pupil" style={{
        width: pupilSize, height: pupilSize,
        backgroundColor: pupilColor,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
      }} />}
    </div>
  );
}

/* ===== 纯瞳孔组件（无眼白） ===== */
function Pupil({ size = 12, maxDistance = 5, pupilColor, forceLookX, forceLookY, mouseX, mouseY }) {
  const ref = useRef(null);

  const calcPos = () => {
    if (forceLookX !== undefined && forceLookY !== undefined) return { x: forceLookX, y: forceLookY };
    if (!ref.current) return { x: 0, y: 0 };
    const r = ref.current.getBoundingClientRect();
    const dx = mouseX - (r.left + r.width / 2);
    const dy = mouseY - (r.top + r.height / 2);
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), maxDistance);
    const angle = Math.atan2(dy, dx);
    return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
  };
  const pos = calcPos();

  return (
    <div ref={ref} className="ac-pupil-raw" style={{
      width: size, height: size,
      backgroundColor: pupilColor,
      transform: `translate(${pos.x}px, ${pos.y}px)`,
    }} />
  );
}

/* ===== 主组件 ===== */
export default function AnimatedCharacters({ isTyping = false, showPassword = false, passwordLength = 0 }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [blink1, setBlink1] = useState(false);
  const [blink2, setBlink2] = useState(false);
  const [lookEachOther, setLookEachOther] = useState(false);
  const [peeking, setPeeking] = useState(false);
  const rafRef = useRef(null);
  const blink1Ref = useRef({ outer: null, inner: null });
  const blink2Ref = useRef({ outer: null, inner: null });
  const peekRef = useRef({ outer: null, inner: null });
  const ref1 = useRef(null);
  const ref2 = useRef(null);
  const ref3 = useRef(null);
  const ref4 = useRef(null);

  // 单一 mousemove 监听 + rAF 节流
  useEffect(() => {
    const onMove = (e) => {
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          setMousePos({ x: e.clientX, y: e.clientY });
          rafRef.current = null;
        });
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // 眨眼 1（修复：追踪内外层 timeout）
  useEffect(() => {
    const t = blink1Ref.current;
    const schedule = () => {
      t.outer = setTimeout(() => {
        setBlink1(true);
        t.inner = setTimeout(() => { setBlink1(false); schedule(); }, 150);
      }, Math.random() * 4000 + 3000);
    };
    schedule();
    return () => { clearTimeout(t.outer); clearTimeout(t.inner); };
  }, []);

  // 眨眼 2
  useEffect(() => {
    const t = blink2Ref.current;
    const schedule = () => {
      t.outer = setTimeout(() => {
        setBlink2(true);
        t.inner = setTimeout(() => { setBlink2(false); schedule(); }, 150);
      }, Math.random() * 4000 + 3000);
    };
    schedule();
    return () => { clearTimeout(t.outer); clearTimeout(t.inner); };
  }, []);

  // 输入时互看
  useEffect(() => {
    if (isTyping) {
      setLookEachOther(true);
      const t = setTimeout(() => setLookEachOther(false), 800);
      return () => clearTimeout(t);
    }
    setLookEachOther(false);
  }, [isTyping]);

  // 显示密码时反复偷看（有意设计，用 setTimeout 链实现）
  useEffect(() => {
    const t = peekRef.current;
    if (passwordLength > 0 && showPassword) {
      const schedule = () => {
        t.outer = setTimeout(() => {
          setPeeking(true);
          t.inner = setTimeout(() => { setPeeking(false); schedule(); }, 800);
        }, Math.random() * 3000 + 2000);
      };
      schedule();
    } else {
      setPeeking(false);
    }
    return () => { clearTimeout(t.outer); clearTimeout(t.inner); };
  }, [passwordLength, showPassword]); // 修复：移除 peeking 自引用

  const calcPos = (ref) => {
    if (!ref.current) return { fx: 0, fy: 0, skew: 0 };
    const r = ref.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 3;
    const dx = mousePos.x - cx;
    const dy = mousePos.y - cy;
    return {
      fx: Math.max(-15, Math.min(15, dx / 20)),
      fy: Math.max(-10, Math.min(10, dy / 30)),
      skew: Math.max(-6, Math.min(6, -dx / 120)),
    };
  };

  const p1 = calcPos(ref1);
  const p2 = calcPos(ref2);
  const p3 = calcPos(ref3);
  const p4 = calcPos(ref4);
  const isHiding = passwordLength > 0 && !showPassword;
  const isRevealing = passwordLength > 0 && showPassword;
  const mx = mousePos.x;
  const my = mousePos.y;

  return (
    <div className="ac-container">
      {/* 蓝色高个 — 后层 */}
      <div ref={ref1} className="ac-char ac-char-1" style={{
        height: (isTyping || isHiding) ? 280 : 250,
        transform: isRevealing ? 'skewX(0deg)' :
          (isTyping || isHiding) ? `skewX(${(p1.skew || 0) - 12}deg) translateX(25px)` :
          `skewX(${p1.skew || 0}deg)`,
      }}>
        <div className="ac-eyes" style={{
          left: isRevealing ? 18 : lookEachOther ? 42 : 34 + p1.fx,
          top: isRevealing ? 28 : lookEachOther ? 50 : 32 + p1.fy,
        }}>
          <EyeBall size={16} pupilSize={6} maxDistance={5} eyeColor="#fff" pupilColor="#2D3748"
            isBlinking={blink1} mouseX={mx} mouseY={my}
            forceLookX={isRevealing ? (peeking ? 4 : -4) : lookEachOther ? 3 : undefined}
            forceLookY={isRevealing ? (peeking ? 5 : -4) : lookEachOther ? 4 : undefined} />
          <EyeBall size={16} pupilSize={6} maxDistance={5} eyeColor="#fff" pupilColor="#2D3748"
            isBlinking={blink1} mouseX={mx} mouseY={my}
            forceLookX={isRevealing ? (peeking ? 4 : -4) : lookEachOther ? 3 : undefined}
            forceLookY={isRevealing ? (peeking ? 5 : -4) : lookEachOther ? 4 : undefined} />
        </div>
      </div>

      {/* 深蓝矮个 — 中层 */}
      <div ref={ref2} className="ac-char ac-char-2" style={{
        transform: isRevealing ? 'skewX(0deg)' :
          lookEachOther ? `skewX(${(p2.skew || 0) * 1.5 + 10}deg) translateX(14px)` :
          (isTyping || isHiding) ? `skewX(${(p2.skew || 0) * 1.5}deg)` :
          `skewX(${p2.skew || 0}deg)`,
      }}>
        <div className="ac-eyes" style={{
          left: isRevealing ? 10 : lookEachOther ? 28 : 22 + p2.fx,
          top: isRevealing ? 24 : lookEachOther ? 10 : 26 + p2.fy,
        }}>
          <EyeBall size={14} pupilSize={5} maxDistance={4} eyeColor="#fff" pupilColor="#2D3748"
            isBlinking={blink2} mouseX={mx} mouseY={my}
            forceLookX={isRevealing ? -4 : lookEachOther ? 0 : undefined}
            forceLookY={isRevealing ? -4 : lookEachOther ? -4 : undefined} />
          <EyeBall size={14} pupilSize={5} maxDistance={4} eyeColor="#fff" pupilColor="#2D3748"
            isBlinking={blink2} mouseX={mx} mouseY={my}
            forceLookX={isRevealing ? -4 : lookEachOther ? 0 : undefined}
            forceLookY={isRevealing ? -4 : lookEachOther ? -4 : undefined} />
        </div>
      </div>

      {/* 粉色半圆 — 前左 */}
      <div ref={ref3} className="ac-char ac-char-3" style={{
        transform: isRevealing ? 'skewX(0deg)' : `skewX(${p3.skew || 0}deg)`,
      }}>
        <div className="ac-eyes ac-eyes-dark" style={{
          left: isRevealing ? 40 : 58 + (p3.fx || 0),
          top: isRevealing ? 65 : 68 + (p3.fy || 0),
        }}>
          <Pupil size={10} maxDistance={5} pupilColor="#2D3748" mouseX={mx} mouseY={my}
            forceLookX={isRevealing ? -5 : undefined} forceLookY={isRevealing ? -4 : undefined} />
          <Pupil size={10} maxDistance={5} pupilColor="#2D3748" mouseX={mx} mouseY={my}
            forceLookX={isRevealing ? -5 : undefined} forceLookY={isRevealing ? -4 : undefined} />
        </div>
      </div>

      {/* 浅蓝圆形 — 前右 */}
      <div ref={ref4} className="ac-char ac-char-4" style={{
        transform: isRevealing ? 'skewX(0deg)' : `skewX(${p4.skew || 0}deg)`,
      }}>
        <div className="ac-eyes ac-eyes-dark" style={{
          left: isRevealing ? 18 : 38 + (p4.fx || 0),
          top: isRevealing ? 30 : 34 + (p4.fy || 0),
        }}>
          <Pupil size={10} maxDistance={5} pupilColor="#2D3748" mouseX={mx} mouseY={my}
            forceLookX={isRevealing ? -5 : undefined} forceLookY={isRevealing ? -4 : undefined} />
          <Pupil size={10} maxDistance={5} pupilColor="#2D3748" mouseX={mx} mouseY={my}
            forceLookX={isRevealing ? -5 : undefined} forceLookY={isRevealing ? -4 : undefined} />
        </div>
        {/* 嘴巴 */}
        <div className="ac-mouth" style={{
          left: isRevealing ? 10 : 30 + (p4.fx || 0),
          top: isRevealing ? 72 : 72 + (p4.fy || 0),
        }} />
      </div>

      {/* 装饰星星 */}
      <div className="ac-star ac-star-1" />
      <div className="ac-star ac-star-2" />
      <div className="ac-star ac-star-3" />
    </div>
  );
}
