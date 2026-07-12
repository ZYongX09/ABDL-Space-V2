import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { useMobileHeaderActions } from '../contexts/MobileHeaderContext';
import { LoadingSkeleton, EmptyState } from '../components/Feedback';
import ImageGrid from '../components/ImageGrid';
import PullToRefresh from '../components/PullToRefresh';
import RichContent from '../components/RichContent';
import OfficialBadge from '../components/OfficialBadge';
import ReportModal from '../components/ReportModal';
import ThemeToggleBubble from '../components/ThemeToggleBubble/ThemeToggleBubble';
import { forumAPI, followsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function ForumFeed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [followMap, setFollowMap] = useState({});
  const [reportTarget, setReportTarget] = useState(null);
  const likingRef = useRef(new Set());
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const loadPosts = async (pageNum = 1, append = false) => {
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      const searchNsfwEnabled = localStorage.getItem('abdl_search_nsfw') === 'true';
      const data = await forumAPI.feed({
        page: pageNum,
        limit: 20,
        search: search || undefined,
        excludeNsfw: search && !searchNsfwEnabled ? true : undefined,
      });
      // 过滤掉回帖（reply_to_id 不为空的帖子）
      const newPosts = (data.posts || []).filter(p => !p.reply_to_id);
      setPosts(prev => append ? [...prev, ...newPosts] : newPosts);
      setHasMore(newPosts.length >= 20);
      setPage(pageNum);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { loadPosts(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // 获取帖子中用户的关注状态
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

  const handleLike = async (postId) => {
    if (!user) { toast.error('请先登录'); return; }
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
  };

  const handleFollow = async (userId, e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!user) { toast.error('请先登录'); return; }
    const wasFollowing = followMap[userId];
    // Optimistic update
    setFollowMap(prev => ({ ...prev, [userId]: !wasFollowing }));
    try {
      if (wasFollowing) {
        await followsAPI.unfollow(userId);
      } else {
        await followsAPI.follow(userId);
      }
    } catch (err) {
      // Rollback
      setFollowMap(prev => ({ ...prev, [userId]: wasFollowing }));
      toast.error(err.message);
    }
  };

  const { registerActions } = useMobileHeaderActions();
  useEffect(() => {
    registerActions(
      [
        { icon: 'fa-solid fa-envelope', onClick: () => navigate('/messages'), title: '私信' },
        ...(user ? [{ icon: 'fa-solid fa-square-plus', onClick: () => navigate('/create-post'), title: '发帖' }] : []),
      ],
      []
    );
    return () => registerActions([], []);
  }, [user, navigate]);

  return (
    <>
    <ThemeToggleBubble />
    <PageLayout hero={{ icon: 'fa-comments', title: '广场', subtitle: '分享你的 ABDL 生活' }}>
      {/* 搜索 + 发帖 */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="flex-1 min-w-[200px] miui-input-group">
          <input
            className="form-control"
            placeholder="搜索帖子..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {user && (
          <button className="btn btn-primary miui-press" onClick={() => navigate('/create-post')}>
            <i className="fa-solid fa-pen" /> 发帖
          </button>
        )}
      </div>

      {/* 帖子列表 */}
      <PullToRefresh onRefresh={() => loadPosts(1)}>
      {loading ? (
        <LoadingSkeleton count={4} height={100} />
      ) : posts.length === 0 ? (
        <EmptyState icon="fa-comments" title="暂无帖子" description="快来发第一帖吧！" />
      ) : (
        <div className="space-y-4 miui-list-enter">
          {posts.map((post, i) => (
            <div key={post.id} className={`card miui-hover-lift ${post.pinned ? 'post-pinned' : ''}`} style={{ padding: '1.25rem' }}>
              {post.pinned && (
                <div className="post-pinned-tag">
                  <i className="fa-solid fa-thumbtack" /> 置顶
                </div>
              )}
              {/* Line 1: avatar | username + follow + badge */}
              <div className="flex items-center gap-3 mb-2">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden"
                  style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}
                >
                  {post.user?.avatar
                    ? <img src={post.user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    : post.user?.username?.[0]?.toUpperCase() || '?'
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link to={`/user/${post.user?.id}`} className="font-semibold text-sm hover:underline whitespace-nowrap" style={{ color: 'var(--text)' }}>
                      {post.user?.username || '匿名'}
                    </Link>
                    {user && post.user?.id && String(user.id) !== String(post.user.id) && (
                      <button
                        className={`btn btn-xs ${followMap[post.user.id] ? 'btn-outline' : 'btn-primary'}`}
                        onClick={(e) => handleFollow(post.user.id, e)}
                        style={{
                          fontSize: '11px',
                          padding: '1px 8px',
                          lineHeight: '18px',
                          ...(followMap[post.user.id] ? { borderColor: 'var(--border)', color: 'var(--text-light)' } : {}),
                        }}
                      >
                        {followMap[post.user.id] ? '已关注' : '关注'}
                      </button>
                    )}
                    {post.user?.role === 'admin' && <OfficialBadge className="flex-shrink-0" />}
                  </div>
                </div>
              </div>
              {/* Line 2: timestamp */}
              <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                {new Date(post.created_at + 'Z').toLocaleString('zh-CN')}
              </div>
              {/* Line 3: content */}
              <Link to={`/forum/${post.id}`} className="block" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                <p className="whitespace-pre-wrap break-words"><RichContent text={post.content} /></p>
              </Link>
              {/* Line 4: images */}
              {post.images && post.images.length > 0 && (
                <ImageGrid images={post.images} />
              )}
              {/* NSFW tag */}
              {post.has_nsfw === 1 && (
                <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: 'var(--warning)' }}>
                  <i className="fa-solid fa-triangle-exclamation" />
                  <span>该帖子包含敏感内容</span>
                </div>
              )}
              {/* Line 5: actions */}
              <div className="flex items-center gap-4 mt-3 post-actions">
                <button
                  className={`flex items-center gap-1.5 text-sm miui-like ${post.has_liked ? 'font-bold liked' : ''}`}
                  style={{ color: post.has_liked ? 'var(--danger)' : 'var(--text-light)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => handleLike(post.id)}
                >
                  <i className={`${post.has_liked ? 'fa-solid' : 'fa-regular'} fa-heart`} />
                  {post.like_count || 0}
                </button>
                <Link to={`/forum/${post.id}`} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-light)', textDecoration: 'none' }}>
                  <i className="fa-regular fa-comment" />
                  {post.comment_count || 0}
                </Link>
                <button
                  className="flex items-center gap-1.5 text-sm ml-auto"
                  style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}
                  onClick={() => setReportTarget({ type: 'post', id: post.id })}
                  title="举报"
                >
                  <i className="fa-solid fa-shield-halved" />
                </button>
              </div>
            </div>
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
            {loadingMore ? <><i className="fa-solid fa-spinner fa-spin mr-1" />加载中...</> : <><i className="fa-solid fa-ellipsis mr-1" />加载更多</>}
          </button>
        </div>
      )}
      </PullToRefresh>
    </PageLayout>
    {reportTarget && (
      <ReportModal
        targetType={reportTarget.type}
        targetId={reportTarget.id}
        onClose={() => setReportTarget(null)}
      />
    )}
    </>
  );
}
