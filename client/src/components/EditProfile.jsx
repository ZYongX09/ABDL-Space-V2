import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNsfw } from '../contexts/NsfwContext';

const API_BASE = import.meta.env.VITE_API_BASE || '';

export default function EditProfile({ onClose }) {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const { classifyFile, loaded: modelReady, loadModel } = useNsfw();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    bio: user?.bio || '',
    region: user?.region || '',
    age: user?.age || '',
    weight: user?.weight || '',
    waist: user?.waist || '',
    hip: user?.hip || '',
    style_preference: user?.style_preference || '',
    avatar: user?.avatar || null,
  });

  // user 加载后同步表单
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
        avatar: user.avatar || null,
      });
    }
  }, [user]);

  const update = (key, val) => setForm(f => ({ ...f, [key]: val }));

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
        setAvatarUploading(false);
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/api/images/upload?returnFormat=full`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');

      update('avatar', data.url);
      toast.success('头像已上传');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = { ...form };
      if (body.age) body.age = Number(body.age); else body.age = null;
      if (body.weight) body.weight = Number(body.weight); else body.weight = null;
      if (body.waist) body.waist = Number(body.waist); else body.waist = null;
      if (body.hip) body.hip = Number(body.hip); else body.hip = null;
      if (!body.style_preference) body.style_preference = null;
      if (!body.bio) body.bio = null;
      if (!body.region) body.region = null;
      await updateProfile(body);
      toast.success('资料已更新');
      onClose();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="edit-profile-sheet" onClick={e => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="flex items-center justify-between" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: '1.1rem' }}>
            <i className="fa-solid fa-xmark" />
          </button>
          <h3 className="font-bold" style={{ color: 'var(--text)' }}>编辑资料</h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving}
            style={{ fontSize: '0.8rem', padding: '5px 16px' }}
          >
            {saving ? <i className="fa-solid fa-spinner fa-spin" /> : '保存'}
          </button>
        </div>

        {/* 表单内容 */}
        <div className="edit-profile-content" style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {/* 头像 */}
          <div className="mb-6">
            <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>
              <i className="fa-solid fa-image mr-1.5" style={{ color: 'var(--primary-dark)' }} />
              头像
            </h4>
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold overflow-hidden"
                  style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}>
                  {form.avatar
                    ? <img src={form.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    : user?.username?.[0]?.toUpperCase()
                  }
                </div>
                {avatarUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full" style={{ background: 'rgba(0,0,0,0.4)' }}>
                    <i className="fa-solid fa-spinner fa-spin text-white" />
                  </div>
                )}
              </div>
              <div>
                <label className="btn btn-outline btn-sm cursor-pointer" style={{ fontSize: '0.75rem' }}>
                  <i className="fa-solid fa-upload mr-1" />
                  {form.avatar ? '更换头像' : '上传头像'}
                  <input type="file" accept="image/*" hidden onChange={handleAvatarUpload} disabled={avatarUploading} />
                </label>
                {form.avatar && (
                  <button className="btn btn-outline btn-sm ml-2" style={{ fontSize: '0.75rem', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={() => update('avatar', null)}>
                    <i className="fa-solid fa-trash mr-1" />移除
                  </button>
                )}
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>支持 JPG/PNG/GIF/WEBP，最大 5MB</p>
              </div>
            </div>
          </div>

          {/* 基本信息 */}
          <div className="mb-6">
            <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>
              <i className="fa-solid fa-circle-user mr-1.5" style={{ color: 'var(--primary-dark)' }} />
              基本信息
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>地区</label>
                <input className="form-control" value={form.region} onChange={e => update('region', e.target.value)} placeholder="如：北京" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>年龄</label>
                <input type="number" className="form-control" value={form.age} onChange={e => update('age', e.target.value)} placeholder="如：25" min="1" max="150" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>个人简介</label>
              <textarea className="form-control" value={form.bio} onChange={e => update('bio', e.target.value)} rows={3} placeholder="介绍一下自己..." />
            </div>
          </div>

          {/* 身体数据 */}
          <div className="mb-6">
            <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>
              <i className="fa-solid fa-ruler mr-1.5" style={{ color: 'var(--primary-dark)' }} />
              身体数据
              <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>用于 AI 推荐尺码，可选填</span>
            </h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>体重 (kg)</label>
                <input type="number" className="form-control" value={form.weight} onChange={e => update('weight', e.target.value)} placeholder="65" min="1" max="500" step="0.1" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>腰围 (cm)</label>
                <input type="number" className="form-control" value={form.waist} onChange={e => update('waist', e.target.value)} placeholder="75" min="1" max="300" step="0.1" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>臀围 (cm)</label>
                <input type="number" className="form-control" value={form.hip} onChange={e => update('hip', e.target.value)} placeholder="95" min="1" max="300" step="0.1" />
              </div>
            </div>
          </div>

          {/* 偏好 */}
          <div className="mb-6">
            <h4 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>
              <i className="fa-solid fa-heart mr-1.5" style={{ color: 'var(--accent)' }} />
              偏好
            </h4>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>风格偏好</label>
              <input className="form-control" value={form.style_preference} onChange={e => update('style_preference', e.target.value)} placeholder="如：日系、可爱风、简约" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
