import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Pill, Pagination, Loading, Empty, Drawer, ErrorBox, UserCell, useConfirm } from './ui';
import { fmtDT, fmtFull, fmtNum } from './util';

const PAGE_SIZE = 20;

export default function AdminUsers() {
  const toast = useToast();
  const confirm = useConfirm();

  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [detail, setDetail] = useState(null); // {loading, info, error}
  const [errors, setErrors] = useState('');

  const load = useCallback(async (p, qq, rr) => {
    setLoading(true);
    setErrors('');
    try {
      const data = await adminAPI.users({ page: p, limit: PAGE_SIZE, q: qq || '', role: rr || '' });
      setList(data.users || []);
      setPagination(data.pagination || { page: 1, total: 0, totalPages: 1 });
    } catch (e) {
      setErrors(e.message || '加载失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(page, q, role); }, [page, q, role, load]);

  const openDetail = async (u) => {
    setDetail({ loading: true, info: null, error: '' });
    try {
      const data = await adminAPI.userDetail(u.id);
      setDetail({ loading: false, info: data, error: '' });
    } catch (e) {
      setDetail({ loading: false, info: null, error: e.message || '加载失败' });
    }
  };

  const toggleBan = async (u) => {
    const ok = await confirm({
      title: u.banned ? '解封账号' : '封禁账号',
      message: u.banned
        ? `确定要解封 @${u.username}（ID ${u.id}）吗？`
        : `确定要封禁 @${u.username}（ID ${u.id}）吗？封禁后该账号将无法登录。`,
      okText: u.banned ? '解封' : '封禁',
      danger: !u.banned,
    });
    if (!ok) return;
    setBusyId(u.id);
    try {
      await adminAPI.banUser(u.id);
      toast.success(u.banned ? '已解封' : '已封禁');
      load(page, q, role);
    } catch (e) {
      toast.error(e.message || '操作失败');
    }
    setBusyId(null);
  };

  const doTrackAndBan = async (u) => {
    const ok = await confirm({
      title: '追踪并封禁 IP',
      message: `将对该账号启用定向追踪，并将其历史登录 IP（ip_tracking_events 中已记录）加入封禁名单。此操作不可撤销。`,
      okText: '执行',
      danger: true,
    });
    if (!ok) return;
    setBusyId(u.id);
    try {
      const r = await adminAPI.trackAndBanUserIp(u.id);
      toast.success(`已启用追踪，封禁 ${r.banned_ip_count || 0} 个 IP`);
    } catch (e) {
      toast.error(e.message || '操作失败');
    }
    setBusyId(null);
  };

  const promote = async (u) => {
    const ok = await confirm({
      title: '提升为管理员',
      message: `确认将 @${u.username} 提升为管理员？提升后可访问管理后台。`,
      okText: '提升',
    });
    if (!ok) return;
    setBusyId(u.id);
    try {
      await adminAPI.promoteUser(u.id);
      toast.success('已提升为管理员');
      load(page, q, role);
    } catch (e) {
      toast.error(e.message || '操作失败');
    }
    setBusyId(null);
  };

  const remove = async (u) => {
    const ok = await confirm({
      title: '删除账号',
      message: `将永久删除 @${u.username}（ID ${u.id}）及其全部内容（帖子、点赞、评论、签到记录、私人小说对象等）。此操作不可恢复！`,
      okText: '永久删除',
      danger: true,
    });
    if (!ok) return;
    setBusyId(u.id);
    try {
      await adminAPI.deleteUser(u.id);
      toast.success('账号已删除');
      if (detail?.info?.user?.id === u.id) setDetail(null);
      load(page, q, role);
    } catch (e) {
      toast.error(e.message || '删除失败');
    }
    setBusyId(null);
  };

  const info = detail?.info;

  return (
    <AdminLayout active="users">
      <div className="ac-page-stack">
        <Card
          title="用户管理"
          icon="fa-users"
          action={
            <div className="ac-toolbar">
              <div className="ac-toolbar-group">
                <div className="ac-search"><i className="fa-solid fa-magnifying-glass fa-icon" aria-hidden="true" /><input className="ac-input" aria-label="搜索用户名或邮箱" placeholder="搜索用户名 / 邮箱" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
                <select className="ac-select" aria-label="按用户角色筛选" value={role} onChange={e => { setRole(e.target.value); setPage(1); }}>
                  <option value="">全部角色</option>
                  <option value="admin">管理员</option>
                  <option value="user">普通用户</option>
                </select>
              </div>
            </div>
          }
        >
          <ErrorBox msg={errors} />
          <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th scope="col">用户</th><th scope="col">角色</th><th scope="col">邮箱</th><th scope="col">注册时间</th>
                <th scope="col">帖子</th><th scope="col">评论</th><th scope="col">签到</th><th scope="col">状态</th><th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {(list || []).map(u => (
                <tr key={u.id}>
                  <td><UserCell name={u.display_name || u.username} avatar={u.avatar} sub={u.id} /></td>
                  <td className="ac-cell-nowrap">{u.role === 'admin' ? <Pill tone="violet"><i className="fa-solid fa-user-shield" style={{ fontSize: 10 }} /> 管理员</Pill> : <span className="ac-cell-muted">用户</span>}</td>
                  <td className="ac-cell-muted ac-cell-truncate ac-cell-nowrap" title={u.email}>{u.email}</td>
                  <td className="ac-cell-muted ac-cell-nowrap">{fmtFull(u.created_at)}</td>
                  <td>{u.post_count ?? 0}</td>
                  <td>{u.comment_count ?? 0}</td>
                  <td>{u.checkin_count ?? 0}</td>
                  <td>{u.banned ? <Pill tone="red">封禁</Pill> : <Pill tone="green">正常</Pill>}</td>
                  <td>
                    <div className="ac-table-actions">
                      <button type="button" className="ac-btn ac-icon-button" aria-label="查看用户详情" title="查看详情" disabled={busyId === u.id} onClick={() => openDetail(u)}><i className="fa-solid fa-eye" aria-hidden="true" /></button>
                      <button type="button" className="ac-btn ac-icon-button" aria-label={u.banned ? '解封账号' : '封禁账号'} title={u.banned ? '解封' : '封禁'} disabled={busyId === u.id} onClick={() => toggleBan(u)}><i className={`fa-solid ${u.banned ? 'fa-lock-open' : 'fa-lock'}`} aria-hidden="true" /></button>
                      <button type="button" className="ac-btn ac-icon-button" aria-label="提升为管理员" title="提升为管理员" disabled={busyId === u.id || u.role === 'admin'} onClick={() => promote(u)}><i className="fa-solid fa-user-shield" aria-hidden="true" /></button>
                      <button type="button" className="ac-btn ac-icon-button" aria-label="追踪并封禁 IP" title="追踪并封禁 IP" disabled={busyId === u.id} onClick={() => doTrackAndBan(u)}><i className="fa-solid fa-location-crosshairs" aria-hidden="true" /></button>
                      <button type="button" className="ac-btn ac-icon-button danger" aria-label="删除账号" title="删除账号" disabled={busyId === u.id} onClick={() => remove(u)}><i className="fa-solid fa-trash-can" aria-hidden="true" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
            {!loading && !list?.length && <Empty text="没有匹配的用户" />}
            {loading && !list && <Loading />}
          </div>
          <div style={{ marginTop: 12 }}>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />
          </div>
        </Card>

      {/* 用户详情抽屉 */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} head={info ? `@${info.user.username}` : '用户详情'}>
        {!detail ? null : detail.loading ? (
          <Loading text="加载详情..." />
        ) : detail.error ? (
          <Empty text={detail.error} icon="fa-triangle-exclamation" />
        ) : (
          <div className="ac-page-stack">
            <div className="ac-flex" style={{ gap: 12, alignItems: 'flex-start' }}>
              <img src={info.user.avatar || ''} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', background: 'var(--input-bg)', flexShrink: 0 }} onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{info.user.display_name || info.user.username}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  @{info.user.username} · ID {info.user.id} · {info.user.role === 'admin' ? '管理员' : '普通用户'}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>注册于 {fmtFull(info.user.created_at)}</div>
              </div>
              <div className="ac-flex" style={{ marginLeft: 'auto', gap: 6, flexShrink: 0 }}>
                {info.user.banned ? <Pill tone="red">已封禁</Pill> : <Pill tone="green">正常</Pill>}
                {info.user.has_app && <Pill tone="blue">已装 App</Pill>}
              </div>
            </div>

            <div className="ac-detail-stat-grid">
              {[
                { label: '帖子', v: info.counts.posts }, { label: '评论', v: info.counts.comments },
                { label: '点赞', v: info.counts.likes }, { label: '评分', v: info.counts.ratings },
                { label: '打卡', v: info.counts.feelings }, { label: '签到', v: info.counts.checkins },
                { label: '金币', v: info.counts.points },
              ].map(c => (
                <div key={c.label} className="ac-detail-stat">
                  <div className="ac-detail-stat-value">{fmtNum(c.v)}</div>
                  <div className="ac-stat-label">{c.label}</div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>徽章（{info.badges?.length || 0}）</div>
              {info.badges?.length ? (
                <div className="ac-flex" style={{ flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {info.badges.map(b => (
                    <span key={b.key} className="ac-flex" style={{ gap: 6, background: 'var(--input-bg)', borderRadius: 20, padding: '3px 10px', fontSize: 12 }}>
                      <span className="ac-badge-swatch" style={{ background: b.color || '#7C4DFF' }} />
                      {b.name || b.key}
                      <span style={{ color: 'var(--text-muted)' }}>{b.created_at ? fmtDT(b.created_at) : ''}</span>
                    </span>
                  ))}
                </div>
              ) : <Empty text="暂无徽章" icon="fa-medal" />}
            </div>

            <div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>最近发言（{info.recentPosts?.length || 0} 条）</div>
              {info.recentPosts?.length ? (
                <div className="ac-page-stack">
                  {info.recentPosts.map(p => (
                    <div key={p.id} style={{ fontSize: 12.5, background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.content}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>#{p.id} · {fmtFull(p.created_at)}</div>
                    </div>
                  ))}
                </div>
              ) : <Empty text="暂无发言" icon="fa-receipt" />}
            </div>

            <div>
              <div className="ac-flex" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>IP 追踪</span>
                {info.tracking?.enabled ? <Pill tone="red"><i className="fa-solid fa-location-dot" style={{ fontSize: 10 }} /> 已启用追踪</Pill> : <Pill tone="slate">未启用</Pill>}
              </div>
              {info.trackEvents?.length ? (
                <div className="ac-page-stack" style={{ fontSize: 12.5 }}>
                  {info.trackEvents.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <code style={{ color: 'var(--primary-dark)', flexShrink: 0 }}>{ev.ip}</code>
                      <span style={{ color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.path}</span>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{fmtFull(ev.created_at)}</span>
                    </div>
                  ))}
                </div>
              ) : <Empty text="暂无追踪记录" icon="fa-location-dot" />}
            </div>
          </div>
        )}
      </Drawer>
      </div>
    </AdminLayout>
  );
}