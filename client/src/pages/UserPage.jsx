import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { Spinner } from '../components/Feedback';
import { useToast } from '../contexts/ToastContext';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export default function UserPage() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        if (API_BASE) {
          const res = await fetch(`${API_BASE}/api/users/${id}`);
          const data = await res.json();
          setUser(data.user || data);
        } else {
          const users = JSON.parse(localStorage.getItem('abdl_users') || '{}');
          const u = Object.values(users).find(uu => uu.id === Number(id));
          if (u) setUser({ ...u, password: undefined });
          else throw new Error('用户不存在');
        }
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <Spinner />;
  if (!user) return <div className="empty-state"><h3>用户不存在</h3></div>;

  return (
    <PageLayout hero={{ icon: 'fa-user', title: user.username }}>
      <div className="card">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
            {user.username?.[0]?.toUpperCase()}
          </div>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{user.username}</h3>
            <span className="tag">{user.role === 'admin' ? '管理员' : '用户'}</span>
          </div>
        </div>
        {user.bio && <p className="text-sm mb-2" style={{ color: 'var(--text-light)' }}>{user.bio}</p>}
        {user.region && <p className="text-sm" style={{ color: 'var(--text-muted)' }}><i className="fa-solid fa-location-dot mr-1" />{user.region}</p>}
      </div>
    </PageLayout>
  );
}
