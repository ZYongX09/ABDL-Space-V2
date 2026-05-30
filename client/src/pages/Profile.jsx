import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import OfficialBadge from '../components/OfficialBadge';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { authAPI, usersAPI, followsAPI, forumAPI } from '../api';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export default function Profile() {
  const { id: paramId } = useParams();
  const location = useLocation();
  const { user: currentUser, accounts, updateProfile, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();


  const isSelf = !paramId || (currentUser && String(currentUser.id) === String(paramId));
  const targetId = isSelf ? currentUser?.id : paramId;

  const [profileUser, setProfileUser] = useState(null);
  const [loading, setLoading] = useState(!isSelf);
  const [showEdit, setShowEdit] = useState(false); // 保留防报错，实际不再使用
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showDrawer, setShowDrawer] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Follow state (for viewing others)
  const [followStatus, setFollowStatus] = useState({ following: false, follower: false, mutual: false });
  const [followLoading, setFollowLoading] = useState(false);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });

  // Worn diapers
  const [wornDiapers, setWornDiapers] = useState([]);
  const [wornCount, setWornCount] = useState(0);
  const [wornLoading, setWornLoading] = useState(false);
  const [showWorn, setShowWorn] = useState(false);

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

  // Load worn diapers count
  useEffect(() => {
    const uid = targetId || currentUser?.id;
    if (!uid) return;
    (async () => {
      try {
        const data = await usersAPI.getWorn(uid);
        setWornDiapers(data.worn || []);
        setWornCount(data.total || 0);
      } catch {}
    })();
  }, [targetId, currentUser?.id]);

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
          <Link to="/account" className="mobile-header-btn" title="账户设置">
            <i className="fa-solid fa-gear" />
          </Link>
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
            {wornCount > 0 && (
              <p>
                <i className="fa-solid fa-shirt mr-2" />
                穿过 <strong>{wornCount}</strong> 款纸尿裤
              </p>
            )}
            {isSelf && (
              <Link to="/account" className="btn btn-outline btn-sm mt-2">
                <i className="fa-solid fa-gear" /> 账户设置
              </Link>
            )}
          </div>
      </div>

      {/* 帖子列表 */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <i className="fa-solid fa-file-lines" style={{ color: 'var(--primary-dark)' }} />
            {isSelf ? '我的帖子' : 'TA 的帖子'}
            <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>({posts.length})</span>
          </h3>
          {isSelf && posts.length > 0 && (
            <div className="flex items-center gap-2">
              {selectMode && selectedIds.size > 0 && (
                <button
                  className="btn btn-sm"
                  style={{ background: 'var(--danger)', color: 'white', fontSize: '0.7rem', padding: '3px 10px' }}
                  onClick={async () => {
                    if (!confirm(`确认删除选中的 ${selectedIds.size} 条帖子？`)) return;
                    for (const id of selectedIds) {
                      try { await forumAPI.delete(id); } catch {}
                    }
                    setPosts(prev => prev.filter(p => !selectedIds.has(p.id)));
                    setSelectedIds(new Set());
                    setSelectMode(false);
                    toast.success(`已删除 ${selectedIds.size} 条帖子`);
                  }}
                >
                  <i className="fa-solid fa-trash mr-1" />删除 ({selectedIds.size})
                </button>
              )}
              <button
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.7rem', padding: '3px 10px' }}
                onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()); }}
              >
                {selectMode ? '取消' : '管理'}
              </button>
            </div>
          )}
        </div>
        {postsLoading ? (
          <div className="text-center py-4">
            <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {isSelf ? '还没有发过帖子' : 'TA 还没有发过帖子'}
            </p>
            {isSelf && (
              <button
                className="btn btn-primary btn-sm mt-3"
                onClick={() => navigate('/create-post')}
              >
                <i className="fa-solid fa-pen mr-1" /> 去发帖
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map(p => (
              <div key={p.id} className="flex items-center gap-2">
                {selectMode && isSelf && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(p.id)}
                    onChange={e => {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        return next;
                      });
                    }}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--danger)', flexShrink: 0 }}
                  />
                )}
                <Link
                  to={`/forum/${p.id}`}
                  className="block p-3 rounded-lg transition-all hover:shadow-hover flex-1"
                  style={{ background: 'var(--input-bg)', textDecoration: 'none', color: 'var(--text)' }}
                  onClick={e => { if (selectMode) e.preventDefault(); }}
                >
                  <p className="text-sm line-clamp-2 mb-1.5">{p.content}</p>
                  <div className="flex gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span><i className="fa-regular fa-heart mr-1" />{p.like_count || 0}</span>
                    <span><i className="fa-regular fa-comment mr-1" />{p.comment_count || 0}</span>
                    <span>{p.created_at ? new Date(p.created_at).toLocaleDateString('zh-CN') : ''}</span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 穿过的纸尿裤 */}
      <div className="card mb-5">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setShowWorn(!showWorn)}
          >
            <h3 className="text-sm font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <i className="fa-solid fa-shirt" style={{ color: 'var(--primary-dark)' }} />
              穿过的纸尿裤
              <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>({wornCount})</span>
            </h3>
            <i className={`fa-solid fa-chevron-${showWorn ? 'up' : 'down'}`} style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }} />
          </div>
          {showWorn && (
            <div className="mt-3 space-y-2">
              {wornLoading ? (
                <div className="text-center py-4">
                  <i className="fa-solid fa-spinner fa-spin" style={{ color: 'var(--text-muted)' }} />
                </div>
              ) : wornDiapers.length === 0 ? (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>暂无数据</p>
              ) : (
                wornDiapers.map((d, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: 'var(--input-bg)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{d.diaper_name}</span>
                        {d.brand && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{d.brand}</span>}
                      </div>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        评分于 {new Date(d.rated_at).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <span className="text-lg font-bold" style={{ color: 'var(--primary-dark)' }}>{d.avg_score}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>/10</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
    </PageLayout>
    </>
  );
}
