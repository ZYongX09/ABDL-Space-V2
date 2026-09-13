import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Modal, Avatar, Empty, useConfirm } from './ui';
import { fmtDT } from './util';

export default function AdminBadges() {
  const toast = useToast();
  const confirm = useConfirm();
  const [badges, setBadges] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null); // { mode, item }
  const [grant, setGrant] = useState(null); // { badge }
  const [holders, setHolders] = useState(null); // { key, name, list }
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const d = await adminAPI.badges();
      setBadges(d.badges || []);
    } catch (e) {
      setError(e.message || '加载失败');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (b) => {
    const ok = await confirm({
      title: `删除徽章「${b.name}」`,
      message: `将删除徽章定义 ${b.key}，并清空所有持有人记录（${b.holders || 0} 个）。此操作不可恢复。`,
      okText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await adminAPI.deleteBadge(b.key);
      toast.success('徽章已删除');
      load();
    } catch (e) {
      toast.error(e.message || '删除失败');
    }
  };

  const submit = async (payload) => {
    setSaving(true);
    try {
      if (form.mode === 'edit') {
        await adminAPI.updateBadge(form.item.key, payload);
        toast.success('已更新');
      } else {
        await adminAPI.createBadge(payload);
        toast.success('已创建');
      }
      setForm(null);
      load();
    } catch (e) {
      toast.error(e.message || '保存失败');
    }
    setSaving(false);
  };

  const doGrant = async ({ badgeKey, target }) => {
    setSaving(true);
    try {
      const body = { badge_key: badgeKey };
      if (/^\d+$/.test(target.trim())) body.user_id = Number(target.trim());
      else body.username = target.trim();
      await adminAPI.badgeGrant(body);
      toast.success('已颁发');
      setGrant(null);
      load();
    } catch (e) {
      toast.error(e.message || '颁发失败');
    }
    setSaving(false);
  };

  const doRevoke = async (b) => {
    const ok = await confirm({
      title: '收回徽章',
      message: `将打开收回面板，输入用户名或用户 ID 以从该用户收回「${b.name}」。`,
      okText: '继续',
    });
    if (!ok) return;
    setGrant({ key: b.key, name: b.name, revoke: true });
  };

  const doRevokeSubmit = async (badgeKey, target) => {
    setSaving(true);
    try {
      const body = { badge_key: badgeKey };
      if (/^\d+$/.test(target.trim())) body.user_id = Number(target.trim());
      else body.username = target.trim();
      await adminAPI.badgeRevoke(body);
      toast.success('已收回');
      setGrant(null);
      load();
    } catch (e) {
      toast.error(e.message || '收回失败');
    }
    setSaving(false);
  };

  const openHolders = async (b) => {
    try {
      const d = await adminAPI.badgeHolders(b.key);
      setHolders({ key: b.key, name: b.name, color: b.color, list: d.holders || [], total: d.total || 0 });
    } catch (e) {
      toast.error(e.message || '加载失败');
    }
  };

  return (
    <AdminLayout active="badges">
      <div className="ac-page-stack">
        <Card
          title="徽章定义"
          icon="fa-medal"
          action={<button type="button" className="ac-btn primary" onClick={() => setForm({ mode: 'create', item: null })}><i className="fa-solid fa-plus" /> 新建徽章</button>}
        >
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 0' }}>{error}</div>}
          {!badges && <div className="ac-loading"><i className="fa-solid fa-spinner fa-spin" /> 加载中...</div>}
          <div className="ac-grid-3">
            {(badges || []).map(b => (
              <div key={b.key} className="ac-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="ac-flex" style={{ gap: 10 }}>
                  <span className="ac-badge-swatch" style={{ background: b.color || '#7C4DFF', width: 18, height: 18, borderRadius: 6 }} />
                  <div style={{ fontWeight: 700, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{b.holders ?? 0} 人持有</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-light)', lineHeight: 1.5, minHeight: 36 }}>{b.description || '暂无说明'}</div>
                <div className="ac-toolbar">
                  <div className="ac-toolbar-group">
                    <code style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--input-bg)', padding: '2px 8px', borderRadius: 6 }}>{b.key}</code>
                    {b.icon && <code style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--input-bg)', padding: '2px 8px', borderRadius: 6 }}>{b.icon}</code>}
                  </div>
                  <div className="ac-table-actions">
                    <button type="button" className="ac-btn" onClick={() => openHolders(b)}><i className="fa-solid fa-users" /> 持有人</button>
                    <button type="button" className="ac-btn" onClick={() => setGrant({ key: b.key, name: b.name })}><i className="fa-solid fa-gift" /> 颁发</button>
                    <button type="button" className="ac-btn" onClick={() => doRevoke(b)}><i className="fa-solid fa-rotate-left" /> 收回</button>
                    <button type="button" className="ac-btn ac-icon-button" aria-label={`编辑徽章「${b.name}」`} title={`编辑徽章「${b.name}」`} onClick={() => setForm({ mode: 'edit', item: b })}><i className="fa-solid fa-pen" /></button>
                    <button type="button" className="ac-btn danger ac-icon-button" aria-label={`删除徽章「${b.name}」`} title={`删除徽章「${b.name}」`} onClick={() => remove(b)}><i className="fa-solid fa-trash-can" /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {badges && !badges.length && <Empty text="尚未创建任何徽章" icon="fa-medal" />}
        </Card>
      </div>

      {/* 新建/编辑徽章 */}
      <BadgeForm open={!!form} mode={form?.mode} item={form?.item} saving={saving} onClose={() => setForm(null)} onSubmit={submit} />

      {/* 颁发 / 收回 */}
      <GrantModal open={!!grant} badge={grant} saving={saving} onClose={() => setGrant(null)} onSubmit={(key, target) => {
        if (grant?.revoke) doRevokeSubmit(key, target);
        else doGrant({ badgeKey: key, target });
      }} />

      {/* 持有人列表 */}
      <Modal open={!!holders} onClose={() => setHolders(null)} title={`「${holders?.name || ''}」持有人 (${holders?.total || 0})`} width={560}>
        {holders ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(holders.list || []).map(h => (
              <div key={h.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <Avatar src={h.avatar} size={32} />
                <a href={`/user/${h.user_id}`} style={{ color: 'var(--text)', fontWeight: 500, fontSize: 13, textDecoration: 'none' }}>@{h.username}</a>
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--text-muted)' }}>
                  解锁 {h.unlocked_at ? fmtDT(h.unlocked_at) : '-'}
                  {h.acknowledged_at ? ` · 已确认 ${fmtDT(h.acknowledged_at)}` : ' · 未确认'}
                </span>
              </div>
            ))}
            {!holders.list?.length && <Empty text="暂无持有人" />}
          </div>
        ) : <div className="ac-loading"><i className="fa-solid fa-spinner fa-spin" /> 加载中...</div>}
      </Modal>
    </AdminLayout>
  );
}

function BadgeForm({ open, mode, item, saving, onClose, onSubmit }) {
  const toast = useToast();
  const [f, setF] = useState({ key: '', name: '', description: '', color: '#7C4DFF', icon: 'verified' });
  useEffect(() => {
    if (!open) return;
    setF(item ? {
      key: item.key || '', name: item.name || '', description: item.description || '',
      color: item.color || '#7C4DFF', icon: item.icon || '',
    } : { key: '', name: '', description: '', color: '#7C4DFF', icon: 'verified' });
  }, [open, item]);
  if (!open) return null;
  const submit = () => {
    if (!/^[a-z0-9_]{1,64}$/.test(f.key.trim())) { toast.error('key 仅允许小写字母/数字/下划线'); return; }
    if (!f.name.trim()) { toast.error('名称必填'); return; }
    onSubmit({ key: f.key.trim(), name: f.name.trim(), description: f.description.trim(), color: f.color, icon: f.icon.trim() });
  };
  return (
    <Modal open={open} title={mode === 'edit' ? `编辑徽章 ${item?.key}` : '新建徽章'} onClose={onClose} footer={
      <>
        <button type="button" className="ac-btn" onClick={onClose}>取消</button>
        <button type="button" className="ac-btn primary" disabled={saving} onClick={submit}>{saving ? '保存中...' : '保存'}</button>
      </>
    }>
      <div className="ac-form-grid">
        <label className="ac-form-field">
          <span className="ac-field-label">key（仅创建时，小写字母/数字/下划线）*</span>
          <input className="ac-input" style={{ width: '100%' }} disabled={mode === 'edit'} value={f.key} onChange={e => setF(p => ({ ...p, key: e.target.value }))} placeholder="early_bird" />
        </label>
        <label className="ac-form-field">
          <span className="ac-field-label">名称 *</span>
          <input className="ac-input" style={{ width: '100%' }} value={f.name} onChange={e => setF(p => ({ ...p, name: e.target.value }))} />
        </label>
        <label className="ac-form-field">
          <span className="ac-field-label">说明</span>
          <textarea className="ac-textarea" style={{ width: '100%', minHeight: 60 }} value={f.description} onChange={e => setF(p => ({ ...p, description: e.target.value }))} />
        </label>
        <div className="ac-form-grid ac-form-grid-2">
          <label className="ac-form-field">
            <span className="ac-field-label">颜色（#RRGGBB）</span>
            <input type="color" value={f.color} onChange={e => setF(p => ({ ...p, color: e.target.value }))} style={{ width: 54, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', padding: 3 }} />
          </label>
          <label className="ac-form-field">
            <span className="ac-field-label">图标（App 内徽章图标 key）</span>
            <input className="ac-input" style={{ width: '100%' }} value={f.icon} onChange={e => setF(p => ({ ...p, icon: e.target.value }))} placeholder="verified" />
          </label>
        </div>
      </div>
    </Modal>
  );
}

function GrantModal({ open, badge, saving, onClose, onSubmit }) {
  const toast = useToast();
  const [target, setTarget] = useState('');
  const revoke = !!badge?.revoke;
  const key = badge?.key || '';
  const name = badge?.name || key;
  useEffect(() => { if (open) setTarget(''); }, [open]);
  if (!open) return null;
  const submit = () => {
    if (!target.trim()) { toast.error('请输入用户名或用户 ID'); return; }
    onSubmit(key, target);
  };
  return (
    <Modal open={open} title={revoke ? `收回徽章「${name}」` : `颁发徽章「${name}」`} onClose={onClose} footer={
      <>
        <button type="button" className="ac-btn" onClick={onClose}>取消</button>
        <button type="button" className="ac-btn primary" disabled={saving} onClick={submit}>{saving ? '提交中...' : '确认'}</button>
      </>
    }>
      <label className="ac-form-field">
        <span className="ac-field-label">用户名或用户 ID</span>
        <span className="ac-field-hint">{revoke ? '该操作将移除指定用户的该徽章。' : '输入用户名（不含 @）或用户 ID。'}</span>
        <input className="ac-input" autoFocus placeholder="用户名或数字 ID" value={target} onChange={e => setTarget(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
      </label>
    </Modal>
  );
}