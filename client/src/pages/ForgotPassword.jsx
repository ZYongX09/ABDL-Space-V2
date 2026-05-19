import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
import VerificationInput from '../components/VerificationInput';
import { authAPI } from '../api';
import { useToast } from '../contexts/ToastContext';

export default function ForgotPassword() {
  const [step, setStep] = useState(1); // 1=输入邮箱, 2=输入验证码+新密码
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleSendCode = useCallback(async () => {
    if (!email.trim()) { toast.error('请输入邮箱'); return; }
    setLoading(true);
    try {
      await authAPI.sendCode({ email: email.trim(), type: 'reset' });
      toast.success('验证码已发送');
      setCooldown(60);
      setStep(2);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [email, toast]);

  const handleReset = useCallback(async () => {
    if (!code || code.length < 6) { toast.error('请输入完整验证码'); return; }
    if (!newPassword) { toast.error('请输入新密码'); return; }
    if (newPassword.length < 8) { toast.error('密码至少 8 位'); return; }
    if (newPassword !== confirmPassword) { toast.error('两次密码不一致'); return; }
    setLoading(true);
    try {
      await authAPI.resetPassword({ email: email.trim(), code, newPassword });
      toast.success('密码已重置，请重新登录');
      navigate('/login');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [email, code, newPassword, confirmPassword, toast, navigate]);

  return (
    <>
      <MobileHeader title="找回密码" />
      <PageLayout hero={{ icon: 'fa-key', title: '找回密码', subtitle: '通过邮箱验证码重置密码' }}>
        <div className="card" style={{ maxWidth: 440, margin: '0 auto', padding: '2rem' }}>

          {step === 1 && (
            <>
              <div className="mb-5">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                  <i className="fa-solid fa-envelope mr-1.5" style={{ color: 'var(--primary-dark)' }} />
                  注册邮箱
                </label>
                <input
                  type="email"
                  className="form-control"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="输入注册时使用的邮箱"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSendCode()}
                />
              </div>
              <button
                className="btn btn-primary w-full"
                onClick={handleSendCode}
                disabled={loading}
              >
                {loading ? <i className="fa-solid fa-spinner fa-spin mr-2" /> : <i className="fa-solid fa-paper-plane mr-2" />}
                发送验证码
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="mb-4 text-center">
                <p className="text-sm" style={{ color: 'var(--text-light)' }}>
                  验证码已发送至 <strong style={{ color: 'var(--text)' }}>{email}</strong>
                </p>
                <button
                  className="text-xs mt-1"
                  style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => setStep(1)}
                >
                  更换邮箱
                </button>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>验证码</label>
                <VerificationInput value={code} onChange={setCode} />
                <div className="text-center mt-3">
                  {cooldown > 0 ? (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{cooldown} 秒后可重发</span>
                  ) : (
                    <button
                      className="text-xs"
                      style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                      onClick={handleSendCode}
                      disabled={loading}
                    >
                      重新发送
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>新密码</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="form-control pr-10"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="至少 8 位"
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                    <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                  </button>
                </div>
              </div>

              <div className="mb-5">
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>确认密码</label>
                <input
                  type="password"
                  className="form-control"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                />
              </div>

              <button
                className="btn btn-primary w-full"
                onClick={handleReset}
                disabled={loading}
              >
                {loading ? <i className="fa-solid fa-spinner fa-spin mr-2" /> : <i className="fa-solid fa-check mr-2" />}
                重置密码
              </button>
            </>
          )}

          <div className="text-center mt-4">
            <Link to="/login" className="text-sm" style={{ color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-arrow-left mr-1" /> 返回登录
            </Link>
          </div>
        </div>
      </PageLayout>
    </>
  );
}
