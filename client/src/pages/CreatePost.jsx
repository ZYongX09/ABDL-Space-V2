import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
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
    <>
    <MobileHeader title="发帖" />
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

        <div className="flex gap-3 justify-end mt-4">
          <button
            className="btn btn-outline"
            onClick={() => navigate('/')}
            disabled={publishing}
          >
            取消
          </button>
          <button
            className="btn btn-primary"
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
