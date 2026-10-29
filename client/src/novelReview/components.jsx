import { useEffect, useRef, useState } from 'react';
import { adminAPI } from '../api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { adminSessionKey } from '../pages/admin/access.js';
import { Card, Empty, ErrorBox, Loading, Modal, Pill, Tabs, useConfirm } from '../pages/admin/ui.jsx';
import { fmtFull } from '../pages/admin/util.js';
import { createNovelReviewController, initialReviewState, NOVEL_REASON_MAX, REVIEW_STATUSES, reviewAvailability, statusMeta } from './model.js';
import './review.css';

const MODES = [{ value: 'reviews', label: '作品审核', icon: 'fa-book-open' }, { value: 'works', label: '作品治理', icon: 'fa-book' }, { value: 'reports', label: '小说举报', icon: 'fa-flag' }, { value: 'creators', label: '创作者限制', icon: 'fa-user-shield' }];
const FIELD_NAMES = { title: '标题', description: '简介', work_type: '作品类型', cover_url: '封面', tags: '标签', statements: '声明', source: '来源', authorization: '授权说明', completed: '完结状态' };
const TYPE_NAMES = { original: '原创', repost: '转载', ai: 'AI 创作' };
function Status({ value }) { const [label, tone] = statusMeta(value); return <Pill tone={tone}>{label}</Pill>; }
const display = value => value == null ? '未提供' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
function safeImage(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; } }

export function NovelMetadata({ item }) {
  const image = safeImage(item.cover_url);
  return <section className="nr-section"><h3>完整作品与作者信息</h3><div className="nr-metadata-layout">
    {image ? <img className="nr-cover" src={image} alt={`${item.title}的封面`} referrerPolicy="no-referrer" /> : <div className="nr-cover nr-no-cover">未提供封面</div>}
    <dl className="nr-metadata">
      <div><dt>标题</dt><dd>{item.title}</dd></div><div><dt>作者</dt><dd>{item.author.display_name || item.author.username} · @{item.author.username} · 账号 #{item.author.id}</dd></div>
      <div><dt>作者主页</dt><dd>{item.author.url || '未提供'}</dd></div><div><dt>作者头像地址</dt><dd>{item.author.avatar || '未提供'}</dd></div><div><dt>作品 ID</dt><dd>{item.work_id || item.id}</dd></div>
      <div><dt>类型 / 完结</dt><dd>{TYPE_NAMES[item.work_type] || item.work_type} / {item.completed ? '已完结' : '连载中'}</dd></div><div><dt>标签</dt><dd>{item.tags.length ? item.tags.join('、') : '无标签'}</dd></div>
      <div className="nr-wide"><dt>简介</dt><dd>{item.description || '未填写'}</dd></div><div className="nr-wide"><dt>创作与内容声明</dt><dd>{item.statements.length ? <ul>{item.statements.map((text, index) => <li key={index}>{text}</li>)}</ul> : '未提供声明'}</dd></div>
      <div className="nr-wide"><dt>来源</dt><dd>{item.source || '未填写'}</dd></div><div className="nr-wide"><dt>授权说明</dt><dd>{item.authorization || '未填写'}</dd></div>
      <div className="nr-wide"><dt>原始封面地址</dt><dd>{item.cover_url || '未提供'}</dd></div>
    </dl></div></section>;
}

