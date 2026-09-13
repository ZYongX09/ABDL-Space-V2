import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Pagination, Loading, Empty, ErrorBox, UserCell, useConfirm } from './ui';
import { fmtFull, fmtNum } from './util';

const PAGE_SIZE = 20;

export default function AdminComments() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [postId, setPostId] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [errors, setErrors] = useState('');
  const [expanded, setExpanded] = useState({});

  const load = useCallback(async (p, qq, pid, first = false) => {
    setLoading(first);
    setErrors('');
    try {
      const data = await adminAPI.listComments({ page: p, limit: PAGE_SIZE, q: qq || '', post_id: Number(pid) || 0 });
      setList(data.comments || []);
      setPagination(data.pagination || { page: 1, total: 0, totalPages: 1 });
    } catch (e) {
      setErrors(e.message || '加载失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(page, q, postId); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, q, postId]);

  const remove = async (c) => {
    const ok = await confirm({
      title: '删除评论',
      message: `将永久删除评论 #${c.id}（帖子 #${c.post_id}，来自 @${c.user.username}）。此操作不可恢复。`,
      okText: '删除',
      danger: true,
    });
    if (!ok) return;
    setBusy(c.id);
    try {
      await adminAPI.deleteComment(c.id);
      toast.success('评论已删除');
      load(page, q, postId);
    } catch (e) {
      toast.error(e.message || '删除失败');
    }
    setBusy(null);
  };

  return (
    <AdminLayout active="comments">
      <div className="ac-page-stack">
        <Card
          title="评论管理"
          icon="fa-comments"
          action={
            <div className="ac-toolbar">
              <div className="ac-toolbar-group">
                <div className="ac-search"><i className="fa-solid fa-magnifying-glass fa-icon" aria-hidden="true" /><input className="ac-input" aria-label="搜索评论内容" placeholder="搜索评论内容" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} /></div>
                <input className="ac-input" inputMode="numeric" aria-label="按帖子 ID 过滤" placeholder="帖子 ID 过滤" value={postId} onChange={e => { setPostId(e.target.value.replace(/\D/g, '')); setPage(1); }} />
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
                <th scope="col">帖子</th>
                <th scope="col">作者</th>
                <th scope="col">内容</th>
                <th scope="col">点赞</th>
                <th scope="col">时间</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {(list || []).map(c => (
                <tr key={c.id}>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>#{c.id}</td>
                  <td><a href={`/forum/${c.post_id}`} target="_blank" rel="noreferrer" style={{ color: 'var(--link-color)', fontSize: 12.5 }}>#{c.post_id}</a></td>
                  <td><UserCell name={`@${c.user.username}`} avatar={c.user.avatar} sub={c.user.id} /></td>
                  <td style={{ maxWidth: 380 }}>
                    <div style={{ maxHeight: expanded[c.id] ? 400 : 56, overflow: 'hidden', lineHeight: 1.5, fontSize: 13 }}>
                      {c.content}
                    </div>
                    {c.content && c.content.length > 60 && (
                      <button type="button" className="ac-link-button" aria-expanded={!!expanded[c.id]} onClick={() => setExpanded(e => ({ ...e, [c.id]: !e[c.id] }))}>
                        {expanded[c.id] ? '收起' : '展开'}
                      </button>
                    )}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{fmtNum(c.like_count)}</td>
                  <td className="ac-cell-muted">{fmtFull(c.created_at)}</td>
                  <td>
                    <div className="ac-table-actions">
                      <button type="button" className="ac-btn ac-icon-button danger" aria-label="删除评论" title="删除评论" disabled={busy === c.id} onClick={() => remove(c)}><i className="fa-solid fa-trash-can" aria-hidden="true" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
            {!loading && !list?.length && <Empty text="没有匹配的评论" />}
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