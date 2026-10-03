import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { createAdminIdentityAPI } from '../../adminIdentity/api.js';
import { operationKeeper, validateUnbindInput } from '../../adminIdentity/model.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Pill, Pagination, Loading, Empty, Drawer, ErrorBox, FormField, Modal, UserCell, useConfirm } from './ui';
import { fmtDT, fmtFull, fmtNum } from './util';

const PAGE_SIZE = 20;
const METHOD_LABELS = { password: '密码', email: '邮箱', nbw: 'NBW', passkey: 'Passkey' };
const AUDIT_ACTIONS = { qq_unbind: '解绑 QQ' };

function pickQQ(identity) { return identity?.methods?.qq || null; }
function qqVersion(method) { return method?.updated_at; }
function qqNickname(method) { return method?.nickname || ''; }
function qqAvatar(method) { return method?.avatar || ''; }

function LoginMethods({ identity, onUnbind }) {
  const methods = identity?.methods || {};
  const qq = pickQQ(identity);
  const standard = ['password', 'email', 'nbw', 'passkey'];
  return <section className="ac-identity-section">
    <div className="ac-identity-heading"><div><h3>登录方式</h3><p>仅展示后端允许管理员查看的状态与第三方身份资料。</p></div>{qq?.bound === true && <Pill tone="blue">QQ 已绑定</Pill>}</div>
    <div className="ac-login-method-grid">
      {standard.map(type => {
        const bound = type === 'email' ? methods.verified_email === true : type === 'passkey' ? Number(methods.passkeys?.count || 0) > 0 : methods[type] === true;
        return <div className="ac-login-method" key={type}>
          <span className="ac-login-method-icon"><i className={`fa-solid ${type === 'password' ? 'fa-key' : type === 'email' ? 'fa-envelope' : type === 'passkey' ? 'fa-fingerprint' : 'fa-link'}`} /></span>
          <div><strong>{METHOD_LABELS[type]}</strong><span>{bound ? '已启用' : '未启用'}</span></div>
          <Pill tone={bound ? 'green' : 'slate'}>{bound ? '可用' : '未设置'}</Pill>
        </div>;
      })}
    </div>
    <div className="ac-qq-card">
      <div className="ac-qq-profile">
        <span className="ac-qq-avatar">
          {qqAvatar(qq) ? <img src={qqAvatar(qq)} alt="QQ 头像" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} /> : null}
          <i className="fa-brands fa-qq" aria-hidden="true" />
        </span>
        <div className="ac-grow"><div className="ac-qq-title">QQ {qq?.bound === true ? '已绑定' : '未绑定'}</div><div className="ac-qq-nickname">{qqNickname(qq) || '未提供 QQ 昵称'}</div></div>
        {qq?.bound === true && <button type="button" className="ac-btn danger" onClick={() => onUnbind(qq)} disabled={qq.can_unbind !== true} title={qq.can_unbind === true ? '解绑该用户的 QQ 身份' : (qq.block_reason || '后端不允许解绑')}>管理解绑</button>}
      </div>
      {qq?.bound === true ? <dl className="ac-qq-meta">
        <div><dt>绑定时间</dt><dd>{fmtFull(qq.created_at)}</dd></div>
        <div><dt>更新时间</dt><dd>{fmtFull(qq.updated_at)}</dd></div>
        <div><dt>绑定版本</dt><dd>{qqVersion(qq) ?? '—'}</dd></div>
        <div><dt>允许解绑</dt><dd>{qq.can_unbind === true ? '是' : `否${qq.block_reason ? ` · ${qq.block_reason}` : ''}`}</dd></div>
      </dl> : <div className="ac-section-note">该用户当前没有 QQ 第三方身份。主站不提供 QQ 登录或绑定入口。</div>}
    </div>
  </section>;
}

