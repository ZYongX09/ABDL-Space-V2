import { useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { createRequestGate, DEFAULT_APP_POLICY, DEFAULT_APP_REMINDER, DEFAULT_APP_REMINDER_MESSAGE, exactCount, MAX_UPDATE_MESSAGE, normalizeVersionCodes, policyPayload, reminderPayload, versionLabel } from '../../appClients/model.js';
import AdminLayout from './layout';
import { Card, Empty, ErrorBox, FormField, Loading, Pagination, Pill, StatCard } from './ui';
import { fmtFull } from './util';
import './appClients.css';

const METRICS = [
  ['observed_users', '累计观测账号（去重）'], ['versioned_users', '曾上报版本号的账号'], ['unversioned_users', '曾未上报版本号的账号'],
  ['active_1d', '近 1 天活跃账号'], ['active_7d', '近 7 天活跃账号'], ['active_30d', '近 30 天活跃账号'],
];

function useResource(key, fetcher) {
  const gate = useRef(createRequestGate());
  const [state, setState] = useState({ key: '', data: null, error: '', loading: true });
  useEffect(() => {
    const current = gate.current.begin();
    const controller = new AbortController();
    setState({ key, data: null, error: '', loading: true });
    fetcher(controller.signal).then(data => {
      if (current()) setState({ key, data, error: '', loading: false });
    }).catch(error => {
      if (current()) setState({ key, data: null, error: error.message || '加载失败，请重试', loading: false });
    });
    return () => { gate.current.invalidate(); controller.abort(); };
    // 每个请求所需参数全部包含在 key 内，切换时旧响应不得回写。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? state : { key, data: null, error: '', loading: true };
}

function RetryError({ error, retry }) {
  return error ? <div className="ac-app-feedback"><ErrorBox msg={error} /><button type="button" className="ac-btn" onClick={retry}>重新加载</button></div> : null;
}

const reminderForm = reminder => ({ ...reminder, versionText: reminder.version_codes.join('\n'), message: reminder.message === DEFAULT_APP_REMINDER_MESSAGE ? '' : reminder.message });

function ReminderEditor() {
  const [revision, setRevision] = useState(0);
  const resource = useResource(String(revision), signal => adminAPI.appClientReminder({ signal }));
  const [form, setForm] = useState(() => reminderForm(DEFAULT_APP_REMINDER));
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const saveGate = useRef(createRequestGate());
  const saveController = useRef(null);
  useEffect(() => () => { saveGate.current.invalidate(); saveController.current?.abort(); }, []);
  useEffect(() => {
    if (!resource.data) return;
    setSaved(resource.data); setForm(reminderForm(resource.data));
    setError(''); setNotice('');
  }, [resource.data]);
  const change = patch => { setForm(value => ({ ...value, ...patch })); setError(''); setNotice(''); };
  let preview = [];
  try { preview = normalizeVersionCodes(form.versionText, '提醒'); } catch { /* 保存时显示校验错误。 */ }
  const save = async event => {
    event.preventDefault();
    if (saveController.current || saving || resource.loading || resource.error || !resource.data) return;
    let payload;
    try { payload = reminderPayload(form); } catch (e) { setError(e.message); return; }
    const current = saveGate.current.begin();
    const controller = new AbortController();
    saveController.current = controller;
    setSaving(true); setError(''); setNotice('');
    try {
      const reminder = await adminAPI.saveAppClientReminder(payload, { signal: controller.signal });
      if (!current()) return;
      setSaved(reminder); setForm(reminderForm(reminder));
      setNotice('App 更新提醒已保存；真实帖子与分页保留，网页访问不受影响。');
    } catch (e) {
      if (current()) setError(`保存失败：${e.message || '请重试'}。当前输入已保留；若响应中断，请重新加载确认服务器状态。`);
    } finally {
      if (current()) { saveController.current = null; setSaving(false); }
    }
  };
  return <Card title="App 更新提醒（不屏蔽真实帖子）" description="默认关闭。独立保存提醒配置，仅影响指定内部版本的原生 App 时间线；网页不受影响。" icon="fa-bell">
    <p className="ac-app-note">提醒：首次加载且有真实帖子的时间线首位注入更新提示假帖；翻页、补拉与空结束页不重复插入，保留真实帖子与分页。版本废弃：只返回假帖，不返回真实帖子。同一版本同时命中两项时，版本废弃优先，不叠加提醒。</p>
    {resource.loading ? <Loading text="正在读取 App 更新提醒…" /> : resource.error ? <RetryError error={resource.error} retry={() => setRevision(value => value + 1)} /> : <form onSubmit={save}>
      <fieldset className="ac-app-fieldset" disabled={saving}>
        <legend className="ac-app-visually-hidden">App 更新提醒配置</legend>
        <div className="ac-app-policy-status"><Pill tone={saved?.enabled ? 'green' : 'slate'}>{saved?.enabled ? '已保存提醒：启用' : '已保存提醒：关闭'}</Pill><span>已保存版本：{saved?.version_codes.length ? saved.version_codes.join('、') : '未指定'}；已保存文案：{saved?.message === DEFAULT_APP_REMINDER_MESSAGE ? '默认' : '自定义'}；关闭时保留版本与文案。</span></div>
        <label className="ac-check-row"><input id="app-reminder-enabled" type="checkbox" role="switch" checked={form.enabled} onChange={e => change({ enabled: e.target.checked })} /><span>启用 App 更新提醒（不屏蔽真实帖子）</span></label>
        <FormField label="提醒的内部版本号（versionCode）" htmlFor="app-reminder-versions" hint="仅匹配明确列出的内部版本号，不是展示版本名或最低版本门槛；未上报版本不匹配。支持换行、空格或中英文逗号分隔，自动去重、排序。范围 1–2147483647，最多 200 个不同版本。">
          <textarea id="app-reminder-versions" className="ac-textarea" rows={4} value={form.versionText} onChange={e => change({ versionText: e.target.value })} placeholder={'例如：101\n103, 105'} aria-describedby="app-reminder-version-preview" />
          <p id="app-reminder-version-preview" className="ac-section-note">规范化预览：{preview.length ? preview.join('、') : form.versionText.trim() ? '输入无效，保存前请检查' : '未指定任何提醒版本'}</p>
        </FormField>
        <FormField label="提醒内容（可选）" htmlFor="app-reminder-message" hint="纯文本，最多 2000 个字符；留空保存使用默认文案。填写版本或恢复默认文案不会自动启用提醒。">
          <textarea id="app-reminder-message" className="ac-textarea" rows={3} maxLength={MAX_UPDATE_MESSAGE} value={form.message} onChange={e => change({ message: e.target.value })} placeholder={DEFAULT_APP_REMINDER_MESSAGE} />
          <button type="button" className="ac-btn" onClick={() => change({ message: '' })}>恢复默认提醒文案</button>
        </FormField>
        <div><h3 className="ac-app-subtitle">提醒内容预览（纯文本，尚未保存）</h3><p id="app-reminder-message-preview" className="ac-app-note ac-app-plaintext">{form.message.trim() || DEFAULT_APP_REMINDER_MESSAGE}</p></div>
        <ErrorBox msg={error} />
        <p role="status" aria-live="polite" className="ac-section-note">{notice}</p>
        <div className="ac-action-group"><button type="submit" className="ac-btn primary" disabled={saving}>{saving ? '正在保存提醒…' : '保存 App 更新提醒'}</button><button type="button" className="ac-btn" disabled={saving} onClick={() => { setError(''); setNotice(''); setRevision(value => value + 1); }}>重新加载已保存提醒</button></div>
      </fieldset>
    </form>}
  </Card>;
}

function PolicyEditor() {
  const [revision, setRevision] = useState(0);
  const resource = useResource(String(revision), signal => adminAPI.appClientPolicy({ signal }));
  const [form, setForm] = useState({ ...DEFAULT_APP_POLICY, versionText: '' });
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(false);
  const saveController = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; saveController.current?.abort(); }; }, []);
  useEffect(() => {
    if (!resource.data) return;
    setSaved(resource.data);
    setForm({ ...resource.data, versionText: resource.data.deprecated_version_codes.join('\n') });
    setError(''); setNotice('');
  }, [resource.data]);
  const change = patch => { setForm(value => ({ ...value, ...patch })); setError(''); setNotice(''); };
  let preview = [];
  try { preview = normalizeVersionCodes(form.versionText); } catch { /* 保存时给出具体错误，不静默丢弃。 */ }
  const save = async event => {
    event.preventDefault();
    if (saving || resource.loading || resource.error) return;
    let payload;
    try { payload = policyPayload(form); } catch (e) { setError(e.message); return; }
    setSaving(true); setError(''); setNotice('');
    saveController.current = new AbortController();
    try {
      const policy = await adminAPI.saveAppClientPolicy(payload, { signal: saveController.current.signal });
      if (!mounted.current) return;
      setSaved(policy); setForm({ ...policy, versionText: policy.deprecated_version_codes.join('\n') });
      setNotice('App 策略已保存；网页访问不受影响。');
    } catch (e) { if (mounted.current) setError(`保存失败：${e.message || '请重试'}。当前输入已保留；若响应中断，请重新加载确认服务器状态。`); }
    finally { if (mounted.current) setSaving(false); }
  };
  return <Card title="App 版本废弃（只返回假帖）" description="默认关闭。命中的原生 App 时间线只返回更新提示假帖，不返回真实帖子；优先于更新提醒，网页不受影响。完整四字段策略独立保存。" icon="fa-mobile-screen">
    {resource.loading ? <Loading text="正在读取 App 策略…" /> : resource.error ? <RetryError error={resource.error} retry={() => setRevision(value => value + 1)} /> : <form onSubmit={save}>
      <fieldset className="ac-app-fieldset" disabled={saving}>
        <legend className="ac-app-visually-hidden">App 版本访问策略配置</legend>
        <div className="ac-app-policy-status"><Pill tone={saved?.enabled ? 'amber' : 'slate'}>{saved?.enabled ? '已保存策略：启用' : '已保存策略：关闭'}</Pill><span>开关关闭时，以下两项拦截均不生效，但保留配置。</span></div>
        <label className="ac-check-row"><input type="checkbox" checked={form.enabled} onChange={e => change({ enabled: e.target.checked })} /><span>启用 App 版本访问限制（总开关）</span></label>
        <FormField label="明确废弃的内部版本号（versionCode）" htmlFor="app-deprecated-versions" hint="不是展示版本名，也不是最低版本门槛。仅拦截此列表中的版本；支持每行、空格或中英文逗号分隔，自动去重并排序。每个版本号为 1–2147483647 的整数，最多 200 个。">
          <textarea id="app-deprecated-versions" className="ac-textarea" rows={4} value={form.versionText} onChange={e => change({ versionText: e.target.value })} placeholder={'例如：101\n103, 105'} aria-describedby="app-version-preview" />
          <p id="app-version-preview" className="ac-section-note">规范化预览：{preview.length ? preview.join('、') : form.versionText.trim() ? '输入无效，保存前请检查' : '未指定任何废弃版本'}</p>
        </FormField>
        <label className="ac-check-row"><input type="checkbox" checked={form.block_unversioned} onChange={e => change({ block_unversioned: e.target.checked })} /><span>独立拦截未上报有效版本号的原生 App</span></label>
        <p className="ac-section-note">此选项与废弃版本列表独立；清空列表不会取消此选项。它不代表这些用户未安装 App。</p>
        <FormField label="更新提示文案" required htmlFor="app-update-message" hint="不能为空，最多 2000 个字符；此提示供被限制的 App 展示。">
          <textarea id="app-update-message" className="ac-textarea" rows={3} maxLength={MAX_UPDATE_MESSAGE} value={form.update_message} onChange={e => change({ update_message: e.target.value })} />
        </FormField>
        <ErrorBox msg={error} />
        <p role="status" aria-live="polite" className="ac-section-note">{notice}</p>
        <div className="ac-action-group"><button type="submit" className="ac-btn primary" disabled={saving}>{saving ? '正在保存…' : '保存 App 策略'}</button><button type="button" className="ac-btn" disabled={saving} onClick={() => setRevision(value => value + 1)}>重新加载已保存策略</button></div>
      </fieldset>
    </form>}
  </Card>;
}

