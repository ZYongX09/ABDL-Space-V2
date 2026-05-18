import { useState, useRef, useImperativeHandle, forwardRef } from 'react';

// 图床 API（通过后端代理，API Key 不暴露到前端）
const API_BASE = import.meta.env.VITE_API_BASE || '';

// Cloudflare Workers 免费版限制
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_EXTS = ALLOWED_TYPES.map(t => t.split('/')[1].toUpperCase()).join(', ');
const UPLOAD_TIMEOUT = 30000; // 30秒超时

function validateFile(file) {
  if (!ALLOWED_TYPES.includes(file.type)) return `不支持 ${file.name}，仅允许 ${ALLOWED_EXTS}`;
  if (file.size > MAX_FILE_SIZE) return `${file.name} 超过 5MB 限制`;
  return null;
}

// 创建本地预览 URL
function createPreview(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ file, preview: reader.result, name: file.name, size: file.size });
    reader.readAsDataURL(file);
  });
}

// 上传单张图片（通过后端代理）
async function uploadImage(file) {
  // 离线模式：返回 base64
  if (!API_BASE) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  const form = new FormData();
  form.append('file', file);
  const token = localStorage.getItem('token');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT);

  try {
    const res = await fetch(`${API_BASE}/api/images/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '上传失败');
    return data.url;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      throw new Error('上传超时，可能原因：网络不稳定或图片过大');
    }
    throw e;
  }
}

/**
 * ImageUploader
 * 选择图片后仅本地预览，不自动上传
 * 调用 uploadAll() 返回已上传的 URL 数组
 */
const ImageUploader = forwardRef(function ImageUploader({ max = 4, onError }, ref) {
  const [previews, setPreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const fileRef = useRef(null);

  const addFiles = async (files) => {
    const fileList = Array.from(files).filter(f => f.type.startsWith('image/'));
    const slots = max - previews.length;
    if (slots <= 0) return;

    const toAdd = fileList.slice(0, slots);
    const errors = [];

    for (const f of toAdd) {
      const err = validateFile(f);
      if (err) { errors.push(err); continue; }
      const item = await createPreview(f);
      setPreviews(prev => [...prev, item]);
    }

    if (errors.length > 0) onError?.(errors.join('\n'));
    if (fileList.length > slots) onError?.(`最多选择 ${max} 张图片`);
  };

  const remove = (idx) => {
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  // 上传全部待上传图片，返回 URL 数组
  const uploadAll = async () => {
    if (previews.length === 0) return [];
    setUploading(true);
    setProgress('正在上传图片...');
    const urls = [];
    try {
      for (let i = 0; i < previews.length; i++) {
        setProgress(`正在上传图片 ${i + 1}/${previews.length}...`);
        const url = await uploadImage(previews[i].file);
        urls.push(url);
      }
      setProgress('图片上传完成');
      return urls;
    } catch (e) {
      setProgress('');
      throw e;
    } finally {
      setUploading(false);
    }
  };

  // 暴露给父组件
  useImperativeHandle(ref, () => ({
    uploadAll,
    hasPending: () => previews.length > 0,
    isUploading: () => uploading,
    clear: () => { setPreviews([]); setProgress(''); },
  }));

  const handleDrop = (e) => {
    e.preventDefault();
    if (!uploading) addFiles(e.dataTransfer.files);
  };

  return (
    <div className="img-uploader">
      {previews.length > 0 && (
        <div className="img-preview-grid">
          {previews.map((item, i) => (
            <div key={i} className="img-preview-item">
              <img src={item.preview} alt="" />
              {!uploading && (
                <button className="img-remove" onClick={() => remove(i)}>
                  <i className="fa-solid fa-xmark" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {uploading && (
        <div className="flex items-center gap-2 text-xs mt-1" style={{ color: 'var(--primary-dark)' }}>
          <div className="cap-loading-ring" style={{ width: 14, height: 14, borderWidth: 2 }} />
          {progress}
        </div>
      )}

      {previews.length < max && !uploading && (
        <>
          <div
            className="img-drop-zone"
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
          >
            <i className="fa-regular fa-image" />
            <span>添加图片</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{previews.length}/{max}</span>
          </div>
          <div className="img-upload-warning">
            <i className="fa-solid fa-triangle-exclamation" />
            <span>禁止上传违法、侵权、色情等违规内容，违者将封禁账号</span>
          </div>
        </>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={e => { addFiles(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
});

export default ImageUploader;
