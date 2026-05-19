import { useState, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNsfw } from '../contexts/NsfwContext';

export default function Settings() {
  const { theme, setTheme, THEMES, THEME_LABELS } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const { enabled: nsfwEnabled, loading: nsfwLoading, toggle: nsfwToggle } = useNsfw();

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
      </div>



      {/* 内容安全 */}
      <div className="card mb-5">
        <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-shield-halved mr-2" style={{ color: 'var(--primary-dark)' }} />
          内容安全
        </h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>敏感图片检测</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              自动识别并模糊敏感图片，需加载 AI 模型（约 3MB）
            </div>
          </div>
          <button
            onClick={nsfwToggle}
            disabled={nsfwLoading}
            style={{
              width: '48px', height: '26px', borderRadius: '13px',
              border: 'none', cursor: nsfwLoading ? 'wait' : 'pointer',
              background: nsfwEnabled ? 'var(--primary)' : 'var(--border)',
              position: 'relative', transition: 'background 0.2s',
              opacity: nsfwLoading ? 0.6 : 1,
            }}
          >
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%',
              background: 'white', position: 'absolute', top: '2px',
              left: nsfwEnabled ? '24px' : '2px',
              transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }} />
          </button>
        </div>
        {nsfwLoading && (
          <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
            <i className="fa-solid fa-spinner fa-spin" />
            正在加载检测模型...
          </div>
        )}
      </div>

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
