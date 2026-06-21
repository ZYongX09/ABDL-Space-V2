import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.abdl-space.top';

export default function MastodonProfile() {
  const { username } = useParams();
  const [profileUrl, setProfileUrl] = useState('');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!username) return;
    fetch(`${API_BASE}/api/users/search?q=${encodeURIComponent(username)}&limit=1`, {
      credentials: 'include'
    })
      .then(r => r.json())
      .then(data => {
        const users = data.users || data;
        if (Array.isArray(users) && users.length > 0 && users[0].id) {
          const url = `/user/${users[0].id}`;
          setProfileUrl(url);
          // Try auto-redirect once
          window.location.href = url;
        } else {
          setError('用户不存在');
        }
      })
      .catch(() => setError('查找用户失败'));
  }, [username]);

  const handleCopy = () => {
    navigator.clipboard.writeText(window.location.origin + profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
    <div style={{ textAlign: 'center', padding: '4rem 1rem', maxWidth: 480, margin: '0 auto' }}>
      <div className="card" style={{ padding: '2rem' }}>
        <i className="fa-solid fa-spinner fa-spin text-2xl mb-4" style={{ color: 'var(--primary)' }} />
        <h2 style={{ marginBottom: 8 }}>正在跳转 @{username} 的个人主页...</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
          如果页面没有自动跳转，请点击下方按钮或复制链接手动访问
        </p>

        {profileUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
            <a
              href={profileUrl}
              className="btn btn-primary"
              style={{ minWidth: 200 }}
            >
              <i className="fa-solid fa-arrow-up-right-from-square mr-2" />
              点击访问个人主页
            </a>
            <button
              className="btn btn-outline"
              style={{ minWidth: 200 }}
              onClick={handleCopy}
            >
              <i className={`fa-solid ${copied ? 'fa-check' : 'fa-copy'} mr-2`} />
              {copied ? '已复制链接' : '复制链接'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
