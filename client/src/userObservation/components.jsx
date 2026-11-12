import { useEffect, useId, useRef, useState } from 'react';
import { adminSessionKey, isSuperAdmin } from '../pages/admin/access.js';
import { Card, Empty, ErrorBox, Loading, Pill, useConfirm } from '../pages/admin/ui.jsx';
import { createUserObservationAPI } from './api.js';
import { createUserObservationController, initialObservationState } from './controller.js';
import { formatTime, METHODS, targetEligible, TIMEZONE } from './model.js';
import './styles.css';

const STATUS_LABEL = { active: '生效中', disabled: '已停止', expired: '已到期', policy_disabled: '总开关关闭', not_configured: '尚未配置' };
const COVERAGE_NOTE = '仅展示服务端实际记录的请求，限额、停用、到期或不在记录范围的请求可能缺失；业务注释不证明用户实施了该动作。';

function ReasonField({ label = '操作理由', value, onChange, disabled = false }) {
  const id = useId();
  return <label className="ac-form-field" htmlFor={id}><span className="ac-field-label">{label}（必填）</span><textarea id={id} className="ac-textarea" value={value} onChange={event => onChange(event.target.value)} maxLength={500} rows={2} disabled={disabled} autoComplete="off" /><span className="ac-field-hint">1–500 字，写入服务端审计。请勿填写密码、私信正文或其他无关敏感内容。</span></label>;
}
function Check({ label, checked, onChange, disabled }) {
  return <label className="uo-check"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} /><span>{label}</span></label>;
}
function Error({ state, name }) { return <ErrorBox msg={state.errors[name]} />; }
function Next({ page, pending, onNext, onFirst }) {
  return <div className="uo-page-controls"><span className="ac-section-note">本页 {page?.items.length ?? '—'} 条{page?.next_cursor ? ' · 还有后续页' : page ? ' · 已到当前结果末页' : ''}</span><button type="button" className="ac-btn" disabled={pending} onClick={onFirst}>从首页重读</button><button type="button" className="ac-btn" disabled={pending || !page?.next_cursor} onClick={() => onNext(page.next_cursor)}>下一页</button></div>;
}
function Conflict({ state, name, onReload }) {
  return state.conflicts[name] ? <div className="uo-warning" role="alert">服务端状态已变化，未覆盖您的表单。<button type="button" className="ac-btn" onClick={onReload}>重读最新版本并保留表单</button><p>请核对最新服务端配置和保留的表单差异，再次明确确认。禁止盲目覆盖。</p></div> : null;
}

