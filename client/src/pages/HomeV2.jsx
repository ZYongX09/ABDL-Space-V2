import { useState, useEffect, useCallback, useRef } from 'react';
import { forumAPI, followsAPI } from '../api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PillSelector from '../components/PillSelector';
import InlineComposer from '../components/InlineComposer';
import PostCard from '../components/PostCard';
import RightSidebar from '../components/RightSidebar';
import ThemeToggleBubble from '../components/ThemeToggleBubble/ThemeToggleBubble';
import { LoadingSkeleton, EmptyState } from '../components/Feedback';
import PullToRefresh from '../components/PullToRefresh';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const TABS = [
  { key: 'latest', label: '最新' },
  { key: 'following', label: '关注' },
];

export default function HomeV2() {
  const [searchParams] = useSearchParams();
  const search = searchParams.get('search') || '';

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState('latest');
  const [followMap, setFollowMap] = useState({});
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [needLogin, setNeedLogin] = useState(false);

  const loadPosts = useCallback(async (pageNum = 1, append = false) => {
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      setNeedLogin(false);
      const filter = activeTab === 'following' ? 'following' : undefined;
      const data = await forumAPI.feed({
        page: pageNum,
        limit: 20,
        search: search || undefined,
        filter,
      });
      const newPosts = data.posts || [];
      setPosts(prev => append ? [...prev, ...newPosts] : newPosts);
      setHasMore(newPosts.length >= 20);
      setPage(pageNum);
    } catch (e) {
      if (activeTab === 'following' && !user) {
        setNeedLogin(true);
        setPosts([]);
      } else {
        toast.error(e.message);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeTab, user, search]);

  // 初始加载 + tab切换重新加载
  useEffect(() => {
    loadPosts(1);
  }, [activeTab, loadPosts]);

  // 获取关注状态
  useEffect(() => {
    if (!user || posts.length === 0) return;
    const userIds = [...new Set(posts.map(p => p.user?.id).filter(id => id && id !== user.id))];
    if (userIds.length === 0) return;
    (async () => {
      try {
        const results = await Promise.all(userIds.map(id => followsAPI.status(id).catch(() => null)));
        const map = {};
        userIds.forEach((id, i) => { if (results[i]) map[id] = results[i].following; });
        if (Object.keys(map).length > 0) setFollowMap(prev => ({ ...prev, ...map }));
      } catch {}
    })();
  }, [posts, user]);

  const likingRef = useRef(new Set());

  const handleLike = useCallback(async (postId) => {
    if (!user) { toast.error('请先登录'); return; }
    if (likingRef.current.has(postId)) return;
    likingRef.current.add(postId);
    // 保存原始状态用于 rollback
    const prevPost = posts.find(p => p.id === postId);
    if (!prevPost) { likingRef.current.delete(postId); return; }
    const origLiked = prevPost.has_liked;
    const origCount = prevPost.like_count;
    setPosts(prev => prev.map(p => p.id === postId ? {
      ...p,
      has_liked: !origLiked,
      like_count: origLiked ? origCount - 1 : origCount + 1,
    } : p));
    try {
      await forumAPI.like({ target_type: 'post', target_id: postId });
    } catch (e) {
      setPosts(prev => prev.map(p => p.id === postId ? {
        ...p,
        has_liked: origLiked,
        like_count: origCount,
      } : p));
      toast.error(e.message);
    } finally {
      likingRef.current.delete(postId);
    }
  }, [user, posts]);

  const handleFollow = useCallback(async (userId, e) => {
    e?.stopPropagation();
    e?.preventDefault();
    if (!user) { toast.error('请先登录'); return; }
    const wasFollowing = followMap[userId];
    setFollowMap(prev => ({ ...prev, [userId]: !wasFollowing }));
    try {
      if (wasFollowing) await followsAPI.unfollow(userId);
      else await followsAPI.follow(userId);
    } catch {
      setFollowMap(prev => ({ ...prev, [userId]: wasFollowing }));
    }
  }, [user, followMap]);

  const handlePostCreated = useCallback((result) => {
    // prepend 新帖而非全量刷新
    if (result?.id) {
      forumAPI.getPost(result.id).then(data => {
        if (data.post) setPosts(prev => [data.post, ...prev]);
      }).catch(() => loadPosts(1));
    } else {
      loadPosts(1);
    }
  }, [loadPosts]);

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
  }, []);

  return (
    <>
      <ThemeToggleBubble />
      <div className="home-layout">
        {/* B - 信息流主区域 */}
        <main className="home-feed">
          {/* 药丸分段选择器 */}
          <PillSelector tabs={TABS} activeTab={activeTab} onChange={handleTabChange} />

          {/* 内嵌发帖区 */}
          <InlineComposer onPostCreated={handlePostCreated} />

          {/* 帖子列表 */}
          <PullToRefresh onRefresh={() => loadPosts(1)}>
            {loading ? (
              <LoadingSkeleton count={4} height={100} />
            ) : needLogin ? (
              <div className="card text-center py-8">
                <i className="fa-solid fa-user-group text-3xl mb-3" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm mb-3" style={{ color: 'var(--text-light)' }}>登录后查看关注用户的帖子</p>
                <button className="btn btn-primary btn-sm" onClick={() => navigate('/login')}>
                  <i className="fa-solid fa-right-to-bracket mr-1" /> 去登录
                </button>
              </div>
            ) : posts.length === 0 ? (
              <EmptyState
                icon={activeTab === 'following' ? 'fa-user-group' : 'fa-comments'}
                title={activeTab === 'following' ? '暂无关注内容' : '暂无帖子'}
                description={activeTab === 'following' ? '关注一些用户后这里会显示他们的帖子' : '快来发第一帖吧！'}
              />
            ) : (  
              <div className="space-y-4 miui-list-enter">
                {posts.map(post => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onLike={handleLike}
                    onFollow={handleFollow}
                    followMap={followMap}
                  />
                ))}
              </div>
            )}

            {/* 加载更多 */}
            {!loading && hasMore && posts.length > 0 && (
              <div className="text-center mt-4">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => loadPosts(page + 1, true)}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? <><i className="fa-solid fa-spinner fa-spin mr-1" />加载中...</>
                    : <><i className="fa-solid fa-ellipsis mr-1" />加载更多</>
                  }
                </button>
              </div>
            )}
          </PullToRefresh>
        </main>

        {/* C - 右侧栏 */}
        <RightSidebar />
      </div>
    </>
  );
}
