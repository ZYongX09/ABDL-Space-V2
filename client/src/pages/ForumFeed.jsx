import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { LoadingSkeleton, EmptyState } from '../components/Feedback';
import { useVerifyModal } from '../components/VerifyModal';
import { forumAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function ForumFeed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [search, setSearch] = useState('');
  const { user } = useAuth();
  const toast = useToast();
  const { trigger, VerifyModal } = useVerifyModal();

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

  const doPost = async () => {
    if (!content.trim()) return;
    try {
      await forumAPI.create({ content: content.trim() });
      setContent('');
      setShowForm(false);
      toast.success('发布成功');
      loadPosts();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const handlePost = () => {
    if (!content.trim()) return;
    trigger(doPost);
  };

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
    <PageLayout hero={{ icon: 'fa-comments', title: '论坛', subtitle: '分享你的 ABDL 生活' }}>
      {/* 搜索 + 发帖 */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <input
          className="form-control flex-1 min-w-[200px]"
          placeholder="搜索帖子..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {user && (
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            <i className="fa-solid fa-pen" /> 发帖
          </button>
        )}
      </div>

      {/* 发帖表单 */}
      {showForm && (
        <div className="card mb-5 animate-fade-in-up">
          <textarea
            className="form-control mb-3"
            placeholder="分享点什么..."
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
          />
          <div className="flex gap-2 justify-end">
            <button className="btn btn-outline btn-sm" onClick={() => setShowForm(false)}>取消</button>
            <button className="btn btn-primary btn-sm" onClick={handlePost} disabled={!content.trim()}>发布</button>
          </div>
        </div>
      )}

      {/* 帖子列表 */}
      {loading ? (
        <LoadingSkeleton count={4} height={100} />
      ) : posts.length === 0 ? (
        <EmptyState icon="fa-comments" title="暂无帖子" description="快来发第一帖吧！" />
      ) : (
        <div className="space-y-4">
          {posts.map((post, i) => (
            <div key={post.id} className="card stagger-item" style={{ padding: '1.25rem' }}>
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
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {new Date(post.created_at).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <Link to={`/forum/${post.id}`} className="block mt-1" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                    <p className="whitespace-pre-wrap break-words">{post.content}</p>
                  </Link>
                  <div className="flex items-center gap-4 mt-3">
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
                    {user && user.id === post.user?.id && (
                      <button
                        className="flex items-center gap-1 text-sm ml-auto"
                        style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                        onClick={() => trigger(async () => { try { await forumAPI.delete(post.id); toast.success('已删除'); loadPosts(); } catch (e) { toast.error(e.message); } })}
                        title="删除帖子"
                      >
                        <i className="fa-regular fa-trash-can" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    {VerifyModal}
    </PageLayout>
  );
}
