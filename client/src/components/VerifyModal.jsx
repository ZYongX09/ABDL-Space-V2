import { useState, useRef, useCallback } from 'react';
import QuantumVerify from './QuantumVerify';
import { captchaAPI } from '../api';

/**
 * useVerifyModal — 验证码弹窗 Hook（服务端模式 + 离线降级）
 *
 * 流程:
 *   1. trigger(onPass) → 向后端请求 challenge
 *   2. 渲染 QuantumVerify，传入服务端 order
 *   3. 用户完成后 → 提交 answer 到后端 verify
 *   4. 成功 → 存 token → 执行 onPass
 *
 * 返回: { trigger, VerifyModal, captchaToken }
 */
export function useVerifyModal() {
  const [show, setShow] = useState(false);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [animState, setAnimState] = useState('hidden');
  const [serverOrder, setServerOrder] = useState(null);
  const [error, setError] = useState(null);

  const actionRef = useRef(null);
  const sessionIdRef = useRef(null);
  const tokenRef = useRef(null);

  const cleanup = useCallback(() => {
    setShow(false); setStarted(false); setLoading(false);
    setLocked(false); setAnimState('hidden');
    setServerOrder(null); setError(null);
    sessionIdRef.current = null;
    actionRef.current = null;
  }, []);

  const trigger = useCallback(async (onPass) => {
    actionRef.current = onPass;
    setLocked(false);
    setError(null);
    setShow(true);
    setStarted(false);
    setAnimState('entering');
    requestAnimationFrame(() => setAnimState('visible'));

    // 请求后端 challenge
    try {
      setLoading(true);
      const res = await captchaAPI.createChallenge('quantum');
      if (res.session_id) {
        // 服务端模式
        sessionIdRef.current = res.session_id;
      }
      // challenge.order 是服务端下发的正确节点顺序
      if (res.challenge?.order) {
        setServerOrder(res.challenge.order);
      } else if (res.session_id === null) {
        // 离线模式
        setServerOrder(null);
      }
    } catch (err) {
      console.error('Failed to create captcha challenge:', err);
      // 降级到本地模式
      setServerOrder(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleVerified = useCallback(async (answer) => {
    const sessionId = sessionIdRef.current;

    if (sessionId && answer) {
      // 服务端验证
      try {
        setLoading(true);
        const res = await captchaAPI.verify(sessionId, answer);
        if (res.success) {
          tokenRef.current = res.token;
          // 验证通过动画
          setTimeout(() => {
            setAnimState('exiting');
            setTimeout(() => {
              cleanup();
              if (actionRef.current) { actionRef.current(); actionRef.current = null; }
            }, 250);
          }, 600);
        } else if (res.locked) {
          setLocked(true);
        } else {
          setError(`验证失败，剩余 ${res.attempts_left} 次机会`);
        }
      } catch (err) {
        console.error('Captcha verify failed:', err);
        setError('验证请求失败，请重试');
      } finally {
        setLoading(false);
      }
    } else {
      // 离线模式 / 本地验证 — 直接通过
      tokenRef.current = 'local';
      setTimeout(() => {
        setAnimState('exiting');
        setTimeout(() => {
          cleanup();
          if (actionRef.current) { actionRef.current(); actionRef.current = null; }
        }, 250);
      }, 600);
    }
  }, [cleanup]);

  const handleLocked = useCallback(() => {
    setLocked(true);
  }, []);

  const handleClose = useCallback(() => {
    setAnimState('exiting');
    setTimeout(() => {
      cleanup();
    }, 200);
  }, [cleanup]);

  if (!show) return { trigger, VerifyModal: null, captchaToken: tokenRef };

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
              {locked
                ? '验证已锁定，请5分钟后再试'
                : '请按照高亮提示的顺序依次点击节点\n每个节点只能点击一次，5次错误将锁定5分钟'}
            </p>
            {!locked && (
              <button type="button" className="btn btn-outline" onClick={() => { setStarted(true); }}>
                <i className="fa-solid fa-play" /> 开始验证
              </button>
            )}
          </div>
        ) : loading && !serverOrder ? (
          <div className="flex flex-col items-center justify-center" style={{ minHeight: 200 }}>
            <div className="cap-loading-ring" />
            <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>正在加载验证...</p>
          </div>
        ) : (
          <div style={{ border: '1.5px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
            <QuantumVerify
              serverOrder={serverOrder}
              onVerified={handleVerified}
              onReset={handleLocked}
            />
          </div>
        )}

        {error && (
          <p className="text-xs text-center mt-2" style={{ color: 'var(--danger)' }}>
            <i className="fa-solid fa-triangle-exclamation mr-1" />{error}
          </p>
        )}
      </div>
    </div>
  );

  return { trigger, VerifyModal, captchaToken: tokenRef };
}
