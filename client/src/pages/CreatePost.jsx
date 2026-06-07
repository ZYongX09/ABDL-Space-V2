import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import ImageUploader from '../components/ImageUploader';
import { useVerifyModal } from '../components/VerifyModal';
import { forumAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const MAX_CHARS = 5000;

export default function CreatePost() {
  const [content, setContent] = useState('');
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const imgRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { trigger, VerifyModal, captchaToken } = useVerifyModal();
  const isAdmin = user?.role === 'admin';

  const doPost = async () => {
    if (!content.trim() && !imgRef.current?.hasPending()) return;
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
      const result = await forumAPI.create({
        content: content.trim(),
        images: imageData.length > 0 ? imageData : undefined,
        captchaToken: captchaToken.current,
        is_announcement: isAdmin && isAnnouncement ? true : undefined,
      });
      toast.success(isAnnouncement ? '公告发布成功！' : (imageData.length > 0 ? '图片上传完成，发布成功！' : '发布成功'));
      navigate(`/forum/${result.id}`, { replace: true });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPublishing(false);
    }
  };

  const handlePost = () => {
    if (!content.trim() && !imgRef.current?.hasPending()) return;
    trigger(doPost);
  };

  return (
    <>
    <PageLayout hero={{ icon: 'fa-pen', title: '发帖', subtitle: '分享你的 ABDL 生活' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <textarea
          className="form-control"
          placeholder="分享点什么..."
          value={content}
          onChange={e => setContent(e.target.value.slice(0, MAX_CHARS))}
          rows={8}
          disabled={publishing}
          autoFocus
          style={{ minHeight: '200px', resize: 'vertical' }}
        />
        <div className="flex justify-between items-center mt-3 mb-3">
          <span
            className="text-xs"
            style={{ color: content.length > MAX_CHARS * 0.9 ? 'var(--danger)' : 'var(--text-muted)' }}
          >
            {content.length} / {MAX_CHARS}
          </span>
        </div>

        <ImageUploader ref={imgRef} max={4} onError={msg => toast.error(msg)} />

        {/* 公告开关 — 仅管理员可见 */}
        {isAdmin && (
          <div
            className="mt-4 p-3 rounded-xl flex items-center justify-between gap-3"
            style={{
              background: isAnnouncement ? 'rgba(var(--primary-rgb, 168, 216, 240), 0.1)' : 'var(--input-bg)',
              border: `1px solid ${isAnnouncement ? 'var(--primary)' : 'var(--border)'}`,
              transition: 'all 0.2s',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <i
                className="fa-solid fa-bullhorn flex-shrink-0"
                style={{ color: isAnnouncement ? 'var(--primary-dark)' : 'var(--text-muted)', fontSize: '16px' }}
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  标记为公告
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  公告会置顶、首页右侧公告卡片与公告筛选页都可见
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAnnouncement(v => !v)}
              style={{
                width: '44px', height: '24px', borderRadius: '12px',
                border: 'none', cursor: 'pointer', flexShrink: 0,
                background: isAnnouncement ? 'var(--primary)' : 'var(--border)',
                position: 'relative', transition: 'background 0.2s',
              }}
              aria-label="公告开关"
            >
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%',
                background: 'white', position: 'absolute', top: '2px',
                left: isAnnouncement ? '22px' : '2px',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>
        )}

        <div className="flex gap-3 justify-end mt-4">
          <button
            className="btn btn-outline"
            onClick={() => {
              if ((content.trim() || imgRef.current?.hasPending()) && !confirm('有未保存的内容，确定离开吗？')) return;
              navigate('/');
            }}
            disabled={publishing}
          >
            取消
          </button>
          <button
            className="btn btn-primary miui-press"
            onClick={handlePost}
            disabled={(!content.trim() && !imgRef.current?.hasPending()) || publishing || content.length > MAX_CHARS}
          >
            {publishing ? (
              <><i className="fa-solid fa-spinner fa-spin mr-1.5" />发布中...</>
            ) : (
              <><i className="fa-solid fa-paper-plane mr-1.5" />发布</>
            )}
          </button>
        </div>
      </div>
      {VerifyModal}
    </PageLayout>
    </>
  );
}
