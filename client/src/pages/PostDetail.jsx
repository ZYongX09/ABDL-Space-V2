import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { Spinner } from '../components/Feedback';
import ImageGrid from '../components/ImageGrid';
import ImageUploader from '../components/ImageUploader';
import { forumAPI, adminAPI, followsAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useVerifyModal } from '../components/VerifyModal';
import RichContent from '../components/RichContent';
import OfficialBadge from '../components/OfficialBadge';
import ReportModal from '../components/ReportModal';

export default function PostDetail() {
  const { id } = useParams();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [followStatus, setFollowStatus] = useState({ following: false });
  const [followLoading, setFollowLoading] = useState(false);
  const imgRef = useRef(null);
  const menuRef = useRef(null);
  const lastCommentTime = useRef(0);
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { trigger, VerifyModal, captchaToken } = useVerifyModal();

  const isOwner = user && user.id === post?.user?.id;
  const isAdmin = user?.role === 'admin';

  // Load follow status
  useEffect(() => {
    if (!post?.user?.id || isOwner) return;
    (async () => {
      try {
        const data = await followsAPI.status(post.user.id);
        setFollowStatus(data);
      } catch {}
    })();
  }, [post?.user?.id, isOwner]);

  const handleFollow = async () => {
    if (!user) { toast.error('请先登录'); return; }
    setFollowLoading(true);
    const wasFollowing = followStatus.following;
    try {
      if (wasFollowing) {
        await followsAPI.unfollow(post.user.id);
        setFollowStatus(prev => ({ ...prev, following: false }));
      } else {
        await followsAPI.follow(post.user.id);
        setFollowStatus(prev => ({ ...prev, following: true }));
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setFollowLoading(false);
    }
  };

  // 点击外部关闭菜单
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

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

  const loadPost = async () => {
    try {
      const data = await forumAPI.getPost(id);
      setPost(data.post);
      setComments(data.comments || []);
    } catch {}
  };

  const handleComment = async () => {
    if (!commentText.trim() && !imgRef.current?.hasPending()) return;
    const now = Date.now();
    const elapsed = (now - lastCommentTime.current) / 1000;
    if (elapsed < 15) {
      toast.error(`评论太频繁，请等待 ${Math.ceil(15 - elapsed)} 秒`);
      return;
    }
    trigger(async () => {
      setPublishing(true);
      try {
        let imageData = [];
        if (imgRef.current?.hasPending()) {
          toast.info('正在上传图片...');
          const uploaded = await imgRef.current.uploadAll();
          imageData = uploaded.map(item => {
            if (typeof item === 'string') return { url: item, is_nsfw: false };
            return { url: item.url, is_nsfw: !!item.is_nsfw };
          });
        }
        await forumAPI.comment(id, { content: commentText.trim(), images: imageData.length > 0 ? imageData : undefined, captchaToken: captchaToken.current });
        lastCommentTime.current = Date.now();
        setCooldown(15);
        setCommentText('');
        imgRef.current?.clear();
        toast.success(imageData.length > 0 ? '图片上传完成，评论成功！' : '评论成功');
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
    const wasLiked = post.has_liked;
    const oldCount = post.like_count || 0;
    setPost(prev => ({
      ...prev,
      has_liked: !wasLiked,
      like_count: wasLiked ? oldCount - 1 : oldCount + 1,
    }));
    try {
      await forumAPI.like({ target_type: 'post', target_id: Number(id) });
    } catch (e) {
      setPost(prev => ({ ...prev, has_liked: wasLiked, like_count: oldCount }));
      toast.error(e.message);
    }
  };

  const handleDelete = () => {
    setShowMenu(false);
    // 延迟触发验证，避免菜单关闭的 re-render 干扰
    setTimeout(() => {
      trigger(async () => {
        try {
          await forumAPI.delete(post.id);
          toast.success('帖子已删除');
          navigate('/');
        } catch (e) { toast.error(e.message); }
      });
    }, 100);
  };

  const handlePin = async () => {
    setShowMenu(false);
    try {
      const data = await adminAPI.pinPost(post.id);
      toast.success(data.pinned ? '已置顶' : '已取消置顶');
      await loadPost();
    } catch (e) { toast.error(e.message); }
  };

  const startEdit = () => {
    setShowMenu(false);
    setEditContent(post.content);
    setEditing(true);
  };

  const handleEditSave = async () => {
    if (!editContent.trim()) { toast.error('内容不能为空'); return; }
    setEditSaving(true);
    try {
      await forumAPI.editPost(post.id, { content: editContent.trim() });
      toast.success('已修改');
      setEditing(false);
      await loadPost();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setEditSaving(false);
    }
  };

  if (loading) return <Spinner />;
  if (!post) return <div className="empty-state"><h3>帖子不存在</h3></div>;

  return (
    <>
    <PageLayout hero={{ icon: 'fa-file-lines', title: '帖子详情' }}>
      <div className={`card mb-5 ${post.pinned ? 'post-pinned' : ''}`}>
        {post.pinned && (
          <div className="post-pinned-tag">
            <i className="fa-solid fa-thumbtack" /> 置顶
          </div>
        )}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
            style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
            {post.user?.username?.[0]?.toUpperCase() || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Link to={`/user/${post.user?.id}`} className="font-semibold text-sm hover:underline whitespace-nowrap" style={{ color: 'var(--text)' }}>
                {post.user?.username || '匿名'}
              </Link>
              {!isOwner && user && post.user?.id && (
                <button
                  className={`btn btn-xs ${followStatus.following ? 'btn-outline' : 'btn-primary'}`}
                  onClick={handleFollow}
                  disabled={followLoading}
                  style={{
                    fontSize: '11px',
                    padding: '1px 8px',
                    lineHeight: '18px',
                    ...(followStatus.following ? { borderColor: 'var(--border)', color: 'var(--text-light)' } : {}),
                  }}
                >
                  {followLoading ? <i className="fa-solid fa-spinner fa-spin" /> : (followStatus.following ? '已关注' : '关注')}
                </button>
              )}
              {post.user?.role === 'admin' && <OfficialBadge className="flex-shrink-0" />}
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(post.created_at).toLocaleString('zh-CN')}
            </div>
          </div>
          {/* 更多按钮 */}
          {(isOwner || isAdmin) && (
            <div className="relative" ref={menuRef}>
              <button
                className="btn-menu"
                onClick={() => setShowMenu(!showMenu)}
                title="更多操作"
              >
                <i className="fa-solid fa-ellipsis-vertical" />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setShowMenu(false)} />
                  <div className="dropdown-menu animate-sheet-up z-50">
                  {isAdmin && (
                    <button className="dropdown-item" onClick={handlePin}>
                      <i className={`fa-solid fa-thumbtack ${post.pinned ? '' : 'opacity-50'}`} />
                      {post.pinned ? '取消置顶' : '置顶帖子'}
                    </button>
                  )}
                  {isOwner && (
                    <button className="dropdown-item" onClick={startEdit}>
                      <i className="fa-solid fa-pen" />
                      编辑帖子
                    </button>
                  )}
                  <button className="dropdown-item dropdown-item-danger" onClick={handleDelete}>
                    <i className="fa-solid fa-trash" />
                    删除帖子
                  </button>
                  {!isOwner && (
                    <button className="dropdown-item" onClick={() => { setShowMenu(false); setReportTarget({ type: 'post', id: post.id }); }}>
                      <i className="fa-solid fa-shield-halved" style={{ color: 'var(--danger)' }} />
                      举报帖子
                    </button>
                  )}
                </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* 帖子内容 / 编辑模式 */}
        {editing ? (
          <div className="animate-fade-in-up">
            <textarea
              className="form-control mb-3"
              value={editContent}
              onChange={e => setEditContent(e.target.value)}
              rows={4}
              maxLength={5000}
              disabled={editSaving}
            />
            <div className="text-xs mb-2" style={{ color: editContent.length > 4500 ? 'var(--danger)' : 'var(--text-muted)' }}>
              {editContent.length}/5000
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={handleEditSave} disabled={editSaving || !editContent.trim()}>
                {editSaving ? <><i className="fa-solid fa-spinner fa-spin mr-1" />保存中</> : '保存'}
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setEditing(false)} disabled={editSaving}>取消</button>
            </div>
          </div>
        ) : (
          <>
            <p className="whitespace-pre-wrap break-words mb-4"><RichContent text={post.content} /></p>
            {post.images && post.images.length > 0 && <ImageGrid images={post.images} />}
          </>
        )}

        <div className="flex items-center gap-4 pt-3 border-t post-actions" style={{ borderColor: 'var(--border)' }}>
          <button
            className={`btn-icon miui-like ${post.has_liked ? 'liked' : ''}`}
            onClick={handleLike}
          >
            <i className={`${post.has_liked ? 'fa-solid' : 'fa-regular'} fa-heart`} />
            <span>{post.like_count || 0}</span>
          </button>
          <span className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-light)' }}>
            <i className="fa-regular fa-comment" />
            {comments.length}
          </span>
        </div>
      </div>

      {/* 评论列表 */}
      <h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text)' }}>
        <i className="fa-regular fa-comments mr-2" style={{ color: 'var(--primary-dark)' }} />
        评论 ({comments.length})
      </h3>
      {comments.length === 0 ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <i className="fa-regular fa-comment-dots text-3xl mb-2 block opacity-40" />
          <p className="text-sm">暂无评论，快来抢沙发！</p>
        </div>
      ) : (
        <div className="space-y-3 mb-5 miui-list-enter">
          {comments.map((c, i) => (
            <div key={c.id} className="card" style={{ padding: '1rem', animationDelay: `${i * 0.05}s` }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
                  {c.user?.username?.[0]?.toUpperCase() || '?'}
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{c.user?.username || '匿名'}</span>
                {c.user?.role === 'admin' && <OfficialBadge className="ml-1.5" />}
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
            maxLength={5000}
            disabled={publishing}
          />
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs" style={{ color: commentText.length > 4500 ? 'var(--danger)' : 'var(--text-muted)' }}>
              {commentText.length}/5000
            </span>
          </div>
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
