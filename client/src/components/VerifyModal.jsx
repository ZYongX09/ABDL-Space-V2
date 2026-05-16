import { useState, useRef, useCallback, useEffect } from 'react';
import QuantumVerify from './QuantumVerify';

const GRACE_MS = 2 * 60 * 1000; // 2分钟内操作才触发验证
const LS_KEY = 'qv_action_ts';

function getRecentActions() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (!saved) return [];
    const arr = JSON.parse(saved);
    const now = Date.now();
    // 只保留 GRACE_MS 内的记录
    return arr.filter(t => now - t < GRACE_MS);
  } catch { return []; }
}

function recordAction() {
  try {
    const arr = getRecentActions();
    arr.push(Date.now());
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
  } catch {}
}

function clearActions() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

export function useVerifyModal() {
  const [show, setShow] = useState(false);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [animState, setAnimState] = useState('hidden');
  const actionRef = useRef(null);

  const trigger = useCallback((onPass) => {
    const recent = getRecentActions();
    // 2分钟内没有操作记录 → 免验证
    if (recent.length === 0) {
      recordAction();
      onPass();
      return;
    }
    // 有操作记录 → 需要验证
    actionRef.current = onPass;
    setShow(true);
    setStarted(false);
    setAnimState('entering');
    requestAnimationFrame(() => setAnimState('visible'));
  }, []);

  const handleVerified = useCallback(() => {
    setTimeout(() => {
      setAnimState('exiting');
      setTimeout(() => {
        setShow(false); setStarted(false); setLoading(false); setAnimState('hidden');
        clearActions(); // 清除旧记录，验证后重新计时
        recordAction(); // 记录本次操作
        if (actionRef.current) { actionRef.current(); actionRef.current = null; }
      }, 250);
    }, 600);
  }, []);

  const handleClose = useCallback(() => {
    setAnimState('exiting');
    setTimeout(() => {
      setShow(false); setStarted(false); setLoading(false); setAnimState('hidden');
      actionRef.current = null;
    }, 200);
  }, []);

  if (!show) return { trigger, VerifyModal: null };

  const backdropStyle = {
    position: 'fixed', inset: 0, zIndex: 400,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(2px)',
    opacity: animState === 'entering' ? 0 : animState === 'exiting' ? 0 : 1,
    transition: 'opacity 0.25s ease',
  };

  const cardStyle = {
    background: 'var(--bg-card)', color: 'var(--text)',
    borderRadius: '1.25rem', padding: '24px', maxWidth: 420, width: '90%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    transform: animState === 'entering' ? 'scale(0.9) translateY(16px)' : animState === 'exiting' ? 'scale(0.95) translateY(8px)' : 'scale(1) translateY(0)',
    opacity: animState === 'entering' ? 0 : animState === 'exiting' ? 0 : 1,
    transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease',
  };

  const VerifyModal = (
    <div style={backdropStyle} onClick={handleClose}>
      <div style={cardStyle} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-base" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-shield-halved mr-2" style={{ color: 'var(--primary-dark)' }} />
            安全验证
          </h3>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem' }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        {!started ? (
          <div className="flex flex-col items-center py-4">
            <p className="text-xs mb-4 text-center" style={{ color: 'var(--text-light)' }}>
              请按照高亮提示的顺序依次点击节点<br />每个节点只能点击一次，5次错误将锁定5分钟
            </p>
            <button type="button" className="btn btn-outline" onClick={() => { setStarted(true); setLoading(true); setTimeout(() => setLoading(false), 400); }}>
              <i className="fa-solid fa-play" /> 开始验证
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: 200 }}>
            <div className="cap-loading-ring" />
            <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>正在加载验证...</p>
          </div>
        ) : (
          <div style={{ border: '1.5px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
            <QuantumVerify onVerified={handleVerified} onReset={() => {}} />
          </div>
        )}
      </div>
    </div>
  );

  return { trigger, VerifyModal };
}
