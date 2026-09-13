import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Modal, Loading, Empty, Pill, useConfirm } from './ui';
import { fmtFull } from './util';

const EMPTY_STATUS = { list: null, loading: false, error: '' };

export default function AdminDiapers() {
  const toast = useToast();
  const confirm = useConfirm();

  const [tab, setTab] = useState('diapers');
  const [diapers, setDiapers] = useState(EMPTY_STATUS);
  const [brands, setBrands] = useState(EMPTY_STATUS);
  const [form, setForm] = useState(null); // { mode: 'create'|'edit', data }
  const [brandForm, setBrandForm] = useState(null); // { mode, data }
  const [saving, setSaving] = useState(false);

  const loadDiapers = useCallback(async () => {
    setDiapers(s => ({ ...s, loading: true, error: '' }));
    try {
      const d = await adminAPI.listDiapers();
      setDiapers({ list: d.diapers || [], loading: false, error: '' });
    } catch (e) {
      setDiapers(s => ({ ...s, loading: false, error: e.message || '加载失败' }));
    }
  }, []);

  const loadBrands = useCallback(async () => {
    setBrands(s => ({ ...s, loading: true, error: '' }));
    try {
      const b = await adminAPI.listBrands();
      setBrands({ list: b.brands || [], loading: false, error: '' });
    } catch (e) {
      setBrands(s => ({ ...s, loading: false, error: e.message || '加载失败' }));
    }
  }, []);

  useEffect(() => { if (tab === 'diapers') loadDiapers(); else loadBrands(); }, [tab, loadDiapers, loadBrands]);

  const removeDiaper = async (d) => {
    const ok = await confirm({
      title: '删除纸尿裤条目',
      message: `将删除「${d.brand} ${d.model || ''}」（ID ${d.id}）。关联图片与尺码将被一并清理。`,
      okText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminAPI.deleteDiaper(d.id);
      toast.success('已删除');
      loadDiapers();
    } catch (e) {
      toast.error(e.message || '删除失败');
    }
  };

  const removeBrand = async (b) => {
    const ok = await confirm({
      title: '删除品牌',
      message: `将删除品牌「${b.name}」。`,
      okText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminAPI.deleteBrand(b.id);
      toast.success('已删除');
      loadBrands();
    } catch (e) {
      toast.error(e.message || '删除失败');
    }
  };

  const submitDiaper = async (payload) => {
    setSaving(true);
    try {
      if (form.mode === 'edit') {
        await adminAPI.updateDiaper(form.item.id, payload);
        toast.success('已更新');
      } else {
        await adminAPI.createDiaper(payload);
        toast.success('已创建');
      }
      setForm(null);
      loadDiapers();
    } catch (e) {
      toast.error(e.message || '保存失败');
    }
    setSaving(false);
  };

  const submitBrand = async (payload) => {
    setSaving(true);
    try {
      await adminAPI.saveBrand(payload);
      toast.success('已保存');
      setBrandForm(null);
      loadBrands();
    } catch (e) {
      toast.error(e.message || '保存失败');
    }
    setSaving(false);
  };

  return (
    <AdminLayout active="diapers">
      <div className="ac-page-stack">
        <div className="ac-tabs" role="tablist" aria-label="纸尿裤管理">
          <button type="button" role="tab" aria-selected={tab === 'diapers'} className={`ac-tab ${tab === 'diapers' ? 'active' : ''}`} onClick={() => setTab('diapers')}><i className="fa-solid fa-box-open" /> 纸尿裤 ({diapers.list?.length ?? 0})</button>
          <button type="button" role="tab" aria-selected={tab === 'brands'} className={`ac-tab ${tab === 'brands' ? 'active' : ''}`} onClick={() => setTab('brands')}><i className="fa-solid fa-tags" /> 品牌 ({brands.list?.length ?? 0})</button>
        </div>

        {tab === 'diapers' ? (
          <Card
            title="纸尿裤条目"
            icon="fa-box-open"
            action={<button type="button" className="ac-btn primary" onClick={() => setForm({ mode: 'create', item: null })}><i className="fa-solid fa-plus" /> 新建</button>}
          >
          {diapers.error && <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 0' }}>{diapers.error}</div>}
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 60 }}>ID</th>
                  <th scope="col">品牌 / 型号</th>
                  <th scope="col">产品类型</th>
                  <th scope="col">吸水量(厂商标注)</th>
                  <th scope="col">尺码数</th>
                  <th scope="col">参考价</th>
                  <th scope="col">创建时间</th>
                  <th scope="col" style={{ width: 110 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {(diapers.list || []).map(d => (
                  <tr key={d.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.id}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{d.brand}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.model || '-'}</div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {d.product_type || '-'}
                      {d.is_baby_diaper ? <Pill tone="blue" style={{ marginLeft: 6 }}>婴儿款</Pill> : null}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{d.absorbency_mfr || '-'}</td>
                    <td style={{ fontSize: 12.5 }}>{d.sizes?.length || 0}</td>
                    <td style={{ fontSize: 12.5 }}>{d.avg_price ? `¥${d.avg_price}` : '-'}</td>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtFull(d.created_at)}</td>
                    <td>
                      <div className="ac-table-actions">
                        <button type="button" className="ac-btn ac-icon-button" aria-label={`编辑纸尿裤「${d.brand} ${d.model || ''}」`} title={`编辑纸尿裤「${d.brand} ${d.model || ''}」`} onClick={() => setForm({ mode: 'edit', item: d })}><i className="fa-solid fa-pen" /></button>
                        <button type="button" className="ac-btn danger ac-icon-button" aria-label={`删除纸尿裤「${d.brand} ${d.model || ''}」`} title={`删除纸尿裤「${d.brand} ${d.model || ''}」`} onClick={() => removeDiaper(d)}><i className="fa-solid fa-trash-can" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!diapers.loading && !diapers.list?.length && <Empty text="暂无纸尿裤条目" />}
            {diapers.loading && !diapers.list && <Loading />}
          </div>
        </Card>
      ) : (
        <Card
          title="品牌管理"
          icon="fa-tags"
          action={<button type="button" className="ac-btn primary" onClick={() => setBrandForm({ mode: 'create', item: null })}><i className="fa-solid fa-plus" /> 新增品牌</button>}
        >
          {brands.error && <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 0' }}>{brands.error}</div>}
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr>
                  <th scope="col" style={{ width: 60 }}>ID</th>
                  <th scope="col">品牌名</th>
                  <th scope="col">Logo</th>
                  <th scope="col">深色反转</th>
                  <th scope="col">浅色反转</th>
                  <th scope="col">创建时间</th>
                  <th scope="col" style={{ width: 110 }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {(brands.list || []).map(b => (
                  <tr key={b.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.id}</td>
                    <td style={{ fontWeight: 600 }}>{b.name}</td>
                    <td>{b.logo ? <img src={b.logo} alt="" style={{ width: 40, height: 24, objectFit: 'contain' }} onError={e => { e.currentTarget.style.display = 'none'; }} /> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>-</span>}</td>
                    <td>{b.invert_dark ? <Pill tone="green">是</Pill> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>否</span>}</td>
                    <td>{b.invert_light ? <Pill tone="green">是</Pill> : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>否</span>}</td>
                    <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtFull(b.created_at)}</td>
                    <td>
                      <div className="ac-table-actions">
                        <button type="button" className="ac-btn ac-icon-button" aria-label={`编辑品牌「${b.name}」`} title={`编辑品牌「${b.name}」`} onClick={() => setBrandForm({ mode: 'edit', item: b })}><i className="fa-solid fa-pen" /></button>
                        <button type="button" className="ac-btn danger ac-icon-button" aria-label={`删除品牌「${b.name}」`} title={`删除品牌「${b.name}」`} onClick={() => removeBrand(b)}><i className="fa-solid fa-trash-can" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!brands.loading && !brands.list?.length && <Empty text="暂无品牌" />}
            {brands.loading && !brands.list && <Loading />}
          </div>
        </Card>
        )}
      </div>

      {/* 纸尿裤表单 */}
      <DiaperForm open={!!form} mode={form?.mode} item={form?.item} saving={saving} onClose={() => setForm(null)} onSubmit={submitDiaper} />

      {/* 品牌表单 */}
      <BrandForm open={!!brandForm} mode={brandForm?.mode} item={brandForm?.item} saving={saving} onClose={() => setBrandForm(null)} onSubmit={submitBrand} />
    </AdminLayout>
  );
}

function DiaperForm({ open, mode, item, saving, onClose, onSubmit }) {
  const toast = useToast();
  const [f, setF] = useState({});
  useEffect(() => {
    if (!open) return;
    setF(item ? {
      brand: item.brand || '', model: item.model || '', product_type: item.product_type || '',
      absorbency_mfr: item.absorbency_mfr || '', absorbency_adult: item.absorbency_adult || '',
      is_baby_diaper: item.is_baby_diaper ? 1 : 0, material: item.material || '', features: item.features || '',
      avg_price: item.avg_price || '', official_url: item.official_url || '',
      images: (item.images || []).join('\n'),
      sizes: (item.sizes || []).map(s => `${s.label}|${s.waist_min}|${s.waist_max}|${s.hip_min}|${s.hip_max}`).join('\n'),
    } : {
      brand: '', model: '', product_type: '', absorbency_mfr: '', absorbency_adult: '',
      is_baby_diaper: 0, material: '', features: '', avg_price: '', official_url: '',
      images: '', sizes: '',
    });
  }, [open, item]);

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  const submit = () => {
    if (!f.brand || !f.model || !f.product_type) { toast.error('品牌、型号、产品类型为必填'); return; }
    const sizes = (f.sizes || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [label, waist_min, waist_max, hip_min, hip_max] = l.split('|');
      return { label: (label || '').trim(), waist_min: Number(waist_min), waist_max: Number(waist_max), hip_min: Number(hip_min), hip_max: Number(hip_max) };
    }).filter(s => s.label);
    onSubmit({
      brand: f.brand.trim(), model: f.model.trim(), product_type: f.product_type.trim(),
      absorbency_mfr: f.absorbency_mfr, absorbency_adult: f.absorbency_adult,
      is_baby_diaper: f.is_baby_diaper, material: f.material, features: f.features,
      avg_price: f.avg_price, official_url: f.official_url || undefined,
      images: (f.images || '').split('\n').map(l => l.trim()).filter(Boolean),
      sizes,
    });
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={mode === 'edit' ? `编辑「${item?.brand || ''} ${item?.model || ''}」` : '新建纸尿裤'} footer={
      <>
        <button type="button" className="ac-btn" onClick={onClose}>取消</button>
        <button type="button" className="ac-btn primary" disabled={saving} onClick={submit}>{saving ? '保存中...' : '保存'}</button>
      </>
    }>
      <div className="ac-form-grid">
        <div className="ac-form-grid ac-form-grid-2">
          <label className="ac-form-field">
            <span className="ac-field-label">品牌 *</span>
            <input className="ac-input" style={{ width: '100%' }} value={f.brand || ''} onChange={e => set('brand', e.target.value)} />
          </label>
          <label className="ac-form-field">
            <span className="ac-field-label">型号 *</span>
            <input className="ac-input" style={{ width: '100%' }} value={f.model || ''} onChange={e => set('model', e.target.value)} />
          </label>
          <label className="ac-form-field">
            <span className="ac-field-label">产品类型 *</span>
            <input className="ac-input" style={{ width: '100%' }} value={f.product_type || ''} onChange={e => set('product_type', e.target.value)} placeholder="一次性/拉拉裤/布" />
          </label>
          <label className="ac-form-field">
            <span className="ac-field-label">参考价（元）</span>
            <input className="ac-input" style={{ width: '100%' }} value={f.avg_price || ''} onChange={e => set('avg_price', e.target.value)} />
          </label>
          <label className="ac-form-field">
            <span className="ac-field-label">吸水量（厂商）</span>
            <input className="ac-input" style={{ width: '100%' }} value={f.absorbency_mfr || ''} onChange={e => set('absorbency_mfr', e.target.value)} />
          </label>
          <label className="ac-form-field">
            <span className="ac-field-label">吸水量（成人实测）</span>
            <input className="ac-input" style={{ width: '100%' }} value={f.absorbency_adult || ''} onChange={e => set('absorbency_adult', e.target.value)} />
          </label>
          <label className="ac-form-field">
            <span className="ac-field-label">材质</span>
            <input className="ac-input" style={{ width: '100%' }} value={f.material || ''} onChange={e => set('material', e.target.value)} />
          </label>
          <label className="ac-form-field">
            <span className="ac-field-label">官方链接</span>
            <input className="ac-input" style={{ width: '100%' }} value={f.official_url || ''} onChange={e => set('official_url', e.target.value)} />
          </label>
        </div>
        <label className="ac-check-row">
          <input type="checkbox" checked={!!f.is_baby_diaper} onChange={e => set('is_baby_diaper', e.target.checked ? 1 : 0)} />
          <span>婴儿款纸尿裤</span>
        </label>
        <label className="ac-form-field">
          <span className="ac-field-label">特性（逗号分隔）</span>
          <input className="ac-input" style={{ width: '100%' }} value={f.features || ''} onChange={e => set('features', e.target.value)} placeholder="高腰围,透气,防侧漏" />
        </label>
        <label className="ac-form-field">
          <span className="ac-field-label">图片 URL（每行一个）</span>
          <textarea className="ac-textarea" style={{ width: '100%', minHeight: 60 }} value={f.images || ''} onChange={e => set('images', e.target.value)} />
        </label>
        <label className="ac-form-field">
          <span className="ac-field-label">尺码（每行：标签|腰围min|腰围max|臀围min|臀围max）</span>
          <textarea className="ac-textarea" style={{ width: '100%', minHeight: 70 }} value={f.sizes || ''} onChange={e => set('sizes', e.target.value)} placeholder={'M|60|70|80|90\nL|70|80|90|100'} />
        </label>
      </div>
    </Modal>
  );
}

function BrandForm({ open, mode, item, saving, onClose, onSubmit }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', logo: '', invert_dark: false, invert_light: false });
  useEffect(() => {
    if (!open) return;
    setF(item ? { name: item.name || '', logo: item.logo || '', invert_dark: !!item.invert_dark, invert_light: !!item.invert_light } : { name: '', logo: '', invert_dark: false, invert_light: false });
  }, [open, mode, item]);

  if (!open) return null;
  const submit = () => {
    if (!f.name.trim()) { toast.error('品牌名称必填'); return; }
    onSubmit({ name: f.name.trim(), logo: f.logo.trim() || undefined, invert_dark: f.invert_dark, invert_light: f.invert_light });
  };
  return (
    <Modal open={open} title={mode === 'edit' ? `编辑品牌「${item?.name || ''}」` : '新增品牌'} onClose={onClose} footer={
      <>
        <button type="button" className="ac-btn" onClick={onClose}>取消</button>
        <button type="button" className="ac-btn primary" disabled={saving} onClick={submit}>{saving ? '保存中...' : '保存'}</button>
      </>
    }>
      <div className="ac-form-grid">
        <div className="ac-form-grid ac-form-grid-2">
          <label className="ac-form-field">
            <span className="ac-field-label">品牌名称 *</span>
            <input className="ac-input" style={{ width: '100%' }} value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} />
          </label>
          <label className="ac-form-field">
            <span className="ac-field-label">Logo URL</span>
            <input className="ac-input" style={{ width: '100%' }} value={f.logo} onChange={e => setF(p => ({ ...p, logo: e.target.value }))} />
          </label>
        </div>
        <div className="ac-action-group">
          <label className="ac-check-row"><input type="checkbox" checked={f.invert_dark} onChange={e => setF(p => ({ ...p, invert_dark: e.target.checked }))} /> <span>深色主题反转</span></label>
          <label className="ac-check-row"><input type="checkbox" checked={f.invert_light} onChange={e => setF(p => ({ ...p, invert_light: e.target.checked }))} /> <span>浅色主题反转</span></label>
        </div>
      </div>
    </Modal>
  );
}