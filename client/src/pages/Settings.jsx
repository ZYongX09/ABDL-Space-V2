import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function Settings() {
  const { theme, setTheme, THEMES, THEME_LABELS } = useTheme();
  const { user, getConsentStatus, withdrawConsent } = useAuth();
  const toast = useToast();
  const [consent, setConsent] = useState({ privacy: false, terms: false, date: null });

  useEffect(() => {
    if (user) setConsent(getConsentStatus());
  }, [user, getConsentStatus]);

  const handleWithdraw = () => {
    if (!confirm('撤回同意隐私政策和用户协议将导致您被退出登录，且无法继续使用本平台服务。确定要撤回吗？')) return;
    withdrawConsent();
    toast.success('已撤回同意，您已被退出登录');
  };

  return (
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
      </div>

      {/* 隐私与协议 */}
      {user && (
        <div className="card mb-5">
          <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-shield-halved mr-2" style={{ color: 'var(--primary-dark)' }} />
            隐私与协议
          </h3>

          {/* 当前同意状态 */}
          <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--input-bg)' }}>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>当前同意状态</div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--text-light)' }}>
                  <Link to="/privacy" target="_blank" style={{ color: 'var(--link-color)' }}>隐私政策</Link>
                </span>
                {consent.privacy ? (
                  <span className="flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                    <i className="fa-solid fa-circle-check text-xs" /> 已同意
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-circle-xmark text-xs" /> 未同意
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: 'var(--text-light)' }}>
                  <Link to="/terms" target="_blank" style={{ color: 'var(--link-color)' }}>用户协议</Link>
                </span>
                {consent.terms ? (
                  <span className="flex items-center gap-1.5" style={{ color: 'var(--success)' }}>
                    <i className="fa-solid fa-circle-check text-xs" /> 已同意
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-circle-xmark text-xs" /> 未同意
                  </span>
                )}
              </div>
              {consent.date && (
                <div className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
                  同意时间：{new Date(consent.date).toLocaleString('zh-CN')}
                </div>
              )}
            </div>
          </div>

          {/* 撤回同意 */}
          <div className="p-4 rounded-xl" style={{ background: 'rgba(232, 131, 124, 0.08)', border: '1px solid rgba(232, 131, 124, 0.3)' }}>
            <div className="flex items-start gap-3">
              <i className="fa-solid fa-triangle-exclamation mt-0.5" style={{ color: 'var(--danger)' }} />
              <div className="flex-1">
                <div className="text-sm font-bold mb-1" style={{ color: 'var(--text)' }}>撤回同意</div>
                <p className="text-xs mb-3" style={{ color: 'var(--text-light)' }}>
                  撤回同意将导致您被退出登录，且无法继续使用本平台服务。如需再次使用，您需要重新同意相关协议。
                </p>
                <button
                  className="btn btn-sm"
                  style={{ background: 'var(--danger)', color: 'white' }}
                  onClick={handleWithdraw}
                >
                  <i className="fa-solid fa-ban" /> 撤回隐私政策与用户协议同意
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 快捷键 */}
      <div className="card">
        <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-keyboard mr-2" style={{ color: 'var(--primary-dark)' }} />
          快捷键
        </h3>
        <div className="space-y-2 text-sm">
          {[
            ['Ctrl+Shift+T', '切换主题'],
            ['Alt+1', '论坛'],
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
  );
}