export function PolicyPanel({ state, controller }) {
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState(false);
  const form = state.policyForm, policy = state.policy?.policy;
  const busy = !!state.pending.policyWrite;
  return <Card title="观察总策略" icon="fa-sliders" description="默认关闭；总开关和两个目标开关共同决定将来是否记录，不会因进入页面自动启用。" action={<button type="button" className="ac-btn" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>{expanded ? '收起配置' : '查看配置'}</button>}>
    <Error state={state} name="policy" /><Error state={state} name="policyWrite" />
    {!policy ? state.pending.policy ? <Loading text="读取观察策略…" /> : <button type="button" className="ac-btn" onClick={() => controller.loadPolicy()}>重试读取策略</button> : <div className="uo-policy-summary"><Pill tone={policy.enabled ? 'blue' : 'slate'}>{policy.enabled ? '总开关开启' : '总开关关闭'}</Pill><span>保留 {policy.retention_days} 天 · 单用户每日 {policy.per_user_daily_limit} 条 · 全局每日 {policy.global_daily_limit} 条 · 版本 {policy.revision}</span></div>}
    {state.policy?.schema_available === false && <div className="uo-warning" role="alert">观察数据表尚不可用，不能配置或声称已采集。请由维护者完成部署后重新读取。</div>}
    {expanded && form && <form className="ac-form-grid uo-section" onSubmit={async event => { event.preventDefault(); const ok = await confirm({ title: form.enabled ? '保存观察总策略' : '关闭观察总开关', message: '此操作只影响将来采集，不删除任何历史记录，不会启用旧追踪或封禁 IP。修改将记入审计。', okText: '确认保存' }); if (ok) controller.savePolicy(); }}>
      <Conflict state={state} name="policyWrite" onReload={() => controller.loadPolicy({ preserve: true })} />
      <Check label="启用总开关（不会自动开启任何目标开关）" checked={form.enabled} onChange={enabled => controller.changePolicy({ enabled })} disabled={busy} />
      <div className="uo-grid"><label className="ac-form-field"><span className="ac-field-label">新观察数据保留天数（1–30）</span><input className="ac-input" type="number" min="1" max="30" required value={form.retention_days} onChange={e => controller.changePolicy({ retention_days: Number(e.target.value) })} disabled={busy} /></label><label className="ac-form-field"><span className="ac-field-label">单用户每日限额（1–20000）</span><input className="ac-input" type="number" min="1" max="20000" required value={form.per_user_daily_limit} onChange={e => controller.changePolicy({ per_user_daily_limit: Number(e.target.value) })} disabled={busy} /></label><label className="ac-form-field"><span className="ac-field-label">全局每日限额（1–100000）</span><input className="ac-input" type="number" min="1" max="100000" required value={form.global_daily_limit} onChange={e => controller.changePolicy({ global_daily_limit: Number(e.target.value) })} disabled={busy} /></label></div>
      <ReasonField value={form.reason} onChange={reason => controller.changePolicy({ reason })} disabled={busy} />
      <div className="uo-actions"><button type="submit" className="ac-btn primary" disabled={busy || !state.policy.schema_available || state.conflicts.policyWrite}>{busy ? '保存中…' : '确认保存总策略'}</button><button type="button" className="ac-btn" disabled={busy} onClick={() => controller.loadPolicy({ preserve: true })}>重读服务端版本</button></div>
    </form>}
  </Card>;
}

export function TargetPanel({ state, controller }) {
  const confirm = useConfirm();
  const selected = state.selected, form = state.targetForm;
  if (!selected || !form) return null;
  const busy = !!state.pending.targetWrite;
  const apply = async stop => {
    const ok = await confirm({ title: stop ? '停止将来观察' : '保存独立目标开关', message: stop ? '仅将该用户的 IP 与请求记录开关关闭，历史数据保留，不删除任何记录、不解封任何 IP。' : '仅保存已勾选的 IP / 请求记录开关。两个开关独立，开启观察不会调用任何封禁接口。默认 7 天，到期最长 30 天。', okText: stop ? '确认停止' : '确认保存' });
    if (ok) controller.saveTarget({ stop });
  };
  return <Card title={`目标 @${selected.user.username} · ID ${selected.user.id}`} icon="fa-user-shield" description="仅普通用户可作为目标；管理员、ID 1 和本人均排除。目标配置与实际历史记录独立，不从现有 IP / 旧追踪自动推断开关。">
    <div className="uo-policy-summary"><Pill tone={selected.status === 'active' ? 'blue' : 'slate'}>{STATUS_LABEL[selected.status]}</Pill><span>服务端 IP：{selected.target?.observe_ip ? '开' : '关'} · 请求：{selected.target?.observe_requests ? '开' : '关'} · 到期 {selected.target ? formatTime(selected.target.expires_at, true) : '未配置'} · 版本 {selected.target?.revision ?? '0'}</span></div>
    {selected.target && <p className="ac-section-note">最近配置：{formatTime(selected.target.updated_at, true)} · 管理员 {selected.target.updated_by} · 理由：{selected.target.reason}</p>}
    {!selected.policy_enabled && <p className="uo-warning">服务端总开关关闭，当前目标开关不会导致将来采集。</p>}
    <form className="ac-form-grid uo-section" onSubmit={event => { event.preventDefault(); apply(false); }}>
      <Error state={state} name="targetWrite" /><Conflict state={state} name="targetWrite" onReload={() => controller.select(selected.user.id, { preserve: true })} />
      <div className="uo-actions"><Check label="记录该用户 IP（独立）" checked={form.observe_ip} onChange={observe_ip => controller.changeTarget({ observe_ip })} disabled={busy} /><Check label="记录该用户请求日志（独立）" checked={form.observe_requests} onChange={observe_requests => controller.changeTarget({ observe_requests })} disabled={busy} /></div>
      <label className="ac-form-field"><span className="ac-field-label">到期时间（北京时间，默认 7 天，最长 30 天）</span><input className="ac-input" type="datetime-local" required={form.observe_ip || form.observe_requests} value={form.expires} onChange={e => controller.changeTarget({ expires: e.target.value })} disabled={busy} /></label>
      <ReasonField label="目标配置 / 停止理由" value={form.reason} onChange={reason => controller.changeTarget({ reason })} disabled={busy} />
      <div className="uo-actions"><button type="submit" className="ac-btn primary" disabled={busy || state.conflicts.targetWrite}>{busy ? '保存中…' : '保存目标开关'}</button><button type="button" className="ac-btn" disabled={busy || !selected.target || state.conflicts.targetWrite} onClick={() => apply(true)}>停止将来观察（不删历史）</button></div>
    </form>
  </Card>;
}

