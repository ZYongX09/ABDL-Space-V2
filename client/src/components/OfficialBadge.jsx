/**
 * 官方认证徽章 — 管理员专属
 */
export default function OfficialBadge({ className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-bold ${className}`}
      style={{
        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
        color: '#fff',
        fontSize: '0.6rem',
        lineHeight: 1,
        verticalAlign: 'middle',
      }}
    >
      <i className="fa-solid fa-check" style={{ fontSize: '0.5rem' }} />
      官方
    </span>
  );
}
