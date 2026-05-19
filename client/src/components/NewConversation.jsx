import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { messagesAPI } from '../api';

export default function NewConversation({ onClose }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const handleSearch = async (q) => {
    setSearch(q);
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const API_BASE = import.meta.env.VITE_API_BASE || '';
      if (API_BASE) {
        const res = await fetch(`${API_BASE}/api/users/search?q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.users || []);
        } else {
          setResults([]);
        }
      } else {
        const users = JSON.parse(localStorage.getItem('abdl_users') || '{}');
        const list = Object.values(users)
          .filter(u => u.username?.toLowerCase().includes(q.toLowerCase()))
          .map(u => ({ id: u.id, username: u.username }))
          .slice(0, 10);
        setResults(list);
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelect = async (u) => {
    try {
      const data = await messagesAPI.canMessage(u.id);
      if (!data.allowed) {
        toast.error('该用户已关闭私信功能');
        return;
      }
    } catch {
      // 默认允许
    }
    onClose();
    navigate(`/messages?user=${u.id}`);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}>
      <div
        className="w-full sm:max-w-md animate-sheet-up"
        style={{
          background: 'var(--bg-card)',
          maxHeight: '80vh',
          overflow: 'auto',
          borderRadius: '20px 20px 0 0',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderTop: '1px solid rgba(255,255,255,0.2)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.12)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-bold" style={{ color: 'var(--text)' }}>新私信</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'var(--input-bg)', color: 'var(--text-light)', border: 'none', cursor: 'pointer' }}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <input
            className="form-control"
            placeholder="搜索用户名..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="px-4 pb-4">
          {searching && (
            <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-spinner fa-spin mr-2" />搜索中...
            </div>
          )}
          {!searching && search && results.length === 0 && (
            <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-user-slash text-2xl mb-2 block opacity-40" />
              <p className="text-sm">未找到用户</p>
            </div>
          )}
          {results.map(u => (
            <button
              key={u.id}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)' }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--hover-bg)'}
              onMouseOut={e => e.currentTarget.style.background = 'none'}
              onClick={() => handleSelect(u)}
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}
              >
                {u.username?.[0]?.toUpperCase() || '?'}
              </div>
              <span className="font-medium">{u.username}</span>
            </button>
          ))}
          {!search && (
            <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
              <i className="fa-solid fa-magnifying-glass text-2xl mb-2 block opacity-40" />
              <p className="text-sm">输入用户名搜索</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
