import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNsfw } from '../contexts/NsfwContext';


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
              className={`card card-interactive miui-hover-lift text-center py-4`}
              style={{
                ...(theme === t ? { borderColor: 'var(--primary)', boxShadow: '0 0 0 2px var(--primary)' } : {}),
                ...(autoTheme ? { opacity: 0.5, pointerEvents: 'none' } : {}),
              }}
              onClick={() => !autoTheme && setTheme(t)}
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
        {autoTheme && (
          <p className="text-xs mt-2" style={{ color: 'var(--primary-dark)' }}>
            <i className="fa-solid fa-clock mr-1" />
            自动模式已开启，手动切换主题已禁用
          </p>
        )}
        {/* 自动切换深浅色 — 仅浅色/深色模式显示 */}
        {theme !== 'colorful' && (
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
              border: blurEnabled ? 'none' : '1px solid var(--text-muted)', cursor: 'pointer',
              background: blurEnabled ? 'var(--primary)' : 'var(--border)',
              position: 'relative', transition: 'background 0.2s, border 0.2s',
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
              border: searchNsfw ? 'none' : '1px solid var(--text-muted)', cursor: 'pointer',
              background: searchNsfw ? 'var(--primary)' : 'var(--border)',
              position: 'relative', transition: 'background 0.2s, border 0.2s',
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

      {/* 账户与隐私 */}
      {user && (
        <div className="card mb-5">
          <Link to="/account" className="flex items-center justify-between py-2 group">
            <div className="flex items-center gap-3">
              <i className="fa-solid fa-user-shield" style={{ color: 'var(--primary-dark)', width: '20px', textAlign: 'center' }} />
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>账户与隐私</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>个人资料、邮箱管理、密码安全</div>
              </div>
            </div>
            <i className="fa-solid fa-chevron-right text-xs" style={{ color: 'var(--text-muted)' }} />
          </Link>
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
