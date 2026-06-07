import { memo, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ImageGrid from './ImageGrid';
import RichContent from './RichContent';
import OfficialBadge from './OfficialBadge';
import ReportModal from './ReportModal';
import RepostModal from './RepostModal';
import { forumAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

/** 格式化数字：10000 → 1万 */
function formatCount(n) {
  if (n >= 100000) return (n / 10000).toFixed(0) + '万';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
}

/** 相对时间 */
function relativeTime(dateStr) {
  const now = Date.now();
  const d = new Date(dateStr + 'Z');
  const diff = now - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}秒`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}分钟`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}天`;
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

function PostCardInner({ post, onLike, onFollow, followMap, compact = false }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [reportTarget, setReportTarget] = useState(null);
  const [repostTarget, setRepostTarget] = useState(null);

  const isRepost = !!post.repost_id && post.repost;
  const repostUser = isRepost ? post.user : null;
  const displayPost = isRepost ? post.repost : post;

  // 整张卡片点击 → 跳详情。但操作栏/原帖/用户名 Link 不被劫持。
  const handleCardClick = useCallback((e) => {
    if (e.defaultPrevented) return;
    if (e.target.closest('a, button, [data-no-card-nav]')) return;
    navigate(`/forum/${post.id}`);
  }, [navigate, post.id]);

  // 点击内嵌原帖区域 → 跳原帖详情，阻止冒泡到外层卡片
  const handleRepostEmbedClick = useCallback((e) => {
    e.stopPropagation();
    if (e.target.closest('a, button, [data-no-card-nav]')) return;
    if (post.repost_id) navigate(`/forum/${post.repost_id}`);
  }, [navigate, post.repost_id]);

  const handleLike = (e) => {
    e.stopPropagation();
    if (!user) { toast.error('请先登录'); return; }
    onLike(post.id);
  };

  const handleRepost = async (comment) => {
    try {
      await forumAPI.repost(post.id, comment);
      toast.success('转发成功');
      setRepostTarget(null);
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <div
        className={`card miui-hover-lift ${post.pinned ? 'post-pinned' : ''} ${post.is_announcement ? 'post-announcement' : ''}`}
        style={{ padding: '1.25rem', cursor: 'pointer' }}
        onClick={handleCardClick}
      >
        {/* 公告标签 */}
        {post.is_announcement && (
          <div className="post-announcement-tag">
            <i className="fa-solid fa-bullhorn" /> 公告
          </div>
        )}
        {/* 置顶标签 */}
        {post.pinned && (
          <div className="post-pinned-tag">
            <i className="fa-solid fa-thumbtack" /> 置顶
          </div>
        )}

        {/* 转发帖子：转发者头像+用户名+时间 */}
        {isRepost && (
          <>
            {/* 转发者信息行（和普通帖子一样） */}
            <div className="flex items-center gap-3" style={{ marginBottom: '8px' }}>
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden"
                style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}
              >
                {repostUser.avatar
                  ? <img src={repostUser.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                  : repostUser.username?.[0]?.toUpperCase() || '?'
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link to={`/user/${repostUser.id}`} onClick={e => e.stopPropagation()} className="font-semibold hover:underline whitespace-nowrap" style={{ color: 'var(--text)', fontSize: '14px' }}>
                    {repostUser.username}
                  </Link>
                  {repostUser.role === 'admin' && <OfficialBadge className="flex-shrink-0" />}
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>·</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{relativeTime(post.created_at)}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginLeft: '4px' }}>
                    <i className="fa-solid fa-retweet" /> 转发
                  </span>
                </div>
              </div>
            </div>

            {/* 转发者的评论（在原帖卡片上面） */}
            {post.content && (
              <p className="whitespace-pre-wrap break-words" style={{ fontSize: '15px', marginBottom: '12px' }}>
                <RichContent text={post.content} />
              </p>
            )}

            {/* 原帖嵌套卡片 — 点击独立跳原帖详情 */}
            <div
              className="post-repost-embed"
              role="link"
              tabIndex={0}
              onClick={handleRepostEmbedClick}
              onKeyDown={e => { if (e.key === 'Enter') handleRepostEmbedClick(e); }}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '12px',
                cursor: 'pointer',
                transition: 'background 0.2s, border-color 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover-bg)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              title="点击查看原帖"
            >
              <PostContent post={displayPost} compact followMap={followMap} onFollow={onFollow} mini onInnerClick={e => e.stopPropagation()} />
            </div>
          </>
        )}

        {/* 非转发帖子的完整内容 */}
        {!isRepost && <PostContent post={post} compact={compact} followMap={followMap} onFollow={onFollow} onInnerClick={e => e.stopPropagation()} />}

        {/* 操作栏 — stopPropagation 避免触发卡片点击 */}
        <div
          className="post-actions"
          data-no-card-nav
          onClick={e => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px' }}
        >
          <button
            className={`miui-like ${post.has_liked ? 'liked' : ''}`}
            style={{ color: post.has_liked ? 'var(--danger)' : 'var(--text-light)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            onClick={handleLike}
          >
            <i className={`${post.has_liked ? 'fa-solid' : 'fa-regular'} fa-heart`} />
            {post.like_count > 0 && <span>{formatCount(post.like_count)}</span>}
          </button>

          <Link to={`/forum/${post.id}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-light)', textDecoration: 'none', fontSize: '13px' }}>
            <i className="fa-regular fa-comment" />
            {post.comment_count > 0 && <span>{formatCount(post.comment_count)}</span>}
          </Link>

          {/* 转发按钮 */}
          <button
            style={{ color: 'var(--text-light)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            onClick={e => {
              e.stopPropagation();
              if (!user) { toast.error('请先登录'); return; }
              setRepostTarget(post);
            }}
            title="转发"
          >
            <i className="fa-solid fa-retweet" />
          </button>

          {/* 举报 */}
          <button
            style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 'auto', fontSize: '13px' }}
            onClick={e => {
              e.stopPropagation();
              if (!user) { toast.error('请先登录'); return; }
              setReportTarget({ type: 'post', id: post.id });
            }}
            title="举报"
          >
            <i className="fa-solid fa-shield-halved" />
          </button>
        </div>
      </div>

      {reportTarget && (
        <ReportModal targetType={reportTarget.type} targetId={reportTarget.id} onClose={() => setReportTarget(null)} />
      )}
      {repostTarget && (
        <RepostModal post={repostTarget} onRepost={handleRepost} onClose={() => setRepostTarget(null)} />
      )}
    </>
  );
}

