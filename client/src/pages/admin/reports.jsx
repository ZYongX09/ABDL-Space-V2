import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Modal, Pagination, Empty, Loading, ErrorBox, FormField, StatusPill, useConfirm, StatCard } from './ui';
import { fmtFull, fmtNum } from './util';
import './moderation-ux.css';

const PAGE_SIZE = 20;
const STATUS_LABELS = { pending: '待处理', resolved: '已处理', dismissed: '已驳回' };

export default function AdminReports() {
  const toast = useToast();
  const confirm = useConfirm();
  const [query, setQuery] = useState({ tab: 'content', status: 'pending', page: 1 });
  const [resource, setResource] = useState({ key: '', items: null, loading: true, error: '', pagination: { page: 1, total: 0, totalPages: 1 } });
  const [view, setView] = useState(null); // 固定详情所属类型，避免切换后把内容举报当成交友举报。
  const [dismissTarget, setDismissTarget] = useState(null);
  const [dismissReason, setDismissReason] = useState('');
  const [busy, setBusy] = useState({});
  const [actionErrors, setActionErrors] = useState({});
  const queryRef = useRef(query);
  const requestSeq = useRef(0);
  const alive = useRef(false);
  const actionLocks = useRef(new Set());
  queryRef.current = query;
  const queryKey = JSON.stringify(query);

  const load = useCallback(async (params) => {
    const key = JSON.stringify(params);
    const request = ++requestSeq.current;
    setResource(previous => ({ ...previous, key, items: previous.key === key ? previous.items : null, loading: true, error: '' }));
    try {
      const data = params.tab === 'content'
        ? await adminAPI.reports(params.status, params.page)
        : await adminAPI.friendRequestReports(params.status, params.page);
      if (!alive.current || request !== requestSeq.current || key !== JSON.stringify(queryRef.current)) return;
      const items = data.reports || [];
      const total = data.pagination?.total ?? items.length;
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (params.page > totalPages) {
        setQuery(current => ({ ...current, page: totalPages }));
        return;
      }
      setResource({ key, items, loading: false, error: '', pagination: { page: params.page, total, totalPages } });
    } catch (error) {
      if (alive.current && request === requestSeq.current && key === JSON.stringify(queryRef.current)) {
        setResource(previous => ({ ...previous, loading: false, error: error.message || '加载举报失败' }));
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; requestSeq.current += 1; };
  }, []);
  useEffect(() => { load(query); }, [query, load]);

  const current = resource.key === queryKey;
  const list = current ? resource.items : null;
  const loading = !current || resource.loading;
  const error = current ? resource.error : '';
  const pagination = resource.pagination;
  const isContent = query.tab === 'content';
  const kindLabel = isContent ? '内容举报' : '交友请求举报';
  const actionKey = (kind, report) => `${kind}:${report.id}`;

  const changeFilter = (patch) => {
    setView(null);
    setDismissTarget(null);
    setDismissReason('');
    setQuery(previous => ({ ...previous, ...patch, page: 1 }));
  };

  const runAction = async (kind, report, action, options, execute, successText) => {
    const key = actionKey(kind, report);
    if (loading || error || report.status !== 'pending' || actionLocks.current.has(key)) return;
    actionLocks.current.add(key);
    setBusy(previous => ({ ...previous, [key]: action }));
    setActionErrors(previous => ({ ...previous, [key]: '' }));
    try {
      const ok = await confirm(options);
      if (!ok || !alive.current) return;
      await execute();
      if (!alive.current) return;
      toast.success(successText);
      setView(previous => previous?.kind === kind && previous.report.id === report.id ? null : previous);
      if (kind === 'friend') {
        setDismissTarget(previous => previous?.id === report.id ? null : previous);
      }
      await load(queryRef.current);
    } catch (failure) {
      if (alive.current) {
        const message = failure.message || '操作失败，请重试';
        setActionErrors(previous => ({ ...previous, [key]: message }));
        toast.error(message);
      }
    } finally {
      actionLocks.current.delete(key);
      if (alive.current) setBusy(previous => { const next = { ...previous }; delete next[key]; return next; });
    }
  };

  const handleContent = (report, action, deleteContent) => {
    const target = `${report.target_type === 'post' ? '帖子' : '评论'} #${report.target_id}`;
    const impact = action === 'dismiss'
      ? '将驳回本条举报，不删除目标内容。'
      : deleteContent ? '将删除目标内容并标记举报为已处理；删除不可恢复。' : '仅将举报标记为已处理，不删除目标内容。';
    return runAction('content', report, deleteContent ? 'delete' : action, {
      title: action === 'dismiss' ? '驳回内容举报' : deleteContent ? '删除内容并处理举报' : '仅处理举报',
      message: `举报 #${report.id} · ${target} · 举报人 @${report.reporter_name || '未知用户'}。${impact}`,
      okText: action === 'dismiss' ? '确认驳回' : deleteContent ? '删除内容并处理' : '仅处理',
      danger: deleteContent,
    }, () => adminAPI.resolveReport(report.id, action, deleteContent), action === 'dismiss' ? '已驳回，未删除内容' : deleteContent ? '已处理，内容已删除' : '已处理，未删除内容');
  };

  const acceptFriend = (report) => runAction('friend', report, 'accept', {
    title: '采纳交友请求举报',
    message: `举报 #${report.id}（举报人 @${report.reporter_name || '未知用户'}）：将删除 @${report.request_username || '未知用户'} 的交友请求，封禁其发布权限并通知举报人。`,
    okText: '采纳并封禁发布',
    danger: true,
  }, () => adminAPI.acceptFriendRequestReport(report.id), '已采纳举报');

  const dismissFriend = () => {
    if (!dismissTarget) return;
    const report = dismissTarget;
    const reply = dismissReason.trim();
    return runAction('friend', report, 'dismiss', {
      title: '确认驳回交友请求举报',
      message: `举报 #${report.id} · @${report.request_username || '未知用户'} 的交友请求。不会删除请求或封禁发布权限；将通知举报人 @${report.reporter_name || '未知用户'}。${reply ? `回复：${reply}` : '不附加回复。'}`,
      okText: '确认驳回',
    }, () => adminAPI.dismissFriendRequestReport(report.id, reply), '已驳回举报');
  };

  const openDismiss = (report) => {
    setView(null);
    setDismissTarget(report);
    setDismissReason('');
    setActionErrors(previous => ({ ...previous, [actionKey('friend', report)]: '' }));
  };
  const closeDismiss = () => {
    if (dismissTarget && actionLocks.current.has(actionKey('friend', dismissTarget))) return;
    setDismissTarget(null);
    setDismissReason('');
  };

  const renderActions = (report, kind, inDetail = false) => {
    const key = actionKey(kind, report);
    const disabled = loading || !!error || !!busy[key];
    return <div className="ac-mod-action-stack" aria-busy={!!busy[key]}>
      <div className="ac-action-group">
        {!inDetail && <button type="button" className="ac-btn" onClick={() => setView({ kind, report })} aria-label={`查看举报 #${report.id} 详情`}>详情</button>}
        {report.status === 'pending' && (kind === 'content' ? <>
          {inDetail && <button type="button" className="ac-btn danger" disabled={disabled} onClick={() => handleContent(report, 'resolve', true)}>{busy[key] === 'delete' ? '删除处理中…' : '删除内容并处理'}</button>}
          <button type="button" className="ac-btn" disabled={disabled} onClick={() => handleContent(report, 'resolve', false)}>{busy[key] === 'resolve' ? '处理中…' : '仅处理'}</button>
          <button type="button" className="ac-btn" disabled={disabled} onClick={() => handleContent(report, 'dismiss', false)}>{busy[key] === 'dismiss' ? '驳回中…' : '驳回'}</button>
        </> : <>
          <button type="button" className="ac-btn danger" disabled={disabled} onClick={() => acceptFriend(report)}>{busy[key] === 'accept' ? '采纳中…' : '采纳'}</button>
          <button type="button" className="ac-btn" disabled={disabled} onClick={() => openDismiss(report)}>驳回</button>
        </>)}
      </div>
      <ErrorBox msg={actionErrors[key]} />
    </div>;
  };

  return (
    <AdminLayout active="reports">
      <div className="ac-page-stack ac-moderation">
        <div className="ac-mod-intro"><p>分别核对内容举报与交友请求举报；每项决定只作用于当前记录。</p><button type="button" className="ac-btn" disabled={loading} onClick={() => load(queryRef.current)}><i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} aria-hidden="true" /> 刷新举报</button></div>
        <div className="ac-action-group" role="group" aria-label="举报类型">
          <button type="button" className={`ac-btn ${isContent ? 'primary' : ''}`} aria-pressed={isContent} onClick={() => changeFilter({ tab: 'content' })}>内容举报</button>
          <button type="button" className={`ac-btn ${!isContent ? 'primary' : ''}`} aria-pressed={!isContent} onClick={() => changeFilter({ tab: 'friend' })}>交友请求举报</button>
        </div>
        <div className="ac-mod-summary">
          <StatCard label={`${kindLabel} · ${STATUS_LABELS[query.status]}`} value={list !== null ? fmtNum(pagination.total) : '—'} icon="fa-flag" meta="仅当前类型与状态，不代表全部举报" compact />
          <StatCard label="当前页" value={list !== null ? `${pagination.page} / ${pagination.totalPages}` : '—'} icon="fa-list" meta={list !== null ? `本页 ${list.length} 条` : '等待加载'} compact />
        </div>
        <Card title="核对举报与提交决定" icon="fa-flag" action={<div className="ac-action-group" role="group" aria-label="举报状态">{Object.entries(STATUS_LABELS).map(([status, label]) => <button type="button" key={status} className={`ac-btn ${query.status === status ? 'primary' : ''}`} aria-pressed={query.status === status} onClick={() => changeFilter({ status })}>{label}</button>)}</div>}>
          <p className="ac-mod-applied" aria-live="polite">已应用：{kindLabel} · {STATUS_LABELS[query.status]} · 第 {query.page} 页</p>
          <p className="ac-mod-note">{isContent ? '仅处理不删除内容；删除内容并处理需进入详情确认。驳回不会删除目标内容。' : '采纳将删除交友请求、封禁发布权限并通知举报人；驳回可附带回复，不删除请求。'}</p>
          <section aria-label={`${kindLabel}结果`} aria-busy={loading} className="ac-mod-results">
            {error && <div className="ac-mod-feedback"><ErrorBox msg={error} />{list !== null && <p className="ac-mod-note">刷新失败，保留上次结果；请重试后再操作。</p>}<button type="button" className="ac-btn" onClick={() => load(queryRef.current)}>重试加载举报</button></div>}
            {loading && <Loading text={list !== null ? '正在刷新举报，暂时保留上次结果…' : '正在加载举报…'} />}
            {!loading && !error && list?.length === 0 && <Empty text={`暂无${STATUS_LABELS[query.status]}的${kindLabel}`} icon="fa-flag" />}
            {!!list?.length && <>
              <p id="reports-table-scroll-hint" className="ac-mod-scroll-hint ac-desktop-only">表格较宽时可左右滚动查看全部字段；聚焦表格后可用方向键滚动。</p>
              <div className="ac-table-wrap ac-mod-table-scroll ac-desktop-only" role="region" aria-label="举报明细表格，可左右滚动" aria-describedby="reports-table-scroll-hint" tabIndex={0}>
                <table className="ac-table ac-mod-table ac-mod-reports-table">
                  <caption className="ac-mod-sr-only">{kindLabel}对象、举报人、理由、时间、状态与单条操作</caption>
                  <thead><tr><th scope="col">举报 ID</th>{isContent ? <><th scope="col">对象</th><th scope="col">被举报内容</th></> : <><th scope="col">被举报请求</th><th scope="col">请求描述</th></>}<th scope="col">举报人</th><th scope="col">理由</th><th scope="col">时间</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
                  <tbody>{list.map(report => <tr key={`${query.tab}:${report.id}`}>
                    <td className="ac-mod-id-cell">#{report.id}</td>
                    {isContent ? <><td className="ac-mod-object-cell">{report.target_type === 'post' ? '帖子' : '评论'} #{report.target_id}</td><td className="ac-mod-content-cell"><div className="ac-mod-preview">{report.content_preview || '(已删除或为空)'}</div></td></> : <><td className="ac-mod-object-cell">@{report.request_username || '未知用户'}</td><td className="ac-mod-content-cell"><div className="ac-mod-preview">{report.request_title || report.request_description || '-'}</div></td></>}
                    <td className="ac-mod-user-cell">@{report.reporter_name || '未知用户'}</td><td className="ac-mod-content-cell"><div className="ac-mod-preview">{report.reason || '-'}</div></td><td className="ac-cell-muted ac-mod-date-cell">{fmtFull(report.created_at)}</td><td className="ac-mod-status-cell"><StatusPill status={report.status} /></td><td className="ac-mod-actions-cell">{renderActions(report, query.tab)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div className="ac-mobile-only ac-mod-records">{list.map(report => <article className="ac-mod-record" key={`${query.tab}:${report.id}`} aria-label={`举报 #${report.id}`}>
                <header className="ac-mod-record-head"><h3>举报 #{report.id}</h3><StatusPill status={report.status} /></header>
                <dl className="ac-mod-meta"><dt>{isContent ? '对象' : '被举报请求'}</dt><dd>{isContent ? `${report.target_type === 'post' ? '帖子' : '评论'} #${report.target_id}` : `@${report.request_username || '未知用户'}`}</dd><dt>举报人</dt><dd>@{report.reporter_name || '未知用户'}</dd><dt>提交</dt><dd>{fmtFull(report.created_at)}</dd></dl>
                <div className="ac-mod-preview">{report.reason || '未填写理由'}</div>
                <details className="ac-mod-details"><summary>展开举报与对象内容</summary><dl className="ac-mod-meta"><dt>举报理由</dt><dd className="ac-mod-content">{report.reason || '-'}</dd>{isContent ? <><dt>目标内容</dt><dd className="ac-mod-content">{report.content_preview || '(已删除或为空)'}</dd></> : <><dt>请求标题</dt><dd className="ac-mod-content">{report.request_title || '-'}</dd><dt>请求描述</dt><dd className="ac-mod-content">{report.request_description || '-'}</dd><dt>找</dt><dd className="ac-mod-content">{report.looking_for || '-'}</dd>{report.admin_reply && <><dt>管理员回复</dt><dd className="ac-mod-content">{report.admin_reply}</dd></>}</>}</dl></details>
                {renderActions(report, query.tab)}
              </article>)}</div>
            </>}
            {list !== null && <fieldset className="ac-mod-pagination" disabled={loading || !!error}><Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={page => { setView(null); setQuery(previous => ({ ...previous, page })); }} /></fieldset>}
          </section>
        </Card>

        <Modal open={!!view} onClose={() => setView(null)} title={`${view?.kind === 'content' ? '内容' : '交友请求'}举报 #${view?.report.id} 详情`} className="ac-moderation">
          {view && <div className="ac-page-stack">
            <dl className="ac-kv ac-mod-content">
              <dt>举报状态</dt><dd><StatusPill status={view.report.status} /></dd>
              {view.kind === 'content' ? <><dt>对象</dt><dd>{view.report.target_type === 'post' ? '帖子' : '评论'} #{view.report.target_id}</dd><dt>目标内容</dt><dd>{view.report.content_preview || '(已删除或为空)'}</dd></> : <>
                <dt>被举报请求</dt><dd>@{view.report.request_username || '未知用户'}{view.report.request_user_email ? ` · ${view.report.request_user_email}` : ''}</dd>
                <dt>标题</dt><dd>{view.report.request_title || '-'}</dd><dt>简介</dt><dd>{view.report.request_description || '-'}</dd><dt>找</dt><dd>{view.report.looking_for || '-'}</dd>
              </>}
              <dt>举报人</dt><dd>@{view.report.reporter_name || '未知用户'}</dd><dt>理由</dt><dd>{view.report.reason || '-'}</dd><dt>提交于</dt><dd>{fmtFull(view.report.created_at)}</dd>
              {view.report.admin_reply && <><dt>管理员回复</dt><dd>{view.report.admin_reply}</dd></>}
            </dl>
            {view.report.status === 'pending' && <p className="ac-mod-note">{view.kind === 'content' ? '仅处理保留内容；删除内容并处理不可恢复。请核对目标 ID 后确认。' : '采纳将删除该请求、封禁发布权限并通知举报人。驳回只改变本条举报决定。'}</p>}
            {renderActions(view.report, view.kind, true)}
          </div>}
        </Modal>
        <Modal open={!!dismissTarget} onClose={closeDismiss} title={`驳回交友请求举报 #${dismissTarget?.id}`} width={460} className="ac-moderation" footer={<><button type="button" className="ac-btn" disabled={!!dismissTarget && !!busy[actionKey('friend', dismissTarget)]} onClick={closeDismiss}>取消</button><button type="button" className="ac-btn primary" disabled={loading || !!error || (!!dismissTarget && !!busy[actionKey('friend', dismissTarget)])} onClick={dismissFriend}>{dismissTarget && busy[actionKey('friend', dismissTarget)] ? '驳回中…' : '确认驳回'}</button></>}>
          {dismissTarget && <div className="ac-page-stack">
            <p className="ac-mod-note">对象：@{dismissTarget.request_username || '未知用户'} 的交友请求；举报人：@{dismissTarget.reporter_name || '未知用户'}。驳回不会删除请求或封禁发布权限。</p>
            <ErrorBox msg={actionErrors[actionKey('friend', dismissTarget)]} />
            <FormField label="驳回理由" hint="该内容会发送给举报人；如无须补充可留空。" htmlFor="dismiss-friend-reason"><textarea id="dismiss-friend-reason" className="ac-textarea" value={dismissReason} disabled={!!busy[actionKey('friend', dismissTarget)]} onChange={event => setDismissReason(event.target.value)} /></FormField>
          </div>}
        </Modal>
      </div>
    </AdminLayout>
  );
}