export function ObservationTables({ state, controller }) {
  const confirm = useConfirm();
  const [format, setFormat] = useState('json');
  const copy = async (scope, kind = 'requests') => {
    const ok = await confirm({ title: scope === 'day' ? '复制所选日有界导出' : '复制当前页', message: `敏感信息警告：输出含用户 IP / 请求记录，可能被系统剪贴板历史、同步或其他应用读取。${scope === 'day' ? '将通过有审计的服务端导出逐页读取所选日，最多合计 5000 条、1 MiB；不保证完整覆盖。' : '仅复制当前已成功读取的一页，不是所选日全部记录；会先取得服务端审计授权。'} 不会上传到外部站点。请确认处理目的及保管责任。`, okText: '审计授权并复制', danger: true });
    if (ok) controller.copy({ scope, kind, format, confirmed: true });
  };
  const busy = !!state.pending.export;
  const { filters } = state;
  return <>
    <Card title="按日查看已记录数据" description={`日期及显示时间统一 ${TIMEZONE}（北京时间），默认今天；IP 可选择全部留存或仅所选日。${COVERAGE_NOTE}`} icon="fa-calendar-day">
      <form className="uo-actions" onSubmit={e => { e.preventDefault(); controller.loadIPs(); controller.loadRequests(); }}>
        <label className="ac-form-field"><span className="ac-field-label">日期（北京时间）</span><input className="ac-input" type="date" required value={filters.day} onChange={e => controller.setFilters({ day: e.target.value })} /></label>
        <label className="ac-form-field"><span className="ac-field-label">请求方法</span><select className="ac-select" value={filters.method} onChange={e => controller.setFilters({ method: e.target.value })}><option value="">全部方法</option>{METHODS.map(method => <option key={method}>{method}</option>)}</select></label>
        <label className="ac-form-field"><span className="ac-field-label">HTTP 状态码（精确）</span><input className="ac-input" type="number" min="100" max="599" placeholder="全部状态" value={filters.status} onChange={e => controller.setFilters({ status: e.target.value })} /></label>
        <label className="ac-form-field"><span className="ac-field-label">IP 范围</span><select className="ac-select" value={filters.ipAll ? 'all' : 'day'} onChange={e => controller.setFilters({ ipAll: e.target.value === 'all' })}><option value="all">全部留存 IP（不受日期限制）</option><option value="day">仅所选日 IP</option></select></label>
        <button type="submit" className="ac-btn primary">按当前条件读取</button><button type="button" className="ac-btn" onClick={() => controller.cancel()}>取消读取 / 导出</button>
      </form>
      <Error state={state} name="days" />
      {state.days && <><div className="uo-day-list">{state.days.items.length ? state.days.items.map(item => <button type="button" className={`uo-day ${item.day === filters.day ? 'active' : ''}`} key={item.day} onClick={() => controller.setFilters({ day: item.day })}><strong>{item.day}</strong><span>接收 {item.accepted_count} · 请求 {item.request_count} · IP {item.ip_count}</span><span>{formatTime(item.first_seen_at)} — {formatTime(item.last_seen_at)}</span><span className={item.coverage === 'recorded' ? '' : 'uo-limit'}>{{ recorded: '有已接受记录（不保证全量）', unknown: '记录覆盖未知 / 可能缺失', limit_reached: '已达上限', disabled: '未开启记录' }[item.coverage]}</span>{item.limit_reached && <span className="uo-limit">达到限额，覆盖不完整</span>}</button>) : <p className="ac-section-note">服务端没有返回已记录日期；不代表用户没有访问。</p>}</div><Next page={state.days} pending={state.pending.days} onFirst={() => controller.loadDays()} onNext={cursor => controller.loadDays(cursor)} /></>}
    </Card>
    <Card title={filters.ipAll ? '全部留存 IP' : `${filters.day} IP`} description="按日列出 IP、可信来源、首次 / 最近出现与计数；同一 IP 出现在不同日期可能有多行，不据此认定不同个人或执行封禁。" icon="fa-network-wired">
      <Error state={state} name="ips" />
      <div className="ac-table-wrap"><table className="ac-table uo-table"><thead><tr><th scope="col">日期</th><th scope="col">IP</th><th scope="col">首次出现（北京）</th><th scope="col">最近出现（北京）</th><th scope="col">次数</th><th scope="col">来源</th></tr></thead><tbody>{state.ips?.items.map(row => <tr key={`${row.day}-${row.ip}`}><td>{row.day}</td><td><code>{row.ip}</code></td><td>{formatTime(row.first_seen_at)}</td><td>{formatTime(row.last_seen_at)}</td><td>{row.count}</td><td>{row.ip_source}</td></tr>)}</tbody></table></div>
      {state.pending.ips ? <Loading text="读取 IP…" /> : state.ips?.items.length === 0 ? <Empty text="该范围没有已记录 IP（不代表从未访问）" /> : !state.ips && <p className="ac-section-note">尚未成功读取此范围，请点击读取；错误不会伪装成空列表。</p>}
      <Next page={state.ips} pending={state.pending.ips} onFirst={() => controller.loadIPs()} onNext={cursor => controller.loadIPs(cursor)} />
    </Card>
    <Card title={`${filters.day} 请求记录`} description="业务注释是端点的业务含义，不是对用户行为、提交成功或私人内容的推断；请求模板不包含原始查询串或正文。" icon="fa-list-ul">
      <Error state={state} name="requests" />
      <div className="ac-table-wrap"><table className="ac-table uo-table"><thead><tr><th scope="col">时间（北京）</th><th scope="col">方法</th><th scope="col">请求模板 / 端点</th><th scope="col">业务注释（非行为结论）</th><th scope="col">状态</th><th scope="col">耗时 ms</th><th scope="col">事件 ID / 元数据版本</th><th scope="col">IP / 来源</th></tr></thead><tbody>{state.requests?.items.map(row => <tr key={row.event_id}><td>{formatTime(row.occurred_at)}</td><td><code>{row.method}</code></td><td><code>{row.template}</code><small>{row.endpoint_id}</small></td><td>{row.business_note || '服务端未提供注释'}</td><td>{row.status}</td><td>{row.duration_ms}</td><td><code>{row.event_id}</code><small>{row.metadata_version}</small></td><td><code>{row.ip ?? '未记录 IP'}</code><small>{row.ip_source}</small></td></tr>)}</tbody></table></div>
      {state.pending.requests ? <Loading text="读取请求记录…" /> : state.requests?.items.length === 0 ? <Empty text="该条件下没有已记录请求（不代表用户未操作）" /> : !state.requests && <p className="ac-section-note">尚未成功读取当前筛选条件。</p>}
      <Next page={state.requests} pending={state.pending.requests} onFirst={() => controller.loadRequests()} onNext={cursor => controller.loadRequests(cursor)} />
    </Card>
    <Card title="受控复制与导出" description="仅显式点击并二次确认后调用审计授权与系统剪贴板。当前页与所选日导出严格区分；最多合计 5000 条记录、1 MiB，不生成外部下载链接，不自动写剪贴板。" icon="fa-copy">
      <ReasonField label="复制 / 导出理由" value={state.exportReason} onChange={value => controller.changeReason('exportReason', value)} disabled={busy} />
      <div className="uo-actions uo-section"><label className="ac-form-field"><span className="ac-field-label">输出格式</span><select className="ac-select" value={format} onChange={e => setFormat(e.target.value)} disabled={busy}><option value="json">JSON（含范围与覆盖元信息）</option><option value="text">纯文本（逐行 JSON，含元信息）</option></select></label><button type="button" className="ac-btn" disabled={busy || !state.requests} onClick={() => copy('current_page')}>复制当前请求页</button><button type="button" className="ac-btn" disabled={busy || !state.ips || filters.ipAll} title={filters.ipAll ? '请先选择仅所选日 IP 并成功读取' : ''} onClick={() => copy('current_page', 'ips')}>复制当前所选日 IP 页</button><button type="button" className="ac-btn primary" disabled={busy} onClick={() => copy('day')}>复制所选日有界导出</button>{busy && <><span role="status">正在读取，已处理 {state.exportProgress} 条…</span><button type="button" className="ac-btn" onClick={() => controller.cancel('export')}>取消导出</button></>}</div>
      <Error state={state} name="export" />
      {state.output && <div className="uo-output" role="status"><p>{state.output.copied ? '剪贴板已写入。浏览器或系统中的副本不会随页面清空自动删除。' : '系统剪贴板写入失败；以下内容仅在内存中，可手动选择复制。'} 合计 {state.output.count} 条{state.output.truncated ? '，输出有截断 / 后续页。' : '。'}</p>{!state.output.copied && <textarea className="ac-textarea uo-output-text" aria-label="已审计的敏感导出文本（可手动选择复制）" readOnly value={state.output.text} rows={12} spellCheck={false} onFocus={event => event.currentTarget.select()} />}<button type="button" className="ac-btn" onClick={() => controller.clearOutput()}>清空导出显示</button></div>}
    </Card>
    <Card title="只清除所选日历史" description="清除该用户所选北京时间日期的新观察表记录；不会停止将来观察，不会清理旧日志，不会解除任何 IP 封禁。" icon="fa-eraser">
      <ReasonField label="清除历史理由" value={state.actionReason} onChange={value => controller.changeReason('actionReason', value)} disabled={state.pending.clearDay} /><Error state={state} name="clearDay" /><Conflict state={state} name="clearDay" onReload={() => controller.select(state.selected.user.id, { preserve: true })} />
      <div className="uo-section"><button type="button" className="ac-btn danger" disabled={state.pending.clearDay || state.conflicts.clearDay || !state.selected.target} onClick={async () => { const ok = await confirm({ title: '永久清除所选日观察历史', message: `只清除用户 ID ${state.selected.user.id} 在 ${filters.day}（${TIMEZONE}）的新观察 IP / 请求记录，不可恢复。目标开关保持不变，后续请求仍可能继续记录。不会按历史 IP 解封或移除共享 IP。`, okText: '确认清除该日历史', danger: true }); if (ok) controller.clearDay(); }}>{state.pending.clearDay ? '清除中…' : `仅清除 ${filters.day} 历史`}</button></div>
    </Card>
  </>;
}

