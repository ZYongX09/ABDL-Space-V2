import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
import QuantumVerify from '../components/QuantumVerify';
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
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const verifyRef = useRef(null);
  const { register, saveConsent } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleSendCode = useCallback(async () => {
    if (!email.trim()) { toast.error('请输入邮箱'); return; }
    if (!email.includes('@')) { toast.error('请输入合法邮箱'); return; }
    // 第 2 次起需要安全验证
    if (sendCodeCount >= 2 && !sendCodeCaptchaOk) {
      toast.error('请先完成安全验证');
      return;
    }
    setLoading(true);
    try {
      await authAPI.sendCode({ email: email.trim(), type: 'register' });
      toast.success('验证码已发送至邮箱');
      setCodeSent(true);
      setSendCodeCount(v => v + 1);
      setCooldown(60);
      setSendCodeCaptchaOk(false);
      setSendCodeCaptchaStarted(false);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
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
      await register({ username: username.trim(), email: email.trim(), password, code });
      saveConsent({ privacy: true, terms: true });
      toast.success('注册成功');
      navigate('/');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const allReady = agreeTerms && agreePrivacy && captchaOk && !locked && codeSent && code.length >= 6;

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

            {/* 邮箱 + 验证码 */}
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-envelope mr-1.5" style={{ color: 'var(--primary-dark)' }} />
                邮箱
              </label>
              <div className="flex gap-2">
                <input type="email" className="form-control flex-1" value={email} onChange={e => { setEmail(e.target.value); setCodeSent(false); setCode(''); }} placeholder="your@email.com" />
                <button
                  type="button"
                  className="btn btn-outline whitespace-nowrap"
                  onClick={handleSendCode}
                  disabled={loading || cooldown > 0}
                  style={{ fontSize: '0.8rem', padding: '0 16px', minWidth: '100px' }}
                >
                  {loading ? <i className="fa-solid fa-spinner fa-spin" />
                    : cooldown > 0 ? `${cooldown}s`
                    : codeSent ? '重新发送' : '发送验证码'}
                </button>
              </div>
            </div>

            {/* 发送验证码安全验证（第 2 次起） */}
            {sendCodeCount >= 2 && !sendCodeCaptchaOk && (
              <div className="mb-4 p-3 rounded-xl" style={{ border: '1.5px solid var(--border)', background: 'var(--input-bg)' }}>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                    <i className="fa-solid fa-shield-halved mr-1" style={{ color: 'var(--primary-dark)' }} />
                    安全验证
                  </label>
                </div>
                {!sendCodeCaptchaStarted ? (
                  <div className="text-center">
                    <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>频繁获取验证码需要安全验证</p>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setSendCodeCaptchaStarted(true)}>
                      <i className="fa-solid fa-play" /> 开始验证
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center overflow-hidden" style={{ height: 280 }}>
                    <QuantumVerify
                      onVerified={() => setSendCodeCaptchaOk(true)}
                      onReset={() => {}}
                    />
                  </div>
                )}
              </div>
            )}

            {/* 验证码输入 */}
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

            {/* 安全验证 */}
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
                    请按照高亮提示的顺序依次点击节点<br />每个节点只能点击一次，5次错误将锁定5分钟
                  </p>
                  <button type="button" className="btn btn-outline" onClick={() => setCaptchaStarted(true)}>
                    <i className="fa-solid fa-play" /> 开始验证
                  </button>
                </div>
              )}

              {captchaStarted && !captchaOk && !locked && (
                <div className="flex-1 flex items-center justify-center overflow-hidden">
                  <QuantumVerify
                    ref={verifyRef}
                    onVerified={() => setCaptchaOk(true)}
                    onReset={(reason) => { if (reason === 'locked') setLocked(true); }}
                  />
                </div>
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

            {/* 协议同意 */}
            <div className="mb-5 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded cursor-pointer accent-[var(--primary-dark)]" />
                <span className="text-xs leading-relaxed" style={{ color: 'var(--text-light)' }}>
                  我已阅读并同意 <Link to="/terms" target="_blank" style={{ color: 'var(--link-color)' }}>用户协议</Link>
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={agreePrivacy} onChange={e => setAgreePrivacy(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded cursor-pointer accent-[var(--primary-dark)]" />
                <span className="text-xs leading-relaxed" style={{ color: 'var(--text-light)' }}>
                  我已阅读并同意 <Link to="/privacy" target="_blank" style={{ color: 'var(--link-color)' }}>隐私政策</Link>
                </span>
              </label>
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={loading || !allReady}>
              {loading ? '注册中...' : locked ? '已锁定' : '注册'}
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
