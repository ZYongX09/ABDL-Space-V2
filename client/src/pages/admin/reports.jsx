import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Modal, Pagination, Empty, FormField, StatusPill, useConfirm } from './ui';
import { fmtFull } from './util';

const PAGE_SIZE = 20;

export default function AdminReports() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('content');
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [list, setList] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(null); // 详情弹窗
  const [dismissTarget, setDismissTarget] = useState(null);
  const [dismissReason, setDismissReason] = useState('');
  const [busy, setBusy] = useState(null);

  // 内容举报
  const loadContent = useCallback(async (st, p) => {
    setLoading(true);
    try {
      const d = await adminAPI.reports(st, p);
      setList(d.reports || []);
      setPagination({ page: p, total: d.pagination?.total || 0, totalPages: Math.ceil((d.pagination?.total || 0) / PAGE_SIZE) });
    } catch (e) {
      toast.error('加载失败: ' + (e.message || ''));
    }
    setLoading(false);
  }, [toast]);

  // 交友请求举报
  const loadFriend = useCallback(async (st, p) => {
    setLoading(true);
    try {
      const d = await adminAPI.friendRequestReports(st, p);
      setList(d.reports || []);
      setPagination({ page: p, total: d.pagination?.total || 0, totalPages: Math.ceil((d.pagination?.total || 0) / PAGE_SIZE) });
    } catch (e) {
      toast.error('加载失败: ' + (e.message || ''));
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    if (tab === 'content') loadContent(status, page);
    else loadFriend(status, page);
  }, [tab, status, page, loadContent, loadFriend]);

  const setStatusAndReset = (s) => { setStatus(s); setPage(1); };

  const handleContent = async (r, action, deleteContent) => {
    setBusy(r.id);
    try {
      await adminAPI.resolveReport(r.id, action, deleteContent);
      toast.success(action === 'resolve' ? '已处理（内容已删除）' : '已驳回');
      setView(null);
      loadContent(status, page);
    } catch (e) {
      toast.error(e.message || '操作失败');
    }
    setBusy(null);
  };

  const acceptFriend = async (r) => {
    const ok = await confirm({
      title: '采纳举报',
      message: `将删除 @${r.request_username} 的交友请求，封禁其发布权限并通知举报人。`,
      okText: '采纳',
      danger: true,
    });
    if (!ok) return;
    setBusy(r.id);
    try {
      await adminAPI.acceptFriendRequestReport(r.id);
      toast.success('已采纳');
      loadFriend(status, page);
    } catch (e) {
      toast.error(e.message || '操作失败');
    }
    setBusy(null);
  };

  const dismissFriend = async () => {
    if (!dismissTarget) return;
    setBusy(dismissTarget.id);
    try {
      await adminAPI.dismissFriendRequestReport(dismissTarget.id, dismissReason.trim());
      toast.success('已驳回');
      setDismissTarget(null);
      setDismissReason('');
      loadFriend(status, page);
    } catch (e) {
      toast.error(e.message || '操作失败');
    }
    setBusy(null);
  };

  const isContent = tab === 'content';

  return (
    <AdminLayout active="reports">
      <div className="ac-page-stack">
        <div className="ac-toolbar">
          <div className="ac-toolbar-group">
            <button type="button" className={`ac-btn ${tab === 'content' ? 'primary' : ''}`} aria-pressed={tab === 'content'} onClick={() => setTab('content')}>内容举报</button>
            <button type="button" className={`ac-btn ${tab === 'friend' ? 'primary' : ''}`} aria-pressed={tab === 'friend'} onClick={() => setTab('friend')}>交友请求举报</button>
          </div>
        </div>

        <div className="ac-card">
          <div className="ac-card-head">
          <span className="ac-card-title"><i className="fa-solid fa-flag fa-icon" /> {isContent ? '内容举报' : '交友请求举报'}</span>
          <div className="ac-action-group">
            {['pending', 'resolved', 'dismissed'].map(s => (
              <button type="button" key={s} className={`ac-btn ${status === s ? 'primary' : ''}`} aria-pressed={status === s} onClick={() => setStatusAndReset(s)}>
                {s === 'pending' ? '待处理' : s === 'resolved' ? '已处理' : '已驳回'}
              </button>
            ))}
          </div>
          </div>
          <div className="ac-card-body">
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  {isContent ? (
                    <>
                      <th scope="col">对象</th><th scope="col">被举报内容</th><th scope="col">举报人</th><th scope="col">理由</th><th scope="col">时间</th><th scope="col">状态</th><th scope="col">操作</th>
                    </>
                  ) : (
                    <>
                      <th scope="col">被举报请求</th><th scope="col">请求描述</th><th scope="col">举报人</th><th scope="col">理由</th><th scope="col">时间</th><th scope="col">状态</th><th scope="col">操作</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {(list || []).map(r => (
                  <tr key={r.id}>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>#{r.id}</td>
                    {isContent ? (
                      <>
                        <td><span className="ac-pill blue">{r.target_type === 'post' ? '帖子' : '评论'}</span></td>
                        <td>
                          <div className="ac-cell-truncate" title={r.content_preview || '(空)'}>{r.content_preview || '(空)'}</div>
                          <div className="ac-cell-muted">#{r.target_id}</div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={{ fontWeight: 600 }}>@{r.request_username}</td>
                        <td className="ac-cell-muted ac-cell-truncate" title={r.request_title || r.request_description || '-'}>{r.request_title || r.request_description || '-'}</td>
                      </>
                    )}
                    <td>@{r.reporter_name}</td>
                    <td className="ac-cell-truncate" title={r.reason || '-'}>{r.reason || '-'}</td>
                    <td className="ac-cell-muted">{fmtFull(r.created_at)}</td>
                    <td><StatusPill status={r.status} /></td>
                    <td>
                      <div className="ac-table-actions">
                        <button type="button" className="ac-btn ac-icon-button" aria-label="查看举报详情" title="查看详情" onClick={() => setView(r)}><i className="fa-solid fa-eye" aria-hidden="true" /></button>
                        {r.status === 'pending' && (
                          isContent ? (
                            <>
                              <button type="button" className="ac-btn" disabled={busy === r.id} onClick={() => handleContent(r, 'resolve', false)}>处理</button>
                              <button type="button" className="ac-btn" disabled={busy === r.id} onClick={() => handleContent(r, 'dismiss', false)}>驳回</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="ac-btn danger" disabled={busy === r.id} onClick={() => acceptFriend(r)}>采纳</button>
                              <button type="button" className="ac-btn" disabled={busy === r.id} onClick={() => { setDismissTarget(r); setDismissReason(''); }}>驳回</button>
                            </>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && !list?.length && <Empty text="没有举报记录" icon="fa-flag" />}
            {loading && !list && <div className="ac-loading"><i className="fa-solid fa-spinner fa-spin" /> 加载中...</div>}
          </div>
          <div style={{ marginTop: 12 }}>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />
            </div>
          </div>
        </div>

        {/* 内容举报详情 */}
      <Modal open={!!view && isContent} onClose={() => setView(null)} title={`举报 #${view?.id} 详情`}>
        {view && isContent && (
          <div className="ac-page-stack">
            <dl className="ac-kv">
              <dt>对象</dt><dd>{view.target_type === 'post' ? '帖子' : '评论'} #{view.target_id}</dd>
              <dt>举报人</dt><dd>@{view.reporter_name}</dd>
              <dt>理由</dt><dd>{view.reason || '-'}</dd>
              <dt>提交于</dt><dd>{fmtFull(view.created_at)}</dd>
              <dt>目标内容</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{view.content_preview || '(已删除或为空)'}</dd>
            </dl>
            {view.status === 'pending' && (
              <div className="ac-action-group">
                <button type="button" className="ac-btn primary" disabled={busy === view.id} onClick={() => handleContent(view, 'resolve', true)}>
                  <i className="fa-solid fa-trash-can" aria-hidden="true" /> 删除内容并处理
                </button>
                <button type="button" className="ac-btn" disabled={busy === view.id} onClick={() => handleContent(view, 'resolve', false)}>
                  仅处理
                </button>
                <button type="button" className="ac-btn" disabled={busy === view.id} onClick={() => handleContent(view, 'dismiss', false)}>
                  驳回
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 交友请求详情 */}
      <Modal open={!!view && !isContent} onClose={() => setView(null)} title={`交友请求举报 · ${view?.id}`}>
        {view && !isContent && (
          <div className="ac-page-stack">
            <dl className="ac-kv">
              <dt>被举报请求</dt><dd>@{view.request_username}{view.request_user_email ? ` · ${view.request_user_email}` : ''}</dd>
              <dt>标题</dt><dd>{view.request_title || '-'}</dd>
              <dt>简介</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{view.request_description || '-'}</dd>
              <dt>找</dt><dd>{view.looking_for || '-'}</dd>
              <dt>举报人</dt><dd>@{view.reporter_name}</dd>
              <dt>理由</dt><dd>{view.reason || '-'}</dd>
              <dt>提交于</dt><dd>{fmtFull(view.created_at)}</dd>
              {view.admin_reply ? <><dt>管理员回复</dt><dd>{view.admin_reply}</dd></> : null}
            </dl>
          </div>
        )}
      </Modal>

      <Modal
        open={!!dismissTarget}
        onClose={() => { setDismissTarget(null); setDismissReason(''); }}
        title="驳回交友请求举报"
        width={460}
        footer={(
          <>
            <button type="button" className="ac-btn" onClick={() => { setDismissTarget(null); setDismissReason(''); }}>取消</button>
            <button type="button" className="ac-btn primary" disabled={busy === dismissTarget?.id} onClick={dismissFriend}>确认驳回</button>
          </>
        )}
      >
        <FormField label="驳回理由" hint="该内容会发送给举报人；如无须补充可留空。" htmlFor="dismiss-friend-reason">
          <textarea id="dismiss-friend-reason" className="ac-textarea" value={dismissReason} onChange={event => setDismissReason(event.target.value)} />
        </FormField>
      </Modal>
      </div>
    </AdminLayout>
  );
}