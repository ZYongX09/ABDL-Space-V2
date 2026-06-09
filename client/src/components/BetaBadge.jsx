/**
 * 创始成员徽章 — 预热期间展示为「创始成员候选」
 * 浅色：金色渐变
 * 深色/多彩：金色渐变（保持品牌一致）
 */
export default function BetaBadge({ size = 'sm', className = '' }) {
  const sizes = {
    sm: { fontSize: '0.6rem', padding: '1px 5px', iconSize: '0.5rem', gap: '2px' },
    md: { fontSize: '0.7rem', padding: '2px 7px', iconSize: '0.55rem', gap: '3px' },
    lg: { fontSize: '0.8rem', padding: '3px 9px', iconSize: '0.65rem', gap: '4px' },
  };
  const s = sizes[size] || sizes.sm;

  return (
    <span
      role="img"
      aria-label="创始成员候选"
      title="创始成员候选 · v0.1"
      className={`inline-flex items-center rounded font-bold ${className}`}
      style={{
        gap: s.gap,
        background: 'linear-gradient(135deg, #FFB347, #FF8C42)',
        color: '#fff',
        fontSize: s.fontSize,
        padding: s.padding,
        lineHeight: 1.2,
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
      }}
    >
      <i className="fa-solid fa-medal" aria-hidden="true" style={{ fontSize: s.iconSize }} />
      创始
    </span>
  );
}
