const IMGBED_UPLOAD_URL = 'https://img.abdl-space.top/upload'
const IMGBED_UPLOAD_KEY = 'ABDL_IMGBED_UPLOAD_KEY' // provided by API on backend side

export async function uploadImage(file) {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(IMGBED_UPLOAD_URL, {
    method: 'POST',
    headers: {
      ...(window.__ABDL_IMGBED_KEY
        ? { Authorization: `Bearer ${window.__ABDL_IMGBED_KEY}` }
        : {}),
    },
    body: formData,
  })

  if (!res.ok) throw new Error(`上传失败 (${res.status})`)

  const data = await res.json()
  // 支持多种返回格式
  return data.url || data.src || data.path || data.file?.url || data.file?.src || JSON.stringify(data)
}