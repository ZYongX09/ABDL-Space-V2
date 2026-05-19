import { useNotifications } from '../contexts/NotificationContext';
import { useNavigate } from 'react-router-dom';

export default function ToastPopup() {
  const { toasts, dismissToast } = useNotifications();
  const navigate = useNavigate();

  if (toasts.length === 0) return null;

  return (
    <div className="toast-popup-container">
      {toasts.map(t => (
        <div
          key={t.id}
          className="toast-popup-item"
          onClick={() => {
            dismissToast(t.id);
            if (t.link) navigate(t.link);
          }}
        >
          <div className="toast-popup-icon" style={{ color: t.iconColor }}>
            <i className={`fa-solid ${t.icon}`} />
          </div>
          <div className="toast-popup-body">
            <div className="toast-popup-title">{t.title}</div>
            <div className="toast-popup-msg">{t.message}</div>
          </div>
          <button
            className="toast-popup-close"
            onClick={e => { e.stopPropagation(); dismissToast(t.id); }}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
      ))}
    </div>
  );
}
