import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.abdl-space.top';
const UDP_PORT = 9527;
const POLL_INTERVAL = 500;

export default function LanLoginMode({ onSwitchBack }) {
  const [step, setStep] = useState(1); // 1=扫描中, 2=等待授权
  const [foundDevice, setFoundDevice] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);
  const socketRef = useRef(null);
  const { loginWithToken } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // UDP 广播发现设备
  const startDiscovery = useCallback(async () => {
    try {
      // 创建 UDP socket 并发送广播
      const message = JSON.stringify({
        action: 'who_is_online',
        timestamp: Date.now()
      });

      // 使用 fetch 调用后端 API 模拟 UDP 发现
      // 实际 UDP 需要 native 支持，这里用 HTTP 轮询作为 fallback
      const res = await fetch(`${API_BASE}/api/auth/lan/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        if (data.devices && data.devices.length > 0) {
          setFoundDevice(data.devices[0]);
          // 验证身份
          await verifyDevice(data.devices[0]);
        }
      }
    } catch (e) {
      setError('未发现同网段设备，请确保手机 APP 已打开');
    }
  }, []);

  // 验证设备身份
  const verifyDevice = async (device) => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/auth/lan/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: device.userId,
          username: device.username,
          signature: device.signature,
          timestamp: device.timestamp
        })
      });

      const data = await res.json();
      if (data.sessionId) {
        setSessionId(data.sessionId);
        setStep(2); // 进入授权步骤
        startPolling(data.sessionId);
      } else {
        setError(data.error || '验证失败');
      }
    } catch (e) {
      setError('验证失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // 轮询登录状态
  const pollStatus = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/qr/poll/${sessionId}`, {
        credentials: 'include'
      });
      const data = await res.json();

      if (data.status === 'done' && data.token) {
        setStatus('done');
        await fetch(`${API_BASE}/api/auth/qr/set-cookie`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token: data.token })
        });
        await loginWithToken({ token: data.token, user: data.user });
        toast.success('登录成功');
        setTimeout(() => navigate('/'), 500);
      }
    } catch (e) {}
  }, [sessionId, loginWithToken, toast, navigate]);

  const startPolling = (sid) => {
    stopPolling();
    pollRef.current = setInterval(pollStatus, POLL_INTERVAL);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    startDiscovery();
    return () => stopPolling();
  }, []);

  return (
    <div className="lan-login-mode">
      <div className="qr-header">
        <h2>内网设备一键登录</h2>
        <button className="qr-switch-btn" onClick={onSwitchBack} title="切换到账号密码登录">
          <i className="fa-solid fa-keyboard" />
        </button>
      </div>

      {step === 1 && (
        <div className="lan-step1">
          <div className="lan-scanning-animation">
            <div className="lan-scanning-circle" />
            <i className="fa-solid fa-wifi lan-scanning-icon" />
          </div>
          <p className="lan-scanning-text">扫描设备中...</p>
          <div className="lan-guide">
            <p>请确保：</p>
            <ol>
              <li>手机已打开 ABDL Space APP</li>
              <li>电脑和手机在同一内网</li>
            </ol>
          </div>
          {error && <p className="lan-error">{error}</p>}
        </div>
      )}

      {step === 2 && (
        <div className="lan-step2">
          <div className="lan-device-info">
            <i className="fa-solid fa-mobile-screen" />
            <p>已发现设备: <strong>{foundDevice?.username}</strong></p>
          </div>
          <p className="lan-authorization-hint">请在手机上完成授权登录</p>
        </div>
      )}
    </div>
  );
}