export function ChangeSummary({ changes, baseReleaseId }) {
  const kinds = { added: '新增', updated: '修改', unchanged: '未修改', removed: '移除' };
  return <section className="nr-section"><h3>相对已发布版本的差异</h3><p className="nr-muted">基准发布版本 {baseReleaseId || '无（首次提交）'}。以下差异由服务器给出；正文始终读取完整候选快照。</p>
    {!changes ? <p role="status">服务端未返回差异数据，不能据此推断「无变更」。</p> : <>
      <h4>元数据变化</h4>{Array.isArray(changes.metadata) ? changes.metadata.length ? <ul>{changes.metadata.map((field, index) => <li key={index}>{typeof field === 'string' ? FIELD_NAMES[field] || field : display(field)}</li>)}</ul> : <p>元数据未变化</p> : <pre className="nr-pre">{display(changes.metadata)}</pre>}
      <h4>章节变化</h4>{Array.isArray(changes.chapters) ? changes.chapters.length ? <ul className="nr-change-list">{changes.chapters.map((chapter, index) => <li key={`${chapter.id}-${index}`}><strong>{kinds[chapter.kind] || chapter.kind || '变更'}</strong><span>{chapter.title || chapter.id}</span><code>{chapter.id}</code>{chapter.before != null && <pre className="nr-pre">变更前 {display(chapter.before)}</pre>}{chapter.after != null && <pre className="nr-pre">变更后 {display(chapter.after)}</pre>}</li>)}</ul> : <p>无章节变化</p> : <pre className="nr-pre">{display(changes.chapters)}</pre>}
      {Object.keys(changes).filter(key => !['metadata', 'chapters'].includes(key)).map(key => <div key={key}><h4>{FIELD_NAMES[key] || key}</h4><pre className="nr-pre">{display(changes[key])}</pre></div>)}
    </>}
  </section>;
}
export function ReviewHistory({ audit }) {
  const labels = { submit: '提交', claim: '认领', release: '释放', approve: '通过', reject: '驳回', human_approve: '人工通过', human_reject: '人工驳回', ai_assistance: 'AI 辅助检查', ai: 'AI 辅助检查', admin_withdraw: '管理员下架', admin_restore: '管理员恢复', withdraw: '下架', restore: '恢复', suspend: '限制创作者' };
  return <section className="nr-section"><h3>审核历史与操作理由</h3>{audit == null ? <p>服务端未返回审核历史。</p> : !audit.length ? <p>服务器返回的历史记录为空。</p> : <ol className="nr-history">{audit.map((entry, index) => <li key={entry.id || index}><div><strong>{labels[entry.action] || entry.action || '操作'}</strong><span>{entry.actor_name || entry.actor_id || '系统'} · {fmtFull(entry.created_at)}</span></div><p>{entry.reason || '未附理由'}</p><details><summary>查看完整审计字段</summary><pre className="nr-pre">{display(entry)}</pre></details></li>)}</ol>}</section>;
}

