import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isNBWConfigured, startNBWOAuth } from '../utils/nbwOAuth';
import AnimatedCharacters from '../components/AnimatedCharacters/AnimatedCharacters';
import './Login.css';

const FAIL_THRESHOLD = 2;
const NBW_LOGO = 'https://img.abdl-space.top/file/nbwlogo.png';

export default function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [consented, setConsented] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaStarted, setCaptchaStarted] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [showNBWConsent, setShowNBWConsent] = useState(false);
  const captchaContainerRef = useRef(null);
  const captchaTokenRef = useRef(null);
  const { login: authLogin, saveConsent, logout, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const needCaptcha = failCount >= FAIL_THRESHOLD;
  const canSubmit = !loading && (!needCaptcha || captchaOk);
  const isPasswordPlain = passwordRevealed && password.length > 0;
  const nbwConfigured = isNBWConfigured();

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
          onSuccess: (token) => { captchaTokenRef.current = token; setCaptchaOk(true); },
          onError: (err) => { if (err.message?.includes('Locked')) toast.error('验证已锁定，请稍后再试'); },
        });
      } catch (err) { console.error('Captcha render failed:', err); }
    }
  }, [captchaStarted, toast]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!login.trim()) { toast.error('请填写用户名/邮箱'); return; }
    if (passwordVisible && !password) { toast.error('请填写密码'); return; }
    if (!passwordVisible) { setPasswordVisible(true); return; }
    if (!consented) { toast.error('请阅读并同意隐私政策'); return; }
    if (needCaptcha && !captchaOk) { toast.error('请完成安全验证'); return; }
    try {
      setLoading(true);
      await authLogin({ login: login.trim(), password, captchaToken: captchaTokenRef.current || undefined });
      saveConsent({ privacy: true });
      toast.success('登录成功');
      navigate('/');
    } catch (e) {
      toast.error(e.message);
      setFailCount(c => c + 1);
      if (needCaptcha) { setCaptchaOk(false); setCaptchaStarted(false); captchaTokenRef.current = null; }
    } finally { setLoading(false); }
  };

  const loginForm = (
    <div className="login-form-wrap">
      <div className="login-form-inner">
        {/* 标题 */}
        <div className="login-header">
          <div className="login-logo-icon">
            <i className="fa-solid fa-baby" />
          </div>
          <h1 className="login-title">欢迎回来</h1>
          <p className="login-subtitle">登录 ABDL Space</p>
        </div>

        {/* NBW 登录 */}
        {nbwConfigured ? (
          <>
            <button className="login-nbw-btn" onClick={() => setShowNBWConsent(true)}>
              <img src={NBW_LOGO} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
              <span>使用 宝宝新天地 授权登录</span>
            </button>
            <div className="login-divider">
              <div className="login-divider-line" />
              <span>或使用账号密码</span>
              <div className="login-divider-line" />
            </div>
          </>
        ) : (
          <>
            <button className="login-nbw-btn login-nbw-btn--disabled" disabled>
              <img src={NBW_LOGO} alt="" style={{ width: 20, height: 20, objectFit: 'contain', opacity: 0.5 }} />
              <span>宝宝新天地（暂未开放）</span>
            </button>
            <div className="login-divider">
              <div className="login-divider-line" />
              <span>或使用账号密码</span>
              <div className="login-divider-line" />
            </div>
          </>
        )}

        {/* NBW 同意弹窗 */}
        {showNBWConsent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div className="card max-w-sm mx-4" style={{ background: 'var(--bg-card)' }}>
              <h3 className="font-bold mb-3" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-shield-halved mr-2" style={{ color: 'var(--primary-dark)' }} />
                授权登录确认
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-light)' }}>
                即将跳转到「宝宝新天地」进行授权登录。授权后，我们将获取您的基本信息用于账户识别。
              </p>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                请确认您同意 <Link to="/privacy" target="_blank" style={{ color: 'var(--link-color)' }}>隐私政策</Link>
                {' '}和{' '}
                <Link to="/terms" target="_blank" style={{ color: 'var(--link-color)' }}>用户协议</Link>。
              </p>
              <div className="flex gap-2 justify-end">
                <button className="btn btn-outline btn-sm" onClick={() => setShowNBWConsent(false)}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={async () => {
                  saveConsent({ privacy: true });
                  if (user) await logout();
                  startNBWOAuth();
                }}>同意并继续</button>
              </div>
            </div>
          </div>
        )}

        {/* 表单 */}
        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>用户名 / 邮箱</label>
            <input className="login-input" value={login} onChange={e => { setLogin(e.target.value); if (e.target.value) setPasswordVisible(true); }} placeholder="输入用户名或邮箱" autoFocus />
          </div>
          {passwordVisible && (
            <div className="login-field">
              <label>密码</label>
              <div className="login-input-wrap">
                <input type={passwordRevealed ? 'text' : 'password'} className="login-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="输入密码" />
                <button type="button" onClick={() => setPasswordRevealed(v => !v)} className="login-eye-btn">
                  <i className={`fa-solid ${passwordRevealed ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>
          )}

          {needCaptcha && (
            <div className="login-captcha">
              <div className="login-captcha-header">
                <label><i className="fa-solid fa-shield-halved mr-1.5" style={{ color: 'var(--primary-dark)' }} />安全验证</label>
                {captchaOk && <span className="login-captcha-ok"><i className="fa-solid fa-circle-check mr-1" />已通过</span>}
              </div>
              {!captchaStarted && !captchaOk && (
                <div className="login-captcha-start">
                  <p>检测到多次登录失败，请完成安全验证</p>
                  <button type="button" className="btn btn-outline" onClick={() => setCaptchaStarted(true)}><i className="fa-solid fa-play" /> 开始验证</button>
                </div>
              )}
              {captchaStarted && !captchaOk && <div ref={captchaContainerRef} />}
              {captchaOk && (
                <div className="login-captcha-done">
                  <i className="fa-solid fa-circle-check" />
                  <p>验证已通过</p>
                </div>
              )}
            </div>
          )}

          <label className="login-consent">
            <input type="checkbox" checked={consented} onChange={e => setConsented(e.target.checked)} />
            <span>我已阅读并同意 <Link to="/privacy" target="_blank">隐私政策</Link></span>
          </label>

          <button type="submit" className="login-submit" disabled={!canSubmit}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="login-footer">
          还没有账号？ <Link to="/register">注册</Link>
          <span className="login-footer-sep">|</span>
          <Link to="/forgot-password">忘记密码？</Link>
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* 桌面端：左右分栏 */}
      <div className="login-desktop">
        <div className="login-left">
          <div className="login-left-content">
            <AnimatedCharacters
              isTyping={login.length > 0 && !passwordVisible}
              showPassword={isPasswordPlain}
              passwordLength={password.length}
            />
            <p className="login-left-text">探索 ABDL 世界</p>
          </div>
          <div className="login-left-bg" />
        </div>
        <div className="login-right">
          {loginForm}
        </div>
      </div>

      {/* 移动端：保持原布局 */}
      <div className="login-mobile">
        <div className="login-mobile-inner">
          <AnimatedCharacters
            isTyping={login.length > 0 && !passwordVisible}
            showPassword={isPasswordPlain}
            passwordLength={password.length}
          />
          {loginForm}
        </div>
      </div>
    </>
  );
}
