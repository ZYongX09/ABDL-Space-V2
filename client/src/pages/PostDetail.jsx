import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { Spinner } from '../components/Feedback';
import { forumAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useVerifyModal } from '../components/VerifyModal';

export default function PostDetail() {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const { user } = useAuth();
  const toast = useToast();
  const { trigger, VerifyModal } = useVerifyModal();

  useEffect(() => {
    (async () => {
      try {
        const data = await forumAPI.getPost(id);
        setPost(data.post);
        setComments(data.comments || []);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleComment = async () => {
    if (!commentText.trim()) return;
    trigger(async () => {
      try {
        await forumAPI.comment(id, { content: commentText.trim() });
        setCommentText('');
        toast.success('评论成功');
        const data = await forumAPI.getPost(id);
        setComments(data.comments || []);
      } catch (e) {
        toast.error(e.message);
      }
    });
  };

  const handleLike = async () => {
    if (!user) { toast.error('请先登录'); return; }
    try {
      await forumAPI.like({ target_type: 'post', target_id: Number(id) });
      const data = await forumAPI.getPost(id);
      setPost(data.post);
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (loading) return <Spinner />;
  if (!post) return <div className="empty-state"><h3>帖子不存在</h3></div>;

  return (
    <PageLayout hero={{ icon: 'fa-file-lines', title: '帖子详情' }}>
      <div className="card mb-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
            {post.user?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <Link to={`/user/${post.user?.id}`} className="font-semibold text-sm hover:underline" style={{ color: 'var(--text)' }}>
              {post.user?.username || '匿名'}
            </Link>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(post.created_at).toLocaleString('zh-CN')}
            </div>
          </div>
        </div>
        <p className="whitespace-pre-wrap break-words mb-4">{post.content}</p>
        <div className="flex items-center gap-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            className={`flex items-center gap-1.5 text-sm ${post.has_liked ? 'font-bold' : ''}`}
            style={{ color: post.has_liked ? 'var(--danger)' : 'var(--text-light)', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={handleLike}
          >
            <i className={`${post.has_liked ? 'fa-solid' : 'fa-regular'} fa-heart`} />
            {post.like_count || 0}
          </button>
          <span className="text-sm" style={{ color: 'var(--text-light)' }}>
            <i className="fa-regular fa-comment mr-1.5" />{comments.length}
          </span>
        </div>
      </div>

      {/* 评论列表 */}
      <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>
        评论 ({comments.length})
      </h3>
      {comments.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>暂无评论，快来抢沙发！</p>
      ) : (
        <div className="space-y-3 mb-5">
          {comments.map(c => (
            <div key={c.id} className="card" style={{ padding: '1rem' }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
                  {c.user?.username?.[0]?.toUpperCase() || '?'}
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{c.user?.username || '匿名'}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(c.created_at).toLocaleString('zh-CN')}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}>{c.content}</p>
            </div>
          ))}
        </div>
      )}

      {/* 评论表单 */}
      {user ? (
        <div className="card">
          <textarea
            className="form-control mb-3"
            placeholder="写下你的评论..."
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            rows={3}
          />
          <div className="flex justify-end">
            <button className="btn btn-primary btn-sm" onClick={handleComment} disabled={!commentText.trim()}>
              发表评论
            </button>
          </div>
        </div>
      ) : (
        <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          <Link to="/login" style={{ color: 'var(--link-color)' }}>登录</Link> 后即可评论
        </p>
      )}
    </PageLayout>
    {VerifyModal}
  );
}
