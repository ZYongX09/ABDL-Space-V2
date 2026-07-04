import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import PageLayout from '../components/PageLayout';
import ImageUploader from '../components/ImageUploader';
import { useVerifyModal } from '../components/VerifyModal';
import { forumAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

const MAX_CHARS = 5000;
const API_BASE = import.meta.env.VITE_API_BASE || '';

const NBW_FORUMS = [
  { fid: 0, name: 'AI 推荐', icon: 'fa-wand-magic-sparkles' },
  { fid: 28, name: '自拍', icon: 'fa-camera' },
  { fid: 27, name: '分享', icon: 'fa-share-nodes' },
  { fid: 26, name: '小说/漫画', icon: 'fa-book' },
  { fid: 3, name: '交友', icon: 'fa-users' },
];

export default function CreatePost() {
  const [content, setContent] = useState('');
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [selectedFid, setSelectedFid] = useState(0); // 0 = AI 推荐
  const [recommending, setRecommending] = useState(false);
  const [recommendedFid, setRecommendedFid] = useState(null);
  const imgRef = useRef(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const { trigger, VerifyModal, captchaToken } = useVerifyModal();
  const isAdmin = user?.role === 'admin';
  const isNBWBound = !!user?.nbw_uid;

  // AI 推荐版块
  const fetchRecommendFid = useCallback(async () => {
    if (!content.trim() || selectedFid !== 0) return;
    setRecommending(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/nbw/recommend-fid`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('abdl_token') || ''}`,
        },
        credentials: 'include',
        body: JSON.stringify({ content: content.trim() }),
      });
      const data = await res.json();
      if (data.fid) {
        setRecommendedFid(data.fid);
      }
    } catch (e) {
      console.error('Recommend fid failed:', e);
    } finally {
      setRecommending(false);
    }
  }, [content, selectedFid]);

  // 当内容变化且选择 AI 推荐时，延迟获取推荐
  useEffect(() => {
    if (selectedFid !== 0 || !content.trim()) {
      setRecommendedFid(null);
      return;
    }
    const timer = setTimeout(fetchRecommendFid, 1500);
    return () => clearTimeout(timer);
  }, [content, selectedFid, fetchRecommendFid]);

  const doPost = async () => {
    if (!content.trim() && !imgRef.current?.hasPending()) return;
    setPublishing(true);
    try {
      let imageData = [];
      if (imgRef.current?.hasPending()) {
        toast.info('正在上传图片...');
        const uploaded = await imgRef.current.uploadAll();
        imageData = uploaded.map(item => {
          if (typeof item === 'string') return { url: item, is_nsfw: false };
          return { url: item.url, is_nsfw: !!item.is_nsfw };
        });
      }

      // 确定最终 fid
      let finalFid = selectedFid;
      if (finalFid === 0) {
        // AI 推荐模式：如果已有推荐结果则使用，否则默认分享
        finalFid = recommendedFid || 27;
      }

      const result = await forumAPI.create({
        content: content.trim(),
        images: imageData.length > 0 ? imageData : undefined,
        captchaToken: captchaToken.current,
        is_announcement: isAdmin && isAnnouncement ? true : undefined,
        nbw_fid: isNBWBound ? finalFid : undefined,
      });
      toast.success(isAnnouncement ? '公告发布成功！' : (imageData.length > 0 ? '图片上传完成，发布成功！' : '发布成功'));
      navigate(`/forum/${result.id}`, { replace: true });
    } catch (e) {
      toast.error(e.message);
    } finally {
      setPublishing(false);
    }
  };

  const handlePost = () => {
    if (!content.trim() && !imgRef.current?.hasPending()) return;
    trigger(doPost);
  };

  return (
    <>
    <PageLayout hero={{ icon: 'fa-pen', title: '发帖', subtitle: '分享你的 ABDL 生活' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        {/* NBW 未绑定提示 */}
        {!isNBWBound && (
          <div className="mb-4 p-3 rounded-xl flex items-center gap-3" style={{ background: 'var(--input-bg)', border: '1px solid var(--border)' }}>
            <i className="fa-solid fa-circle-info" style={{ color: 'var(--primary-dark)' }} />
            <div className="flex-1">
              <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>
                发帖需要绑定宝宝新天地账户
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                绑定后可同步帖子到宝宝新天地社区
              </div>
            </div>
            <Link to="/nbw-bind-guide" className="btn btn-primary" style={{ fontSize: 11, padding: '4px 12px', whiteSpace: 'nowrap' }}>
              去绑定
            </Link>
          </div>
        )}

        <textarea
          className="form-control"
          placeholder="分享点什么..."
          value={content}
          onChange={e => setContent(e.target.value.slice(0, MAX_CHARS))}
          rows={8}
          disabled={publishing || !isNBWBound}
          autoFocus
          style={{ minHeight: '200px', resize: 'vertical' }}
        />
        <div className="flex justify-between items-center mt-3 mb-3">
          <span
            className="text-xs"
            style={{ color: content.length > MAX_CHARS * 0.9 ? 'var(--danger)' : 'var(--text-muted)' }}
          >
            {content.length} / {MAX_CHARS}
          </span>
        </div>

        <ImageUploader ref={imgRef} max={4} onError={msg => toast.error(msg)} disabled={!isNBWBound} />

        {/* 版块选择器 — 仅已绑定 NBW 时显示 */}
        {isNBWBound && (
          <div className="mt-4">
            <label className="text-xs font-semibold mb-2 block" style={{ color: 'var(--text)' }}>
              <i className="fa-solid fa-layer-group mr-1.5" style={{ color: 'var(--primary-dark)' }} />
              同步到宝宝新天地版块
            </label>
            <div className="flex flex-wrap gap-2">
              {NBW_FORUMS.map(forum => (
                <button
                  key={forum.fid}
                  type="button"
                  onClick={() => setSelectedFid(forum.fid)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: selectedFid === forum.fid ? 'var(--primary-light)' : 'var(--input-bg)',
                    border: `1px solid ${selectedFid === forum.fid ? 'var(--primary)' : 'var(--border)'}`,
                    color: selectedFid === forum.fid ? 'var(--primary-dark)' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <i className={`fa-solid ${forum.icon}`} />
                  {forum.name}
                  {forum.fid === 0 && recommending && (
                    <i className="fa-solid fa-spinner fa-spin ml-1" />
                  )}
                  {forum.fid === 0 && recommendedFid && !recommending && (
                    <span className="ml-1 opacity-60">
                      → {NBW_FORUMS.find(f => f.fid === recommendedFid)?.name || `#${recommendedFid}`}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 公告开关 — 仅管理员可见 */}
        {isAdmin && (
          <div
            className="mt-4 p-3 rounded-xl flex items-center justify-between gap-3"
            style={{
              background: isAnnouncement ? 'rgba(var(--primary-rgb, 168, 216, 240), 0.1)' : 'var(--input-bg)',
              border: `1px solid ${isAnnouncement ? 'var(--primary)' : 'var(--border)'}`,
              transition: 'all 0.2s',
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <i
                className="fa-solid fa-bullhorn flex-shrink-0"
                style={{ color: isAnnouncement ? 'var(--primary-dark)' : 'var(--text-muted)', fontSize: '16px' }}
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  标记为公告
                </div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  公告会置顶、首页右侧公告卡片与公告筛选页都可见
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAnnouncement(v => !v)}
              style={{
                width: '44px', height: '24px', borderRadius: '12px',
                border: 'none', cursor: 'pointer', flexShrink: 0,
                background: isAnnouncement ? 'var(--primary)' : 'var(--border)',
                position: 'relative', transition: 'background 0.2s',
              }}
              aria-label="公告开关"
            >
              <div style={{
                width: '20px', height: '20px', borderRadius: '50%',
                background: 'white', position: 'absolute', top: '2px',
                left: isAnnouncement ? '22px' : '2px',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }} />
            </button>
          </div>
        )}

        <div className="flex gap-3 justify-end mt-4">
          <button
            className="btn btn-outline"
            onClick={() => {
              if ((content.trim() || imgRef.current?.hasPending()) && !confirm('有未保存的内容，确定离开吗？')) return;
              navigate('/');
            }}
            disabled={publishing}
          >
            取消
          </button>
          <button
            className="btn btn-primary miui-press"
            onClick={handlePost}
            disabled={(!content.trim() && !imgRef.current?.hasPending()) || publishing || content.length > MAX_CHARS || !isNBWBound}
          >
            {publishing ? (
              <><i className="fa-solid fa-spinner fa-spin mr-1.5" />发布中...</>
            ) : (
              <><i className="fa-solid fa-paper-plane mr-1.5" />发布</>
            )}
          </button>
        </div>
      </div>
      {VerifyModal}
    </PageLayout>
    </>
  );
}
