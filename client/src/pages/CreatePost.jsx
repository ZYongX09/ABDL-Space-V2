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
  const [publishing, setPublishing] = useState(false);
  const imgRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { trigger, VerifyModal } = useVerifyModal();

  const doPost = async () => {
    if (!content.trim() && !imgRef.current?.hasPending()) return;
    setPublishing(true);
    try {
      let imageUrls = [];
      if (imgRef.current?.hasPending()) {
        toast.info('正在上传图片...');
        imageUrls = await imgRef.current.uploadAll();
      }
      const result = await forumAPI.create({
        content: content.trim(),
        images: imageUrls.length > 0 ? imageUrls : undefined,
      });
      toast.success(imageUrls.length > 0 ? '图片上传完成，发布成功！' : '发布成功');
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
    <PageLayout hero={{ icon: 'fa-pen', title: '发帖', subtitle: '分享你的 ABDL 生活' }}>
      <div className="card animate-fade-in-up" style={{ padding: '1.25rem' }}>
        <textarea
          className="form-control mb-2"
          placeholder="分享点什么..."
          value={content}
          onChange={e => setContent(e.target.value.slice(0, MAX_CHARS))}
          rows={6}
          disabled={publishing}
          autoFocus
        />
        <div className="flex justify-between items-center mb-2">
          <span
            className="text-xs"
            style={{ color: content.length > MAX_CHARS * 0.9 ? 'var(--danger)' : 'var(--text-muted)' }}
          >
            {content.length} / {MAX_CHARS}
          </span>
          <ImageUploader ref={imgRef} max={4} onError={msg => toast.error(msg)} />
        </div>
        <div className="flex gap-2 justify-end mt-3">
          <button
            className="btn btn-outline btn-sm"
            onClick={() => navigate('/')}
            disabled={publishing}
          >
            取消
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handlePost}
            disabled={(!content.trim() && !imgRef.current?.hasPending()) || publishing || content.length > MAX_CHARS}
          >
            {publishing ? (
              <><i className="fa-solid fa-spinner fa-spin mr-1" />发布中...</>
            ) : (
              <><i className="fa-solid fa-paper-plane mr-1" />发布</>
            )}
          </button>
        </div>
      </div>
      {VerifyModal}
    </PageLayout>
  );
}
