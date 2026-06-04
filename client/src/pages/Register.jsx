import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import VerificationInput from '../components/VerificationInput';
import { authAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isNBWConfigured } from '../utils/nbwOAuth';
import { useInlineVerify } from '../components/useInlineVerify';

export default function Register() {
  const location = useLocation();
  // 支持 location.state 和 sessionStorage 两种来源（仅读取一次）
  const [storedNBW] = useState(() => {
    try {
      const d = JSON.parse(sessionStorage.getItem('nbw_register_data') || 'null');
      if (d?.nbw) sessionStorage.removeItem('nbw_register_data');
      return d;
    } catch { return null; }
  });
  const nbwState = location.state?.nbw ? location.state : storedNBW;
  const [username, setUsername] = useState(nbwState?.username || '');
  const [email, setEmail] = useState(nbwState?.email || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendCodeCount, setSendCodeCount] = useState(0);
  const [sendCodeCaptchaOk, setSendCodeCaptchaOk] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMinor, setAgreeMinor] = useState(false);
  const [loading, setLoading] = useState(false);
  const regTokenRef = useRef(null);
  const sendCodeTokenRef = useRef(null);
  const { register, saveConsent } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { trigger: triggerRegVerify, InlineVerify: RegInlineVerify, verified: regVerified } = useInlineVerify();
  const { trigger: triggerSendCodeVerify, InlineVerify: SendCodeInlineVerify, verified: sendCodeVerified } = useInlineVerify();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);



  const handleSendCode = useCallback(async () => {
    if (!email.trim()) { toast.error('请输入邮箱'); return; }
    if (!email.includes('@')) { toast.error('请输入合法邮箱'); return; }
    if (sendCodeCount >= 2 && !sendCodeCaptchaOk) {
      triggerSendCodeVerify();
      return;
    }
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
    if (username.trim().length < 3 || username.trim().length > 30) { toast.error('用户名需 3-30 个字符'); return; }
    if (!email.includes('@')) { toast.error('请输入合法邮箱'); return; }
    if (password.length < 8) { toast.error('密码至少 8 位'); return; }
    if (password !== confirm) { toast.error('两次密码不一致'); return; }
    if (!agreeTerms || !agreePrivacy || !agreeMinor) { toast.error('请阅读并同意用户协议、隐私政策和未成年人个人信息保护政策'); return; }

    // 普通注册（NBW 也需要邮箱验证和安全验证）
    if (!codeSent || code.length < 6) { toast.error('请先获取并输入验证码'); return; }
    if (!regVerified) { toast.error('请完成安全验证'); return; }
    try {
      setLoading(true);
      const result = await register({
        username: username.trim(), email: email.trim(), password, code,
        captchaToken: regTokenRef.current || undefined,
        ...(nbwState ? { nbw_token: nbwState.nbw_token } : {}),
      });
      saveConsent({ privacy: true, terms: true, userId: result?.user?.id });
      toast.success('注册成功');
      navigate('/');
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const allReady = agreeTerms && agreePrivacy && agreeMinor && regVerified && codeSent && code.length >= 6;

  return (
    <>
      <PageLayout hero={{ icon: 'fa-user-plus', title: '注册', subtitle: '加入 ABDL Space 大家庭' }}>
        <div className="card max-w-md mx-auto">
          {nbwState && (
            <div className="flex items-center gap-2 mb-4 p-3 rounded-lg text-xs" style={{ background: 'var(--primary-light)', color: 'var(--text)' }}>
              <i className="fa-solid fa-link" style={{ color: 'var(--primary-dark)' }} />
              <span>完善以下信息完成注册，注册后将自动绑定宝宝新天地账号。</span>
            </div>
          )}
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
                <div className="text-center">
                  <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>频繁获取验证码需要安全验证</p>
                  <button type="button" className="btn btn-outline btn-sm" onClick={triggerSendCodeVerify}>
                    <i className="fa-solid fa-play" /> 开始验证
                  </button>
                </div>
                {SendCodeInlineVerify}
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

            <div className="mb-5 p-4 rounded-xl flex flex-col" style={{ border: `1.5px solid ${regVerified ? 'var(--success)' : 'var(--border)'}`, background: 'var(--input-bg)' }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  <i className="fa-solid fa-shield-halved mr-1.5" style={{ color: 'var(--primary-dark)' }} />安全验证
                </label>
                {regVerified && <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}><i className="fa-solid fa-circle-check mr-1" />已通过</span>}
              </div>

              {!regVerified && (
                <div className="flex flex-col items-center justify-center py-4">
                  <p className="text-xs mb-3 text-center" style={{ color: 'var(--text-light)' }}>
                    请完成安全验证<br />每个节点只能点击一次，5次错误将锁定5分钟
                  </p>
                  <button type="button" className="btn btn-outline" onClick={triggerRegVerify}>
                    <i className="fa-solid fa-play" /> 开始验证
                  </button>
                  {RegInlineVerify}
                </div>
              )}

              {regVerified && (
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
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input type="checkbox" checked={agreeMinor} onChange={e => setAgreeMinor(e.target.checked)} className="mt-0.5 w-4 h-4 rounded cursor-pointer accent-[var(--primary-dark)]" />
                <span className="text-xs leading-relaxed" style={{ color: 'var(--text-light)' }}>
                  我已阅读并同意 <Link to="/privacy" target="_blank" style={{ color: 'var(--link-color)' }}>未成年人个人信息保护政策</Link>
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
