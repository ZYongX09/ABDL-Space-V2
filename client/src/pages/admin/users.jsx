import NBWImage from '../../components/NBWImage.jsx';
import { useNavigate } from 'react-router-dom';
import { UserObservationLink } from '../../userObservation/components.jsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { createAdminIdentityAPI } from '../../adminIdentity/api.js';
import { operationKeeper, qqBindingPresentation, qqBindingState, validateUnbindInput } from '../../adminIdentity/model.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Pill, Pagination, Loading, Empty, Drawer, ErrorBox, FormField, Modal, UserCell, Toolbar, useConfirm } from './ui';
import './member-ux.css';
import { fmtDT, fmtFull, fmtNum } from './util';
import { adminRoleLabel, adminSessionKey, isSuperAdmin, userActionPolicy } from './access.js';

export function UserRoleBadge({ user }) {
  return user?.role === 'admin' ? <Pill tone="slate"><i className="fa-solid fa-user-shield" aria-hidden="true" /> {adminRoleLabel(user)}</Pill> : <span className="ac-cell-muted">普通用户</span>;
}

export function UserManagementActions({ actor, target, busy, onDetail, onRole, onBan, onTrack, onDelete }) {
  const policy = userActionPolicy(actor, target);
  return <div className="ac-user-actions ac-member-actions"><div className="ac-table-actions">
    {onDetail && <button type="button" className="ac-btn" aria-label="查看用户详情" disabled={busy} onClick={() => onDetail(target)}><i className="fa-solid fa-eye" aria-hidden="true" />详情</button>}
    <button type="button" className="ac-btn" aria-label={target.banned ? '解封账号' : '封禁账号'} title={policy.governanceReason || (target.banned ? '解封' : '封禁')} disabled={busy || !policy.canGovern} onClick={() => onBan?.(target)}><i className={`fa-solid ${target.banned ? 'fa-lock-open' : 'fa-lock'}`} aria-hidden="true" />{target.banned ? '解封' : '封禁'}</button>
    {policy.canChangeRole && <button type="button" className="ac-btn" aria-label={policy.roleActionLabel} disabled={busy} onClick={() => onRole?.(target)}><i className="fa-solid fa-user-shield" aria-hidden="true" />{policy.roleActionLabel}</button>}
    <button type="button" className="ac-btn" aria-label="追踪并封禁 IP" title={policy.governanceReason || '追踪并封禁 IP'} disabled={busy || !policy.canGovern} onClick={() => onTrack?.(target)}><i className="fa-solid fa-location-crosshairs" aria-hidden="true" />追踪并封禁 IP</button>
    <button type="button" className="ac-btn danger" aria-label="删除账号" title={policy.governanceReason || '删除账号'} disabled={busy || !policy.canGovern} onClick={() => onDelete?.(target)}><i className="fa-solid fa-trash-can" aria-hidden="true" />删除</button>
  </div>{policy.governanceReason && <p className="ac-section-note ac-table-governance-note">{policy.governanceReason}</p>}{busy && <p className="ac-section-note" role="status">有账号操作正在处理，请等待完成。</p>}</div>;
}

const PAGE_SIZE = 20;
const METHOD_LABELS = { password: '密码', email: '邮箱', nbw: 'NBW', passkey: 'Passkey' };
const AUDIT_ACTIONS = { qq_unbind: '解绑 QQ' };

function pickQQ(identity) { return identity?.methods?.qq || null; }
function qqVersion(method) { return method?.updated_at; }
function qqNickname(method) { return method?.nickname || ''; }
function qqAvatar(method) { return method?.avatar || ''; }

function QQStatus({ value }) {
  const { label, tone } = qqBindingPresentation(value);
  return <Pill tone={tone}>{label}</Pill>;
}

