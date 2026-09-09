import { useMemo, useState } from 'react';

/* ============================================================
   纯 SVG 图表原语（无外部依赖）
   ============================================================ */

/** 北京时区（UTC+8）今天之前 offsetDays 天的 'YYYY-MM-DD' */
export function bjDateOffset(offsetDays) {
  const p = (n) => String(n).padStart(2, '0');
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  t.setUTCDate(t.getUTCDate() + offsetDays);
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/** 把后端 [{d,c}] 序列补齐为 days 天（0 填充），末尾为今日 */
export function fillDaily(series, days) {
  const map = {};
  (series || []).forEach(s => { map[s.d] = Number(s.c) || 0; });
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = bjDateOffset(-i);
    out.push({ date, count: map[date] || 0 });
  }
  return out;
}

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / p) * p;
}

/* ───────── 多序列折线/面积图 ───────── */
export function LinesChart({ datasets, labels, height = 220, unit = '' }) {
  const [hover, setHover] = useState(null);

  const W = 900;
  const H = height;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const n = labels.length;
  const maxVal = useMemo(() => {
    let m = 0;
    datasets.forEach(ds => ds.values.forEach(v => { if (v > m) m = v; }));
    return niceMax(m);
  }, [datasets]);
  const yMax = maxVal;
  const niceStep = Math.max(1, Math.round(yMax / 4));

  const X = (i) => (n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW);
  const Y = (v) => padT + innerH - (v / yMax) * innerH;

  const buildPath = (values, area) => {
    let d = values.length ? `M ${X(0)} ${Y(values[0])}` : '';
    values.forEach((v, i) => { if (i > 0) d += ` L ${X(i)} ${Y(v)}`; });
    if (area) d += ` L ${X(values.length - 1)} ${padT + innerH} L ${X(0)} ${padT + innerH} Z`;
    return d;
  };

  const gridYs = [0, 1, 2, 3, 4].map(k => padT + (k / 4) * innerH);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }} onMouseLeave={() => setHover(null)}>
        {/* 网格 */}
        {gridYs.map((gy, k) => (
          <g key={k}>
            <line x1={padL} x2={W - padR} y1={gy} y2={gy} stroke="var(--border)" strokeWidth="1" />
            <text x={padL} y={gy - 4} fontSize="10" fill="var(--text-muted)">{Math.round(yMax * (1 - k / 4))}</text>
          </g>
        ))}
        {/* 序列 */}
        {datasets.map((ds, di) => (
          <g key={ds.label || di}>
            <defs>
              <linearGradient id={`ac-grad-${di}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ds.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={ds.color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={buildPath(ds.values, true)} fill={`url(#ac-grad-${di})`} stroke="none" opacity={0.9} />
            <path d={buildPath(ds.values, false)} fill="none" stroke={ds.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {/* X 轴日期 */}
        {[0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => (
          <text key={i} x={X(i)} y={H - 6} fontSize="10" fill="var(--text-muted)" textAnchor="middle">
            {labels[i] ? labels[i].slice(5) : ''}
          </text>
        ))}
        {/* 悬浮层 */}
        {n > 0 && (
          <rect x={padL} y={padT} width={innerW} height={innerH} fill="transparent"
            onMouseMove={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const px = ((e.clientX - rect.left) / rect.width) * innerW;
              const i = Math.round((px / innerW) * (n - 1));
              setHover({ i, x: X(i), y: Math.min(H - 8, padT + 4) });
            }} />
        )}
        {hover && (
          <g>
            <line x1={hover.x} x2={hover.x} y1={padT} y2={padT + innerH} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" />
            {datasets.map((d, di) => (
              <circle key={di} cx={hover.x} cy={Y(d.values[hover.i])} r="3.4" fill={d.color} stroke="#fff" strokeWidth="1.5" />
            ))}
          </g>
        )}
      </svg>
      {hover && (
        <div className="ac-chart-tooltip" style={{ left: '50%', top: 6, transform: 'translateX(-50%)' }}>
          <div style={{ marginBottom: 4, opacity: 0.75 }}>{labels[hover.i]}</div>
          {datasets.map((d, di) => (
            <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: d.color, display: 'inline-block' }} />
              {d.name}: <b>{d.values[hover.i]}{unit}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── 迷你走势（统计卡内） ───────── */
export function Spark({ data, color = 'var(--primary)', height = 34 }) {
  const W = 120;
  const H = 40;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) =>
    `${(i / Math.max(data.length - 1, 1)) * W},${H - 3 - ((v - min) / span) * (H - 8)}`
  ).join(' ');
  if (!data.length) return <div style={{ height }} />;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height, display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ───────── 横向条形图（分布类） ───────── */
export function HBars({ items, max, color = 'var(--primary)', unit = '' }) {
  const m = max || Math.max(...items.map(i => i.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it, i) => (
        <div key={it.label + i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12.5 }}>
            <span style={{ color: 'var(--text)', flexShrink: 0, minWidth: 64 }}>{it.label}</span>
            <span style={{ marginLeft: 'auto', color: 'var(--text-light)', fontVariantNumeric: 'tabular-nums' }}>
              {it.value}{unit}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 5, background: 'var(--input-bg)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.max((it.value / m) * 100, it.value > 0 ? 2 : 0)}%`, borderRadius: 5, background: it.color || color, transition: 'width .3s' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* 新增用户/帖子分布（overview 用：今天以外 6 天柱状） */
export function MiniBars({ data, color = 'var(--primary)' }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const W = 900;
  const H = 90;
  const bw = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', height: 90 }}>
      {data.map((d, i) => {
        const h = Math.max((d.count / max) * (H - 22), d.count > 0 ? 2 : 0);
        return (
          <g key={d.date + i}>
            <rect x={bw * i + bw * 0.18} y={H - 8 - h} width={bw * 0.64} height={h} rx="2" fill={color} opacity={d.count > 0 ? 1 : 0.08} />
            <text x={bw * i + bw / 2} y={H - 8 - h - 4} fontSize="9" fill="var(--text-muted)" textAnchor="middle">{d.count > 0 ? d.count : ''}</text>
          </g>
        );
      })}
    </svg>
  );
}