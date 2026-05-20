/**
 * ProfilePageV2 — 移动端第一视角个人主页（独立新设计）
 * 
 * ⚠️ 这是一个独立文件，不影响原项目任何代码。
 * 如需迁移，将此文件引入路由即可。
 * 
 * 依赖项目已有的：
 * - CSS 变量（--primary, --text, --bg 等）
 * - api.js（forumAPI, usersAPI）
 * - AuthContext（useAuth）
 * - Font Awesome 6 图标
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { forumAPI, followsAPI, authAPI } from '../api';
import OfficialBadge from '../components/OfficialBadge';
import NsfwGuard from '../components/NsfwGuard';
import { LoadingSkeleton } from '../components/Feedback';

// ============================================================
// 样式常量
// ============================================================
const S = {
  // 页面容器
  page: {
    minHeight: '100vh',
    background: 'var(--bg)',
    fontFamily: 'var(--font)',
    paddingBottom: '80px',
    margin: '-72px -20px 0', // 抵消 app-main-content padding-top(48px) + 容器 py-6(24px) + px-5
    paddingTop: '48px', // 给 MobileHeader 留空间
  },

  // 1. 顶部标题栏
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px 8px',
  },
  topTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--text)',
    letterSpacing: '-0.3px',
  },
  settingsBtn: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    border: 'none',
    background: 'var(--bg-card)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    color: 'var(--text-light)',
    fontSize: '15px',
    transition: 'all 0.2s',
  },

  // 2. 用户信息核心区
  userCore: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px 20px 0',
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: '14px',
  },
  avatar: {
    width: '88px',
    height: '88px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '3px solid var(--bg-card)',
    boxShadow: '0 4px 20px rgba(168, 216, 240, 0.35)',
  },
  avatarFallback: {
    width: '88px',
    height: '88px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--primary-light), var(--accent))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    fontWeight: 700,
    color: 'var(--primary-dark)',
    border: '3px solid var(--bg-card)',
    boxShadow: '0 4px 20px rgba(168, 216, 240, 0.35)',
  },
  username: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  bio: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    marginBottom: '20px',
    textAlign: 'center',
    maxWidth: '280px',
    lineHeight: '1.5',
  },

  // 数据指标栏
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0',
    width: '100%',
    maxWidth: '320px',
    background: 'var(--bg-card)',
    borderRadius: '16px',
    padding: '14px 0',
    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
  },
  statItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  statNum: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--text)',
    lineHeight: 1,
  },
  statLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
  statDivider: {
    width: '1px',
    height: '28px',
    background: 'var(--border)',
  },

  // 3. 简介卡片
  infoCard: {
    margin: '16px 16px 0',
    padding: '16px',
    background: 'var(--bg-card)',
    borderRadius: '16px',
    boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
  },
  infoCardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  tagsWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  tagNeutral: {
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    background: 'var(--input-bg)',
    color: 'var(--text-light)',
    border: 'none',
  },
  tagColored: (bg, color) => ({
    padding: '5px 12px',
    borderRadius: '20px',
    fontSize: '12px',
    background: bg,
    color: color,
    border: 'none',
  }),

  // 4. 药丸形标签栏
  tabBar: {
    display: 'flex',
    margin: '16px 16px 0',
    background: 'var(--bg-card)',
    borderRadius: '12px',
    padding: '4px',
    boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
  },
  tabItem: (active) => ({
    flex: 1,
    padding: '10px 0',
    textAlign: 'center',
    fontSize: '14px',
    fontWeight: active ? 600 : 400,
    color: active ? 'var(--text)' : 'var(--text-muted)',
    background: active ? 'var(--input-bg)' : 'transparent',
    borderRadius: '10px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
  }),

  // 5. 帖子列表
  postList: {
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  postCard: {
    background: 'var(--bg-card)',
    borderRadius: '14px',
    padding: '14px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    transition: 'transform 0.15s cubic-bezier(0.2, 0, 0, 1)',
    cursor: 'pointer',
  },
  postTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--text)',
    marginBottom: '6px',
    lineHeight: '1.4',
  },
  postExcerpt: {
    fontSize: '13px',
    color: 'var(--text-light)',
    lineHeight: '1.5',
    marginBottom: '10px',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  postImages: {
    display: 'flex',
    gap: '6px',
    marginBottom: '10px',
    overflow: 'hidden',
    borderRadius: '10px',
    position: 'relative',
  },
  postImg: {
    width: '50%',
    aspectRatio: '4/3',
    objectFit: 'cover',
    borderRadius: '8px',
    background: 'var(--skeleton-base)',
    display: 'block',
  },
  postMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  postTag: (bg, color) => ({
    padding: '2px 8px',
    borderRadius: '6px',
    fontSize: '11px',
    background: bg,
    color: color,
  }),
  postStats: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },

  // 底部操作
  bottomAction: {
    padding: '16px',
  },
  actionBtn: {
    width: '100%',
    padding: '12px',
    borderRadius: '12px',
    border: '1.5px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text)',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.2s',
  },

  // 空状态
  emptyState: {
    textAlign: 'center',
    padding: '48px 20px',
    color: 'var(--text-muted)',
  },

  // 加载态
  loadingWrap: {
    padding: '16px',
  },
};

// ============================================================
// 子组件
// ============================================================

/** 数据指标栏 */
function StatsBar({ posts, followers, following, onFollowers, onFollowing }) {
  return (
    <div style={S.statsRow}>
      <div style={S.statItem} onClick={onFollowers}>
        <span style={S.statNum}>{posts ?? 0}</span>
        <span style={S.statLabel}>帖子</span>
      </div>
      <div style={S.statDivider} />
      <div style={S.statItem} onClick={onFollowing}>
        <span style={S.statNum}>{following ?? 0}</span>
        <span style={S.statLabel}>关注</span>
      </div>
      <div style={S.statDivider} />
      <div style={S.statItem} onClick={onFollowers}>
        <span style={S.statNum}>{followers ?? 0}</span>
        <span style={S.statLabel}>粉丝</span>
      </div>
    </div>
  );
}

