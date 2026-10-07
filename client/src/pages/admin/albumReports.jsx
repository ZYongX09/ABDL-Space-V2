import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Drawer, Empty, ErrorBox, Loading, Pagination, StatusPill, useConfirm } from './ui';
import { fmtFull } from './util';
import {
  PAGE_SIZE,
  VIOLATION_PLACEHOLDER,
  diffBlockedState,
  desiredBlockedIds,
  newOperationId,
  normalizePhoto,
  normalizeReport,
  normalizeStatus,
  paginationState,
  photoDisplayUrl,
} from './albumReportsModel';

const STATUS_TABS = [
  { value: 'open', label: '待处理' },
  { value: 'resolved', label: '已处理' },
  { value: 'all', label: '全部' },
];

/** 相册举报管理：列表 + 详情侧栏（相册元信息 / 预览图网格 / 批量屏蔽 / 处理举报）。 */
export default function AdminAlbumReports() {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [list, setList] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);

  // 详情侧栏状态；checked 为照片勾选覆盖（勾选 = 期望屏蔽），未覆盖时跟随服务器 admin_blocked。
  const [detail, setDetail] = useState(null);
  const [checked, setChecked] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [busy, setBusy] = useState(null); // 'block' | 'resolve'
  const detailSeq = useRef(0);

  const loadList = useCallback(async (st, p) => {
    setLoading(true);
    try {
      // offset 直接由请求页推导；页码合法性在校正阶段依据服务器 total 处理
      const requested = Math.max(1, Math.floor(Number(p)) || 1);
      const d = await adminAPI.albumReports(st, PAGE_SIZE, (requested - 1) * PAGE_SIZE);
      const next = paginationState(d?.total, requested);
      setList((d?.reports || []).map(normalizeReport).filter(Boolean));
      setPagination({ page: next.page, totalPages: next.totalPages, total: next.total });
      if (next.page !== requested) { setLoading(false); setPage(next.page); return; } // 总数缩水后自动回落到有效页
    } catch (e) {
      toast.error('加载相册举报失败: ' + (e.message || ''));
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadList(status, page);
  }, [status, page, loadList]);

  const openDetail = useCallback(async (row) => {
    const seq = ++detailSeq.current;
    setDetail(null);
    setChecked({});
    setDetailError('');
    setDetailLoading(true);
    try {
      const d = await adminAPI.albumReport(row.id);
      if (seq !== detailSeq.current) return; // 已切换到其他举报，丢弃旧响应
      if (!d || !d.report) throw new Error('服务器未返回举报详情');
      const report = normalizeReport(d.report);
      const photos = (d.photos || []).map(normalizePhoto).filter(Boolean);
      setDetail({ report, photos });
    } catch (e) {
      if (seq === detailSeq.current) {
        setDetailError('加载举报详情失败: ' + (e.message || ''));
        toast.error('加载举报详情失败: ' + (e.message || ''));
      }
    }
    if (seq === detailSeq.current) setDetailLoading(false);
  }, [toast]);

  const closeDetail = useCallback(() => {
    detailSeq.current += 1; // 使在途详情响应失效
    setDetail(null);
    setChecked({});
    setDetailError('');
  }, []);

  const refreshDetail = useCallback(async (reportId) => {
    const seq = ++detailSeq.current;
    setDetailLoading(true);
    setDetailError('');
    try {
      const d = await adminAPI.albumReport(reportId);
      if (seq !== detailSeq.current) return;
      if (!d || !d.report) throw new Error('服务器未返回举报详情');
      setDetail({ report: normalizeReport(d.report), photos: (d.photos || []).map(normalizePhoto).filter(Boolean) });
      setChecked({}); // 回到服务器当前状态
    } catch (e) {
      if (seq === detailSeq.current) {
        setDetailError('刷新举报详情失败: ' + (e.message || ''));
        toast.error('刷新举报详情失败: ' + (e.message || ''));
      }
    }
    if (seq === detailSeq.current) setDetailLoading(false);
  }, [toast]);

  const togglePhoto = (photoId, value) => {
    setChecked(prev => ({ ...prev, [photoId]: value }));
  };

  const applyBlock = async () => {
    if (!detail || detailLoading || busy) return;
    const { photos, report } = detail;
    const diff = diffBlockedState(photos, checked);
    if (!diff.hasChanges) return;
    const photoIds = desiredBlockedIds(photos, checked);
    const operationId = newOperationId();
    setBusy('block');
    try {
      const d = await adminAPI.blockAlbumPhotos(report.id, photoIds, operationId);
      const blocked = Array.isArray(d?.blocked_photo_ids) ? d.blocked_photo_ids.map(String) : photoIds;
      // 以服务器确认的全量期望状态回填本地，再按契约刷新
      setDetail(prev => prev && prev.report.id === report.id
        ? { report: { ...prev.report, blocked_photo_count: blocked.length }, photos: prev.photos.map(p => ({ ...p, admin_blocked: blocked.includes(p.id) })) }
        : prev);
      setChecked({});
      toast.success(diff.toUnblock.length ? `已更新屏蔽状态：屏蔽 ${blocked.length} 张` : `已屏蔽 ${blocked.length} 张照片`);
      loadList(status, page); // 列表中的屏蔽计数同步刷新
      refreshDetail(report.id); // 以服务器为准再读一次详情
    } catch (e) {
      toast.error('批量屏蔽失败: ' + (e.message || ''));
    }
    setBusy(null);
  };

  const handleResolve = async () => {
    if (!detail || busy) return;
    const report = detail.report;
    if (report.status !== 'open') return;
    const ok = await confirm({
      title: '处理相册举报',
      message: `将举报 #${report.id}（相册「${report.album_name || report.album_id}」）标记为已处理？已屏蔽的照片保持屏蔽，可随时重新打开详情调整。`,
      okText: '确认处理',
    });
    if (!ok) return;
    setBusy('resolve');
    try {
      await adminAPI.resolveAlbumReport(report.id);
      toast.success('已处理');
      closeDetail();
      loadList(status, page);
    } catch (e) {
      toast.error('处理失败: ' + (e.message || ''));
    }
    setBusy(null);
  };

  const setStatusAndReset = (s) => { setStatus(normalizeStatus(s)); setPage(1); };

  const diff = detail ? diffBlockedState(detail.photos, checked) : { toBlock: [], toUnblock: [], hasChanges: false };

  return (
    <AdminLayout active="album-reports">
      <div className="ac-page-stack">
        <div className="ac-toolbar">
          <div className="ac-toolbar-group">
            {STATUS_TABS.map(tab => (
              <button
                type="button"
                key={tab.value}
                className={`ac-btn ${status === tab.value ? 'primary' : ''}`}
                aria-pressed={status === tab.value}
                onClick={() => setStatusAndReset(tab.value)}
              >{tab.label}</button>
            ))}
            <button type="button" className="ac-btn" disabled={loading} onClick={() => loadList(status, page)}>
              <i className="fa-solid fa-rotate-right fa-icon" aria-hidden="true" /> 刷新
            </button>
          </div>
        </div>

        <div className="ac-card">
          <div className="ac-card-head">
            <span className="ac-card-title"><i className="fa-solid fa-images fa-icon" /> 相册举报</span>
          </div>
          <div className="ac-card-body">
            <div className="ac-table-wrap">
              <table className="ac-table">
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">相册</th>
                    <th scope="col">相册主</th>
                    <th scope="col">举报人</th>
                    <th scope="col">理由</th>
                    <th scope="col">详情</th>
                    <th scope="col">时间</th>
                    <th scope="col">屏蔽照片</th>
                    <th scope="col">状态</th>
                    <th scope="col">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(list || []).map(r => (
                    <tr key={r.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>#{r.id}</td>
                      <td>
                        <div className="ac-cell-truncate" style={{ fontWeight: 600 }} title={r.album_name || r.album_id}>{r.album_name || `相册 #${r.album_id}`}</div>
                        <div className="ac-cell-muted">#{r.album_id}</div>
                      </td>
                      <td>@{r.owner_id}</td>
                      <td>@{r.reporter_id}</td>
                      <td className="ac-cell-truncate" title={r.reason || '-'}>{r.reason || '-'}</td>
                      <td className="ac-cell-muted ac-cell-truncate" title={r.detail || '-'}>{r.detail || '-'}</td>
                      <td className="ac-cell-muted">
                        {fmtFull(r.created_at)}
                        {r.resolved_at && <div className="ac-cell-muted" style={{ fontSize: 11 }}>处理于 {fmtFull(r.resolved_at)}</div>}
                      </td>
                      <td>
                        <span className={`ac-pill ${r.blocked_photo_count > 0 ? 'red' : 'slate'}`}>{r.blocked_photo_count}/{r.album_photo_count}</span>
                      </td>
                      <td><StatusPill status={r.status === 'open' ? 'pending' : 'resolved'} /></td>
                      <td>
                        <div className="ac-table-actions">
                          <button type="button" className="ac-btn ac-icon-button" aria-label={`查看举报 #${r.id} 详情`} title="查看详情" onClick={() => openDetail(r)}>
                            <i className="fa-solid fa-eye" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !list?.length && <Empty text="没有相册举报记录" icon="fa-images" />}
              {loading && !list && <div className="ac-loading"><i className="fa-solid fa-spinner fa-spin" /> 加载中...</div>}
            </div>
            <div style={{ marginTop: 12 }}>
              <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />
            </div>
          </div>
        </div>

        <Drawer open={!!detail || detailLoading || !!detailError} onClose={closeDetail} head={detail ? `相册举报 #${detail.report.id}` : '相册举报详情'}>
          <div className="ac-page-stack">
            <ErrorBox msg={detailError} />
            {detailLoading && <Loading text="加载举报详情..." />}
            {detail && (
              <>
                <dl className="ac-kv">
                  <dt>相册</dt><dd>{detail.report.album_name || '-'} <span className="ac-cell-muted">#{detail.report.album_id}</span></dd>
                  <dt>相册主</dt><dd>@{detail.report.owner_id}</dd>
                  <dt>举报人</dt><dd>@{detail.report.reporter_id}</dd>
                  <dt>防盗图保护</dt>
                  <dd>{detail.report.download_protected
                    ? <span className="ac-pill violet"><i className="fa-solid fa-shield-halved" aria-hidden="true" /> 已开启</span>
                    : <span className="ac-pill slate">未开启</span>}</dd>
                  <dt>照片数</dt><dd>{detail.report.album_photo_count} 张（已屏蔽 {detail.report.blocked_photo_count} 张）</dd>
                  <dt>提交时间</dt><dd>{fmtFull(detail.report.created_at)}</dd>
                  {detail.report.resolved_at && <><dt>处理时间</dt><dd>{fmtFull(detail.report.resolved_at)}</dd></>}
                  <dt>理由</dt><dd>{detail.report.reason || '-'}</dd>
                  <dt>详情</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{detail.report.detail || '-'}</dd>
                </dl>

                <div>
                  <div className="ac-photo-grid-head">
                    <span className="ac-card-title"><i className="fa-solid fa-images fa-icon" /> 照片预览</span>
                    <span className="ac-cell-muted">仅展示 60 秒预览图，不含原图与高清地址</span>
                  </div>
                  {detail.photos.length ? (
                    <div className="ac-photo-grid">
                      {detail.photos.map((photo, index) => {
                        const willBlock = checked[photo.id] ?? photo.admin_blocked;
                        const checkId = `album-photo-${detail.report.id}-${index}`;
                        return (
                          <div key={photo.id} className={`ac-photo-tile ${photo.admin_blocked ? 'blocked' : ''}`}>
                            <label className="ac-photo-frame" htmlFor={checkId} title={photo.description || `照片 ${photo.id}`}>
                              <img
                                src={photoDisplayUrl(photo)}
                                alt={photo.description || `照片 ${photo.id}`}
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                onError={event => { event.currentTarget.src = VIOLATION_PLACEHOLDER; }}
                              />
                              {photo.admin_blocked && <span className="ac-photo-flag">已屏蔽</span>}
                            </label>
                            <label className="ac-photo-check" htmlFor={checkId}>
                              <input
                                id={checkId}
                                type="checkbox"
                                checked={willBlock}
                                disabled={busy === 'block'}
                                aria-label={`屏蔽照片 ${photo.id}`}
                                onChange={event => togglePhoto(photo.id, event.target.checked)}
                              />
                              <span>{willBlock ? '屏蔽' : '展示'}</span>
                            </label>
                            <div className="ac-photo-meta">
                              {photo.width > 0 && photo.height > 0 ? `${photo.width}×${photo.height}` : ''}
                              {photo.description ? ` ${photo.description}` : ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Empty text="该举报未附带照片清单" icon="fa-images" />
                  )}
                  <div className="ac-photo-grid-hint" role="note">
                    勾选 = 屏蔽，取消勾选 = 解除屏蔽；保存时提交全量期望状态，重复提交结果一致。
                    {diff.hasChanges && <strong> 待应用：屏蔽 {diff.toBlock.length} 张 · 解除 {diff.toUnblock.length} 张</strong>}
                  </div>
                  <div className="ac-action-group">
                    <button
                      type="button"
                      className="ac-btn primary"
                      disabled={busy === 'block' || busy === 'resolve' || detailLoading || !diff.hasChanges}
                      onClick={applyBlock}
                    >
                      {busy === 'block'
                        ? <><i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> 保存中...</>
                        : <><i className="fa-solid fa-shield-halved" aria-hidden="true" /> 批量屏蔽</>}
                    </button>
                    {detail.report.status === 'open' && (
                      <button type="button" className="ac-btn" disabled={busy === 'block' || busy === 'resolve'} onClick={handleResolve}>
                        {busy === 'resolve'
                          ? <><i className="fa-solid fa-spinner fa-spin" aria-hidden="true" /> 处理中...</>
                          : <><i className="fa-solid fa-check" aria-hidden="true" /> 处理举报</>}
                      </button>
                    )}
                    <button type="button" className="ac-btn" disabled={detailLoading} onClick={() => refreshDetail(detail.report.id)}>
                      <i className="fa-solid fa-rotate-right" aria-hidden="true" /> 刷新
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </Drawer>
      </div>
    </AdminLayout>
  );
}