function AppClientsContent() {
  const [revision, setRevision] = useState(0);
  const stats = useResource(`stats:${revision}`, signal => adminAPI.appClientStats({ signal }));
  const [filters, setFilters] = useState({ version_code: 'all', page: 1, q: '' });
  const [search, setSearch] = useState('');
  const [listRevision, setListRevision] = useState(0);
  const listKey = JSON.stringify([stats.data?.available === true, filters, revision, listRevision]);
  const list = useResource(listKey, signal => stats.data?.available === true ? adminAPI.appClientUsers({ ...filters, limit: 20 }, { signal }) : Promise.resolve(null));
  const selectVersion = value => setFilters(current => ({ ...current, version_code: value, page: 1 }));
  const historical = filters.version_code !== 'all';
  const versionOptions = stats.data?.available ? stats.data.versions.filter(row => row.version_code !== null).map(row => row.version_code).sort((a, b) => b - a) : [];
  if (filters.version_code !== 'all' && filters.version_code !== 'missing' && !versionOptions.includes(Number(filters.version_code))) versionOptions.push(Number(filters.version_code));
  return <div className="ac-page-stack ac-app-clients">
    <ReminderEditor />
    <PolicyEditor />
    <Card title="原生 App 请求观测统计" icon="fa-chart-column" description="统计已认证的原生时间线请求，不是安装量、设备数、下载量，也不覆盖 App 的所有活动。" action={<button type="button" className="ac-btn" disabled={stats.loading} onClick={() => setRevision(value => value + 1)}>刷新观测数据</button>}>
      <p className="ac-app-note">「未上报版本号」包括未上报有效版本号及格式无效的请求，不代表未安装。仅从数据库迁移开始观测，不回填历史数据。账号总数按账号去重；同一账号可使用多个版本，也可先未上报再升级，所以「曾上报」与「曾未上报」可能重叠，不能相加当作总账号数。</p>
      {stats.loading ? <Loading text="正在读取观测统计…" /> : stats.error ? <RetryError error={stats.error} retry={() => setRevision(value => value + 1)} /> : stats.data?.available === false ? <div className="ac-app-note" role="status">统计不可用：后端尚未完成 App 观测数据库迁移，或观测数据读取失败。这不是 0 个用户；版本明细和用户列表暂不可用。</div> : stats.data && <>
        <p className="ac-section-note">观测起点：{stats.data.measurement_started_at ? fmtFull(stats.data.measurement_started_at) : '后端未提供'}（时间按本地时区显示）。近 1 / 7 / 30 天活跃按最近观测时间计算。</p>
        <div className="ac-stat-grid ac-app-metrics">{METRICS.map(([key, label]) => <StatCard key={key} label={label} value={exactCount(stats.data.totals[key])} tone="blue" />)}</div>
        <h3 className="ac-app-subtitle">按版本观测明细</h3>
        <p className="ac-section-note">各行「累计观测账号」是该账号与该版本的历史观测配对，可跨版本重叠。「最近使用此版本的账号」按账号最近一次观测唯一归属，不代表仍在安装或使用该版本。各行活跃也可跨版本重叠。点击查看历史配对记录。</p>
        {stats.data.versions.length ? <div className="ac-table-wrap"><table className="ac-table"><caption className="ac-app-visually-hidden">按版本的历史观测账号、最近版本账号及活跃账号</caption><thead><tr><th scope="col">观测版本</th><th scope="col">累计观测账号</th><th scope="col">最近使用此版本的账号</th><th scope="col">近 1 天活跃</th><th scope="col">近 7 天活跃</th><th scope="col">近 30 天活跃</th><th scope="col">用户明细</th></tr></thead><tbody>{stats.data.versions.map(row => <tr key={row.version_code ?? 'missing'}><th scope="row">{versionLabel(row.version_code)}</th>{['observed_users', 'latest_users', 'active_1d', 'active_7d', 'active_30d'].map(key => <td key={key}>{exactCount(row[key])}</td>)}<td><button type="button" className="ac-btn" aria-label={`查看${versionLabel(row.version_code)}的历史观测用户`} onClick={() => selectVersion(row.version_code === null ? 'missing' : String(row.version_code))}>查看用户</button></td></tr>)}</tbody></table></div> : <Empty text="观测已就绪，尚无版本观测记录（0）" />}
      </>}
    </Card>
    <Card title="观测用户明细" description="全部版本：每个账号只展示最近一次观测。指定版本或未上报：展示账号与该版本的历史观测配对，用户可能已升级，不能据此认定其当前版本。" icon="fa-users">
      <form className="ac-app-filters" onSubmit={event => { event.preventDefault(); setFilters(current => ({ ...current, q: search.trim(), page: 1 })); }}>
        <FormField label="观测版本" htmlFor="app-user-version"><select id="app-user-version" className="ac-select" value={filters.version_code} onChange={e => selectVersion(e.target.value)}><option value="all">全部版本（每账号最近记录）</option><option value="missing">未上报版本号（历史配对）</option>{versionOptions.map(code => <option key={code} value={String(code)}>内部版本号 {code}（历史配对）</option>)}</select></FormField>
        <FormField label="搜索账号" htmlFor="app-user-search"><input id="app-user-search" className="ac-input" type="search" placeholder="用户名 / 显示名称" value={search} onChange={e => setSearch(e.target.value)} /></FormField>
        <button type="submit" className="ac-btn primary">搜索</button>
      </form>
      <p className="ac-section-note">当前列表：{historical ? '历史账号 × 版本配对；首次与末次时间仅针对该版本' : '每个账号的最近观测记录；首次与末次时间按后端返回的记录显示'}{filters.q && `；搜索「${filters.q}」`}。每页 20 条；时间按本地时区显示。</p>
      {stats.loading ? <Loading text="正在确认统计可用性…" /> : stats.error ? <Empty text="统计读取失败，请先重试统计；未将失败当成空列表" /> : stats.data?.available === false ? <Empty text="迁移尚未完成或观测数据读取失败，用户观测列表不可用（不是 0）" /> : list.loading ? <Loading text="正在读取匹配用户…" /> : list.error ? <RetryError error={list.error} retry={() => setListRevision(value => value + 1)} /> : list.data && <>
        {list.data.users.length ? <div className="ac-table-wrap"><table className="ac-table"><caption className="ac-app-visually-hidden">{historical ? '历史版本配对用户' : '各账号最近观测用户'}</caption><thead><tr><th scope="col">账号</th><th scope="col">{historical ? '历史观测版本' : '最近观测版本'}</th><th scope="col">首次观测时间</th><th scope="col">末次观测时间</th></tr></thead><tbody>{list.data.users.map(row => <tr key={`${row.id}:${row.version_code ?? 'missing'}`}><td><a className="ac-link-button" href={`/user/${encodeURIComponent(row.id)}`}>{row.display_name || row.username}</a><div className="ac-cell-muted">@{row.username} · 账号编号 {row.id}</div></td><td>{versionLabel(row.version_code)}</td><td><time dateTime={row.first_seen_at}>{fmtFull(row.first_seen_at)}</time></td><td><time dateTime={row.last_seen_at}>{fmtFull(row.last_seen_at)}</time></td></tr>)}</tbody></table></div> : <Empty text={list.data.pagination.total === 0 ? '请求成功，暂无匹配的观测用户（0）' : '此页暂无记录，请返回上一页或重新搜索'} />}
        <Pagination {...list.data.pagination} onChange={page => setFilters(current => ({ ...current, page }))} />
      </>}
    </Card>
  </div>;
}

export default function AdminAppClients() {
  const { user, accounts } = useAuth();
  const token = accounts?.find(account => String(account.id) === String(user?.id))?.token || '';
  // 账户变化卸载数据层，旧请求的成功、失败及保存反馈都不能污染新会话。
  return <AdminLayout active="app-clients">{user?.role === 'admin' && <AppClientsContent key={`${user.id}:${token}`} />}</AdminLayout>;
}
