import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { isNBWConfigured, startNBWOAuth } from '../utils/nbwOAuth';

const FAIL_THRESHOLD = 2;
const NBW_LOGO = 'https://www.newbabyworld.top/logo_square.png';

export default function Login() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [consented, setConsented] = useState(false);
  const [captchaOk, setCaptchaOk] = useState(false);
  const [captchaStarted, setCaptchaStarted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [showNBWConsent, setShowNBWConsent] = useState(false);
  const captchaContainerRef = useRef(null);
  const captchaTokenRef = useRef(null);
  const { login: authLogin, saveConsent } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const needCaptcha = failCount >= FAIL_THRESHOLD;
  const canSubmit = !loading && (!needCaptcha || captchaOk);
  const nbwConfigured = isNBWConfigured();

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
    if (!login.trim()) { toast.error('请填写用户名/邮箱'); return; }
    if (showPassword && !password) { toast.error('请填写密码'); return; }
    if (!showPassword) { setShowPassword(true); return; }
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
        {/* NewBabyWorld 第三方登录 */}
        {nbwConfigured ? (
          <>
            <button
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg transition-all hover:opacity-80"
              style={{ background: '#fff', border: '1px solid #dadce0', color: '#3c4043', cursor: 'pointer', boxShadow: '0 1px 2px rgba(60,64,67,0.3)' }}
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
n              title="暂未开放"
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
                <button className="btn btn-primary btn-sm" onClick={() => { saveConsent({ privacy: true }); startNBWOAuth(); }}>
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
          {showPassword && (
            <div className="mb-5 miui-input-group">
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>密码</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} className="form-control pr-10" value={password} onChange={e => setPassword(e.target.value)} placeholder="输入密码" />
                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>
          )}

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
                <div ref={captchaContainerRef} />
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
    </PageLayout>
  );
}
