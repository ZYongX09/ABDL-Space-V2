import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { forumAPI } from '../api';

const MAX_CHARS = 5000;

/**
 * 首页内嵌发帖区 — 参考 x.com 布局
 * 头像左侧，输入区+工具栏右侧
 */
export default function InlineComposer({ onPostCreated }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [imageUrls, setImageUrls] = useState([]);
  const fileInputRef = useRef(null);

  if (!user) {
    return (
      <div className="inline-composer inline-composer-guest" style={{
        padding: '16px', display: 'flex', alignItems: 'center', gap: '12px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
          <i className="fa-solid fa-user" style={{ fontSize: '14px' }} />
        </div>
        <button
          className="form-control"
          onClick={() => navigate('/login')}
          style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--text-muted)', flex: 1 }}
        >
          登录后发帖...
        </button>
      </div>
    );
  }

  const handlePost = async () => {
    if (!content.trim() && imageUrls.length === 0) return;
    setPublishing(true);
    try {
      const images = imageUrls.map(url => ({ url, is_nsfw: false }));
      const result = await forumAPI.create({
        content: content.trim(),
        images: images.length > 0 ? images : undefined,
      });
      toast.success('发布成功');
      setContent('');
      setImageUrls([]);
      onPostCreated?.(result);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPublishing(false);
    }
  };

  const handleImageUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (imageUrls.length + files.length > 4) {
      toast.error('最多上传 4 张图片');
      return;
    }
    const API_BASE = import.meta.env.VITE_API_BASE || '';
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch(`${API_BASE}/api/images/upload`, {
          method: 'POST',
          credentials: 'include',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '上传失败');
        if (data.url) {
          setImageUrls(prev => [...prev, data.url]);
        }
      } catch (err) {
        toast.error(err.message || '图片上传失败');
      }
    }
    e.target.value = '';
  };

  return (
    <div className="inline-composer" style={{
      display: 'flex', gap: '12px', padding: '16px',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* 头像 */}
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
        {user.avatar
          ? <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
          : user.username?.[0]?.toUpperCase() || '?'
        }
      </div>

      {/* 右侧 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* 输入框 */}
        <textarea
          className="form-control"
          placeholder="有什么新鲜事？"
          value={content}
          onChange={e => setContent(e.target.value.slice(0, MAX_CHARS))}
          rows={2}
          disabled={publishing}
          style={{ resize: 'none', border: 'none', background: 'transparent', padding: '8px 0', fontSize: '15px', minHeight: '40px' }}
        />

        {/* 图片预览 */}
        {imageUrls.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-2 mb-2">
            {imageUrls.map((url, i) => (
              <div key={i} className="relative" style={{ width: '60px', height: '60px' }}>
                <img src={url} alt="" className="w-full h-full object-cover rounded" style={{ border: '1px solid var(--border)' }} />
                <button
                  onClick={() => setImageUrls(prev => prev.filter((_, j) => j !== i))}
                  style={{
                    position: 'absolute', top: '-4px', right: '-4px',
                    width: '18px', height: '18px', borderRadius: '50%',
                    background: 'var(--danger)', color: '#fff', border: 'none',
                    cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 工具栏 */}
        <div className="flex items-center gap-2 mt-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: '16px', padding: '6px' }}
            title="上传图片"
          >
            <i className="fa-regular fa-image" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />

          {/* 字数统计 */}
          <span className="text-xs" style={{
            color: content.length > MAX_CHARS * 0.9 ? 'var(--danger)' : 'var(--text-muted)',
            marginLeft: 'auto',
          }}>
            {content.length > 0 && `${content.length}/${MAX_CHARS}`}
          </span>

          {/* 发帖按钮 */}
          <button
            className="btn btn-primary btn-sm miui-press"
            onClick={handlePost}
            disabled={(!content.trim() && imageUrls.length === 0) || publishing || content.length > MAX_CHARS}
            style={{ marginLeft: '8px' }}
          >
            {publishing
              ? <><i className="fa-solid fa-spinner fa-spin mr-1" />发布中</>
              : <><i className="fa-solid fa-paper-plane mr-1" />发帖</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
