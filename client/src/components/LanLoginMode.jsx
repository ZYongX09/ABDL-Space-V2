import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.abdl-space.top';
const POLL_INTERVAL = 500;

export default function LanLoginMode({ onSwitchBack }) {
  const [step, setStep] = useState(1);
  const [foundDevice, setFoundDevice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sessionIdRef = useRef(null);
  const pollRef = useRef(null);
  const discoverTimerRef = useRef(null);
  const loggedInRef = useRef(false); // 防止重复登录
  const { loginWithToken } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const discoverDevices = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/lan/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.devices && data.devices.length > 0) {
          await verifyDevice(data.devices[0]);
          return true;
        }
      }
    } catch (e) {}
    return false;
  }, []);

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
        sessionIdRef.current = data.sessionId;
        setFoundDevice(device);
        setStep(2);
        startPolling();
      } else {
        setError(data.error || '验证失败');
      }
    } catch (e) {
      setError('验证失败: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = useCallback(async () => {
    if (loggedInRef.current) return; // 已登录，不再轮询
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/qr/poll/${sid}`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.status === 'done' && data.token) {
        loggedInRef.current = true; // 标记已登录
        stopPolling();
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
  }, [loginWithToken, toast, navigate]);

  const startPolling = () => {
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
    const discover = async () => {
      const found = await discoverDevices();
      if (!found) discoverTimerRef.current = setTimeout(discover, 2000);
    };
    discover();
    return () => {
      stopPolling();
      if (discoverTimerRef.current) clearTimeout(discoverTimerRef.current);
    };
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
