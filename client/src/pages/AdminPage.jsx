import { useState, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import { LoadingSkeleton, Spinner } from '../components/Feedback';
import TabBar from '../components/TabBar';
import { adminAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useVerifyModal } from '../components/VerifyModal';
import { Link } from 'react-router-dom';
import { uploadImage } from '../utils/imageUpload';

const TABS = [
  { key: 'overview', label: '概览', icon: 'fa-chart-pie' },
  { key: 'users', label: '用户', icon: 'fa-users' },
  { key: 'posts', label: '帖子', icon: 'fa-file-lines' },
  { key: 'diapers', label: '纸尿裤', icon: 'fa-baby' },
  { key: 'brands', label: '品牌', icon: 'fa-copyright' },
  { key: 'reports', label: '举报', icon: 'fa-flag' },
  { key: 'security', label: '安全', icon: 'fa-shield-halved' },
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
  const [brands, setBrands] = useState([]);
  const [secLogs, setSecLogs] = useState([]);
  const [secStats, setSecStats] = useState(null);
  const [secTotal, setSecTotal] = useState(0);
  const [secPage, setSecPage] = useState(1);
  const [secFilter, setSecFilter] = useState('');
  const [brandForm, setBrandForm] = useState({ name: '', logo: '', invert_dark: false, invert_light: false });
  const [showBrandForm, setShowBrandForm] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandUploading, setBrandUploading] = useState(false);

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
      } else if (t === 'brands') {
        const data = await adminAPI.listBrands();
        setBrands(data.brands || []);
      } else if (t === 'reports') {
        const data = await adminAPI.reports(reportStatus);
        setReports(data.reports || []);
      } else if (t === 'diapers') {
        const data = await adminAPI.listDiapers();
        setDiapers(data.diapers || []);
      } else if (t === 'security') {
        const [logsData, statsData] = await Promise.all([
          adminAPI.getSecurityLogs(secPage, 50, secFilter),
          adminAPI.getSecurityStats(),
        ]);
        setSecLogs(logsData.logs || []);
        setSecTotal(logsData.total || 0);
        setSecStats(statsData);
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
      const API_BASE = import.meta.env.VITE_API_BASE || '';
      const res = await fetch(`${API_BASE}/api/images/upload?returnFormat=full`, {
        method: 'POST',
        credentials: 'include',
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
    <PageLayout hero={{ icon: 'fa-shield-halved', title: '管理后台' }}>
      {/* 标签页 */}
      <TabBar tabs={TABS} value={tab} onChange={setTab} />

      {/* 概览 */}
      {tab === 'overview' && (
        loading ? <Spinner /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 admin-stats-grid">
            {[
              { label: '用户', value: stats?.users, icon: 'fa-users', color: 'var(--primary)' },
              { label: '帖子', value: stats?.posts, icon: 'fa-file-lines', color: 'var(--accent)' },
              { label: '评论', value: stats?.comments, icon: 'fa-comments', color: 'var(--primary-dark)' },
              { label: '产品', value: stats?.diapers, icon: 'fa-baby', color: 'var(--success)' },
              { label: '评分', value: stats?.ratings, icon: 'fa-star', color: 'var(--warning)' },
              { label: 'App 用户', value: stats?.appUsers, icon: 'fa-mobile-screen', color: '#89CFF0' },
            ].map(s => (
              <div key={s.label} className="card text-center">
                <i className={`fa-solid ${s.icon} text-xl mb-1.5`} style={{ color: s.color }} />
                <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{s.value ?? '-'}</div>
                <div className="text-xs" style={{ color: 'var(--text-light)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        )
      )}

      {/* 推送管理入口 */}
      {tab === 'overview' && !loading && (
        <div className="mt-4">
          <Link to="/admin/notifications" className="card flex items-center gap-3 hover-lift" style={{ padding: '1rem', cursor: 'pointer' }}>
            <i className="fa-solid fa-bell" style={{ color: 'var(--primary)', fontSize: 20 }} />
            <div className="flex-1">
              <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>推送通知管理</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>管理 Web Push 和极光推送</div>
            </div>
            <i className="fa-solid fa-chevron-right" style={{ fontSize: 11, color: 'var(--text-light)' }} />
          </Link>
        </div>
      )}

      {/* 用户管理 */}
      {tab === 'users' && (
        loading ? <LoadingSkeleton count={5} height={60} /> : (
          <div className="space-y-2 miui-list-enter">
            {users.length === 0 ? (
              <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>暂无用户</p>
            ) : users.map(u => (
              <div key={u.id} className="card flex items-center gap-3" style={{ padding: '0.75rem 1rem' }}>
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
              <div key={p.id} className="card" style={{ padding: '0.75rem 1rem' }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {p.pinned && <i className="fa-solid fa-thumbtack text-xs" style={{ color: 'var(--warning)' }} title="已置顶" />}
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {p.user?.username || '匿名'} · {p.created_at ? new Date(p.created_at + 'Z').toLocaleString('zh-CN') : '-'}
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
                <div key={d.id} className="card" style={{ padding: '0.75rem 1rem' }}>
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

      {/* 品牌管理 */}
      {tab === 'brands' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm" style={{ color: 'var(--text-light)' }}>共 {brands.length} 个品牌</span>
            <button className="btn btn-primary btn-sm" onClick={() => { setEditingBrand(null); setBrandForm({ name: '', logo: '', invert_dark: false, invert_light: false }); setShowBrandForm(true); }}>
              <i className="fa-solid fa-plus mr-1" />添加品牌
            </button>
          </div>

          {/* 品牌表单 */}
          {showBrandForm && (
            <div className="card mb-4" style={{ padding: '1rem' }}>
              <h3 className="font-bold mb-3" style={{ color: 'var(--text)' }}>{editingBrand ? '编辑品牌' : '添加品牌'}</h3>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>品牌名称 *</label>
                  <input className="form-control" value={brandForm.name} onChange={e => setBrandForm(f => ({ ...f, name: e.target.value }))} placeholder="如：花王" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-light)' }}>品牌图标</label>
                  <div className="flex items-center gap-3">
                    {brandForm.logo && <img src={brandForm.logo} alt="" className="w-12 h-12 object-contain rounded-lg" style={{ background: 'var(--input-bg)' }} />}
                    <input type="file" accept="image/*" className="text-sm" onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      setBrandUploading(true);
                      try { const url = await uploadImage(file); setBrandForm(f => ({ ...f, logo: url })); toast.success('上传成功'); } catch(err) { toast.error('上传失败'); } finally { setBrandUploading(false); }
                    }} />
                    {brandUploading && <span className="text-xs" style={{ color: 'var(--primary-dark)' }}>上传中...</span>}
                  </div>
                </div>
                {brandForm.logo && (
                  <div>
                    <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--text-light)' }}>颜色反转（解决深色/浅色背景下 logo 不清晰问题）</label>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={brandForm.invert_dark} onChange={e => setBrandForm(f => ({ ...f, invert_dark: e.target.checked }))} className="w-4 h-4 rounded accent-[var(--primary-dark)]" />
                        <span className="text-sm" style={{ color: 'var(--text)' }}>深色模式反转</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>深色背景下自动反转 logo 颜色</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={brandForm.invert_light} onChange={e => setBrandForm(f => ({ ...f, invert_light: e.target.checked }))} className="w-4 h-4 rounded accent-[var(--primary-dark)]" />
                        <span className="text-sm" style={{ color: 'var(--text)' }}>浅色/多彩模式反转</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>浅色背景下自动反转 logo 颜色</span>
                      </label>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button className="btn btn-primary" onClick={async () => {
                    if (!brandForm.name.trim()) { toast.error('品牌名称为必填'); return; }
                    setBrandSaving(true);
                    try {
                      await adminAPI.saveBrand({ name: brandForm.name.trim(), logo: brandForm.logo, invert_dark: brandForm.invert_dark, invert_light: brandForm.invert_light });
                      toast.success(editingBrand ? '更新成功' : '创建成功');
                      setShowBrandForm(false);
                      loadTab('brands');
                    } catch (e) { toast.error(e.message); }
                    finally { setBrandSaving(false); }
                  }} disabled={brandSaving || brandUploading}>{brandSaving ? '保存中...' : brandUploading ? '上传中...' : '保存'}</button>
                  <button className="btn btn-outline" onClick={() => setShowBrandForm(false)}>取消</button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {brands.map(b => (
              <div key={b.id} className="card flex items-center gap-3" style={{ padding: '0.75rem 1rem' }}>
                {b.logo ? <img src={b.logo} alt={b.name} className="w-10 h-10 object-contain rounded" style={{ background: 'var(--input-bg)' }} /> : <div className="w-10 h-10 rounded bg-[var(--input-bg)] flex items-center justify-center text-[var(--text-muted)] text-xs">无</div>}
                <span className="flex-1 font-semibold">{b.name}</span>
                <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => { setEditingBrand(b); setBrandForm({ name: b.name, logo: b.logo || '', invert_dark: b.invert_dark || false, invert_light: b.invert_light || false }); setShowBrandForm(true); }}>编辑</button>
                <button className="btn btn-outline btn-sm" style={{ padding: '4px 10px', fontSize: '0.75rem', color: 'var(--danger)' }} onClick={() => trigger(async () => { try { await adminAPI.deleteBrand(b.id); setBrands(prev => prev.filter(x => x.id !== b.id)); toast.success('已删除'); } catch (e) { toast.error(e.message); } })}>删除</button>
              </div>
            ))}
            {brands.length === 0 && !loading && <div className="text-center py-8 text-sm" style={{ color: 'var(--text-light)' }}>暂无品牌</div>}
          </div>
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
                <div key={r.id} className="card" style={{ padding: '0.75rem 1rem' }}>
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
                          举报人: {r.reporter_name} · {r.created_at ? new Date(r.created_at + 'Z').toLocaleString('zh-CN') : ''}
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

      {/* ====== 安全中心 ====== */}
      {tab === 'security' && (
        <>
          {loading ? <LoadingSkeleton count={3} height={120} /> : (
            <>
              {/* 统计卡片 */}
              {secStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                  <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
                    <div className="text-2xl font-bold" style={{ color: 'var(--danger)' }}>{secStats.dayCount}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>24h 可疑事件</div>
                  </div>
                  <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
                    <div className="text-2xl font-bold" style={{ color: 'var(--warning)' }}>{secStats.weekCount}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>7天 可疑事件</div>
                  </div>
                  <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
                    <div className="text-2xl font-bold" style={{ color: 'var(--primary-dark)' }}>
                      {secStats.scoreDistribution?.find(s => s.level === 'critical')?.cnt || 0}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>高危事件</div>
                  </div>
                  <div className="card" style={{ padding: '14px', textAlign: 'center' }}>
                    <div className="text-2xl font-bold" style={{ color: 'var(--success)' }}>
                      {secStats.scoreDistribution?.find(s => s.level === 'normal')?.cnt || 0}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>正常事件</div>
                  </div>
                </div>
              )}

              {/* 事件类型分布 + 24h趋势 */}
              {secStats && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                  <div className="card" style={{ padding: '16px' }}>
                    <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>
                      <i className="fa-solid fa-chart-bar mr-2" style={{ color: 'var(--primary-dark)' }} />事件类型分布
                    </h3>
                    {secStats.typeStats?.length > 0 ? (
                      <div className="space-y-2">
                        {secStats.typeStats.map(t => (
                          <div key={t.event_type} className="flex items-center gap-2">
                            <span className="text-xs" style={{ color: 'var(--text-muted)', minWidth: 120 }}>{t.event_type}</span>
                            <div className="flex-1 h-4 rounded" style={{ background: 'var(--input-bg)', overflow: 'hidden' }}>
                              <div className="h-full rounded" style={{
                                width: `${Math.min(100, (t.cnt / Math.max(...secStats.typeStats.map(x => x.cnt))) * 100)}%`,
                                background: 'var(--primary)',
                                transition: 'width 0.3s',
                              }} />
                            </div>
                            <span className="text-xs font-bold" style={{ color: 'var(--text)', minWidth: 30, textAlign: 'right' }}>{t.cnt}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>暂无数据</p>
                    )}
                  </div>

                  <div className="card" style={{ padding: '16px' }}>
                    <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text)' }}>
                      <i className="fa-solid fa-chart-line mr-2" style={{ color: 'var(--primary-dark)' }} />24h 趋势
                    </h3>
                    {secStats.trend?.length > 0 ? (
                      <div className="flex items-end gap-1" style={{ height: 80 }}>
                        {secStats.trend.map((t, i) => {
                          const maxCnt = Math.max(...secStats.trend.map(x => x.cnt));
                          const h = maxCnt > 0 ? (t.cnt / maxCnt) * 100 : 0;
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center justify-end" style={{ height: '100%' }}>
                              <div className="w-full rounded-t" style={{
                                height: `${h}%`,
                                background: t.cnt > 5 ? 'var(--danger)' : t.cnt > 2 ? 'var(--warning)' : 'var(--primary)',
                                minHeight: t.cnt > 0 ? 4 : 0,
                                transition: 'height 0.3s',
                              }} />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>暂无数据</p>
                    )}
                  </div>
                </div>
              )}

              {/* 筛选 */}
              <div className="flex gap-2 mb-4">
                {['', 'low_behavior_score', 'context_mismatch', 'tamper_detected'].map(t => (
                  <button key={t} className="btn btn-sm" onClick={() => { setSecFilter(t); setSecPage(1); loadTab('security'); }}
                    style={{
                      background: secFilter === t ? 'var(--primary)' : 'var(--input-bg)',
                      color: secFilter === t ? 'white' : 'var(--text)',
                      border: 'none', fontSize: '0.72rem',
                    }}>
                    {{ '': '全部', low_behavior_score: '低行为分', context_mismatch: '上下文异常', tamper_detected: '篡改检测' }[t]}
                  </button>
                ))}
              </div>

              {/* 日志列表 */}
              <div className="space-y-2">
                {secLogs.length === 0 ? (
                  <p className="text-center text-sm py-8" style={{ color: 'var(--text-muted)' }}>暂无安全日志</p>
                ) : secLogs.map(log => {
                  const details = (() => { try { return JSON.parse(log.details || '{}'); } catch { return {}; } })();
                  const scoreColor = log.score < 20 ? 'var(--danger)' : log.score < 40 ? 'var(--warning)' : log.score < 60 ? 'var(--primary-dark)' : 'var(--success)';
                  const levelLabel = log.score < 20 ? '高危' : log.score < 40 ? '警告' : log.score < 60 ? '注意' : '正常';
                  return (
                    <div key={log.id} className="card" style={{ padding: '12px 16px' }}>
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: scoreColor + '20', color: scoreColor }}>
                          <i className="fa-solid fa-shield-halved" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="tag" style={{ background: scoreColor + '20', color: scoreColor, fontSize: '0.65rem', padding: '1px 6px' }}>{levelLabel}</span>
                            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{log.event_type}</span>
                            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                              {log.created_at ? new Date(log.created_at * 1000).toLocaleString('zh-CN') : ''}
                            </span>
                          </div>
                          <div className="text-xs space-y-0.5" style={{ color: 'var(--text-light)' }}>
                            <div>行为评分: <strong style={{ color: scoreColor }}>{log.score}</strong>/100</div>
                            {log.session_id && <div>会话: <span className="font-mono">{log.session_id.slice(0, 16)}...</span></div>}
                            {details.behavior?.totalTime && <div>总用时: {details.behavior.totalTime}ms</div>}
                            {details.behavior?.clickTimes && <div>点击次数: {details.behavior.clickTimes.length}</div>}
                            {details.behavior?.轨迹 && <div>鼠标轨迹点: {details.behavior.轨迹.length}</div>}
                            {details.behavior?.touchUsed && <div>使用了触摸: <span style={{ color: 'var(--warning)' }}>是</span></div>}
                            {details.behavior?.screen && <div>屏幕: {details.behavior.screen}</div>}
                            {details.behavior?.tz && <div>时区: {details.behavior.tz}</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 分页 */}
              {secTotal > 50 && (
                <div className="flex justify-center gap-2 mt-4">
                  <button className="btn btn-sm btn-outline" disabled={secPage <= 1}
                    onClick={() => { setSecPage(p => p - 1); loadTab('security'); }}>上一页</button>
                  <span className="text-sm" style={{ color: 'var(--text-muted)', padding: '6px 12px' }}>
                    {secPage} / {Math.ceil(secTotal / 50)}
                  </span>
                  <button className="btn btn-sm btn-outline" disabled={secPage >= Math.ceil(secTotal / 50)}
                    onClick={() => { setSecPage(p => p + 1); loadTab('security'); }}>下一页</button>
                </div>
              )}
            </>
          )}
        </>
      )}

    </PageLayout>
    <>{VerifyModal}</>
    </>
  );
}
