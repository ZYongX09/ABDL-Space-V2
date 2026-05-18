import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { usersAPI } from '../api';

export default function Profile() {
  const { user, accounts, updateProfile, logout } = useAuth();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [myPosts, setMyPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    (async () => {
      setPostsLoading(true);
      try {
        const data = await usersAPI.getPosts(user.id, { limit: 20 });
        setMyPosts(data.posts || []);
      } catch {} finally { setPostsLoading(false); }
    })();
  }, [user]);

  if (!user) {
    return (
      <PageLayout hero={{ icon: 'fa-user', title: '个人中心' }}>
        <div className="empty-state">
          <div className="icon"><i className="fa-solid fa-user" /></div>
          <h3>未登录</h3>
          <p className="mt-2">请先登录查看个人中心</p>
          <Link to="/login" className="btn btn-primary mt-4">去登录</Link>
        </div>
      </PageLayout>
    );
  }

  const startEdit = () => {
    setForm({
      bio: user.bio || '',
      region: user.region || '',
      age: user.age || '',
      weight: user.weight || '',
      waist: user.waist || '',
      hip: user.hip || '',
      style_preference: user.style_preference || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      // 转换数字字段
      const body = { ...form };
      if (body.age) body.age = Number(body.age); else body.age = null;
      if (body.weight) body.weight = Number(body.weight); else body.weight = null;
      if (body.waist) body.waist = Number(body.waist); else body.waist = null;
      if (body.hip) body.hip = Number(body.hip); else body.hip = null;
      if (!body.style_preference) body.style_preference = null;
      if (!body.bio) body.bio = null;
      if (!body.region) body.region = null;
      await updateProfile(body);
      toast.success('资料已更新');
      setEditing(false);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  return (
    <PageLayout hero={{ icon: 'fa-user', title: '个人中心', subtitle: `欢迎回来，${user.username}` }}>
      {/* 基本信息 */}
      <div className="card mb-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
            {user.username?.[0]?.toUpperCase()}
          </div>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{user.username}</h3>
            <span className="tag">{user.role === 'admin' ? '管理员' : '用户'}</span>
          </div>
        </div>

        {editing ? (
          <div className="space-y-4">
            {/* 基本信息 */}
            <div>
              <h4 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-circle-user mr-1.5" style={{ color: 'var(--primary-dark)' }} />
                基本信息
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>地区</label>
                  <input className="form-control" value={form.region} onChange={e => update('region', e.target.value)} placeholder="如：北京" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>年龄</label>
                  <input type="number" className="form-control" value={form.age} onChange={e => update('age', e.target.value)} placeholder="如：25" min="1" max="150" />
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>个人简介</label>
                <textarea className="form-control" value={form.bio} onChange={e => update('bio', e.target.value)} rows={2} placeholder="介绍一下自己..." />
              </div>
            </div>

            {/* 身体数据 */}
            <div>
              <h4 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-ruler mr-1.5" style={{ color: 'var(--primary-dark)' }} />
                身体数据
                <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>用于 AI 推荐尺码，可选填</span>
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>体重 (kg)</label>
                  <input type="number" className="form-control" value={form.weight} onChange={e => update('weight', e.target.value)} placeholder="65" min="1" max="500" step="0.1" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>腰围 (cm)</label>
                  <input type="number" className="form-control" value={form.waist} onChange={e => update('waist', e.target.value)} placeholder="75" min="1" max="300" step="0.1" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>臀围 (cm)</label>
                  <input type="number" className="form-control" value={form.hip} onChange={e => update('hip', e.target.value)} placeholder="95" min="1" max="300" step="0.1" />
                </div>
              </div>
            </div>

            {/* 偏好 */}
            <div>
              <h4 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-heart mr-1.5" style={{ color: 'var(--accent)' }} />
                偏好
              </h4>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>风格偏好</label>
                <input className="form-control" value={form.style_preference} onChange={e => update('style_preference', e.target.value)} placeholder="如：日系、可爱风、简约" />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button className="btn btn-primary btn-sm" onClick={handleSave}>保存</button>
              <button className="btn btn-outline btn-sm" onClick={() => setEditing(false)}>取消</button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm" style={{ color: 'var(--text-light)' }}>
            {user.bio && <p>{user.bio}</p>}
            {user.region && <p><i className="fa-solid fa-location-dot mr-2" />{user.region}</p>}
            {user.age && <p><i className="fa-solid fa-cake-candles mr-2" />{user.age} 岁</p>}
            {(user.weight || user.waist || user.hip) && (
              <p>
                <i className="fa-solid fa-ruler mr-2" />
                {user.weight && `${user.weight}kg`}
                {user.weight && user.waist && ' · '}
                {user.waist && `腰围 ${user.waist}cm`}
                {user.waist && user.hip && ' · '}
                {user.hip && `臀围 ${user.hip}cm`}
              </p>
            )}
            {user.style_preference && <p><i className="fa-solid fa-heart mr-2" />偏好: {user.style_preference}</p>}
            <p><i className="fa-solid fa-calendar mr-2" />注册于 {new Date(user.created_at).toLocaleDateString('zh-CN')}</p>
            <button className="btn btn-outline btn-sm mt-2" onClick={startEdit}>
              <i className="fa-solid fa-pen" /> 编辑资料
            </button>
          </div>
        )}
      </div>

      {/* 我的帖子 */}
      <div className="card mb-5">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-file-lines" style={{ color: 'var(--primary-dark)' }} />
          我的帖子
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>({myPosts.length})</span>
        </h3>
        {postsLoading ? (
          <div className="text-center py-4">
            <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : myPosts.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>还没有发过帖子</p>
        ) : (
          <div className="space-y-2">
            {myPosts.map(p => (
              <Link
                key={p.id}
                to={`/forum/${p.id}`}
                className="block p-3 rounded-lg transition-all hover:shadow-hover"
                style={{ background: 'var(--input-bg)', textDecoration: 'none', color: 'var(--text)' }}
              >
                <p className="text-sm line-clamp-2 mb-1.5">{p.content}</p>
                <div className="flex gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span><i className="fa-regular fa-heart mr-1" />{p.like_count || 0}</span>
                  <span><i className="fa-regular fa-comment mr-1" />{p.comment_count || 0}</span>
                  <span>{p.created_at ? new Date(p.created_at).toLocaleDateString('zh-CN') : ''}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 快捷操作 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 quick-actions-grid">
        {[
          { to: '/notifications', icon: 'fa-bell', label: '通知' },
          { to: '/settings', icon: 'fa-gear', label: '设置' },
          { to: '/about', icon: 'fa-circle-info', label: '关于' },
        ].map(item => (
          <Link key={item.to} to={item.to} className="card text-center py-4 hover:shadow-hover transition-all" style={{ textDecoration: 'none', color: 'var(--text)' }}>
            <i className={`fa-solid ${item.icon} text-xl mb-2`} style={{ color: 'var(--primary-dark)' }} />
            <div className="text-sm font-semibold">{item.label}</div>
          </Link>
        ))}
      </div>

      <div className="mt-5 text-center">
        <button className="btn btn-danger btn-sm" onClick={() => {
          logout();
          navigate('/');
          toast.success(accounts.length > 1 ? '已切换到其他账户' : '已退出登录');
        }}>
          <i className="fa-solid fa-right-from-bracket" /> 退出当前账户
        </button>
      </div>
    </PageLayout>
  );
}
