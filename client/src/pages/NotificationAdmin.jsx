import { useCallback, useEffect, useRef, useState } from 'react';
import { adminPushAPI } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Card, Empty, ErrorBox, FormField, Loading, Pill, StatCard } from './admin/ui';
import './NotificationAdmin.css';

const blankResource = () => ({ data: null, loading: true, error: '' });
const count = value => Number.isSafeInteger(value) && value >= 0 ? String(value) : '未提供';
const platformName = value => ({ all: '全部可用平台', web: 'Web Push', jpush: '极光推送' })[value] || '未知平台';
const formDefaults = () => ({ platform: 'all', targetType: 'user', targetIds: '', title: '', body: '', url: '/notifications' });

export function parsePushTargetIds(input) {
  const values = input.split(/[,，\s]+/).filter(Boolean);
  if (!values.length || values.some(value => !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) throw new Error('请填写正整数用户 ID，可用逗号或空格分隔；不会忽略无效 ID。');
  return [...new Set(values.map(Number))];
}
export function PushResource({ resource, onRetry, children, loadingText = '正在读取…' }) {
  return <>{resource.loading && <Loading text={resource.data === null ? loadingText : '正在刷新，以下为上次成功读取的快照…'} />}{resource.error && <div className="ac-push-feedback"><ErrorBox msg={resource.error} /><button type="button" className="ac-btn" onClick={onRetry}>重试本模块</button></div>}{resource.data !== null && children}</>;
}

export function PushCapabilities({ resource, stats, onRetry, onStatsRetry }) {
  const platforms = resource.data;
  return <Card title="推送能力与概览" description="配置状态不代表已验证可达；本页永不展示 AppKey、密钥或令牌。" icon="fa-server">
    <PushResource resource={resource} onRetry={onRetry} loadingText="正在读取推送能力…"><div className="ac-form-grid">{[
      ['Web Push（VAPID）', platforms?.vapidConfigured], ['极光推送', platforms?.jpushEnabled],
    ].map(([label, enabled]) => <div className="ac-platform-row" key={label}><span className="ac-grow">{label}</span><Pill tone={enabled === true ? 'green' : 'slate'}>{enabled === true ? '已配置 / 启用（未实测）' : enabled === false ? '未配置 / 未启用' : '状态未提供'}</Pill></div>)}</div></PushResource>
    <PushResource resource={stats} onRetry={onStatsRetry} loadingText="正在读取推送统计…"><div className="ac-stat-grid">{[['Web 订阅', 'web_count', 'blue'], ['JPush 订阅', 'jpush_count', 'violet'], ['今日发送', 'today_sent', 'green'], ['今日失败', 'today_failed', 'red']].map(([label, key, tone]) => <StatCard compact key={key} label={label} value={count(stats.data?.[key])} tone={tone} />)}</div></PushResource>
  </Card>;
}

export function PushComposer({ form, platforms, sending, error, notice, confirmation, result, testId, onChange, onTestId, onPrepareSend, onPrepareTest, onConfirm, onCancel }) {
  const capabilities = platforms.data;
  const capabilityReady = !platforms.loading && !platforms.error && !!capabilities;
  const selectedReady = capabilityReady && (form.platform === 'web' ? capabilities.vapidConfigured === true : form.platform === 'jpush' ? capabilities.jpushEnabled === true : capabilities.vapidConfigured === true || capabilities.jpushEnabled === true);
  const busy = sending || !!confirmation;
  return <Card title="通知草稿与接收范围" description="没有自动发送。发送与测试都需要先核对，再显式确认；刷新数据不会清空输入。" icon="fa-paper-plane">
    <fieldset className="ac-push-fieldset" disabled={busy}>
      <div className="ac-form-grid ac-form-grid-2"><FormField label="推送平台" htmlFor="push-platform"><select id="push-platform" className="ac-select" value={form.platform} onChange={event => onChange({ platform: event.target.value })}><option value="all">全部可用平台</option><option value="web">Web Push</option><option value="jpush">极光推送</option></select></FormField><FormField label="接收范围" htmlFor="push-target-type"><select id="push-target-type" className="ac-select" value={form.targetType} onChange={event => onChange({ targetType: event.target.value })}><option value="user">指定用户</option><option value="all">全部用户（高影响）</option></select></FormField></div>
      {form.targetType === 'user' ? <FormField label="用户 ID" required hint="正整数，用中英文逗号或空格分隔，自动去重；无效 ID 阻止发送。" htmlFor="push-target-ids"><input id="push-target-ids" className="ac-input" autoComplete="off" value={form.targetIds} onChange={event => onChange({ targetIds: event.target.value })} /></FormField> : <p className="ac-section-note" role="status">将发送给全部用户，不能撤回；下方确认前不会发送。已有指定用户草稿被保留，不会用于群发。</p>}
      <FormField label="通知标题" required htmlFor="push-title"><input id="push-title" className="ac-input" value={form.title} onChange={event => onChange({ title: event.target.value })} /></FormField>
      <FormField label="通知内容" required htmlFor="push-body"><textarea id="push-body" className="ac-textarea" rows={4} value={form.body} onChange={event => onChange({ body: event.target.value })} /></FormField>
      <details className="ac-push-details"><summary>跳转路径与发送边界</summary><FormField label="跳转路径" hint="只允许以 / 开头的站内路径，留空使用 /notifications。" htmlFor="push-url"><input id="push-url" className="ac-input" value={form.url} onChange={event => onChange({ url: event.target.value })} /></FormField><p className="ac-section-note">配置状态不是可达性保证。全部平台仅使用服务器当前可用通道；发送计数不等于客户端实际收到。</p></details>
      {!selectedReady && <p className="ac-section-note">{platforms.loading ? '能力尚在读取，暂不可发送。' : platforms.error ? '能力读取失败，请在概览重试后发送。' : '所选平台未配置、未启用或状态未知，暂不可发送。'}</p>}
      <button type="button" className="ac-btn primary" disabled={!selectedReady} onClick={onPrepareSend}>核对通知并准备发送</button>
    </fieldset>
    <details className="ac-push-details"><summary>单用户测试（会真实发送固定测试通知，不保存草稿）</summary><fieldset className="ac-push-fieldset" disabled={busy}>
      <FormField label="测试接收用户 ID" required htmlFor="push-test-id" hint="仅一个正整数 ID；测试不使用上面的群发范围、平台或内容，不会自动调用。"><input id="push-test-id" className="ac-input" inputMode="numeric" autoComplete="off" value={testId} onChange={event => onTestId(event.target.value)} /></FormField>
      <button type="button" className="ac-btn" disabled={!capabilityReady || capabilities?.vapidConfigured !== true && capabilities?.jpushEnabled !== true} onClick={onPrepareTest}>核对单用户测试</button>
    </fieldset></details>
    <ErrorBox msg={error} /><p role="status" aria-live="polite" className="ac-section-note">{sending ? '请求正在发送，请勿重复操作。停止等待不代表服务器未投递。' : notice || (form.title || form.body || form.targetIds ? '通知草稿尚未发送；编辑与刷新不会触发发送。' : '请先填写通知草稿；页面加载不会发送或测试。')}</p>
    {confirmation && <div className="ac-push-confirm" role="group" aria-label={confirmation.kind === 'test' ? '确认单用户测试推送' : '确认通知推送'}>
      <h3>{confirmation.kind === 'test' ? '确认发送固定测试通知？' : '确认发送此通知？'}</h3><p>接收范围：{confirmation.kind === 'test' ? `仅用户 ${confirmation.userId}` : confirmation.payload.targetType === 'all' ? '全部用户（高影响）' : `指定 ${confirmation.payload.targetIds.length} 个用户：${confirmation.payload.targetIds.join('、')}`}</p>
      {confirmation.kind === 'send' && <><p>平台：{platformName(confirmation.payload.platform)}；路径：{confirmation.payload.url}</p><strong>{confirmation.payload.title}</strong><p className="ac-push-plaintext">{confirmation.payload.body}</p></>}
      <p>这是实际发送，不是预览，不能撤回。失败或中断不会自动重试；结果未知时先核对记录。</p><div className="ac-action-group"><button type="button" className="ac-btn" disabled={sending} onClick={onCancel}>取消，保留草稿</button><button type="button" className="ac-btn danger" disabled={sending} onClick={onConfirm}>{sending ? '正在发送…' : confirmation.kind === 'test' ? '确认仅向此用户发送测试' : '确认发送通知'}</button></div>
    </div>}
    {result && <div className="ac-push-result" role={result.unknown ? 'alert' : 'status'}><strong>{result.unknown ? '发送结果未知，请先核对记录' : result.kind === 'test' ? '测试请求已确认完成' : '发送请求已确认完成'}</strong>
      {result.unknown ? <><p>上次请求摘要：{result.action.kind === 'test' ? `仅用户 ${result.action.userId} 的固定测试通知` : `${platformName(result.action.payload.platform)}；${result.action.payload.targetType === 'all' ? '全部用户' : `指定用户 ${result.action.payload.targetIds.join('、')}`}`}</p>{result.action.kind === 'send' && <><strong>{result.action.payload.title}</strong><p className="ac-push-plaintext">{result.action.payload.body}</p><p>跳转路径：{result.action.payload.url}</p></>}<p>未收到有效成功回执，不代表未投递。草稿与摘要保留；不会自动再次发送，请先使用下方记录或送达查询只读核对。</p></> : <><p>{result.kind === 'test' ? `测试发送计数：${count(result.data?.sent)}` : `Web 通道发送计数：${count(result.data?.webSent)}；JPush 通道发送计数：${count(result.data?.jpushSent)}`}。未提供的计数不当作 0；这不是实际送达证明。</p><p>草稿仍保留；再次发送必须重新核对确认。</p></>}
    </div>}
  </Card>;
}

export function PushDelivery({ msgId, resource, queried, querying, onChange, onQuery }) {
  return <Card title="极光送达统计" description="手动查询消息 ID；不发通知。无送达数据不代表发送失败，也不代表已送达。" icon="fa-chart-column">
    <form onSubmit={event => { event.preventDefault(); onQuery(); }} className="ac-form-grid"><FormField label="消息 ID" hint="多个 msg_id 用英文逗号分隔。查询期间可保留原输入，不自动重试。" htmlFor="jpush-message-id"><input id="jpush-message-id" className="ac-input" disabled={querying} value={msgId} onChange={event => onChange(event.target.value)} /></FormField><button type="submit" className="ac-btn" disabled={querying || !msgId.trim()}>{querying ? '正在查询…' : '查询统计'}</button></form>
    <ErrorBox msg={resource.error} />{querying && <Loading text="正在查询送达数据…" />}
    {!queried && !querying && <p className="ac-section-note">尚未查询。请填写要核对的消息 ID。</p>}
    {queried && !querying && !resource.error && resource.data !== null && (resource.data.length ? <div className="ac-table-wrap"><table className="ac-table"><thead><tr><th scope="col">msg_id</th><th scope="col">极光通道</th><th scope="col">厂商通道</th><th scope="col">iOS APNs</th><th scope="col">iOS 消息</th></tr></thead><tbody>{resource.data.map((item, index) => <tr key={item.msg_id ?? index}><td>{item.msg_id ?? '未提供'}</td><td>{count(item.jpush_received)}</td><td>{count(item.android_pns_received)}</td><td>{count(item.ios_apns_received)}</td><td>{count(item.ios_msg_received)}</td></tr>)}</tbody></table></div> : <Empty text="查询成功，未返回送达数据（0 条）" />)}
  </Card>;
}

export function PushLogs({ resource, page, onPage, onRetry }) {
  const logs = resource.data?.logs || [];
  const pagination = resource.data?.pagination;
  const totalPages = pagination?.totalPages ?? resource.data?.totalPages;
  return <Card title="推送记录" description="发送计数不是送达人数；仅成功读取后才显示空记录。每次刷新只读取，不会重复发送。" icon="fa-clock-rotate-left" action={<button type="button" className="ac-btn" disabled={resource.loading} onClick={onRetry}>刷新记录</button>}>
    <PushResource resource={resource} onRetry={onRetry} loadingText="正在读取推送记录…">{!logs.length ? <Empty text={page === 1 ? '请求成功，暂无推送记录（0 条）' : '请求成功，本页暂无记录；可返回上一页。'} /> : <div className="ac-table-wrap"><table className="ac-table"><thead><tr><th scope="col">时间 / 标题</th><th scope="col">Web 发送计数</th><th scope="col">JPush 发送计数</th></tr></thead><tbody>{logs.map((log, index) => <tr key={log.id ?? `${page}:${index}`}><td><span className="ac-cell-muted">{log.created_at && !Number.isNaN(new Date(log.created_at).getTime()) ? new Date(log.created_at).toLocaleString('zh-CN') : '时间未提供'}</span><div className="ac-push-plaintext">{log.title || '未提供标题'}</div></td><td>{count(log.sent_count)}</td><td>{count(log.jpush_sent)}</td></tr>)}</tbody></table></div>}</PushResource>
    <nav className="ac-action-group" aria-label="推送记录分页"><button type="button" className="ac-btn" disabled={page <= 1 || resource.loading} onClick={() => onPage(page - 1)}>上一页</button><span>第 {page} 页{Number.isSafeInteger(totalPages) ? ` / ${totalPages} 页` : '；服务端未提供总页数'}</span><button type="button" className="ac-btn" disabled={resource.loading || !!resource.error || resource.data === null || !logs.length || Number.isSafeInteger(totalPages) && page >= totalPages} onClick={() => onPage(page + 1)}>下一页</button></nav>
  </Card>;
}

export function NotificationAdminContent() {
  const [resources, setResources] = useState(() => ({ stats: blankResource(), platforms: blankResource(), logs: blankResource() }));
  const [form, setForm] = useState(formDefaults);
  const [testId, setTestId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [msgId, setMsgId] = useState('');
  const [delivery, setDelivery] = useState({ data: null, error: '' });
  const [queried, setQueried] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const life = useRef({ alive: false, generation: 0, requests: {}, sending: false, querying: false });
  const begin = useCallback(key => {
    const scope = life.current, generation = scope.generation, request = (scope.requests[key] || 0) + 1;
    scope.requests[key] = request;
    return () => scope.alive && scope.generation === generation && scope.requests[key] === request;
  }, []);
  // 既有推送 API 不接收 signal；通过会话代次废弃晚到结果，不虚称撤回已发请求。
  const load = useCallback(async (key, logPage = 1) => {
    if (!life.current.alive) return;
    const current = begin(key);
    setResources(value => ({ ...value, [key]: { ...value[key], loading: true, error: '' } }));
    try {
      const data = await (key === 'logs' ? adminPushAPI.logs(logPage) : adminPushAPI[key]());
      if (!current()) return;
      if (!data || key === 'logs' && !Array.isArray(data.logs)) throw new Error('响应格式异常');
      setResources(value => ({ ...value, [key]: { data, loading: false, error: '' } }));
    } catch (error) { if (current()) setResources(value => ({ ...value, [key]: { ...value[key], loading: false, error: `本模块读取失败${error.status ? `（${error.status}）` : ''}，未当作 0 或空记录。` } })); }
  }, [begin]);
  useEffect(() => {
    life.current.alive = true;
    const stop = () => { life.current.alive = false; life.current.generation++; setConfirmation(null); setSessionEnded(true); };
    window.addEventListener('auth-session-changing', stop); void load('stats'); void load('platforms');
    return () => { window.removeEventListener('auth-session-changing', stop); life.current.alive = false; life.current.generation++; life.current.sending = false; life.current.querying = false; };
  }, [load]);
  useEffect(() => { void load('logs', page); }, [load, page]);
  const capabilitiesReady = () => {
    const capabilities = resources.platforms;
    return !capabilities.loading && !capabilities.error && (capabilities.data?.vapidConfigured === true || capabilities.data?.jpushEnabled === true);
  };
  const prepareSend = () => {
    if (!life.current.alive || life.current.sending || confirmation || !capabilitiesReady()) return;
    setSendError(''); setNotice('');
    try {
      if (!form.title.trim() || !form.body.trim()) throw new Error('请填写通知标题和内容。');
      const url = form.url.trim() || '/notifications';
      if (!url.startsWith('/') || url.startsWith('//') || /[\\\u0000-\u0020]/.test(url)) throw new Error('跳转路径必须是无空白字符的站内 / 路径，不能使用外部地址。');
      if (!['all', 'user'].includes(form.targetType) || !['all', 'web', 'jpush'].includes(form.platform)) throw new Error('请选择有效平台与接收范围。');
      if (form.platform === 'web' && resources.platforms.data.vapidConfigured !== true || form.platform === 'jpush' && resources.platforms.data.jpushEnabled !== true) throw new Error('所选平台当前不可用。');
      const payload = { platform: form.platform, targetType: form.targetType, ...(form.targetType === 'user' ? { targetIds: parsePushTargetIds(form.targetIds) } : {}), title: form.title.trim(), body: form.body.trim(), url };
      setConfirmation({ kind: 'send', payload });
    } catch (error) { setSendError(error.message); }
  };
  const prepareTest = () => {
    if (!life.current.alive || life.current.sending || confirmation || !capabilitiesReady()) return;
    try { const ids = parsePushTargetIds(testId); if (ids.length !== 1 || !/^[1-9]\d*$/.test(testId.trim())) throw new Error('测试只接受一个正整数用户 ID。'); setSendError(''); setNotice(''); setConfirmation({ kind: 'test', userId: ids[0] }); }
    catch (error) { setSendError(error.message); }
  };
  const send = async () => {
    if (!confirmation || !life.current.alive || life.current.sending || !capabilitiesReady()) return;
    const action = confirmation;
    life.current.sending = true;
    const current = begin('send');
    setSending(true); setSendError(''); setNotice(''); setResult(null);
    try {
      const data = await (action.kind === 'test' ? adminPushAPI.test(action.userId) : adminPushAPI.send(action.payload));
      if (!current()) return;
      // 既有发送 / 测试端点均返回 success:true；204/null 或空对象不是成功回执。
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.success !== true) {
        setResult({ kind: action.kind, action, unknown: true }); setConfirmation(null);
        setSendError('发送结果未知：未收到有效成功回执。当前草稿和上次请求摘要保留，不会自动重发；请先只读核对记录。');
        return;
      }
      setResult({ kind: action.kind, data }); setConfirmation(null); setNotice('请求已确认完成，草稿保留。通道计数不等于实际送达。');
      void load('stats'); void load('logs', page);
    } catch (error) { if (current()) { setConfirmation(null); setSendError(`发送未确认成功${error.status ? `（${error.status}）` : ''}，草稿保留；不会自动重试。中断不代表未投递，请先核对推送记录，避免重复发送。`); } }
    finally { if (current()) { life.current.sending = false; setSending(false); } }
  };
  const queryDelivery = async () => {
    if (!life.current.alive || life.current.querying || !msgId.trim()) return;
    const ids = msgId.split(',').map(value => value.trim()).filter(Boolean);
    if (!ids.length || ids.some(value => !/^[a-zA-Z0-9_-]+$/.test(value))) { setDelivery({ data: null, error: '消息 ID 仅支持字母、数字、下划线或短横线，请用英文逗号分隔。' }); return; }
    life.current.querying = true;
    const current = begin('delivery');
    setQuerying(true); setQueried(true); setDelivery({ data: null, error: '' });
    try {
      const data = await adminPushAPI.jpushStats([...new Set(ids)]);
      if (!current()) return;
      if (!Array.isArray(data)) throw new Error('响应格式异常');
      setDelivery({ data, error: '' });
    } catch (error) { if (current()) setDelivery({ data: null, error: `送达统计查询失败${error.status ? `（${error.status}）` : ''}，未显示为无数据；可显式再次查询。` }); }
    finally { if (current()) { life.current.querying = false; setQuerying(false); } }
  };
  if (sessionEnded) return <ErrorBox msg="管理员会话已变更，旧发送和查询结果已废弃。请在当前账号下重新打开推送管理。" />;
  return <div className="ac-page-stack ac-push-admin">
    <nav className="ac-push-nav" aria-label="推送管理模块"><a href="#push-capabilities">能力与概览</a><a href="#push-compose">目标与通知</a><a href="#push-delivery">送达查询</a><a href="#push-logs">推送记录</a></nav>
    <section id="push-capabilities"><PushCapabilities resource={resources.platforms} stats={resources.stats} onRetry={() => load('platforms')} onStatsRetry={() => load('stats')} /></section>
    <section id="push-compose"><PushComposer form={form} platforms={resources.platforms} sending={sending} error={sendError} notice={notice} confirmation={confirmation} result={result} testId={testId} onChange={patch => { setForm(previous => ({ ...previous, ...patch })); setSendError(''); setNotice(''); setResult(null); }} onTestId={value => { setTestId(value); setSendError(''); }} onPrepareSend={prepareSend} onPrepareTest={prepareTest} onConfirm={send} onCancel={() => { setConfirmation(null); setNotice('已取消，未发送，草稿保留。'); }} /></section>
    <section id="push-delivery"><PushDelivery msgId={msgId} resource={delivery} queried={queried} querying={querying} onChange={value => { setMsgId(value); setQueried(false); setDelivery({ data: null, error: '' }); }} onQuery={queryDelivery} /></section>
    <section id="push-logs"><PushLogs resource={resources.logs} page={page} onPage={next => { setResources(previous => ({ ...previous, logs: blankResource() })); setPage(next); }} onRetry={() => load('logs', page)} /></section>
  </div>;
}

export default function NotificationAdmin() {
  const { user, accounts } = useAuth();
  const token = accounts?.find(account => String(account.id) === String(user?.id))?.token || '';
  if (user?.role !== 'admin') return <Empty text="无权限" icon="fa-lock" />;
  return <NotificationAdminContent key={`${user.id}:${token}`} />;
}
