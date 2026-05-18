import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { LoadingSkeleton, EmptyState } from '../components/Feedback';
import ImageGrid from '../components/ImageGrid';
import PullToRefresh from '../components/PullToRefresh';
import RichContent from '../components/RichContent';
import OfficialBadge from '../components/OfficialBadge';
import { forumAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function ForumFeed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const loadPosts = async () => {
    try {
      setLoading(true);
      const data = await forumAPI.feed({ search: search || undefined });
      setPosts(data.posts || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPosts(); }, [search]);

  const handleLike = async (postId) => {
    if (!user) { toast.error('请先登录'); return; }
    try {
      await forumAPI.like({ target_type: 'post', target_id: postId });
      loadPosts();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <PageLayout hero={{ icon: 'fa-comments', title: '广场', subtitle: '分享你的 ABDL 生活' }}>
      {/* 搜索 + 发帖 */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          className="form-control flex-1 min-w-[200px]"
          placeholder="搜索帖子..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {user && (
          <button className="btn btn-primary" onClick={() => navigate('/create-post')}>
            <i className="fa-solid fa-pen" /> 发帖
          </button>
        )}
      </div>

      {/* 帖子列表 */}
      <PullToRefresh onRefresh={loadPosts}>
      {loading ? (
        <LoadingSkeleton count={4} height={100} />
      ) : posts.length === 0 ? (
        <EmptyState icon="fa-comments" title="暂无帖子" description="快来发第一帖吧！" />
      ) : (
        <div className="space-y-4 miui-list-enter">
          {posts.map((post, i) => (
            <div key={post.id} className={`card stagger-item ${post.pinned ? 'post-pinned' : ''}`} style={{ padding: '1.25rem' }}>
              {post.pinned && (
                <div className="post-pinned-tag">
                  <i className="fa-solid fa-thumbtack" /> 置顶
                </div>
              )}
              <div className="flex items-start gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}
                >
                  {post.user?.username?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link to={`/user/${post.user?.id}`} className="font-semibold text-sm hover:underline" style={{ color: 'var(--text)' }}>
                      {post.user?.username || '匿名'}
                    </Link>
                    {post.user?.role === 'admin' && <OfficialBadge className="ml-1.5" />}
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(post.created_at).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <Link to={`/forum/${post.id}`} className="block mt-1" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                    <p className="whitespace-pre-wrap break-words"><RichContent text={post.content} /></p>
                  </Link>
                  {post.images && post.images.length > 0 && (
                    <Link to={`/forum/${post.id}`} style={{ textDecoration: 'none' }}>
                      <ImageGrid images={post.images} />
                    </Link>
                  )}
                  <div className="flex items-center gap-4 mt-3 post-actions">
                    <button
                      className={`flex items-center gap-1.5 text-sm transition-colors ${post.has_liked ? 'font-bold' : ''}`}
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

                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      </PullToRefresh>
    </PageLayout>
  );
}
