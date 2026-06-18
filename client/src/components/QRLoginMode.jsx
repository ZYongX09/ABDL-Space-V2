import { useState, useEffect, useCallback, useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.abdl-space.top';
const POLL_INTERVAL = 2000; // 2秒轮询

export default function QRLoginMode({ onSwitchBack }) {
  const [sessionId, setSessionId] = useState(null);
  const [qrUrl, setQrUrl] = useState('');
  const [status, setStatus] = useState('loading'); // loading | pending | scanned | expired
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);
  const { login: authLogin } = useAuth();
  const toast = useToast();

  // 创建 QR 会话
  const createSession = useCallback(async () => {
    try {
      setLoading(true);
      setStatus('loading');
      const res = await fetch(`${API_BASE}/api/auth/qr/create`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.sessionId) {
        setSessionId(data.sessionId);
        setQrUrl(data.qrUrl);
        setStatus('pending');
      }
    } catch (e) {
      toast.error('创建二维码失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // 轮询状态
  const pollStatus = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/qr/poll/${sessionId}`, {
        credentials: 'include'
      });
      const data = await res.json();

      if (data.status === 'scanned') {
        setStatus('scanned');
        setUsername(data.username || '');
      } else if (data.status === 'done' && data.token) {
        // 登录成功
        setStatus('done');
        await authLogin({ token: data.token, user: data.user });
        toast.success('扫码登录成功');
      } else if (data.status === 'expired') {
        setStatus('expired');
        stopPolling();
      }
    } catch (e) {
      // 网络错误，继续轮询
    }
  }, [sessionId, authLogin, toast]);

  // 启动轮询
  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL);
  }, [pollStatus]);

  // 停止轮询
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // 初始化
  useEffect(() => {
    createSession();
    return () => stopPolling();
  }, []);

  // sessionId 变化时开始轮询
  useEffect(() => {
    if (sessionId && (status === 'pending' || status === 'scanned')) {
      startPolling();
    }
    return () => stopPolling();
  }, [sessionId, status, startPolling, stopPolling]);

  // 刷新二维码
  const refresh = () => {
    stopPolling();
    createSession();
  };

  return (
    <div className="qr-login-mode">
      {/* 标题栏 */}
      <div className="qr-header">
        <h2>扫码登录</h2>
        <button className="qr-switch-btn" onClick={onSwitchBack} title="切换到账号密码登录">
          <i className="fa-solid fa-keyboard" />
        </button>
      </div>

      {/* 二维码区域 */}
      <div className="qr-container">
        {loading ? (
          <div className="qr-loading">
            <i className="fa-solid fa-spinner fa-spin" />
            <p>正在生成二维码...</p>
          </div>
        ) : status === 'expired' ? (
          <div className="qr-expired">
            <i className="fa-solid fa-clock-rotate-left" />
            <p>二维码已过期</p>
            <button className="btn btn-primary btn-sm" onClick={refresh}>刷新</button>
          </div>
        ) : (
          <div className="qr-code-wrapper">
            <QRCodeSVG
              value={qrUrl}
              size={180}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />

            {/* 毛玻璃遮罩 */}
            {status === 'scanned' && (
              <div className="qr-overlay">
                <div className="qr-overlay-content">
                  <i className="fa-solid fa-check-circle" />
                  <p>扫码成功</p>
                  <p className="qr-overlay-hint">请在 APP 端授权</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 提示文字 */}
      <div className="qr-hint">
        {status === 'pending' && (
          <p>使用 ABDL Space APP 扫描二维码登录</p>
        )}
        {status === 'scanned' && (
          <p className="qr-hint-scanned">
            <i className="fa-solid fa-mobile-screen-button" />
            {username ? `${username} 已扫码` : '已扫码'}，请在手机端完成授权
          </p>
        )}
        {status === 'expired' && (
          <p>二维码已过期，请点击刷新</p>
        )}
      </div>
    </div>
  );
}