function AIReview({ state, controller, allowed }) {
  const ai = state.ai, item = state.selected;
  const current = item.chapters.find(chapter => chapter.id === ai.chapter_id);
  return <section className="nr-section nr-ai"><h3>统一 App AI · 仅作辅助</h3><p>复用站点设置中的同一 provider；本页不保存令牌。只有管理员主动点击才发送请求，逐章逐块检查，结果不会自动通过、驳回或更改作品。</p>
    <div className="nr-actions"><button type="button" className="ac-btn" disabled={!allowed || state.saving || state.needsReload || ai.status === 'running'} onClick={() => controller.startAI()}>{['error', 'cancelled'].includes(ai.status) ? '从未完成分块继续 AI 检查' : ai.status === 'complete' ? '重新检查全部候选章节' : '手动开始全文 AI 辅助检查'}</button>{ai.status === 'running' && <button type="button" className="ac-btn danger" onClick={() => controller.cancelAI()}>取消 AI 检查</button>}</div>
    {!allowed && <p className="nr-muted">请先由当前管理员认领此待审作品。</p>}
    <div className="nr-ai-progress" aria-live="polite"><progress aria-label="AI 完整章节覆盖进度" max={ai.totalChapters || 1} value={ai.completedChapters} /><span>已完整覆盖 {ai.completedChapters} / {ai.totalChapters || item.chapters.length} 章 · 已确认 {ai.chunks} 个分块</span>{current && <span>当前章节 {current.title || current.id} · 同章偏移 {ai.offset}</span>}</div>
    {ai.message && <p role={ai.status === 'error' ? 'alert' : 'status'}>{ai.message}</p>}
    {ai.results.length > 0 && <div className="nr-ai-results"><h4>已确认分块结果（未经人工决定）</h4>{ai.results.map((result, index) => <details key={`${result.chapter_id}-${result.offset}-${index}`}><summary>{item.chapters.find(chapter => chapter.id === result.chapter_id)?.title || result.chapter_id} · 偏移 {result.offset} → {result.next_offset ?? '本章末尾'}</summary><pre className="nr-pre">{result.findings || '服务端未返回文字意见（不等于安全结论）'}</pre></details>)}</div>}
  </section>;
}
export function ReviewDetail({ state, controller, adminId }) {
  const item = state.selected, permissions = reviewAvailability(item, adminId);
  const confirm = useConfirm();
  const allBodies = item.chapters.length > 0 && item.chapters.every(chapter => state.bodies[chapter.id]);
  const decide = async action => {
    const ok = await confirm({ title: action === 'approve' ? `人工通过「${item.title}」？` : `人工驳回「${item.title}」？`, message: `审核版本 ${item.version}。本操作提交明确理由并由服务器检查认领与版本，不会使用 AI 自动决定。`, okText: action === 'approve' ? '确认通过' : '确认驳回', danger: action === 'reject' });
    if (ok) await controller.mutate(action);
  };
  return <div className="nr-detail">
    <div className="nr-detail-heading"><div><h2>{item.title}</h2><p>审核 #{item.id} · 版本 {item.version} · 提交于 {fmtFull(item.submitted_at)}</p></div><Status value={item.status} /></div>
    <div className="nr-notice">{permissions.claimedByOther ? `管理员 #${item.claimed_by} 已认领，当前只读。` : item.claimed_by ? `由当前管理员 #${item.claimed_by} 认领。` : '尚未认领；可先查看完整候选内容，作决定前必须认领。'}{item.reason && <p>最近审核理由 {item.reason}</p>}</div>
    <ErrorBox msg={state.error} />{state.notice && <p className="nr-success" role="status">{state.notice}</p>}
    {state.needsReload && <div className="nr-conflict" role="alert"><p>需要重新加载详情，当前不能保存或继续 AI 检查。理由草稿未丢弃。</p><button type="button" className="ac-btn" onClick={() => controller.open(item.id, { preserveReason: true })}>重新加载详情并保留理由</button></div>}
    <NovelMetadata item={item} /><ChangeSummary changes={item.changes} baseReleaseId={item.base_release_id} />
    <section className="nr-section"><div className="nr-section-heading"><h3>完整候选目录与正文 · {item.chapters.length} 章</h3><div className="nr-actions"><button type="button" className="ac-btn" disabled={state.bodyLoading || state.saving || state.needsReload || !item.chapters.length} onClick={() => controller.loadBodies()}>逐章加载全部正文</button>{state.bodyLoading && <button type="button" className="ac-btn" onClick={() => controller.cancelBodies()}>停止正文加载</button>}</div></div>
      <p className="nr-muted" aria-live="polite">已加载 {Object.keys(state.bodies).length} / {item.chapters.length} 章完整正文；不会按字数截断，也不会把目录当作已读全文。</p><ErrorBox msg={state.bodyError} />
      {!item.chapters.length ? <Empty text="候选目录为空，请核对服务器提交内容" /> : <ol className="nr-chapters">{item.chapters.map((chapter, index) => <li key={chapter.id}><div className="nr-chapter-heading"><div><h4>{index + 1}. {chapter.title || '未命名章节'}</h4><p>#{chapter.id} · 排序 {chapter.sort_order} · {chapter.word_count} 字 · Generation {chapter.generation}</p><code className="nr-hash">SHA-256 {chapter.body_sha256}</code><details><summary>完整章节元数据</summary><pre className="nr-pre">{display(chapter)}</pre></details></div><button type="button" className="ac-btn" disabled={state.bodyLoading || state.saving || state.needsReload || Boolean(state.bodies[chapter.id])} onClick={() => controller.loadBodies(chapter.id)}>{state.bodies[chapter.id] ? '全文已加载' : '加载本章全文'}</button></div>
        {state.bodies[chapter.id] && <details open><summary>{chapter.title || '本章'}完整正文（{state.bodies[chapter.id].body.length} 字符）</summary><pre className="nr-body">{state.bodies[chapter.id].body || '（本章正文为空）'}</pre></details>}
      </li>)}</ol>}
    </section>
    <AIReview state={state} controller={controller} allowed={permissions.ai} /><ReviewHistory audit={item.audit} />
    <section className="nr-section nr-decision"><h3>人工审核决定</h3><p>通过与驳回都必须填写理由并携带当前版本；发布只由服务器接受人工审核后生效。作品治理、举报和创作者限制不与徽章/认证资格混用。</p>
      <label className="nr-label" htmlFor="novel-review-reason">审核理由（必填，最多 {NOVEL_REASON_MAX} 字）<textarea id="novel-review-reason" className="ac-textarea" rows={4} value={state.reason} disabled={state.saving} maxLength={NOVEL_REASON_MAX} onChange={event => controller.changeReason(event.target.value)} placeholder="写明通过或驳回的具体依据，不以 AI 意见代替人工判断" /></label>
      <div className="nr-actions">{permissions.claim && <button type="button" className="ac-btn primary" disabled={state.saving || state.needsReload} onClick={() => controller.mutate('claim')}>认领审核</button>}{permissions.release && <button type="button" className="ac-btn" disabled={state.saving || state.needsReload} onClick={() => controller.mutate('release')}>释放审核</button>}{permissions.approve && <button type="button" className="ac-btn primary" disabled={state.saving || state.needsReload || !state.reason.trim() || !allBodies} onClick={() => decide('approve')}>人工通过</button>}{permissions.reject && <button type="button" className="ac-btn danger" disabled={state.saving || state.needsReload || !state.reason.trim()} onClick={() => decide('reject')}>人工驳回</button>}</div>
      {permissions.approve && !allBodies && <p className="nr-muted">通过前请加载并通读所有候选章节全文；当前未完整加载。</p>}{!permissions.claim && !permissions.approve && <p className="nr-muted">当前状态为只读，不能重新发布或绕过人工审核。</p>}{state.saving && <p role="status">正在等待服务器确认，请勿重复提交。</p>}
    </section>
  </div>;
}

