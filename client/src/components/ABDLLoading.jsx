import { useState, useEffect, useRef } from 'react';

const ICON_URL = 'https://img.abdl-space.top/file/1779879250278_ABDL_icon.svg';

/**
 * ABDL Space 加载动画
 *
 * 动画流程：
 * 1. 描边循环扫描（无限循环，直到内容加载完成）
 * 2. 内载完成 → 描边归位 + 一笔绘制完整轮廓
 * 3. 填充层淡入 → 完成
 */
export default function ABDLLoading({ size = 48, text = '加载中...', showText = true }) {
  const [phase, setPhase] = useState('scanning'); // scanning | drawing | done
  const pathRef = useRef(null);
  const strokeRef = useRef(null);
  const fillRef = useRef(null);
  const animRef = useRef(null);
  const scanOffsetRef = useRef(0);

  // 简化的奶瓶轮廓路径
  const BOTTLE_PATH = `
    M 50 10
    C 50 10, 65 10, 65 25
    L 65 35
    C 65 35, 75 40, 78 55
    C 82 75, 80 95, 80 110
    C 80 130, 75 155, 70 165
    C 65 175, 65 180, 65 185
    L 65 190
    C 65 195, 55 200, 50 200
    C 45 200, 35 195, 35 190
    L 35 185
    C 35 180, 35 175, 30 165
    C 25 155, 20 130, 20 110
    C 20 95, 18 75, 22 55
    C 25 40, 35 35, 35 35
    L 35 25
    C 35 10, 50 10, 50 10
    Z
    M 30 55
    C 30 45, 70 45, 70 55
  `.trim();

  useEffect(() => {
    const path = pathRef.current;
    const stroke = strokeRef.current;
    if (!path || !stroke) return;

    const length = path.getTotalLength();
    const dashLen = length / 3;

    // 初始状态：描边虚线
    stroke.style.strokeDasharray = `${dashLen} ${length - dashLen}`;

    // 扫描动画循环
    function scanLoop() {
      scanOffsetRef.current = (scanOffsetRef.current + 1.5) % length;
      stroke.style.strokeDashoffset = -scanOffsetRef.current;
      animRef.current = requestAnimationFrame(scanLoop);
    }

    scanLoop();

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // 外部通知内容加载完成时调用
  useEffect(() => {
    if (phase !== 'drawing') return;

    const path = pathRef.current;
    const stroke = strokeRef.current;
    const fill = fillRef.current;
    if (!path || !stroke || !fill) return;

    const length = path.getTotalLength();

    // 停止扫描
    if (animRef.current) cancelAnimationFrame(animRef.current);

    // 归位动画
    const startOffset = scanOffsetRef.current;
    const duration = 1800;
    const startTime = performance.now();

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function animate(now) {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = easeInOutCubic(t);

      // 前 40% 时间：归位（从当前位置到 0）
      // 后 60% 时间：一笔绘制（从 length 到 0）
      if (t < 0.4) {
        const phaseT = t / 0.4;
        stroke.style.strokeDasharray = `${length}`;
        stroke.style.strokeDashoffset = startOffset * (1 - easeInOutCubic(phaseT));
      } else {
        const phaseT = (t - 0.4) / 0.6;
        stroke.style.strokeDasharray = `${length}`;
        stroke.style.strokeDashoffset = length * (1 - easeInOutCubic(phaseT));
      }

      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        // 动画完成：显示填充，隐藏描边
        fill.style.transition = 'opacity 0.4s ease';
        fill.style.opacity = '1';
        stroke.style.transition = 'opacity 0.3s ease';
        stroke.style.opacity = '0';
        setPhase('done');
      }
    }

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [phase]);

  // 当外部数据加载完成后切换到 drawing 阶段
  const complete = () => setPhase('drawing');

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12, padding: '40px 0',
    }}>
      <svg
        viewBox="0 0 100 210"
        width={size}
        height={size * 2.1}
        style={{ overflow: 'visible' }}
      >
        {/* 底层：彩色填充（初始透明） */}
        <image
          ref={fillRef}
          href={ICON_URL}
          x="0" y="0" width="100" height="100"
          opacity="0"
          preserveAspectRatio="xMidYMid meet"
        />
        {/* 顶层：描边层 */}
        <path
          ref={pathRef}
          d={BOTTLE_PATH}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: 'scale(0.42) translate(10px, 10px)', transformOrigin: 'top left' }}
        />
        <path
          ref={strokeRef}
          d={BOTTLE_PATH}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: 'scale(0.42) translate(10px, 10px)', transformOrigin: 'top left' }}
        />
      </svg>
      {showText && (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{text}</span>
      )}
    </div>
  );
}

/**
 * 简化版 Spinner — 替代原 .spinner 圆环
 * 直接使用图标 + 脉冲动画，用于内联小尺寸场景
 */
export function IconSpinner({ size = 36 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 0',
    }}>
      <img
        src={ICON_URL}
        alt="加载中"
        style={{
          width: size, height: size,
          animation: 'iconPulse 1.2s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes iconPulse {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.05); }
        }
      `}</style>
    </div>
  );
}
