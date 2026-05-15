import { useState, useRef, useCallback } from 'react';
import QuantumVerify from './QuantumVerify';

export function useVerifyModal() {
  const [show, setShow] = useState(false);
  const actionRef = useRef(null);

  const trigger = useCallback((onPass) => {
    actionRef.current = onPass;
    setShow(true);
  }, []);

  const handleVerified = useCallback(() => {
    setTimeout(() => {
      setShow(false);
      if (actionRef.current) {
        actionRef.current();
        actionRef.current = null;
      }
    }, 600);
  }, []);

  const handleClose = useCallback(() => {
    setShow(false);
    actionRef.current = null;
  }, []);

  const VerifyModal = show ? (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 400,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(2px)',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: 'var(--bg-card)', color: 'var(--text)',
          borderRadius: '1.25rem', padding: '24px', maxWidth: 420, width: '90%',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          animation: 'scaleIn 0.25s ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-shield-halved mr-2" style={{ color: 'var(--primary-dark)' }} />
            安全验证
          </h3>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-light)' }}>
          请按照高亮提示的顺序依次点击节点，完成验证后继续操作。
        </p>
        <div style={{ border: '1.5px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
          <QuantumVerify onVerified={handleVerified} onReset={() => {}} />
        </div>
      </div>
    </div>
  ) : null;

  return { trigger, VerifyModal };
}
