import { useState, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import MobileHeader from '../components/MobileHeader';
import { LoadingSkeleton, Spinner } from '../components/Feedback';
import TabBar from '../components/TabBar';
import { adminAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useVerifyModal } from '../components/VerifyModal';
import { Link } from 'react-router-dom';

const TABS = [
  { key: 'overview', label: '概览', icon: 'fa-chart-pie' },
  { key: 'users', label: '用户', icon: 'fa-users' },
  { key: 'posts', label: '帖子', icon: 'fa-file-lines' },
  { key: 'diapers', label: '纸尿裤', icon: 'fa-baby' },
  { key: 'reports', label: '举报', icon: 'fa-flag' },
];

export default function AdminPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { trigger, VerifyModal } = useVerifyModal();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [posts, setPosts] = useState([]);
  const [reports, setReports] = useState([]);
  const [reportStatus, setReportStatus] = useState('pending');
  const [diapers, setDiapers] = useState([]);
  const [showDiaperForm, setShowDiaperForm] = useState(false);
  const [editingDiaper, setEditingDiaper] = useState(null);
  const [diaperForm, setDiaperForm] = useState({
    brand: '', model: '', product_type: '纸尿裤',
    absorbency_mfr: '', absorbency_adult: '', is_baby_diaper: 0,
    material: '', features: '', avg_price: '', official_url: '', images: [],
    sizes: [],
  });
  const [diaperSaving, setDiaperSaving] = useState(false);

  useEffect(() => {
    if (user?.role !== 'admin') { setLoading(false); return; }
    loadTab(tab);
  }, [user, tab]);

  const loadTab = async (t) => {
    setLoading(true);
    try {
      if (t === 'overview') {
        const data = await adminAPI.stats();
        setStats(data);
      } else if (t === 'users') {
        const data = await adminAPI.users();
        setUsers(data.users || []);
      } else if (t === 'posts') {
        const data = await adminAPI.posts();
        setPosts(data.posts || []);
      } else if (t === 'reports') {
        const data = await adminAPI.reports(reportStatus);
        setReports(data.reports || []);
      } else if (t === 'diapers') {
        const data = await adminAPI.listDiapers();
        setDiapers(data.diapers || []);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (id) => {
    trigger(async () => {
      try {
        await adminAPI.deleteUser(id);
        setUsers(prev => prev.filter(u => u.id !== id));
        toast.success('已删除');
      } catch (e) { toast.error(e.message); }
    });
  };

  const handleBanUser = async (id) => {
    trigger(async () => {
      try {
        const data = await adminAPI.banUser(id);
        setUsers(prev => prev.map(u => u.id === id ? { ...u, banned: data.banned } : u));
        toast.success(data.banned ? '已封禁' : '已解封');
      } catch (e) { toast.error(e.message); }
    });
  };

  const handlePromoteUser = async (id) => {
    trigger(async () => {
      try {
        await adminAPI.promoteUser(id);
        setUsers(prev => prev.map(u => u.id === id ? { ...u, role: 'admin' } : u));
        toast.success('已提升为管理员');
      } catch (e) { toast.error(e.message); }
    });
  };

  const handlePinPost = async (id) => {
    try {
      const data = await adminAPI.pinPost(id);
      setPosts(prev => prev.map(p => p.id === id ? { ...p, pinned: data.pinned } : p));
      toast.success(data.pinned ? '已置顶' : '已取消置顶');
    } catch (e) { toast.error(e.message); }
  };

  const handleDeletePost = async (id) => {
    trigger(async () => {
      try {
        await adminAPI.deletePost(id);
        setPosts(prev => prev.filter(p => p.id !== id));
        toast.success('已删除');
      } catch (e) { toast.error(e.message); }
    });
  };

  // 纸尿裤管理
  const handleSaveDiaper = async () => {
    if (!diaperForm.brand || !diaperForm.model) { toast.error('品牌和型号为必填'); return; }
    setDiaperSaving(true);
    try {
      if (editingDiaper) {
        await adminAPI.updateDiaper(editingDiaper.id, diaperForm);
        toast.success('更新成功');
      } else {
        await adminAPI.createDiaper(diaperForm);
        toast.success('创建成功');
      }
      setShowDiaperForm(false);
      setEditingDiaper(null);
      setDiaperForm({ brand: '', model: '', product_type: '纸尿裤', absorbency_mfr: '', absorbency_adult: '', is_baby_diaper: 0, material: '', features: '', avg_price: '', official_url: '', images: [], sizes: [] });
      loadTab('diapers');
    } catch (e) { toast.error(e.message); }
    finally { setDiaperSaving(false); }
  };

  const handleEditDiaper = (d) => {
    setEditingDiaper(d);
    setDiaperForm({
      brand: d.brand || '', model: d.model || '', product_type: d.product_type || '纸尿裤',
      absorbency_mfr: d.absorbency_mfr || '', absorbency_adult: d.absorbency_adult || '',
      is_baby_diaper: d.is_baby_diaper || 0, material: d.material || '', features: d.features || '',
      avg_price: d.avg_price || '', official_url: d.official_url || '', images: d.images || [], sizes: d.sizes || [],
    });
    setShowDiaperForm(true);
  };

  const handleDeleteDiaper = async (id) => {
    trigger(async () => {
      try {
        await adminAPI.deleteDiaper(id);
        setDiapers(prev => prev.filter(d => d.id !== id));
        toast.success('已删除');
      } catch (e) { toast.error(e.message); }
    });
  };

  const handleDiaperImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('图片不能超过 5MB'); return; }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const token = localStorage.getItem('token');
      const API_BASE = import.meta.env.VITE_API_BASE || '';
      const res = await fetch(`${API_BASE}/api/images/upload?returnFormat=full`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '上传失败');
      setDiaperForm(f => ({ ...f, images: [...f.images, data.url] }));
      toast.success('图片已上传');
    } catch (err) { toast.error(err.message); }
    finally { e.target.value = ''; }
  };

  const handleRemoveDiaperImage = (idx) => {
    setDiaperForm(f => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));
  };



  if (!user || user.role !== 'admin') {
    return (
      <>
      <MobileHeader title="管理后台" />
      <PageLayout hero={{ icon: 'fa-shield-halved', title: '管理后台' }}>
        <div className="empty-state">
          <div className="icon"><i className="fa-solid fa-lock" /></div>
          <h3>无权访问</h3>
          <p>仅管理员可访问此页面</p>
          <Link to="/" className="btn btn-primary mt-4">返回首页</Link>
        </div>
      </PageLayout>
      </>
    );
  }

  return (
    <>
    <MobileHeader title="管理后台" />
    <PageLayout hero={{ icon: 'fa-shield-halved', title: '管理后台' }}>
      {/* 标签页 */}
      <TabBar tabs={TABS} value={tab} onChange={setTab} />

      {/* 概览 */}
      {tab === 'overview' && (
        loading ? <Spinner /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 admin-stats-grid">
            {[
              { label: '用户', value: stats?.users, icon: 'fa-users', color: 'var(--primary)' },
              { label: '帖子', value: stats?.posts, icon: 'fa-file-lines', color: 'var(--accent)' },
              { label: '评论', value: stats?.comments, icon: 'fa-comments', color: 'var(--primary-dark)' },
              { label: '产品', value: stats?.diapers, icon: 'fa-baby', color: 'var(--success)' },
              { label: '评分', value: stats?.ratings, icon: 'fa-star', color: 'var(--warning)' },
            ].map(s => (
              <div key={s.label} className="card text-center stagger-item animate-fade-in-up">
                <i className={`fa-solid ${s.icon} text-xl mb-1.5`} style={{ color: s.color }} />
                <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{s.value ?? '-'}</div>
                <div className="text-xs" style={{ color: 'var(--text-light)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )
      )}

      {/* 用户管理 */}
      {tab === 'users' && (
        loading ? <LoadingSkeleton count={5} height={60} /> : (
          <div className="space-y-2 miui-list-enter">
            {users.length === 0 ? (
              <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>暂无用户</p>
            ) : users.map(u => (
              <div key={u.id} className="card flex items-center gap-3 stagger-item animate-fade-in-up" style={{ padding: '0.75rem 1rem' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                  style={{ background: u.banned ? 'rgba(232,131,124,0.2)' : 'var(--primary-light)', color: u.banned ? 'var(--danger)' : 'var(--primary-dark)' }}>
                  {u.username?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{u.username}</span>
                    {u.role === 'admin' && <span className="tag" style={{ background: 'var(--accent)', color: 'white', fontSize: '0.65rem', padding: '1px 6px' }}>管理员</span>}
                    {u.banned && <span className="tag" style={{ background: 'var(--danger)', color: 'white', fontSize: '0.65rem', padding: '1px 6px' }}>已封禁</span>}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {u.email || '-'} · ID: {u.id} · 注册: {u.created_at ? new Date(u.created_at).toLocaleDateString('zh-CN') : '-'}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {u.role !== 'admin' && (
                    <>
                      <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        onClick={() => handlePromoteUser(u.id)} title="提升为管理员">
                        <i className="fa-solid fa-user-shield" />
                      </button>
                      <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        onClick={() => handleBanUser(u.id)} title={u.banned ? '解封' : '封禁'}>
                        <i className={`fa-solid ${u.banned ? 'fa-unlock' : 'fa-ban'}`} />
                      </button>
                      <button className="btn btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'var(--danger)', color: 'white' }}
                        onClick={() => handleDeleteUser(u.id)} title="删除用户">
                        <i className="fa-solid fa-trash" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* 帖子管理 */}
      {tab === 'posts' && (
        loading ? <LoadingSkeleton count={5} height={80} /> : (
          <div className="space-y-2 miui-list-enter">
            {posts.length === 0 ? (
              <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>暂无帖子</p>
            ) : posts.map(p => (
              <div key={p.id} className="card stagger-item animate-fade-in-up" style={{ padding: '0.75rem 1rem' }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {p.pinned && <i className="fa-solid fa-thumbtack text-xs" style={{ color: 'var(--warning)' }} title="已置顶" />}
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {p.user?.username || '匿名'} · {p.created_at ? new Date(p.created_at).toLocaleString('zh-CN') : '-'}
                      </span>
                    </div>
                    <Link to={`/forum/${p.id}`} className="text-sm hover:underline block" style={{ color: 'var(--text)', textDecoration: 'none' }}>
                      <p className="truncate">{p.content}</p>
                    </Link>
                    <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span><i className="fa-solid fa-heart mr-1" />{p.like_count || 0}</span>
                      <span><i className="fa-solid fa-comment mr-1" />{p.comment_count || 0}</span>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => handlePinPost(p.id)} title={p.pinned ? '取消置顶' : '置顶'}>
                      <i className={`fa-solid fa-thumbtack ${p.pinned ? '' : 'opacity-50'}`} />
                    </button>
                    <button className="btn btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'var(--danger)', color: 'white' }}
                      onClick={() => handleDeletePost(p.id)} title="删除帖子">
                      <i className="fa-solid fa-trash" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* 纸尿裤管理 */}
      {tab === 'diapers' && (
        <>
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm" style={{ color: 'var(--text-light)' }}>共 {diapers.length} 款产品</span>
            <button className="btn btn-primary btn-sm" onClick={() => { setShowDiaperForm(true); setEditingDiaper(null); setDiaperForm({ brand: '', model: '', product_type: '纸尿裤', absorbency_mfr: '', absorbency_adult: '', is_baby_diaper: 0, material: '', features: '', avg_price: '', images: [], sizes: [] }); }}>
              <i className="fa-solid fa-plus mr-1" /> 添加产品
            </button>
          </div>

          {/* 纸尿裤表单 */}
          {showDiaperForm && (
            <div className="card mb-4" style={{ padding: '1rem' }}>
              <h3 className="font-bold mb-3" style={{ color: 'var(--text)' }}>{editingDiaper ? '编辑纸尿裤' : '添加纸尿裤'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>品牌 *</label>
                  <input className="form-control" value={diaperForm.brand} onChange={e => setDiaperForm(f => ({ ...f, brand: e.target.value }))} placeholder="如：花王" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>型号 *</label>
                  <input className="form-control" value={diaperForm.model} onChange={e => setDiaperForm(f => ({ ...f, model: e.target.value }))} placeholder="如：妙而舒" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>产品类型</label>
                  <select className="form-control" value={diaperForm.product_type} onChange={e => setDiaperForm(f => ({ ...f, product_type: e.target.value }))}>
                    <option value="纸尿裤">纸尿裤</option>
                    <option value="拉拉裤">拉拉裤</option>
                    <option value="一体裤">一体裤</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>厂家标称吸水量</label>
                  <input className="form-control" value={diaperForm.absorbency_mfr} onChange={e => setDiaperForm(f => ({ ...f, absorbency_mfr: e.target.value }))} placeholder="如：600ml" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>成人估算吸水量</label>
                  <input className="form-control" value={diaperForm.absorbency_adult} onChange={e => setDiaperForm(f => ({ ...f, absorbency_adult: e.target.value }))} placeholder="如：500ml" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>参考价格</label>
                  <input className="form-control" value={diaperForm.avg_price} onChange={e => setDiaperForm(f => ({ ...f, avg_price: e.target.value }))} placeholder="如：￥3.5/片" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>官方网站</label>
                  <input className="form-control" value={diaperForm.official_url} onChange={e => setDiaperForm(f => ({ ...f, official_url: e.target.value }))} placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>是否婴儿纸尿裤</label>
                  <select className="form-control" value={diaperForm.is_baby_diaper} onChange={e => setDiaperForm(f => ({ ...f, is_baby_diaper: Number(e.target.value) }))}>
                    <option value={0}>成人</option>
                    <option value={1}>婴儿</option>
                  </select>
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>材质</label>
                <textarea className="form-control" value={diaperForm.material} onChange={e => setDiaperForm(f => ({ ...f, material: e.target.value }))} rows={2} placeholder="材质说明..." />
              </div>
              <div className="mb-3">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>特点</label>
                <textarea className="form-control" value={diaperForm.features} onChange={e => setDiaperForm(f => ({ ...f, features: e.target.value }))} rows={2} placeholder="产品特点..." />
              </div>

              {/* 图片上传 */}
              <div className="mb-3">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>产品图片</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {diaperForm.images.map((img, i) => (
                    <div key={i} className="relative">
                      <img src={img} alt="" className="w-20 h-20 object-cover rounded-lg" />
                      <button
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                        style={{ background: 'var(--danger)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '10px' }}
                        onClick={() => handleRemoveDiaperImage(i)}
                      >×</button>
                    </div>
                  ))}
                  <label className="w-20 h-20 rounded-lg flex items-center justify-center cursor-pointer" style={{ border: '2px dashed var(--border)', color: 'var(--text-muted)' }}>
                    <i className="fa-solid fa-plus" />
                    <input type="file" accept="image/*" hidden onChange={handleDiaperImageUpload} />
                  </label>
                </div>
              </div>

              {/* 尺码设置 */}
              <div className="mb-3">
                <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>尺码</label>
                <div className="space-y-2 mb-2">
                  {diaperForm.sizes.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input className="form-control" style={{ width: '60px', flexShrink: 0 }} value={s.label} onChange={e => {
                        const newSizes = [...diaperForm.sizes]; newSizes[i] = { ...s, label: e.target.value }; setDiaperForm(f => ({ ...f, sizes: newSizes }));
                      }} placeholder="M" />
                      <input type="number" className="form-control" style={{ width: '70px', flexShrink: 0 }} value={s.waist_min} onChange={e => {
                        const newSizes = [...diaperForm.sizes]; newSizes[i] = { ...s, waist_min: Number(e.target.value) }; setDiaperForm(f => ({ ...f, sizes: newSizes }));
                      }} placeholder="腰min" />
                      <input type="number" className="form-control" style={{ width: '70px', flexShrink: 0 }} value={s.waist_max} onChange={e => {
                        const newSizes = [...diaperForm.sizes]; newSizes[i] = { ...s, waist_max: Number(e.target.value) }; setDiaperForm(f => ({ ...f, sizes: newSizes }));
                      }} placeholder="腰max" />
                      <input type="number" className="form-control" style={{ width: '70px', flexShrink: 0 }} value={s.hip_min} onChange={e => {
                        const newSizes = [...diaperForm.sizes]; newSizes[i] = { ...s, hip_min: Number(e.target.value) }; setDiaperForm(f => ({ ...f, sizes: newSizes }));
                      }} placeholder="臀min" />
                      <input type="number" className="form-control" style={{ width: '70px', flexShrink: 0 }} value={s.hip_max} onChange={e => {
                        const newSizes = [...diaperForm.sizes]; newSizes[i] = { ...s, hip_max: Number(e.target.value) }; setDiaperForm(f => ({ ...f, sizes: newSizes }));
                      }} placeholder="臀max" />
                      <button className="btn btn-outline btn-sm" style={{ padding: '4px 8px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                        onClick={() => setDiaperForm(f => ({ ...f, sizes: f.sizes.filter((_, j) => j !== i) }))}>
                        <i className="fa-solid fa-xmark" />
                      </button>
                    </div>
                  ))}
                </div>
                <button className="btn btn-outline btn-sm" style={{ fontSize: '0.75rem' }}
                  onClick={() => setDiaperForm(f => ({ ...f, sizes: [...f.sizes, { label: '', waist_min: 0, waist_max: 0, hip_min: 0, hip_max: 0 }] }))}>
                  <i className="fa-solid fa-plus mr-1" /> 添加尺码
                </button>
              </div>

              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" onClick={handleSaveDiaper} disabled={diaperSaving}>
                  {diaperSaving ? <i className="fa-solid fa-spinner fa-spin mr-1" /> : null}
                  {editingDiaper ? '保存修改' : '创建'}
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => { setShowDiaperForm(false); setEditingDiaper(null); }}>取消</button>
              </div>
            </div>
          )}

          {/* 纸尿裤列表 */}
          {loading ? <LoadingSkeleton count={5} height={80} /> : (
            <div className="space-y-2">
              {diapers.length === 0 ? (
                <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>暂无产品</p>
              ) : diapers.map(d => (
                <div key={d.id} className="card stagger-item animate-fade-in-up" style={{ padding: '0.75rem 1rem' }}>
                  <div className="flex items-start gap-3">
                    {d.images?.length > 0 && (
                      <img src={d.images[0]} alt="" className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{d.brand} {d.model}</span>
                        <span className="tag" style={{ background: 'var(--input-bg)', color: 'var(--text-light)', fontSize: '0.65rem', padding: '1px 6px' }}>{d.product_type}</span>
                        {d.is_baby_diaper ? <span className="tag" style={{ background: 'rgba(255,183,197,0.2)', color: 'var(--accent-dark)', fontSize: '0.65rem', padding: '1px 6px' }}>婴儿</span> : null}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        厚度: {d.thickness}/5 · {d.sizes?.length > 0 ? d.sizes.map(s => s.label).join('/') : '未设尺码'} · {d.avg_price || '未设置价格'} · ID: {d.id}
                      </div>
                      {d.features && <p className="text-xs mt-1 truncate" style={{ color: 'var(--text-light)' }}>{d.features}</p>}
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleEditDiaper(d)} title="编辑">
                        <i className="fa-solid fa-pen" />
                      </button>
                      <button className="btn btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'var(--danger)', color: 'white' }} onClick={() => handleDeleteDiaper(d.id)} title="删除">
                        <i className="fa-solid fa-trash" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 举报管理 */}
      {tab === 'reports' && (
        <>
          <div className="flex gap-2 mb-4">
            {['pending', 'resolved', 'dismissed'].map(s => (
              <button
                key={s}
                className="btn btn-sm"
                onClick={() => { setReportStatus(s); loadTab('reports'); }}
                style={{
                  background: reportStatus === s ? 'var(--primary)' : 'var(--input-bg)',
                  color: reportStatus === s ? 'white' : 'var(--text)',
                  border: 'none', fontSize: '0.75rem',
                }}
              >
                {{ pending: '待处理', resolved: '已处理', dismissed: '已驳回' }[s]}
              </button>
            ))}
          </div>
          {loading ? <LoadingSkeleton count={5} height={80} /> : (
            <div className="space-y-2">
              {reports.length === 0 ? (
                <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>暂无举报</p>
              ) : reports.map(r => (
                <div key={r.id} className="card stagger-item animate-fade-in-up" style={{ padding: '0.75rem 1rem' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: r.reason === 'nsfw' ? 'rgba(232,131,124,0.15)' : 'var(--primary-light)', color: r.reason === 'nsfw' ? 'var(--danger)' : 'var(--primary-dark)' }}>
                      <i className="fa-solid fa-flag text-xs" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="tag" style={{
                          background: r.reason === 'nsfw' ? 'rgba(232,131,124,0.15)' : r.reason === 'spam' ? 'rgba(240,192,64,0.15)' : 'var(--input-bg)',
                          color: r.reason === 'nsfw' ? 'var(--danger)' : r.reason === 'spam' ? 'var(--warning)' : 'var(--text-light)',
                          fontSize: '0.65rem', padding: '1px 6px',
                        }}>
                          {{ nsfw: '敏感内容', spam: '垃圾广告', other: '其他' }[r.reason]}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          举报人: {r.reporter_name} · {r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : ''}
                        </span>
                      </div>
                      <p className="text-sm truncate" style={{ color: 'var(--text-light)' }}>{r.content_preview}</p>
                      {r.description && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>补充: {r.description}</p>}
                    </div>
                    {reportStatus === 'pending' && (
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          onClick={async () => { try { await adminAPI.resolveReport(r.id, 'resolve'); setReports(prev => prev.filter(x => x.id !== r.id)); toast.success('已处理'); } catch (e) { toast.error(e.message); } }}
                          title="处理">
                          <i className="fa-solid fa-check" />
                        </button>
                        <button className="btn btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'var(--danger)', color: 'white' }}
                          onClick={async () => { try { await adminAPI.resolveReport(r.id, 'resolve', true); setReports(prev => prev.filter(x => x.id !== r.id)); toast.success('已处理并删除内容'); } catch (e) { toast.error(e.message); } }}
                          title="处理并删除内容">
                          <i className="fa-solid fa-trash" />
                        </button>
                        <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          onClick={async () => { try { await adminAPI.resolveReport(r.id, 'dismiss'); setReports(prev => prev.filter(x => x.id !== r.id)); toast.success('已驳回'); } catch (e) { toast.error(e.message); } }}
                          title="驳回">
                          <i className="fa-solid fa-xmark" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}


    </PageLayout>
    <>{VerifyModal}</>
    </>
  );
}