export function LoginMethods({ identity, onUnbind, busy = false, blockedReason = '' }) {
  const methods = identity?.methods || {};
  const qq = pickQQ(identity);
  const qqStatus = qqBindingPresentation(qq?.bound);
  const standard = ['password', 'email', 'nbw', 'passkey'];
  return <section className="ac-identity-section">
    <div className="ac-identity-heading"><div><h3>登录方式</h3><p>仅展示后端允许管理员查看的状态与第三方身份资料。</p></div>{qqStatus.state === 'bound' && <Pill tone="blue">QQ 已绑定</Pill>}</div>
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
          {qqAvatar(qq) ? <NBWImage src={qqAvatar(qq)} alt="QQ 头像" referrerPolicy="no-referrer" onError={event => { event.currentTarget.style.display = 'none'; }} /> : null}
          <i className="fa-brands fa-qq" aria-hidden="true" />
        </span>
        <div className="ac-grow"><div className="ac-qq-title">QQ {qqStatus.label}</div><div className="ac-qq-nickname">{qqNickname(qq) || '未提供 QQ 昵称'}</div></div>
        {qqStatus.state === 'bound' && <button type="button" className="ac-btn danger" onClick={() => onUnbind(qq)} disabled={busy || !!blockedReason || qq.can_unbind !== true} title={blockedReason || (busy ? '账号操作正在处理' : qq.can_unbind === true ? '解绑该用户的 QQ 身份' : (qq.block_reason || '后端不允许解绑'))}>管理解绑</button>}
      </div>
      {qqStatus.state === 'bound' && (busy || blockedReason) && <p className="ac-section-note">{blockedReason || '账号操作正在处理，暂不能解绑。'}</p>}
      {qqStatus.state === 'bound' ? <dl className="ac-qq-meta">
        <div><dt>绑定时间</dt><dd>{fmtFull(qq.created_at)}</dd></div>
        <div><dt>更新时间</dt><dd>{fmtFull(qq.updated_at)}</dd></div>
        <div><dt>绑定版本</dt><dd>{qqVersion(qq) ?? '—'}</dd></div>
        <div><dt>允许解绑</dt><dd>{qq.can_unbind === true ? '是' : `否${qq.block_reason ? ` · ${qq.block_reason}` : ''}`}</dd></div>
      </dl> : <div className="ac-section-note">{qqStatus.state === 'unbound' ? '该用户当前没有 QQ 第三方身份。主站不提供 QQ 登录或绑定入口。' : '后端未提供可确认的 QQ 绑定状态，不能判定为未绑定。请刷新身份详情或联系维护者。'}</div>}
    </div>
  </section>;
}

