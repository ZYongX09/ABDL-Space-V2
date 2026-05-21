import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const FAIL_THRESHOLD = 2;

export default function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [consented, setConsented] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaStarted, setCaptchaStarted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const captchaContainerRef = useRef(null);
  const captchaTokenRef = useRef(null);
  const { login: authLogin, saveConsent } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const needCaptcha = failCount >= FAIL_THRESHOLD;
  const canSubmit = !loading && (!needCaptcha || captchaOk);

  // SDK 加载后渲染
  useEffect(() => {
    if (!captchaStarted || !captchaContainerRef.current) return;
    if (!window.ABDLCaptcha) {
      const check = setInterval(() => {
        if (window.ABDLCaptcha) { clearInterval(check); renderCaptcha(); }
      }, 200);
      return () => clearInterval(check);
    }
    renderCaptcha();

    function renderCaptcha() {
      if (!captchaContainerRef.current) return;
      captchaContainerRef.current.innerHTML = '';
      const apiKey = window.__ABDL_CAPTCHA_KEY || '';
      try {
        window.ABDLCaptcha.render(captchaContainerRef.current, {
          apiKey,
          onSuccess: (token) => {
            captchaTokenRef.current = token;
            setCaptchaOk(true);
          },
          onError: (err) => {
            if (err.message?.includes('Locked')) {
              toast.error('验证已锁定，请稍后再试');
            }
          },
        });
      } catch (err) {
        console.error('Captcha render failed:', err);
      }
    }
  }, [captchaStarted, toast]);

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

          {needCaptcha && (
            <div className="mb-5 p-4 rounded-xl flex flex-col" style={{ border: `1.5px solid ${captchaOk ? 'var(--success)' : 'var(--border)'}`, background: 'var(--input-bg)' }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  <i className="fa-solid fa-shield-halved mr-1.5" style={{ color: 'var(--primary-dark)' }} />
                  安全验证
                </label>
                {captchaOk && <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}><i className="fa-solid fa-circle-check mr-1" />已通过</span>}
              </div>

              {!captchaStarted && !captchaOk && (
                <div className="flex flex-col items-center justify-center py-4">
                  <p className="text-xs mb-3 text-center" style={{ color: 'var(--text-light)' }}>
                    检测到多次登录失败，请完成安全验证
                  </p>
                  <button type="button" className="btn btn-outline" onClick={() => setCaptchaStarted(true)}>
                    <i className="fa-solid fa-play" /> 开始验证
                  </button>
                </div>
              )}

              {captchaStarted && !captchaOk && (
                <div ref={captchaContainerRef} style={{ minHeight: 300 }} />
              )}

              {captchaOk && (
                <div className="flex flex-col items-center justify-center py-4">
                  <i className="fa-solid fa-circle-check text-3xl mb-2" style={{ color: 'var(--success)' }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>验证已通过</p>
                </div>
              )}
            </div>
          )}

          <label className="flex items-start gap-2.5 mb-5 cursor-pointer">
            <input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded cursor-pointer accent-[var(--primary-dark)]" />
            <span className="text-xs leading-relaxed" style={{ color: 'var(--text-light)' }}>
              我已阅读并同意 <Link to="/privacy" target="_blank" style={{ color: 'var(--link-color)' }}>隐私政策</Link>
            </span>
          </label>

          <button type="submit" className="btn btn-primary w-full" disabled={!canSubmit}>
            {loading ? '登录中...' : '登录'}
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
