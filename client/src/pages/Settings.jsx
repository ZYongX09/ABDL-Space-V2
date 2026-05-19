import { useState, useEffect, useCallback } from 'react';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
import VerificationInput from '../components/VerificationInput';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNsfw } from '../contexts/NsfwContext';
import { authAPI } from '../api';


export default function Settings() {
  const { theme, setTheme, autoTheme, toggleAutoTheme, THEMES, THEME_LABELS } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const { blurEnabled, toggleBlur } = useNsfw();
  const [searchNsfw, setSearchNsfw] = useState(() => {
    try { return localStorage.getItem('abdl_search_nsfw') === 'true'; } catch { return false; }
  });
  const toggleSearchNsfw = () => {
    setSearchNsfw(prev => {
      const next = !prev;
      try { localStorage.setItem('abdl_search_nsfw', String(next)); } catch {}
      return next;
    });
  };


  return (
    <>
    <MobileHeader title="设置" />
    <PageLayout hero={{ icon: 'fa-gear', title: '设置', subtitle: '自定义你的体验' }}>
      {/* 主题设置 */}
      <div className="card mb-5">
        <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-palette mr-2" style={{ color: 'var(--primary-dark)' }} />
          主题设置
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {THEMES.map(t => (
            <button
              key={t}
              className={`card text-center py-4 cursor-pointer transition-all ${theme === t ? 'ring-2' : ''}`}
              style={theme === t ? { borderColor: 'var(--primary)', ringColor: 'var(--primary)' } : {}}
              onClick={() => setTheme(t)}
            >
              <div className="text-2xl mb-2"><i className={`fa-solid ${THEME_LABELS[t]?.split(' ')[0]}`} /></div>
              <div className="font-semibold text-sm">{THEME_LABELS[t]?.split(' ')[1]}</div>
              {theme === t && <div className="text-xs mt-1" style={{ color: 'var(--primary-dark)' }}>当前使用</div>}
            </button>
          ))}
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          快捷键：Ctrl+Shift+T 循环切换主题
        </p>
        {/* 自动切换深浅色 */}
        <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>根据时间自动切换</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              19:00~7:00 深色模式，其余时间浅色模式
            </div>
          </div>
          <button
            onClick={toggleAutoTheme}
            style={{
              width: '48px', height: '26px', borderRadius: '13px',
              border: 'none', cursor: 'pointer',
              background: autoTheme ? 'var(--primary)' : 'var(--border)',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%',
              background: 'white', position: 'absolute', top: '2px',
              left: autoTheme ? '24px' : '2px',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>
        {autoTheme && (
          <p className="text-xs mt-2" style={{ color: 'var(--primary-dark)' }}>
            <i className="fa-solid fa-clock mr-1" />
            自动模式已开启，手动切换主题已禁用
          </p>
        )}
      </div>



      {/* 内容安全 */}
      <div className="card mb-5">
        <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-shield-halved mr-2" style={{ color: 'var(--primary-dark)' }} />
          内容安全
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>敏感内容屏蔽</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              对所有图片进行安全检测，敏感内容将自动模糊处理
            </div>
          </div>
          <button
            onClick={toggleBlur}
            style={{
              width: '48px', height: '26px', borderRadius: '13px',
              border: 'none', cursor: 'pointer',
              background: blurEnabled ? 'var(--primary)' : 'var(--border)',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%',
              background: 'white', position: 'absolute', top: '2px',
              left: blurEnabled ? '24px' : '2px',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>
        {/* 搜索包含敏感内容 */}
        <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>搜索包含敏感内容</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              搜索结果中显示包含敏感图片的帖子
            </div>
          </div>
          <button
            onClick={toggleSearchNsfw}
            style={{
              width: '48px', height: '26px', borderRadius: '13px',
              border: 'none', cursor: 'pointer',
              background: searchNsfw ? 'var(--primary)' : 'var(--border)',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%',
              background: 'white', position: 'absolute', top: '2px',
              left: searchNsfw ? '24px' : '2px',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>
      </div>

      {/* 邮箱管理 */}
      {user && <EmailSection user={user} toast={toast} />}

      {/* 快捷键 */}
      <div className="card">
        <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-keyboard mr-2" style={{ color: 'var(--primary-dark)' }} />
          快捷键
        </h3>
        <div className="space-y-2 text-sm">
          {[
            ['Ctrl+Shift+T', '切换主题'],
            ['Alt+1', '广场'],
            ['Alt+2', '纸尿裤列表'],
            ['Alt+3', '排行榜'],
            ['Alt+4', 'AI 推荐'],
            ['Alt+5', '个人中心'],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between py-1">
              <span style={{ color: 'var(--text-light)' }}>{desc}</span>
              <kbd className="px-2 py-0.5 rounded text-xs font-mono" style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}>{key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </PageLayout>
    </>
  );
}

function EmailSection({ user, toast }) {
  const [showBind, setShowBind] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleSendCode = useCallback(async () => {
    if (!email.trim() || !email.includes('@')) { toast.error('请输入合法邮箱'); return; }
    setLoading(true);
    try {
      await authAPI.sendCode({ email: email.trim(), type: 'bind' });
      toast.success('验证码已发送');
      setCodeSent(true);
      setCooldown(60);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [email, toast]);

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
      // 刷新用户信息
      window.location.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [email, code, toast]);

  const maskedEmail = user.email ? 
    user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '未绑定';

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
