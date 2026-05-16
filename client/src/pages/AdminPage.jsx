import { useState, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import { LoadingSkeleton, Spinner } from '../components/Feedback';
import { adminAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useVerifyModal } from '../components/VerifyModal';
import { Link } from 'react-router-dom';

const TABS = [
  { key: 'overview', label: '概览', icon: 'fa-chart-pie' },
  { key: 'users', label: '用户', icon: 'fa-users' },
  { key: 'posts', label: '帖子', icon: 'fa-file-lines' },
];

export default function AdminPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { trigger, VerifyModal } = useVerifyModal();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  // 概览
  const [stats, setStats] = useState(null);

  // 用户
  const [users, setUsers] = useState([]);

  // 帖子
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    if (user?.role !== 'admin') { setLoading(false); return; }
    loadTab(tab);
  }, [user, tab]);

  const loadTab = async (t) => {
    setLoading(true);
    try {
      if (t === 'overview') {
        const data = await adminAPI.stats();
        setStats(data);
      } else if (t === 'users') {
        const data = await adminAPI.users();
        setUsers(data.users || []);
      } else if (t === 'posts') {
        const data = await adminAPI.posts();
        setPosts(data.posts || []);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id) => {
    trigger(async () => {
      try {
        await adminAPI.deleteUser(id);
        setUsers(prev => prev.filter(u => u.id !== id));
        toast.success('已删除');
      } catch (e) { toast.error(e.message); }
    });
  };

  const handleBanUser = async (id) => {
    trigger(async () => {
      try {
        const data = await adminAPI.banUser(id);
        setUsers(prev => prev.map(u => u.id === id ? { ...u, banned: data.banned } : u));
        toast.success(data.banned ? '已封禁' : '已解封');
      } catch (e) { toast.error(e.message); }
    });
  };

  const handlePinPost = async (id) => {
    try {
      const data = await adminAPI.pinPost(id);
      setPosts(prev => prev.map(p => p.id === id ? { ...p, pinned: data.pinned } : p));
      toast.success(data.pinned ? '已置顶' : '已取消置顶');
    } catch (e) { toast.error(e.message); }
  };

  const handleDeletePost = async (id) => {
    trigger(async () => {
      try {
        await adminAPI.deletePost(id);
        setPosts(prev => prev.filter(p => p.id !== id));
        toast.success('已删除');
      } catch (e) { toast.error(e.message); }
    });
  };

  if (!user || user.role !== 'admin') {
    return (
      <PageLayout hero={{ icon: 'fa-shield-halved', title: '管理后台' }}>
        <div className="empty-state">
          <div className="icon"><i className="fa-solid fa-lock" /></div>
          <h3>无权访问</h3>
          <p>仅管理员可访问此页面</p>
          <Link to="/" className="btn btn-primary mt-4">返回首页</Link>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout hero={{ icon: 'fa-shield-halved', title: '管理后台' }}>
      {/* 标签页 */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab(t.key)}
          >
            <i className={`fa-solid ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>

      {/* 概览 */}
      {tab === 'overview' && (
        loading ? <Spinner /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { label: '用户', value: stats?.users, icon: 'fa-users', color: 'var(--primary)' },
              { label: '帖子', value: stats?.posts, icon: 'fa-file-lines', color: 'var(--accent)' },
              { label: '评论', value: stats?.comments, icon: 'fa-comments', color: 'var(--primary-dark)' },
              { label: '产品', value: stats?.diapers, icon: 'fa-baby', color: 'var(--success)' },
              { label: '评分', value: stats?.ratings, icon: 'fa-star', color: 'var(--warning)' },
            ].map(s => (
              <div key={s.label} className="card text-center stagger-item">
                <i className={`fa-solid ${s.icon} text-xl mb-1.5`} style={{ color: s.color }} />
                <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{s.value ?? '-'}</div>
                <div className="text-xs" style={{ color: 'var(--text-light)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )
      )}

      {/* 用户管理 */}
      {tab === 'users' && (
        loading ? <LoadingSkeleton count={5} height={60} /> : (
          <div className="space-y-2">
            {users.length === 0 ? (
              <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>暂无用户</p>
            ) : users.map(u => (
              <div key={u.id} className="card flex items-center gap-3 stagger-item" style={{ padding: '0.75rem 1rem' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ background: u.banned ? 'rgba(232,131,124,0.2)' : 'var(--primary-light)', color: u.banned ? 'var(--danger)' : 'var(--primary-dark)' }}>
                  {u.username?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{u.username}</span>
                    {u.role === 'admin' && <span className="tag" style={{ background: 'var(--accent)', color: 'white', fontSize: '0.65rem', padding: '1px 6px' }}>管理员</span>}
                    {u.banned && <span className="tag" style={{ background: 'var(--danger)', color: 'white', fontSize: '0.65rem', padding: '1px 6px' }}>已封禁</span>}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {u.email || '-'} · ID: {u.id} · 注册: {u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '-'}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {u.role !== 'admin' && (
                    <>
                      <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        onClick={() => handleBanUser(u.id)} title={u.banned ? '解封' : '封禁'}>
                        <i className={`fa-solid ${u.banned ? 'fa-unlock' : 'fa-ban'}`} />
                      </button>
                      <button className="btn btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'var(--danger)', color: 'white' }}
                        onClick={() => handleDeleteUser(u.id)} title="删除用户">
                        <i className="fa-solid fa-trash" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* 帖子管理 */}
      {tab === 'posts' && (
        loading ? <LoadingSkeleton count={5} height={80} /> : (
          <div className="space-y-2">
            {posts.length === 0 ? (
              <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>暂无帖子</p>
            ) : posts.map(p => (
              <div key={p.id} className="card stagger-item" style={{ padding: '0.75rem 1rem' }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {p.pinned && <i className="fa-solid fa-thumbtack text-xs" style={{ color: 'var(--warning)' }} title="已置顶" />}
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {p.user?.username || '匿名'} · {p.created_at ? new Date(p.created_at).toLocaleString('zh-CN') : '-'}
                      </span>
                    </div>
                    <p className="text-sm truncate" style={{ color: 'var(--text)' }}>{p.content}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span><i className="fa-solid fa-heart mr-1" />{p.like_count || 0}</span>
                      <span><i className="fa-solid fa-comment mr-1" />{p.comment_count || 0}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => handlePinPost(p.id)} title={p.pinned ? '取消置顶' : '置顶'}>
                      <i className={`fa-solid fa-thumbtack ${p.pinned ? '' : 'opacity-50'}`} />
                    </button>
                    <button className="btn btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'var(--danger)', color: 'white' }}
                      onClick={() => handleDeletePost(p.id)} title="删除帖子">
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </PageLayout>
    {VerifyModal}
  );
}
