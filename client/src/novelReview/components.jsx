import { useEffect, useRef, useState } from 'react';
import { adminAPI } from '../api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { adminSessionKey } from '../pages/admin/access.js';
import { Card, Empty, ErrorBox, FormField, Loading, Modal, Pill, Tabs, useConfirm } from '../pages/admin/ui.jsx';
import { fmtFull } from '../pages/admin/util.js';
import { AUTO_REVIEW_FILTERS, NOVEL_AI_LIMITS, autoReviewMeta, changedChapterIds, createNovelReviewController, initialReviewState, NOVEL_REASON_MAX, REVIEW_STATUSES, reviewAvailability, statusMeta } from './model.js';
import './review.css';

const MODES = [{ value: 'reviews', label: '作品审核', icon: 'fa-book-open' }, { value: 'works', label: '作品治理', icon: 'fa-book' }, { value: 'reports', label: '小说举报', icon: 'fa-flag' }, { value: 'creators', label: '创作者限制', icon: 'fa-user-shield' }];
const LIST_TITLES = { reviews: '候选审核队列', works: '作品目录与发布状态', reports: '待核对的举报记录' };
const FIELD_NAMES = { title: '标题', description: '简介', work_type: '作品类型', cover_url: '封面', tags: '标签', statements: '声明', source: '来源', authorization: '授权说明', completed: '完结状态' };
const TYPE_NAMES = { original: '原创', repost: '转载', ai: 'AI 创作' };
const DETAIL_SECTIONS = [['decision', '人工决定'], ['metadata', '作品资料'], ['changes', '版本差异'], ['bodies', '冻结正文'], ['automatic', '自动审核'], ['manual-ai', '手动 AI'], ['history', '历史与理由']];
function Status({ value }) { const [label, tone] = statusMeta(value); return <Pill tone={tone}>{label}</Pill>; }
const display = value => value == null ? '未提供' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
const recordTitle = item => item.title || item.work_title || `作品举报 #${item.id}`;
const autoFilterLabel = value => value === 'all' ? '全部自动审核状态' : value === 'needs_human' ? '需人工处理（含旧记录 / 已取消）' : autoReviewMeta(value)[0];
function safeImage(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; } }
function focusSection(event, name) {
  const section = event.currentTarget.closest('.nr-detail')?.querySelector(`[data-nr-section="${name}"]`);
  section?.focus();
  section?.scrollIntoView({ block: 'start' });
}

export function NovelTabs({ value, onChange }) {
  const navigate = event => {
    if (event.defaultPrevented || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next]?.focus();
    tabs[next]?.click();
  };
  return <div className="nr-mode-tabs" onKeyDown={navigate}><Tabs items={MODES} value={value} onChange={onChange} label="小说管理分类" /></div>;
}

export function ActionFeedback({ busy, error, notice, needsReload, onReload, reloadText = '重新加载详情并保留理由', busyText = '正在等待服务器确认，请勿重复提交；离开页面不保证撤销在途操作。' }) {
  return <div className="nr-action-feedback" aria-busy={Boolean(busy)}>
    {busy && <p className="nr-notice" role="status">{busyText}</p>}
    <ErrorBox msg={error} />
    {error && !busy && <p className="nr-muted">本次操作未记录为成功；服务器结果可能未确认，不会自动重放操作。</p>}
    {needsReload && <div className="nr-conflict" role="alert"><p>版本 / 状态变化或响应未确认，需要重新加载详情，当前不能保存或继续 AI 检查。理由草稿未丢弃。</p></div>}
    {onReload && (needsReload || error) && <button type="button" className="ac-btn" disabled={busy} onClick={onReload}>{reloadText}</button>}
    {notice && !busy && <p className="nr-success" role="status">{notice}</p>}
  </div>;
}

export function NovelMetadata({ item }) {
  const image = safeImage(item.cover_url);
  return <section className="nr-section" data-nr-section="metadata" tabIndex={-1} aria-label="完整作品与作者信息"><h3>完整作品与作者信息</h3><div className="nr-metadata-layout">
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
  return <section className="nr-section" data-nr-section="changes" tabIndex={-1} aria-label="版本差异"><h3>相对已发布版本的差异</h3><p className="nr-muted">基准发布版本 {baseReleaseId || '无（首次提交）'}。以下差异由服务器给出；正文始终读取完整候选快照。未提供前后正文时，只能查看变更类型，不能据此生成逐字对比。</p>
    {!changes ? <p className="nr-notice" role="status">服务端未返回差异数据，不能据此推断「无变更」。</p> : <>
      <h4>元数据变化</h4>{Array.isArray(changes.metadata) ? changes.metadata.length ? <ul className="nr-field-changes">{changes.metadata.map((field, index) => <li key={index}>{typeof field === 'string' ? FIELD_NAMES[field] || field : display(field)}</li>)}</ul> : <p>元数据未变化</p> : <pre className="nr-pre">{display(changes.metadata)}</pre>}
      <h4>章节变化</h4>{Array.isArray(changes.chapters) ? changes.chapters.length ? <ul className="nr-change-list">{changes.chapters.map((chapter, index) => <li key={`${chapter.id}-${index}`}><strong>{kinds[chapter.kind] || chapter.kind || '变更'}</strong><span>{chapter.title || chapter.id}</span><code>{chapter.id}</code>{chapter.before != null && <pre className="nr-pre">变更前 {display(chapter.before)}</pre>}{chapter.after != null && <pre className="nr-pre">变更后 {display(chapter.after)}</pre>}</li>)}</ul> : <p>无章节变化</p> : <pre className="nr-pre">{display(changes.chapters)}</pre>}
      {Object.keys(changes).filter(key => !['metadata', 'chapters'].includes(key)).map(key => <div key={key}><h4>{FIELD_NAMES[key] || key}</h4><pre className="nr-pre">{display(changes[key])}</pre></div>)}
    </>}
  </section>;
}

export function ReviewHistory({ audit }) {
  const labels = { submit: '提交', claim: '认领', release: '释放', approve: '通过', reject: '驳回', human_approve: '人工通过', human_reject: '人工驳回', auto_approve: '自动审核通过', auto_pass: '自动审核通过', auto_passed: '自动审核通过', auto_queued: '自动审核排队', auto_running: '自动审核开始', auto_needs_human: '自动审核转人工', auto_cancel: '自动审核取消', auto_cancelled: '自动审核取消', ai_assistance: 'AI 辅助检查', ai: 'AI 辅助检查', admin_withdraw: '管理员下架', admin_restore: '管理员恢复', withdraw: '下架', restore: '恢复', suspend: '限制创作者' };
  return <section className="nr-section" data-nr-section="history" tabIndex={-1} aria-label="审核历史与操作理由"><h3>审核历史与操作理由</h3>{audit == null ? <p className="nr-notice">服务端未返回审核历史，不能推断没有操作。</p> : !audit.length ? <p>服务器返回的历史记录为空。</p> : <ol className="nr-history">{audit.map((entry, index) => <li key={entry.id || index}><div><strong>{labels[entry.action] || entry.action || '操作'}</strong><span>{entry.actor_name || entry.actor_id || '系统'} · {fmtFull(entry.created_at)}</span></div><p>{entry.reason || '未附理由'}</p><details><summary>查看完整审计字段</summary><pre className="nr-pre">{display(entry)}</pre></details></li>)}</ol>}</section>;
}

