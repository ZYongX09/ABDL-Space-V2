import { useNavigate, useLocation } from 'react-router-dom';

export default function MobileHeader({ title, leftActions, actions }) {
  const navigate = useNavigate();
  const location = useLocation();
  const showBack = location.pathname !== '/';

  return (
    <div className="mobile-header">
      <div className="mobile-header-left">
        {showBack && (
          <button
            className="mobile-header-btn"
            onClick={() => navigate(-1)}
            title="返回"
          >
            <i className="fa-solid fa-arrow-left" />
          </button>
        )}
        {leftActions?.map((a, i) => (
          <button
            key={i}
            className="mobile-header-btn"
            onClick={a.onClick}
            title={a.title}
          >
            <i className={a.icon} />
          </button>
        ))}
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
            <i className={a.icon} />
          </button>
        ))}
      </div>
    </div>
  );
}
