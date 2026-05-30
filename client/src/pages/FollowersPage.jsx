import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import { LoadingSkeleton, EmptyState } from '../components/Feedback';
import OfficialBadge from '../components/OfficialBadge';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { followsAPI } from '../api';

export default function FollowersPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user: currentUser } = useAuth();

  const isFollowingTab = location.pathname.endsWith('/following');
  const [tab, setTab] = useState(isFollowingTab ? 'following' : 'followers');
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [followMap, setFollowMap] = useState({});
  const [followLoading, setFollowLoading] = useState({});

  useEffect(() => {
    setTab(isFollowingTab ? 'following' : 'followers');
  }, [isFollowingTab]);

  useEffect(() => {
    setLoading(true);
    setUsers([]);
    setFollowMap({});
    const fetchFn = tab === 'followers' ? followsAPI.followers : followsAPI.following;
    fetchFn(id)
      .then(async data => {
        const fetchedUsers = data.users || [];
        setUsers(fetchedUsers);
        setTotal(data.total || 0);
        // 批量初始化关注状态
        if (currentUser && fetchedUsers.length > 0) {
          const entries = await Promise.all(
            fetchedUsers
              .filter(u => String(u.id) !== String(currentUser.id))
              .map(async u => {
                try {
                  const s = await followsAPI.status(u.id);
                  return [u.id, s.following || s.mutual || false];
                } catch {
                  return [u.id, false];
                }
              })
          );
          setFollowMap(Object.fromEntries(entries));
        }
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [id, tab, currentUser]);

  const handleTabChange = (newTab) => {
    navigate(`/user/${id}/${newTab}`, { replace: true });
  };

  const handleFollow = async (userId) => {
    if (!currentUser) { toast.error('请先登录'); return; }
    const wasFollowing = followMap[userId];
    // 乐观更新
    setFollowMap(prev => ({ ...prev, [userId]: !wasFollowing }));
    setFollowLoading(prev => ({ ...prev, [userId]: true }));
    try {
      if (wasFollowing) {
        await followsAPI.unfollow(userId);
      } else {
        await followsAPI.follow(userId);
      }
    } catch (e) {
      // 回滚
      setFollowMap(prev => ({ ...prev, [userId]: wasFollowing }));
      toast.error(e.message);
    } finally {
      setFollowLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  return (
    <>
      <PageLayout hero={{ icon: tab === 'followers' ? 'fa-users' : 'fa-user-plus', title: tab === 'followers' ? '粉丝' : '关注', subtitle: total > 0 ? `${total} 人` : undefined }}>
        {/* Tab 切换 */}
        <div className="flex gap-2 mb-4">
          <button
            className={`btn btn-sm ${tab === 'followers' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => handleTabChange('followers')}
          >
            粉丝
          </button>
          <button
            className={`btn btn-sm ${tab === 'following' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => handleTabChange('following')}
          >
            关注
          </button>
        </div>

        {loading ? (
          <LoadingSkeleton count={5} height={64} />
        ) : users.length === 0 ? (
          <EmptyState
            icon={tab === 'followers' ? 'fa-user-slash' : 'fa-user-plus'}
            title={tab === 'followers' ? '暂无粉丝' : '暂无关注'}
            description={tab === 'followers' ? '还没有人关注 TA' : 'TA 还没有关注任何人'}
          />
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="card flex items-center gap-3" style={{ padding: '0.75rem 1rem' }}>
                <Link to={`/user/${u.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}
                  >
                    {u.avatar
                      ? <img src={u.avatar} alt={u.username} className="w-full h-full rounded-full object-cover" />
                      : u.username?.[0]?.toUpperCase()
                    }
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{u.username}</span>
                      {u.role === 'admin' && <OfficialBadge />}
                    </div>
                  </div>
                </Link>
                {currentUser && String(currentUser.id) !== String(u.id) && (
                  <button
                    className={`btn btn-sm ${followMap[u.id] ? 'btn-outline' : 'btn-primary'}`}
                    onClick={() => handleFollow(u.id)}
                    disabled={followLoading[u.id]}
                    style={followMap[u.id] ? { borderColor: 'var(--border)', color: 'var(--text-light)', minWidth: '70px' } : { minWidth: '70px' }}
                  >
                    {followLoading[u.id] ? <i className="fa-solid fa-spinner fa-spin" /> : (followMap[u.id] ? '已关注' : '关注')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </PageLayout>
    </>
  );
}
