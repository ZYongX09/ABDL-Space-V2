import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { createSponsorAdminAPI, downloadCodes } from './adminAPI.js';
import { expirySeconds, formatTime, formatPrice, parsePrice, identifier, integer, operationKeeper, reasonText, renderTemplate, required, statusText, validateConfig, validatePlan, validateStock } from './adminModel.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import './sponsors.css';

const Api = createContext(null);
const Actions = createContext(null);
const PAGE_SIZE = 20;
const TABS = [['overview', '状态概览'], ['config', '配置与权益'], ['plans', '套餐管理'], ['users', '用户与额度'], ['codes', '兑换码'], ['stock', '爱发电库存'], ['batches', '补货对账'], ['audit', '审计记录']];
function useAPI() { return useContext(Api); }
function useActions() { return useContext(Actions); }
function useResource(loader, key = '') {
  const currentLoader = useRef(loader);
  currentLoader.current = loader;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true, error: '' });
    Promise.resolve().then(() => currentLoader.current()).then(data => {
      if (alive) setState({ data, loading: false, error: '' });
    }, error => { if (alive) setState({ data: null, loading: false, error: error.message }); });
    return () => { alive = false; };
  }, [key, revision]);
  return { ...state, reload: () => setRevision(v => v + 1) };
}
function Field({ label, hint, children }) {
  const id = useId();
  return <div className="sa-field"><label htmlFor={id}>{label}</label>{children(id, hint ? `${id}-hint` : undefined)}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>;
}
function Input({ label, hint, value, onChange, ...props }) {
  return <Field label={label} hint={hint}>{(id, describedBy) => <input id={id} aria-describedby={describedBy} value={value ?? ''} onChange={e => onChange(e.target.value)} {...props} />}</Field>;
}
function TextArea({ label, hint, value, onChange, ...props }) {
  return <Field label={label} hint={hint}>{(id, describedBy) => <textarea id={id} aria-describedby={describedBy} rows={3} value={value ?? ''} onChange={e => onChange(e.target.value)} {...props} />}</Field>;
}
function Select({ label, hint, value, onChange, children, ...props }) {
  return <Field label={label} hint={hint}>{(id, describedBy) => <select id={id} aria-describedby={describedBy} value={value ?? ''} onChange={e => onChange(e.target.value)} {...props}>{children}</select>}</Field>;
}
function Check({ label, checked, onChange, ...props }) {
  return <label className="sa-check"><input type="checkbox" checked={checked === true} onChange={e => onChange(e.target.checked)} {...props} /><span>{label}</span></label>;
}
function Reason({ value, onChange }) { return <TextArea label="操作理由（必填）" value={value} onChange={onChange} required maxLength={500} hint="将记录到审计日志；请勿填写令牌、明文兑换码或其他凭据。" />; }
function Button({ children, onClick, type = 'button', danger = false, ...props }) {
  const { busy } = useActions();
  return <button type={type} className={`sa-button${danger ? ' sa-danger' : ''}`} onClick={onClick} {...props} disabled={busy || props.disabled}>{children}</button>;
}
function Panel({ title, children }) { return <section className="sa-panel"><h2>{title}</h2>{children}</section>; }
function Resource({ resource, children }) {
  return <>
    {resource.loading && <p role="status" className="sa-message">正在读取服务器数据…</p>}
    {resource.error && <div role="alert" className="sa-message sa-error"><p>{resource.error}</p><Button onClick={resource.reload}>重新读取</Button></div>}
    {!resource.loading && !resource.error && resource.data && children(resource.data)}
  </>;
}
function Pagination({ offset, total, onChange }) {
  return <nav aria-label="列表分页" className="sa-actions"><span>共 {total} 条 · 第 {Math.floor(offset / PAGE_SIZE) + 1} 页</span><Button disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - PAGE_SIZE))}>上一页</Button><Button disabled={offset + PAGE_SIZE >= total} onClick={() => onChange(offset + PAGE_SIZE)}>下一页</Button></nav>;
}
function PlanSelect({ plans, value, onChange, all = false, includeArchived = false, label = '选择套餐' }) {
  return <Select label={label} value={value} onChange={onChange} required={!all}><option value="">{all ? '全部套餐' : '请选择后端套餐'}</option>{plans.filter(p => includeArchived || p.enabled).map(p => <option key={p.id} value={p.id}>{p.name}{p.enabled ? '' : '（已归档）'}</option>)}</Select>;
}
function State({ value }) { return <span className="sa-badge" data-state={value}>{statusText(value)}</span>; }
function NoItems({ items }) { return !items.length && <p className="sa-message">暂无记录</p>; }
function Summary({ entries }) { return <dl className="sa-summary">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? '—'}</dd></div>)}</dl>; }

