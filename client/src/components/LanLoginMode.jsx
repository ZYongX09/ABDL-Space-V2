import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.abdl-space.top';
const POLL_INTERVAL = 500;

/**
 * 内网设备一键登录
 * 原理：手机 APP 后台运行 UDP 监听，定期向后端上报在线状态
 * 电脑通过后端 API 发现同网段设备
 */
export default function LanLoginMode({ onSwitchBack }) {
  const [step, setStep] = useState(1); // 1=扫描中, 2=等待授权
  const [foundDevice, setFoundDevice] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pollRef = useRef(null);
  const discoverTimerRef = useRef(null);
  const { loginWithToken } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // 发现设备（通过后端 API）
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
          // 找到设备，验证身份
          await verifyDevice(data.devices[0]);
          return true;
        }
      }
    } catch (e) {
      // 忽略网络错误，继续轮询
    }
    return false;
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
        setFoundDevice(device);
        setStep(2);
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

  // 轮询登录状态（复用 QR 登录的 poll 接口）
  const pollStatus = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`${API_BASE}/api/auth/qr/poll/${sessionId}`, {
        credentials: 'include'
      });
      const data = await res.json();

      if (data.status === 'scanned') {
        // 手机已扫码，显示等待授权状态
        setStep(2);
      } else if (data.status === 'done' && data.token) {
        // 登录成功
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

  // 启动轮询
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

  // 启动设备发现（每 2 秒轮询一次）
  useEffect(() => {
    const discover = async () => {
      const found = await discoverDevices();
      if (!found) {
        discoverTimerRef.current = setTimeout(discover, 2000);
      }
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
