import { useEffect, useId, useMemo, useState } from 'react';

/** 北京时区（UTC+8）今天之前 offsetDays 天的 YYYY-MM-DD。 */
export function bjDateOffset(offsetDays) {
  const pad = value => String(value).padStart(2, '0');
  const date = new Date(Date.now() + 8 * 3600 * 1000);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function fillDaily(series, days) {
  const map = {};
  (series || []).forEach(item => { map[item.d] = Number(item.c) || 0; });
  const output = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = bjDateOffset(-index);
    output.push({ date, count: map[date] || 0 });
  }
  return output;
}

function niceMax(value) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / power) * power;
}

export function LinesChart({ datasets, labels, height = 220, unit = '', title = '数据趋势图' }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const gradientPrefix = useId().replace(/:/g, '');
  const width = 900;
  const chartHeight = height;
  const padLeft = 24;
  const padRight = 8;
  const padTop = 18;
  const padBottom = 28;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = chartHeight - padTop - padBottom;
  const count = labels.length;

  useEffect(() => {
    setActiveIndex(current => current == null || count <= 0 ? null : Math.min(current, count - 1));
  }, [count]);

  const yMax = useMemo(() => {
    let max = 0;
    datasets.forEach(dataset => dataset.values.forEach(value => { if (value > max) max = value; }));
    return niceMax(max);
  }, [datasets]);

  const x = index => count <= 1 ? padLeft + innerWidth / 2 : padLeft + (index / (count - 1)) * innerWidth;
  const y = value => padTop + innerHeight - (value / yMax) * innerHeight;
  const buildPath = (values, area) => {
    if (!values.length) return '';
    let path = `M ${x(0)} ${y(values[0])}`;
    values.forEach((value, index) => { if (index > 0) path += ` L ${x(index)} ${y(value)}`; });
    if (area) path += ` L ${x(values.length - 1)} ${padTop + innerHeight} L ${x(0)} ${padTop + innerHeight} Z`;
    return path;
  };
  const gridRows = [0, 1, 2, 3, 4];
  const displayedDates = [0, Math.floor(count / 4), Math.floor(count / 2), Math.floor((3 * count) / 4), count - 1]
    .filter((value, index, all) => value >= 0 && all.indexOf(value) === index);

  const selectFromPointer = event => {
    if (!count) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * innerWidth;
    setActiveIndex(Math.max(0, Math.min(count - 1, Math.round((px / innerWidth) * (count - 1)))));
  };

  const summary = datasets.map(dataset => {
    const total = dataset.values.reduce((sum, value) => sum + Number(value || 0), 0);
    return `${dataset.name}合计 ${total}${unit}`;
  }).join('，');

  return (
    <div className="ac-chart">
      <div className="ac-chart-legend" aria-hidden="true">
        {datasets.map(dataset => (
          <span className="ac-chart-legend-item" key={dataset.name}>
            <span className="ac-chart-dot" style={{ background: dataset.color }} />
            {dataset.name}
          </span>
        ))}
      </div>
      <div className="ac-chart-viewport" onPointerLeave={() => setActiveIndex(null)}>
      <svg viewBox={`0 0 ${width} ${chartHeight}`} role="img" aria-label={`${title}。${summary}`}>
        <title>{title}</title>
        <desc>{summary}</desc>
        {gridRows.map(row => {
          const gridY = padTop + (row / 4) * innerHeight;
          return (
            <g key={row}>
              <line x1={padLeft} x2={width - padRight} y1={gridY} y2={gridY} stroke="#e2e7ec" strokeWidth="1" />
              <text x={padLeft - 5} y={gridY + 3} fontSize="10" fill="#66758a" textAnchor="end">{Math.round(yMax * (1 - row / 4))}</text>
            </g>
          );
        })}
        {datasets.map((dataset, datasetIndex) => (
          <g key={dataset.name || datasetIndex}>
            <defs>
              <linearGradient id={`${gradientPrefix}-gradient-${datasetIndex}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={dataset.color} stopOpacity="0.16" />
                <stop offset="100%" stopColor={dataset.color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={buildPath(dataset.values, true)} fill={`url(#${gradientPrefix}-gradient-${datasetIndex})`} stroke="none" />
            <path d={buildPath(dataset.values, false)} fill="none" stroke={dataset.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {displayedDates.map(index => (
          <text key={index} x={x(index)} y={chartHeight - 7} fontSize="10" fill="#66758a" textAnchor="middle">
            {labels[index]?.slice(5) || ''}
          </text>
        ))}
        {activeIndex != null && (
          <g aria-hidden="true">
            <line x1={x(activeIndex)} x2={x(activeIndex)} y1={padTop} y2={padTop + innerHeight} stroke="#7b899a" strokeWidth="1" strokeDasharray="3 3" />
            {datasets.map((dataset, index) => (
              <circle key={dataset.name || index} cx={x(activeIndex)} cy={y(dataset.values[activeIndex])} r="3.5" fill={dataset.color} stroke="#ffffff" strokeWidth="1.5" />
            ))}
          </g>
        )}
      </svg>
      {count > 0 && (
        <div
          className="ac-chart-pointer"
          aria-hidden="true"
          onPointerMove={selectFromPointer}
          onPointerDown={selectFromPointer}
        />
      )}
      </div>
      {count > 0 && (
        <div className="ac-chart-controls" aria-label="趋势日期浏览">
          <button type="button" className="ac-icon-button" aria-label="前一天" disabled={(activeIndex ?? 0) <= 0} onClick={() => setActiveIndex(current => Math.max(0, (current ?? 0) - 1))}>
            <i className="fa-solid fa-chevron-left" aria-hidden="true" />
          </button>
          <output className="ac-chart-current" aria-live="polite">
            {activeIndex == null ? '选择日期查看数据' : `${labels[activeIndex]} · ${datasets.map(dataset => `${dataset.name} ${dataset.values[activeIndex]}${unit}`).join(' · ')}`}
          </output>
          <button type="button" className="ac-icon-button" aria-label="后一天" disabled={(activeIndex ?? -1) >= count - 1} onClick={() => setActiveIndex(current => Math.min(count - 1, (current ?? -1) + 1))}>
            <i className="fa-solid fa-chevron-right" aria-hidden="true" />
          </button>
        </div>
      )}
      {activeIndex != null && (
        <div className="ac-chart-tooltip" style={{ left: `${Math.min(88, Math.max(12, (x(activeIndex) / width) * 100))}%`, top: 38, transform: 'translateX(-50%)' }}>
          <div style={{ marginBottom: 4, color: '#aeb9c6' }}>{labels[activeIndex]}</div>
          {datasets.map(dataset => (
            <div key={dataset.name} style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: 1.55 }}>
              <span className="ac-chart-dot" style={{ background: dataset.color }} />
              <span>{dataset.name}</span>
              <b style={{ marginLeft: 'auto' }}>{dataset.values[activeIndex]}{unit}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Spark({ data, color = '#245f97', height = 34 }) {
  const width = 120;
  const chartHeight = 40;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const points = data.map((value, index) => `${(index / Math.max(data.length - 1, 1)) * width},${chartHeight - 3 - ((value - min) / span) * (chartHeight - 8)}`).join(' ');
  if (!data.length) return <div style={{ height }} />;
  return (
    <svg viewBox={`0 0 ${width} ${chartHeight}`} style={{ width: '100%', height, display: 'block' }} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function HBars({ items, max, color = '#245f97', unit = '' }) {
  const maximum = max || Math.max(...items.map(item => item.value), 1);
  return (
    <div className="ac-bars">
      {items.map((item, index) => (
        <div className="ac-bar-row" key={`${item.label}-${index}`}>
          <div className="ac-bar-meta">
            <span className="ac-bar-label" title={item.label}>{item.label}</span>
            <span className="ac-bar-value">{item.value}{unit}</span>
          </div>
          <div className="ac-bar-track" role="progressbar" aria-label={item.label} aria-valuenow={item.value} aria-valuemin="0" aria-valuemax={maximum}>
            <div className="ac-bar-fill" style={{ width: `${Math.max((item.value / maximum) * 100, item.value > 0 ? 2 : 0)}%`, background: item.color || color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MiniBars({ data, color = '#245f97', showLabels = false, ariaLabel = '柱状趋势图' }) {
  const max = Math.max(...data.map(item => item.count), 1);
  const width = 900;
  const height = showLabels ? 108 : 90;
  const chartBottom = showLabels ? 24 : 8;
  const barWidth = width / data.length;
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', display: 'block', height }} role="img" aria-label={ariaLabel}>
      <title>{ariaLabel}</title>
      {data.map((item, index) => {
        const barHeight = Math.max((item.count / max) * (height - chartBottom - 14), item.count > 0 ? 2 : 0);
        const centerX = barWidth * index + barWidth / 2;
        return (
          <g key={`${item.date}-${index}`}>
            <rect x={barWidth * index + barWidth * 0.18} y={height - chartBottom - barHeight} width={barWidth * 0.64} height={barHeight} rx="2" fill={color} opacity={item.count > 0 ? 1 : 0.08} />
            <text x={centerX} y={height - chartBottom - barHeight - 4} fontSize="9" fill="#66758a" textAnchor="middle">{item.count > 0 ? item.count : ''}</text>
            {showLabels && index % labelEvery === 0 && <text x={centerX} y={height - 5} fontSize="9" fill="#66758a" textAnchor="middle">{item.date}</text>}
          </g>
        );
      })}
    </svg>
  );
}
