import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
import { Spinner } from '../components/Feedback';
import OfficialBadge from '../components/OfficialBadge';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { authAPI, followsAPI } from '../api';

export default function UserPage() {
  const { id } = useParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [followStatus, setFollowStatus] = useState({ following: false, follower: false, mutual: false });
  const [followLoading, setFollowLoading] = useState(false);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const isSelf = currentUser && String(currentUser.id) === String(id);

  useEffect(() => {
    (async () => {
      try {
        const data = await authAPI.getUser(id);
        setUser(data.user || data);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [statusData, followersData, followingData] = await Promise.all([
          followsAPI.status(id),
          followsAPI.followers(id),
          followsAPI.following(id),
        ]);
        setFollowStatus(statusData);
        setCounts({ followers: followersData.total || 0, following: followingData.total || 0 });
      } catch {}
    })();
  }, [id]);

  const handleFollow = async () => {
    if (!currentUser) { toast.error('请先登录'); return; }
    setFollowLoading(true);
    try {
      if (followStatus.following) {
        await followsAPI.unfollow(id);
        setFollowStatus(prev => ({ ...prev, following: false, mutual: false }));
        setCounts(prev => ({ ...prev, followers: Math.max(0, prev.followers - 1) }));
      } else {
        const res = await followsAPI.follow(id);
        setFollowStatus(prev => ({ ...prev, following: true, mutual: res.mutual || false }));
        setCounts(prev => ({ ...prev, followers: prev.followers + 1 }));
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) return <Spinner />;
  if (!user) return <div className="empty-state"><h3>用户不存在</h3></div>;

  return (
    <>
    <MobileHeader title={user?.username || '用户'} back />
    <PageLayout hero={{ icon: 'fa-user', title: user.username }}>
      <div className="card">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
            {user.avatar
              ? <img src={user.avatar} alt={user.username} className="w-full h-full rounded-full object-cover" />
              : user.username?.[0]?.toUpperCase()
            }
          </div>
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{user.username}</h3>
            {user.role === 'admin' && <OfficialBadge />}
            {user.role !== 'admin' && <span className="tag">用户</span>}
            {followStatus.mutual && (
              <span className="tag" style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', marginLeft: '6px' }}>
                <i className="fa-solid fa-arrows-rotate mr-1" style={{ fontSize: '10px' }} />互相关注
              </span>
            )}
          </div>
        </div>

        {/* 关注按钮 & 计数 */}
        <div className="flex items-center gap-4 mb-4">
          {!isSelf && (
            <button
              className={`btn btn-sm ${followStatus.following ? 'btn-outline' : 'btn-primary'}`}
              onClick={handleFollow}
              disabled={followLoading}
              style={followStatus.following ? { borderColor: 'var(--border)', color: 'var(--text-light)' } : {}}
            >
              {followLoading ? <i className="fa-solid fa-spinner fa-spin" /> : (
                followStatus.following ? '已关注' : '关注'
              )}
            </button>
          )}
          <Link
            to={`/user/${id}/followers`}
            className="text-sm hover:underline"
            style={{ color: 'var(--text-light)' }}
          >
            <strong style={{ color: 'var(--text)' }}>{counts.followers}</strong> 粉丝
          </Link>
          <Link
            to={`/user/${id}/following`}
            className="text-sm hover:underline"
            style={{ color: 'var(--text-light)' }}
          >
            <strong style={{ color: 'var(--text)' }}>{counts.following}</strong> 关注
          </Link>
        </div>

        {user.bio && <p className="text-sm mb-2" style={{ color: 'var(--text-light)' }}>{user.bio}</p>}
        {user.region && <p className="text-sm" style={{ color: 'var(--text-muted)' }}><i className="fa-solid fa-location-dot mr-1" />{user.region}</p>}
      </div>
    </PageLayout>
    </>
  );
}
