import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.abdl-space.top';

export default function AtUsernameRedirect() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!username) { setError('用户名无效'); return; }
    // Look up user by username via the search API
    fetch(`${API_BASE}/api/posts?search=${encodeURIComponent(username)}&limit=1`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        // We don't have a direct username→id lookup, so use the Mastodon-compatible API
        return fetch(`${API_BASE}/api/v1/accounts/search?q=${encodeURIComponent(username)}&limit=1`, {
          headers: { 'Authorization': 'Bearer dummy' },
          credentials: 'include'
        });
      })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0 && data[0].id) {
          navigate(`/profile/${data[0].id}`, { replace: true });
        } else {
          setError(`用户 "${username}" 不存在`);
        }
      })
      .catch(() => setError('查找用户失败'));
  }, [username, navigate]);

  if (error) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ textAlign: 'center', padding: '2rem', maxWidth: 400 }}>
          <i className="fa-solid fa-user-slash text-3xl mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="font-semibold">{error}</p>
          <a href="/" className="btn btn-primary mt-4">返回首页</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <i className="fa-solid fa-spinner fa-spin text-2xl" style={{ color: 'var(--text-muted)' }} />
    </div>
  );
}
