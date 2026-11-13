import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Modal, Avatar, Empty, Loading, ErrorBox, FormField, Toolbar, useConfirm } from './ui';
import { fmtDT } from './util';
import './member-ux.css';

const holderCount = value => value === null || value === undefined ? '未提供' : `${value} 人`;
export function badgeTargetBody(badgeKey, target) {
  const value = target.trim();
  if (!value) throw new Error('请输入用户名或用户 ID');
  return /^\d+$/.test(value) ? { badge_key: badgeKey, user_id: Number(value) } : { badge_key: badgeKey, username: value };
}
const badgeFields = item => ({ key: item?.key || '', name: item?.name || '', description: item?.description || '', color: item?.color || '#7C4DFF', icon: item?.icon ?? (item ? '' : 'verified') });

function BadgeActions({ badge, busy, onHolders, onGrant, onRevoke, onEdit, onDelete }) {
  return <div className="ac-member-actions ac-table-actions">
    <button type="button" className="ac-btn" disabled={busy} onClick={() => onHolders(badge)}>持有人</button>
    <button type="button" className="ac-btn" disabled={busy} onClick={() => onGrant(badge)}>颁发</button>
    <button type="button" className="ac-btn" disabled={busy} onClick={() => onRevoke(badge)}>收回</button>
    <button type="button" className="ac-btn" disabled={busy} aria-label={`编辑徽章「${badge.name}」`} onClick={() => onEdit(badge)}>编辑</button>
    <button type="button" className="ac-btn danger" disabled={busy} aria-label={`删除徽章「${badge.name}」`} onClick={() => onDelete(badge)}>删除</button>
  </div>;
}

export function BadgeResults({ badges, loading, error, busy, onRetry, ...actions }) {
  return <div aria-busy={loading}>
    {loading && (badges === null ? <Loading text="正在读取徽章定义…" /> : <p className="ac-member-notice" role="status">正在刷新徽章，保留上次成功结果；操作暂不可用。</p>)}
    {error && <div className="ac-member-retry"><ErrorBox msg={`${error}${badges === null ? '；尚无可用数据。' : '；下方为上次成功结果，不是最新数据。'}`} /><button type="button" className="ac-btn" disabled={loading} onClick={onRetry}>重试徽章列表</button></div>}
    {!!badges?.length && <>
      <div className="ac-table-wrap ac-desktop-only"><table className="ac-table"><caption className="ac-member-sr">徽章定义与管理操作</caption><thead><tr><th scope="col">徽章 / key</th><th scope="col">说明</th><th scope="col">颜色 / 图标</th><th scope="col">持有人</th><th scope="col">操作</th></tr></thead><tbody>{badges.map(badge => <tr key={badge.key}>
        <td><strong className="ac-member-long">{badge.name}</strong><div><code>{badge.key}</code></div></td><td className="ac-member-long">{badge.description || '暂无说明'}</td><td><span className="ac-badge-swatch" style={{ background: badge.color || 'var(--ac-violet)' }} /> <span>{badge.color || '未提供'}</span><div className="ac-member-long">{badge.icon || '未设置图标'}</div></td><td>{holderCount(badge.holders)}</td><td><BadgeActions badge={badge} busy={busy || loading || !!error} {...actions} /></td>
      </tr>)}</tbody></table></div>
      <div className="ac-mobile-only ac-member-records">{badges.map(badge => <article className="ac-member-record" key={badge.key} aria-label={`徽章 ${badge.name}`}>
        <h3 className="ac-member-record-title"><span className="ac-badge-swatch" style={{ background: badge.color || 'var(--ac-violet)' }} />{badge.name}</h3>
        <dl className="ac-member-kv"><div><dt>key</dt><dd><code>{badge.key}</code></dd></div><div><dt>持有人</dt><dd>{holderCount(badge.holders)}</dd></div><div><dt>说明</dt><dd className="ac-member-long">{badge.description || '暂无说明'}</dd></div><div><dt>颜色</dt><dd>{badge.color || '未提供'}</dd></div><div><dt>图标</dt><dd>{badge.icon || '未设置'}</dd></div></dl>
        <BadgeActions badge={badge} busy={busy || loading || !!error} {...actions} />
      </article>)}</div>
    </>}
    {!loading && !error && badges !== null && !badges.length && <Empty text="尚未创建任何徽章，可点击新建徽章" icon="fa-medal" />}
  </div>;
}