export default function SponsorAdmin() {
  const { user, accounts } = useAuth();
  const session = useRef(null);
  const token = accounts?.find(account => String(account.id) === String(user?.id))?.token || '';
  session.current = { id: user?.id, token };
  const api = useMemo(() => createSponsorAdminAPI({ base: import.meta.env.VITE_API_BASE ?? '', getToken: () => token, isCurrentSession: () => session.current?.id === user?.id && session.current?.token === token }), [user?.id, token]);
  const [params] = useSearchParams();
  const requestedTab = params.get('tab');
  const tab = TABS.some(([key]) => key === requestedTab) ? requestedTab : 'overview';
  const [confirmation, setConfirmation] = useState(null);
  const confirmationRef = useRef(null);
  const confirm = text => new Promise(resolve => { confirmationRef.current = resolve; setConfirmation(text); });
  const answer = value => { confirmationRef.current?.(value); confirmationRef.current = null; setConfirmation(null); };
  const [overviewVersion, setOverviewVersion] = useState(0);
  const feedback = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const locked = useRef(false);
  const alive = useRef(true);
  const operations = useRef(operationKeeper());
  useEffect(() => { alive.current = true; session.current = { id: user?.id, token }; return () => { alive.current = false; session.current = null; confirmationRef.current?.(false); }; }, []);
  useEffect(() => {
    const warn = e => { if (locked.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  async function run(task, success = '操作已由服务器确认') {
    if (locked.current) return;
    locked.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const completed = await task();
      if (alive.current && completed !== false) { setMessage(success); setOverviewVersion(v => v + 1); }
    } catch (e) { if (alive.current) setError(e.message || '操作失败，请核查服务器状态'); }
    finally { locked.current = false; if (alive.current) { setBusy(false); requestAnimationFrame(() => feedback.current?.focus()); } }
  }
  async function mutate(key, body, send) {
    const operation_id = operations.current.get(key, body);
    try {
      const data = await send({ ...body, operation_id });
      operations.current.done(key);
      return data;
    } catch (error) {
      if (error.definitive) operations.current.done(key);
      throw error;
    }
  }
  const views = { overview: OverviewTab, config: ConfigTab, plans: PlansTab, users: UsersTab, codes: CodesTab, stock: StockTab, batches: BatchesTab, audit: AuditTab };
  const View = views[tab];
  return <Api.Provider value={api}><Actions.Provider value={{ busy, run, mutate, confirm, overviewVersion }}><div className="sponsor-admin" data-testid="sponsor-admin" aria-busy={busy}>
    <header className="sa-heading"><div><h1>赞助者管理</h1><p>管理权益、套餐与库存。所有数据来自服务器，变更均留存审计。</p></div><span className="sa-badge">管理员 · @{user?.username}</span></header>
    <nav aria-label="赞助者管理栏目" className="sa-tabs">{TABS.map(([key, label]) => <Link key={key} to={`?tab=${key}`} aria-current={tab === key ? 'page' : undefined} aria-disabled={busy || undefined} onClick={e => { if (busy) e.preventDefault(); }} data-testid={`sponsor-tab-${key}`}>{label}</Link>)}</nav>
    <div ref={feedback} tabIndex={-1} className="sa-feedback">
    {busy && <p role="status" className="sa-message">正在处理，请勿重复提交或离开页面…</p>}
    {error && <div role="alert" className="sa-message sa-error">{error}</div>}
    {message && <p role="status" className="sa-message">{message}</p>}
    </div><View />
    {confirmation && <ConfirmDialog text={confirmation} answer={answer} />}
  </div></Actions.Provider></Api.Provider>;
}

function ConfigTab() {
  const api = useAPI();
  const resource = useResource(() => api.config());
  return <Panel title="配置、提示文案与权益"><Resource resource={resource}>{config => <ConfigForm key={config.version} initial={config} reload={resource.reload} />}</Resource></Panel>;
}
function ConfigForm({ initial, reload }) {
  const api = useAPI();
  const { busy, run, confirm } = useActions();
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [section, setSection] = useState('base');
  const [reason, setReason] = useState('');
  const patch = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const patchItem = (list, index, key, value) => setDraft(d => ({ ...d, [list]: d[list].map((item, i) => i === index ? { ...item, [key]: value } : item) }));
  const removeItem = (list, index) => setDraft(d => ({ ...d, [list]: d[list].filter((_, i) => i !== index) }));
  function save(e) {
    e.preventDefault();
    run(async () => {
      const config = validateConfig(draft, initial);
      await api.saveConfig({ config, expected_version: initial.version, reason: reasonText(reason) });
      reload();
    }, '配置已保存，请以重新读取的版本为准');
  }
  const titles = [['center_title', '中心标题'], ['notice_title', '首次须知标题'], ['exhausted_title', '额度耗尽标题'], ['purchase_title', '购买页标题']];
  const bodies = [['notice_body', '首次免费原图须知'], ['exhausted_body', '普通用户额度耗尽文案'], ['sponsor_exhausted_body', '赞助者额度耗尽文案']];
  let preview;
  try { preview = renderTemplate(draft.notice_body, { x: draft.free_daily_limit, y: draft.sponsor_daily_limit, a: '当前剩余额度', reset: '服务器返回的重置时间' }); }
  catch (e) { preview = e.message; }
  return <form noValidate onSubmit={save}><fieldset disabled={busy}>
    <p className="sa-message">当前配置版本 {initial.version}。关闭服务不会伪造权益或本地额度；是否允许操作由服务器决定。</p>
    <div className="sa-sections" aria-label="配置分组">{[['base', '基础设置'], ['copy', '提示与购买'], ['colors', `名称颜色 · ${draft.colors.length}`], ['benefits', `权益 · ${draft.benefits.length}`]].map(([key, label]) => <button type="button" key={key} aria-pressed={section === key} onClick={() => setSection(key)}>{label}</button>)}</div>
    <div hidden={section !== 'base'}><Check label="启用赞助者服务" checked={draft.enabled} onChange={v => patch('enabled', v)} />
    <div className="sa-grid">
      <Input label="普通用户每日额度" type="number" min={0} step={1} value={draft.free_daily_limit} onChange={v => patch('free_daily_limit', v)} required />
      <Input label="赞助者每日额度" type="number" min={0} step={1} value={draft.sponsor_daily_limit} onChange={v => patch('sponsor_daily_limit', v)} required />
      <Input label="最低阅读秒数" type="number" min={5} step={1} value={draft.minimum_read_seconds} onChange={v => patch('minimum_read_seconds', v)} required hint="不能低于 5 秒；客户端仅在前台可见时计时。" />
      <Input label="须知版本" type="number" min={1} step={1} value={draft.notice_version} onChange={v => patch('notice_version', v)} required hint="修改须知后提高版本；旧确认不能替代新须知。" />
      <Input label="额度时区" value={draft.timezone} readOnly onChange={() => {}} />
    </div></div><div hidden={section !== 'copy'}><div className="sa-grid">
      {titles.map(([key, label]) => <Input key={key} label={label} value={draft[key]} onChange={v => patch(key, v)} required />)}
    </div>
    <p className="sa-message">支持占位符 {'{x}'} 普通额度、{'{y}'} 赞助额度、{'{a}'} 剩余额度、{'{reset}'} 重置时间。文案以纯文本显示。</p>
    {bodies.map(([key, label]) => <TextArea key={key} label={label} value={draft[key]} onChange={v => patch(key, v)} required />)}
    <div className="sa-preview"><strong>首次须知预览</strong><p>{preview}</p></div>
    <TextArea label="购买步骤（每行一条）" value={draft.purchase_steps.join('\n')} onChange={v => patch('purchase_steps', v.split('\n'))} required />
    </div><div hidden={section !== 'colors'}><h3>用户名称颜色</h3>
    <Select label="默认颜色" value={draft.default_color_key} onChange={v => patch('default_color_key', v)} required><option value="">请选择现有颜色</option>{draft.colors.map((c, i) => <option key={i} value={c.key}>{c.name || c.key}</option>)}</Select>
    {draft.colors.map((color, index) => <fieldset className="sa-subpanel" key={index}><legend>颜色 {index + 1}</legend><div className="sa-grid">
      <Input label="颜色标识" value={color.key} onChange={v => patchItem('colors', index, 'key', v)} required />
      <Input label="颜色名称" value={color.name} onChange={v => patchItem('colors', index, 'name', v)} required />
      {['light', 'dark'].map(mode => <Input key={mode} type="text" style={{ borderInlineStart: `8px solid ${/^#[0-9a-f]{6}$/i.test(color[mode]) ? color[mode] : 'var(--border)'}` }} label={mode === 'light' ? '浅色主题色值' : '深色主题色值'} value={color[mode]} pattern="#[0-9a-fA-F]{6}" onChange={v => patchItem('colors', index, mode, v)} required />)}
    </div><Check label="仅永久赞助者可选" checked={color.permanent_only} onChange={v => patchItem('colors', index, 'permanent_only', v)} /><Button danger onClick={async () => { if (await confirm(`移除颜色「${color.name || color.key}」？保存配置后生效。`)) removeItem('colors', index); }}>移除此颜色</Button></fieldset>)}
    <Button onClick={() => patch('colors', [...draft.colors, { key: '', name: '', light: '', dark: '', permanent_only: false }])}>添加颜色</Button>
    </div><div hidden={section !== 'benefits'}><h3>权益内容</h3>
    {draft.benefits.map((benefit, index) => <fieldset className="sa-subpanel" key={index}><legend>权益 {index + 1}</legend><div className="sa-grid">
      <Input label="权益标识" value={benefit.id} onChange={v => patchItem('benefits', index, 'id', v)} required />
      <Input label="权益标题" value={benefit.title} onChange={v => patchItem('benefits', index, 'title', v)} required />
      <Select label="权益状态" value={benefit.status} onChange={v => patchItem('benefits', index, 'status', v)}><option value="automatic">自动生效</option><option value="available">可使用</option><option value="coming_soon">即将推出</option></Select>
      <Select label="权益操作" value={benefit.action} onChange={v => patchItem('benefits', index, 'action', v)}><option value="none">无操作</option><option value="color">名称颜色</option><option value="original">原图</option><option value="claim">领取权益</option></Select>
      <Input label="权益排序" type="number" step={1} value={benefit.sort_order} onChange={v => patchItem('benefits', index, 'sort_order', v)} required />
    </div><TextArea label="权益说明" value={benefit.description} onChange={v => patchItem('benefits', index, 'description', v)} required /><Button danger onClick={async () => { if (await confirm(`移除权益「${benefit.title || benefit.id}」？保存配置后生效。`)) removeItem('benefits', index); }}>移除此权益</Button></fieldset>)}
    <Button onClick={() => patch('benefits', [...draft.benefits, { id: '', title: '', description: '', status: 'coming_soon', action: 'none', sort_order: 0 }])}>添加权益</Button>
    </div><div className="sa-savebar"><Reason value={reason} onChange={setReason} />
    <div className="sa-actions"><Button type="submit">保存全部配置</Button><Button onClick={async () => { if (await confirm('重新读取将丢弃未保存的配置，是否继续？')) reload(); }}>放弃草稿并重新读取</Button></div></div>
  </fieldset></form>;
}

function PlansTab() {
  const api = useAPI();
  const resource = useResource(() => api.plans());
  const [editing, setEditing] = useState(null);
  return <Panel title="套餐管理"><p className="sa-message">以元输入价格，保存时精确转换为分；编辑产生新版本，不改变旧兑换码权益快照。归档代替删除，保留历史。</p><Resource resource={resource}>{({ items }) => <>
    <div className="sa-actions"><Button onClick={() => setEditing({ id: '', version: 1, name: '', description: '', price_minor: '', currency: 'CNY', duration_unit: '', duration_count: '', purchase_url: '', afdian_plan_id: '', afdian_sku_id: '', enabled: false, sort_order: 0, creating: true })}>创建套餐</Button><Button onClick={() => { setEditing(null); resource.reload(); }}>重新读取套餐</Button></div>
    <NoItems items={items} /><div className="sa-cards">{items.map(plan => <article className="sa-subpanel" key={plan.id}><h3>{plan.name}</h3><Summary entries={[
      ['标识 / 版本', `${plan.id} / ${plan.version}`], ['价格', formatPrice(plan.price_minor, plan.currency)], ['时长', plan.duration_unit === 'permanent' ? '永久有效' : `${plan.duration_count} ${({ day: '天', month: '月' })[plan.duration_unit] || '未知单位'}`], ['状态', plan.enabled ? '上架' : '归档'],
    ]} /><p>{plan.description}</p><Button onClick={() => setEditing({ ...plan, creating: false })}>编辑 / 归档 {plan.name}</Button></article>)}</div>
    {editing && <PlanForm key={`${editing.id}-${editing.version}-${editing.creating}`} initial={editing} close={() => setEditing(null)} saved={() => { setEditing(null); resource.reload(); }} />}
  </>}</Resource></Panel>;
}
function PlanForm({ initial, close, saved }) {
  const api = useAPI();
  const { busy, run, confirm } = useActions();
  const [draft, setDraft] = useState(initial);
  const [price, setPrice] = useState(initial.price_minor === '' ? '' : (initial.price_minor / 100).toFixed(2));
  const [reason, setReason] = useState('');
  const patch = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  function save(e) {
    e.preventDefault();
    run(async () => {
      const { creating: _creating, ...values } = draft;
      const plan = validatePlan({ ...values, price_minor: parsePrice(price) });
      const body = { plan, reason: reasonText(reason) };
      if (initial.enabled && !plan.enabled && !await confirm(`确认归档「${initial.name}」？历史权益不会被删除。`)) return false;
      if (initial.creating) await api.createPlan(body);
      else await api.updatePlan(initial.id, { ...body, expected_version: initial.version });
      saved();
    }, '套餐已保存');
  }
  return <form className="sa-subpanel" onSubmit={save}><h3>{initial.creating ? '创建套餐' : `编辑套餐 · 版本 ${initial.version}`}</h3><fieldset disabled={busy}><div className="sa-grid">
    <Input label="套餐标识" value={draft.id} onChange={v => patch('id', v)} readOnly={!initial.creating} required />
    <Input label="套餐名称" value={draft.name} onChange={v => patch('name', v)} required />
    <Input label="价格（元 / CNY）" inputMode="decimal" value={price} onChange={setPrice} required hint="最多两位小数；不会四舍五入更改价格。" />
    <Input label="币种" value={draft.currency} readOnly onChange={() => {}} />
    <Select label="时长单位" value={draft.duration_unit} onChange={v => setDraft(d => ({ ...d, duration_unit: v, duration_count: v === 'permanent' ? 0 : d.duration_unit === 'permanent' ? '' : d.duration_count }))} required><option value="">请选择</option><option value="day">天</option><option value="month">月</option><option value="permanent">永久</option></Select>
    <Input label="时长数量（永久为 0）" readOnly={draft.duration_unit === 'permanent'} type="number" min={0} step={1} value={draft.duration_count} onChange={v => patch('duration_count', v)} required />
    <Input label="爱发电商品标识" value={draft.afdian_plan_id} onChange={v => patch('afdian_plan_id', v)} />
    <Input label="爱发电规格标识" value={draft.afdian_sku_id} onChange={v => patch('afdian_sku_id', v)} />
    <Input label="排序" type="number" step={1} value={draft.sort_order} onChange={v => patch('sort_order', v)} required />
  </div><TextArea label="套餐说明" value={draft.description} onChange={v => patch('description', v)} /><TextArea label="购买链接" value={draft.purchase_url} onChange={v => patch('purchase_url', v)} hint="购买链接及两个映射可同时留空。填写时仅允许 HTTPS ifdian.net/order/create，商品与规格必须匹配；保存时后端再次验证。" />
  <Check label="上架套餐（取消即归档）" checked={draft.enabled} onChange={v => patch('enabled', v)} />
  <Reason value={reason} onChange={setReason} /><div className="sa-actions"><Button type="submit">保存套餐</Button><Button onClick={close}>取消编辑</Button></div>
  </fieldset></form>;
}

function UsersTab() {
  const api = useAPI();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null);
  const resource = useResource(() => api.users({ q: query, limit: PAGE_SIZE, offset }), `${query}/${offset}`);
  const plans = useResource(() => api.plans());
  return <Panel title="用户身份与今日额度"><form className="sa-search" onSubmit={e => { e.preventDefault(); setOffset(0); setQuery(q.trim()); setSelected(null); resource.reload(); }}><Input label="搜索用户" value={q} onChange={setQ} maxLength={120} /><Button type="submit">搜索用户</Button></form>
    <Resource resource={resource}>{({ items, total }) => <><NoItems items={items} /><div className="sa-cards">{items.map(user => <article key={user.id} className="sa-subpanel"><h3>@{user.username}</h3><Summary entries={[
      ['用户标识', user.id], ['身份', user.sponsor?.active ? (user.sponsor.permanent ? '永久赞助者' : '有效赞助者') : '普通用户'], ['当前套餐', user.sponsor?.plan_name], ['到期时间（上海）', user.sponsor?.permanent ? '永久有效' : formatTime(user.sponsor?.expires_at)],
    ]} /><Button onClick={() => setSelected(user)}>管理 @{user.username}</Button></article>)}</div><Pagination offset={offset} total={total} onChange={v => { setOffset(v); setSelected(null); }} /></>}</Resource>
    {selected && <Resource resource={plans}>{({ items }) => <UserForm key={selected.id} user={selected} plans={items} refresh={resource.reload} />}</Resource>}
  </Panel>;
}
function UserForm({ user, plans, refresh }) {
  const api = useAPI();
  const { busy, run, mutate, confirm } = useActions();
  const details = useResource(() => api.user(user.id), user.id);
  const [action, setAction] = useState('grant');
  const [planId, setPlanId] = useState('');
  const [adjustment, setAdjustment] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState(null);
  function submit(e) {
    e.preventDefault();
    run(async () => {
      const body = { reason: reasonText(reason) };
      if (action === 'grant') body.plan_id = required(planId, '套餐');
      if (action === 'quota') {
        body.adjustment = integer(adjustment, '额度调整', -100000, 100000);
        if (!body.adjustment) throw new Error('额度调整不能为 0');
      }
      const label = ({ grant: '授予所选套餐', revoke: '撤销赞助者身份', quota: '调整今日额外额度' })[action];
      if (!await confirm(`确认对 @${user.username}（${user.id}）${label}？${action === 'revoke' ? '不删除历史记录。' : ''}`)) return false;
      const data = await mutate(`user:${user.id}:${action}`, body, payload => api[action](user.id, payload));
      setResult(data); setReason(''); details.reload(); refresh();
    }, '用户操作已确认；下方显示服务器返回的最新身份与今日额度');
  }
  return <form className="sa-subpanel" onSubmit={submit}><h3>管理 @{user.username} · {user.id}</h3><Resource resource={details}>{data => <UserSummary data={data} />}</Resource><fieldset disabled={busy}>
    <Select label="用户操作" value={action} onChange={setAction}><option value="grant">授予套餐 / 延长</option><option value="revoke">撤销赞助者身份</option><option value="quota">调整今日额外额度</option></Select>
    {action === 'grant' && <PlanSelect plans={plans} value={planId} onChange={setPlanId} />}
    {action === 'quota' && <Input label="今日额度增量" type="number" step={1} value={adjustment} onChange={setAdjustment} required hint="正数增加、负数减少；不是重置已使用次数。" />}
    <Reason value={reason} onChange={setReason} /><Button type="submit" danger={action === 'revoke'}>确认用户操作</Button>
  </fieldset>{result && <Summary entries={[
    ['返回身份', result.sponsor.active ? (result.sponsor.permanent ? '永久赞助者' : '有效赞助者') : '普通用户'], ['到期时间（上海）', result.sponsor.permanent ? '永久有效' : formatTime(result.sponsor.expires_at)], ['今日上限', result.quota.limit], ['已使用', result.quota.used], ['剩余', result.quota.remaining], ['重置时间（上海）', formatTime(result.quota.resets_at)],
  ]} />}</form>;
}

function CodesTab() {
  const api = useAPI();
  const [filter, setFilter] = useState({ plan_id: '', state: '', q: '' });
  const [query, setQuery] = useState(filter);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null);
  const [batchId, setBatchId] = useState('');
  const plans = useResource(() => api.plans());
  const resource = useResource(() => api.codes({ ...query, offset, limit: PAGE_SIZE }), JSON.stringify([query, offset]));
  return <><Panel title="生成与导出兑换码"><details className="sa-disclosure"><summary>展开生成批次与敏感文件导出</summary><Resource resource={plans}>{({ items }) => <CreateBatchForm plans={items} created={id => { setBatchId(id); resource.reload(); }} />}</Resource><ExportForm batchId={batchId} setBatchId={setBatchId} /></details></Panel>
    <Panel title="兑换码检索与状态"><Resource resource={plans}>{({ items: allPlans }) => <form className="sa-search" onSubmit={e => { e.preventDefault(); setOffset(0); setQuery(filter); setSelected(null); resource.reload(); }}>
      <PlanSelect plans={allPlans} value={filter.plan_id} onChange={v => setFilter(f => ({ ...f, plan_id: v }))} all includeArchived />
      <Select label="兑换码状态" value={filter.state} onChange={v => setFilter(f => ({ ...f, state: v }))}><option value="">全部状态</option>{['active', 'disabled', 'expired', 'redeemed'].map(s => <option key={s} value={s}>{statusText(s)}</option>)}</Select>
      <Input label="完整兑换码（精确匹配，可空）" type="password" spellCheck={false} value={filter.q} onChange={v => setFilter(f => ({ ...f, q: v }))} maxLength={128} autoComplete="off" hint="仅支持完整码匹配，不支持片段或批次搜索。查询不会写入页面地址或本地存储；请勿分享包含请求参数的网络记录。" /><Button type="submit">查询兑换码</Button>
    </form>}</Resource><Resource resource={resource}>{({ items, total }) => <><NoItems items={items} /><div className="sa-cards">{items.map(code => <article className="sa-subpanel" key={code.id}><h3>{code.masked_code}</h3><State value={code.state} /><Summary entries={[
      ['记录标识', code.id], ['套餐', code.plan_name], ['批次', code.batch_id], ['到期', formatTime(code.expires_at)], ['兑换时间', formatTime(code.redeemed_at)], ['兑换用户', code.redeemed_by],
    ]} /><div className="sa-actions"><Button disabled={!['active', 'disabled', 'expired'].includes(code.state)} onClick={() => setSelected(code)}>管理状态</Button><Button onClick={() => setBatchId(code.batch_id)}>选择此批次导出</Button></div></article>)}</div><Pagination offset={offset} total={total} onChange={v => { setOffset(v); setSelected(null); }} /></>}</Resource>
    {selected && <CodeStateForm key={selected.id} code={selected} saved={() => { setSelected(null); resource.reload(); }} />}</Panel></>;
}
function CreateBatchForm({ plans, created }) {
  const api = useAPI();
  const { busy, run, mutate, confirm } = useActions();
  const [planId, setPlanId] = useState('');
  const [count, setCount] = useState('1');
  const [expires, setExpires] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState(null);
  return <form onSubmit={e => { e.preventDefault(); run(async () => {
    const body = { plan_id: required(planId, '套餐'), count: integer(count, '生成数量', 1, 200), reason: reasonText(reason) };
    const expires_at = expirySeconds(expires);
    if (expires_at !== undefined) body.expires_at = expires_at;
    if (!await confirm(`确认生成 ${body.count} 个兑换码？批次权益以当前服务器套餐版本为准。`)) return false;
    const data = await mutate('create-batch', body, api.createBatch);
    setResult(data); setReason(''); created(data.id);
  }, '兑换码批次已生成；明文仅通过下方明确导出操作下载'); }}><fieldset disabled={busy}><div className="sa-grid">
    <PlanSelect plans={plans} value={planId} onChange={setPlanId} /><Input label="生成数量" type="number" min={1} max={200} step={1} value={count} onChange={setCount} required />
    <Input label="兑换截止时间（可空，浏览器本地时间）" type="datetime-local" value={expires} onChange={setExpires} />
  </div><Reason value={reason} onChange={setReason} /><Button type="submit">生成兑换码批次</Button></fieldset>{result && <p role="status" className="sa-message">批次 {result.id} · {result.count} 个。请妥善记录批次标识。</p>}</form>;
}
function ExportForm({ batchId, setBatchId }) {
  const api = useAPI();
  const { busy, run, confirm } = useActions();
  const [reason, setReason] = useState('');
  return <form className="sa-subpanel" onSubmit={e => { e.preventDefault(); run(async () => {
    const id = identifier(batchId, '批次标识');
    const body = { reason: reasonText(reason) };
    if (!await confirm(`确认导出批次 ${id} 的明文兑换码？下载文件属于敏感数据，请安全保存；此操作将记录审计。`)) return false;
    const result = await api.exportBatch(id, body);
    downloadCodes(result);
    setReason('');
  }, '已触发敏感文件下载，请检查浏览器下载记录并安全保管；页面不保留明文'); }}><h3>管理员明确点击后导出</h3><fieldset disabled={busy}>
    <Input label="导出批次标识" value={batchId} onChange={setBatchId} required autoComplete="off" /><Reason value={reason} onChange={setReason} /><Button type="submit" danger>导出明文兑换码文件</Button>
  </fieldset></form>;
}
function CodeStateForm({ code, saved }) {
  const api = useAPI();
  const { busy, run, confirm } = useActions();
  const [reason, setReason] = useState('');
  const disabled = code.state !== 'disabled';
  return <form className="sa-subpanel" onSubmit={e => { e.preventDefault(); run(async () => {
    const body = { disabled, reason: reasonText(reason) };
    if (!await confirm(`确认${disabled ? '停用' : '恢复'} ${code.masked_code}？已兑换记录不能恢复，过期时间不变。`)) return false;
    await api.codeState(code.id, body); saved();
  }, '兑换码状态已更新'); }}><h3>{disabled ? '停用' : '恢复'} {code.masked_code}</h3><fieldset disabled={busy}><Reason value={reason} onChange={setReason} /><Button type="submit" danger={disabled}>确认更改状态</Button></fieldset></form>;
}

function StockTab() {
  const api = useAPI();
  const resource = useResource(() => api.stock());
  const plans = useResource(() => api.plans());
  return <Panel title="爱发电库存设置"><p className="sa-message">凭据仅在服务端环境配置；此页面不接受用户 ID、令牌、密钥或部署验证开关。先只读检查，再受控单条试补货，服务器验证后才可独立启用自动补货。商品库存不等于兑换码池库存。</p>
    <Button onClick={resource.reload}>重新读取库存状态</Button><Resource resource={resource}>{({ credentials, items }) => <>
      <h3>部署能力（只读）</h3><Summary entries={[
        ['用户 ID', credentials?.user_id_configured === true ? '已配置' : '未配置'], ['API 令牌', credentials?.token_configured === true ? '已配置' : '未配置'], ['兑换码加密密钥', credentials?.code_key_configured === true ? '已配置' : '未配置'],
        ['池读取契约能力', credentials?.pool_contract_verified === true ? '已验证' : '未验证'], ['追加写入契约能力', credentials?.append_contract_verified === true ? '已验证' : '未验证'],
      ]} /><Resource resource={plans}>{({ items: allPlans }) => <><NoItems items={items} />{items.map(setting => <StockForm key={`${setting.plan_id}:${setting.last_checked_at}:${setting.verification_status}`} initial={setting} plan={allPlans.find(p => p.id === setting.plan_id)} reload={resource.reload} />)}</>}</Resource>
    </>}</Resource>
  </Panel>;
}
function StockForm({ initial, plan, reload }) {
  const api = useAPI();
  const { busy, run, mutate, confirm } = useActions();
  const [draft, setDraft] = useState(initial);
  const [reason, setReason] = useState('');
  const [count, setCount] = useState('1');
  const [uncertain, setUncertain] = useState(false);
  const [result, setResult] = useState(null);
  const patch = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const verification = ({ unchecked: '未检查', read_verified: '只读检查已验证', write_verified: '写入已验证', failed: '验证失败' })[initial.verification_status] || '未知验证状态';
  async function check() {
    await api.checkStock(initial.plan_id, { reason: reasonText(reason) }); reload();
  }
  async function refill() {
    const body = { reason: reasonText(reason), count: initial.verified ? integer(count, '补货数量', 1, Math.min(200, initial.batch_size)) : 1 };
    if (initial.can_refill !== true) throw new Error('服务器尚未允许受控补货，请先检查验证状态');
    if (!await confirm(`确认向「${plan?.name || initial.plan_id}」追加 ${body.count} 条兑换码？这是外部写入。网络中断、结果未知时不要再次补货，应先对账。`)) return false;
    try {
      const data = await mutate(`refill:${initial.plan_id}`, body, payload => api.refill(initial.plan_id, payload));
      setResult(data); setUncertain(data.state !== 'confirmed' && data.state !== 'rejected');
      if (data.state === 'confirmed') reload();
    } catch (e) { setUncertain(true); throw e; }
  }
  return <details className="sa-subpanel sa-disclosure"><summary>{plan?.name || initial.plan_id} · {verification} · {initial.paused ? '已暂停' : initial.enabled ? '自动补货已开启' : '自动补货未开启'}</summary><Summary entries={[
    ['套餐价格', plan ? formatPrice(plan.price_minor, plan.currency) : '—'], ['商品 / 规格', plan ? `${plan.afdian_plan_id} / ${plan.afdian_sku_id}` : '—'], ['允许手动补货', initial.can_refill === true ? '是' : '否'], ['允许自动补货', initial.can_enable === true ? '是' : '否'], ['写入已验证（只读）', initial.verified ? '是' : '否'], ['自动补货', initial.enabled ? '已启用' : '未启用'], ['服务端验证', verification], ['暂停', initial.paused ? '是' : '否'], ['可信池库存', initial.last_stock], ['观察到的行数（不等于可信库存）', initial.observed_line_count], ['商品库存（不可用于补货计算）', initial.product_stock], ['上次检查', formatTime(initial.last_checked_at)], ['下次检查', formatTime(initial.next_check_at)],
  ]} />
  <p className="sa-message">{initial.verification_message || '尚无验证说明，请执行只读检查。'}</p>{initial.last_error && <p role="alert" className="sa-message sa-error">{initial.last_error}</p>}
  {uncertain && <p role="alert" className="sa-message sa-error">补货结果尚未确定，本页面已停止再次发送。请到「补货对账」读取批次并核查；不存在于池中不代表失败。</p>}
  {result && <p role="status">批次 {result.batch_id} · {statusText(result.state)}</p>}
  <form onSubmit={e => { e.preventDefault(); run(async () => {
    const setting = validateStock(draft);
    if (!initial.enabled && setting.enabled && initial.can_enable !== true) throw new Error('必须完成服务器验证才能启用自动补货');
    if (setting.enabled && !initial.enabled && !await confirm('确认启用此套餐的自动补货？此开关不替代独立的服务器验证。')) return false;
    await api.saveStock(initial.plan_id, { setting, reason: reasonText(reason) }); reload();
  }, '库存设置已保存'); }}><fieldset disabled={busy}><div className="sa-grid">
    {[["low_water", '低水位', 0], ['target_stock', '目标库存', 1], ['batch_size', '单批数量', 1], ['check_interval_seconds', '检查间隔（秒）', 300]].map(([key, label, min]) => <Input key={key} label={label} type="number" step={1} min={min} max={key === 'check_interval_seconds' ? 86400 : key === 'low_water' ? 199 : 200} value={draft[key]} onChange={v => patch(key, v)} required />)}
  </div><Check label="启用自动补货（仅服务器验证通过后可选）" checked={draft.enabled} onChange={v => patch('enabled', v)} disabled={!initial.enabled && initial.can_enable !== true} />
  <Reason value={reason} onChange={setReason} /><div className="sa-actions"><Button type="submit">保存库存设置</Button><Button onClick={() => run(check, '只读检查已完成，请查看服务器证据与验证说明')}>只读检查</Button></div>
  <Input label="手动补货数量" type="number" min={1} max={initial.verified ? Math.min(200, initial.batch_size) : 1} step={1} value={initial.verified ? count : '1'} onChange={setCount} readOnly={!initial.verified} hint={initial.can_refill ? '不得超过单批数量及目标库存剩余空间。' : '补货暂不可用：请查看上方服务器验证说明；先完成只读检查，不能绕过部署能力或未确认批次。'} />
  {!initial.verified && <p className="sa-message">首次受控试补货固定为 1 条；只有服务器获取正向证据后才会标记写入验证通过。</p>}
  <Button danger onClick={() => run(refill, '补货请求已返回，请核查批次状态；返回不等于已经确认入池')} disabled={initial.can_refill !== true || uncertain}>{initial.verified ? '确认手动补货' : '受控试补货（1 条）'}</Button>
  </fieldset></form></details>;
}

function BatchesTab() {
  const api = useAPI();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState(null);
  const resource = useResource(() => api.stockBatches({ limit: PAGE_SIZE, offset }), offset);
  return <Panel title="补货批次与对账"><p className="sa-message">未知、部分完成、发送中都不能当作失败重放。对账只接受剩余池行或官方订单的正向证据；缺失不等于失败。未知新增状态只展示并交由人工核查。</p>
    <Button onClick={resource.reload}>重新读取补货批次</Button><Resource resource={resource}>{({ items, total }) => <><NoItems items={items} /><div className="sa-cards">{items.map(batch => <article key={batch.id} className="sa-subpanel"><h3>批次 {batch.id}</h3><State value={batch.state} /><Summary entries={[
      ['套餐标识', batch.plan_id], ['兑换码批次', batch.code_batch_id], ['数量', batch.count], ['创建时间', formatTime(batch.created_at)],
    ]} />{batch.last_error && <p className="sa-message sa-error">{batch.last_error}</p>}<Button onClick={() => setSelected(batch)}>核查此批次</Button></article>)}</div><Pagination offset={offset} total={total} onChange={v => { setOffset(v); setSelected(null); }} /></>}</Resource>
    {selected && <ReconcileForm key={selected.id} batch={selected} reload={resource.reload} />}
  </Panel>;
}
function ReconcileForm({ batch, reload }) {
  const api = useAPI();
  const { busy, run, confirm } = useActions();
  const [orders, setOrders] = useState('');
  const [reason, setReason] = useState('');
  const [result, setResult] = useState(null);
  return <form className="sa-subpanel" onSubmit={e => { e.preventDefault(); run(async () => {
    const body = { reason: reasonText(reason) };
    const values = orders.split('\n').map(v => v.trim()).filter(Boolean);
    if (values.length > 200) throw new Error('单次最多填写 200 个订单号');
    if (values.length) body.out_trade_nos = [...new Set(values.map(v => required(v, '订单号', 128)))];
    if (!await confirm(`确认对账批次 ${batch.id}？只核查证据，不重新追加兑换码。`)) return false;
    const data = await api.reconcile(batch.id, body); setResult(data); reload();
  }, '对账请求已返回，请以批次状态为准；未知结果仍需人工核查'); }}><h3>核查批次 {batch.id}</h3><fieldset disabled={busy}>
    <TextArea label="官方订单号（可选，每行一个）" value={orders} onChange={setOrders} autoComplete="off" hint="仅填写待核查订单号，不要填写兑换码或凭据。" /><Reason value={reason} onChange={setReason} /><Button type="submit">执行对账，不重试追加</Button>
  </fieldset>{result && <p role="status">批次 {result.batch_id} · {statusText(result.state)}</p>}</form>;
}
function AuditTab() {
  const api = useAPI();
  const [offset, setOffset] = useState(0);
  const resource = useResource(() => api.audit({ offset, limit: PAGE_SIZE }), offset);
  return <Panel title="赞助者管理审计"><Button onClick={resource.reload}>重新读取审计</Button><Resource resource={resource}>{({ items, total }) => <><NoItems items={items} /><div className="sa-cards">{items.map(item => <article className="sa-subpanel" key={item.id}><h3>{item.action}</h3><Summary entries={[
    ['记录标识', item.id], ['管理员', item.actor_id], ['目标用户', item.user_id], ['时间（上海）', formatTime(item.created_at)],
  ]} /><p className="sa-reason">{item.reason}</p></article>)}</div><Pagination offset={offset} total={total} onChange={setOffset} /></>}</Resource></Panel>;
}

function ConfirmDialog({ text, answer }) {
  const ref = useRef(null);
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="sa-dialog" aria-labelledby={titleId} aria-describedby={bodyId} onCancel={e => { e.preventDefault(); answer(false); }}>
    <h2 id={titleId}>确认此项操作</h2><p id={bodyId}>{text}</p><p className="sa-muted">请核对目标与影响。取消不会发送请求。</p>
    <div className="sa-actions"><button className="sa-button" type="button" autoFocus onClick={() => answer(false)}>取消，返回检查</button><button className="sa-button sa-danger" type="button" onClick={() => answer(true)}>确认继续</button></div>
  </dialog>;
}
function UserSummary({ data }) {
  return <Summary entries={[
    ['当前身份', data.sponsor.active ? (data.sponsor.permanent ? '永久赞助者' : '有效赞助者') : '普通用户'],
    ['到期时间（上海）', data.sponsor.permanent ? '永久有效' : formatTime(data.sponsor.expires_at)],
    ['今日额度上限', data.quota.limit], ['已使用', data.quota.used], ['剩余额度', data.quota.remaining], ['重置时间（上海）', formatTime(data.quota.resets_at)],
  ]} />;
}
function OverviewTab() {
  const api = useAPI();
  const { overviewVersion } = useActions();
  const config = useResource(() => api.config(), overviewVersion);
  const plans = useResource(() => api.plans(), overviewVersion);
  const stock = useResource(() => api.stock(), overviewVersion);
  return <>
    <Panel title="服务状态"><Resource resource={config}>{data => <>
      <div className="sa-overview"><Summary entries={[
        ['赞助者服务', data.enabled ? '已启用' : '未启用'], ['配置版本', `v${data.version}`], ['普通用户每日额度', data.free_daily_limit], ['赞助者每日额度', data.sponsor_daily_limit],
      ]} /></div><p className="sa-muted">{data.timezone} · 每日零点重置 · 须知 v{data.notice_version}。数值均为服务器当前配置。</p>
      {!data.enabled && <p className="sa-message">服务当前关闭。配置与核查仍可进行，权益发放及外部补货以服务器门禁为准。</p>}
      <Link className="sa-quicklink" to="?tab=config">调整配置与提示文案</Link>
    </>}</Resource></Panel>
    <div className="sa-cards"><Panel title="套餐与权益"><Resource resource={plans}>{({ items }) => <><Summary entries={[
      ['上架套餐', items.filter(p => p.enabled).length], ['归档套餐', items.filter(p => !p.enabled).length],
    ]} /><Link className="sa-quicklink" to="?tab=plans">管理套餐与价格</Link></>}</Resource></Panel>
    <Panel title="库存准备情况"><Resource resource={stock}>{({ items }) => <><Summary entries={[
      ['写入已验证', items.filter(s => s.verified).length], ['已暂停', items.filter(s => s.paused).length], ['自动补货已启用', items.filter(s => s.enabled).length],
    ]} /><Link className="sa-quicklink" to="?tab=stock">查看证据与补货门禁</Link></>}</Resource></Panel></div>
    <p className="sa-message">建议流程：配置与套餐 → 只读检查 → 单条试补货 → 正向证据对账 → 独立启用自动补货。结果未知时不要重发。</p>
  </>;
}
