import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';

export default function AccountSwitcher() {
  const { user, accounts, switchAccount, removeAccount, logoutAll } = useAuth();
  const [showPanel, setShowPanel] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  if (!user) return null;

  const handleSwitch = async (id) => {
    if (id === user.id) { setShowPanel(false); return; }
    try {
      await switchAccount(id);
      toast.success('已切换账户');
      setShowPanel(false);
      navigate('/');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handleRemove = (e, id) => {
    e.stopPropagation();
    if (accounts.length <= 1) { toast.error('至少保留一个账户'); return; }
    removeAccount(id);
    toast.success('已移除');
  };

  return (
    <div className="relative">
      {/* 触发按钮 */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all hover:opacity-80 w-full"
        style={{ background: showPanel ? 'var(--primary-light)' : 'transparent' }}
        title="切换账户"
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
          style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
          {user.username?.[0]?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{user.username}</div>
          <div className="text-xs" style={{ color: 'var(--text-light)' }}>
            {user.role === 'admin' ? '管理员' : '用户'}
            {accounts.length > 1 && <span style={{ color: 'var(--text-muted)' }}> · {accounts.length} 个账户</span>}
          </div>
        </div>
        <i className={`fa-solid fa-chevron-${showPanel ? 'up' : 'down'} text-xs`} style={{ color: 'var(--text-muted)' }} />
      </button>

      {/* 下拉面板 */}
      {showPanel && (
        <>
          {/* 点击外部关闭 */}
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />
          <div
            className="account-switcher-panel absolute bottom-full left-0 right-0 mb-2 rounded-xl overflow-hidden z-50 animate-fade-in-up"
          >
            <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>已保存的账户</div>
            </div>

            <div className="max-h-60 overflow-y-auto">
              {accounts.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => handleSwitch(acc.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 transition-all text-left"
                  style={{
                    background: acc.id === user.id ? 'var(--primary-light)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { if (acc.id !== user.id) e.currentTarget.style.background = 'var(--hover-bg)'; }}
                  onMouseLeave={e => { if (acc.id !== user.id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: acc.id === user.id ? 'var(--primary)' : 'var(--primary-light)', color: acc.id === user.id ? 'white' : 'var(--primary-dark)' }}>
                    {acc.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{acc.username}</div>
                    <div className="text-xs" style={{ color: 'var(--text-light)' }}>{acc.role === 'admin' ? '管理员' : '用户'}</div>
                  </div>
                  {acc.id === user.id && (
                    <i className="fa-solid fa-check text-sm" style={{ color: 'var(--primary-dark)' }} />
                  )}
                  {acc.id !== user.id && (
                    <button
                      onClick={e => handleRemove(e, acc.id)}
                      className="p-1 rounded hover:opacity-70 transition-opacity"
                      style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                      title="移除账户"
                    >
                      <i className="fa-solid fa-xmark text-xs" />
                    </button>
                  )}
                </button>
              ))}
            </div>

            {/* 底部操作 */}
            <div className="px-3 py-2 space-y-1.5" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => { setShowPanel(false); navigate('/profile'); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: 'var(--input-bg)', color: 'var(--text)', border: 'none', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-user w-4 text-center" /> 个人中心
              </button>
              <button
                onClick={() => { setShowPanel(false); navigate('/login'); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: 'var(--input-bg)', color: 'var(--text)', border: 'none', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-plus w-4 text-center" /> 添加其他账户
              </button>
              <button
                onClick={() => { if (confirm('确定退出当前账户？')) { logoutAll(); setShowPanel(false); navigate('/'); } }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: 'rgba(232,131,124,0.08)', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-right-from-bracket w-4 text-center" /> 退出当前账户
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
