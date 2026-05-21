import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
import EditProfile from '../components/EditProfile';
import VerificationInput from '../components/VerificationInput';

import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { authAPI } from '../api';

export default function AccountPrivacy() {
  const { user } = useAuth();
  const toast = useToast();
  const [showEdit, setShowEdit] = useState(false);

  if (!user) {
    return (
      <>
        <MobileHeader title="账户与隐私" />
        <PageLayout hero={{ icon: 'fa-user-shield', title: '账户与隐私' }}>
          <div className="card text-center py-8">
            <p style={{ color: 'var(--text-light)' }}>请先登录</p>
            <Link to="/login" className="btn btn-primary mt-4">去登录</Link>
          </div>
        </PageLayout>
      </>
    );
  }

  return (
    <>
      <MobileHeader title="账户与隐私" />
      <PageLayout hero={{ icon: 'fa-user-shield', title: '账户与隐私', subtitle: '管理你的账户信息和隐私设置' }}>

        {/* 编辑资料 */}
        <div className="card mb-5">
          <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-user-pen mr-2" style={{ color: 'var(--primary-dark)' }} />
            个人资料
          </h3>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold overflow-hidden"
                style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
                {user.avatar
                  ? <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                  : user.username?.[0]?.toUpperCase()
                }
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: 'var(--text)' }}>{user.username}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{user.email || '未设置邮箱'}</div>
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => setShowEdit(true)}>
              <i className="fa-solid fa-pen-to-square mr-1" /> 编辑
            </button>
          </div>
        </div>

        {/* 邮箱管理 */}
        <EmailSection user={user} toast={toast} />

        {/* 密码与安全 */}
        <div className="card mb-5">
          <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-lock mr-2" style={{ color: 'var(--primary-dark)' }} />
            密码与安全
          </h3>
          <Link to="/forgot-password" className="flex items-center justify-between py-2 group">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>修改密码</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>通过邮箱验证码重置密码</div>
            </div>
            <i className="fa-solid fa-chevron-right text-xs" style={{ color: 'var(--text-muted)' }} />
          </Link>
        </div>

        {/* 隐私与条款 */}
        <div className="card mb-5">
          <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-shield-halved mr-2" style={{ color: 'var(--primary-dark)' }} />
            隐私与条款
          </h3>
          <div className="space-y-1">
            {[
              { to: '/privacy', icon: 'fa-file-shield', label: '隐私政策' },
              { to: '/terms', icon: 'fa-file-contract', label: '用户协议' },
              { to: '/cookies', icon: 'fa-cookie-bite', label: 'Cookie 政策' },
            ].map(item => (
              <Link key={item.to} to={item.to} className="flex items-center justify-between py-2.5 group">
                <div className="flex items-center gap-3">
                  <i className={`fa-solid ${item.icon}`} style={{ color: 'var(--text-muted)', width: '16px', textAlign: 'center' }} />
                  <span className="text-sm" style={{ color: 'var(--text)' }}>{item.label}</span>
                </div>
                <i className="fa-solid fa-chevron-right text-xs" style={{ color: 'var(--text-muted)' }} />
              </Link>
            ))}
          </div>
        </div>

        {/* 账户操作 */}
        <div className="card mb-5">
          <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-gear mr-2" style={{ color: 'var(--primary-dark)' }} />
            其他设置
          </h3>
          <Link to="/settings" className="flex items-center justify-between py-2 group">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>应用设置</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>主题、内容安全、快捷键</div>
            </div>
            <i className="fa-solid fa-chevron-right text-xs" style={{ color: 'var(--text-muted)' }} />
          </Link>
        </div>

        {/* 编辑资料弹窗 */}
        {showEdit && <EditProfile onClose={() => setShowEdit(false)} />}
      </PageLayout>
    </>
  );
}

// 邮箱管理组件（从 Settings.jsx 复用）
function EmailSection({ user, toast }) {
  const [showBind, setShowBind] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sendCodeCount, setSendCodeCount] = useState(0);
  const [sendCodeCaptchaOk, setSendCodeCaptchaOk] = useState(false);
  const [sendCodeCaptchaStarted, setSendCodeCaptchaStarted] = useState(false);
  const sendCodeContainerRef = useRef(null);
  const sendCodeTokenRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // SDK 渲染
  useEffect(() => {
    if (!sendCodeCaptchaStarted || !sendCodeContainerRef.current) return;
    const wait = setInterval(() => {
      if (window.ABDLCaptcha) {
        clearInterval(wait);
        sendCodeContainerRef.current.innerHTML = '';
        window.ABDLCaptcha.render(sendCodeContainerRef.current, {
          apiKey: window.__ABDL_CAPTCHA_KEY || '',
          onSuccess: (token) => { sendCodeTokenRef.current = token; setSendCodeCaptchaOk(true); },
        });
      }
    }, 200);
    return () => clearInterval(wait);
  }, [sendCodeCaptchaStarted]);

  const handleSendCode = useCallback(async () => {
    if (!email.trim() || !email.includes('@')) { toast.error('请输入合法邮箱'); return; }
    if (sendCodeCount >= 2 && !sendCodeCaptchaOk) { toast.error('请先完成安全验证'); return; }
    setLoading(true);
    try {
      await authAPI.sendCode({ email: email.trim(), type: 'bind' });
      toast.success('验证码已发送');
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

  const handleBind = useCallback(async () => {
    if (code.length < 6) { toast.error('请输入完整验证码'); return; }
    setLoading(true);
    try {
      await authAPI.bindEmail({ email: email.trim(), code });
      toast.success('邮箱绑定成功');
      setShowBind(false);
      setEmail('');
      setCode('');
      setCodeSent(false);
      window.location.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [email, code, toast]);

  const maskedEmail = user.email
    ? user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
    : '未绑定';

  return (
    <div className="card mb-5">
      <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
        <i className="fa-solid fa-envelope mr-2" style={{ color: 'var(--primary-dark)' }} />
        邮箱管理
      </h3>

      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            当前邮箱：{user.email ? maskedEmail : '未绑定'}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            {user.email ? '用于找回密码和接收通知' : '绑定邮箱后可用于找回密码'}
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => setShowBind(!showBind)}>
          {user.email ? '换绑' : '绑定'}
        </button>
      </div>

      {showBind && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="mb-3">
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>新邮箱地址</label>
            <div className="flex gap-2">
              <input type="email" className="form-control flex-1" value={email} onChange={e => { setEmail(e.target.value); setCodeSent(false); setCode(''); }} placeholder="your@email.com" />
              <button className="btn btn-outline btn-sm whitespace-nowrap" onClick={handleSendCode} disabled={loading || cooldown > 0}>
                {loading ? <i className="fa-solid fa-spinner fa-spin" />
                  : cooldown > 0 ? `${cooldown}s`
                  : codeSent ? '重发' : '发送验证码'}
              </button>
            </div>
          </div>

          {/* 发送验证码安全验证（第 2 次起） */}
          {sendCodeCount >= 2 && !sendCodeCaptchaOk && (
            <div className="mb-3 p-3 rounded-xl" style={{ border: '1.5px solid var(--border)', background: 'var(--input-bg)' }}>
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
            <>
              <div className="mb-3">
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-light)' }}>验证码</label>
                <VerificationInput value={code} onChange={setCode} />
              </div>
              <button className="btn btn-primary btn-sm w-full" onClick={handleBind} disabled={loading || code.length < 6}>
                {loading ? <i className="fa-solid fa-spinner fa-spin mr-2" /> : null}
                确认绑定
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