/** 专用身份资料不可用时，仅使用普通详情的 QQ 状态；不推断其他登录方式或解绑权限。 */
export function UserIdentityDetails({ identity, identityError, user, onUnbind, busy = false, blockedReason = '' }) {
  if (identity) return <><LoginMethods identity={identity} onUnbind={onUnbind} busy={busy} blockedReason={blockedReason} /><IdentityAudit items={identity.audit} /></>;
  return <>
    <ErrorBox msg={`身份详情：${identityError || '身份资料不可用'}`} />
    <section className="ac-identity-section">
      <div className="ac-identity-heading"><div><h3>QQ 绑定状态</h3><p>来自普通用户详情，仅展示绑定状态。</p></div><QQStatus value={user?.qq_bound} /></div>
      <p className="ac-section-note">第三方身份资料暂不可用，无法展示 QQ 昵称、头像、其他登录方式或执行解绑。</p>
    </section>
  </>;
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

const EMPTY_FILTERS = { q: '', role: '', qqBound: '' };
const userCount = value => value === null || value === undefined || value === '' ? '—' : fmtNum(value);
export function userFilterSummary(filters = EMPTY_FILTERS) {
  return `${filters.q ? `关键词「${filters.q}」` : '全部关键词'} · ${filters.role === 'admin' ? '管理员' : filters.role === 'user' ? '普通用户' : '全部角色'} · ${filters.qqBound === 'bound' ? '已绑定 QQ' : filters.qqBound === 'unbound' ? '未绑定 QQ' : '全部 QQ 状态'}`;
}

export function UsersResults({ list, loading, error, resultContext, onRetry, actor, busy, ...actions }) {
  return <div className="ac-member-results" aria-busy={loading}>
    {loading && <p className="ac-member-notice" role="status">{list === null ? '正在读取用户…' : '正在刷新用户，保留上次成功结果；暂不能对旧结果执行操作。'}</p>}
    {error && <div className="ac-member-retry"><ErrorBox msg={`用户读取失败：${error}${list === null ? '。尚无可用结果。' : '。下方仍为上次成功结果，不代表当前筛选。'}`} /><button type="button" className="ac-btn" disabled={loading} onClick={onRetry}>重试当前筛选</button></div>}
    {list !== null && <p className="ac-section-note">结果对应：{resultContext || '已应用筛选'}</p>}
    {!!list?.length && <>
      <div className="ac-table-wrap ac-desktop-only ac-member-users-scroll" role="region" aria-label="用户筛选结果表，可横向滚动" tabIndex={0}><table className="ac-table ac-member-users-table"><caption className="ac-member-sr">用户筛选结果，完整身份与邮箱可展开，治理操作位于详情面板</caption><thead><tr><th scope="col" className="ac-member-user-identity">用户</th><th scope="col" className="ac-member-user-role">角色 / QQ</th><th scope="col" className="ac-member-user-email">邮箱</th><th scope="col" className="ac-member-user-created">注册时间</th><th scope="col" className="ac-member-user-activity">活动汇总</th><th scope="col" className="ac-member-user-status">状态</th><th scope="col" className="ac-member-user-detail">操作</th></tr></thead><tbody>{list.map(user => <tr key={user.id}>
        <td className="ac-member-user-identity"><UserCell name={user.display_name || user.username} avatar={user.avatar} sub={user.id} /><details className="ac-member-user-disclosure"><summary><span className="ac-member-user-ellipsis">@{user.username}</span><i className="fa-solid fa-angle-down" aria-hidden="true" /><span className="ac-member-sr">展开完整身份</span></summary><div className="ac-member-long">{user.display_name || user.username}<br />@{user.username}<br />ID {user.id}</div></details></td>
        <td className="ac-member-user-role"><div><UserRoleBadge user={user} /></div><div><QQStatus value={user.qq_bound} /></div></td>
        <td className="ac-member-user-email"><details className="ac-member-user-disclosure"><summary><span className="ac-member-user-ellipsis">{user.email || '未提供'}</span><i className="fa-solid fa-angle-down" aria-hidden="true" /><span className="ac-member-sr">展开完整邮箱</span></summary><div className="ac-member-long">{user.email || '未提供'}</div></details></td>
        <td className="ac-member-user-created">{fmtFull(user.created_at)}</td><td className="ac-member-user-activity"><div>帖子 {userCount(user.post_count)}</div><div>评论 {userCount(user.comment_count)}</div><div>签到 {userCount(user.checkin_count)}</div></td><td className="ac-member-user-status"><Pill tone={user.banned ? 'red' : 'green'}>{user.banned ? '封禁' : '正常'}</Pill></td>
        <td className="ac-member-user-detail"><button type="button" className="ac-btn primary" aria-label={`查看用户详情 @${user.username}`} disabled={busy || loading || !!error} onClick={() => actions.onDetail?.(user)}><i className="fa-solid fa-eye" aria-hidden="true" />详情</button><p className="ac-section-note">治理操作在详情</p></td>
      </tr>)}</tbody></table></div>
      <div className="ac-mobile-only ac-member-records">{list.map(user => <article key={user.id} className="ac-member-record" aria-label={`用户 ${user.username}`}>
        <div className="ac-member-record-head"><UserCell name={user.display_name || user.username} avatar={user.avatar} sub={user.id} /><Pill tone={user.banned ? 'red' : 'green'}>{user.banned ? '封禁' : '正常'}</Pill></div>
        <dl className="ac-member-kv"><div><dt>用户名</dt><dd>@{user.username}</dd></div><div><dt>角色</dt><dd><UserRoleBadge user={user} /></dd></div><div><dt>邮箱</dt><dd>{user.email || '未提供'}</dd></div><div><dt>QQ</dt><dd><QQStatus value={user.qq_bound} /></dd></div><div><dt>注册时间</dt><dd>{fmtFull(user.created_at)}</dd></div><div><dt>帖子 / 评论 / 签到</dt><dd>{userCount(user.post_count)} / {userCount(user.comment_count)} / {userCount(user.checkin_count)}</dd></div></dl>
        <UserManagementActions actor={actor} target={user} busy={busy || loading || !!error} {...actions} />
      </article>)}</div>
    </>}
    {!loading && !error && list !== null && !list.length && <Empty text="没有匹配的用户，可调整筛选或重置" />}
  </div>;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const openObservation = id => navigate(`/admin/security?tab=user-observation&user_id=${encodeURIComponent(id)}`);
  const toast = useToast();
  const confirm = useConfirm();
  const { user: admin, accounts } = useAuth();
  const session = useRef(null);
  const token = accounts?.find(account => String(account.id) === String(admin?.id))?.token || '';
  const sessionKey = adminSessionKey(admin, token);
  session.current = { id: admin?.id, token, key: sessionKey };
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const alive = useRef(true);
  const isCurrent = () => alive.current && session.current?.key === sessionKey;
  const handleError = (error) => {
    if (!isCurrent()) return;
    if (error.status === 401 || error.status === 403) window.dispatchEvent(new CustomEvent('admin-session-rejected', { detail: { sessionKey } }));
    toast.error(error.message || '操作失败');
  };
  const identityAPI = useMemo(() => createAdminIdentityAPI({
    base: import.meta.env.VITE_API_BASE ?? '',
    getToken: () => token,
    isCurrentSession: () => session.current?.id === admin?.id && session.current?.token === token,
  }), [admin?.id, token]);
  const operations = useRef(operationKeeper());

  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(EMPTY_FILTERS);
  const { q, role, qqBound } = appliedFilters;
  const [resultContext, setResultContext] = useState('');
  const filtersDirty = JSON.stringify(draftFilters) !== JSON.stringify(appliedFilters);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [unbind, setUnbind] = useState(null);
  const [errors, setErrors] = useState('');
  const detailRef = useRef(detail);
  detailRef.current = detail;

  useEffect(() => {
    // StrictMode 会 setup → cleanup → setup；第二次 setup 必须恢复同一会话。
    alive.current = true;
    session.current = { id: admin?.id, token, key: sessionKey };
    return () => { alive.current = false; session.current = null; listRequest.current++; detailRequest.current++; };
  }, [sessionKey]);

  const load = useCallback(async (p, query, selectedRole, selectedQQ) => {
    const request = ++listRequest.current;
    const current = () => alive.current && session.current?.key === sessionKey && request === listRequest.current;
    if (!current()) return;
    setLoading(true); setErrors('');
    try {
      const data = await adminAPI.users({ page: p, limit: PAGE_SIZE, q: query || '', role: selectedRole || '', qq_bound: selectedQQ || '' });
      if (!current()) return;
      setList(data.users || []); setPagination(data.pagination || { page: p, total: data.users?.length || 0, totalPages: 1 });
      setResultContext(`${userFilterSummary({ q: query, role: selectedRole, qqBound: selectedQQ })} · 第 ${data.pagination?.page || p} 页 · 读取于 ${new Date().toLocaleTimeString('zh-CN')}`);
    } catch (e) { if (current()) { setErrors(e.message || '加载失败'); handleError(e); } }
    if (current()) setLoading(false);
  }, [sessionKey]);

  useEffect(() => { load(page, q, role, qqBound); }, [page, q, role, qqBound, load]);

  const applyFilters = event => {
    event?.preventDefault();
    const next = { ...draftFilters, q: draftFilters.q.trim() };
    setDraftFilters(next);
    setPage(1);
    if (page === 1 && JSON.stringify(next) === JSON.stringify(appliedFilters)) load(1, next.q, next.role, next.qqBound);
    else setAppliedFilters(next);
  };
  const resetFilters = () => {
    setDraftFilters(EMPTY_FILTERS); setPage(1);
    if (page === 1 && JSON.stringify(appliedFilters) === JSON.stringify(EMPTY_FILTERS)) load(1, '', '', '');
    else setAppliedFilters(EMPTY_FILTERS);
  };

  const openDetail = async (u) => {
    if (!isCurrent()) return;
    const request = ++detailRequest.current;
    const previous = detailRef.current?.userId === u.id ? detailRef.current : null;
    const context = previous?.context || `@${u.username || u.id} · ID ${u.id} · ${userFilterSummary(appliedFilters)} · 第 ${page} 页`;
    setDetail({ userId: u.id, context, loading: true, info: previous?.info || null, identity: previous?.identity || null, error: '', identityError: '' });
    const [infoResult, identityResult] = await Promise.allSettled([adminAPI.userDetail(u.id), identityAPI.detail(u.id)]);
    if (!isCurrent() || request !== detailRequest.current) return;
    if (infoResult.status === 'rejected') handleError(infoResult.reason);
    setDetail(current => current?.userId === u.id ? {
      userId: u.id,
      context,
      loading: false,
      info: infoResult.status === 'fulfilled' ? infoResult.value : previous?.info || null,
      identity: identityResult.status === 'fulfilled' ? identityResult.value : null,
      error: infoResult.status === 'rejected' ? (infoResult.reason?.message || '用户详情加载失败') : '',
      identityError: identityResult.status === 'rejected' ? (identityResult.reason?.message || '身份详情加载失败') : '',
    } : current);
  };

  const refreshOpenDetail = async (userId) => {
    // 写入期间关闭或切换抽屉，不允许旧闭包重新打开目标。
    if (!isCurrent() || detailRef.current?.userId !== userId) return;
    return openDetail({ id: userId });
  };

  const guardGovernance = u => {
    if (!isCurrent()) return false;
    const policy = userActionPolicy(admin, u);
    if (!policy.canGovern) toast.error(policy.governanceReason);
    return policy.canGovern;
  };

  const toggleBan = async (u) => {
    if (!guardGovernance(u) || busyId !== null) return;
    const ok = await confirm({ title: u.banned ? '解封账号' : '封禁账号', message: u.banned ? `确定要解封 @${u.username}（ID ${u.id}）吗？` : `确定要封禁 @${u.username}（ID ${u.id}）吗？封禁后该账号将无法登录。`, okText: u.banned ? '解封' : '封禁', danger: !u.banned });
    if (!ok || !isCurrent()) return;
    setBusyId(u.id);
    try { await adminAPI.banUser(u.id); if (!isCurrent()) return; toast.success(u.banned ? '已解封' : '已封禁'); await Promise.all([load(page, q, role, qqBound), refreshOpenDetail(u.id)]); } catch (e) { handleError(e); }
    if (isCurrent()) setBusyId(null);
  };

  const doTrackAndBan = async (u) => {
    if (!guardGovernance(u) || busyId !== null) return;
    const ok = await confirm({ title: '追踪并封禁 IP', message: `将对 @${u.username}（ID ${u.id}）启用定向追踪，并将其历史登录 IP 加入封禁名单。此操作不可撤销。`, okText: '执行', danger: true });
    if (!ok || !isCurrent()) return;
    setBusyId(u.id);
    try { const r = await adminAPI.trackAndBanUserIp(u.id); if (!isCurrent()) return; toast.success(`已启用追踪，封禁 ${r.banned_ip_count || 0} 个 IP`); await refreshOpenDetail(u.id); } catch (e) { handleError(e); }
    if (isCurrent()) setBusyId(null);
  };

  const changeRole = async (u) => {
    const policy = userActionPolicy(admin, u);
    if (!isCurrent() || busyId !== null || !policy.canChangeRole) return;
    const revoke = policy.nextRole === 'user';
    const ok = await confirm({ title: policy.roleActionLabel, message: revoke ? `确认撤销 @${u.username}（ID ${u.id}）的管理员权限？撤销后将无法访问管理后台，之后才能对其封禁、追踪或删除。` : `确认将 @${u.username}（ID ${u.id}）提升为管理员？提升后可访问管理后台。`, okText: revoke ? '确认撤销' : '确认提升', danger: revoke });
    if (!ok || !isCurrent()) return;
    setBusyId(u.id);
    try {
      await adminAPI.setUserRole(u.id, policy.nextRole);
      if (!isCurrent()) return;
      toast.success(revoke ? '已撤销管理员权限' : '已提升为管理员');
      await Promise.all([load(page, q, role, qqBound), detail?.userId === u.id ? refreshOpenDetail(u.id) : Promise.resolve()]);
    } catch (e) { handleError(e); }
    if (isCurrent()) setBusyId(null);
  };

  const remove = async (u) => {
    if (!guardGovernance(u) || busyId !== null) return;
    const thirdParty = qqBindingState(u.qq_bound) === 'bound' ? '并删除其 QQ 绑定资料等第三方身份资料，' : '并删除其全部第三方身份资料，';
    const ok = await confirm({ title: '删除账号', message: `将永久删除 @${u.username}（ID ${u.id}）及其全部内容（帖子、点赞、评论、签到记录、私人小说对象等），${thirdParty}同时注销现有会话。此操作不可恢复！`, okText: '永久删除', danger: true });
    if (!ok || !isCurrent()) return;
    setBusyId(u.id);
    try { await adminAPI.deleteUser(u.id); if (!isCurrent()) return; toast.success('账号已删除'); if (detail?.info?.user?.id === u.id) setDetail(null); load(page, q, role, qqBound); } catch (e) { handleError(e); }
    if (isCurrent()) setBusyId(null);
  };

  const submitUnbind = async () => {
    const target = unbind;
    if (!isCurrent() || !target || target.busy) return;
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
      if (!isCurrent()) return;
      operations.current.done(key);
      await Promise.all([load(page, q, role, qqBound), refreshOpenDetail(target.userId)]);
      if (!isCurrent()) return;
      setUnbind(null); toast.success('QQ 已解绑，现有会话将由后端注销');
    } catch (error) {
      if (!isCurrent()) return;
      handleError(error);
      if (error.definitive) operations.current.done(key);
      setUnbind(current => ({ ...current, busy: false, error: error.message || '解绑失败，请刷新身份状态' }));
    }
  };

  const info = detail?.info;

  return <AdminLayout active="users"><div className="ac-page-stack ac-member-ux">
    <Card title="用户检索" description="修改筛选后按 Enter 或点击搜索应用；刷新只读取已应用条件。" icon="fa-users" action={<button type="button" className="ac-btn" disabled={loading || busyId !== null} onClick={() => load(page, q, role, qqBound)}><i className="fa-solid fa-rotate" aria-hidden="true" />刷新已应用结果</button>}>
      <form className="ac-member-filter" onSubmit={applyFilters}>
        <Toolbar><FormField label="用户名 / 邮箱" htmlFor="member-user-query"><input id="member-user-query" className="ac-input" placeholder="搜索用户名 / 邮箱" value={draftFilters.q} onChange={e => setDraftFilters(current => ({ ...current, q: e.target.value }))} /></FormField>
          <FormField label="角色" htmlFor="member-user-role"><select id="member-user-role" className="ac-select" value={draftFilters.role} onChange={e => setDraftFilters(current => ({ ...current, role: e.target.value }))}><option value="">全部角色</option><option value="admin">管理员</option><option value="user">普通用户</option></select></FormField>
          <FormField label="QQ 绑定状态" htmlFor="member-user-qq"><select id="member-user-qq" className="ac-select" value={draftFilters.qqBound} onChange={e => setDraftFilters(current => ({ ...current, qqBound: e.target.value }))}><option value="">全部 QQ 状态</option><option value="bound">已绑定 QQ</option><option value="unbound">未绑定 QQ</option></select></FormField>
          <button type="submit" className="ac-btn primary" disabled={busyId !== null}>搜索 / 应用筛选</button><button type="button" className="ac-btn" disabled={busyId !== null} onClick={resetFilters}>重置</button>
        </Toolbar>
      </form>
      <p className="ac-member-notice" role="status">已应用：{userFilterSummary(appliedFilters)}{filtersDirty ? '；筛选有未应用更改，当前结果不会随输入变化。' : ''}</p>
      <UsersResults list={list} loading={loading} error={errors} resultContext={resultContext} onRetry={() => load(page, q, role, qqBound)} actor={admin} busy={busyId !== null} onDetail={openDetail} onRole={changeRole} onBan={toggleBan} onTrack={doTrackAndBan} onDelete={remove} />
      {list !== null && !loading && !errors && <div className="ac-member-pagination"><Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} /></div>}
    </Card>

    <Drawer open={!!detail} onClose={() => { detailRequest.current++; setDetail(null); }} head={info ? `@${info.user.username} · ID ${detail.userId}` : `用户详情 · ID ${detail?.userId || '—'}`}>
      {detail && <div className="ac-member-ux ac-member-detail-context"><p className="ac-section-note">来源：{detail.context}</p><button type="button" className="ac-btn" disabled={detail.loading || busyId !== null} onClick={() => openDetail({ id: detail.userId })}>刷新用户与身份详情</button>{detail.loading && info && <p className="ac-member-notice" role="status">正在刷新详情；下方保留上次数据，治理操作暂不可用。</p>}</div>}
      {!detail ? null : detail.loading && !info ? <Loading text="加载用户与身份详情..." /> : detail.error && !info ? <div className="ac-member-ux"><ErrorBox msg={detail.error} /><p className="ac-section-note">读取失败，不能判定用户不存在。可在上方重试。</p></div> : <div className="ac-page-stack ac-member-ux">
        {detail.error && <ErrorBox msg={`${detail.error}；下方为上次详情，不能作为最新操作依据。`} />}
        <div className="ac-flex ac-user-detail-head"><NBWImage src={info?.user?.avatar || ''} alt="" className="ac-user-detail-avatar" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} /><div className="ac-grow"><div className="ac-user-detail-name">{info?.user?.display_name || info?.user?.username}</div><div className="ac-cell-muted">@{info?.user?.username} · ID {info?.user?.id} · {adminRoleLabel(info?.user)}</div><div className="ac-cell-muted">注册于 {fmtFull(info?.user?.created_at)}</div></div><div className="ac-flex">{info?.user?.banned ? <Pill tone="red">已封禁</Pill> : <Pill tone="green">正常</Pill>}{info?.user?.has_app && <Pill tone="slate" title="旧标记可能来自网页 OAuth，不证明安装或原生 App 使用；精确观测请查看 App 管理">历史客户端标记（非精确统计）</Pill>}</div></div>
        {info?.user && <section className="ac-identity-section"><div className="ac-identity-heading"><h3>账户治理与角色</h3><UserRoleBadge user={info.user} /></div><UserManagementActions actor={admin} target={info.user} busy={busyId !== null || detail.loading || !!detail.error} onRole={changeRole} onBan={toggleBan} onTrack={doTrackAndBan} onDelete={remove} /></section>}
        {info?.user && <dl className="ac-member-kv"><div><dt>用户名</dt><dd>@{info.user.username}</dd></div><div><dt>邮箱</dt><dd>{info.user.email || '未提供'}</dd></div><div><dt>QQ 状态（普通详情）</dt><dd><QQStatus value={info.user.qq_bound} /></dd></div></dl>}
        {info?.counts && <div className="ac-detail-stat-grid">{[{ label: '帖子', v: info.counts.posts }, { label: '评论', v: info.counts.comments }, { label: '点赞', v: info.counts.likes }, { label: '评分', v: info.counts.ratings }, { label: '打卡', v: info.counts.feelings }, { label: '签到', v: info.counts.checkins }, { label: '金币', v: info.counts.points }].map(c => <div key={c.label} className="ac-detail-stat"><div className="ac-detail-stat-value">{userCount(c.v)}</div><div className="ac-stat-label">{c.label}</div></div>)}</div>}
        {!detail.loading && <UserIdentityDetails identity={detail.identity} identityError={detail.identityError} user={info?.user} busy={busyId !== null} blockedReason={detail.error ? '用户详情刷新失败，需成功读取后才能解绑。' : ''} onUnbind={qq => { if (!isCurrent() || busyId !== null || detail.error || qq.can_unbind !== true || !info?.user) return; setUnbind({ userId: info.user.id, username: info.user.username, version: qqVersion(qq), reason: '', confirmUsername: '', busy: false, error: '' }); }} />}
        <section className="ac-identity-section"><div className="ac-identity-heading"><div><h3>徽章（{info?.badges?.length || 0}）</h3></div></div>{info?.badges?.length ? <div className="ac-flex ac-wrap">{info.badges.map(b => <span key={b.key} className="ac-inline-chip"><span className="ac-badge-swatch" style={{ background: b.color || '#7C4DFF' }} />{b.name || b.key}<span className="ac-cell-muted">{b.created_at ? fmtDT(b.created_at) : ''}</span></span>)}</div> : <Empty text="暂无徽章" icon="fa-medal" />}</section>
        <section className="ac-identity-section"><div className="ac-identity-heading"><div><h3>最近发言（{info?.recentPosts?.length || 0} 条）</h3></div></div>{info?.recentPosts?.length ? <div className="ac-page-stack">{info.recentPosts.map(p => <div key={p.id} className="ac-recent-post"><div>{p.content}</div><small>#{p.id} · {fmtFull(p.created_at)}</small></div>)}</div> : <Empty text="暂无发言" icon="fa-receipt" />}</section>
        <section className="ac-identity-section"><div className="ac-identity-heading"><div><h3>定向用户观察</h3><p>IP 记录与请求日志独立控制，进入模块只读取配置，不自动启用或封禁。</p></div></div><UserObservationLink actor={admin} target={info?.user} onOpen={openObservation} />{!isSuperAdmin(admin) && <p className="ac-section-note">原始观察数据与操作仅向超级管理员开放。</p>}</section>
        {isSuperAdmin(admin) && <section className="ac-identity-section"><div className="ac-identity-heading"><div><h3>旧 IP 追踪（非新观察）</h3><p>旧机制与新观察互不推定；停止旧追踪、复核已有来源封禁请进入定向观察模块的独立区域。</p></div>{info?.tracking?.enabled ? <Pill tone="red">旧追踪已启用</Pill> : <Pill tone="slate">旧追踪未启用</Pill>}</div>{info?.trackEvents?.length ? <div className="ac-track-list">{info.trackEvents.map((ev, i) => <div key={i}><code>{ev.ip}</code><span>{ev.path}</span><time>{fmtFull(ev.created_at)}</time></div>)}</div> : <Empty text="暂无旧追踪记录" icon="fa-location-dot" />}</section>}
      </div>}
    </Drawer>

    <Modal open={!!unbind} onClose={() => { if (!unbind?.busy) setUnbind(null); }} title="管理解绑 QQ" width={520} footer={<><button type="button" className="ac-btn" disabled={unbind?.busy} onClick={() => setUnbind(null)}>取消</button><button type="button" className="ac-btn danger solid" disabled={unbind?.busy} onClick={submitUnbind}>{unbind?.busy && <i className="fa-solid fa-spinner fa-spin" />}{unbind?.busy ? '正在解绑' : '确认解绑 QQ'}</button></>}>
      {unbind && <div className="ac-form-grid"><div className="ac-danger-note"><i className="fa-solid fa-triangle-exclamation" /><div><strong>解绑会注销该用户的现有会话</strong><p>用户需要使用其他已启用的登录方式重新登录。操作会写入身份审计，且不能通过主站重新绑定 QQ。</p></div></div><ErrorBox msg={unbind.error} /><FormField label="解绑理由" required htmlFor="qq-unbind-reason" hint="最多 500 个字符，将写入管理员审计。"><textarea id="qq-unbind-reason" className="ac-textarea" maxLength={500} value={unbind.reason} onChange={e => setUnbind(current => ({ ...current, reason: e.target.value, error: '' }))} /></FormField><FormField label={`输入用户名 ${unbind.username} 以确认`} required htmlFor="qq-unbind-username"><input id="qq-unbind-username" className="ac-input ac-input-full" autoComplete="off" value={unbind.confirmUsername} onChange={e => setUnbind(current => ({ ...current, confirmUsername: e.target.value, error: '' }))} /></FormField><div className="ac-section-note">后端绑定版本：{unbind.version ?? '缺失，请刷新详情'}。按钮是否可用由后端 can_unbind 与权限规则决定。</div></div>}
    </Modal>
  </div></AdminLayout>;
}
