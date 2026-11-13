import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, Pill, Pagination, Loading, Empty, ErrorBox, UserCell, useConfirm, StatCard } from './ui';
import { fmtFull, fmtNum } from './util';
import './moderation-ux.css';

const PAGE_SIZE = 20;

export default function AdminPosts() {
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState({ page: 1, q: '' });
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
      const data = await adminAPI.posts({ page: params.page, limit: PAGE_SIZE, q: params.q });
      if (!alive.current || request !== requestSeq.current || key !== JSON.stringify(queryRef.current)) return;
      const items = data.posts || [];
      const total = data.pagination?.total ?? items.length;
      const totalPages = Math.max(1, data.pagination?.totalPages ?? Math.ceil(total / PAGE_SIZE));
      if (params.page > totalPages) {
        setQuery(current => ({ ...current, page: totalPages }));
        return;
      }
      setResource({ key, items, loading: false, error: '', pagination: { page: params.page, total, totalPages } });
    } catch (error) {
      if (alive.current && request === requestSeq.current && key === JSON.stringify(queryRef.current)) {
        setResource(previous => ({ ...previous, loading: false, error: error.message || '加载帖子失败' }));
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
  const draftChanged = q.trim() !== query.q;

  const applySearch = (event) => {
    event.preventDefault();
    const next = { page: 1, q: q.trim() };
    if (JSON.stringify(next) === queryKey) load(queryRef.current);
    else setQuery(next);
  };

  const resetSearch = () => {
    setQ('');
    const next = { page: 1, q: '' };
    if (JSON.stringify(next) === queryKey) load(queryRef.current);
    else setQuery(next);
  };

  // 锁按帖子隔离；确认期间也占锁，防止重复提交或覆盖其他记录的忙碌状态。
  const runAction = async (post, action, options, execute, successText) => {
    const id = String(post.id);
    if (loading || error || actionLocks.current.has(id)) return;
    actionLocks.current.add(id);
    setBusy(previous => ({ ...previous, [id]: action }));
    setActionErrors(previous => ({ ...previous, [id]: '' }));
    try {
      const ok = await confirm(options);
      if (!ok || !alive.current) return;
      const result = await execute();
      if (!alive.current) return;
      toast.success(typeof successText === 'function' ? successText(result) : successText);
      await load(queryRef.current);
    } catch (failure) {
      if (alive.current) {
        const message = failure.message || '操作失败，请重试';
        setActionErrors(previous => ({ ...previous, [id]: message }));
        toast.error(message);
      }
    } finally {
      actionLocks.current.delete(id);
      if (alive.current) setBusy(previous => { const next = { ...previous }; delete next[id]; return next; });
    }
  };

  const togglePin = (post) => runAction(post, 'pin', {
    title: post.pinned ? '取消置顶帖子' : '置顶帖子',
    message: `帖子 #${post.id}（@${post.user?.username || '未知用户'}）${post.pinned ? '将不再置顶，内容不会删除。' : '将显示为置顶帖子，内容和敏感标记不会改变。'}`,
    okText: post.pinned ? '取消置顶' : '确认置顶',
  }, () => adminAPI.pinPost(post.id), result => result.pinned ? '已置顶' : '已取消置顶');

  const setNsfw = (post) => {
    const next = !post.has_nsfw;
    return runAction(post, 'nsfw', {
      title: next ? '标记敏感内容' : '取消敏感标记',
      message: next
        ? `确定将帖子 #${post.id}（@${post.user?.username || '未知用户'}）标记为敏感内容吗？前台将显示敏感提示，并按客户端设置遮挡相关媒体。`
        : `确定取消帖子 #${post.id}（@${post.user?.username || '未知用户'}）的敏感内容标记吗？取消后该帖子可能直接进入普通信息流和搜索结果。`,
      okText: next ? '标记为敏感' : '取消标记',
      danger: !next,
    }, () => adminAPI.setPostNsfw(post.id, next), result => result.has_nsfw ? '已标记为敏感内容' : '已取消敏感标记');
  };

  const remove = (post) => runAction(post, 'delete', {
    title: '删除帖子',
    message: `将永久删除帖子 #${post.id}（@${post.user?.username || '未知用户'}）。此操作不可恢复！`,
    okText: '永久删除',
    danger: true,
  }, () => adminAPI.deletePost(post.id), '帖子已删除');

  const renderContent = (post) => (
    <div className="ac-mod-copy">
      <div className="ac-mod-preview">{post.content || '(空内容)'}</div>
      {post.content && <details className="ac-mod-details"><summary>查看完整内容</summary><div className="ac-mod-content">{post.content}</div></details>}
    </div>
  );
  const renderTags = (post) => (
    <div className="ac-action-group">
      {post.pinned && <Pill tone="amber">置顶</Pill>}
      {post.has_nsfw && <Pill tone="amber">敏感内容</Pill>}
      {post.is_announcement && <Pill tone="blue">公告</Pill>}
      {!post.pinned && !post.has_nsfw && !post.is_announcement && <span className="ac-cell-muted">普通帖子</span>}
    </div>
  );
  const renderActions = (post) => (
    <div className="ac-mod-action-stack" aria-busy={!!busy[post.id]}>
      <div className="ac-action-group">
        <button type="button" className="ac-btn" disabled={loading || !!error || !!busy[post.id]} onClick={() => togglePin(post)}>{busy[post.id] === 'pin' ? '置顶更新中…' : post.pinned ? '取消置顶' : '置顶'}</button>
        <button type="button" className="ac-btn" aria-pressed={!!post.has_nsfw} disabled={loading || !!error || !!busy[post.id]} onClick={() => setNsfw(post)}>{busy[post.id] === 'nsfw' ? '标记更新中…' : post.has_nsfw ? '取消敏感标记' : '标记敏感'}</button>
        <button type="button" className="ac-btn danger" disabled={loading || !!error || !!busy[post.id]} onClick={() => remove(post)}>{busy[post.id] === 'delete' ? '删除中…' : '删除帖子'}</button>
      </div>
      <ErrorBox msg={actionErrors[post.id]} />
    </div>
  );

  return (
    <AdminLayout active="posts">
      <div className="ac-page-stack ac-moderation">
        <div className="ac-mod-intro"><p>先核对帖子与作者，再调整展示状态或删除内容。</p><button type="button" className="ac-btn" disabled={loading} onClick={() => load(queryRef.current)}><i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} aria-hidden="true" /> 刷新帖子</button></div>
        <div className="ac-mod-summary">
          <StatCard label="匹配帖子" value={list !== null ? fmtNum(pagination.total) : '—'} icon="fa-file-lines" meta="当前已应用筛选" compact />
          <StatCard label="当前页" value={list !== null ? `${pagination.page} / ${pagination.totalPages}` : '—'} icon="fa-list" meta={list !== null ? `本页 ${list.length} 条` : '等待加载'} compact />
        </div>
        <Card title="查找帖子与调整展示" icon="fa-filter">
          <form className="ac-mod-filter" onSubmit={applySearch} role="search" aria-label="帖子筛选">
            <label className="ac-mod-field"><span>内容 / 用户名</span><input className="ac-input" aria-label="搜索帖子内容或用户名" placeholder="搜索内容 / 用户名" value={q} onChange={event => setQ(event.target.value)} /></label>
            <div className="ac-action-group"><button type="submit" className="ac-btn primary">应用搜索</button><button type="button" className="ac-btn" onClick={resetSearch}>重置</button></div>
          </form>
          <p className="ac-mod-applied" aria-live="polite">已应用：{query.q ? `关键词「${query.q}」` : '全部帖子'} · 第 {query.page} 页{draftChanged && <strong> · 输入尚未应用</strong>}</p>
          <p className="ac-mod-note">置顶只调整展示；敏感标记影响前台提示与媒体遮挡；删除不可恢复。</p>
          <section aria-label="帖子结果" aria-busy={loading} className="ac-mod-results">
            {error && <div className="ac-mod-feedback"><ErrorBox msg={error} />{list !== null && <p className="ac-mod-note">刷新失败，保留上次结果；请重试后再操作。</p>}<button type="button" className="ac-btn" onClick={() => load(queryRef.current)}>重试加载帖子</button></div>}
            {loading && <Loading text={list !== null ? '正在刷新帖子，暂时保留上次结果…' : '正在加载帖子…'} />}
            {!loading && !error && list?.length === 0 && <Empty text={query.q ? '没有匹配的帖子，可调整关键词或重置筛选' : '暂无帖子'} />}
            {!!list?.length && <>
              <p id="posts-table-scroll-hint" className="ac-mod-scroll-hint ac-desktop-only">表格较宽时可左右滚动查看全部字段；聚焦表格后可用方向键滚动。</p>
              <div className="ac-table-wrap ac-mod-table-scroll ac-desktop-only" role="region" aria-label="帖子明细表格，可左右滚动" aria-describedby="posts-table-scroll-hint" tabIndex={0}>
                <table className="ac-table ac-mod-table ac-mod-posts-table">
                  <caption className="ac-mod-sr-only">帖子、作者、内容与单条管理操作</caption>
                  <thead><tr><th scope="col">帖子</th><th scope="col">作者</th><th scope="col">内容</th><th scope="col">互动</th><th scope="col">时间</th><th scope="col">标签</th><th scope="col">操作</th></tr></thead>
                  <tbody>{list.map(post => <tr key={post.id}>
                    <td className="ac-mod-id-cell"><a className="ac-mod-link" href={`/forum/${post.id}`} target="_blank" rel="noreferrer">#{post.id}<span className="ac-mod-sr-only"> 在新窗口打开帖子</span></a></td>
                    <td className="ac-mod-user-cell"><UserCell name={`@${post.user?.username || '未知用户'}`} avatar={post.user?.avatar} sub={post.user?.id} /></td>
                    <td className="ac-mod-content-cell">{renderContent(post)}</td>
                    <td className="ac-cell-muted ac-mod-count-cell">{fmtNum(post.like_count)} 赞 · {fmtNum(post.comment_count)} 评论</td>
                    <td className="ac-cell-muted ac-mod-date-cell">{fmtFull(post.created_at)}</td><td className="ac-mod-status-cell">{renderTags(post)}</td><td className="ac-mod-actions-cell">{renderActions(post)}</td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div className="ac-mobile-only ac-mod-records">{list.map(post => <article className="ac-mod-record" key={post.id} aria-label={`帖子 #${post.id}`}>
                <header className="ac-mod-record-head"><h3><a className="ac-mod-link" href={`/forum/${post.id}`} target="_blank" rel="noreferrer">帖子 #{post.id}</a></h3>{renderTags(post)}</header>
                <UserCell name={`@${post.user?.username || '未知用户'}`} avatar={post.user?.avatar} sub={post.user?.id} />
                <dl className="ac-mod-meta"><dt>发布</dt><dd>{fmtFull(post.created_at)}</dd><dt>互动</dt><dd>{fmtNum(post.like_count)} 赞 · {fmtNum(post.comment_count)} 评论</dd></dl>
                {renderContent(post)}{renderActions(post)}
              </article>)}</div>
            </>}
            {list !== null && <fieldset className="ac-mod-pagination" disabled={loading || !!error}><Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={nextPage => setQuery(previous => ({ ...previous, page: nextPage }))} /></fieldset>}
          </section>
        </Card>
      </div>
    </AdminLayout>
  );
}
