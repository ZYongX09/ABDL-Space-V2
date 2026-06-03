import ABDLLoading, { IconSpinner } from './ABDLLoading';

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

export function Spinner({ text = '加载中...' }) {
  return <ABDLLoading size={44} text={text} />;
}
