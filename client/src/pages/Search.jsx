import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import PostCard from '../components/PostCard';
import { LoadingSkeleton, EmptyState } from '../components/Feedback';
import OfficialBadge from '../components/OfficialBadge';
import { forumAPI, usersAPI, followsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'post', label: '帖子' },
  { key: 'user', label: '用户' },
  { key: 'announcement', label: '公告' },
];

const HOT_SEARCHES = [
  { tag: '纸尿裤推荐', icon: 'fa-fire' },
  { tag: '新人入门', icon: 'fa-seedling' },
  { tag: '夜用', icon: 'fa-moon' },
  { tag: '日用', icon: 'fa-sun' },
  { tag: '性价比', icon: 'fa-coins' },
  { tag: '超薄', icon: 'fa-feather' },
  { tag: '哄睡', icon: 'fa-bed' },
  { tag: 'ABDL 经验', icon: 'fa-comments' },
];

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const [input, setInput] = useState(q);
  const [tab, setTab] = useState('all');
  const [posts, setPosts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [followMap, setFollowMap] = useState({});
  const inputRef = useRef(null);
  const { user: currentUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  // 自动 focus
  useEffect(() => { inputRef.current?.focus(); }, []);

  // URL → input
  useEffect(() => { setInput(q); }, [q]);

  // 搜索执行（debounce 300ms）
  useEffect(() => {
    if (!q.trim()) { setPosts([]); setUsers([]); return; }
    const t = setTimeout(() => doSearch(), 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tab]);

  // 实时同步 input → URL
  const handleInput = (v) => {
    setInput(v);
    const params = new URLSearchParams(searchParams);
    if (v.trim()) params.set('q', v.trim());
    else params.delete('q');
    setSearchParams(params, { replace: true });
  };

  const doSearch = async () => {
    setLoading(true);
    try {
      const tasks = [];
      // 帖子：all / post / announcement 时查
      if (tab === 'all' || tab === 'post' || tab === 'announcement') {
        tasks.push(forumAPI.feed({ search: q, limit: 30 }).then(d => d.posts || []));
      } else { tasks.push(Promise.resolve([])); }
      // 用户：all / user 时查
      if (tab === 'all' || tab === 'user') {
        tasks.push(usersAPI.search(q).then(d => d.users || []));
      } else { tasks.push(Promise.resolve([])); }
      const [p, u] = await Promise.all(tasks);
      setPosts(p);
      setUsers(u);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  // 公告 tab 过滤
  const displayPosts = tab === 'announcement'
    ? posts.filter(p => p.is_announcement)
    : posts;

  // 取用户关注状态
  useEffect(() => {
    if (!currentUser || users.length === 0) return;
    (async () => {
      const map = { ...followMap };
      for (const u of users) {
        if (u.id === currentUser.id) continue;
        try {
          const r = await followsAPI.status(u.id);
          map[u.id] = r.following;
        } catch {}
      }
      setFollowMap(map);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, currentUser]);

  const handleFollow = useCallback(async (userId, e) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!currentUser) { toast.error('请先登录'); return; }
    const wasFollowing = followMap[userId];
    setFollowMap(prev => ({ ...prev, [userId]: !wasFollowing }));
    try {
      if (wasFollowing) await followsAPI.unfollow(userId);
      else await followsAPI.follow(userId);
    } catch (err) {
      setFollowMap(prev => ({ ...prev, [userId]: wasFollowing }));
      toast.error(err.message);
    }
  }, [currentUser, followMap, toast]);

  // 点赞（简单实现）
  const likingRef = useRef(new Set());
  const handleLike = useCallback(async (postId) => {
    if (!currentUser) { toast.error('请先登录'); return; }
    if (likingRef.current.has(postId)) return;
    likingRef.current.add(postId);
    setPosts(prev => prev.map(p => p.id === postId ? {
      ...p,
      has_liked: !p.has_liked,
      like_count: p.has_liked ? p.like_count - 1 : p.like_count + 1,
    } : p));
    try {
      await forumAPI.like({ target_type: 'post', target_id: postId });
    } catch (e) {
      setPosts(prev => prev.map(p => p.id === postId ? {
        ...p,
        has_liked: !p.has_liked,
        like_count: p.has_liked ? p.like_count - 1 : p.like_count + 1,
      } : p));
      toast.error(e.message);
    } finally {
      likingRef.current.delete(postId);
    }
  }, [currentUser, toast]);

  return (
    <PageLayout hero={{ icon: 'fa-magnifying-glass', title: '搜索', subtitle: q ? `“${q}” 的搜索结果` : '探索 ABDL Space 的精彩内容' }}>
      {/* 大搜索框 */}
      <div className="search-input-wrap">
        <i className="fa-solid fa-magnifying-glass search-input-icon" />
        <input
          ref={inputRef}
          className="search-input"
          value={input}
          onChange={e => handleInput(e.target.value)}
          placeholder="搜索用户、帖子、公告…"
          type="text"
          autoComplete="off"
        />
        {input && (
          <button
            className="search-input-clear"
            onClick={() => handleInput('')}
            aria-label="清除"
            type="button"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        )}
      </div>

      {/* Tab */}
      {q.trim() && (
        <div className="search-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`search-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* 内容区 */}
      {!q.trim() ? (
        /* 空搜索：热搜 */
        <div className="search-hot">
          <h3 className="search-section-title">
            <i className="fa-solid fa-fire mr-2" style={{ color: 'var(--warning)' }} />
            热门搜索
          </h3>
          <div className="search-hot-grid">
            {HOT_SEARCHES.map(h => (
              <button
                key={h.tag}
                className="search-hot-chip"
                onClick={() => handleInput(h.tag)}
                type="button"
              >
                <i className={`fa-solid ${h.icon}`} />
                <span>{h.tag}</span>
              </button>
            ))}
          </div>
        </div>
      ) : loading ? (
        <LoadingSkeleton count={4} height={80} />
      ) : (
        <div className="search-results">
          {/* 用户结果（all / user tab） */}
          {(tab === 'all' || tab === 'user') && users.length > 0 && (
            <section className="search-section">
              {tab === 'all' && (
                <h3 className="search-section-title">
                  <i className="fa-solid fa-user mr-2" style={{ color: 'var(--primary-dark)' }} />
                  用户 <span className="search-section-count">{users.length}</span>
                </h3>
              )}
              <div className="space-y-2">
                {users.map(u => (
                  <UserSearchCard
                    key={u.id}
                    user={u}
                    currentUser={currentUser}
                    following={followMap[u.id]}
                    onFollow={handleFollow}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 帖子结果（all / post / announcement tab） */}
          {(tab === 'all' || tab === 'post' || tab === 'announcement') && (
            <section className="search-section">
              {tab === 'all' && displayPosts.length > 0 && (
                <h3 className="search-section-title">
                  <i className="fa-solid fa-comments mr-2" style={{ color: 'var(--primary-dark)' }} />
                  帖子 <span className="search-section-count">{displayPosts.length}</span>
                </h3>
              )}
              {displayPosts.length === 0 ? (
                <EmptyState
                  icon="fa-magnifying-glass"
                  title="未找到相关帖子"
                  description="换个关键词试试"
                />
              ) : (
                <div className="space-y-4 miui-list-enter">
                  {displayPosts.map(p => (
                    <PostCard
                      key={p.id}
                      post={p}
                      onLike={handleLike}
                      onFollow={handleFollow}
                      followMap={followMap}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 全部为空 */}
          {tab === 'all' && users.length === 0 && displayPosts.length === 0 && (
            <EmptyState
              icon="fa-magnifying-glass"
              title="未找到结果"
              description={`“${q}” 没有匹配的内容`}
            />
          )}
        </div>
      )}
    </PageLayout>
  );
}

/** 用户搜索结果卡片 */
function UserSearchCard({ user, currentUser, following, onFollow }) {
  return (
    <Link
      to={`/user/${user.id}`}
      className="card search-user-card flex items-center gap-3"
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0 overflow-hidden"
        style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}
      >
        {user.avatar
          ? <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
          : user.username?.[0]?.toUpperCase() || '?'
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold truncate" style={{ color: 'var(--text)', fontSize: '15px' }}>
            {user.username}
          </span>
          {user.role === 'admin' && <OfficialBadge className="flex-shrink-0" />}
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          @{user.username}
        </div>
      </div>
      {currentUser && currentUser.id !== user.id && (
        <button
          className={`btn btn-sm ${following ? 'btn-outline' : 'btn-primary'}`}
          onClick={(e) => onFollow(user.id, e)}
          style={following ? { borderColor: 'var(--border)', color: 'var(--text-light)' } : {}}
        >
          {following ? '已关注' : '关注'}
        </button>
      )}
    </Link>
  );
}