export function LegacyPanel({ state, controller }) {
  const confirm = useConfirm();
  const legacy = state.legacy, busy = !!state.pending.legacyWrite;
  const act = async action => {
    const ok = await confirm({ title: action === 'stop' ? '停止旧追踪的将来自动封禁' : '复核解封所选旧来源 IP', message: action === 'stop' ? '只关闭旧 track-and-ban 的将来自动封禁，已有 IP 封禁不变。新观察开关与历史均不改变。' : `仅解除您明确选择的 ${state.selectedIPs.length} 个、来源属于当前目标的旧机制封禁。IP 可能共享；不会根据历史 IP 列表批量删封禁，也不会自动停止旧追踪。请先逐项核对来源和理由。`, okText: '确认执行', danger: true });
    if (ok) controller.legacyAction(action);
  };
  return <Card title="旧追踪与封禁复核（独立机制）" description="旧 track-and-ban 与新观察无关，打开新观察不会启用旧追踪。必须先显式读取，停止旧追踪与解封已有来源封禁分开确认。" icon="fa-clock-rotate-left" action={<button type="button" className="ac-btn" disabled={busy || state.pending.legacy} onClick={() => controller.loadLegacy()}>{state.pending.legacy ? '读取中…' : legacy ? '重读旧机制状态' : '读取旧机制状态'}</button>}>
    <Error state={state} name="legacy" /><Error state={state} name="legacyWrite" /><Conflict state={state} name="legacyWrite" onReload={() => controller.loadLegacy()} />
    {legacy && <div className="ac-form-grid"><p>旧追踪：<strong>{legacy.tracking ? '开启（可能继续自动封禁）' : '已停止'}</strong> · 版本 {legacy.rule_revision}</p>{legacy.truncated && <p className="uo-warning">旧来源封禁列表有截断，当前只复核已返回部分；不能声明全部封禁均已处理。</p>}<div className="uo-legacy-list">{legacy.bans.length ? legacy.bans.map(ban => <label className="uo-legacy-ban" key={ban.ip}><input type="checkbox" checked={state.selectedIPs.includes(ban.ip)} onChange={e => controller.selectLegacyIP(ban.ip, e.target.checked)} disabled={busy} /><div><code>{ban.ip}</code><p>{ban.reason || '无旧理由'} · {formatTime(ban.created_at, true)} · 创建者 {ban.created_by ?? '未知'}</p><small>仅后端确认 source_user_id 属于当前目标的来源封禁；不等同于历史 IP。</small></div></label>) : <p className="ac-section-note">没有返回属于该目标的旧来源封禁。</p>}</div><ReasonField label="旧机制操作理由" value={state.legacyReason} onChange={value => controller.changeReason('legacyReason', value)} disabled={busy} /><div className="uo-actions"><button type="button" className="ac-btn danger" disabled={busy || !legacy.tracking || state.conflicts.legacyWrite} onClick={() => act('stop')}>仅停止旧追踪（保留封禁）</button><button type="button" className="ac-btn danger" disabled={busy || !state.selectedIPs.length || state.conflicts.legacyWrite} onClick={() => act('unban')}>仅解封明确所选 {state.selectedIPs.length} 个来源封禁</button></div></div>}
  </Card>;
}

