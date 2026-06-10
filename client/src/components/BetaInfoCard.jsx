import { useState, useEffect } from 'react';
import { betaInfoAPI } from '../api';

const ICON_URL = 'https://img.abdl-space.top/file/1779879250278_ABDL_icon.svg';

const DEFAULT_INFO = {
  name: 'ABDL Space 创始成员计划',
  version: 'v0.1',
  endsAt: import.meta.env.VITE_BETA_ENDS_AT || '2026-07-31T23:59:59Z',
  capacity: parseInt(import.meta.env.VITE_BETA_CAPACITY || '120', 10),
  used: 0,
  status: 'active',
};

const pad = (n) => String(n).padStart(2, '0');

/**
 * 内测活动信息卡
 * - 静态「内测」chip
 * - 标题（icon + 活动名 + 版本号）
 * - 倒计时（单行 mono 字体，tabular-nums）
 * - 名额（静态文字）
 */
export default function BetaInfoCard() {
  const [data, setData] = useState(DEFAULT_INFO);
  const [countdown, setCountdown] = useState({ d: 0, h: 0, m: 0, s: 0 });
  const [isEnded, setIsEnded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const info = await betaInfoAPI.get();
        setData((prev) => ({ ...prev, ...info }));
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const tick = () => {
      const end = new Date(data.endsAt).getTime();
      if (Number.isNaN(end)) {
        setCountdown({ d: 0, h: 0, m: 0, s: 0 });
        setIsEnded(false);
        return;
      }
      const diff = end - Date.now();
      if (diff <= 0) {
        setCountdown({ d: 0, h: 0, m: 0, s: 0 });
        setIsEnded(true);
        return;
      }
      setIsEnded(false);
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown({ d, h, m, s });
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [data.endsAt]);

  const isFull = data.status === 'full';
  const usedText = data.used > 0 ? `已报 ${data.used} 人` : null;

  return (
    <div
      className="card miui-card-in"
      style={{ padding: '20px 22px', marginBottom: '20px' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold"
          style={{ background: 'var(--beta-primary)', color: '#fff' }}
        >
          <i className="fa-solid fa-flask" style={{ fontSize: '0.65rem' }} />
          内测
        </span>
      </div>

      <h2
        className="text-base font-semibold mb-4 flex items-center gap-1.5"
        style={{ color: 'var(--text)' }}
      >
        <img src={ICON_URL} alt="" style={{ width: 16, height: 16 }} />
        <span>{data.name}</span>
      </h2>

      <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>距报名截止</p>
        {isEnded ? (
          <p className="text-sm font-semibold" style={{ color: 'var(--beta-primary-dark)' }}>
            <i className="fa-solid fa-circle-xmark mr-1" />报名已截止
          </p>
        ) : (
          <div
            className="flex items-baseline"
            style={{
              fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--text)',
            }}
          >
            <span style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>{countdown.d}</span>
            <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>天</span>
            <span className="ml-3" style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>{pad(countdown.h)}</span>
            <span className="text-xs mx-0.5" style={{ color: 'var(--text-muted)' }}>:</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>{pad(countdown.m)}</span>
            <span className="text-xs mx-0.5" style={{ color: 'var(--text-muted)' }}>:</span>
            <span style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1 }}>{pad(countdown.s)}</span>
          </div>
        )}
      </div>

      <div className="pt-3 mt-3" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-sm flex items-center" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-users mr-2" style={{ color: 'var(--text-muted)' }} />
          限额 <strong style={{ color: 'var(--beta-primary-dark)', margin: '0 4px' }}>{data.capacity}</strong> 人
          {usedText && <span style={{ color: 'var(--text-muted)' }}> · {usedText}</span>}
          {isFull && <span style={{ color: 'var(--danger)', marginLeft: '6px' }}>· 已满员</span>}
        </p>
      </div>
    </div>
  );
}
