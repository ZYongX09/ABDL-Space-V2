import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { Spinner } from '../components/Feedback';
import ImageGrid from '../components/ImageGrid';
import ImageUploader from '../components/ImageUploader';
import { forumAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useVerifyModal } from '../components/VerifyModal';
import RichContent from '../components/RichContent';
import OfficialBadge from '../components/OfficialBadge';

export default function PostDetail() {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const imgRef = useRef(null);
  const lastCommentTime = useRef(0);
  const { user } = useAuth();
  const toast = useToast();
  const { trigger, VerifyModal } = useVerifyModal();

  // 冷却计时器
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
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
    if (!commentText.trim() && !imgRef.current?.hasPending()) return;
    // 冷却检查
    const now = Date.now();
    const elapsed = (now - lastCommentTime.current) / 1000;
    if (elapsed < 15) {
      toast.error(`评论太频繁，请等待 ${Math.ceil(15 - elapsed)} 秒`);
      return;
    }
    trigger(async () => {
      setPublishing(true);
      try {
        let imageUrls = [];
        if (imgRef.current?.hasPending()) {
          toast.info('正在上传图片...');
          imageUrls = await imgRef.current.uploadAll();
        }
        await forumAPI.comment(id, { content: commentText.trim(), images: imageUrls.length > 0 ? imageUrls : undefined });
        lastCommentTime.current = Date.now();
        setCooldown(15);
        setCommentText('');
        imgRef.current?.clear();
        toast.success(imageUrls.length > 0 ? '图片上传完成，评论成功！' : '评论成功');
        const data = await forumAPI.getPost(id);
        setComments(data.comments || []);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setPublishing(false);
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
    <>
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
            {post.user?.role === 'admin' && <OfficialBadge />}
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(post.created_at).toLocaleString('zh-CN')}
            </div>
          </div>
        </div>
        <p className="whitespace-pre-wrap break-words mb-4"><RichContent text={post.content} /></p>
        {post.images && post.images.length > 0 && <ImageGrid images={post.images} />}
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
          {user && user.id === post.user?.id && (
            <button
              className="flex items-center gap-1 text-sm ml-auto"
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => trigger(async () => { try { await forumAPI.delete(post.id); toast.success('已删除'); window.history.back(); } catch (e) { toast.error(e.message); } })}
              title="删除帖子"
            >
              <i className="fa-regular fa-trash-can" />
            </button>
          )}
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
                {c.user?.role === 'admin' && <OfficialBadge />}
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(c.created_at).toLocaleString('zh-CN')}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text)' }}><RichContent text={c.content} /></p>
              {c.images && c.images.length > 0 && <ImageGrid images={c.images} />}
            </div>
          ))}
        </div>
      )}

      {/* 评论表单 */}
      {user ? (
        <div className="card">
          <textarea
            className="form-control mb-2"
            placeholder="写下你的评论..."
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            rows={3}
            disabled={publishing}
          />
          <ImageUploader ref={imgRef} max={2} onError={msg => toast.error(msg)} />
          <div className="flex justify-end mt-3">
            <button className="btn btn-primary btn-sm" onClick={handleComment} disabled={(!commentText.trim() && !imgRef.current?.hasPending()) || publishing || cooldown > 0}>
              {publishing ? <><i className="fa-solid fa-spinner fa-spin mr-1" />发送中...</> : cooldown > 0 ? <><i className="fa-solid fa-clock mr-1" />{cooldown}s</> : '发表评论'}
            </button>
          </div>
        </div>
      ) : (
        <p className="text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          <Link to="/login" style={{ color: 'var(--link-color)' }}>登录</Link> 后即可评论
        </p>
      )}
    </PageLayout>
    <>{VerifyModal}</>
    </>
  );
}
