import { useState } from 'react';
import RichContent from './RichContent';

/** 引用转发弹窗 */
export default function RepostModal({ post, onRepost, onClose }) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onRepost(comment.trim());
    } finally {
      setSubmitting(false);
    }
  };

  const handleDirectRepost = async () => {
    setSubmitting(true);
    try {
      await onRepost('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
      <div className="card" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '520px', maxHeight: '80vh', overflow: 'auto', padding: '20px', margin: '16px' }}>
        {/* 标题 */}
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontSize: '18px', fontWeight: 700 }}>转发帖子</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '20px' }}>
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* 评论输入 */}
        <textarea
          className="form-control"
          placeholder="说点什么..."
          value={comment}
          onChange={e => setComment(e.target.value.slice(0, 500))}
          rows={3}
          style={{ resize: 'none', marginBottom: '12px' }}
        />

        {/* 原帖预览 */}
        <div style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '12px',
          marginBottom: '16px',
          fontSize: '13px',
        }}>
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden"
              style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}
            >
              {post.user?.avatar
                ? <img src={post.user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                : post.user?.username?.[0]?.toUpperCase() || '?'
              }
            </div>
            <span className="font-semibold" style={{ fontSize: '13px' }}>{post.user?.username}</span>
          </div>
          <p style={{ color: 'var(--text)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>
            {post.content}
          </p>
          {post.images?.length > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
              <i className="fa-regular fa-image" /> {post.images.length} 张图片
            </div>
          )}
        </div>

        {/* 按钮 */}
        <div className="flex gap-3 justify-end">
          <button className="btn btn-outline" onClick={handleDirectRepost} disabled={submitting}>
            {submitting ? <i className="fa-solid fa-spinner fa-spin" /> : <><i className="fa-solid fa-retweet mr-1" />直接转发</>}
          </button>
          <button className="btn btn-primary miui-press" onClick={handleSubmit} disabled={submitting || !comment.trim()}>
            {submitting ? <i className="fa-solid fa-spinner fa-spin" /> : <><i className="fa-solid fa-paper-plane mr-1" />引用转发</>}
          </button>
        </div>
      </div>
    </div>
  );
}
