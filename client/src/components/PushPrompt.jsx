import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import { useToast } from '../contexts/ToastContext';

function isStandalone() {
  return window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
}

export default function PushPrompt() {
  const { user } = useAuth();
  const { pushSupported, pushSubscribed, subscribeToPush } = useNotifications();
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user || !pushSupported || pushSubscribed || dismissed) return;
    if (!isStandalone()) return;

    // PWA 模式下，延迟 3 秒弹窗提示
    const timer = setTimeout(() => {
      const key = `abdl_push_prompt_dismissed_${user.id}`;
      if (localStorage.getItem(key)) {
        setDismissed(true);
        return;
      }
      setShow(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [user, pushSupported, pushSubscribed, dismissed]);

  const handleEnable = async () => {
    const ok = await subscribeToPush();
    if (ok) {
      toast.success('推送通知已开启');
      setShow(false);
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    try {
      localStorage.setItem(`abdl_push_prompt_dismissed_${user?.id}`, '1');
    } catch {}
  };

  if (!show) return null;

  return (
    <div className="modal-overlay" onClick={handleDismiss}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: 20,
          background: 'var(--primary-light)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <i className="fa-solid fa-bell" style={{ fontSize: 28, color: 'var(--primary)' }} />
        </div>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          开启推送通知
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
          开启后可接收点赞、评论、私信等实时通知
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleDismiss}
            className="btn btn-outline"
            style={{ flex: 1, fontSize: 14 }}
          >
            稍后再说
          </button>
          <button
            onClick={handleEnable}
            className="btn btn-primary"
            style={{ flex: 1, fontSize: 14 }}
          >
            立即开启
          </button>
        </div>
      </div>
    </div>
  );
}
