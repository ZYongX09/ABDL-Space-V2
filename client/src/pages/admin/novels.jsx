import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Pill, Pagination, Loading, Empty, ErrorBox, useConfirm } from './ui';
import { fmtFull } from './util';

const PAGE_SIZE = 20;

const STATUS_META = {
  draft: { label: '草稿', tone: 'slate' },
  review_pending: { label: '待审核', tone: 'amber' },
  reviewing: { label: '审核中', tone: 'amber' },
  published: { label: '已发布', tone: 'green' },
  rejected: { label: '已驳回', tone: 'red' },
  archived: { label: '已归档', tone: 'slate' },
};

export default function AdminNovels() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [statusCounts, setStatusCounts] = useState({});
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState('');

  const load = useCallback(async (p, qq, st) => {
    setLoading(true);
    setErrors('');
    try {
      const data = await adminAPI.novels({ page: p, limit: PAGE_SIZE, q: qq || '', status: st || 'all' });
      setList(data.novels || []);
      setStatusCounts(data.statusCounts || {});
      setPagination(data.pagination || { page: 1, total: 0, totalPages: 1 });
    } catch (e) {
      setErrors(e.message || '加载失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(page, q, status); }, [page, q, status, load]);

  const changeStatus = async (n, target) => {
    const meta = STATUS_META[target] || {};
    const ok = await confirm({
      title: `将作品「${n.title}」设为${meta.label || target}？`,
      message: n.status === target ? '当前状态已是该值。' : `「${n.title}」（${n.author?.username || '未知作者'}，#${n.id}）\n当前状态：${(STATUS_META[n.status] || {}).label || n.status}`,
      okText: '确认',
      danger: target === 'archived',
    });
    if (!ok) return;
    setBusy(n.id);
    try {
      await adminAPI.novelStatus(n.id, target);
      toast.success(`已设为${meta.label || target}`);
      load(page, q, status);
    } catch (e) {
      toast.error(e.message || '操作失败');
    }
    setBusy(null);
  };

  return (
    <AdminLayout active="novels">
      <div className="ac-page-stack">
        <Card
          title="小说作品"
          icon="fa-book-open"
          action={
            <div className="ac-toolbar">
              <div className="ac-toolbar-group">
                <div className="ac-search"><i className="fa-solid fa-magnifying-glass fa-icon" aria-hidden="true" /><input className="ac-input" aria-label="搜索小说标题" placeholder="搜索标题" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
                <select className="ac-select" aria-label="按小说状态筛选" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
                  <option value="all">全部状态</option>
                  {Object.keys(STATUS_META).map(k => (
                    <option key={k} value={k}>{STATUS_META[k].label}{statusCounts[k] ? ` (${statusCounts[k]})` : ''}</option>
                  ))}
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
                <th scope="col">ID</th>
                <th scope="col">标题 / 作者</th>
                <th scope="col">类别</th>
                <th scope="col">卷 / 章</th>
                <th scope="col">状态</th>
                <th scope="col">更新于</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {(list || []).map(n => (
                <tr key={n.id}>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>#{n.id}</td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{n.author.username}</div>
                  </td>
                  <td style={{ fontSize: 12.5 }}>{n.category || '-'}</td>
                  <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{n.volumes} 卷 / {n.chapters} 章</td>
                  <td><Pill tone={(STATUS_META[n.status] || {}).tone || 'slate'}>{(STATUS_META[n.status] || { label: n.status }).label}</Pill></td>
                  <td className="ac-cell-muted">{fmtFull(n.updated_at)}</td>
                  <td>
                    <div className="ac-table-actions">
                      {n.status === 'published' && (
                        <button type="button" className="ac-btn" disabled={busy === n.id} onClick={() => changeStatus(n, 'archived')}><i className="fa-solid fa-box-archive" aria-hidden="true" /> 归档</button>
                      )}
                      {n.status === 'archived' && (
                        <button type="button" className="ac-btn" disabled={busy === n.id} onClick={() => changeStatus(n, 'published')}><i className="fa-solid fa-upload" aria-hidden="true" /> 重新发布</button>
                      )}
                      {(n.status === 'review_pending' || n.status === 'reviewing' || n.status === 'rejected' || n.status === 'draft') && (
                        <button type="button" className="ac-btn" disabled={busy === n.id} onClick={() => changeStatus(n, 'published')}><i className="fa-solid fa-check" aria-hidden="true" /> 发布</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
            {!loading && !list?.length && <Empty text="没有匹配的作品" />}
            {loading && !list && <Loading />}
          </div>
          <div style={{ marginTop: 12 }}>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}