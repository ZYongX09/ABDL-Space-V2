import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Pagination, Loading, Empty, ErrorBox, UserCell, useConfirm, StatCard } from './ui';
import { fmtFull, fmtNum } from './util';
import './moderation-ux.css';

const PAGE_SIZE = 20;

export default function AdminComments() {
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [postId, setPostId] = useState('');
  const [query, setQuery] = useState({ page: 1, q: '', postId: '' });
  const [resource, setResource] = useState({ key: '', items: null, loading: true, error: '', pagination: { page: 1, total: 0, totalPages: 1 } });
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
      const data = await adminAPI.listComments({ page: params.page, limit: PAGE_SIZE, q: params.q, post_id: Number(params.postId) || 0 });
      if (!alive.current || request !== requestSeq.current || key !== JSON.stringify(queryRef.current)) return;
      const items = data.comments || [];
      const total = data.pagination?.total ?? items.length;
      const totalPages = Math.max(1, data.pagination?.totalPages ?? Math.ceil(total / PAGE_SIZE));
      if (params.page > totalPages) {
        setQuery(current => ({ ...current, page: totalPages }));
        return;
      }
      setResource({ key, items, loading: false, error: '', pagination: { page: params.page, total, totalPages } });
    } catch (error) {
      if (alive.current && request === requestSeq.current && key === JSON.stringify(queryRef.current)) {
        setResource(previous => ({ ...previous, loading: false, error: error.message || '加载评论失败' }));
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
  const normalizedPostId = postId ? String(Number(postId) || '') : '';
  const draftChanged = q.trim() !== query.q || normalizedPostId !== query.postId;

  const applySearch = (event) => {
    event.preventDefault();
    const next = { page: 1, q: q.trim(), postId: normalizedPostId };
    if (JSON.stringify(next) === queryKey) load(queryRef.current);
    else setQuery(next);
  };

  const resetSearch = () => {
    setQ('');
    setPostId('');
    const next = { page: 1, q: '', postId: '' };
    if (JSON.stringify(next) === queryKey) load(queryRef.current);
    else setQuery(next);
  };

  const remove = async (comment) => {
    const id = String(comment.id);
    if (loading || error || actionLocks.current.has(id)) return;
    actionLocks.current.add(id);
    setBusy(previous => ({ ...previous, [id]: true }));
    setActionErrors(previous => ({ ...previous, [id]: '' }));
    try {
      const ok = await confirm({
        title: '删除评论',
        message: `将永久删除评论 #${comment.id}（帖子 #${comment.post_id}，来自 @${comment.user?.username || '未知用户'}）。只删除这条评论，不删除原帖；此操作不可恢复。`,
        okText: '永久删除评论',
        danger: true,
      });
      if (!ok || !alive.current) return;
      await adminAPI.deleteComment(comment.id);
      if (!alive.current) return;
      toast.success('评论已删除');
      await load(queryRef.current);
    } catch (failure) {
      if (alive.current) {
        const message = failure.message || '删除失败，请重试';
        setActionErrors(previous => ({ ...previous, [id]: message }));
        toast.error(message);
      }
    } finally {
      actionLocks.current.delete(id);
      if (alive.current) setBusy(previous => { const next = { ...previous }; delete next[id]; return next; });
    }
  };

  const renderContent = (comment) => (
    <div className="ac-mod-copy">
      <div className="ac-mod-preview">{comment.content || '(空内容)'}</div>
      {comment.content && <details className="ac-mod-details"><summary>查看完整评论</summary><div className="ac-mod-content">{comment.content}</div></details>}
    </div>
  );
  const renderActions = (comment) => (
    <div className="ac-mod-action-stack" aria-busy={!!busy[comment.id]}>
      <button type="button" className="ac-btn danger" disabled={loading || !!error || !!busy[comment.id]} onClick={() => remove(comment)}>{busy[comment.id] ? '删除中…' : '删除评论'}</button>
      <ErrorBox msg={actionErrors[comment.id]} />
    </div>
  );

  return (
    <AdminLayout active="comments">
      <div className="ac-page-stack ac-moderation">
        <div className="ac-mod-intro"><p>结合原帖与作者核对评论；删除仅针对单条评论。</p><button type="button" className="ac-btn" disabled={loading} onClick={() => load(queryRef.current)}><i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} aria-hidden="true" /> 刷新评论</button></div>
        <div className="ac-mod-summary">
          <StatCard label="匹配评论" value={list !== null ? fmtNum(pagination.total) : '—'} icon="fa-comments" meta="当前已应用筛选" compact />
          <StatCard label="当前页" value={list !== null ? `${pagination.page} / ${pagination.totalPages}` : '—'} icon="fa-list" meta={list !== null ? `本页 ${list.length} 条` : '等待加载'} compact />
        </div>
        <Card title="定位评论与核对原帖" icon="fa-filter">
          <form className="ac-mod-filter" onSubmit={applySearch} role="search" aria-label="评论筛选">
            <label className="ac-mod-field"><span>评论内容</span><input className="ac-input" aria-label="搜索评论内容" placeholder="搜索评论内容" value={q} onChange={event => setQ(event.target.value)} /></label>
            <label className="ac-mod-field ac-mod-id-field"><span>所属帖子 ID</span><input className="ac-input" inputMode="numeric" aria-label="按帖子 ID 过滤" placeholder="全部帖子" value={postId} onChange={event => setPostId(event.target.value.replace(/\D/g, ''))} /></label>
            <div className="ac-action-group"><button type="submit" className="ac-btn primary">应用筛选</button><button type="button" className="ac-btn" onClick={resetSearch}>重置</button></div>
          </form>
          <p className="ac-mod-applied" aria-live="polite">已应用：{query.q ? `关键词「${query.q}」` : '全部评论'}{query.postId ? ` · 帖子 #${query.postId}` : ' · 不限帖子'} · 第 {query.page} 页{draftChanged && <strong> · 输入尚未应用</strong>}</p>
          <p className="ac-mod-note">帖子链接在新窗口打开。完整评论可展开查看，不截断长文本；删除后不可恢复。</p>
          <section aria-label="评论结果" aria-busy={loading} className="ac-mod-results">
            {error && <div className="ac-mod-feedback"><ErrorBox msg={error} />{list !== null && <p className="ac-mod-note">刷新失败，保留上次结果；请重试后再操作。</p>}<button type="button" className="ac-btn" onClick={() => load(queryRef.current)}>重试加载评论</button></div>}
            {loading && <Loading text={list !== null ? '正在刷新评论，暂时保留上次结果…' : '正在加载评论…'} />}
            {!loading && !error && list?.length === 0 && <Empty text={query.q || query.postId ? '没有匹配的评论，可调整条件或重置筛选' : '暂无评论'} />}
            {!!list?.length && <>
              <p id="comments-table-scroll-hint" className="ac-mod-scroll-hint ac-desktop-only">表格较宽时可左右滚动查看全部字段；聚焦表格后可用方向键滚动。</p>
              <div className="ac-table-wrap ac-mod-table-scroll ac-desktop-only" role="region" aria-label="评论明细表格，可左右滚动" aria-describedby="comments-table-scroll-hint" tabIndex={0}>
                <table className="ac-table ac-mod-table ac-mod-comments-table">
                  <caption className="ac-mod-sr-only">评论、所属帖子、作者、完整内容与删除操作</caption>
                  <thead><tr><th scope="col">评论</th><th scope="col">所属帖子</th><th scope="col">作者</th><th scope="col">内容</th><th scope="col">点赞</th><th scope="col">时间</th><th scope="col">操作</th></tr></thead>
                  <tbody>{list.map(comment => <tr key={comment.id}>
                    <td className="ac-mod-id-cell">#{comment.id}</td><td className="ac-mod-object-cell"><a className="ac-mod-link" href={`/forum/${comment.post_id}`} target="_blank" rel="noreferrer">帖子 #{comment.post_id}<span className="ac-mod-sr-only"> 在新窗口打开</span></a></td>
                    <td className="ac-mod-user-cell"><UserCell name={`@${comment.user?.username || '未知用户'}`} avatar={comment.user?.avatar} sub={comment.user?.id} /></td>
                    <td className="ac-mod-content-cell">{renderContent(comment)}</td><td className="ac-mod-count-cell">{fmtNum(comment.like_count)}</td><td className="ac-cell-muted ac-mod-date-cell">{fmtFull(comment.created_at)}</td><td className="ac-mod-actions-cell">{renderActions(comment)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div className="ac-mobile-only ac-mod-records">{list.map(comment => <article className="ac-mod-record" key={comment.id} aria-label={`评论 #${comment.id}`}>
                <header className="ac-mod-record-head"><h3>评论 #{comment.id}</h3><a className="ac-mod-link" href={`/forum/${comment.post_id}`} target="_blank" rel="noreferrer">帖子 #{comment.post_id}</a></header>
                <UserCell name={`@${comment.user?.username || '未知用户'}`} avatar={comment.user?.avatar} sub={comment.user?.id} />
                <dl className="ac-mod-meta"><dt>发布</dt><dd>{fmtFull(comment.created_at)}</dd><dt>点赞</dt><dd>{fmtNum(comment.like_count)}</dd></dl>
                {renderContent(comment)}{renderActions(comment)}
              </article>)}</div>
            </>}
            {list !== null && <fieldset className="ac-mod-pagination" disabled={loading || !!error}><Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={nextPage => setQuery(previous => ({ ...previous, page: nextPage }))} /></fieldset>}
          </section>
        </Card>
      </div>
    </AdminLayout>
  );
}
