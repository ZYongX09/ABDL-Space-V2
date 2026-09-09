import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Pagination, Loading, Empty, UserCell, useConfirm } from './ui';
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
      <Card
        title="评论管理"
        icon="fa-comments"
        action={
          <div className="ac-flex" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="ac-search"><i className="fa-solid fa-magnifying-glass fa-icon" /><input className="ac-input" placeholder="搜索评论内容" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} style={{ width: 180 }} /></div>
            <input className="ac-input" placeholder="帖子 ID 过滤" value={postId} onChange={e => { setPostId(e.target.value.replace(/\D/g, '')); setPage(1); }} style={{ width: 110 }} />
          </div>
        }
      >
        {errors && <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 0' }}>{errors}</div>}
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>ID</th>
                <th style={{ width: 90 }}>帖子</th>
                <th style={{ width: 200 }}>作者</th>
                <th>内容</th>
                <th style={{ width: 80 }}>点赞</th>
                <th style={{ width: 130 }}>时间</th>
                <th style={{ width: 70 }}>操作</th>
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
                      <a style={{ fontSize: 11.5, color: 'var(--link-color)', cursor: 'pointer' }} onClick={() => setExpanded(e => ({ ...e, [c.id]: !e[c.id] }))}>
                        {expanded[c.id] ? '收起' : '展开'}
                      </a>
                    )}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{fmtNum(c.like_count)}</td>
                  <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtFull(c.created_at)}</td>
                  <td>
                    <button className="ac-btn danger" disabled={busy === c.id} onClick={() => remove(c)}><i className="fa-solid fa-trash-can" /></button>
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
    </AdminLayout>
  );
}