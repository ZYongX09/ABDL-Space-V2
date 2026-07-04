import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import VerificationInput from '../components/VerificationInput';
import BetaInfoCard from '../components/BetaInfoCard';
import PolicyModal from '../components/PolicyModal';
import { authAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useInlineVerify } from '../components/useInlineVerify';
import { maskEmail } from '../utils/emailMask';

const LOGO_HORIZONTAL = 'https://img.abdl-space.top/file/1779879241082_ABDL.png';
const LOGO_ICON = 'https://img.abdl-space.top/file/1779879250278_ABDL_icon.svg';
const LOGO_WORD = 'https://img.abdl-space.top/file/1779879269255_ABDL_word.svg';

/**
 * 创始成员计划 — 内测预注册
 *
 * 与 /register 业务逻辑一致，唯一差异是移除所有跨页跳转入口。
 * 协议查看走 PolicyModal 内嵌弹窗；注册成功后停留在感谢卡片（流程终点），不跳首页。
 */
export default function BetaRegister() {
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState(location.state?.username || '');
  const [email, setEmail] = useState(location.state?.email || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [sendCodeCount, setSendCodeCount] = useState(0);
  const [sendCodeCaptchaOk, setSendCodeCaptchaOk] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [inviteCode, setInviteCode] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreeMinor, setAgreeMinor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [policyModal, setPolicyModal] = useState(null);
  const [success, setSuccess] = useState(null);

  const { betaRegister, saveConsent } = useAuth();
  const toast = useToast();
  // 从 useInlineVerify 解构出 tokenRef（tokenRef.current 存放验证通过后的 token）
  const { trigger: triggerRegVerify, InlineVerify: RegInlineVerify, verified: regVerified, tokenRef: regTokenRef } = useInlineVerify();
  const { trigger: triggerSendCodeVerify, InlineVerify: SendCodeInlineVerify, verified: sendCodeVerified, tokenRef: sendCodeTokenRef } = useInlineVerify();

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // sendCode 二次验证通过后标记为 OK
  useEffect(() => {
    if (sendCodeVerified) setSendCodeCaptchaOk(true);
  }, [sendCodeVerified]);

  const handleSendCode = async () => {
    if (!email.trim()) { toast.error('请输入邮箱'); return; }
    if (!email.includes('@')) { toast.error('请输入合法邮箱'); return; }
    if (sendCodeCount >= 2 && !sendCodeCaptchaOk) {
      triggerSendCodeVerify();
      return;
    }
    setLoading(true);
    try {
      await authAPI.sendCode({
        email: email.trim(),
        type: 'register',
        captchaToken: sendCodeTokenRef.current || undefined,
      });
      toast.success('验证码已发送至邮箱');
      setCodeSent(true);
      setSendCodeCount(v => v + 1);
      setCooldown(60);
      setSendCodeCaptchaOk(false);
      sendCodeTokenRef.current = null;
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password) { toast.error('请填写所有字段'); return; }
    if (username.trim().length < 3 || username.trim().length > 30) { toast.error('用户名需 3-30 个字符'); return; }
    if (!email.includes('@')) { toast.error('请输入合法邮箱'); return; }
    if (password.length < 8) { toast.error('密码至少 8 位'); return; }
    if (password !== confirm) { toast.error('两次密码不一致'); return; }
    if (!agreeTerms || !agreePrivacy) { toast.error('请阅读并同意相关政策'); return; }
    if (!codeSent || code.length < 6) { toast.error('请先获取并输入验证码'); return; }
    if (!regVerified) { toast.error('请完成安全验证'); return; }

    try {
      setLoading(true);
      const result = await betaRegister({
        username: username.trim(),
        email: email.trim(),
        password,
        code,
        captchaToken: regTokenRef.current || undefined,
        inviteCode: inviteCode.trim() || undefined,
      });
      saveConsent({ privacy: true, terms: true, userId: result?.user?.id });
      toast.success('欢迎加入创始成员计划！');
      navigate('/nbw-bind-guide');
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const allReady = agreeTerms && agreePrivacy && regVerified && codeSent && code.length >= 6;

  // 底部 logo + 版权
  const FooterLogo = (
    <div className="text-center mt-8 miui-card-in" style={{ animationDelay: '300ms' }}>
      <img
        src={LOGO_WORD}
        alt="ABDL Space"
        className="beta-footer-logo"
        style={{ width: 80, height: 'auto', opacity: 0.85 }}
      />
      <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>ABDL Space · 2026</p>
    </div>
  );

  // ============ 感谢卡片（注册成功） ============
  if (success) {
    return (
      <PageLayout hero={null}>
        <div className="max-w-md mx-auto">
          <div
            className="card miui-card-in"
            style={{ padding: '32px 28px', textAlign: 'center' }}
          >
            {/* 金色徽章 */}
            <div
              className="mx-auto mb-4 miui-float"
              style={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'linear-gradient(135deg, #FFB347, #FF8C42)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 20px rgba(255, 179, 71, 0.4)',
              }}
            >
              <i className="fa-solid fa-medal" style={{ fontSize: '32px', color: '#fff' }} />
            </div>

            <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>
              感谢您的预注册
            </h2>
            <p className="text-sm mb-5" style={{ color: 'var(--text-light)' }}>
              您已成功加入创始成员候选名单
            </p>

            {/* 品牌标识 */}
            <div
              className="flex items-center justify-center gap-1.5 mb-5"
              style={{ color: 'var(--text-muted)' }}
            >
              <img src={LOGO_ICON} alt="ABDL Space" style={{ width: 20, height: 20 }} />
              <span className="text-xs">ABDL Space</span>
            </div>

            {/* 注册信息 */}
            <div
              className="text-left miui-card-in"
              style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', animationDelay: '100ms' }}
            >
              <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>注册信息</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--text-muted)' }}>用户名</span>
                  <span style={{ color: 'var(--text)' }} className="text-right break-all">{success.username}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--text-muted)' }}>邮箱</span>
                  <span style={{ color: 'var(--text)' }} className="text-right">{maskEmail(success.email)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--text-muted)' }}>注册时间</span>
                  <span style={{ color: 'var(--text)' }} className="text-right">{success.time}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: 'var(--text-muted)' }}>成员身份</span>
                  <span style={{ color: 'var(--beta-primary-dark)', fontWeight: 600 }}>创始成员候选</span>
                </div>
              </div>
            </div>

            {/* 底部提示 */}
            <div
              className="text-xs mt-5 miui-card-in"
              style={{
                color: 'var(--text-muted)',
                borderTop: '1px solid var(--border)',
                paddingTop: '16px',
                animationDelay: '200ms',
              }}
            >
              内测正式开放时间请等待内测群通知
            </div>
          </div>

          {FooterLogo}
        </div>
      </PageLayout>
    );
  }

  // ============ 注册表单 ============
  return (
    <PageLayout hero={null}>
      <div className="max-w-md mx-auto">
        {/* Hero 区 */}
        <div className="text-center mb-6 miui-card-in">
          <img
            src={LOGO_ICON}
            alt="ABDL Space"
            style={{ width: 56, height: 56, margin: '0 auto 16px', display: 'block' }}
          />
          <p
            className="text-xs tracking-widest mb-2"
            style={{ color: 'var(--text-muted)', letterSpacing: '0.15em' }}
          >
            ABDL SPACE / 创始成员计划
          </p>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-flask mr-2" style={{ color: 'var(--beta-primary)', fontSize: '1.25rem' }} />
            内测申请
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-light)' }}>
            申请加入前 120 位共建者，与我们共同打磨 ABDL Space
          </p>
        </div>

        {/* 活动信息卡 */}
        <BetaInfoCard />

        {/* 须知小贴士 */}
        <div
          className="flex items-start gap-2 p-3 rounded-xl mb-5 miui-card-in"
          style={{
            background: 'var(--primary-light)',
            border: '1px solid var(--border)',
            animationDelay: '100ms',
          }}
        >
          <i className="fa-solid fa-circle-info mt-0.5" style={{ color: 'var(--primary-dark)' }} />
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text)' }}>
            内测期间部分功能可能不稳定，您的反馈将帮助我们快速改进
          </p>
        </div>

        {/* 表单卡片 */}
        <div
          className="card miui-card-in"
          style={{ padding: '24px', animationDelay: '200ms' }}
        >
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>用户名</label>
              <input
                className="form-control miui-input-group"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="3-30 个字符"
                autoFocus
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-envelope mr-1.5" style={{ color: 'var(--primary-dark)' }} />邮箱
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  className="form-control flex-1 miui-input-group"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setCodeSent(false); setCode(''); }}
                  placeholder="your@email.com"
                />
                <button
                  type="button"
                  className="btn btn-outline whitespace-nowrap miui-press"
                  onClick={handleSendCode}
                  disabled={loading || cooldown > 0}
                  style={{ fontSize: '0.8rem', padding: '0 16px', minWidth: '100px' }}
                >
                  {loading ? <i className="fa-solid fa-spinner fa-spin" /> : cooldown > 0 ? `${cooldown}s` : codeSent ? '重新发送' : '发送验证码'}
                </button>
              </div>
            </div>

            {sendCodeCount >= 2 && !sendCodeCaptchaOk && (
              <div className="mb-4 p-3 rounded-xl miui-card-in" style={{ border: '1.5px solid var(--border)', background: 'var(--input-bg)' }}>
                <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--text)' }}>
                  <i className="fa-solid fa-shield-halved mr-1" style={{ color: 'var(--primary-dark)' }} />安全验证
                </label>
                <p className="text-xs mb-2 text-center" style={{ color: 'var(--text-muted)' }}>频繁获取验证码需要安全验证</p>
                {sendCodeVerified ? (
                  <div className="text-center py-2 text-xs" style={{ color: 'var(--success)' }}>
                    <i className="fa-solid fa-circle-check mr-1" />验证已通过
                  </div>
                ) : (
                  <div className="text-center">
                    <button type="button" className="btn btn-outline btn-sm miui-press" onClick={triggerSendCodeVerify}>
                      <i className="fa-solid fa-play" /> 开始验证
                    </button>
                  </div>
                )}
                {SendCodeInlineVerify}
              </div>
            )}

            {codeSent && (
              <div className="mb-4 miui-card-in">
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
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-control pr-10 miui-input-group"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="至少 8 位"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                >
                  <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>确认密码</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  className="form-control pr-10 miui-input-group"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="再次输入密码"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                >
                  <i className={`fa-solid ${showConfirm ? 'fa-eye-slash' : 'fa-eye'}`} />
                </button>
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--text)' }}>邀请码（可选）</label>
              <input
                className="form-control miui-input-group"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                placeholder="ABDL-XXXX-XXXX"
              />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>如有邀请码，注册后可获得额外奖励</p>
            </div>

            {/* 安全验证 */}
            <div
              className="mb-5 p-4 rounded-xl"
              style={{
                border: `1.5px solid ${regVerified ? 'var(--success)' : 'var(--border)'}`,
                background: 'var(--input-bg)',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  <i className="fa-solid fa-shield-halved mr-1.5" style={{ color: 'var(--primary-dark)' }} />安全验证
                </label>
                {regVerified && (
                  <span className="text-xs font-semibold" style={{ color: 'var(--success)' }}>
                    <i className="fa-solid fa-circle-check mr-1" />已通过
                  </span>
                )}
              </div>

              {!regVerified && (
                <div className="flex flex-col items-center justify-center py-3">
                  <p className="text-xs mb-3 text-center" style={{ color: 'var(--text-light)' }}>
                    请完成安全验证<br />每个节点只能点击一次，5次错误将锁定5分钟
                  </p>
                  <button type="button" className="btn btn-outline miui-press" onClick={triggerRegVerify}>
                    <i className="fa-solid fa-play" /> 开始验证
                  </button>
                </div>
              )}
              {RegInlineVerify}
            </div>

            {/* 协议 */}
            <div className="mb-5 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={e => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded cursor-pointer"
                  style={{ accentColor: 'var(--primary-dark)' }}
                />
                <span className="text-xs leading-relaxed" style={{ color: 'var(--text-light)' }}>
                  我已阅读并同意{' '}
                  <button
                    type="button"
                    onClick={() => setPolicyModal('terms')}
                    className="underline"
                    style={{ color: 'var(--link-color)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
                  >
                    用户协议
                  </button>
                </span>
              </label>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreePrivacy}
                  onChange={e => setAgreePrivacy(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded cursor-pointer"
                  style={{ accentColor: 'var(--primary-dark)' }}
                />
                <span className="text-xs leading-relaxed" style={{ color: 'var(--text-light)' }}>
                  我已阅读并同意{' '}
                  <button
                    type="button"
                    onClick={() => setPolicyModal('privacy')}
                    className="underline"
                    style={{ color: 'var(--link-color)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit' }}
                  >
                    隐私政策
                  </button>
                </span>
              </label>
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              className="btn btn-primary w-full miui-press"
              disabled={loading || !allReady}
            >
              <i className="fa-solid fa-flask mr-2" />
              {loading ? '提交中...' : '申请加入内测'}
              <span
                className="ml-2 px-1.5 py-0.5 rounded font-bold"
                style={{
                  background: 'linear-gradient(135deg, #FFB347, #FF8C42)',
                  color: '#fff',
                  fontSize: '0.65rem',
                  letterSpacing: '0.05em',
                }}
              >
                内测
              </span>
            </button>
          </form>
        </div>

        {FooterLogo}
      </div>

      {policyModal && <PolicyModal policyKey={policyModal} onClose={() => setPolicyModal(null)} />}
    </PageLayout>
  );
}