export function AutoReviewSummary({ value, compact = false }) {
  const [label, tone] = autoReviewMeta(value?.status);
  if (!value) return compact ? <p className="nr-muted">无自动审核记录（旧记录可能未启用自动审核）。</p> : <section className="nr-section nr-auto" data-nr-section="automatic" tabIndex={-1} aria-label="自动审核服务器结果"><h3>AI 自动审核 · 服务器结果</h3><p className="nr-muted">无自动审核记录（旧记录可能未启用自动审核）。不据此推断作品安全。</p></section>;
  const content = <><Pill tone={tone}>{label}</Pill><p className="nr-muted">已完成 {value.completed_chunks} / {value.total_chunks} 个自动审核分块 · 策略版本 {value.policy_version} · {fmtFull(value.updated_at)}</p>
    {value.reason && <p className="nr-auto-reason">自动审核原因 {value.reason}</p>}{value.failure_code && <p>失败代码 <code>{value.failure_code}</code></p>}
    {!compact && <><progress aria-label="服务器自动审核分块进度" max={value.total_chunks || 1} value={value.completed_chunks} />{!value.total_chunks && <p className="nr-muted">服务器尚未给出可完成的分块总数。</p>}{value.findings.length ? <ul className="nr-auto-findings">{value.findings.map((finding, index) => <li key={index}><strong>{finding.chapter_id ? `章节 #${finding.chapter_id}` : '作品 / 元数据'}{finding.field ? ` · ${FIELD_NAMES[finding.field] || finding.field}` : ''}</strong><p>{finding.reason}</p>{finding.evidence !== null && <pre className="nr-pre">{finding.evidence || '未附文字依据'}</pre>}</li>)}</ul> : <p className="nr-muted">服务端未返回具体意见；不据此推断作品安全。</p>}<p className="nr-muted">启用时先由服务器自动审核；待审 / 审核中的记录，任何管理员均可人工通过或驳回覆盖自动流程。自动审核失败不会锁定人工操作；并发结果以服务器版本检查为准。这里仅展示服务器快照，不轮询或主动触发 AI。</p></>}
  </>;
  return compact ? <div className="nr-auto-compact">{content}</div> : <section className="nr-section nr-auto" data-nr-section="automatic" tabIndex={-1} aria-label="自动审核服务器结果"><h3>AI 自动审核 · 服务器结果</h3>{content}</section>;
}

export function NovelAIPolicy({ state, controller }) {
  const policy = state.policy, disabled = !policy.saved || policy.loading || policy.saving || policy.needsReload;
  const dirty = Boolean(policy.saved && (policy.saved.enabled !== policy.draft.enabled || Object.keys(NOVEL_AI_LIMITS).some(field => String(policy.saved[field]) !== policy.draft[field])));
  const reload = async () => {
    if (!dirty || window.confirm('重新加载会替换未保存的自动审核策略草稿，是否继续？')) await controller.loadPolicy();
  };
  return <Card className="nr-policy-card"><details className="nr-policy-settings"><summary><span><strong>小说 AI 自动审核策略</strong><small>低频设置 · 展开后配置；不会发送 AI 请求</small></span><Pill tone={policy.error || policy.needsReload ? 'amber' : policy.saved?.enabled ? 'blue' : 'slate'}>{policy.loading ? '正在读取' : policy.saving ? '正在保存' : policy.error ? '需处理错误' : dirty ? '有未保存修改' : !policy.saved ? '尚未确认' : policy.needsReload ? '需重新加载' : policy.saved.enabled ? '服务器已开启' : '服务器已关闭'}</Pill></summary>
    <p className="nr-muted">仅控制服务器自动审核，不禁用手动辅助检查。这里配置最大调用次数，不是 token 预算；不管理密钥，也不发送供应商测试请求。</p>
    {policy.loading && <p role="status">正在加载服务器策略…</p>}{!policy.saved && !policy.loading && <p className="nr-muted">尚未读取已保存策略；不会使用客户端默认值替代。</p>}
    <form className="nr-policy-form" aria-label="自动审核策略配置" aria-busy={policy.saving || policy.loading} onSubmit={event => { event.preventDefault(); void controller.savePolicy(); }}>
      <label className="nr-policy-enabled"><input type="checkbox" checked={policy.draft.enabled} disabled={disabled} onChange={event => controller.changePolicy({ enabled: event.target.checked })} />启用自动审核</label>
      <FormField label="每日最大调用次数（1–10000）" htmlFor="nr-policy-daily" required><input id="nr-policy-daily" className="ac-input" type="number" min={1} max={NOVEL_AI_LIMITS.daily_call_limit} step={1} required value={policy.draft.daily_call_limit} disabled={disabled} onChange={event => controller.changePolicy({ daily_call_limit: event.target.value })} /></FormField>
      <FormField label="单任务最大调用次数（1–2048）" htmlFor="nr-policy-job" required><input id="nr-policy-job" className="ac-input" type="number" min={1} max={NOVEL_AI_LIMITS.job_call_limit} step={1} required value={policy.draft.job_call_limit} disabled={disabled} onChange={event => controller.changePolicy({ job_call_limit: event.target.value })} /></FormField>
      <div className="nr-actions"><button type="submit" className="ac-btn primary" disabled={disabled || !dirty}>{policy.saving ? '正在保存…' : '保存自动审核策略'}</button><button type="button" className="ac-btn" disabled={policy.loading || policy.saving} onClick={reload}>{policy.saved ? '重新加载策略' : '加载 / 重试策略'}</button></div>
    </form>
    {policy.saved && <p className="nr-muted">服务器已保存：{policy.saved.enabled ? '自动审核已开启' : '自动审核已关闭'} · 每日最多 {policy.saved.daily_call_limit} 次 · 单任务最多 {policy.saved.job_call_limit} 次 · 版本 {policy.saved.revision}{policy.needsReload ? '（需重新加载确认最新版本）' : ''}</p>}
    <p className="nr-muted" role="status">{dirty ? '草稿有未保存修改；尚未生效。' : policy.saved ? '表单与最近读取的服务器策略一致。' : '等待服务器策略，不使用本地默认额度。'}</p>
    {policy.needsReload && policy.saved && <p className="nr-conflict">重新加载确认最新策略后才可再次保存；草稿不会自动覆盖其他管理员的修改。</p>}
  </details><ActionFeedback busy={policy.saving || policy.loading} busyText={policy.loading ? '正在加载服务器策略…' : '正在保存策略，等待服务器确认；请勿重复提交。'} error={policy.error} notice={policy.notice} onReload={policy.error ? reload : undefined} reloadText={policy.saved ? '重新加载策略并核对版本' : '重试读取服务器策略'} /></Card>;
}