export default function AdminBadges() {
  const toast = useToast();
  const confirm = useConfirm();
  const [badges, setBadges] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [form, setForm] = useState(null);
  const [grant, setGrant] = useState(null);
  const [holders, setHolders] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const requests = useRef({ list: 0, holders: 0 });
  const holdersRef = useRef(null);
  holdersRef.current = holders;
  const mutation = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    // 捕获稳定对象而非数字快照，列表与持有人在 cleanup 时各自递增最新请求号。
    const counters = requests.current;
    alive.current = true;
    return () => { alive.current = false; counters.list++; counters.holders++; };
  }, []);

  const load = useCallback(async () => {
    const request = ++requests.current.list;
    setLoading(true); setError('');
    try {
      const data = await adminAPI.badges();
      if (alive.current && request === requests.current.list) setBadges(data.badges || []);
    } catch (error) {
      if (alive.current && request === requests.current.list) setError(error.message || '徽章读取失败');
    } finally { if (alive.current && request === requests.current.list) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openHolders = async badge => {
    const request = ++requests.current.holders;
    const previous = holdersRef.current?.key === badge.key ? holdersRef.current : null;
    setHolders({ key: badge.key, name: badge.name, list: previous?.list ?? null, total: previous?.total ?? null, loading: true, error: '' });
    try {
      const data = await adminAPI.badgeHolders(badge.key);
      if (alive.current && request === requests.current.holders) setHolders({ key: badge.key, name: badge.name, list: data.holders || [], total: data.total ?? null, loading: false, error: '' });
    } catch (error) {
      if (alive.current && request === requests.current.holders) setHolders(current => ({ ...current, loading: false, error: error.message || '持有人读取失败' }));
    }
  };
  const closeHolders = () => { requests.current.holders++; setHolders(null); };
  const openForm = (mode, item = null) => { setSaveError(''); setForm({ mode, item }); };
  const openGrant = (badge, revoke = false, target = '') => { setSaveError(''); setGrant({ key: badge.key, name: badge.name, revoke, target }); };
  const doRevoke = async badge => {
    if (mutation.current) return;
    const ok = await confirm({ title: '收回徽章', message: `将打开收回面板，输入用户名或用户 ID 以从该用户收回「${badge.name}」。`, okText: '继续' });
    if (ok && alive.current) openGrant(badge, true);
  };
  const remove = async badge => {
    if (mutation.current) return;
    const ok = await confirm({ title: `删除徽章「${badge.name}」`, message: `将删除徽章定义 ${badge.key}，并清空所有持有人记录（${badge.holders ?? '数量未提供'}）。此操作不可恢复。`, okText: '删除', danger: true });
    if (!ok || !alive.current || mutation.current) return;
    mutation.current = true; setSaving(true); setActionError('');
    try {
      await adminAPI.deleteBadge(badge.key);
      if (!alive.current) return;
      toast.success('徽章已删除');
      if (holdersRef.current?.key === badge.key) closeHolders();
      await load();
    } catch (error) { if (alive.current) setActionError(`删除「${badge.name}」失败：${error.message || '请重试'}。未隐藏该徽章。`); }
    finally { mutation.current = false; if (alive.current) setSaving(false); }
  };
  const submit = async payload => {
    if (mutation.current || !form) return;
    mutation.current = true; setSaving(true); setSaveError('');
    try {
      if (form.mode === 'edit') await adminAPI.updateBadge(form.item.key, payload);
      else await adminAPI.createBadge(payload);
      if (!alive.current) return;
      toast.success(form.mode === 'edit' ? '徽章已更新' : '徽章已创建'); setForm(null); await load();
    } catch (error) { if (alive.current) setSaveError(`${error.message || '保存失败'}；输入已保留，可重试。`); }
    finally { mutation.current = false; if (alive.current) setSaving(false); }
  };
  const submitGrant = async (badgeKey, target) => {
    if (mutation.current || !grant) return;
    let body;
    try { body = badgeTargetBody(badgeKey, target); } catch (error) { setSaveError(error.message); return; }
    if (grant.revoke) {
      const ok = await confirm({ title: '确认收回徽章', message: `从「${target.trim()}」收回「${grant.name}」（${badgeKey}）。确认目标无误后继续。`, okText: '确认收回', danger: true });
      if (!ok || !alive.current || mutation.current) return;
    }
    mutation.current = true; setSaving(true); setSaveError('');
    try {
      if (grant.revoke) await adminAPI.badgeRevoke(body);
      else await adminAPI.badgeGrant(body);
      if (!alive.current) return;
      toast.success(grant.revoke ? '徽章已收回' : '徽章已颁发'); setGrant(null);
      await load();
      if (holdersRef.current?.key === badgeKey) await openHolders({ key: badgeKey, name: grant.name });
    } catch (error) { if (alive.current) setSaveError(`${error.message || '提交失败'}；目标已保留，请核对后重试。`); }
    finally { mutation.current = false; if (alive.current) setSaving(false); }
  };

  return <AdminLayout active="badges"><div className="ac-page-stack ac-member-ux">
    <Card title="徽章定义" description="管理定义、持有人及发放记录。删除定义会清空全部持有人，收回仅影响指定用户。" icon="fa-medal" action={<div className="ac-action-group"><button type="button" className="ac-btn" disabled={loading || saving} onClick={load}>刷新徽章</button><button type="button" className="ac-btn primary" disabled={saving} onClick={() => openForm('create')}>新建徽章</button></div>}>
      <Toolbar result={badges === null ? '尚未取得定义数' : `上次成功读取 ${badges.length} 个定义`}><span className="ac-section-note">所有操作均有文字入口，移动端无需悬停。</span></Toolbar>
      <ErrorBox msg={actionError} />{saving && <p className="ac-member-notice" role="status">正在处理徽章操作，请勿重复提交。</p>}
      <BadgeResults badges={badges} loading={loading} error={error} busy={saving} onRetry={load} onHolders={openHolders} onGrant={openGrant} onRevoke={doRevoke} onEdit={badge => openForm('edit', badge)} onDelete={remove} />
    </Card>
    <BadgeForm open={!!form} mode={form?.mode} item={form?.item} saving={saving} error={saveError} onClose={() => { if (!mutation.current) setForm(null); }} onSubmit={submit} />
    <GrantModal open={!!grant} badge={grant} saving={saving} error={saveError} onClose={() => { if (!mutation.current) setGrant(null); }} onSubmit={submitGrant} />
    <Modal open={!!holders} onClose={closeHolders} title={`「${holders?.name || ''}」持有人 · ${holders?.total ?? '数量未提供'}`} width={680} className="ac-member-dialog">
      {holders && <div className="ac-member-ux"><Toolbar result={`徽章 key：${holders.key}`}><button type="button" className="ac-btn" disabled={holders.loading || saving} onClick={() => openHolders(holders)}>刷新持有人</button></Toolbar><BadgeHolders holders={holders} busy={saving} onRetry={() => openHolders(holders)} onRevoke={holder => openGrant(holders, true, String(holder.user_id))} /></div>}
    </Modal>
  </div></AdminLayout>;
}

export function BadgeHolders({ holders, busy, onRetry, onRevoke }) {
  return <div aria-busy={holders.loading}>
    {holders.loading && (holders.list === null ? <Loading text="正在读取持有人…" /> : <p className="ac-member-notice" role="status">正在刷新持有人；下方保留上次结果。</p>)}
    {holders.error && <div className="ac-member-retry"><ErrorBox msg={`${holders.error}；${holders.list === null ? '不能判定暂无持有人。' : '下方为上次成功结果。'}`} /><button type="button" className="ac-btn" disabled={holders.loading} onClick={onRetry}>重试持有人</button></div>}
    <div className="ac-member-records">{(holders.list || []).map(holder => <article className="ac-member-record" key={holder.user_id}>
      <div className="ac-member-record-head"><Avatar src={holder.avatar} size={32} /><a href={`/user/${holder.user_id}`} className="ac-member-long">@{holder.username}</a></div>
      <dl className="ac-member-kv"><div><dt>用户 ID</dt><dd>{holder.user_id}</dd></div><div><dt>解锁时间</dt><dd>{holder.unlocked_at ? fmtDT(holder.unlocked_at) : '未提供'}</dd></div><div><dt>确认时间</dt><dd>{holder.acknowledged_at ? fmtDT(holder.acknowledged_at) : '未确认'}</dd></div></dl>
      <button type="button" className="ac-btn danger" disabled={busy || holders.loading || !!holders.error} onClick={() => onRevoke(holder)}>从此用户收回</button>
    </article>)}</div>
    {!holders.loading && !holders.error && holders.list !== null && !holders.list.length && <Empty text="暂无持有人" />}
  </div>;
}

export function BadgeForm({ open, mode, item, saving, error, onClose, onSubmit }) {
  const confirm = useConfirm();
  const [fields, setFields] = useState(() => badgeFields(item));
  const [validation, setValidation] = useState('');
  useEffect(() => { if (open) { setFields(badgeFields(item)); setValidation(''); } }, [open, item]);
  if (!open) return null;
  const dirty = JSON.stringify(fields) !== JSON.stringify(badgeFields(item));
  const close = async () => {
    if (saving) return;
    if (dirty && !await confirm({ title: '放弃徽章更改？', message: '当前输入尚未保存，关闭后将丢弃。', okText: '放弃更改', danger: true })) return;
    onClose();
  };
  const set = (key, value) => { setFields(current => ({ ...current, [key]: value })); setValidation(''); };
  const submit = event => {
    event?.preventDefault(); if (saving) return;
    if (!/^[a-z0-9_]{1,64}$/.test(fields.key.trim())) { setValidation('key 仅允许 1–64 个小写字母、数字或下划线'); return; }
    if (!fields.name.trim()) { setValidation('名称必填'); return; }
    onSubmit({ key: fields.key.trim(), name: fields.name.trim(), description: fields.description.trim(), color: fields.color, icon: fields.icon.trim() });
  };
  return <Modal open={open} title={mode === 'edit' ? `编辑徽章 ${item?.key}` : '新建徽章'} onClose={close} className="ac-member-dialog" footer={<><button type="button" className="ac-btn" disabled={saving} onClick={close}>取消</button><button type="submit" form="member-badge-form" className="ac-btn primary" disabled={saving}>{saving ? '保存中…' : '保存徽章'}</button></>}>
    <form id="member-badge-form" className="ac-member-ux" onSubmit={submit}><ErrorBox msg={validation || error} /><p className="ac-member-notice" role="status">{saving ? '正在保存，请等待；期间不能关闭或再次提交。' : dirty ? '有未保存更改' : '尚无未保存更改'}{error ? '；失败不会清空输入。' : ''}</p>
      <fieldset className="ac-member-fieldset ac-form-grid" disabled={saving}>
        <FormField label="key" required htmlFor="member-badge-key" hint={mode === 'edit' ? '创建后不可更改 key。' : '1–64 个小写字母、数字或下划线。'}><input id="member-badge-key" className="ac-input" disabled={mode === 'edit'} value={fields.key} onChange={e => set('key', e.target.value)} placeholder="early_bird" /></FormField>
        <FormField label="名称" required htmlFor="member-badge-name"><input id="member-badge-name" className="ac-input" value={fields.name} onChange={e => set('name', e.target.value)} /></FormField>
        <FormField label="说明" htmlFor="member-badge-description"><textarea id="member-badge-description" className="ac-textarea" rows={4} value={fields.description} onChange={e => set('description', e.target.value)} /></FormField>
        <div className="ac-form-grid ac-form-grid-2"><FormField label="颜色（#RRGGBB）" htmlFor="member-badge-color"><input id="member-badge-color" type="color" value={fields.color} onChange={e => set('color', e.target.value)} /><span className="ac-section-note">{fields.color}</span></FormField><FormField label="图标 key" htmlFor="member-badge-icon" hint="App 内徽章图标标识，不是 Font Awesome 类名。"><input id="member-badge-icon" className="ac-input" value={fields.icon} onChange={e => set('icon', e.target.value)} placeholder="verified" /></FormField></div>
      </fieldset>
    </form>
  </Modal>;
}

export function GrantModal({ open, badge, saving, error, onClose, onSubmit }) {
  const confirm = useConfirm();
  const [target, setTarget] = useState(badge?.target || '');
  const [validation, setValidation] = useState('');
  useEffect(() => { if (open) { setTarget(badge?.target || ''); setValidation(''); } }, [open, badge?.key, badge?.revoke, badge?.target]);
  if (!open) return null;
  const revoke = !!badge?.revoke;
  const close = async () => {
    if (saving) return;
    if (target !== (badge?.target || '') && !await confirm({ title: '放弃此次输入？', message: '尚未提交目标用户，关闭后将丢弃输入。', okText: '放弃输入' })) return;
    onClose();
  };
  const submit = event => { event.preventDefault(); if (saving) return; if (!target.trim()) { setValidation('请输入用户名或用户 ID'); return; } onSubmit(badge.key, target); };
  return <Modal open={open} title={`${revoke ? '收回' : '颁发'}徽章「${badge?.name || badge?.key}」`} onClose={close} className="ac-member-dialog" footer={<><button type="button" className="ac-btn" disabled={saving} onClick={close}>取消</button><button type="submit" form="member-badge-grant" className={`ac-btn ${revoke ? 'danger solid' : 'primary'}`} disabled={saving}>{saving ? '提交中…' : revoke ? '核对并收回' : '确认颁发'}</button></>}>
    <form id="member-badge-grant" className="ac-member-ux ac-form-grid" onSubmit={submit}><ErrorBox msg={validation || error} /><p className="ac-member-notice" role="status">徽章 key：{badge?.key}。{saving ? '正在提交，请勿重复操作。' : revoke ? '仅收回指定用户的该徽章，不删除定义。' : '输入用户名（不含 @）或数字用户 ID。'}</p>
      <FormField label="用户名或用户 ID" required htmlFor="member-badge-target" hint="纯数字按用户 ID 提交；其余内容按用户名提交。"><input id="member-badge-target" className="ac-input" autoComplete="off" disabled={saving} value={target} onChange={e => { setTarget(e.target.value); setValidation(''); }} /></FormField>
    </form>
  </Modal>;
}