function ObservationSession({ user, token, initialUserId = '', apiFactory = createUserObservationAPI, clipboard }) {
  const key = adminSessionKey(user, token), controller = useRef(null), session = useRef({ user, token });
  session.current = { user, token };
  const [state, setState] = useState(() => initialObservationState());
  const [id, setId] = useState(initialUserId ? String(initialUserId) : '');
  useEffect(() => {
    let live = true;
    const api = apiFactory({ base: import.meta.env.VITE_API_BASE ?? '', getSession: () => session.current, isCurrent: () => live && key === adminSessionKey(session.current?.user, session.current?.token) });
    const instance = createUserObservationController({ api, getSession: () => session.current, onChange: setState, ...(clipboard ? { clipboard } : {}), onRejected: (_error, sessionKey) => window.dispatchEvent(new CustomEvent('admin-session-rejected', { detail: { sessionKey } })) });
    controller.current = instance;
    const block = () => { live = false; instance.block(); setId(''); };
    const storage = event => { if (!event.key || ['abdl_accounts', 'abdl_active_account', 'abdl_currentUser'].includes(event.key)) block(); };
    const rejected = event => { if (event.detail?.sessionKey === key) block(); };
    window.addEventListener('auth-session-changing', block); window.addEventListener('storage', storage); window.addEventListener('pagehide', block); window.addEventListener('admin-session-rejected', rejected);
    instance.loadPolicy(); instance.loadTargets();
    if (initialUserId) instance.select(initialUserId);
    return () => { live = false; instance.dispose(); if (controller.current === instance) controller.current = null; window.removeEventListener('auth-session-changing', block); window.removeEventListener('storage', storage); window.removeEventListener('pagehide', block); window.removeEventListener('admin-session-rejected', rejected); };
  }, [key, apiFactory, clipboard, initialUserId]);
  const actions = controller.current;
  if (state.blocked) return <Card title="定向观察会话已关闭"><p>敏感记录和导出文本已清空，请重新验证管理员身份后打开。</p></Card>;
  if (!actions) return <Loading text="初始化受控观察会话…" />;
  return <section className="uo-module ac-page-stack" aria-label="定向用户观察">
    <div className="uo-warning"><strong>仅超级管理员 · 最小必要处理</strong><p>IP 记录与请求日志独立控制；不会自动开启、封禁或从旧记录推定用户行为。敏感信息不写入本地存储，退出、切换账号、关闭模块或权限失效时清空。</p></div>
    <div role="status" aria-live="polite">{state.notice && <p className="uo-notice">{state.notice}</p>}</div>
    <PolicyPanel state={state} controller={actions} />
    <Card title="观察目标" description="可选择已配置目标，或输入普通用户 ID 读取配置。读取不创建目标，也不改变两个开关。" icon="fa-users-viewfinder">
      <form className="uo-actions" onSubmit={e => { e.preventDefault(); actions.select(id); }}><label className="ac-form-field"><span className="ac-field-label">普通用户 ID</span><input className="ac-input" type="text" inputMode="numeric" pattern="[0-9]+" autoComplete="off" required value={id} onChange={e => setId(e.target.value)} /></label><button type="submit" className="ac-btn primary" disabled={state.pending.target}>{state.pending.target ? '读取目标中…' : '读取目标（不启用）'}</button><button type="button" className="ac-btn" onClick={() => actions.cancel()}>取消请求</button></form>
      <Error state={state} name="target" /><Error state={state} name="targets" />
      {state.targets && <><div className="uo-target-list">{state.targets.items.length ? state.targets.items.map(target => <button type="button" className={`uo-target ${state.selected?.user.id === target.user_id ? 'active' : ''}`} key={target.user_id} onClick={() => { setId(String(target.user_id)); actions.select(target.user_id); }}><strong>ID {target.user_id}</strong><Pill tone={target.status === 'active' ? 'blue' : 'slate'}>{STATUS_LABEL[target.status]}</Pill><span>IP {target.observe_ip ? '开' : '关'} / 请求 {target.observe_requests ? '开' : '关'}</span><span>到期 {formatTime(target.expires_at, true)}</span><span>更新 {formatTime(target.updated_at, true)} · 管理员 {target.updated_by}</span></button>) : <Empty text="尚无已配置目标（不代表用户不存在）" />}</div><Next page={state.targets} pending={state.pending.targets} onFirst={() => actions.loadTargets()} onNext={cursor => actions.loadTargets(cursor)} /></>}
    </Card>
    {state.selected && <><TargetPanel state={state} controller={actions} /><ObservationTables key={state.selected.user.id} state={state} controller={actions} /><LegacyPanel state={state} controller={actions} /></>}
  </section>;
}

export default function UserObservation(props) {
  if (!isSuperAdmin(props.user)) return <Card title="定向用户观察"><p>仅超级管理员可读取原始观察数据或执行操作，当前身份不会发出观察接口请求。</p></Card>;
  return <ObservationSession key={`${adminSessionKey(props.user, props.token)}:${props.initialUserId ?? ''}`} {...props} />;
}

export function UserObservationLink({ actor, target, onOpen }) {
  if (!targetEligible(actor, target)) return null;
  return <button type="button" className="ac-btn" onClick={() => onOpen(target.id)}><i className="fa-solid fa-eye" aria-hidden="true" />定向观察（IP / 请求独立）</button>;
}
