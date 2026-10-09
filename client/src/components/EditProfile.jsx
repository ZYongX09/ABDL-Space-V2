import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNsfw } from '../contexts/NsfwContext';
import { getActiveToken } from '../utils/authHeaders';

const API_BASE = import.meta.env.VITE_API_BASE || '';

/**
 * 用头像文件替换头像。
 *
 * 必须走 /api/v1/accounts/update_credentials：后端只接受由本站上传流水线产生、
 * purpose=avatar 的引用，而网页拿不到 COS 直传所需的桶级 CORS，所以由服务端代传。
 * 该端点会整段覆盖 profile_fields，因此先把现有资料栏原样回传，避免保存头像时清空它们。
 */
async function replaceAvatar(file) {
  const token = getActiveToken();
  if (!token) throw new Error('登录状态已失效，请重新登录后再试');

  let fields = [];
  try {
    const res = await fetch(`${API_BASE}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (res.ok) {
      const account = await res.json();
      if (Array.isArray(account?.fields)) {
        fields = account.fields.filter(field => field && (field.name || field.value));
      }
    }
  } catch {
    // 拿不到资料栏时按空处理：与 App 端未填资料栏时行为一致。
  }

  const formData = new FormData();
  formData.append('avatar', file);
  fields.forEach((field, index) => {
    formData.append(`fields_attributes[${index}][name]`, field.name || '');
    formData.append(`fields_attributes[${index}][value]`, field.value || '');
  });

  const res = await fetch(`${API_BASE}/api/v1/accounts/update_credentials`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '头像上传失败');
  return data;
}

export default function EditProfile({ onClose }) {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const { classifyFile, loaded: modelReady, loadModel } = useNsfw();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 头像只记录「改了什么」，不再把当前头像地址原样提交：
  // 后端只接受本站上传流水线产生的引用，回传旧地址会被判为非法上传。
  // kind: 'existing' | 'new' | 'removed' | 'none'
  const [avatar, setAvatar] = useState(() => (user?.avatar ? { kind: 'existing' } : { kind: 'none' }));
  const [form, setForm] = useState({
    bio: user?.bio || '',
    region: user?.region || '',
    age: user?.age || '',
    weight: user?.weight || '',
    waist: user?.waist || '',
    hip: user?.hip || '',
    style_preference: user?.style_preference || '',
  });

  useEffect(() => {
    if (user) {
      setForm({
        bio: user.bio || '',
        region: user.region || '',
        age: user.age || '',
        weight: user.weight || '',
        waist: user.waist || '',
        hip: user.hip || '',
        style_preference: user.style_preference || '',
      });
    }
  }, [user]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // 新选文件的本地预览地址需要在关闭弹窗时释放。
  const objectUrlRef = useRef('');
  useEffect(() => () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); }, []);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const avatarPreview = avatar.kind === 'new'
    ? avatar.previewUrl
    : avatar.kind === 'existing'
      ? user?.avatar
      : null;

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('图片不能超过 5MB'); return; }
    setAvatarUploading(true);
    try {
      if (!modelReady) {
        toast.info('正在加载安全检测模型...');
        await loadModel();
      }
      const result = await classifyFile(file);
      if (result && result.level === 'high') {
        toast.error(`头像不允许包含${result.type}`);
        return;
      }
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const previewUrl = URL.createObjectURL(file);
      objectUrlRef.current = previewUrl;
      setAvatar({ kind: 'new', file, previewUrl });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const removeAvatar = () => {
    if (objectUrlRef.current) { URL.revokeObjectURL(objectUrlRef.current); objectUrlRef.current = ''; }
    setAvatar({ kind: 'removed' });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (avatar.kind === 'new') await replaceAvatar(avatar.file);

      const body = { ...form };
      if (body.age) body.age = Number(body.age); else body.age = null;
      if (body.weight) body.weight = Number(body.weight); else body.weight = null;
      if (body.waist) body.waist = Number(body.waist); else body.waist = null;
      if (body.hip) body.hip = Number(body.hip); else body.hip = null;
      if (!body.style_preference) body.style_preference = null;
      if (!body.bio) body.bio = null;
      if (!body.region) body.region = null;
      // 只有真正移除头像时才提交 avatar，改头像已由上面那一步落库。
      if (avatar.kind === 'removed') body.avatar = null;
      await updateProfile(body);

      toast.success('资料已更新');
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="ep-overlay" onClick={onClose}>
      <div className="ep-sheet" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="ep-header">
          <button className="ep-close" onClick={onClose} aria-label="关闭">
            <i className="fa-solid fa-xmark" />
          </button>
          <h3 className="ep-title">编辑资料</h3>
          <button className="ep-save" onClick={handleSave} disabled={saving}>
            {saving ? <i className="fa-solid fa-spinner fa-spin" /> : '保存'}
          </button>
        </div>

        {/* Content */}
        <div className="ep-content">
          {/* Avatar */}
          <section className="ep-section">
            <div className="ep-avatar-row">
              <div className="ep-avatar-wrap">
                {avatarPreview
                  ? <img src={avatarPreview} alt="" className="ep-avatar-img" />
                  : <div className="ep-avatar-fallback">{user?.username?.[0]?.toUpperCase()}</div>
                }
                {avatarUploading && (
                  <div className="ep-avatar-loading">
                    <i className="fa-solid fa-spinner fa-spin" />
                  </div>
                )}
              </div>
              <div className="ep-avatar-actions">
                <label className="ep-btn ep-btn-outline ep-btn-sm">
                  <i className="fa-solid fa-camera" />
                  <span>{avatarPreview ? '更换' : '上传头像'}</span>
                  <input type="file" accept="image/*" hidden onChange={handleAvatarUpload} disabled={avatarUploading} />
                </label>
                {avatarPreview && (
                  <button className="ep-btn ep-btn-ghost ep-btn-sm ep-btn-danger" onClick={removeAvatar}>
                    <i className="fa-solid fa-trash-can" />
                  </button>
                )}
              </div>
            </div>
            <p className="ep-hint">支持 JPG / PNG / GIF / WEBP，最大 5MB</p>
          </section>

          {/* Basic Info */}
          <section className="ep-section">
            <h4 className="ep-section-title">
              <i className="fa-solid fa-user" /> 基本信息
            </h4>
            <div className="ep-field">
              <label className="ep-label">个人简介</label>
              <textarea className="ep-input ep-textarea" value={form.bio} onChange={e => update('bio', e.target.value)} rows={3} maxLength={200} placeholder="介绍一下自己..." />
              <span className="ep-counter">{(form.bio || '').length}/200</span>
            </div>
            <div className="ep-row">
              <div className="ep-field">
                <label className="ep-label">地区</label>
                <input className="ep-input" value={form.region} onChange={e => update('region', e.target.value)} placeholder="如：北京" />
              </div>
              <div className="ep-field">
                <label className="ep-label">年龄</label>
                <input type="number" className="ep-input" value={form.age} onChange={e => update('age', e.target.value)} placeholder="25" min="1" max="150" />
              </div>
            </div>
          </section>

          {/* Body Data */}
          <section className="ep-section">
            <h4 className="ep-section-title">
              <i className="fa-solid fa-ruler" /> 身体数据
              <span className="ep-section-sub">用于 AI 推荐尺码</span>
            </h4>
            <div className="ep-row ep-row-3">
              <div className="ep-field">
                <label className="ep-label">体重 <span className="ep-unit">kg</span></label>
                <input type="number" className="ep-input" value={form.weight} onChange={e => update('weight', e.target.value)} placeholder="65" min="1" max="500" step="0.1" />
              </div>
              <div className="ep-field">
                <label className="ep-label">腰围 <span className="ep-unit">cm</span></label>
                <input type="number" className="ep-input" value={form.waist} onChange={e => update('waist', e.target.value)} placeholder="75" min="1" max="300" step="0.1" />
              </div>
              <div className="ep-field">
                <label className="ep-label">臀围 <span className="ep-unit">cm</span></label>
                <input type="number" className="ep-input" value={form.hip} onChange={e => update('hip', e.target.value)} placeholder="95" min="1" max="300" step="0.1" />
              </div>
            </div>
          </section>

          {/* Preferences */}
          <section className="ep-section">
            <h4 className="ep-section-title">
              <i className="fa-solid fa-heart" /> 偏好
            </h4>
            <div className="ep-field">
              <label className="ep-label">风格偏好</label>
              <input className="ep-input" value={form.style_preference} onChange={e => update('style_preference', e.target.value)} placeholder="如：日系、可爱风、简约" />
            </div>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}
