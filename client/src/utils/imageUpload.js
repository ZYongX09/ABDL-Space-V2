const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * 上传图片（通过后端代理，后端持有 IMGBED_UPLOAD_KEY）
 */
export async function uploadImage(file) {
  const formData = new FormData()
  formData.append('file', file)

  // 获取 auth token
  const token = localStorage.getItem('token') || '';

  const res = await fetch(`${API_BASE}/api/images/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
