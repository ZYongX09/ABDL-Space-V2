import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
import OfficialBadge from '../components/OfficialBadge';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNsfw } from '../contexts/NsfwContext';
import { authAPI, usersAPI, followsAPI } from '../api';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export default function Profile() {
  const { id: paramId } = useParams();
  const location = useLocation();
  const { user: currentUser, accounts, updateProfile, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { classifyFile, loaded: modelReady, loadModel } = useNsfw();
  const [avatarUploading, setAvatarUploading] = useState(false);

  const isSelf = !paramId || (currentUser && String(currentUser.id) === String(paramId));
  const targetId = isSelf ? currentUser?.id : paramId;

  const [profileUser, setProfileUser] = useState(null);
  const [loading, setLoading] = useState(!isSelf);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Follow state (for viewing others)
  const [followStatus, setFollowStatus] = useState({ following: false, follower: false, mutual: false });
  const [followLoading, setFollowLoading] = useState(false);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });

  // Load profile data when viewing others
  useEffect(() => {
    if (isSelf) {
      setProfileUser(currentUser);
      setLoading(false);
      return;
    }
    if (!targetId) return;
    (async () => {
      try {
        setLoading(true);
        const data = await authAPI.getUser(targetId);
        setProfileUser(data.user || data);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [targetId, isSelf, currentUser]);

  // Load follow status & counts (for others)
  useEffect(() => {
    if (isSelf || !targetId) return;
    (async () => {
      try {
        const [statusData, followersData, followingData] = await Promise.all([
          followsAPI.status(targetId),
          followsAPI.followers(targetId),
          followsAPI.following(targetId),
        ]);
        setFollowStatus(statusData);
        setCounts({ followers: followersData.total || 0, following: followingData.total || 0 });
      } catch {}
    })();
  }, [targetId, isSelf]);

  // Load follower/following counts for self
  useEffect(() => {
    if (!isSelf || !currentUser?.id) return;
    (async () => {
      try {
        const [followersData, followingData] = await Promise.all([
          followsAPI.followers(currentUser.id),
          followsAPI.following(currentUser.id),
        ]);
        setCounts({ followers: followersData.total || 0, following: followingData.total || 0 });
      } catch {}
    })();
  }, [isSelf, currentUser?.id]);

  // Load posts
  useEffect(() => {
    if (!targetId) return;
    (async () => {
      setPostsLoading(true);
      try {
        const data = await usersAPI.getPosts(targetId, { limit: 20 });
        setPosts(data.posts || []);
      } catch {} finally { setPostsLoading(false); }
    })();
  }, [targetId]);

  // Scroll listener for header title
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 120);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleFollow = async () => {
    if (!currentUser) { toast.error('请先登录'); return; }
    setFollowLoading(true);
    try {
      if (followStatus.following) {
        await followsAPI.unfollow(targetId);
        setFollowStatus(prev => ({ ...prev, following: false, mutual: false }));
        setCounts(prev => ({ ...prev, followers: Math.max(0, prev.followers - 1) }));
      } else {
        const res = await followsAPI.follow(targetId);
        setFollowStatus(prev => ({ ...prev, following: true, mutual: res.mutual || false }));
        setCounts(prev => ({ ...prev, followers: prev.followers + 1 }));
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setFollowLoading(false);
    }
  };

  const startEdit = () => {
    setForm({
      bio: currentUser.bio || '',
      region: currentUser.region || '',
      age: currentUser.age || '',
      weight: currentUser.weight || '',
      waist: currentUser.waist || '',
      hip: currentUser.hip || '',
      style_preference: currentUser.style_preference || '',
    });
    setEditing(true);
  };

  const handleSave = async () => {
    try {
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

  // 头像上传
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('图片不能超过 5MB'); return; }

    setAvatarUploading(true);
    try {
      // NSFW 检测
      if (!modelReady) {
        toast.info('正在加载安全检测模型...');
        await loadModel();
      }
      const isNsfw = await classifyFile(file);
      if (isNsfw === true) {
        toast.error('头像不允许包含敏感内容');
        setAvatarUploading(false);
        return;
      }

      // 上传
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/images/upload?returnFormat=full`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');

      update('avatar', data.url);
      toast.success('头像已上传，记得保存');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  // Not logged in and no param → prompt login
  if (!currentUser && !paramId) {
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

  if (loading) {
    return (
      <PageLayout hero={{ icon: 'fa-user', title: '加载中...' }}>
        <div className="text-center py-8">
          <i className="fa-solid fa-spinner fa-spin text-2xl" style={{ color: 'var(--text-muted)' }} />
        </div>
      </PageLayout>
    );
  }

  if (!profileUser) {
    return (
      <PageLayout hero={{ icon: 'fa-user', title: '用户' }}>
        <div className="empty-state"><h3>用户不存在</h3></div>
      </PageLayout>
    );
  }

  const displayUser = profileUser;

  return (
    <>
    {/* Mobile Header */}
    <div className="mobile-header">
      <div className="mobile-header-left">
        {location.pathname !== '/' && (
          <button className="mobile-header-btn" onClick={() => navigate(-1)} title="返回">
            <i className="fa-solid fa-arrow-left" />
          </button>
        )}
        {isSelf && (
          <button className="mobile-header-btn" onClick={() => setShowDrawer(true)} title="菜单">
            <i className="fa-solid fa-bars" />
          </button>
        )}
      </div>
      <span className="mobile-header-title" style={{ opacity: scrolled ? 1 : 0, transition: 'opacity 0.2s ease' }}>
        {displayUser.username}
      </span>
      <div className="mobile-header-right">
        {isSelf ? (
          <button className="mobile-header-btn" onClick={startEdit} title="编辑资料">
            <i className="fa-solid fa-pen-to-square" />
          </button>
        ) : (
          <button
            className={`btn btn-sm ${followStatus.following ? 'btn-outline' : 'btn-primary'}`}
            onClick={handleFollow}
            disabled={followLoading}
            style={followStatus.following
              ? { borderColor: 'var(--border)', color: 'var(--text-light)', fontSize: '12px', padding: '4px 12px' }
              : { fontSize: '12px', padding: '4px 12px' }
            }
          >
            {followLoading ? <i className="fa-solid fa-spinner fa-spin" /> : (followStatus.following ? '已关注' : '关注')}
          </button>
        )}
      </div>
    </div>

    {/* 侧边抽屉 (self only) */}
    {isSelf && showDrawer && (
      <>
        <div className="profile-drawer-overlay" onClick={() => setShowDrawer(false)} />
        <div className="profile-drawer animate-slide-in-left">
          <div className="profile-drawer-header">
            <div className="profile-drawer-avatar">
              {displayUser.username?.[0]?.toUpperCase()}
            </div>
            <div>
              <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>{displayUser.username}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{displayUser.role === 'admin' ? '管理员' : '用户'}</div>
            </div>
          </div>
          <nav className="profile-drawer-nav">
            <button className="profile-drawer-item" onClick={() => { setShowDrawer(false); navigate('/settings'); }}>
              <i className="fa-solid fa-gear" />
              <span>设置</span>
            </button>
            <button className="profile-drawer-item" onClick={() => { setShowDrawer(false); navigate('/about'); }}>
              <i className="fa-solid fa-circle-question" />
              <span>关于</span>
            </button>
            <button className="profile-drawer-item" onClick={() => { setShowDrawer(false); navigate('/notifications'); }}>
              <i className="fa-solid fa-bell" />
              <span>通知</span>
            </button>
          </nav>
          <div className="profile-drawer-footer">
            <button className="profile-drawer-item danger" onClick={() => {
              setShowDrawer(false);
              logout();
              navigate('/');
              toast.success(accounts.length > 1 ? '已切换到其他账户' : '已退出登录');
            }}>
              <i className="fa-solid fa-right-from-bracket" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      </>
    )}

    <PageLayout hero={{
      icon: 'fa-user',
      title: isSelf ? '个人中心' : displayUser.username,
      subtitle: isSelf ? `欢迎回来，${displayUser.username}` : undefined,
    }}>
      {/* 用户信息卡片 */}
      <div className="card mb-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
            {displayUser.avatar
              ? <img src={displayUser.avatar} alt={displayUser.username} className="w-full h-full rounded-full object-cover" />
              : displayUser.username?.[0]?.toUpperCase()
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{displayUser.username}</h3>
              {displayUser.role === 'admin' && <OfficialBadge />}
              {displayUser.role !== 'admin' && <span className="tag">用户</span>}
              {!isSelf && followStatus.mutual && (
                <span className="tag" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
                  <i className="fa-solid fa-arrows-rotate mr-1" style={{ fontSize: '10px' }} />互相关注
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 关注计数 */}
        <div className="flex items-center gap-4 mb-4">
          {!isSelf && (
            <button
              className={`btn btn-sm ${followStatus.following ? 'btn-outline' : 'btn-primary'}`}
              onClick={handleFollow}
              disabled={followLoading}
              style={followStatus.following ? { borderColor: 'var(--border)', color: 'var(--text-light)' } : {}}
            >
              {followLoading ? <i className="fa-solid fa-spinner fa-spin" /> : (followStatus.following ? '已关注' : '关注')}
            </button>
          )}
          <Link
            to={`/user/${targetId}/followers`}
            className="text-sm hover:underline"
            style={{ color: 'var(--text-light)' }}
          >
            <strong style={{ color: 'var(--text)' }}>{counts.followers}</strong> 粉丝
          </Link>
          <Link
            to={`/user/${targetId}/following`}
            className="text-sm hover:underline"
            style={{ color: 'var(--text-light)' }}
          >
            <strong style={{ color: 'var(--text)' }}>{counts.following}</strong> 关注
          </Link>
        </div>

        {editing ? (
          <div className="space-y-4">
            {/* 头像上传 */}
            <div>
              <h4 className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>
                <i className="fa-solid fa-image mr-1.5" style={{ color: 'var(--primary-dark)' }} />
                头像
              </h4>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold overflow-hidden"
                    style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
                    {form.avatar
                      ? <img src={form.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                      : currentUser?.username?.[0]?.toUpperCase()
                    }
                  </div>
                  {avatarUploading && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.4)' }}>
                      <i className="fa-solid fa-spinner fa-spin text-white" />
                    </div>
                  )}
                </div>
                <div>
                  <label className="btn btn-outline btn-sm cursor-pointer" style={{ fontSize: '0.75rem' }}>
                    <i className="fa-solid fa-upload mr-1" />
                    {form.avatar ? '更换头像' : '上传头像'}
                    <input type="file" accept="image/*" hidden onChange={handleAvatarUpload} disabled={avatarUploading} />
                  </label>
                  {form.avatar && (
                    <button className="btn btn-outline btn-sm ml-2" style={{ fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                      onClick={() => update('avatar', null)}>
                      <i className="fa-solid fa-trash mr-1" />移除
                    </button>
                  )}
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>支持 JPG/PNG/GIF/WEBP，最大 5MB</p>
                </div>
              </div>
            </div>

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
            {displayUser.bio && <p>{displayUser.bio}</p>}
            {displayUser.region && <p><i className="fa-solid fa-location-dot mr-2" />{displayUser.region}</p>}
            {displayUser.age && <p><i className="fa-solid fa-cake-candles mr-2" />{displayUser.age} 岁</p>}
            {(displayUser.weight || displayUser.waist || displayUser.hip) && (
              <p>
                <i className="fa-solid fa-ruler mr-2" />
                {displayUser.weight && `${displayUser.weight}kg`}
                {displayUser.weight && displayUser.waist && ' · '}
                {displayUser.waist && `腰围 ${displayUser.waist}cm`}
                {displayUser.waist && displayUser.hip && ' · '}
                {displayUser.hip && `臀围 ${displayUser.hip}cm`}
              </p>
            )}
            {displayUser.style_preference && <p><i className="fa-solid fa-heart mr-2" />偏好: {displayUser.style_preference}</p>}
            <p><i className="fa-solid fa-calendar mr-2" />注册于 {new Date(displayUser.created_at).toLocaleDateString('zh-CN')}</p>
            {isSelf && (
              <button className="btn btn-outline btn-sm mt-2" onClick={startEdit}>
                <i className="fa-solid fa-pen-to-square" /> 编辑资料
              </button>
            )}
          </div>
        )}
      </div>

      {/* 帖子列表 */}
      <div className="card mb-5">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <i className="fa-solid fa-file-lines" style={{ color: 'var(--primary-dark)' }} />
          {isSelf ? '我的帖子' : 'TA 的帖子'}
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>({posts.length})</span>
        </h3>
        {postsLoading ? (
          <div className="text-center py-4">
            <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : posts.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
            {isSelf ? '还没有发过帖子' : 'TA 还没有发过帖子'}
          </p>
        ) : (
          <div className="space-y-2">
            {posts.map(p => (
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
    </PageLayout>
    </>
  );
}
