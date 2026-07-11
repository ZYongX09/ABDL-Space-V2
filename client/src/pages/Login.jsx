import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isNBWConfigured, startNBWOAuth } from '../utils/nbwOAuth';
import AnimatedCharacters from '../components/AnimatedCharacters/AnimatedCharacters';
import { useInlineVerify } from '../components/useInlineVerify';
import QRLoginMode from '../components/QRLoginMode';
import LanLoginMode from '../components/LanLoginMode';
import { isWebAuthnSupported, isPWA, authenticateWithPasskey, getMyCredentials } from '../utils/webauthn';
import BiometricPrompt from '../components/BiometricPrompt';
import './Login.css';

const FAIL_THRESHOLD = 2;
const NBW_LOGO = 'https://img.abdl-space.top/file/nbwlogo.png';

export default function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [consented, setConsented] = useState(false);
  const [minorConsented, setMinorConsented] = useState(false);

  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordRevealed, setPasswordRevealed] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [showNBWConsent, setShowNBWConsent] = useState(false);
  const [qrMode, setQrMode] = useState(false); // 二维码登录模式
  const [lanMode, setLanMode] = useState(false); // 内网一键登录模式
  const captchaTokenRef = useRef(null);
  const { login: authLogin, saveConsent, logout, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { trigger: triggerCaptcha, InlineVerify, verified, active: captchaActive } = useInlineVerify();

  const needCaptcha = failCount >= FAIL_THRESHOLD;
  const canSubmit = !loading && (!needCaptcha || verified) && consented && minorConsented;
  const isPasswordPlain = passwordRevealed && password.length > 0;
  const isTyping = emailFocused && login.length > 0;
  const nbwConfigured = isNBWConfigured();

  const isPWA = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const webauthnSupported = isWebAuthnSupported();
  const showBiometricLogin = isPWA && webauthnSupported;
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [webauthnLoading, setWebauthnLoading] = useState(false);
  const [hasPasskeys, setHasPasskeys] = useState(false);
  const [showAccountConfirm, setShowAccountConfirm] = useState(false);
  const [passkeyAccounts, setPasskeyAccounts] = useState([]);

  // 检查是否有已注册的 passkey
  useEffect(() => {
    if (showBiometricLogin) {
      try {
        const accounts = JSON.parse(localStorage.getItem('abdl_accounts') || '[]');
        if (accounts.length > 0) {
          setHasPasskeys(true);
          setPasskeyAccounts(accounts);
        }
      } catch {}
    }
  }, [showBiometricLogin]);

  // 宝宝安全识别登录（免账号，直接弹窗确认）
  const handleWebAuthnLogin = async (username) => {
    try {
      setWebauthnLoading(true);
      const result = await authenticateWithPasskey(username);
      if (result.verified && result.token) {
        saveConsent({ privacy: true, minor: true, userId: result.user?.id });
        toast.success('登录成功');
        navigate(location.state?.from || '/');
      } else {
        toast.error(result.error || '验证失败');
      }
    } catch (e) {
      if (e.message?.includes('credential manager') || e.name === 'NotAllowedError') {
        toast.error('此浏览器不支持安全识别，请使用其他浏览器或密码登录');
      } else {
        toast.error('验证失败：' + (e.message || '未知错误'));
      }
    } finally {
      setWebauthnLoading(false);
      setShowAccountConfirm(false);
    }
  };

  // 显示账户确认弹窗
  const handleBiometricClick = () => {
    if (passkeyAccounts.length > 0) {
      setShowAccountConfirm(true);
    } else {
      toast.info('请先输入用户名/邮箱');
    }
  };



  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!login.trim()) { toast.error('请填写用户名/邮箱'); return; }
    if (passwordVisible && !password) { toast.error('请填写密码'); return; }
    if (!passwordVisible) { setPasswordVisible(true); return; }
    if (!consented) { toast.error('请阅读并同意隐私政策'); return; }
    if (needCaptcha && !verified) {
      triggerCaptcha();
      return;
    }
    try {
      setLoading(true);
      const result = await authLogin({ login: login.trim(), password, captchaToken: captchaTokenRef.current || undefined });
      try { saveConsent({ privacy: true, minor: true, userId: result?.user?.id }); } catch {}
      toast.success('登录成功');

      // PWA 模式下检查是否需要推荐设置宝宝安全识别
      if (showBiometricLogin && result?.user?.id) {
        try {
          const { credentials } = await getMyCredentials();
          if (!credentials || credentials.length === 0) {
            setShowBiometricPrompt(true);
          }
        } catch {}
      }

      navigate(location.state?.from || '/');
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('Invalid credentials')) {
        toast.error('用户名或密码错误');
      } else if (msg.includes('Too many')) {
        toast.error('登录尝试过于频繁，请稍后再试');
      } else {
        toast.error(msg);
      }
      setFailCount(c => c + 1);
      if (needCaptcha) { captchaTokenRef.current = null; }
    } finally { setLoading(false); }
  };

  const loginForm = (
    <div className="login-form-wrap">
      <div className="login-form-inner">
        {/* 标题 */}
        <div className="login-header">
          <div className="login-logo-icon">
            <img src="https://img.abdl-space.top/file/1779879250278_ABDL_icon.svg" alt="ABDL Space" style={{ width: 28, height: 28 }} />
          </div>
          <h1 className="login-title">欢迎回来</h1>
          <p className="login-subtitle">登录 ABDL Space</p>
          {/* 二维码切换按钮 */}
          <button
            className="qr-toggle-btn"
            onClick={() => setQrMode(!qrMode)}
            title={qrMode ? '切换到账号密码登录' : '切换到二维码登录'}
          >
            <i className={`fa-solid ${qrMode ? 'fa-keyboard' : 'fa-qrcode'}`} />
          </button>
        </div>

        {/* QR 二维码登录模式 */}
        {qrMode ? (
          <QRLoginMode onSwitchBack={() => setQrMode(false)} />
        ) : lanMode ? (
          <LanLoginMode onSwitchBack={() => setLanMode(false)} />
        ) : (
          <>
        {/* 宝宝安全识别登录（仅 PWA） */}
        {showBiometricLogin && (
          <>
            <button
              className="login-nbw-btn"
              style={{ background: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' }}
              onClick={handleBiometricClick}
              disabled={webauthnLoading}
            >
              <i className={`fa-solid ${webauthnLoading ? 'fa-spinner fa-spin' : 'fa-fingerprint'}`} />
              <span>{webauthnLoading ? '验证中...' : '宝宝安全识别登录'}</span>
            </button>
            <div className="login-divider">
              <div className="login-divider-line" />
              <span>或使用账号密码</span>
              <div className="login-divider-line" />
            </div>
          </>
        )}

        {/* NBW 登录 */}
        {nbwConfigured ? (
          <>
            <button className="login-nbw-btn" onClick={() => setShowNBWConsent(true)}>
              <img src={NBW_LOGO} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
              <span>使用 宝宝新天地 授权登录</span>
            </button>
            {/* 内网设备一键登录（暂时禁用） */}
            {/* <button className="login-lan-btn" onClick={() => setLanMode(true)}>
              <i className="fa-solid fa-network-wired" />
              <span>内网设备一键登录</span>
            </button> */}
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
                请确认您同意 <Link to="/privacy" target="_blank" style={{ color: 'var(--link-color)' }}>隐私政策</Link>和<Link to="/terms" target="_blank" style={{ color: 'var(--link-color)' }}>用户协议</Link>。
              </p>
              <div className="flex gap-2 justify-end">
                <button className="btn btn-outline btn-sm" onClick={() => setShowNBWConsent(false)}>取消</button>
                <button className="btn btn-primary btn-sm" onClick={async () => {
                  try { saveConsent({ privacy: true, minor: true }); } catch {}
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
            <input className="login-input" value={login} onChange={e => { setLogin(e.target.value); if (e.target.value) setPasswordVisible(true); }} onFocus={() => setEmailFocused(true)} onBlur={() => setEmailFocused(false)} placeholder="输入用户名或邮箱" autoFocus />
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
                {verified && <span className="login-captcha-ok"><i className="fa-solid fa-circle-check mr-1" />已通过</span>}
              </div>
              {!verified && !captchaActive && (
                <div className="login-captcha-start">
                  <p>检测到多次登录失败，请完成安全验证</p>
                  <button type="button" className="btn btn-outline" onClick={triggerCaptcha}><i className="fa-solid fa-play" /> 开始验证</button>
                </div>
              )}
              {InlineVerify}
              {verified && (
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
          <label className="login-consent">
            <input type="checkbox" checked={minorConsented} onChange={e => setMinorConsented(e.target.checked)} />
            <span>我已年满18周岁，并已阅读并同意 <Link to="/terms" target="_blank">用户协议</Link>和<Link to="/privacy" target="_blank">隐私政策</Link></span>
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
          </>
        )}
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
              isTyping={isTyping}
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
            isTyping={isTyping}
            showPassword={isPasswordPlain}
            passwordLength={password.length}
          />
          {loginForm}
        </div>
      </div>

      {/* 宝宝安全识别设置推荐弹窗 */}
      {showBiometricPrompt && (
        <BiometricPrompt
          onSetup={async () => {
            setShowBiometricPrompt(false);
            try {
              const { registerPasskey } = await import('../utils/webauthn');
              const result = await registerPasskey();
              if (result.verified) {
                toast.success('宝宝安全识别已设置');
              } else {
                toast.error('设置失败，请重试');
              }
            } catch (e) {
              toast.error('设置失败：' + (e.message || '未知错误'));
            }
          }}
          onDismiss={() => setShowBiometricPrompt(false)}
        />
      )}

      {/* 账户确认弹窗（宝宝安全识别登录） */}
      {showAccountConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="card max-w-sm mx-4" style={{ background: 'var(--bg-card)', textAlign: 'center', padding: 24 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20,
              background: 'var(--primary-light)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <i className="fa-solid fa-fingerprint" style={{ fontSize: 28, color: 'var(--primary)' }} />
            </div>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
              确认登录账户
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              选择要登录的账户
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {passkeyAccounts.map((acc, i) => (
                <button
                  key={i}
                  onClick={() => handleWebAuthnLogin(acc.username)}
                  disabled={webauthnLoading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', borderRadius: 12,
                    border: '1px solid var(--border)', background: 'var(--bg-card)',
                    cursor: 'pointer', textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'var(--primary-light)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 600, color: 'var(--primary)',
                    overflow: 'hidden', flexShrink: 0,
                  }}>
                    {acc.avatar ? (
                      <img src={acc.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      acc.username?.[0]?.toUpperCase()
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{acc.username}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>ID: {acc.id}</div>
                  </div>
                  {webauthnLoading && <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--primary)' }} />}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAccountConfirm(false)}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 10,
                border: 'none', background: 'var(--input-bg)',
                color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </>
  );
}
