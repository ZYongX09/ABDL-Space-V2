export function LoadingSkeleton({ count = 3, height = 120 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, borderRadius: 'var(--radius)' }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon = 'fa-inbox', title = '暂无数据', description }) {
  return (
    <div className="empty-state">
      <div className="icon"><i className={`fa-solid ${icon}`} /></div>
      <h3>{title}</h3>
      {description && <p className="mt-2">{description}</p>}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex flex-col items-center gap-3 py-10" style={{ color: 'var(--text-light)' }}>
      <div className="spinner" />
      <span className="text-sm">加载中...</span>
    </div>
  );
}