/** 帖子内容区域（头像 + 用户名 + 正文 + 图片） */
function PostContent({ post, compact, followMap, onFollow, mini = false, onInnerClick }) {
  const { user } = useAuth();
  const avatarSize = mini ? 24 : 40;
  // mini=true 时本组件是内嵌原帖的展示，不包自己的 Link（外层已包）
  const stop = onInnerClick;
  // 文字折叠 — 仅非 mini 模式生效；mini 已有 5 行截断
  const [expanded, setExpanded] = useState(false);
  const COLLAPSE_CHARS = 280;
  const shouldCollapse = !mini && !!post.content && post.content.length > COLLAPSE_CHARS;
  const displayContent = shouldCollapse && !expanded
    ? post.content.slice(0, COLLAPSE_CHARS)
    : (post.content || '');

  return (
    <>
      {/* 用户行 */}
      <div className="flex items-center gap-3" style={{ marginBottom: mini ? '4px' : '8px' }}>
        <div
          className="rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden"
          style={{ width: avatarSize, height: avatarSize, background: 'var(--primary-light)', color: 'var(--primary-dark)', fontSize: mini ? '10px' : '14px' }}
        >
          {post.user?.avatar
            ? <img src={post.user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
            : post.user?.username?.[0]?.toUpperCase() || '?'
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link to={`/user/${post.user?.id}`} onClick={stop} className="font-semibold hover:underline whitespace-nowrap" style={{ color: 'var(--text)', fontSize: mini ? '13px' : '14px' }}>
              {post.user?.username || '匿名'}
            </Link>
            {post.user?.role === 'admin' && <OfficialBadge className="flex-shrink-0" />}
            {!mini && (
              <>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>·</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{relativeTime(post.created_at)}</span>
              </>
            )}
            {user && post.user?.id && String(user.id) !== String(post.user.id) && !mini && (
              <button
                className={`btn btn-xs ${followMap?.[post.user.id] ? 'btn-outline' : 'btn-primary'}`}
                onClick={(e) => { e.stopPropagation(); onFollow?.(post.user.id, e); }}
                style={{
                  fontSize: '11px', padding: '1px 8px', lineHeight: '18px',
                  ...(followMap?.[post.user.id] ? { borderColor: 'var(--border)', color: 'var(--text-light)' } : {}),
                }}
              >
                {followMap?.[post.user.id] ? '已关注' : '关注'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 正文 */}
      {mini ? (
        <p className="whitespace-pre-wrap break-words" style={{ fontSize: '14px', color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          <RichContent text={post.content} />
        </p>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words" style={{ fontSize: '15px', color: 'var(--text)' }}>
            <RichContent text={displayContent} />
            {shouldCollapse && !expanded && (
              <span style={{ color: 'var(--text-muted)' }}>…</span>
            )}
          </p>
          {shouldCollapse && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
              style={{
                marginTop: 4, padding: 0, background: 'none', border: 'none',
                color: 'var(--primary-dark)', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontFamily: 'inherit',
              }}
            >
              {expanded ? '收起' : '展开全部'}
              <i className={`fa-solid fa-chevron-${expanded ? 'up' : 'down'}`} style={{ fontSize: '10px' }} />
            </button>
          )}
        </>
      )}

      {/* 图片 */}
      {post.images && post.images.length > 0 && (
        <div style={{ maxWidth: mini ? 200 : undefined, marginTop: 8 }}>
          <ImageGrid images={post.images} />
        </div>
      )}

      {/* NSFW */}
      {post.has_nsfw === 1 && (
        <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: 'var(--warning)' }}>
          <i className="fa-solid fa-triangle-exclamation" />
          <span>该帖子包含敏感内容</span>
        </div>
      )}
    </>
  );
}

export default memo(PostCardInner);
