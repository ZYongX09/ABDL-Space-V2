const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * 上传图片（通过后端代理，后端持有 IMGBED_UPLOAD_KEY）
 */
export async function uploadImage(file) {
  // BUG-774: Validate file type and size
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('仅支持 JPG/PNG/GIF/WebP 格式');
  }
  if (file.size > MAX_SIZE) {
    throw new Error('图片大小不能超过 10MB');
  }

  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${API_BASE}/api/images/upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })

  if (!res.ok) {
    let msg = '上传失败';
    try {
      const err = await res.json();
      msg = err.error || msg;
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json()
  return data.url
}
