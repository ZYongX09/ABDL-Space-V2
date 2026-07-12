import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isNBWConfigured, startNBWOAuth } from '../utils/nbwOAuth';
import { useInlineVerify } from '../components/useInlineVerify';
import { isWebAuthnReallyAvailable, isPWA, authenticateWithPasskey, getMyCredentials } from '../utils/webauthn';
import BiometricPrompt from '../components/BiometricPrompt';

const FAIL_THRESHOLD = 2;
const NBW_LOGO = 'https://img.abdl-space.top/file/nbwlogo.png';

export default function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [consented, setConsented] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [showNBWConsent, setShowNBWConsent] = useState(false);
  const captchaTokenRef = useRef(null);
  const { login: authLogin, saveConsent, logout, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { trigger: triggerCaptcha, InlineVerify, verified, active: captchaActive } = useInlineVerify();

  const needCaptcha = failCount >= FAIL_THRESHOLD;
  const canSubmit = !loading && (!needCaptcha || verified);
  const nbwConfigured = isNBWConfigured();

  const isPWA = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const [showBiometricLogin, setShowBiometricLogin] = useState(false);
  const [showBiometricPrompt, setShowBiometricPrompt] = useState(false);
  const [webauthnLoading, setWebauthnLoading] = useState(false);
  const [hasPasskeys, setHasPasskeys] = useState(false);
  const [showAccountConfirm, setShowAccountConfirm] = useState(false);
  const [passkeyAccounts, setPasskeyAccounts] = useState([]);

  // 异步检测 WebAuthn 是否真正可用
  useEffect(() => {
    if (isPWA) {
      isWebAuthnReallyAvailable().then(available => {
        setShowBiometricLogin(available);
      });
    }
  }, [isPWA]);

  // 检查是否有已注册的 passkey（用于免账号登录）
  useEffect(() => {
    if (showBiometricLogin) {
      // 尝试获取已注册的凭证（需要先知道用户名）
      // 这里先检查 localStorage 中是否有上次登录的用户名
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
        saveConsent({ privacy: true, userId: result.user?.id });
        toast.success('登录成功');
        navigate(location.state?.from || '/');
      } else {
        toast.error(result.error || '验证失败');
      }
    } catch (e) {
      // 显示实际错误信息
      toast.error(e.message || '验证失败');
    } finally {
      setWebauthnLoading(false);
      setShowAccountConfirm(false);
    }
  };

  // 显示账户确认弹窗
  const handleBiometricClick = () => {
    // 如果输入框有用户名，直接用它
    if (login.trim()) {
      handleWebAuthnLogin(login.trim());
      return;
    }
    // 有保存的账户，弹窗选择
    if (passkeyAccounts.length > 0) {
      setShowAccountConfirm(true);
    } else {
      // 无保存账户，也不需要输入用户名
      // Passkey 的 discoverable credentials 会自动匹配账户
      handleWebAuthnLogin('');
    }
  };



  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!login.trim()) { toast.error('请填写用户名/邮箱'); return; }
    if (showPassword && !password) { toast.error('请填写密码'); return; }
    if (!showPassword) { setShowPassword(true); return; }
    if (!consented) { toast.error('请阅读并同意隐私政策'); return; }
    if (needCaptcha && !verified) {
      triggerCaptcha();
      return;
    }
    try {
      setLoading(true);
      const result = await authLogin({
        login: login.trim(),
        password,
        captchaToken: captchaTokenRef.current || undefined,
      });
      saveConsent({ privacy: true, userId: result?.user?.id });
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
      toast.error(e.message);
      setFailCount(c => c + 1);
      if (needCaptcha) { captchaTokenRef.current = null; }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout hero={{ icon: 'fa-right-to-bracket', title: '登录', subtitle: '欢迎回到 ABDL Space' }}>
      <div className="card max-w-md mx-auto">
        {/* 宝宝安全识别登录按钮（仅 PWA + 支持 WebAuthn 时显示） */}
        {showBiometricLogin && (
          <>
            <button
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg transition-all hover:opacity-80"
              style={{ background: 'var(--primary)', color: 'white', cursor: 'pointer', boxShadow: '0 2px 8px rgba(168,216,240,0.3)' }}
              onClick={handleBiometricClick}
              disabled={webauthnLoading}
            >
              <i className={`fa-solid ${webauthnLoading ? 'fa-spinner fa-spin' : 'fa-fingerprint'}`} />
              <span className="text-sm font-medium">{webauthnLoading ? '验证中...' : '宝宝安全识别登录'}</span>
            </button>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>或使用账号密码登录</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>
          </>
        )}
        {/* NewBabyWorld 第三方登录 */}
        {nbwConfigured ? (
          <>
            <button
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg transition-all hover:opacity-80"
              style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', boxShadow: '0 1px 2px rgba(60,64,67,0.15)' }}
              onClick={() => setShowNBWConsent(true)}
            >
              <img src={NBW_LOGO} alt="" style={{ width: 22, height: 22, objectFit: 'contain' }} />
              <span className="text-sm font-medium">使用 宝宝新天地 账户授权登录</span>
            </button>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>或使用账号密码登录</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
            </div>
          </>
        ) : (
          <>
            <button
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'not-allowed', opacity: 0.6 }}
              disabled
              title="暂未开放"
            >
              <img src={NBW_LOGO} alt="" style={{ width: 22, height: 22, objectFit: 'contain', opacity: 0.5 }} />
              <span className="text-sm">使用 宝宝新天地 账户授权登录（暂未开放）</span>
            </button>
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>或使用账号密码登录</span>
              <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
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
                  if (user) await logout(); // 已登录时先退出，避免 cookie 冲突
                  startNBWOAuth();
                }}>
                  同意并继续
                </button>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4 miui-input-group">
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>用户名 / 邮箱</label>
            <input className="form-control" value={login} onChange={e => { setLogin(e.target.value); if (e.target.value) setShowPassword(true); }} placeholder="输入用户名或邮箱" autoFocus />
          </div>
          <div className="mb-5 miui-input-group">
            <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>密码</label>
            <div className="relative">
              <input type={showPassword ? 'text' : 'password'} className="form-control pr-10" value={password} onChange={e => setPassword(e.target.value)} placeholder="输入密码" />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>

          {needCaptcha && (
            <div className="mb-5 p-4 rounded-xl flex flex-col" style={{ border: `1.5px solid ${verified ? 'var(--success)' : 'var(--border)'}`, background: 'var(--input-bg)' }}>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  <i className="fa-solid fa-shield-halved mr-1.5" style={{ color: 'var(--primary-dark)' }} />
                  安全验证
                </label>
                {verified && <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}><i className="fa-solid fa-circle-check mr-1" />已通过</span>}
              </div>

              {!verified && !captchaActive && (
                <div className="flex flex-col items-center justify-center py-4">
                  <p className="text-xs mb-3 text-center" style={{ color: 'var(--text-light)' }}>
                    检测到多次登录失败，请完成安全验证
                  </p>
                  <button type="button" className="btn btn-outline" onClick={triggerCaptcha}>
                    <i className="fa-solid fa-play" /> 开始验证
                  </button>
                </div>
              )}
              {InlineVerify}
              {verified && (
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

          <button type="submit" className="btn btn-primary w-full miui-press" disabled={!canSubmit}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
        <p className="text-center mt-4 text-sm" style={{ color: 'var(--text-light)' }}>
          还没有账号？ <Link to="/register" style={{ color: 'var(--link-color)' }}>注册</Link>
          <span style={{ color: 'var(--text-muted)', margin: '0 8px' }}>|</span>
          <Link to="/forgot-password" style={{ color: 'var(--link-color)' }}>忘记密码？</Link>
        </p>
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
        <div className="modal-overlay" onClick={() => setShowAccountConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ padding: 24, textAlign: 'center' }}>
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
    </PageLayout>
  );
}
