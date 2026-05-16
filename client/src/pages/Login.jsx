import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import QuantumVerify from '../components/QuantumVerify';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const FAIL_THRESHOLD = 2; // 失败几次后弹验证码

export default function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [consented, setConsented] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaStarted, setCaptchaStarted] = useState(false);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const verifyRef = useRef(null);
  const { login: authLogin, saveConsent } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const needCaptcha = failCount >= FAIL_THRESHOLD;
  const canSubmit = !loading && (!needCaptcha || captchaOk) && !locked;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!login.trim() || !password) { toast.error('请填写用户名/邮箱和密码'); return; }
    if (!consented) { toast.error('请阅读并同意隐私政策'); return; }
    if (needCaptcha && !captchaOk) { toast.error('请完成安全验证'); return; }
    try {
      setLoading(true);
      await authLogin({ login: login.trim(), password });
      saveConsent({ privacy: true });
      toast.success('登录成功');
      navigate('/');
    } catch (e) {
      toast.error(e.message);
      setFailCount(c => c + 1);
      // 失败后重置验证码状态，下次需要重新验证
      if (needCaptcha) {
        setCaptchaOk(false);
        setCaptchaStarted(false);
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
            <input type="password" className="form-control" value={password} onChange={e => setPassword(e.target.value)} placeholder="输入密码" />
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
        </p>
      </div>
    </PageLayout>
  );
}
