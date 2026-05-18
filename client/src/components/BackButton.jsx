import { useLocation, useNavigate } from 'react-router-dom';

export default function BackButton() {
  const location = useLocation();
  const navigate = useNavigate();

  // 首页不显示返回按钮
  if (location.pathname === '/') return null;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="back-btn-wrap">
      <div className="back-btn-spacer" />
      <button
        onClick={handleBack}
        aria-label="返回上一页"
        className="back-btn"
      >
        <i className="fa-solid fa-arrow-left" />
      </button>
    </div>
  );
}