export function AIReview({ state, controller, allowed }) {
  const ai = state.ai, item = state.selected, selection = state.selectedChapterIds;
  const current = item.chapters.find(chapter => chapter.id === ai.chapter_id), changed = new Set(changedChapterIds(item));
  const disabled = !allowed || state.saving || state.needsReload;
  return <section className="nr-section nr-ai" data-nr-section="manual-ai" tabIndex={-1} aria-label="手动 AI 选章与进度"><h3>手动 AI 检查 · 仅作辅助</h3><p>自动审核之外，可直接选择章节手动辅助检查，无需认领或预先加载正文。默认仅选择服务端差异中的新增 / 修改章节；只检查所选章节，不会自动通过、驳回或改变自动审核结果。</p>
    {!item.changes && <p className="nr-muted">服务端未提供版本差异，未默认选择任何章节；可手动选择或全选。</p>}
    <fieldset className="nr-ai-selection" disabled={disabled}><legend>选择手动检查章节（已选 {selection.length} / {item.chapters.length} 章）</legend><div className="nr-actions"><button type="button" className="ac-btn" onClick={() => controller.selectChangedAIChapters()}>选择变更章节</button><button type="button" className="ac-btn" onClick={() => controller.selectAIChapters(item.chapters.map(chapter => chapter.id))}>全选章节</button><button type="button" className="ac-btn" onClick={() => controller.selectAIChapters([])}>清空选择</button></div>
      {!item.chapters.length ? <p>本候选没有可选章节，未发送 AI 请求。</p> : <ul>{item.chapters.map(chapter => <li key={chapter.id}><label><input type="checkbox" checked={selection.includes(chapter.id)} onChange={event => controller.selectAIChapters(event.target.checked ? [...selection, chapter.id] : selection.filter(id => id !== chapter.id))} /><span>{chapter.title || chapter.id}{changed.has(chapter.id) ? '（新增 / 修改）' : ''}<small>#{chapter.id} · {chapter.word_count} 字 · Generation {chapter.generation}</small></span></label></li>)}</ul>}
    </fieldset>
    <p className="nr-muted">改选会取消后续请求并清空旧进度；仅同一审核版本、所选章节与内容校验值可续跑。已发送的调用不保证撤回。只有点击开始 / 继续检查才会请求服务端 AI。</p>
    <div className="nr-actions"><button type="button" className="ac-btn" disabled={disabled || !selection.length || ai.status === 'running'} onClick={() => controller.startAI()}>{ai.status === 'running' ? '正在检查所选章节…' : ['error', 'cancelled'].includes(ai.status) ? '继续所选章节 AI 检查' : ai.status === 'complete' ? '重新检查所选章节' : '开始所选章节 AI 辅助检查'}</button>{ai.status === 'running' && <button type="button" className="ac-btn danger" onClick={() => controller.cancelAI()}>取消 AI 检查</button>}</div>
    {!allowed && <p className="nr-muted">仅待审 / 审核中的候选可手动检查；不受认领人限制。</p>}
    {!selection.length && <p className="nr-muted">尚未选择章节，不会发送 AI 请求。</p>}
    <div className="nr-ai-progress" aria-live="polite" aria-atomic="true"><progress aria-label="手动 AI 所选章节完成进度" max={ai.totalChapters || selection.length || 1} value={ai.completedChapters} /><span>本次所选章节已完成 {ai.completedChapters} / {ai.totalChapters || selection.length} 章 · 已确认 {ai.chunks} 个分块；不代表未选章节已检查。</span>{current && <span>当前章节 {current.title || current.id} · 同章偏移 {ai.offset}</span>}</div>
    {ai.message && <p className={ai.status === 'error' ? 'nr-conflict' : 'nr-notice'} role={ai.status === 'error' ? 'alert' : 'status'}>{ai.message}</p>}
    {ai.results.length > 0 && <div className="nr-ai-results"><h4>所选章节已确认分块结果（辅助意见，不是审核决定）</h4>{ai.results.map((result, index) => <details key={`${result.chapter_id}-${result.offset}-${index}`}><summary>{item.chapters.find(chapter => chapter.id === result.chapter_id)?.title || result.chapter_id} · 偏移 {result.offset} → {result.next_offset ?? '本章末尾'}</summary><pre className="nr-pre">{result.findings || '服务端未返回文字意见（不等于安全结论）'}</pre><code className="nr-hash">章节 #{result.chapter_id} · SHA-256 {result.body_sha256}</code></details>)}</div>}
  </section>;
}

export function ReviewBodies({ state, controller }) {
  const item = state.selected, loaded = item.chapters.filter(chapter => Boolean(state.bodies[chapter.id])).length;
  const disabled = state.bodyLoading || state.saving || state.needsReload;
  return <section className="nr-section" data-nr-section="bodies" tabIndex={-1} aria-label="冻结候选目录与完整正文"><div className="nr-section-heading"><h3>完整候选目录与正文 · {item.chapters.length} 章</h3><div className="nr-actions"><button type="button" className="ac-btn" disabled={disabled || !item.chapters.length || loaded === item.chapters.length} onClick={() => controller.loadBodies()}>逐章加载全部正文</button>{state.bodyLoading && <button type="button" className="ac-btn" onClick={() => controller.cancelBodies()}>停止正文加载</button>}</div></div>
    <p className="nr-notice">冻结候选快照：审核 #{item.id} · 版本 {item.version}。逐章校验 Generation 与 SHA-256，不读取作者后续编辑，不以目录或字数视为已读全文。</p>
    <div className="nr-body-progress" aria-live="polite"><progress aria-label="完整候选正文加载进度" max={item.chapters.length || 1} value={loaded} /><span>已加载 {loaded} / {item.chapters.length} 章完整正文；不会按字数截断，也不会把目录当作已读全文。{state.bodyLoading ? '正在逐章读取…' : loaded < item.chapters.length ? '未加载的章节仍需主动读取。' : '目录中的正文均已读取；不等于人工已经审阅。'}</span></div>
    <ErrorBox msg={state.bodyError} />{state.bodyError && <button type="button" className="ac-btn" disabled={disabled || !item.chapters.length} onClick={() => controller.loadBodies()}>重试加载未完成正文</button>}
    {!item.chapters.length ? <Empty text="候选目录为空，请核对服务器提交内容" /> : <ol className="nr-chapters">{item.chapters.map((chapter, index) => <li key={chapter.id}><div className="nr-chapter-heading"><div><h4>{index + 1}. {chapter.title || '未命名章节'}</h4><p>#{chapter.id} · 排序 {chapter.sort_order} · {chapter.word_count} 字 · Generation {chapter.generation}</p><code className="nr-hash">SHA-256 {chapter.body_sha256}</code><details><summary>完整章节元数据</summary><pre className="nr-pre">{display(chapter)}</pre></details></div><button type="button" className="ac-btn" aria-label={`${state.bodies[chapter.id] ? '全文已加载' : '加载本章全文'}：${chapter.title || chapter.id}`} disabled={disabled || Boolean(state.bodies[chapter.id])} onClick={() => controller.loadBodies(chapter.id)}>{state.bodies[chapter.id] ? '全文已加载' : '加载本章全文'}</button></div>
      {state.bodies[chapter.id] ? <details open><summary>{chapter.title || '本章'}完整正文（{state.bodies[chapter.id].body.length} 字符）</summary><pre className="nr-body">{state.bodies[chapter.id].body || '（本章正文为空）'}</pre></details> : <p className="nr-muted">正文尚未加载；目录不是正文预览。</p>}
    </li>)}</ol>}
  </section>;
}

export function ReviewDetail({ state, controller, adminId }) {
  const item = state.selected, permissions = reviewAvailability(item, adminId);
  const confirm = useConfirm();
  const decide = async action => {
    const ok = await confirm({ title: action === 'approve' ? `人工通过「${item.title}」？` : `人工驳回「${item.title}」？`, message: `作品 #${item.work_id} · 审核 #${item.id} · 版本 ${item.version}。人工决定可覆盖自动审核流程；无需认领、加载正文或填写理由。服务器会检查当前状态与版本，并发更新时须刷新。${state.reason.trim() ? `本次理由：${state.reason.trim()}` : '本次未填写理由。'}`, okText: action === 'approve' ? '确认通过' : '确认驳回', danger: action === 'reject' });
    const latest = controller.getState();
    if (ok && latest.selected?.id === item.id && latest.selected.version === item.version && !latest.saving && !latest.needsReload) await controller.mutate(action);
  };
  const reload = async () => {
    if ((!state.bodyLoading && state.ai.status !== 'running') || window.confirm('重新加载会停止后续正文 / AI 请求并清空当前快照进度；理由草稿保留。已发送的调用不保证撤回，是否继续？')) await controller.open(item.id, { preserveReason: true });
  };
  return <div className="nr-detail">
    <header className="nr-detail-heading"><div><p className="nr-eyebrow">当前审核目标 · 冻结候选快照</p><h2 tabIndex={-1} data-nr-detail-focus>{item.title}</h2><p>作品 #{item.work_id} · 审核 #{item.id} · 版本 {item.version} · 提交于 {fmtFull(item.submitted_at)}</p></div><div className="nr-detail-status"><Status value={item.status} />{state.needsReload && <Pill tone="amber">需核对最新版本</Pill>}<button type="button" className="ac-btn" disabled={state.saving || state.detailLoading} onClick={reload}>刷新当前详情（保留理由）</button></div></header>
    <div className="nr-notice">{!permissions.approve ? '此候选已不在待审 / 审核中；认领信息仅作历史协作记录。' : permissions.claimedByOther ? `管理员 #${item.claimed_by} 已认领；仅作协作提示，你仍可决定、手动检查或接手。` : item.claimed_by ? `由当前管理员 #${item.claimed_by} 认领；认领不限制其他管理员操作。` : '尚未认领；认领仅用于协作，可直接作人工决定或手动检查。'}{item.reason && <p className="nr-reason">最近审核理由 {item.reason}</p>}</div>
    <nav className="nr-detail-nav" aria-label="候选详情章节导航">{DETAIL_SECTIONS.map(([name, label]) => <button key={name} type="button" className="ac-btn" onClick={event => focusSection(event, name)}>{label}</button>)}</nav>
    <ReviewDecision state={state} controller={controller} adminId={adminId} onDecide={decide} />
    <div className="nr-detail-columns"><div className="nr-detail-content"><NovelMetadata item={item} /><ChangeSummary changes={item.changes} baseReleaseId={item.base_release_id} /><ReviewBodies state={state} controller={controller} /><ReviewHistory audit={item.audit} /></div><aside className="nr-detail-assistance" aria-label="服务器自动审核与手动辅助检查"><AutoReviewSummary value={item.auto_review} /><AIReview state={state} controller={controller} allowed={permissions.ai} /></aside></div>
  </div>;
}

export function ReviewDecision({ state, controller, adminId, onDecide }) {
  const permissions = reviewAvailability(state.selected, adminId), disabled = state.saving || state.needsReload;
  return <section className="nr-section nr-decision" data-nr-section="decision" tabIndex={-1} aria-label="人工审核决定"><h3>人工审核决定 · 可覆盖自动流程</h3><p>待审 / 审核中均可由任何管理员直接通过或驳回，包括他人已认领的记录。无需先认领或加载正文，审核理由可不填；服务器仍检查当前版本与权限。作品治理、举报和创作者限制的必填理由不变。</p>
    <FormField className="nr-reason-field" label={`审核理由（选填，最多 ${NOVEL_REASON_MAX} 字）`} htmlFor="novel-review-reason"><textarea id="novel-review-reason" className="ac-textarea" rows={3} aria-describedby="nr-review-reason-help" value={state.reason} disabled={state.saving} maxLength={NOVEL_REASON_MAX} onChange={event => controller.changeReason(event.target.value)} placeholder="可补充人工通过或驳回的依据，也可留空" /><p id="nr-review-reason-help" className="nr-field-help">{state.reason.length} / {NOVEL_REASON_MAX} 字 · 留空不阻止人工决定；草稿仅保存在当前会话。</p></FormField>
    <div className="nr-actions nr-decision-actions">{permissions.approve && <button type="button" className="ac-btn primary" disabled={disabled} onClick={() => onDecide('approve')}>人工通过</button>}{permissions.reject && <button type="button" className="ac-btn danger" disabled={disabled} onClick={() => onDecide('reject')}>人工驳回</button>}{permissions.claim && <button type="button" className="ac-btn" disabled={disabled} onClick={() => controller.mutate('claim')}>{permissions.claimedByOther ? '接手认领（可选）' : '认领协作（可选）'}</button>}{permissions.release && <button type="button" className="ac-btn" disabled={disabled} onClick={() => controller.mutate('release')}>释放我的认领</button>}</div>
    {!permissions.approve && <p className="nr-muted">此候选已不在待审 / 审核中，不能重复决定；请查看最新服务器状态。</p>}
    <ActionFeedback busy={state.saving} error={state.error} notice={state.notice} needsReload={state.needsReload} onReload={() => controller.open(state.selected.id, { preserveReason: true })} />
  </section>;
}

export function WorkDetails({ work, onReview, busy = false }) {
  return <><NovelMetadata item={work} /><section className="nr-section"><h3>作品完整目录 · {work.chapters.length} 章</h3><p className="nr-muted">发布版本 {work.release_id || '无'} · 发布时间 {fmtFull(work.published_at)} · 更新于 {fmtFull(work.updated_at)} · 本地作品 ID {work.client_work_id || '未提供'} · {work.word_count} 字 · 阅读 {work.reads ?? '未提供'} · 收藏 {work.collections ?? '未提供'} · 评论 {work.comments ?? '未提供'}</p>{!work.chapters.length ? <Empty text="服务器返回的作品目录为空" /> : <ol className="nr-work-chapters">{work.chapters.map(chapter => <li key={chapter.id}><strong>{chapter.title || '未命名章节'}</strong><span>#{chapter.id} · 排序 {chapter.sort_order} · {chapter.word_count} 字 · Generation {chapter.generation}</span><code className="nr-hash">SHA-256 {chapter.body_sha256}</code></li>)}</ol>}<p className="nr-muted">此处只展示作品目录。查看冻结正文请打开下方对应审核候选，不把目录当作全文。</p></section><section className="nr-section"><h3>提交 / 审核版本历史</h3>{work.reviews.length ? work.reviews.map(review => <div className="nr-work-review" key={review.id}><div><strong>{review.title}</strong><p>#{review.id} · 版本 {review.version} · {fmtFull(review.submitted_at)} · {review.chapters.length} 章</p><p className="nr-reason">审核理由 {review.reason || '未附理由'}</p></div><Status value={review.status} /><button type="button" className="ac-btn" disabled={busy} aria-label={`打开该候选全文与审核历史：${review.title}，审核 #${review.id}`} onClick={() => onReview(review)}>打开该候选全文与审核历史</button></div>) : <p>服务器返回的审核历史为空。</p>}</section></>;
}

export function WorkHistoryPager({ state, controller }) {
  const work = state.work;
  return <><ErrorBox msg={state.historyError} /><p className="nr-muted" aria-live="polite">已加载 {work.reviews.length} 个审核版本{work.reviews_next_cursor ? '，还有更多历史未加载。' : '，服务器确认已到历史末页。'}</p>{work.reviews_next_cursor && <button type="button" className="ac-btn" disabled={state.historyLoading || state.saving} onClick={() => controller.loadMoreHistory()}>{state.historyLoading ? '正在加载历史…' : state.historyError ? '重试加载更多审核历史' : '加载更多审核历史'}</button>}</>;
}

export function ReportDetails({ report }) {
  return <section className="nr-section"><h3>举报内容与处理范围</h3><p className="nr-notice">{report.comment_id ? `本条举报针对评论 #${report.comment_id}；移除操作只针对该评论，不下架作品。` : '本条举报针对小说作品；下架操作影响该作品，不是删除评论。'}忽略举报不代表对作品作出安全结论。</p><dl className="nr-metadata"><div><dt>举报 ID</dt><dd>{report.id}</dd></div><div><dt>作品 ID</dt><dd>{report.work_id}</dd></div><div><dt>章节 ID</dt><dd>{report.chapter_id || '未指定章节'}</dd></div><div><dt>状态</dt><dd><Status value={report.status} /></dd></div><div><dt>作品标题</dt><dd>{report.work_title || '未提供'}</dd></div><div><dt>举报人</dt><dd>{report.reporter?.display_name || report.reporter?.username || '未提供'} · #{report.reporter?.id || '未提供'}</dd></div><div><dt>评论 ID</dt><dd>{report.comment_id || '无'}</dd></div><div><dt>举报时间</dt><dd>{fmtFull(report.created_at)}</dd></div><div className="nr-wide"><dt>举报理由</dt><dd>{report.reason}</dd></div></dl><details><summary>完整举报记录</summary><pre className="nr-pre">{display(report)}</pre></details></section>;
}

const governanceLabels = target => target.kind === 'work' ? [['withdraw', '下架作品'], ['restore', '恢复已批准作品']] : target.kind === 'report' ? [['dismiss', '忽略举报'], ['withdraw', target.report.comment_id ? '移除被举报评论' : '下架被举报作品']] : [['suspend', '限制创作者'], ['restore', '恢复创作者']];

export function GovernanceControls({ target, state, reason, creatorId = '', busy = false, confirmed = false, unconfirmed = false, onReason, onCreatorId, onSubmit, onRefresh }) {
  const work = state.work?.id === target.id ? state.work : null;
  const disabled = busy || state.saving;
  const needsContext = target.kind !== 'creator' && unconfirmed;
  const creatorInvalid = !/^[1-9]\d*$/.test(creatorId.trim());
  return <section className="nr-section nr-governance-controls" aria-label="治理操作与必填理由" aria-busy={disabled}>
    {target.kind === 'creator' && <><div className="nr-notice"><strong>当前资格状态：未知</strong><p>接口未提供创作者资格列表或状态查询，不推测未知资格状态。仅影响独立的小说创作者权限，不更改宝宝认证、社区角色或徽章。</p></div><FormField label="创作者账号 ID" htmlFor="nr-creator-id" required><input id="nr-creator-id" className="ac-input" inputMode="numeric" pattern="[1-9][0-9]*" required value={creatorId} disabled={disabled} aria-describedby="nr-creator-help" aria-invalid={Boolean(creatorId && creatorInvalid)} onChange={event => onCreatorId(event.target.value)} /><p id="nr-creator-help" className="nr-field-help">请输入确切作者账号的正整数 ID；不接受昵称，不会自动查询资格。{creatorId && creatorInvalid ? ' 当前账号 ID 格式无效。' : ''}</p></FormField></>}
    <h3>{target.kind === 'creator' ? '限制或恢复独立小说创作权限' : '对当前目标执行治理'}</h3>
    <FormField className="nr-reason-field" label={`操作理由（必填，最多 ${NOVEL_REASON_MAX} 字）`} htmlFor="nr-governance-reason" required><textarea id="nr-governance-reason" className="ac-textarea" rows={4} maxLength={NOVEL_REASON_MAX} required aria-describedby="nr-governance-reason-help" value={reason} disabled={disabled} onChange={event => onReason(event.target.value)} placeholder="填写本次治理依据；与人工审核的选填理由不同" /><p id="nr-governance-reason-help" className="nr-field-help">{reason.length} / {NOVEL_REASON_MAX} 字 · 空白理由不可提交；失败或刷新目标时保留草稿。</p></FormField>
    <ActionFeedback busy={disabled} error={state.error} notice={state.notice} />
    {unconfirmed && <p className="nr-conflict" role="alert">上次治理未取得确认回执（可能包括 409、超时或状态变化），未显示为成功。{target.kind === 'creator' ? '接口没有资格查询；请人工核对账号与操作依据后主动重试原操作，不把未知状态当作已恢复或已限制。' : '请先重新读取当前目标，再手动重试；理由草稿保留，不自动重复治理。'}</p>}
    {confirmed && <p className="nr-muted">{target.kind === 'creator' ? '仅确认上次操作回执，不提供当前资格查询；执行下一次操作仍需核对账号并填写理由。' : '上次操作已确认；重新读取目标后才可再次治理，不使用旧详情推断最新状态。'}</p>}
    <div className="nr-actions">{governanceLabels(target).map(([action, label]) => <button key={action} type="button" className={`ac-btn ${['withdraw', 'suspend'].includes(action) ? 'danger' : ''}`} disabled={disabled || !reason.trim() || reason.length > NOVEL_REASON_MAX || reason.includes('\0') || needsContext || (target.kind === 'creator' && creatorInvalid) || (target.kind !== 'creator' && confirmed) || (target.kind === 'work' && (!work || state.workLoading || Boolean(state.workError) || (action === 'restore' && (!work.release_id || work.status !== 'withdrawn')) || (action === 'withdraw' && work.status !== 'published'))) || (target.kind === 'report' && (target.report.status !== 'pending' || target.unavailable))} onClick={() => onSubmit(action)}>{unconfirmed && target.kind === 'creator' ? `重试${label}` : label}</button>)}{onRefresh && <button type="button" className="ac-btn" disabled={disabled} onClick={onRefresh}>{target.kind === 'work' ? '重新读取作品与治理状态' : '重新读取举报列表核对本条'}</button>}</div>
    {target.kind === 'work' && <p className="nr-muted">仅已批准、有发布版本的下架作品可恢复。草稿、待审、驳回作品不能直接发布。</p>}{target.kind === 'report' && target.report.status !== 'pending' && <p className="nr-muted">本条已不在待处理状态，不能重复决定。</p>}
  </section>;
}

export function GovernanceForm({ target, controller, state, onReview, onRefreshReport }) {
  const [reason, setReason] = useState('');
  const [creatorId, setCreatorId] = useState('');
  const [phase, setPhase] = useState('idle');
  const [contextError, setContextError] = useState('');
  const heading = useRef(null);
  const active = useRef(true);
  const confirm = useConfirm();
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const work = state.work?.id === target.id ? state.work : null;
  const busy = ['confirming', 'pending', 'refreshing'].includes(phase) || state.workLoading;
  useEffect(() => { if (!state.workLoading) heading.current?.focus(); }, [target.kind, target.id, state.workLoading]);
  const submit = async action => {
    if (busy || state.saving) return;
    const id = target.id || creatorId.trim(), label = governanceLabels(target).find(entry => entry[0] === action)[1];
    const previousPhase = phase;
    setPhase('confirming');
    const ok = await confirm({ title: `确认${label}？`, message: `目标${target.kind === 'report' ? '举报' : target.kind === 'work' ? '作品' : '创作者账号'} #${id}${target.kind === 'report' ? ` · 作品 #${target.report.work_id}${target.report.comment_id ? ` · 仅评论 #${target.report.comment_id}` : ''}` : ''}。理由：${reason.trim()}。此操作须由服务器确认，不能将网络错误显示为成功。`, okText: `确认${label}`, danger: ['withdraw', 'suspend'].includes(action) });
    if (!active.current) return;
    if (!ok) { setPhase(previousPhase); return; }
    setPhase('pending');
    const saved = await controller.govern(target.kind, id, action, reason);
    if (!active.current) return;
    setPhase(saved ? 'confirmed' : 'unconfirmed');
    if (saved) setReason('');
  };
  const refresh = async () => {
    if (busy || state.saving) return;
    setPhase('refreshing'); setContextError('');
    const loaded = target.kind === 'work' ? await controller.openWork(target.id) : await onRefreshReport?.(target.id);
    if (!active.current) return;
    setPhase(loaded ? 'idle' : 'unconfirmed');
    if (!loaded) setContextError('未能重新确认当前目标，旧记录仅供核对；理由草稿仍保留。');
  };
  const changeCreator = value => { if (value !== creatorId) { controller.close(); setPhase('idle'); } setCreatorId(value); };
  const title = target.kind === 'creator' ? '按确切账号操作' : target.kind === 'work' ? work?.title || target.item?.title || `作品 #${target.id}` : target.report.work_title || `举报 #${target.id}`;
  return <div className="nr-governance"><header className="nr-detail-heading"><div><p className="nr-eyebrow">当前治理目标 · {target.kind === 'creator' ? '独立小说创作者权限' : target.kind === 'work' ? `作品 #${target.id}` : `举报 #${target.id} · 作品 #${target.report.work_id}`}</p><h2 ref={heading} tabIndex={-1} data-nr-detail-focus>{title}</h2></div>{target.kind === 'work' && work && <Status value={work.status} />}{target.kind === 'report' && <Status value={target.report.status} />}</header>
    {target.kind === 'work' && (state.workLoading ? <Loading text="正在加载完整作品目录和审核版本历史…" /> : state.workError ? <><ErrorBox msg={state.workError} /><button type="button" className="ac-btn" onClick={refresh}>重试作品详情</button></> : work && <><WorkDetails work={work} onReview={onReview} busy={busy || state.saving} /><WorkHistoryPager state={state} controller={controller} /></>)}
    {target.kind === 'report' && <ReportDetails report={target.report} />}
    {target.unavailable && <p className="nr-conflict" role="alert">服务器本次列表未返回本条举报，不能推断它已处理或仍待处理；当前不允许治理。</p>}
    <ErrorBox msg={contextError} />
    {phase === 'refreshing' && <p role="status">正在重新读取当前治理目标；不会提交治理操作。</p>}
    <GovernanceControls target={target} state={state} reason={reason} creatorId={creatorId} busy={busy} confirmed={phase === 'confirmed'} unconfirmed={phase === 'unconfirmed'} onReason={setReason} onCreatorId={changeCreator} onSubmit={submit} onRefresh={target.kind !== 'creator' ? refresh : undefined} />
  </div>;
}

export function NovelFilters({ state, query, onQuery, load, refresh }) {
  const reports = state.mode === 'reports', draft = query.trim() !== state.filter.query;
  return <><form className="nr-toolbar" aria-label="小说列表筛选" onSubmit={event => { event.preventDefault(); load({ query: query.trim() }); }}>
    {!reports && <FormField className="nr-search" label="搜索标题 / 作者 / 标签" htmlFor="nr-search"><input id="nr-search" className="ac-input" value={query} maxLength={100} onChange={event => onQuery(event.target.value)} placeholder="输入关键词后搜索" /></FormField>}
    {!reports && <FormField label="状态" htmlFor="nr-filter-status"><select id="nr-filter-status" className="ac-select" aria-label="小说状态筛选" value={state.filter.status} disabled={state.loading || state.saving} onChange={event => load({ status: event.target.value })}>{(state.mode === 'reviews' ? REVIEW_STATUSES : ['', 'published', 'withdrawn', 'pending', 'rejected', 'draft']).map(status => <option key={status} value={status}>{status ? statusMeta(status)[0] : '全部作品状态'}</option>)}</select></FormField>}
    {state.mode === 'reviews' && <FormField label="自动审核" htmlFor="nr-filter-auto"><select id="nr-filter-auto" className="ac-select" aria-label="自动审核筛选" value={state.filter.auto_filter} disabled={state.loading || state.saving} onChange={event => load({ auto_filter: event.target.value })}>{AUTO_REVIEW_FILTERS.map(value => <option key={value} value={value}>{autoFilterLabel(value)}</option>)}</select></FormField>}
    <div className="nr-actions">{!reports && <><button type="submit" className="ac-btn primary" disabled={state.loading || state.saving}>搜索</button><button type="button" className="ac-btn" disabled={state.loading || state.saving} onClick={() => { onQuery(''); load({ query: '', status: state.mode === 'reviews' ? 'pending' : '', auto_filter: 'all' }); }}>重置筛选</button></>}<button type="button" className="ac-btn" disabled={state.loading || state.saving} onClick={refresh}>{state.loading ? '正在刷新服务器列表…' : '刷新服务器列表'}</button></div>
  </form><div className="nr-applied-filters" role="status"><strong>{state.loading ? '正在应用筛选' : state.listError ? '本次请求条件（未取得新结果）' : state.page ? '已应用筛选' : '尚未取得服务器列表'}</strong>{reports ? <span>仅展示接口提供的小说 / 评论举报记录，不推算举报总量。</span> : <><span>状态：{state.filter.status ? statusMeta(state.filter.status)[0] : '全部作品状态'}</span><span>关键词：{state.filter.query || '不限'}</span>{state.mode === 'reviews' && <span>自动审核：{autoFilterLabel(state.filter.auto_filter)}</span>}</>}{!reports && draft && <span className="nr-draft-note">输入尚未应用，点击搜索后生效；刷新与状态筛选沿用已应用关键词。</span>}</div></>;
}

function RecordCopy({ item, mode }) {
  return <div className="nr-record-copy"><strong>{recordTitle(item)}</strong><p>{item.author ? `${item.author.display_name || item.author.username} · @${item.author.username} · 账号 #${item.author.id}` : `作品 #${item.work_id}${item.chapter_id ? ` · 章节 #${item.chapter_id}` : ''}`}</p><small>{mode === 'reviews' ? `审核 #${item.id} · 作品 #${item.work_id}` : mode === 'works' ? `作品 #${item.id}` : `举报 #${item.id} · ${item.comment_id ? `仅评论 #${item.comment_id}` : '作品举报'}`}</small>{mode === 'reports' && <p className="nr-reason">举报理由：{item.reason}</p>}</div>;
}
function RecordMeta({ item, mode }) {
  return <div className="nr-record-meta">{mode === 'reviews' ? <><span>审核版本 {item.version}</span><span>{fmtFull(item.submitted_at)}</span><span>{item.claimed_by ? `协作认领 #${item.claimed_by}（不限制决定）` : '未认领 · 可直接决定'}</span></> : mode === 'works' ? <><span>{item.chapter_count} 章 · {item.word_count} 字</span><span>发布版本 {item.release_id || '无'}</span><span>{TYPE_NAMES[item.work_type] || item.work_type}</span></> : <><span>{fmtFull(item.created_at)}</span><span>举报人 #{item.reporter?.id || '未提供'}</span></>}</div>;
}
function RecordAction({ item, mode, active, onOpen, disabled }) {
  const label = mode === 'reviews' ? '详情审核' : mode === 'works' ? '详情与治理' : '处理举报';
  return <button type="button" className={`ac-btn ${active ? 'primary' : ''}`} disabled={disabled} aria-label={`${label}：${recordTitle(item)}，${mode === 'reviews' ? '审核' : mode === 'works' ? '作品' : '举报'} #${item.id}`} aria-current={active ? 'true' : undefined} onClick={() => onOpen(item)}>{active ? '当前详情' : label}</button>;
}

export function NovelRecords({ state, selectedId, onOpen }) {
  const items = state.page?.items || [], mode = state.mode;
  return <><div className="nr-desktop-records ac-desktop-only"><table className="nr-record-table"><caption>{LIST_TITLES[mode]} · 仅当前服务器页，不是总量</caption><thead><tr><th scope="col">作品与目标</th><th scope="col">{mode === 'reviews' ? '版本与协作' : mode === 'works' ? '目录与发布版本' : '举报上下文'}</th><th scope="col">状态</th>{mode === 'reviews' && <th scope="col">服务器自动审核</th>}<th scope="col">操作</th></tr></thead><tbody>{items.map(item => <tr key={item.id} className={selectedId === item.id ? 'nr-record-current' : ''}><td><RecordCopy item={item} mode={mode} /></td><td><RecordMeta item={item} mode={mode} /></td><td><Status value={item.status} /></td>{mode === 'reviews' && <td><AutoReviewSummary value={item.auto_review} compact /></td>}<td><RecordAction item={item} mode={mode} active={selectedId === item.id} onOpen={onOpen} disabled={state.saving} /></td></tr>)}</tbody></table></div>
    <ul className="nr-records nr-mobile-records ac-mobile-only" aria-label="当前页小说管理记录">{items.map(item => <li key={item.id} className={selectedId === item.id ? 'nr-record-current' : ''}><RecordCopy item={item} mode={mode} /><RecordMeta item={item} mode={mode} />{mode === 'reviews' && <AutoReviewSummary value={item.auto_review} compact />}<div className="nr-record-actions"><Status value={item.status} /><RecordAction item={item} mode={mode} active={selectedId === item.id} onOpen={onOpen} disabled={state.saving} /></div></li>)}</ul></>;
}

export function NovelList({ state, controller, query, onQuery, load, refresh, cursors, onPrevious, onNext, selectedId, onOpen }) {
  return <Card title={LIST_TITLES[state.mode]} icon={state.mode === 'reports' ? 'fa-flag' : 'fa-book-open'} description={state.mode === 'reports' ? '先核对举报类型与目标，再填写处理理由；评论举报不会被当成作品下架。' : state.mode === 'works' ? '按当前发布状态定位作品；恢复仅针对已有批准发布版本的下架作品。' : '按人工状态和自动审核结果定位候选；认领只是协作，不是人工决定的前置条件。'}>
    <NovelFilters state={state} query={query} onQuery={onQuery} load={load} refresh={refresh} />
    {selectedId && <p className="nr-current-context">当前详情：{state.mode === 'reviews' ? '审核' : state.mode === 'works' ? '作品' : '举报'} #{selectedId}；筛选不改变已打开目标的身份。</p>}
    {state.notice && !selectedId && <p className="nr-success" role="status">{state.notice}</p>}
    <div className="nr-list-resource" aria-busy={state.loading}>{state.loading ? <Loading text="正在加载小说管理数据；尚未取得本次服务器结果…" /> : state.listError ? <><ErrorBox msg={state.listError} /><p className="nr-muted">列表请求失败，不代表队列为空；当前未显示旧列表为新结果。</p><button type="button" className="ac-btn" onClick={refresh}>重试当前筛选与页码</button></> : state.page ? <><p className="nr-result-summary" role="status">{state.mode === 'reports' ? '服务器本次返回' : '当前页'} {state.page.items.length} 条 · 第 {cursors.length + 1} 页{state.page.next_cursor ? ' · 还有下一页' : ' · 服务器确认已到末页'} · 不是待处理总量</p>{state.page.items.length ? <NovelRecords state={state} selectedId={selectedId} onOpen={onOpen} /> : <Empty text={state.mode === 'reports' ? '服务器返回的小说举报列表为空' : '服务器没有返回符合当前筛选的记录'} />}</> : <><p className="nr-muted">尚未取得服务器记录，不能判断队列是否为空。</p><button type="button" className="ac-btn" onClick={() => controller?.loadList({ mode: state.mode, ...state.filter })}>读取当前筛选列表</button></>}</div>
    <nav className="nr-pagination" aria-label="小说列表游标分页"><button type="button" className="ac-btn" disabled={!cursors.length || state.loading || state.saving} onClick={onPrevious}>上一页</button><span>第 {cursors.length + 1} 页 · 服务器游标分页</span><button type="button" className="ac-btn" disabled={!state.page?.next_cursor || state.loading || state.saving} onClick={onNext}>下一页</button></nav>
  </Card>;
}

function ReviewDetailResource({ state, controller, selectedId, adminId }) {
  const content = useRef(null);
  useEffect(() => {
    if (!state.detailLoading) content.current?.querySelector('[data-nr-detail-focus], [role="alert"]')?.focus();
  }, [selectedId, state.detailLoading, state.detailError, state.selected?.id]);
  return <div ref={content} aria-busy={state.detailLoading}>{state.detailLoading ? <><p className="nr-current-context">当前目标：审核 #{selectedId}；正在读取冻结候选，尚未取得本次详情。</p><Loading text="正在加载完整候选元数据和目录…" /></> : state.detailError ? <div tabIndex={-1} role="alert"><p>审核 #{selectedId} 的详情尚未确认，未显示旧候选供操作。</p><ErrorBox msg={state.detailError} /><button type="button" className="ac-btn" onClick={() => controller?.open(selectedId, { preserveReason: true })}>重试加载详情（保留理由）</button></div> : state.selected?.id === selectedId ? <ReviewDetail state={state} controller={controller} adminId={adminId} /> : <p role="status">尚未取得本条候选详情。</p>}</div>;
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
    const block = () => { current.block(); setSelectedId(null); setTarget(null); setQuery(''); setCursors([]); };
    const storage = event => { if (!event.key || ['abdl_accounts', 'abdl_active_account', 'abdl_currentUser'].includes(event.key)) block(); };
    const rejected = event => { if (event.detail?.sessionKey === sessionKey) block(); };
    window.addEventListener('auth-session-changing', block);
    window.addEventListener('storage', storage);
    window.addEventListener('pagehide', block);
    window.addEventListener('admin-session-rejected', rejected);
    if (user?.role === 'admin') { void current.loadList(); void current.loadPolicy(); }
    return () => { current.dispose(); if (controller.current === current) controller.current = null; window.removeEventListener('auth-session-changing', block); window.removeEventListener('storage', storage); window.removeEventListener('pagehide', block); window.removeEventListener('admin-session-rejected', rejected); };
  }, [sessionKey, user?.id, user?.role]);
  const state = snapshot.key === sessionKey ? snapshot.state : initialReviewState();
  const close = () => {
    if (controller.current?.getState().saving) return;
    controller.current?.close(); setSelectedId(null); setTarget(null);
  };
  const load = (patch = {}) => { setCursors([]); return controller.current?.loadList({ mode: state.mode, ...state.filter, cursor: null, ...patch }); };
  const refresh = () => controller.current?.loadList({ mode: state.mode, ...state.filter });
  const open = item => { if (state.saving) return; setTarget(null); setSelectedId(item.id); void controller.current?.open(item.id); };
  const govern = value => { if (state.saving) return; controller.current?.close(); setSelectedId(null); setTarget(value); if (value.kind === 'work') void controller.current?.openWork(value.id); };
  const refreshReport = async id => {
    const current = controller.current;
    current?.close();
    const loaded = await current?.loadList({ mode: 'reports', status: '', query: '', auto_filter: 'all', cursor: null });
    if (!loaded || controller.current !== current || session.current !== sessionKey) return false;
    const report = current.getState().page?.items.find(item => item.id === id);
    setCursors([]);
    setTarget(previous => previous?.kind === 'report' && previous.id === id ? { ...previous, ...(report ? { report } : {}), unavailable: !report } : previous);
    return Boolean(report);
  };
  if (state.blocked) return <Card title="小说审核会话已停止"><ErrorBox msg={state.error} /><p>请确认当前管理员账号后重新进入此页面。</p></Card>;
  return <div className="nr-console ac-page-stack"><p className="nr-local-note">管理员可直接人工决定；手动 AI 只检查主动选择的章节。当前列表仅展示服务器本页记录，不推算总量，不自动触发 AI。</p><NovelTabs value={state.mode} onChange={mode => { if (state.saving) return; close(); setQuery(''); load({ mode, status: mode === 'reviews' ? 'pending' : '', auto_filter: 'all', query: '' }); }} />
    <div className="nr-mode-content" role="region" aria-label={`${MODES.find(mode => mode.value === state.mode)?.label}内容`}>
      {state.mode === 'creators' ? <Card title="独立小说权限操作" description="没有资格查询接口；限制或恢复均需要确切账号与必填操作理由，服务器再次校验权限。"><GovernanceForm key={sessionKey} target={{ kind: 'creator' }} controller={controller.current} state={state} /></Card> : <NovelList state={state} controller={controller.current} query={query} onQuery={setQuery} load={load} refresh={refresh} cursors={cursors} selectedId={selectedId || target?.id} onOpen={item => state.mode === 'reviews' ? open(item) : govern(state.mode === 'works' ? { kind: 'work', id: item.id, item } : { kind: 'report', id: item.id, report: item })} onPrevious={() => { const previous = cursors.at(-1); setCursors(values => values.slice(0, -1)); controller.current?.loadList({ mode: state.mode, ...state.filter, cursor: previous }); }} onNext={() => { if (!state.page?.next_cursor) return; setCursors(values => [...values, state.filter.cursor]); controller.current?.loadList({ mode: state.mode, ...state.filter, cursor: state.page.next_cursor }); }} />}
    </div>
    <NovelAIPolicy state={state} controller={controller.current} />
    <Modal open={Boolean(selectedId) && snapshot.key === sessionKey} onClose={close} title="候选快照与人工决定" width={1240} className="nr-review-modal" footer={<button type="button" className="ac-btn" disabled={state.saving} onClick={close}>{state.saving ? '等待操作回执后返回' : '返回列表'}</button>}><ReviewDetailResource state={state} controller={controller.current} selectedId={selectedId} adminId={user?.id} /></Modal>
    <Modal open={Boolean(target) && snapshot.key === sessionKey} onClose={close} title={target?.kind === 'work' ? '作品详情与治理' : '举报目标与处理'} width={960} className="nr-review-modal" footer={<button type="button" className="ac-btn" disabled={state.saving} onClick={close}>{state.saving ? '等待操作回执后返回' : '返回列表'}</button>}>{target && <GovernanceForm key={`${target.kind}-${target.id}`} target={target} controller={controller.current} state={state} onReview={open} onRefreshReport={refreshReport} />}</Modal>
  </div>;
}
