import { useNavigate } from 'react-router-dom';

export default function MobileHeader({ title, back, actions }) {
  const navigate = useNavigate();

  return (
    <div className="mobile-header">
      <div className="mobile-header-left">
        {back && (
          <button
            className="mobile-header-btn"
            onClick={() => navigate(-1)}
            title="返回"
          >
            <i className="fa-solid fa-arrow-left" />
          </button>
        )}
      </div>
      <span className="mobile-header-title">{title}</span>
      <div className="mobile-header-right">
        {actions?.map((a, i) => (
          <button
            key={i}
            className="mobile-header-btn"
            onClick={a.onClick}
            title={a.title}
          >
            <i className={`fa-solid ${a.icon}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
