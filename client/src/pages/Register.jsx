import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
import VerificationInput from '../components/VerificationInput';
import { authAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendCodeCount, setSendCodeCount] = useState(0);
  const [sendCodeCaptchaOk, setSendCodeCaptchaOk] = useState(false);
  const [sendCodeCaptchaStarted, setSendCodeCaptchaStarted] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaStarted, setCaptchaStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const regContainerRef = useRef(null);
  const sendCodeContainerRef = useRef(null);
  const regTokenRef = useRef(null);
  const sendCodeTokenRef = useRef(null);
  const { register, saveConsent } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // 渲染 SDK 的通用函数
  const renderSDK = useCallback((container, onVerified) => {
    if (!container || !window.ABDLCaptcha) return;
    container.innerHTML = '';
    const apiKey = window.__ABDL_CAPTCHA_KEY || '';
    try {
      window.ABDLCaptcha.render(container, {
        apiKey,
        onSuccess: (token) => onVerified(token),
        onError: (err) => {
          if (err.message?.includes('Locked')) toast.error('验证已锁定');
        },
      });
    } catch (err) {
      console.error('Captcha render failed:', err);
    }
  }, [toast]);

  // 注册验证码 SDK
  useEffect(() => {
    if (!captchaStarted || !regContainerRef.current) return;
    const wait = setInterval(() => {
      if (window.ABDLCaptcha) { clearInterval(wait); renderSDK(regContainerRef.current, (token) => { regTokenRef.current = token; setCaptchaOk(true); }); }
    }, 200);
    return () => clearInterval(wait);
  }, [captchaStarted, renderSDK]);

  // 发送验证码 SDK
  useEffect(() => {
    if (!sendCodeCaptchaStarted || !sendCodeContainerRef.current) return;
    const wait = setInterval(() => {
      if (window.ABDLCaptcha) { clearInterval(wait); renderSDK(sendCodeContainerRef.current, (token) => { sendCodeTokenRef.current = token; setSendCodeCaptchaOk(true); }); }
    }, 200);
    return () => clearInterval(wait);
  }, [sendCodeCaptchaStarted, renderSDK]);

  const handleSendCode = useCallback(async () => {
    if (!email.trim()) { toast.error('请输入邮箱'); return; }
    if (!email.includes('@')) { toast.error('请输入合法邮箱'); return; }
    if (sendCodeCount >= 2 && !sendCodeCaptchaOk) { toast.error('请先完成安全验证'); return; }
    setLoading(true);
    try {
      await authAPI.sendCode({ email: email.trim(), type: 'register', captchaToken: sendCodeTokenRef.current || undefined });
      toast.success('验证码已发送至邮箱');
      setCodeSent(true);
      setSendCodeCount(v => v + 1);
      setCooldown(60);
      setSendCodeCaptchaOk(false);
      setSendCodeCaptchaStarted(false);
      sendCodeTokenRef.current = null;
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [email, sendCodeCount, sendCodeCaptchaOk, toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) { toast.error('请填写所有字段'); return; }
    if (!email.includes('@')) { toast.error('请输入合法邮箱'); return; }
    if (password.length < 8) { toast.error('密码至少 8 位'); return; }
    if (password !== confirm) { toast.error('两次密码不一致'); return; }
    if (!codeSent || code.length < 6) { toast.error('请先获取并输入验证码'); return; }
    if (!agreeTerms || !agreePrivacy) { toast.error('请阅读并同意用户协议和隐私政策'); return; }
    if (!captchaOk) { toast.error('请完成安全验证'); return; }
    try {
      setLoading(true);
      await register({
        username: username.trim(), email: email.trim(), password, code,
        captchaToken: regTokenRef.current || undefined,
      });
      saveConsent({ privacy: true, terms: true });
      toast.success('注册成功');
      navigate('/');
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const allReady = agreeTerms && agreePrivacy && captchaOk && codeSent && code.length >= 6;

  return (
    <>
      <MobileHeader title="注册" />
      <PageLayout hero={{ icon: 'fa-user-plus', title: '注册', subtitle: '加入 ABDL Space 大家庭' }}>
        <div className="card max-w-md mx-auto">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>用户名</label>
              <input className="form-control" value={username} onChange={e => setUsername(e.target.value)} placeholder="3-30 个字符" autoFocus />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-envelope mr-1.5" style={{ color: 'var(--primary-dark)' }} />邮箱
              </label>
              <div className="flex gap-2">
                <input type="email" className="form-control flex-1" value={email} onChange={e => { setEmail(e.target.value); setCodeSent(false); setCode(''); }} placeholder="your@email.com" />
                <button type="button" className="btn btn-outline whitespace-nowrap" onClick={handleSendCode} disabled={loading || cooldown > 0}
                  style={{ fontSize: '0.8rem', padding: '0 16px', minWidth: '100px' }}>
                  {loading ? <i className="fa-solid fa-spinner fa-spin" /> : cooldown > 0 ? `${cooldown}s` : codeSent ? '重新发送' : '发送验证码'}
                </button>
              </div>
            </div>

            {sendCodeCount >= 2 && !sendCodeCaptchaOk && (
              <div className="mb-4 p-3 rounded-xl" style={{ border: '1.5px solid var(--border)', background: 'var(--input-bg)' }}>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--text)' }}>
                  <i className="fa-solid fa-shield-halved mr-1" style={{ color: 'var(--primary-dark)' }} />安全验证
                </label>
                {!sendCodeCaptchaStarted ? (
                  <div className="text-center">
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>频繁获取验证码需要安全验证</p>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setSendCodeCaptchaStarted(true)}>
                      <i className="fa-solid fa-play" /> 开始验证
                    </button>
                  </div>
                ) : (
                  <div ref={sendCodeContainerRef} style={{ minHeight: 280 }} />
                )}
              </div>
            )}

            {codeSent && (
              <div className="mb-4">
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>验证码</label>
                <VerificationInput value={code} onChange={setCode} />
                <p className="text-xs text-center mt-2" style={{ color: 'var(--text-muted)' }}>
                  验证码已发送至 <strong>{email}</strong>，5 分钟内有效
                </p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>密码</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} className="form-control pr-10" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 8 位" />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>
            <div className="mb-5">
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>确认密码</label>
              <div className="relative">
                <input type={showConfirm ? 'text' : 'password'} className="form-control pr-10" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="再次输入密码" />
                <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                  <i className={`fa-solid ${showConfirm ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>

            <div className="mb-5 p-4 rounded-xl flex flex-col" style={{ border: `1.5px solid ${captchaOk ? 'var(--success)' : 'var(--border)'}`, background: 'var(--input-bg)' }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  <i className="fa-solid fa-shield-halved mr-1.5" style={{ color: 'var(--primary-dark)' }} />安全验证
                </label>
                {captchaOk && <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}><i className="fa-solid fa-circle-check mr-1" />已通过</span>}
              </div>

              {!captchaStarted && !captchaOk && (
                <div className="flex flex-col items-center justify-center py-4">
                  <p className="text-xs mb-3 text-center" style={{ color: 'var(--text-light)' }}>
                    请完成安全验证<br />每个节点只能点击一次，5次错误将锁定5分钟
                  </p>
                  <button type="button" className="btn btn-outline" onClick={() => setCaptchaStarted(true)}>
                    <i className="fa-solid fa-play" /> 开始验证
                  </button>
                </div>
              )}

              {captchaStarted && !captchaOk && (
                <div ref={regContainerRef} />
              )}

              {captchaOk && (
                <div className="flex flex-col items-center justify-center py-4">
                  <i className="fa-solid fa-circle-check text-3xl mb-2" style={{ color: 'var(--success)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>验证已通过</p>
                </div>
              )}
            </div>

            <div className="mb-5 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} className="mt-0.5 w-4 h-4 rounded cursor-pointer accent-[var(--primary-dark)]" />
                <span className="text-xs leading-relaxed" style={{ color: 'var(--text-light)' }}>
                  我已阅读并同意 <Link to="/terms" target="_blank" style={{ color: 'var(--link-color)' }}>用户协议</Link>
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={agreePrivacy} onChange={e => setAgreePrivacy(e.target.checked)} className="mt-0.5 w-4 h-4 rounded cursor-pointer accent-[var(--primary-dark)]" />
                <span className="text-xs leading-relaxed" style={{ color: 'var(--text-light)' }}>
                  我已阅读并同意 <Link to="/privacy" target="_blank" style={{ color: 'var(--link-color)' }}>隐私政策</Link>
                </span>
              </label>
            </div>

            <button type="submit" className="btn btn-primary w-full miui-press" disabled={loading || !allReady}>
              {loading ? '注册中...' : '注册'}
            </button>
          </form>
          <p className="text-center mt-4 text-sm" style={{ color: 'var(--text-light)' }}>
            已有账号？ <Link to="/login" style={{ color: 'var(--link-color)' }}>登录</Link>
          </p>
        </div>
      </PageLayout>
    </>
  );
}