/** 简介卡片 */
function InfoCard({ user }) {
  const tags = [];
  // 基础信息标签（中性色）
  if (user.region) tags.push({ text: user.region, type: 'neutral' });
  if (user.age) tags.push({ text: `${user.age}岁`, type: 'neutral' });
  if (user.weight) tags.push({ text: `${user.weight}kg`, type: 'neutral' });
  if (user.waist) tags.push({ text: `腰${user.waist}cm`, type: 'neutral' });
  if (user.hip) tags.push({ text: `臀${user.hip}cm`, type: 'neutral' });

  // 偏好标签（彩色）
  if (user.style_preference) {
    user.style_preference.split(/[,，、]/).forEach((tag, i) => {
      const colors = [
        { bg: '#FFE8EE', color: '#D4627A' },
        { bg: '#E0F0FF', color: '#4A8DB7' },
        { bg: '#E8F8E8', color: '#5AA85A' },
        { bg: '#FFF3E0', color: '#C8883A' },
        { bg: '#F0E8FF', color: '#8B6BB5' },
      ];
      const c = colors[i % colors.length];
      tags.push({ text: tag.trim(), type: 'colored', bg: c.bg, color: c.color });
    });
  }

  if (tags.length === 0) return null;

  return (
    <div style={S.infoCard}>
      <div style={S.infoCardTitle}>
        <i className="fa-solid fa-id-card" style={{ color: 'var(--primary-dark)', fontSize: '12px' }} />
        简介
      </div>
      <div style={S.tagsWrap}>
        {tags.map((tag, i) => (
          <span
            key={i}
            style={tag.type === 'neutral' ? S.tagNeutral : S.tagColored(tag.bg, tag.color)}
          >
            {tag.text}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 药丸形 Tab 栏 */
function PillTabs({ tabs, active, onChange }) {
  return (
    <div style={S.tabBar}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          style={S.tabItem(active === tab.key)}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

/** 帖子卡片 */
function PostCard({ post, onClick }) {
  // 提取图片（最多 2 张）
  const rawImages = (post.images || []).slice(0, 2);
  const images = rawImages.map(img => {
    if (typeof img === 'string') return { url: img, isNsfw: false, nsfwType: undefined };
    return { url: img?.image_url || img?.src || '', isNsfw: !!img?.is_nsfw, nsfwType: img?.nsfw_type };
  });
  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}天前`;
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  // 标签颜色映射
  const tagColors = {
    '开发': { bg: '#E0F0FF', color: '#4A8DB7' },
    '分享': { bg: '#FFE8EE', color: '#D4627A' },
    '评测': { bg: '#FFF3E0', color: '#C8883A' },
    '求助': { bg: '#F0E8FF', color: '#8B6BB5' },
    '日常': { bg: '#E8F8E8', color: '#5AA85A' },
  };

  return (
    <div
      style={S.postCard}
      onClick={onClick}
      onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
      onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
    >
      {/* 标题 */}
      {post.title && <div style={S.postTitle}>{post.title}</div>}

      {/* 摘要 */}
      {post.content && <div style={S.postExcerpt}>{post.content}</div>}

      {/* 图片 */}
      {images.length > 0 && (
        <div style={S.postImages}>
          {images.map((img, i) => (
            <NsfwGuard
              key={i}
              src={img.url}
              backendNsfw={img.isNsfw}
              backendNsfwType={img.nsfwType}
              alt=""
              loading="lazy"
              style={{ ...S.postImg, width: '100%' }}
            />
          ))}
        </div>
      )}

      {/* 底部信息 */}
      <div style={S.postMeta}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{timeAgo(post.created_at)}</span>
          {post.category && (
            <span style={S.postTag(
              tagColors[post.category]?.bg || 'var(--input-bg)',
              tagColors[post.category]?.color || 'var(--text-light)'
            )}>
              {post.category}
            </span>
          )}
        </div>
        <div style={S.postStats}>
          <span><i className="fa-solid fa-heart" style={{ marginRight: '4px', fontSize: '11px' }} />{post.like_count ?? 0}</span>
          <span><i className="fa-solid fa-comment" style={{ marginRight: '4px', fontSize: '11px' }} />{post.comment_count ?? 0}</span>
        </div>
      </div>
    </div>
  );
}

/** 底部导航栏 */
function BottomNav({ currentTab, onNavigate }) {
  const tabs = [
    { key: 'home', icon: 'fa-house', label: '首页', to: '/' },
    { key: 'diapers', icon: 'fa-baby', label: '纸尿裤', to: '/diapers' },
    { key: 'create', icon: 'fa-plus', label: '发帖', to: '/create-post', special: true },
    { key: 'messages', icon: 'fa-envelope', label: '消息', to: '/messages' },
    { key: 'profile', icon: 'fa-user', label: '我的', to: '/profile' },
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      background: 'var(--bg-card)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-around',
      padding: '8px 0',
      paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
      zIndex: 100,
      backdropFilter: 'blur(20px) saturate(180%)',
      WebkitBackdropFilter: 'blur(20px) saturate(180%)',
    }}>
      {tabs.map(tab => {
        const isActive = currentTab === tab.key;
        if (tab.special) {
          return (
            <button
              key={tab.key}
              onClick={() => onNavigate(tab.to)}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                background: 'var(--primary)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(168, 216, 240, 0.5)',
                marginTop: '-20px',
                color: 'white',
                fontSize: '18px',
                transition: 'transform 0.2s',
              }}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.9)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <i className={`fa-solid ${tab.icon}`} />
            </button>
          );
        }
        return (
          <button
            key={tab.key}
            onClick={() => onNavigate(tab.to)}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              cursor: 'pointer',
              padding: '4px 12px',
              color: isActive ? 'var(--primary-dark)' : 'var(--text-muted)',
              transition: 'color 0.2s',
            }}
          >
            <i className={`fa-solid ${tab.icon}`} style={{
              fontSize: '18px',
              transition: 'transform 0.2s',
              transform: isActive ? 'scale(1.1)' : 'scale(1)',
            }} />
            <span style={{
              fontSize: '10px',
              fontWeight: isActive ? 600 : 400,
            }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================
export default function ProfilePageV2() {
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const targetId = paramId || currentUser?.id;
  const isSelf = !paramId || String(paramId) === String(currentUser?.id);

  const [profileUser, setProfileUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [counts, setCounts] = useState({ posts: 0, followers: 0, following: 0 });
  const [activeTab, setActiveTab] = useState('posts');
  const [likedPosts, setLikedPosts] = useState([]);
  const [likedLoading, setLikedLoading] = useState(false);

  // 加载用户信息
  useEffect(() => {
    if (!targetId) { setLoading(false); return; }
    (async () => {
      try {
        setLoading(true);
        const data = await authAPI.getUser(targetId);
        setProfileUser(data.user || data);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [targetId]);

  // 加载帖子
  useEffect(() => {
    if (!targetId || activeTab !== 'posts') return;
    (async () => {
      try {
        setPostsLoading(true);
        const data = await forumAPI.feed({ user_id: targetId, limit: 20 });
        setPosts(data.posts || []);
      } catch (e) {
        console.error(e);
      } finally {
        setPostsLoading(false);
      }
    })();
  }, [targetId, activeTab]);

  // 加载喜欢的帖子（暂无独立 API，隐藏此 Tab）
  // useEffect(() => { ... }, [targetId, activeTab]);

  // 加载计数
  useEffect(() => {
    if (!targetId) return;
    (async () => {
      try {
        const [fData, pData] = await Promise.all([
          followsAPI.status(targetId).catch(() => ({ followers: 0, following: 0 })),
          forumAPI.list({ user_id: targetId, limit: 1 }).catch(() => ({ total: 0 })),
        ]);
        setCounts({
          posts: pData.total ?? pData.posts?.length ?? 0,
          followers: fData.followers ?? 0,
          following: fData.following ?? 0,
        });
      } catch {}
    })();
  }, [targetId]);

  const displayUser = profileUser || currentUser;

  // 加载中
  if (loading) {
    return (
      <div style={S.page}>
        <div style={S.topBar}>
          <span style={S.topTitle}>个人中心</span>
        </div>
        <div style={S.loadingWrap}>
          <LoadingSkeleton count={6} height={80} />
        </div>
      </div>
    );
  }

  // 未登录且无 paramId
  if (!currentUser && !paramId) {
    return (
      <div style={S.page}>
        <div style={S.topBar}>
          <span style={S.topTitle}>个人中心</span>
        </div>
        <div style={S.emptyState}>
          <i className="fa-solid fa-user" style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.3, display: 'block' }} />
          <p style={{ marginBottom: '16px' }}>请先登录</p>
          <button
            style={{ ...S.actionBtn, display: 'inline-flex', width: 'auto', padding: '10px 32px' }}
            onClick={() => navigate('/login')}
          >
            去登录
          </button>
        </div>
      </div>
    );
  }

  if (!displayUser) return null;

  const currentActiveTab = activeTab;
  const currentPosts = activeTab === 'posts' ? posts : likedPosts;
  const currentLoading = activeTab === 'posts' ? postsLoading : likedLoading;

  return (
    <div style={S.page}>
      {/* 1. 顶部标题栏 */}
      <div style={S.topBar}>
        <span style={S.topTitle}>个人中心</span>
        {isSelf && (
          <button
            style={S.settingsBtn}
            onClick={() => navigate('/settings')}
            title="设置"
          >
            <i className="fa-solid fa-gear" />
          </button>
        )}
      </div>

      {/* 2. 用户信息核心区域 */}
      <div style={S.userCore}>
        {/* 头像 */}
        <div style={S.avatarWrap}>
          {displayUser.avatar ? (
            <img src={displayUser.avatar} alt="" style={S.avatar} />
          ) : (
            <div style={S.avatarFallback}>
              {displayUser.username?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </div>

        {/* 用户名 */}
        <div style={S.username}>
          <span>{displayUser.username}</span>
          {displayUser.role === 'admin' && <OfficialBadge />}
        </div>

        {/* 个性签名 */}
        <div style={S.bio}>
          {displayUser.bio || (isSelf ? '点击设置添加个性签名' : '这个人很懒，什么都没写')}
        </div>

        {/* 数据指标栏 */}
        <StatsBar
          posts={counts.posts}
          followers={counts.followers}
          following={counts.following}
          onFollowers={() => navigate(`/user/${targetId}/followers`)}
          onFollowing={() => navigate(`/user/${targetId}/following`)}
        />
      </div>

      {/* 3. 简介卡片 */}
      <InfoCard user={displayUser} />

      {/* 4. 内容切换标签栏 */}
      <PillTabs
        tabs={[
          { key: 'posts', label: '帖子' },
        ]}
        active={currentActiveTab}
        onChange={setActiveTab}
      />

      {/* 5. 内容列表 */}
      <div style={S.postList}>
        {currentLoading ? (
          <LoadingSkeleton count={3} height={120} />
        ) : currentPosts.length === 0 ? (
          <div style={S.emptyState}>
            <i
              className={`fa-solid ${activeTab === 'posts' ? 'fa-file-lines' : 'fa-heart'}`}
              style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.3, display: 'block' }}
            />
            <p style={{ fontSize: '14px' }}>
              {activeTab === 'posts'
                ? (isSelf ? '还没有发过帖子' : 'TA 还没有发过帖子')
                : (isSelf ? '还没有喜欢的帖子' : 'TA 还没有喜欢的帖子')
              }
            </p>
            {isSelf && activeTab === 'posts' && (
              <button
                style={{ ...S.actionBtn, display: 'inline-flex', width: 'auto', padding: '10px 24px', marginTop: '12px' }}
                onClick={() => navigate('/create-post')}
              >
                <i className="fa-solid fa-plus" /> 去发帖
              </button>
            )}
          </div>
        ) : (
          currentPosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onClick={() => navigate(`/forum/${post.id}`)}
            />
          ))
        )}
      </div>

      {/* 底部操作按钮 */}
      {!isSelf && (
        <div style={S.bottomAction}>
          <button
            style={S.actionBtn}
            onClick={() => navigate('/messages')}
          >
            <i className="fa-solid fa-envelope" /> 发私信
          </button>
        </div>
      )}

      {/* 6. 底部导航栏（使用全局 MobileBottomNav，不重复渲染） */}
    </div>
  );
}
