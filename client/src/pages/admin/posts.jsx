import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Pill, Pagination, Loading, Empty, UserCell, useConfirm } from './ui';
import { fmtFull, fmtNum } from './util';

const PAGE_SIZE = 20;

export default function AdminPosts() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [errors, setErrors] = useState('');

  const load = useCallback(async (p, qq) => {
    setLoading(true);
    setErrors('');
    try {
      const data = await adminAPI.posts({ page: p, limit: PAGE_SIZE, q: qq || '' });
      setList(data.posts || []);
      setPagination(data.pagination || { page: 1, total: 0, totalPages: 1 });
    } catch (e) {
      setErrors(e.message || '加载失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(page, q); }, [page, q, load]);

  const togglePin = async (post) => {
    try {
      await adminAPI.pinPost(post.id);
      toast.success(post.pinned ? '已取消置顶' : '已置顶');
      load(page, q);
    } catch (e) {
      toast.error(e.message || '操作失败');
    }
  };

  const remove = async (p) => {
    const ok = await confirm({
      title: '删除帖子',
      message: `将永久删除帖子 #${p.id}（@{p.user?.username}）。此操作不可恢复！`,
      okText: '永久删除',
      danger: true,
    });
    if (!ok) return;
    setBusyId(p.id);
    try {
      await adminAPI.deletePost(p.id);
      toast.success('帖子已删除');
      load(page, q);
    } catch (e) {
      toast.error(e.message || '删除失败');
    }
    setBusyId(null);
  };

  return (
    <AdminLayout active="posts">
      <Card
        title="帖子管理"
        icon="fa-file-lines"
        action={
          <div className="ac-search"><i className="fa-solid fa-magnifying-glass fa-icon" /><input className="ac-input" placeholder="搜索内容 / 用户名" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} style={{ width: 220 }} /></div>
        }
      >
        {errors && <div style={{ color: 'var(--danger)', fontSize: 13, padding: '8px 0' }}>{errors}</div>}
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead>
              <tr>
                <th style={{ width: 46 }}>ID</th>
                <th>作者</th>
                <th>内容</th>
                <th>互动</th>
                <th>时间</th>
                <th>标签</th>
                <th style={{ width: 110 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {(list || []).map(p => (
                <tr key={p.id}>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>#{p.id}</td>
                  <td style={{ width: 180 }}><UserCell name={`@${p.user.username}`} avatar={p.user.avatar} /></td>
                  <td style={{ maxWidth: 420 }}>
                    <div style={{ fontSize: 13, display: expanded[p.id] ? 'block' : '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{p.content || '(空内容)'}</div>
                    {p.content && p.content.length > 80 && (
                      <a style={{ fontSize: 11.5, color: 'var(--link-color)', cursor: 'pointer' }} onClick={() => setExpanded(e => ({ ...e, [p.id]: !e[p.id] }))}>
                        {expanded[p.id] ? '收起' : '展开'}
                      </a>
                    )}
                  </td>
                  <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--primary-dark)' }}><i className="fa-solid fa-heart" style={{ fontSize: 10 }} /> {fmtNum(p.like_count)}</span>
                    {' '}<span style={{ color: 'var(--text-muted)' }}><i className="fa-solid fa-comment" style={{ fontSize: 10 }} /> {fmtNum(p.comment_count)}</span>
                  </td>
                  <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtFull(p.created_at)}</td>
                  <td>
                    <div className="ac-flex" style={{ gap: 4, flexWrap: 'wrap' }}>
                      {p.pinned && <Pill tone="amber"><i className="fa-solid fa-thumbtack" style={{ fontSize: 9 }} /> 置顶</Pill>}
                      {p.has_nsfw && <Pill tone="slate">NSFW</Pill>}
                      {p.is_announcement && <Pill tone="blue">公告</Pill>}
                    </div>
                  </td>
                  <td>
                    <div className="ac-flex" style={{ gap: 4 }}>
                      <button className="ac-btn" title={p.pinned ? '取消置顶' : '置顶'} disabled={busyId === p.id} onClick={() => togglePin(p)}>
                        <i className={`fa-solid ${p.pinned ? 'fa-thumbtack-slash' : 'fa-thumbtack'}`} />
                      </button>
                      <button className="ac-btn danger" title="删除" disabled={busyId === p.id} onClick={() => remove(p)}>
                        <i className="fa-solid fa-trash-can" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !list?.length && <Empty text="没有匹配的帖子" />}
          {loading && !list && <Loading />}
        </div>
        <div style={{ marginTop: 12 }}>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />
        </div>
      </Card>
    </AdminLayout>
  );
}