import { useState, useEffect, useRef } from 'react';

const ICON_URL = 'https://img.abdl-space.top/file/1779879250278_ABDL_icon.svg';

/**
 * ABDL Space 高级加载动画
 * 科技感：图标 + 扫描光线 + 脉冲光环 + 淡入
 */
export default function ABDLLoading({ size = 56, text = '加载中...', showText = true, fullscreen = false }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // 模拟进度（实际使用时可由外部控制）
    const timer = setInterval(() => {
      setProgress(p => {
        if (p >= 90) return 90; // 停在 90%，等实际加载完成
        return p + Math.random() * 8;
      });
    }, 200);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 20, padding: fullscreen ? '0' : '60px 20px',
      ...(fullscreen ? { position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg)' } : {}),
    }}>
      {/* 图标容器 */}
      <div style={{ position: 'relative', width: size * 2, height: size * 2 }}>
        {/* 外环脉冲 */}
        <div style={{
          position: 'absolute', inset: -8, borderRadius: '50%',
          border: '2px solid var(--primary)',
          opacity: 0.3,
          animation: 'loadingPulseRing 2s ease-out infinite',
        }} />
        <div style={{
          position: 'absolute', inset: -16, borderRadius: '50%',
          border: '1px solid var(--primary)',
          opacity: 0.15,
          animation: 'loadingPulseRing 2s ease-out 0.5s infinite',
        }} />

        {/* 图标 */}
        <img
          src={ICON_URL}
          alt="加载中"
          style={{
            width: size, height: size,
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            animation: 'loadingIconBreathe 2s ease-in-out infinite',
            filter: 'drop-shadow(0 4px 16px rgba(106, 174, 200, 0.4))',
          }}
        />

        {/* 扫描光线 */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', left: '10%', right: '10%', height: 2,
            background: 'linear-gradient(90deg, transparent, var(--primary), transparent)',
            animation: 'loadingScanLine 2s ease-in-out infinite',
            boxShadow: '0 0 12px var(--primary)',
          }} />
        </div>

        {/* 旋转弧线 */}
        <svg
          viewBox="0 0 100 100"
          style={{
            position: 'absolute', inset: -4, width: 'calc(100% + 8px)', height: 'calc(100% + 8px)',
            animation: 'loadingSpin 1.8s linear infinite',
          }}
        >
          <circle
            cx="50" cy="50" r="46"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="60 230"
            opacity="0.6"
          />
        </svg>
      </div>

      {/* 进度条 */}
      <div style={{
        width: 120, height: 3, borderRadius: 2,
        background: 'var(--border)', overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 2,
          background: 'linear-gradient(90deg, var(--primary), var(--accent))',
          width: `${progress}%`,
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* 文字 */}
      {showText && (
        <span style={{
          fontSize: 13, color: 'var(--text-muted)',
          animation: 'loadingTextFade 1.5s ease-in-out infinite',
        }}>
          {text}
        </span>
      )}

      <style>{`
        @keyframes loadingPulseRing {
          0% { transform: scale(0.8); opacity: 0.4; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes loadingIconBreathe {
          0%, 100% { transform: translate(-50%, -50%) scale(0.92); opacity: 0.7; }
          50% { transform: translate(-50%, -50%) scale(1.05); opacity: 1; }
        }
        @keyframes loadingScanLine {
          0% { top: 10%; opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { top: 90%; opacity: 0; }
        }
        @keyframes loadingSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes loadingTextFade {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/**
 * 简化版内联加载图标（用于按钮内等小尺寸场景）
 */
export function IconSpinner({ size = 20, style = {} }) {
  return (
    <img
      src={ICON_URL}
      alt=""
      style={{
        width: size, height: size,
        animation: 'iconPulse 1.2s ease-in-out infinite',
        ...style,
      }}
    />
  );
}