export function WorkDetails({ work, onReview }) {
  return <><NovelMetadata item={work} /><section className="nr-section"><h3>作品完整目录 · {work.chapters.length} 章</h3><p className="nr-muted">发布版本 {work.release_id || '无'} · 发布时间 {fmtFull(work.published_at)} · 更新于 {fmtFull(work.updated_at)} · 本地作品 ID {work.client_work_id || '未提供'} · {work.word_count} 字 · 阅读 {work.reads ?? '未提供'} · 收藏 {work.collections ?? '未提供'} · 评论 {work.comments ?? '未提供'}</p><ol className="nr-work-chapters">{work.chapters.map(chapter => <li key={chapter.id}><strong>{chapter.title || '未命名章节'}</strong><span>#{chapter.id} · 排序 {chapter.sort_order} · {chapter.word_count} 字 · Generation {chapter.generation}</span><code className="nr-hash">SHA-256 {chapter.body_sha256}</code></li>)}</ol></section><section className="nr-section"><h3>提交 / 审核版本历史</h3>{work.reviews.length ? work.reviews.map(review => <div className="nr-work-review" key={review.id}><div><strong>{review.title}</strong><p>#{review.id} · 版本 {review.version} · {fmtFull(review.submitted_at)} · {review.chapters.length} 章</p>{review.reason && <p>审核理由 {review.reason}</p>}</div><Status value={review.status} /><button type="button" className="ac-btn" onClick={() => onReview(review)}>打开该候选全文与审核历史</button></div>) : <p>服务器返回的审核历史为空。</p>}</section></>;
}

export function WorkHistoryPager({ state, controller }) {
  const work = state.work;
  return <><ErrorBox msg={state.historyError} /><p className="nr-muted" aria-live="polite">已加载 {work.reviews.length} 个审核版本{work.reviews_next_cursor ? '，还有更多历史未加载。' : '，服务器确认已到历史末页。'}</p>{work.reviews_next_cursor && <button type="button" className="ac-btn" disabled={state.historyLoading} onClick={() => controller.loadMoreHistory()}>{state.historyLoading ? '正在加载历史…' : '加载更多审核历史'}</button>}</>;
}

function GovernanceForm({ target, controller, state, onReview }) {
  const [reason, setReason] = useState('');
  const [creatorId, setCreatorId] = useState('');
  const confirm = useConfirm();
  const labels = target.kind === 'work' ? [['withdraw', '下架作品'], ['restore', '恢复已批准作品']] : target.kind === 'report' ? [['dismiss', '忽略举报'], ['withdraw', target.report.comment_id ? '移除被举报评论' : '下架被举报作品']] : [['suspend', '限制创作者'], ['restore', '恢复创作者']];
  const submit = async action => {
    const id = target.id || creatorId.trim();
    const label = labels.find(entry => entry[0] === action)[1];
    const ok = await confirm({ title: `确认${label}？`, message: `目标 #${id}。理由：${reason.trim()}。此操作须由服务器确认，不能将网络错误显示为成功。`, okText: `确认${label}`, danger: ['withdraw', 'suspend'].includes(action) });
    if (ok && await controller.govern(target.kind, id, action, reason)) setReason('');
  };
  const work = state.work?.id === target.id ? state.work : null;
  return <div className="nr-governance">{target.kind === 'work' && (state.workLoading ? <Loading text="正在加载完整作品目录和审核版本历史…" /> : state.workError ? <><ErrorBox msg={state.workError} /><button type="button" className="ac-btn" onClick={() => controller.openWork(target.id)}>重试作品详情</button></> : work && <><WorkDetails work={work} onReview={onReview} /><WorkHistoryPager state={state} controller={controller} /></>)}{target.kind === 'creator' && <><p>仅影响独立的小说创作者权限，不更改宝宝认证、社区角色或徽章。请输入确切作者账号 ID；不推测未知资格状态。</p><label className="nr-label">创作者账号 ID<input className="ac-input" inputMode="numeric" pattern="[1-9][0-9]*" value={creatorId} onChange={event => setCreatorId(event.target.value)} /></label></>}
    {target.kind === 'report' && <><h3>举报内容</h3><dl className="nr-metadata"><div><dt>举报 ID</dt><dd>{target.report.id}</dd></div><div><dt>作品 ID</dt><dd>{target.report.work_id}</dd></div><div><dt>章节 ID</dt><dd>{target.report.chapter_id || '整部作品'}</dd></div><div><dt>状态</dt><dd>{target.report.status}</dd></div><div><dt>作品标题</dt><dd>{target.report.work_title || '未提供'}</dd></div><div><dt>举报人</dt><dd>{target.report.reporter?.display_name || target.report.reporter?.username || '未提供'} · #{target.report.reporter?.id || '未提供'}</dd></div><div><dt>评论 ID</dt><dd>{target.report.comment_id || '无'}</dd></div><div><dt>举报时间</dt><dd>{fmtFull(target.report.created_at)}</dd></div><div className="nr-wide"><dt>举报理由</dt><dd>{target.report.reason}</dd></div></dl><details><summary>完整举报记录</summary><pre className="nr-pre">{display(target.report)}</pre></details></>}
    <label className="nr-label">操作理由（必填，最多 {NOVEL_REASON_MAX} 字）<textarea className="ac-textarea" rows={4} maxLength={NOVEL_REASON_MAX} value={reason} disabled={state.saving} onChange={event => setReason(event.target.value)} /></label><ErrorBox msg={state.error} />{state.notice && <p className="nr-success" role="status">{state.notice}</p>}
    <div className="nr-actions">{labels.map(([action, label]) => <button key={action} type="button" className={`ac-btn ${['withdraw', 'suspend'].includes(action) ? 'danger' : ''}`} disabled={state.saving || !reason.trim() || (target.kind === 'creator' && !/^[1-9]\d*$/.test(creatorId.trim())) || (target.kind === 'work' && (!work || state.workLoading || Boolean(state.workError) || Boolean(state.notice) || (action === 'restore' && (!work.release_id || work.status !== 'withdrawn')) || (action === 'withdraw' && work.status !== 'published'))) || (target.kind === 'report' && (target.report.status !== 'pending' || Boolean(state.notice)))} onClick={() => submit(action)}>{label}</button>)}</div>
    {target.kind === 'work' && <p className="nr-muted">仅已批准、有发布版本的下架作品可恢复。草稿、待审、驳回作品不能直接发布。</p>}
  </div>;
}

export default function NovelReviewConsole() {
  const { user, accounts } = useAuth();
  const token = accounts?.find(account => String(account.id) === String(user?.id))?.token || '';
  const sessionKey = adminSessionKey(user, token);
  const session = useRef(sessionKey); session.current = sessionKey;
  const controller = useRef(null);
  const [snapshot, setSnapshot] = useState({ key: '', state: initialReviewState() });
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [target, setTarget] = useState(null);
  const [cursors, setCursors] = useState([]);
  useEffect(() => {
    const current = createNovelReviewController(adminAPI.novelReview, { adminId: user?.id, getSession: () => session.current, onChange: state => setSnapshot({ key: sessionKey, state }) });
    controller.current = current;
    setSelectedId(null); setTarget(null); setQuery(''); setCursors([]);
    const block = () => { current.block(); setSelectedId(null); setTarget(null); setQuery(''); };
    const storage = event => { if (!event.key || ['abdl_accounts', 'abdl_active_account', 'abdl_currentUser'].includes(event.key)) block(); };
    const rejected = event => { if (event.detail?.sessionKey === sessionKey) block(); };
    window.addEventListener('auth-session-changing', block);
    window.addEventListener('storage', storage);
    window.addEventListener('pagehide', block);
    window.addEventListener('admin-session-rejected', rejected);
    if (user?.role === 'admin') void current.loadList();
    return () => { current.dispose(); if (controller.current === current) controller.current = null; window.removeEventListener('auth-session-changing', block); window.removeEventListener('storage', storage); window.removeEventListener('pagehide', block); window.removeEventListener('admin-session-rejected', rejected); };
  }, [sessionKey, user?.id, user?.role]);
  const state = snapshot.key === sessionKey ? snapshot.state : initialReviewState();
  const close = () => { controller.current?.close(); setSelectedId(null); setTarget(null); };
  const load = (patch = {}) => { setCursors([]); return controller.current?.loadList({ mode: state.mode, ...state.filter, cursor: null, ...patch }); };
  const open = item => { setTarget(null); setSelectedId(item.id); void controller.current?.open(item.id); };
  const govern = value => { controller.current?.close(); setSelectedId(null); setTarget(value); if (value.kind === 'work') void controller.current?.openWork(value.id); };
  if (state.blocked) return <Card title="小说审核会话已停止"><ErrorBox msg={state.error} /><p>请确认当前管理员账号后重新进入此页面。</p></Card>;
  return <div className="nr-console ac-page-stack"><div className="nr-local-note">小说重构审核域 · 人工决定 · 当前筛选计数仅来自真实服务器返回，不推算待审总量。</div><Tabs items={MODES} value={state.mode} onChange={mode => { close(); setQuery(''); load({ mode, status: mode === 'reviews' ? 'pending' : '', query: '' }); }} label="小说管理分类" />
    {state.mode === 'creators' ? <Card title="独立创作者权限治理" description="限制或恢复均需要确切账号与操作理由，服务器再次校验权限。"><GovernanceForm key={sessionKey} target={{ kind: 'creator' }} controller={controller.current} state={state} /></Card> : <Card title={MODES.find(mode => mode.value === state.mode)?.label} icon={state.mode === 'reports' ? 'fa-flag' : 'fa-book-open'}>
      <form className="nr-toolbar" onSubmit={event => { event.preventDefault(); load({ query: query.trim() }); }}>
        {state.mode !== 'reports' && <label className="nr-search">搜索标题 / 作者 / 标签<input className="ac-input" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder="输入关键词后搜索" /></label>}
        {state.mode !== 'reports' && <label>状态<select className="ac-select" aria-label="小说状态筛选" value={state.filter.status} onChange={event => load({ status: event.target.value })}>{(state.mode === 'reviews' ? REVIEW_STATUSES : ['', 'published', 'withdrawn', 'pending', 'rejected', 'draft']).map(status => <option key={status} value={status}>{status ? statusMeta(status)[0] : '全部作品状态'}</option>)}</select></label>}
        {state.mode !== 'reports' && <button type="submit" className="ac-btn primary" disabled={state.loading}>搜索</button>}<button type="button" className="ac-btn" disabled={state.loading} onClick={() => load()}>刷新服务器列表</button>
      </form><ErrorBox msg={state.listError} />{state.notice && !selectedId && !target && <p className="nr-success" role="status">{state.notice}</p>}
      {state.loading ? <Loading text="正在加载小说管理数据…" /> : state.page && <><p className="nr-muted" aria-live="polite">{state.mode === 'reports' ? '服务器本次返回' : '当前页'} {state.page.items.length} 条{state.mode === 'reports' ? ' · 仅展示接口提供的举报记录' : state.page.next_cursor ? ' · 还有下一页' : ' · 已到末页'}</p>{state.page.items.length ? <ul className="nr-records">{state.page.items.map(item => <li key={item.id}><div className="nr-record-copy"><strong>{item.title || item.work_title || `作品举报 #${item.id}`}</strong><p>{item.author ? `${item.author.display_name || item.author.username} · @${item.author.username}` : `作品 #${item.work_id} · ${item.reason}`}</p><small>#{item.id}{state.mode === 'reviews' ? ` · 审核版本 ${item.version} · ${fmtFull(item.submitted_at)} · ${item.claimed_by ? `认领 #${item.claimed_by}` : '未认领'}` : state.mode === 'works' ? ` · ${item.chapter_count} 章 · ${item.word_count} 字 · 发布版本 ${item.release_id || '无'}` : ` · ${fmtFull(item.created_at)}`}</small></div><div className="nr-record-actions"><Status value={item.status} /><button type="button" className="ac-btn" onClick={() => state.mode === 'reviews' ? open(item) : govern(state.mode === 'works' ? { kind: 'work', id: item.id, item } : { kind: 'report', id: item.id, report: item })}>{state.mode === 'reviews' ? '详情审核' : state.mode === 'works' ? '详情与治理' : '处理举报'}</button></div></li>)}</ul> : <Empty text={state.mode === 'reports' ? '服务器返回的小说举报列表为空' : '服务器没有返回符合当前筛选的记录'} />}
      <nav className="nr-pagination" aria-label="小说列表游标分页"><button type="button" className="ac-btn" disabled={!cursors.length || state.loading} onClick={() => { const previous = cursors.at(-1); setCursors(values => values.slice(0, -1)); controller.current?.loadList({ mode: state.mode, ...state.filter, cursor: previous }); }}>上一页</button><span>第 {cursors.length + 1} 页</span><button type="button" className="ac-btn" disabled={!state.page.next_cursor || state.loading} onClick={() => { setCursors(values => [...values, state.filter.cursor]); controller.current?.loadList({ mode: state.mode, ...state.filter, cursor: state.page.next_cursor }); }}>下一页</button></nav></>}
    </Card>}
    <Modal open={Boolean(selectedId) && snapshot.key === sessionKey} onClose={close} title="小说完整候选审核" width={1180} className="nr-review-modal">{state.detailLoading ? <Loading text="正在加载完整候选元数据和目录…" /> : state.detailError ? <><ErrorBox msg={state.detailError} /><button type="button" className="ac-btn" onClick={() => controller.current?.open(selectedId, { preserveReason: true })}>重试加载详情</button></> : state.selected && <ReviewDetail state={state} controller={controller.current} adminId={user?.id} />}</Modal>
    <Modal open={Boolean(target) && snapshot.key === sessionKey} onClose={close} title={target?.kind === 'work' ? '小说作品详情与治理' : '小说举报处理'} width={900} className="nr-review-modal">{target && <GovernanceForm key={`${target.kind}-${target.id}`} target={target} controller={controller.current} state={state} onReview={open} />}</Modal>
  </div>;
}