function IdentityAudit({ items }) {
  return <section className="ac-identity-section">
    <div className="ac-identity-heading"><div><h3>最近身份审计</h3><p>查看管理员对第三方身份执行的最近操作。</p></div></div>
    {items?.length ? <div className="ac-identity-audit">{items.map((item, index) => <div className="ac-identity-audit-row" key={item.id || `${item.created_at || item.createdAt}-${index}`}>
      <div><strong>{AUDIT_ACTIONS[item.action] || item.action || '身份操作'}</strong><span>管理员 {item.actor?.username || (item.actor?.id ? `ID ${item.actor.id}` : '—')} · {fmtFull(item.created_at || item.createdAt)}</span></div>
      <Pill tone="green">成功</Pill>
      <p>{item.reason || '未记录理由'}</p>
    </div>)}</div> : <Empty text="暂无身份审计记录" icon="fa-clipboard-list" />}
  </section>;
}

export default function AdminUsers() {
  const toast = useToast();
  const confirm = useConfirm();
  const { user: admin, accounts } = useAuth();
  const session = useRef(null);
  const token = accounts?.find(account => String(account.id) === String(admin?.id))?.token || '';
  session.current = { id: admin?.id, token };
  const identityAPI = useMemo(() => createAdminIdentityAPI({
    base: import.meta.env.VITE_API_BASE ?? '',
    getToken: () => token,
    isCurrentSession: () => session.current?.id === admin?.id && session.current?.token === token,
  }), [admin?.id, token]);
  const operations = useRef(operationKeeper());

  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [qqBound, setQqBound] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [unbind, setUnbind] = useState(null);
  const [errors, setErrors] = useState('');

  useEffect(() => () => { session.current = null; }, []);

  const load = useCallback(async (p, query, selectedRole, selectedQQ) => {
    setLoading(true); setErrors('');
    try {
      const data = await adminAPI.users({ page: p, limit: PAGE_SIZE, q: query || '', role: selectedRole || '', qq_bound: selectedQQ || '' });
      setList(data.users || []); setPagination(data.pagination || { page: 1, total: 0, totalPages: 1 });
    } catch (e) { setErrors(e.message || '加载失败'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(page, q, role, qqBound); }, [page, q, role, qqBound, load]);

  const openDetail = async (u) => {
    setDetail({ userId: u.id, loading: true, info: null, identity: null, error: '', identityError: '' });
    const [infoResult, identityResult] = await Promise.allSettled([adminAPI.userDetail(u.id), identityAPI.detail(u.id)]);
    setDetail(current => current?.userId === u.id ? {
      userId: u.id,
      loading: false,
      info: infoResult.status === 'fulfilled' ? infoResult.value : null,
      identity: identityResult.status === 'fulfilled' ? identityResult.value : null,
      error: infoResult.status === 'rejected' ? (infoResult.reason?.message || '用户详情加载失败') : '',
      identityError: identityResult.status === 'rejected' ? (identityResult.reason?.message || '身份详情加载失败') : '',
    } : current);
  };

  const refreshOpenDetail = async (userId) => {
    const [info, identity] = await Promise.all([adminAPI.userDetail(userId), identityAPI.detail(userId)]);
    setDetail({ userId, loading: false, info, identity, error: '', identityError: '' });
  };

  const toggleBan = async (u) => {
    const ok = await confirm({ title: u.banned ? '解封账号' : '封禁账号', message: u.banned ? `确定要解封 @${u.username}（ID ${u.id}）吗？` : `确定要封禁 @${u.username}（ID ${u.id}）吗？封禁后该账号将无法登录。`, okText: u.banned ? '解封' : '封禁', danger: !u.banned });
    if (!ok) return;
    setBusyId(u.id);
    try { await adminAPI.banUser(u.id); toast.success(u.banned ? '已解封' : '已封禁'); load(page, q, role, qqBound); } catch (e) { toast.error(e.message || '操作失败'); }
    setBusyId(null);
  };

  const doTrackAndBan = async (u) => {
    const ok = await confirm({ title: '追踪并封禁 IP', message: '将对该账号启用定向追踪，并将其历史登录 IP 加入封禁名单。此操作不可撤销。', okText: '执行', danger: true });
    if (!ok) return;
    setBusyId(u.id);
    try { const r = await adminAPI.trackAndBanUserIp(u.id); toast.success(`已启用追踪，封禁 ${r.banned_ip_count || 0} 个 IP`); } catch (e) { toast.error(e.message || '操作失败'); }
    setBusyId(null);
  };

  const promote = async (u) => {
    const ok = await confirm({ title: '提升为管理员', message: `确认将 @${u.username} 提升为管理员？提升后可访问管理后台。`, okText: '提升' });
    if (!ok) return;
    setBusyId(u.id);
    try { await adminAPI.promoteUser(u.id); toast.success('已提升为管理员'); load(page, q, role, qqBound); } catch (e) { toast.error(e.message || '操作失败'); }
    setBusyId(null);
  };

  const remove = async (u) => {
    const thirdParty = u.qq_bound ? '并删除其 QQ 绑定资料等第三方身份资料，' : '并删除其全部第三方身份资料，';
    const ok = await confirm({ title: '删除账号', message: `将永久删除 @${u.username}（ID ${u.id}）及其全部内容（帖子、点赞、评论、签到记录、私人小说对象等），${thirdParty}同时注销现有会话。此操作不可恢复！`, okText: '永久删除', danger: true });
    if (!ok) return;
    setBusyId(u.id);
    try { await adminAPI.deleteUser(u.id); toast.success('账号已删除'); if (detail?.info?.user?.id === u.id) setDetail(null); load(page, q, role, qqBound); } catch (e) { toast.error(e.message || '删除失败'); }
    setBusyId(null);
  };

  const submitUnbind = async () => {
    const target = unbind;
    if (!target || target.busy) return;
    let body;
    try { body = validateUnbindInput({ reason: target.reason, confirmUsername: target.confirmUsername, username: target.username, expectedBindingVersion: target.version }); }
    catch (error) { setUnbind(current => ({ ...current, error: error.message })); return; }
    const key = `qq:${target.userId}`;
    let operationId;
    try { operationId = operations.current.get(key, body); }
    catch (error) { setUnbind(current => ({ ...current, error: error.message })); return; }
    setUnbind(current => ({ ...current, busy: true, error: '' }));
    try {
      await identityAPI.unbindQQ(target.userId, { operation_id: operationId, ...body });
      operations.current.done(key);
      await Promise.all([load(page, q, role, qqBound), refreshOpenDetail(target.userId)]);
      setUnbind(null); toast.success('QQ 已解绑，现有会话将由后端注销');
    } catch (error) {
      if (error.definitive) operations.current.done(key);
      setUnbind(current => ({ ...current, busy: false, error: error.message || '解绑失败，请刷新身份状态' }));
    }
  };

  const info = detail?.info;

  return <AdminLayout active="users"><div className="ac-page-stack">
    <Card title="用户管理" icon="fa-users" action={<div className="ac-toolbar"><div className="ac-toolbar-group">
      <div className="ac-search"><i className="fa-solid fa-magnifying-glass fa-icon" aria-hidden="true" /><input className="ac-input" aria-label="搜索用户名或邮箱" placeholder="搜索用户名 / 邮箱" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
      <select className="ac-select" aria-label="按用户角色筛选" value={role} onChange={e => { setRole(e.target.value); setPage(1); }}><option value="">全部角色</option><option value="admin">管理员</option><option value="user">普通用户</option></select>
      <select className="ac-select" aria-label="按QQ绑定状态筛选" value={qqBound} onChange={e => { setQqBound(e.target.value); setPage(1); }}><option value="">全部 QQ 状态</option><option value="bound">已绑定 QQ</option><option value="unbound">未绑定 QQ</option></select>
    </div></div>}>
      <ErrorBox msg={errors} /><div className="ac-table-wrap"><table className="ac-table"><thead><tr><th scope="col">用户</th><th scope="col">角色</th><th scope="col">邮箱</th><th scope="col">QQ</th><th scope="col">注册时间</th><th scope="col">帖子</th><th scope="col">评论</th><th scope="col">签到</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
        <tbody>{(list || []).map(u => <tr key={u.id}><td><UserCell name={u.display_name || u.username} avatar={u.avatar} sub={u.id} /></td><td className="ac-cell-nowrap">{u.role === 'admin' ? <Pill tone="violet"><i className="fa-solid fa-user-shield" style={{ fontSize: 10 }} /> 管理员</Pill> : <span className="ac-cell-muted">用户</span>}</td><td className="ac-cell-muted ac-cell-truncate ac-cell-nowrap" title={u.email}>{u.email}</td><td>{u.qq_bound === true ? <Pill tone="blue"><i className="fa-brands fa-qq" /> 已绑定</Pill> : <Pill tone="slate">未绑定</Pill>}</td><td className="ac-cell-muted ac-cell-nowrap">{fmtFull(u.created_at)}</td><td>{u.post_count ?? 0}</td><td>{u.comment_count ?? 0}</td><td>{u.checkin_count ?? 0}</td><td>{u.banned ? <Pill tone="red">封禁</Pill> : <Pill tone="green">正常</Pill>}</td><td><div className="ac-table-actions">
          <button type="button" className="ac-btn ac-icon-button" aria-label="查看用户详情" title="查看详情" disabled={busyId === u.id} onClick={() => openDetail(u)}><i className="fa-solid fa-eye" /></button><button type="button" className="ac-btn ac-icon-button" aria-label={u.banned ? '解封账号' : '封禁账号'} title={u.banned ? '解封' : '封禁'} disabled={busyId === u.id} onClick={() => toggleBan(u)}><i className={`fa-solid ${u.banned ? 'fa-lock-open' : 'fa-lock'}`} /></button><button type="button" className="ac-btn ac-icon-button" aria-label="提升为管理员" title="提升为管理员" disabled={busyId === u.id || u.role === 'admin'} onClick={() => promote(u)}><i className="fa-solid fa-user-shield" /></button><button type="button" className="ac-btn ac-icon-button" aria-label="追踪并封禁 IP" title="追踪并封禁 IP" disabled={busyId === u.id} onClick={() => doTrackAndBan(u)}><i className="fa-solid fa-location-crosshairs" /></button><button type="button" className="ac-btn ac-icon-button danger" aria-label="删除账号" title="删除账号" disabled={busyId === u.id} onClick={() => remove(u)}><i className="fa-solid fa-trash-can" /></button>
        </div></td></tr>)}</tbody></table>{!loading && !list?.length && <Empty text="没有匹配的用户" />}{loading && !list && <Loading />}</div><div style={{ marginTop: 12 }}><Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} /></div>
    </Card>

    <Drawer open={!!detail} onClose={() => setDetail(null)} head={info ? `@${info.user.username}` : '用户详情'}>
      {!detail ? null : detail.loading ? <Loading text="加载用户与身份详情..." /> : detail.error && !info ? <Empty text={detail.error} icon="fa-triangle-exclamation" /> : <div className="ac-page-stack">
        {detail.error && <ErrorBox msg={detail.error} />}
        <div className="ac-flex ac-user-detail-head"><img src={info?.user?.avatar || ''} alt="" className="ac-user-detail-avatar" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} /><div className="ac-grow"><div className="ac-user-detail-name">{info?.user?.display_name || info?.user?.username}</div><div className="ac-cell-muted">@{info?.user?.username} · ID {info?.user?.id} · {info?.user?.role === 'admin' ? '管理员' : '普通用户'}</div><div className="ac-cell-muted">注册于 {fmtFull(info?.user?.created_at)}</div></div><div className="ac-flex">{info?.user?.banned ? <Pill tone="red">已封禁</Pill> : <Pill tone="green">正常</Pill>}{info?.user?.has_app && <Pill tone="slate" title="旧标记可能来自网页 OAuth，不证明安装或原生 App 使用；精确观测请查看 App 管理">历史客户端标记（非精确统计）</Pill>}</div></div>
        {info?.counts && <div className="ac-detail-stat-grid">{[{ label: '帖子', v: info.counts.posts }, { label: '评论', v: info.counts.comments }, { label: '点赞', v: info.counts.likes }, { label: '评分', v: info.counts.ratings }, { label: '打卡', v: info.counts.feelings }, { label: '签到', v: info.counts.checkins }, { label: '金币', v: info.counts.points }].map(c => <div key={c.label} className="ac-detail-stat"><div className="ac-detail-stat-value">{fmtNum(c.v)}</div><div className="ac-stat-label">{c.label}</div></div>)}</div>}
        {detail.identityError ? <ErrorBox msg={`身份详情：${detail.identityError}`} /> : detail.identity && <><LoginMethods identity={detail.identity} onUnbind={qq => setUnbind({ userId: info.user.id, username: info.user.username, version: qqVersion(qq), reason: '', confirmUsername: '', busy: false, error: '' })} /><IdentityAudit items={detail.identity.audit} /></>}
        <section className="ac-identity-section"><div className="ac-identity-heading"><div><h3>徽章（{info?.badges?.length || 0}）</h3></div></div>{info?.badges?.length ? <div className="ac-flex ac-wrap">{info.badges.map(b => <span key={b.key} className="ac-inline-chip"><span className="ac-badge-swatch" style={{ background: b.color || '#7C4DFF' }} />{b.name || b.key}<span className="ac-cell-muted">{b.created_at ? fmtDT(b.created_at) : ''}</span></span>)}</div> : <Empty text="暂无徽章" icon="fa-medal" />}</section>
        <section className="ac-identity-section"><div className="ac-identity-heading"><div><h3>最近发言（{info?.recentPosts?.length || 0} 条）</h3></div></div>{info?.recentPosts?.length ? <div className="ac-page-stack">{info.recentPosts.map(p => <div key={p.id} className="ac-recent-post"><div>{p.content}</div><small>#{p.id} · {fmtFull(p.created_at)}</small></div>)}</div> : <Empty text="暂无发言" icon="fa-receipt" />}</section>
        <section className="ac-identity-section"><div className="ac-identity-heading"><div><h3>IP 追踪</h3></div>{info?.tracking?.enabled ? <Pill tone="red">已启用追踪</Pill> : <Pill tone="slate">未启用</Pill>}</div>{info?.trackEvents?.length ? <div className="ac-track-list">{info.trackEvents.map((ev, i) => <div key={i}><code>{ev.ip}</code><span>{ev.path}</span><time>{fmtFull(ev.created_at)}</time></div>)}</div> : <Empty text="暂无追踪记录" icon="fa-location-dot" />}</section>
      </div>}
    </Drawer>

    <Modal open={!!unbind} onClose={() => { if (!unbind?.busy) setUnbind(null); }} title="管理解绑 QQ" width={520} footer={<><button type="button" className="ac-btn" disabled={unbind?.busy} onClick={() => setUnbind(null)}>取消</button><button type="button" className="ac-btn danger solid" disabled={unbind?.busy} onClick={submitUnbind}>{unbind?.busy && <i className="fa-solid fa-spinner fa-spin" />}{unbind?.busy ? '正在解绑' : '确认解绑 QQ'}</button></>}>
      {unbind && <div className="ac-form-grid"><div className="ac-danger-note"><i className="fa-solid fa-triangle-exclamation" /><div><strong>解绑会注销该用户的现有会话</strong><p>用户需要使用其他已启用的登录方式重新登录。操作会写入身份审计，且不能通过主站重新绑定 QQ。</p></div></div><ErrorBox msg={unbind.error} /><FormField label="解绑理由" required htmlFor="qq-unbind-reason" hint="最多 500 个字符，将写入管理员审计。"><textarea id="qq-unbind-reason" className="ac-textarea" maxLength={500} value={unbind.reason} onChange={e => setUnbind(current => ({ ...current, reason: e.target.value, error: '' }))} /></FormField><FormField label={`输入用户名 ${unbind.username} 以确认`} required htmlFor="qq-unbind-username"><input id="qq-unbind-username" className="ac-input ac-input-full" autoComplete="off" value={unbind.confirmUsername} onChange={e => setUnbind(current => ({ ...current, confirmUsername: e.target.value, error: '' }))} /></FormField><div className="ac-section-note">后端绑定版本：{unbind.version ?? '缺失，请刷新详情'}。按钮是否可用由后端 can_unbind 与权限规则决定。</div></div>}
    </Modal>
  </div></AdminLayout>;
}
