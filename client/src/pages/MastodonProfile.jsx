import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authAPI } from '../api';

/**
 * Mastodon-compatible /@:username route handler
 * Resolves username to user ID, then redirects to /user/:id
 */
export default function MastodonProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!username) return;
    (async () => {
      try {
        const data = await authAPI.getUser(encodeURIComponent(username));
        const user = data.user || data;
        if (user?.id) {
          navigate(`/user/${user.id}`, { replace: true });
        } else {
          setError('用户不存在');
        }
      } catch (e) {
        setError(e.message || '用户不存在');
      }
    })();
  }, [username, navigate]);

  if (error) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <i className="fa-solid fa-user-slash" style={{ fontSize: 48, color: 'var(--text-muted)', marginBottom: 16, display: 'block' }} />
        <h2 style={{ marginBottom: 8 }}>用户不存在</h2>
        <p style={{ color: 'var(--text-muted)' }}>@{username} 不是一个有效用户</p>
        <a href="/" style={{ color: 'var(--primary)', marginTop: 16, display: 'inline-block' }}>返回首页</a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
      <div className="spinner" />
    </div>
  );
}
