import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { merchantAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { uploadImage } from '../utils/imageUpload';
import './merchant.css';

const EMPTY_FORM = { title: '', content: '', image_url: '', url: '', enabled: true };
const EVENT_LABELS = { link_click: '链接点击', image_view: '图片查看', ad_navigation: '广告跳转' };

function unwrap(data, key, fallback) {
  if (Array.isArray(data)) return data;
  return data?.[key] || data?.items || data?.data?.[key] || data?.data || fallback;
}

function numberValue(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function Stat({ label, value, icon, note }) {
  return <div className="merchant-stat">
    <span className="merchant-stat-icon"><i className={`fa-solid ${icon}`} aria-hidden="true" /></span>
    <div><div className="merchant-stat-label">{label}</div><strong>{numberValue(value).toLocaleString('zh-CN')}</strong>{note && <small>{note}</small>}</div>
  </div>;
}

function AdForm({ form, setForm, onSubmit, onCancel, busy }) {
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const chooseImage = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const imageUrl = await uploadImage(file);
      setForm(current => ({ ...current, image_url: imageUrl }));
    } catch (error) { toast.error(error.message); }
    finally { setUploading(false); event.target.value = ''; }
  };
  return <form className="merchant-form" onSubmit={onSubmit}>
    <div className="merchant-form-grid">
      <label>标题（可选）<input value={form.title} maxLength={120} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="例如：春季新品上架" /></label>
      <label>落地页 URL（可选）<input type="url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="由后端校验的链接" /></label>
    </div>
    <label>广告文案<textarea required value={form.content} maxLength={1000} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="输入广告正文" rows={4} /></label>
    <div className="merchant-upload-row">
      <label className="merchant-upload-button"><i className="fa-solid fa-cloud-arrow-up" aria-hidden="true" /> {uploading ? '上传中…' : '上传广告图片'}<input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={chooseImage} disabled={uploading} /></label>
      {form.image_url && <div className="merchant-upload-preview"><img src={form.image_url} alt="广告预览" /><button type="button" className="merchant-icon-button" onClick={() => setForm({ ...form, image_url: '' })} aria-label="移除广告图片"><i className="fa-solid fa-xmark" aria-hidden="true" /></button></div>}
    </div>
    <label className="merchant-checkbox"><input type="checkbox" checked={form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> 发布后立即启用</label>
    <div className="merchant-form-actions"><button className="merchant-button primary" type="submit" disabled={busy || uploading}><i className="fa-solid fa-check" aria-hidden="true" /> {busy ? '保存中…' : '保存广告'}</button>{onCancel && <button className="merchant-button" type="button" onClick={onCancel}>取消</button>}</div>
  </form>;
}

export default function MerchantCenter() {
  const { user, loading: authLoading } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  const [ads, setAds] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [activating, setActivating] = useState(false);
  const [profileForm, setProfileForm] = useState({ name: '', contact_name: '', contact_email: '', description: '' });
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const activated = Boolean(profile?.activated ?? profile?.is_active ?? profile?.merchant_id ?? profile?.status === 'active');
  const eventStats = stats?.events || stats?.event_counts || {
    link_click: stats?.link_clicks ?? 0,
    image_view: stats?.image_views ?? 0,
    ad_navigation: stats?.ad_navigations ?? 0,
  };
  const totalClicks = stats?.clicks ?? stats?.total_clicks ?? (numberValue(eventStats.link_click) + numberValue(eventStats.image_view) + numberValue(eventStats.ad_navigation));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const infoData = await merchantAPI.info();
      const nextProfile = infoData?.profile || infoData?.merchant || infoData;
      setProfile(nextProfile);
      const active = Boolean(infoData?.authorized || infoData?.active || nextProfile?.status === 'active' || nextProfile?.activated || nextProfile?.is_active || user?.is_super_admin);
      if (active) {
        const [profileData, adsData, statsData] = await Promise.all([merchantAPI.profile(), merchantAPI.ads(), merchantAPI.stats()]);
        const loadedProfile = profileData?.profile || profileData?.merchant || profileData;
        setProfile(loadedProfile);
        setAds(unwrap(adsData, 'ads', []));
        setStats(statsData?.stats || statsData || {});
      }
      if (nextProfile) setProfileForm(current => ({ ...current, ...nextProfile, name: nextProfile.name || nextProfile.merchant_name || '' }));
    } catch (error) {
      if (error.status !== 404 && error.status !== 401) toast.error(error.message || '商家数据加载失败');
    }
    finally { setLoading(false); }
  }, [toast, user]);

  useEffect(() => { load(); }, [load]);

  const saveProfile = async (event) => {
    event.preventDefault();
    try { const result = await merchantAPI.updateProfile(profileForm); setProfile(result?.profile || { ...profile, ...profileForm }); toast.success('商家资料已保存'); }
    catch (error) { toast.error(error.message); }
  };

  const activate = async (event) => {
    event.preventDefault();
    if (!activationCode.trim()) return;
    setActivating(true);
    try { await merchantAPI.activate(activationCode.trim()); setActivationCode(''); toast.success('注册码激活成功'); await load(); }
    catch (error) { toast.error(error.message); }
    finally { setActivating(false); }
  };

  const saveAd = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = editingId ? await merchantAPI.updateAd(editingId, form) : await merchantAPI.createAd(form);
      const next = result?.ad || result?.data?.ad;
      setAds(current => editingId ? current.map(item => String(item.id) === String(editingId) ? (next || { ...item, ...form }) : item) : [next || { ...form, id: Date.now() }, ...current]);
      setForm(EMPTY_FORM); setEditingId(null); toast.success(editingId ? '广告已更新' : '广告已创建');
    } catch (error) { toast.error(error.message); }
    finally { setSaving(false); }
  };

  const toggleAd = async (ad) => {
    try { await merchantAPI.updateAd(ad.id, { enabled: !(ad.enabled ?? ad.is_active) }); setAds(current => current.map(item => item.id === ad.id ? { ...item, enabled: !(ad.enabled ?? ad.is_active), is_active: !(ad.enabled ?? ad.is_active) } : item)); }
    catch (error) { toast.error(error.message); }
  };

  const removeAd = async (ad) => {
    if (!window.confirm('确认删除这条广告？')) return;
    try { await merchantAPI.deleteAd(ad.id); setAds(current => current.filter(item => item.id !== ad.id)); toast.success('广告已删除'); }
    catch (error) { toast.error(error.message); }
  };

  const editAd = (ad) => { setEditingId(ad.id); setForm({ ...EMPTY_FORM, ...ad, image_url: ad.image_url || ad.imageUrl || '', url: ad.url || ad.target_url || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const recentEvents = useMemo(() => Object.entries(eventStats).filter(([key]) => EVENT_LABELS[key]).map(([key, value]) => ({ key, value })), [eventStats]);

  return <main className="merchant-shell">
    <header className="merchant-header">
      <div><div className="merchant-eyebrow">ABDL SPACE BUSINESS</div><h1>商家服务中心</h1><p>在社区内管理品牌资料与推广内容，实时掌握投放表现。</p></div>
      {user ? <div className="merchant-account"><span className="merchant-avatar">{user.avatar ? <img src={user.avatar} alt="" /> : <i className="fa-solid fa-user" aria-hidden="true" />}</span><span>{user.username || user.display_name}</span></div> : <Link className="merchant-button" to="/login">登录账户</Link>}
    </header>
    {!authLoading && !user && <section className="merchant-login-panel"><i className="fa-solid fa-lock" aria-hidden="true" /><div><h2>登录后开始使用商家服务</h2><p>商家资料、广告素材和统计数据均与当前账户绑定。</p></div><div className="merchant-form-actions"><Link className="merchant-button primary" to="/login">登录</Link><Link className="merchant-button" to="/register">注册</Link></div></section>}
    {user && <>
      <section className="merchant-overview-grid">
        <div className="merchant-intro-panel"><span className="merchant-panel-kicker">MERCHANT OPERATIONS</span><h2>让每一次曝光都可衡量</h2><p>统一维护品牌信息、广告素材与投放状态。所有外链由服务端校验后返回，前端只展示和使用已批准的地址。</p><div className="merchant-trust-list"><span><i className="fa-solid fa-shield-halved" aria-hidden="true" /> 服务端审核 URL</span><span><i className="fa-solid fa-chart-simple" aria-hidden="true" /> 事件级统计</span></div></div>
        <div className="merchant-activation-panel"><div className="merchant-panel-heading"><div><span className="merchant-panel-kicker">ACCESS</span><h2>{activated ? '商家权限已启用' : '激活商家权限'}</h2></div><span className={`merchant-status ${activated ? 'active' : 'pending'}`}><i className="fa-solid fa-circle" aria-hidden="true" /> {activated ? '已启用' : '待激活'}</span></div>{activated ? <p className="merchant-muted">当前账户可以创建、编辑和管理广告投放。</p> : <form className="merchant-activation-form" onSubmit={activate}><input value={activationCode} onChange={e => setActivationCode(e.target.value)} placeholder="输入商家注册码" aria-label="商家注册码" /><button className="merchant-button primary" disabled={activating}>{activating ? '验证中…' : '激活'}</button></form>}</div>
      </section>
      <section className="merchant-stats-grid"><Stat label="投放数" value={stats.ad_count ?? stats.total_ads} icon="fa-layer-group" note="累计创建" /><Stat label="点击总量" value={totalClicks} icon="fa-arrow-pointer" note="链接与跳转" /><Stat label="链接点击" value={eventStats.link_click} icon="fa-link" /><Stat label="图片查看" value={eventStats.image_view} icon="fa-image" /><Stat label="广告跳转" value={eventStats.ad_navigation} icon="fa-arrow-up-right-from-square" /></section>
      <section className="merchant-content-grid">
        <div className="merchant-panel"><div className="merchant-panel-heading"><div><span className="merchant-panel-kicker">PROFILE</span><h2>商家资料</h2></div></div><form className="merchant-form" onSubmit={saveProfile}><label>商家名称<input value={profileForm.name} onChange={e => setProfileForm({ ...profileForm, name: e.target.value })} placeholder="品牌或商家名称" /></label><div className="merchant-form-grid"><label>联系人<input value={profileForm.contact_name} onChange={e => setProfileForm({ ...profileForm, contact_name: e.target.value })} /></label><label>联系邮箱<input type="email" value={profileForm.contact_email} onChange={e => setProfileForm({ ...profileForm, contact_email: e.target.value })} /></label></div><label>品牌简介<textarea rows={4} value={profileForm.description} onChange={e => setProfileForm({ ...profileForm, description: e.target.value })} /></label><button className="merchant-button primary" type="submit"><i className="fa-solid fa-floppy-disk" aria-hidden="true" /> 保存资料</button></form></div>
        <div className="merchant-panel"><div className="merchant-panel-heading"><div><span className="merchant-panel-kicker">EVENT BREAKDOWN</span><h2>事件统计</h2></div></div>{recentEvents.length ? <div className="merchant-event-list">{recentEvents.map(item => <div key={item.key}><span>{EVENT_LABELS[item.key]}</span><strong>{numberValue(item.value).toLocaleString('zh-CN')}</strong></div>)}</div> : <div className="merchant-empty"><i className="fa-solid fa-chart-line" aria-hidden="true" /><span>投放产生数据后将在此显示。</span></div>}</div>
      </section>
      <section className="merchant-panel merchant-ads-panel"><div className="merchant-panel-heading"><div><span className="merchant-panel-kicker">ADVERTISING</span><h2>{editingId ? '编辑广告' : '创建广告'}</h2><p>支持纯文本、图片，以及可选标题和已校验落地页。</p></div>{loading && <span className="merchant-muted">同步中…</span>}</div><AdForm form={form} setForm={setForm} onSubmit={saveAd} onCancel={editingId ? () => { setEditingId(null); setForm(EMPTY_FORM); } : null} busy={saving} /></section>
      <section className="merchant-panel"><div className="merchant-panel-heading"><div><span className="merchant-panel-kicker">INVENTORY</span><h2>广告列表</h2></div><span className="merchant-muted">共 {ads.length} 条</span></div>{ads.length ? <div className="merchant-ad-list">{ads.map(ad => <div className="merchant-ad-row" key={ad.id}><div className="merchant-ad-thumb">{(ad.image_url || ad.imageUrl) ? <img src={ad.image_url || ad.imageUrl} alt="" /> : <i className="fa-solid fa-align-left" aria-hidden="true" />}</div><div className="merchant-ad-copy"><div className="merchant-ad-title">{ad.title || '未设置标题'} <span className={`merchant-status ${(ad.enabled ?? ad.is_active) ? 'active' : 'pending'}`}>{(ad.enabled ?? ad.is_active) ? '投放中' : '已停用'}</span></div><p>{ad.content || ad.text}</p><small>{ad.url || ad.target_url || '未设置落地页'}</small></div><div className="merchant-row-actions"><button className="merchant-icon-button" onClick={() => toggleAd(ad)} title={(ad.enabled ?? ad.is_active) ? '停用广告' : '启用广告'}><i className={`fa-solid ${(ad.enabled ?? ad.is_active) ? 'fa-pause' : 'fa-play'}`} aria-hidden="true" /></button><button className="merchant-icon-button" onClick={() => editAd(ad)} title="编辑广告"><i className="fa-solid fa-pen" aria-hidden="true" /></button><button className="merchant-icon-button danger" onClick={() => removeAd(ad)} title="删除广告"><i className="fa-solid fa-trash" aria-hidden="true" /></button></div></div>)}</div> : <div className="merchant-empty"><i className="fa-solid fa-rectangle-ad" aria-hidden="true" /><span>还没有广告，创建第一条投放内容。</span></div>}</section>
    </>}
  </main>;
}
