import { useState, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import QuantumVerify from '../components/QuantumVerify';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { captchaAPI } from '../api';

const FAIL_THRESHOLD = 2; // 失败几次后弹验证码

export default function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [consented, setConsented] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaStarted, setCaptchaStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [serverOrder, setServerOrder] = useState(null);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const verifyRef = useRef(null);
  const sessionIdRef = useRef(null);
  const captchaTokenRef = useRef(null);
  const { login: authLogin, saveConsent } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const needCaptcha = failCount >= FAIL_THRESHOLD;
  const canSubmit = !loading && (!needCaptcha || captchaOk) && !locked;

  const startCaptcha = useCallback(async () => {
    setCaptchaStarted(true);
    setChallengeLoading(true);
    try {
      const res = await captchaAPI.createChallenge('quantum');
      if (res.session_id) {
        sessionIdRef.current = res.session_id;
      }
      if (res.challenge?.order) {
        setServerOrder(res.challenge.order);
      }
    } catch (err) {
      console.error('Failed to create captcha challenge:', err);
      // 降级到本地模式
      setServerOrder(null);
    } finally {
      setChallengeLoading(false);
    }
  }, []);

  const handleCaptchaVerified = useCallback(async (answer) => {
    const sessionId = sessionIdRef.current;
    if (sessionId && answer) {
      // 服务端验证
      try {
        const res = await captchaAPI.verify(sessionId, answer);
        if (res.success) {
          captchaTokenRef.current = res.token;
          setCaptchaOk(true);
        } else if (res.locked) {
          setLocked(true);
        } else {
          toast.error(`验证失败，剩余 ${res.attempts_left} 次机会`);
        }
      } catch (err) {
        console.error('Captcha verify failed:', err);
        toast.error('验证请求失败，请重试');
      }
    } else {
      // 离线/本地模式
      captchaTokenRef.current = 'local';
      setCaptchaOk(true);
    }
  }, [toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!login.trim() || !password) { toast.error('请填写用户名/邮箱和密码'); return; }
    if (!consented) { toast.error('请阅读并同意隐私政策'); return; }
    if (needCaptcha && !captchaOk) { toast.error('请完成安全验证'); return; }
    try {
      setLoading(true);
      await authLogin({
        login: login.trim(),
        password,
        captchaToken: captchaTokenRef.current || undefined,
      });
      saveConsent({ privacy: true });
      toast.success('登录成功');
      navigate('/');
    } catch (e) {
      toast.error(e.message);
      setFailCount(c => c + 1);
      if (needCaptcha) {
        setCaptchaOk(false);
        setCaptchaStarted(false);
        setServerOrder(null);
        sessionIdRef.current = null;
        captchaTokenRef.current = null;
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout hero={{ icon: 'fa-right-to-bracket', title: '登录', subtitle: '欢迎回到 ABDL Space' }}>
      <div className="card max-w-md mx-auto">
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>用户名 / 邮箱</label>
            <input className="form-control" value={login} onChange={e => setLogin(e.target.value)} placeholder="输入用户名或邮箱" autoFocus />
          </div>
          <div className="mb-5">
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>密码</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} className="form-control pr-10" value={password} onChange={e => setPassword(e.target.value)} placeholder="输入密码" />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
              </button>
            </div>
          </div>

          {/* 安全验证：失败次数达到阈值才显示 */}
          {needCaptcha && (
            <div className="mb-5 p-4 rounded-xl flex flex-col" style={{ border: `1.5px solid ${captchaOk ? 'var(--success)' : locked ? 'var(--danger)' : 'var(--border)'}`, background: 'var(--input-bg)', height: 380, overflow: 'hidden' }}>
              <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  <i className="fa-solid fa-shield-halved mr-1.5" style={{ color: 'var(--primary-dark)' }} />
                  安全验证
                </label>
                {captchaOk && <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}><i className="fa-solid fa-circle-check mr-1" />已通过</span>}
                {locked && <span className="text-xs font-semibold" style={{ color: 'var(--danger)' }}><i className="fa-solid fa-lock mr-1" />已锁定</span>}
              </div>

              {!captchaStarted && !captchaOk && !locked && (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <p className="text-xs mb-3 text-center" style={{ color: 'var(--text-light)' }}>
                    检测到多次登录失败，请完成安全验证<br />每个节点只能点击一次，5次错误将锁定5分钟
                  </p>
                  <button type="button" className="btn btn-outline" onClick={startCaptcha}>
                    <i className="fa-solid fa-play" /> 开始验证
                  </button>
                </div>
              )}

              {captchaStarted && !captchaOk && !locked && (
                challengeLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="cap-loading-ring" />
                    <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>正在加载验证...</p>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center overflow-hidden">
                    <QuantumVerify
                      ref={verifyRef}
                      serverOrder={serverOrder}
                      onVerified={handleCaptchaVerified}
                      onReset={(reason) => { if (reason === 'locked') setLocked(true); }}
                    />
                  </div>
                )
              )}

              {(captchaOk || locked) && (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <i className={`fa-solid ${captchaOk ? 'fa-circle-check' : 'fa-lock'} text-3xl mb-2`} style={{ color: captchaOk ? 'var(--success)' : 'var(--danger)' }} />
                  <p className="text-sm font-semibold" style={{ color: captchaOk ? 'var(--success)' : 'var(--danger)' }}>
                    {captchaOk ? '验证已通过' : '验证已锁定'}
                  </p>
                  {locked && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>请5分钟后刷新页面重试</p>}
                </div>
              )}
            </div>
          )}

          {/* 隐私政策同意 */}
          <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
            <input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded cursor-pointer accent-[var(--primary-dark)]" />
            <span className="text-xs leading-relaxed" style={{ color: 'var(--text-light)' }}>
              我已阅读并同意 <Link to="/privacy" target="_blank" style={{ color: 'var(--link-color)' }}>隐私政策</Link>
            </span>
          </label>

          <button type="submit" className="btn btn-primary w-full" disabled={!canSubmit}>
            {loading ? '登录中...' : locked ? '已锁定' : '登录'}
          </button>
        </form>
        <p className="text-center mt-4 text-sm" style={{ color: 'var(--text-light)' }}>
          还没有账号？ <Link to="/register" style={{ color: 'var(--link-color)' }}>注册</Link>
          <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>|</span>
          <Link to="/forgot-password" style={{ color: 'var(--link-color)' }}>忘记密码？</Link>
        </p>
      </div>
    </PageLayout>
  );
}
