import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const ToastContext = createContext();
const TYPES = { success: { label: '成功', icon: 'fa-circle-check' }, error: { label: '错误', icon: 'fa-circle-exclamation' }, info: { label: '提示', icon: 'fa-circle-info' } };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const timers = useRef(new Map());

  useEffect(() => {
    const active = timers.current;
    return () => { for (const timer of active.values()) clearTimeout(timer); active.clear(); };
  }, []);

  const removeToast = useCallback(id => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts(previous => previous.filter(toast => toast.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = ++nextId.current;
    const resolvedType = Object.hasOwn(TYPES, type) ? type : 'info';
    setToasts(previous => [...previous, { id, message, type: resolvedType }]);
    if (duration > 0) timers.current.set(id, setTimeout(() => removeToast(id), duration));
    return id;
  }, [removeToast]);

  const success = useCallback(message => addToast(message, 'success'), [addToast]);
  const error = useCallback(message => addToast(message, 'error'), [addToast]);
  const info = useCallback(message => addToast(message, 'info'), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, info }}>
      {children}
      <div className="toast-container" aria-label="操作反馈">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'} aria-atomic="true">
            <i className={`toast-type-icon fa-solid ${TYPES[toast.type].icon}`} aria-hidden="true" />
            <span><span className="toast-type-label">{TYPES[toast.type].label}：</span>{toast.message}</span>
            <button type="button" className="toast-dismiss" aria-label="关闭操作反馈" onClick={() => removeToast(toast.id)}
              style={{ marginLeft: 'auto', cursor: 'pointer', opacity: 0.85, background: 'none', border: 'none', color: 'inherit', fontSize: '1.1rem' }}>
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
