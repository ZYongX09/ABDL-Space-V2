import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Drawer, Empty, ErrorBox, Loading, Pagination, StatusPill, useConfirm, StatCard } from './ui';
import { fmtFull, fmtNum } from './util';
import {
  PAGE_SIZE,
  VIOLATION_PLACEHOLDER,
  diffBlockedState,
  desiredBlockedIds,
  newOperationId,
  normalizePhotos,
  normalizeReport,
  normalizeStatus,
  paginationState,
  photoDisplayUrl,
} from './albumReportsModel';
import './moderation-ux.css';

const STATUS_TABS = [
  { value: 'open', label: '待处理' },
  { value: 'resolved', label: '已处理' },
  { value: 'all', label: '全部' },
];

/** 相册举报只使用预览字段；勾选是全量期望屏蔽状态，不是增量命令。 */
export default function AdminAlbumReports() {
  const toast = useToast();
  const confirm = useConfirm();
  const [query, setQuery] = useState({ status: 'open', page: 1 });
  const [resource, setResource] = useState({ key: '', items: null, loading: true, error: '', pagination: { page: 1, totalPages: 1, total: 0 } });
  const [detailTarget, setDetailTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [checked, setChecked] = useState({});
  const [previews, setPreviews] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState({}); // 每个举报的确认 / 保存 / 决定独立占锁。
  const detailSeq = useRef(0);
  const detailTargetRef = useRef(null);
  const listSeq = useRef(0);
  const alive = useRef(false);
  const actionLocks = useRef(new Set());
  const queryRef = useRef(query);
  queryRef.current = query;
  const queryKey = JSON.stringify(query);

  const loadList = useCallback(async (params) => {
    const key = JSON.stringify(params);
    const request = ++listSeq.current;
    setResource(previous => ({ ...previous, key, items: previous.key === key ? previous.items : null, loading: true, error: '' }));
    try {
      const requested = Math.max(1, Math.floor(Number(params.page)) || 1);
      const data = await adminAPI.albumReports(params.status, PAGE_SIZE, (requested - 1) * PAGE_SIZE);
      if (!alive.current || request !== listSeq.current || key !== JSON.stringify(queryRef.current)) return;
      const next = paginationState(data?.total, requested);
      if (next.page !== requested) {
        setQuery(current => ({ ...current, page: next.page }));
        return;
      }
      setResource({ key, items: (data?.reports || []).map(normalizeReport).filter(Boolean), loading: false, error: '', pagination: { page: next.page, totalPages: next.totalPages, total: next.total } });
    } catch (failure) {
      if (alive.current && request === listSeq.current && key === JSON.stringify(queryRef.current)) {
        setResource(previous => ({ ...previous, loading: false, error: failure.message || '加载相册举报失败' }));
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; listSeq.current += 1; detailSeq.current += 1; detailTargetRef.current = null; };
  }, []);
  useEffect(() => { loadList(query); }, [query, loadList]);

  const readDetail = useCallback(async (reportId, reset = false) => {
    const id = String(reportId);
    const seq = ++detailSeq.current;
    detailTargetRef.current = id;
    setDetailTarget(id);
    if (reset) { setDetail(null); setChecked({}); }
    setPreviews({}); // 预览不在刷新或读回时自动重新请求。
    setDetailError('');
    setActionError('');
    setDetailLoading(true);
    try {
      const data = await adminAPI.albumReport(id);
      if (!alive.current || seq !== detailSeq.current || detailTargetRef.current !== id) return;
      if (!data?.report) throw new Error('服务器未返回举报详情');
      const report = normalizeReport(data.report);
      if (!report || report.id !== id) throw new Error('服务器返回的举报与当前对象不一致');
      setDetail({ report, photos: normalizePhotos(data.photos) });
      setChecked({});
    } catch (failure) {
      if (alive.current && seq === detailSeq.current && detailTargetRef.current === id) {
        setDetailError('加载举报详情失败: ' + (failure.message || ''));
      }
    } finally {
      if (alive.current && seq === detailSeq.current && detailTargetRef.current === id) setDetailLoading(false);
    }
  }, []);

  const openDetail = (row) => readDetail(row.id, true);
  const closeDetail = useCallback(() => {
    detailSeq.current += 1;
    detailTargetRef.current = null;
    setDetailTarget(null);
    setDetail(null);
    setChecked({});
    setPreviews({});
    setDetailError('');
    setActionError('');
    setDetailLoading(false);
  }, []);

  const refreshDetail = async () => {
    if (!detailTarget || detailLoading || actionLocks.current.has(detailTarget)) return;
    const seq = detailSeq.current;
    const id = detailTarget;
    if (detail && diffBlockedState(detail.photos, checked).hasChanges) {
      const ok = await confirm({ title: '刷新相册举报详情', message: `举报 #${id} 有未保存的屏蔽调整。刷新将丢弃这些调整，并重新读取服务器状态。`, okText: '丢弃调整并刷新' });
      if (!ok || seq !== detailSeq.current || detailTargetRef.current !== id) return;
    }
    readDetail(id);
  };

  const applyBlock = async () => {
    if (!detail || detailLoading || detailError || actionLocks.current.has(detail.report.id)) return;
    const { photos, report } = detail;
    const diff = diffBlockedState(photos, checked);
    if (!diff.hasChanges) return;
    const photoIds = desiredBlockedIds(photos, checked);
    const seq = detailSeq.current;
    const isCurrent = () => alive.current && seq === detailSeq.current && detailTargetRef.current === report.id;
    actionLocks.current.add(report.id);
    setBusy(previous => ({ ...previous, [report.id]: 'block' }));
    setActionError('');
    try {
      const ok = await confirm({
        title: '保存照片屏蔽状态',
        message: `举报 #${report.id} · 相册「${report.album_name || report.album_id}」：新增屏蔽 ${diff.toBlock.length} 张，解除屏蔽 ${diff.toUnblock.length} 张。保存后共屏蔽 ${photoIds.length} / ${photos.length} 张；解除后照片可再次展示。此操作不代表已处理举报。`,
        okText: '保存屏蔽状态',
        danger: diff.toUnblock.length > 0,
      });
      if (!ok || !isCurrent()) return;
      const operationId = newOperationId();
      const data = await adminAPI.blockAlbumPhotos(report.id, photoIds, operationId);
      if (!alive.current) return;
      // 不论是否仍打开当前详情，都刷新当前列表；旧操作绝不能重开或覆盖新详情。
      const listReadback = loadList(queryRef.current);
      if (!isCurrent()) { await listReadback; return; }
      const blocked = Array.isArray(data?.blocked_photo_ids) ? data.blocked_photo_ids.map(String) : photoIds;
      setDetail(previous => previous?.report.id === report.id
        ? { report: { ...previous.report, blocked_photo_count: blocked.length }, photos: previous.photos.map(photo => ({ ...photo, admin_blocked: blocked.includes(photo.id), preview_url: blocked.includes(photo.id) ? null : photo.preview_url })) }
        : previous);
      setChecked({});
      setPreviews({});
      toast.success(`已保存屏蔽状态：屏蔽 ${blocked.length} 张照片`);
      await Promise.all([listReadback, readDetail(report.id)]); // 全量写入后必须按服务器状态读回。
    } catch (failure) {
      if (isCurrent()) {
        const message = '保存屏蔽状态失败: ' + (failure.message || '');
        setActionError(message);
        toast.error(message);
      }
    } finally {
      actionLocks.current.delete(report.id);
      if (alive.current) setBusy(previous => { const next = { ...previous }; delete next[report.id]; return next; });
    }
  };

  const handleResolve = async () => {
    if (!detail || detailLoading || detailError || actionLocks.current.has(detail.report.id)) return;
    const report = detail.report;
    if (report.status !== 'open' || diffBlockedState(detail.photos, checked).hasChanges) return;
    const seq = detailSeq.current;
    const isCurrent = () => alive.current && seq === detailSeq.current && detailTargetRef.current === report.id;
    actionLocks.current.add(report.id);
    setBusy(previous => ({ ...previous, [report.id]: 'resolve' }));
    setActionError('');
    try {
      const ok = await confirm({
        title: '处理相册举报',
        message: `将举报 #${report.id}（相册「${report.album_name || report.album_id}」）标记为已处理？已屏蔽的照片保持屏蔽，可随时重新打开详情调整。`,
        okText: '确认处理',
      });
      if (!ok || !isCurrent()) return;
      await adminAPI.resolveAlbumReport(report.id);
      if (!alive.current) return;
      if (isCurrent()) { toast.success('已处理'); closeDetail(); }
      await loadList(queryRef.current);
    } catch (failure) {
      if (isCurrent()) {
        const message = '处理失败: ' + (failure.message || '');
        setActionError(message);
        toast.error(message);
      }
    } finally {
      actionLocks.current.delete(report.id);
      if (alive.current) setBusy(previous => { const next = { ...previous }; delete next[report.id]; return next; });
    }
  };

  const current = resource.key === queryKey;
  const list = current ? resource.items : null;
  const loading = !current || resource.loading;
  const error = current ? resource.error : '';
  const pagination = resource.pagination;
  const statusLabel = STATUS_TABS.find(tab => tab.value === query.status)?.label;
  const diff = detail ? diffBlockedState(detail.photos, checked) : { toBlock: [], toUnblock: [], hasChanges: false };
  const detailBusy = detailTarget ? busy[detailTarget] : null;
  const detailDisabled = !!detailBusy || detailLoading || !!detailError;
  const blockedCount = detail ? desiredBlockedIds(detail.photos, checked).length : 0;

  return (
    <AdminLayout active="album-reports">
      <div className="ac-page-stack ac-moderation">
        <div className="ac-mod-intro"><p>先核对相册与举报对象，再保存照片屏蔽状态或处理举报。预览需逐张主动查看。</p><button type="button" className="ac-btn" disabled={loading} onClick={() => loadList(queryRef.current)}><i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} aria-hidden="true" /> 刷新举报</button></div>
        <div className="ac-mod-summary"><StatCard label={`${statusLabel}相册举报`} value={list !== null ? fmtNum(pagination.total) : '—'} icon="fa-images" meta="当前已应用状态" compact /><StatCard label="当前页" value={list !== null ? `${pagination.page} / ${pagination.totalPages}` : '—'} icon="fa-list" meta={list !== null ? `本页 ${list.length} 条` : '等待加载'} compact /></div>
        <Card title="核对相册与照片屏蔽状态" icon="fa-flag" action={<div className="ac-action-group" role="group" aria-label="相册举报状态">{STATUS_TABS.map(tab => <button type="button" key={tab.value} className={`ac-btn ${query.status === tab.value ? 'primary' : ''}`} aria-pressed={query.status === tab.value} onClick={() => setQuery({ status: normalizeStatus(tab.value), page: 1 })}>{tab.label}</button>)}</div>}>
          <p className="ac-mod-applied" aria-live="polite">已应用：{statusLabel} · 第 {query.page} 页</p>
          <section aria-label="相册举报结果" aria-busy={loading} className="ac-mod-results">
            {error && <div className="ac-mod-feedback"><ErrorBox msg={error} />{list !== null && <p className="ac-mod-note">刷新失败，保留上次结果。</p>}<button type="button" className="ac-btn" onClick={() => loadList(queryRef.current)}>重试加载相册举报</button></div>}
            {loading && <Loading text={list !== null ? '正在刷新相册举报，暂时保留上次结果…' : '正在加载相册举报…'} />}
            {!loading && !error && list?.length === 0 && <Empty text={`暂无${statusLabel === '全部' ? '' : statusLabel}相册举报记录`} icon="fa-images" />}
            {!!list?.length && <>
              <p id="album-reports-table-scroll-hint" className="ac-mod-scroll-hint ac-desktop-only">表格较宽时可左右滚动查看全部字段；聚焦表格后可用方向键滚动。</p>
              <div className="ac-table-wrap ac-mod-table-scroll ac-desktop-only" role="region" aria-label="相册举报明细表格，可左右滚动" aria-describedby="album-reports-table-scroll-hint" tabIndex={0}><table className="ac-table ac-mod-table ac-mod-album-table">
                <caption className="ac-mod-sr-only">相册、相册主、举报人、理由、详情、时间、屏蔽计数与状态</caption>
                <thead><tr><th scope="col">举报 ID</th><th scope="col">相册</th><th scope="col">相册主</th><th scope="col">举报人</th><th scope="col">理由</th><th scope="col">详情</th><th scope="col">时间</th><th scope="col">屏蔽照片</th><th scope="col">状态</th><th scope="col">操作</th></tr></thead>
                <tbody>{list.map(report => <tr key={report.id}>
                  <td className="ac-mod-id-cell">#{report.id}</td><td className="ac-mod-content-cell"><div className="ac-mod-preview">{report.album_name || `相册 #${report.album_id}`}</div><div className="ac-cell-muted ac-mod-object-ref">相册 #{report.album_id}</div></td><td className="ac-mod-user-cell">@{report.owner_id}</td><td className="ac-mod-user-cell">@{report.reporter_id}</td>
                  <td className="ac-mod-content-cell"><div className="ac-mod-preview">{report.reason || '-'}</div></td><td className="ac-mod-content-cell"><div className="ac-mod-preview">{report.detail || '-'}</div></td><td className="ac-cell-muted ac-mod-date-cell">{fmtFull(report.created_at)}{report.resolved_at && <div>处理于 {fmtFull(report.resolved_at)}</div>}</td><td className="ac-mod-count-cell">{report.blocked_photo_count}/{report.album_photo_count}</td><td className="ac-mod-status-cell"><StatusPill status={report.status === 'open' ? 'pending' : 'resolved'} /></td><td className="ac-mod-actions-cell"><button type="button" className="ac-btn" aria-label={`查看举报 #${report.id} 详情`} onClick={() => openDetail(report)}>查看详情</button></td>
                </tr>)}</tbody>
              </table></div>
              <div className="ac-mobile-only ac-mod-records">{list.map(report => <article className="ac-mod-record" key={report.id} aria-label={`相册举报 #${report.id}`}>
                <header className="ac-mod-record-head"><h3>举报 #{report.id} · {report.album_name || `相册 #${report.album_id}`}</h3><StatusPill status={report.status === 'open' ? 'pending' : 'resolved'} /></header>
                <dl className="ac-mod-meta"><dt>相册 / 相册主</dt><dd>#{report.album_id} · @{report.owner_id}</dd><dt>举报人</dt><dd>@{report.reporter_id}</dd><dt>提交</dt><dd>{fmtFull(report.created_at)}</dd>{report.resolved_at && <><dt>处理</dt><dd>{fmtFull(report.resolved_at)}</dd></>}<dt>屏蔽照片</dt><dd>{report.blocked_photo_count}/{report.album_photo_count}</dd></dl>
                <div className="ac-mod-preview">{report.reason || '-'}</div><details className="ac-mod-details"><summary>展开举报说明</summary><dl className="ac-mod-meta"><dt>理由</dt><dd className="ac-mod-content">{report.reason || '-'}</dd><dt>详情</dt><dd className="ac-mod-content">{report.detail || '-'}</dd></dl></details>
                <button type="button" className="ac-btn" aria-label={`查看举报 #${report.id} 详情`} onClick={() => openDetail(report)}>查看详情与照片状态</button>
              </article>)}</div>
            </>}
            {list !== null && <fieldset className="ac-mod-pagination" disabled={loading || !!error}><Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={page => setQuery(previous => ({ ...previous, page }))} /></fieldset>}
          </section>
        </Card>

        <Drawer open={detailTarget !== null} onClose={closeDetail} head={`相册举报 #${detailTarget || ''}`}>
          <div className="ac-page-stack ac-moderation" aria-busy={detailLoading || !!detailBusy}>
            {detailError && <div className="ac-mod-feedback"><ErrorBox msg={detailError} /><button type="button" className="ac-btn" disabled={detailLoading || !!detailBusy} onClick={refreshDetail}>重试加载详情</button></div>}
            <ErrorBox msg={actionError} />
            {detailLoading && <Loading text={detail ? '正在读回最新相册与照片状态…' : '正在加载举报详情…'} />}
            {detail && <>
              <dl className="ac-kv ac-mod-content">
                <dt>相册</dt><dd>{detail.report.album_name || '-'} · #{detail.report.album_id}</dd><dt>相册主</dt><dd>@{detail.report.owner_id}</dd><dt>举报人</dt><dd>@{detail.report.reporter_id}</dd><dt>状态</dt><dd><StatusPill status={detail.report.status === 'open' ? 'pending' : 'resolved'} /></dd><dt>防盗图保护</dt><dd>{detail.report.download_protected ? '已开启' : '未开启'}</dd><dt>照片数</dt><dd>{detail.report.album_photo_count} 张（已屏蔽 {detail.report.blocked_photo_count} 张）</dd><dt>提交时间</dt><dd>{fmtFull(detail.report.created_at)}</dd>{detail.report.resolved_at && <><dt>处理时间</dt><dd>{fmtFull(detail.report.resolved_at)}</dd></>}<dt>理由</dt><dd>{detail.report.reason || '-'}</dd><dt>详情</dt><dd>{detail.report.detail || '-'}</dd>
              </dl>
              <div>
                <div className="ac-photo-grid-head"><h3 className="ac-card-title">照片状态与预览</h3><span className="ac-cell-muted">仅展示 60 秒预览图，不含原图与高清地址</span></div>
                <p className="ac-mod-note">进入详情不会自动加载照片。每张预览需主动查看；已屏蔽照片只显示本地占位图。</p>
                {!!detail.photos.length && <div className="ac-mod-photo-controls">
                  <span className="ac-cell-muted">期望屏蔽 {blockedCount} / {detail.photos.length} 张</span>
                  <button type="button" className="ac-btn" disabled={detailDisabled} onClick={() => setChecked(Object.fromEntries(detail.photos.map(photo => [photo.id, true])))}>勾选全部</button>
                  <button type="button" className="ac-btn" disabled={detailDisabled} onClick={() => setChecked(Object.fromEntries(detail.photos.map(photo => [photo.id, false])))}>取消全部勾选</button>
                </div>}
                {detail.photos.length ? <div className="ac-photo-grid">{detail.photos.map((photo, index) => {
                  const willBlock = checked[photo.id] ?? photo.admin_blocked;
                  const checkId = `album-photo-${detail.report.id}-${index}`;
                  return <div key={photo.id} className={`ac-photo-tile ${photo.admin_blocked ? 'blocked' : ''}`}>
                    <div className="ac-photo-frame">
                      {photo.admin_blocked || previews[photo.id] ? <img src={photoDisplayUrl(photo)} alt={photo.description || `照片 ${photo.id}`} loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.onerror = null; if (event.currentTarget.getAttribute('src') !== VIOLATION_PLACEHOLDER) event.currentTarget.src = VIOLATION_PLACEHOLDER; }} /> : <div className="ac-mod-photo-placeholder"><span>照片 {photo.id}</span>{photo.preview_url ? <button type="button" className="ac-btn" disabled={detailDisabled} onClick={() => setPreviews(previous => ({ ...previous, [photo.id]: true }))}>查看预览</button> : <span>暂无可用预览</span>}</div>}
                      {photo.admin_blocked && <span className="ac-photo-flag">已屏蔽</span>}
                    </div>
                    <label className="ac-photo-check" htmlFor={checkId}><input id={checkId} type="checkbox" checked={willBlock} disabled={detailDisabled} aria-label={`屏蔽照片 ${photo.id}`} onChange={event => setChecked(previous => ({ ...previous, [photo.id]: event.target.checked }))} /><span>{willBlock ? '屏蔽' : '展示'}</span></label>
                    <div className="ac-photo-meta">#{photo.id}{photo.width > 0 && photo.height > 0 ? ` · ${photo.width}×${photo.height}` : ''}{photo.description ? ` · ${photo.description}` : ''}</div>
                  </div>;
                })}</div> : <Empty text="该举报未附带照片清单" icon="fa-images" />}
                <div className="ac-photo-grid-hint" role="note">勾选 = 屏蔽，取消勾选 = 解除屏蔽；保存时提交全量期望状态，重复提交结果一致。</div>
                <p className="ac-mod-save-state" data-dirty={diff.hasChanges} role="status" aria-live="polite">{detailBusy === 'block' ? '正在保存并读回服务器状态…' : diff.hasChanges ? `未保存：新增屏蔽 ${diff.toBlock.length} 张 · 解除 ${diff.toUnblock.length} 张` : detailError ? '状态读取失败，请重试后再操作。' : '当前选择与服务器状态一致。'}</p>
                <div className="ac-action-group">
                  <button type="button" className="ac-btn primary" disabled={detailDisabled || !diff.hasChanges} onClick={applyBlock}>{detailBusy === 'block' ? '保存中…' : '保存屏蔽状态'}</button>
                  {detail.report.status === 'open' && <button type="button" className="ac-btn" disabled={detailDisabled || diff.hasChanges} onClick={handleResolve}>{detailBusy === 'resolve' ? '处理中…' : '处理举报'}</button>}
                  <button type="button" className="ac-btn" disabled={detailLoading || !!detailBusy} onClick={refreshDetail}>刷新详情</button>
                </div>
                {diff.hasChanges && <p className="ac-mod-note">处理举报前请先保存屏蔽调整，或刷新详情放弃调整；处理决定不会自动保存照片选择。</p>}
              </div>
            </>}
          </div>
        </Drawer>
      </div>
    </AdminLayout>
  );
}
