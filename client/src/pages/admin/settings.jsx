import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from './layout';
import { Card, Empty, ErrorBox, FormField, Loading, Modal, Pill, useConfirm } from './ui';
import { fmtFull } from './util';
import { APP_NBW_LOCAL_ONLY_SETTING_KEY, APP_POLICY_SETTING_KEY, APP_REMINDER_SETTING_KEY, isReservedAppClientSetting } from '../../appClients/model.js';
import './settings.css';

const blankResource = () => ({ data: null, loading: true, error: '' });
const betaDraft = value => ({ enabled: !!value.enabled, allowedRoutes: (value.allowedRoutes || []).join('\n'), message: value.message || '' });
export const isSensitiveSetting = key => /token|secret|password|passwd|credential|private|api[_-]?key|access[_-]?key|authorization|cookie|session|signing|密钥|口令/i.test(key);
const writeError = error => error.status === 409 ? '配置已在其他会话更新（409）。当前草稿保留，请显式重新加载后核对，不会自动覆盖。' : `操作未确认成功${error.status ? `（${error.status}）` : ''}，当前输入保留。若响应中断，请先重新读取结果，避免重复操作。`;

export function SettingsResource({ resource, onRetry, emptyText, children }) {
  return <>
    {resource.loading && <Loading text={resource.data === null ? '正在读取本模块…' : '正在刷新本模块，以下为上次快照…'} />}
    {resource.error && <div className="ac-settings-feedback"><ErrorBox msg={resource.error} /><button type="button" className="ac-btn" onClick={onRetry}>重试本模块</button></div>}
    {resource.data !== null && (Array.isArray(resource.data) && !resource.data.length ? <Empty text={emptyText} /> : children)}
  </>;
}

export function SettingsSaveState({ busy, dirty, error, notice }) {
  return <><ErrorBox msg={error} /><p role="status" aria-live="polite" className="ac-section-note">{busy ? '正在提交本模块，其他模块草稿不会一并提交…' : notice || (dirty ? '有未保存更改，尚未生效。' : '未提交任何更改。')}</p></>;
}

export function SettingsTable({ records, onEdit }) {
  return <div className="ac-table-wrap"><table className="ac-table"><caption className="ac-settings-sr">站点配置，敏感值不展示或回填</caption><thead><tr><th scope="col">配置键</th><th scope="col">配置值</th><th scope="col">更新时间</th><th scope="col">操作</th></tr></thead><tbody>{records.map(setting => <tr key={setting.key}>
    <th scope="row"><code>{setting.key}</code></th>
    <td>{isSensitiveSetting(setting.key) ? <Pill tone="slate">敏感值已隐藏，不可查看</Pill> : <div className="ac-settings-value">{setting.value || '（空值）'}</div>}</td>
    <td className="ac-cell-muted">{setting.updated_at ? fmtFull(setting.updated_at) : '未提供'}</td>
    <td>{isReservedAppClientSetting(setting.key) ? <Link className="ac-link-button" to="/admin/app-clients">专用 App 管理（保留配置）</Link> : <button type="button" className="ac-btn" onClick={() => onEdit({ key: setting.key, value: isSensitiveSetting(setting.key) ? '' : setting.value, existing: true })}>编辑</button>}</td>
  </tr>)}</tbody></table></div>;
}

export function AdminSettingsContent() {
  const confirm = useConfirm();
  const [resources, setResources] = useState(() => ({ beta: blankResource(), settings: blankResource(), emails: blankResource() }));
  const [betaForm, setBetaForm] = useState({ enabled: false, allowedRoutes: '', message: '' });
  const [password, setPassword] = useState({ old: '', fresh: '' });
  const [blockForm, setBlockForm] = useState({ email: '', reason: '' });
  const [saveKey, setSaveKey] = useState(null);
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState({});
  const [sessionEnded, setSessionEnded] = useState(false);
  const life = useRef({ alive: false, generation: 0, requests: {}, busy: new Set() });
  const updateFeedback = (key, patch) => setFeedback(value => ({ ...value, [key]: { ...value[key], ...patch } }));
  // 旧设置 API 不接收 signal；仅在视图废弃晚到结果，不声称取消了服务端写入。
  const begin = useCallback(key => {
    const current = life.current;
    const generation = current.generation;
    const request = (current.requests[key] || 0) + 1;
    current.requests[key] = request;
    return () => current.alive && current.generation === generation && current.requests[key] === request;
  }, []);
  const loadBlock = useCallback(async key => {
    if (!life.current.alive) return;
    const current = begin(`read:${key}`);
    setResources(value => ({ ...value, [key]: { ...value[key], loading: true, error: '' } }));
    try {
      const result = await (key === 'beta' ? adminAPI.betaMode() : key === 'settings' ? adminAPI.settings() : adminAPI.blockedEmails());
      if (!current()) return;
      const data = key === 'beta' ? result : result[key === 'settings' ? 'settings' : 'emails'];
      if (!data || (key !== 'beta' && !Array.isArray(data))) throw new Error('响应格式异常');
      setResources(value => ({ ...value, [key]: { data, loading: false, error: '' } }));
      if (key === 'beta') setBetaForm(betaDraft(data));
    } catch (error) {
      if (current()) setResources(value => ({ ...value, [key]: { ...value[key], loading: false, error: `本模块读取失败${error.status ? `（${error.status}）` : ''}，未将失败当作空数据。` } }));
    }
  }, [begin]);
  useEffect(() => {
    life.current.alive = true;
    const stop = () => { life.current.alive = false; life.current.generation++; life.current.busy.clear(); setPassword({ old: '', fresh: '' }); setSessionEnded(true); };
    window.addEventListener('auth-session-changing', stop);
    void loadBlock('beta'); void loadBlock('settings'); void loadBlock('emails');
    return () => { window.removeEventListener('auth-session-changing', stop); life.current.alive = false; life.current.generation++; life.current.busy.clear(); };
  }, [loadBlock]);
  const submit = async (key, action, success) => {
    if (!life.current.alive || life.current.busy.has(key)) return;
    life.current.busy.add(key);
    const current = begin(`write:${key}`);
    updateFeedback(key, { busy: true, error: '', notice: '' });
    try {
      await action();
      if (!current()) return;
      success?.();
      updateFeedback(key, { notice: '本模块操作已确认成功，其他草稿保持不变。' });
    } catch (error) { if (current()) updateFeedback(key, { error: writeError(error) }); }
    finally { if (current()) { life.current.busy.delete(key); updateFeedback(key, { busy: false }); } }
  };
  const beta = resources.beta.data;
  const betaDirty = !!beta && JSON.stringify(betaForm) !== JSON.stringify(betaDraft(beta));
  const reloadBeta = async () => {
    const current = begin('confirm:beta');
    if (betaDirty && !await confirm({ title: '重新读取运行模式', message: '成功读取后将替换运行模式草稿；其他模块不受影响。失败仍保留草稿。', okText: '确认重新读取' })) return;
    if (current()) void loadBlock('beta');
  };
  const saveBeta = () => {
    const routes = betaForm.allowedRoutes.split('\n').map(route => route.trim()).filter(Boolean);
    if (routes.some(route => !route.startsWith('/') || route.startsWith('//'))) { updateFeedback('beta', { error: '每条白名单路由必须为以 / 开头的站内路径。' }); return; }
    const payload = { enabled: betaForm.enabled, allowedRoutes: routes, message: betaForm.message.trim() };
    void submit('beta', () => adminAPI.setBetaMode(payload), () => {
      setResources(value => ({ ...value, beta: { data: payload, loading: false, error: '' } })); setBetaForm(betaDraft(payload));
    });
  };
  const submitSetting = () => {
    if (!saveKey || !/^[a-z0-9_]{1,64}$/.test(saveKey.key.trim())) { updateFeedback('setting', { error: '配置键仅支持小写字母、数字、下划线，长度 1–64。' }); return; }
    if (isReservedAppClientSetting(saveKey.key)) { updateFeedback('setting', { error: 'App 提醒、版本废弃与仅本站模式是保留配置，请前往 App 管理使用专用表单保存。' }); return; }
    if (saveKey.value.length > 8000 || isSensitiveSetting(saveKey.key) && !saveKey.value.trim()) { updateFeedback('setting', { error: '配置值最多 8000 字符；敏感值不回填，替换时必须填写新值，留空不会清除。' }); return; }
    const draft = { ...saveKey };
    void submit('setting', () => adminAPI.saveSetting(draft.key.trim(), draft.value), () => { setSaveKey(null); void loadBlock('settings'); });
  };
  const closeSetting = async () => {
    if (feedback.setting?.busy) return;
    const current = begin('confirm:setting');
    if (saveKey?.value && !await confirm({ title: '关闭配置编辑', message: '关闭将丢弃此配置项未保存输入，不影响其他模块。', okText: '丢弃并关闭' })) return;
    if (current()) setSaveKey(null);
  };
  const addBlockedEmail = () => {
    const email = blockForm.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { updateFeedback('emails', { error: '请输入有效的邮箱地址。' }); return; }
    void submit('emails', () => adminAPI.addBlockedEmail(email, blockForm.reason.trim()), () => { setBlockForm({ email: '', reason: '' }); void loadBlock('emails'); });
  };
  const removeBlockedEmail = async email => {
    if (feedback.emails?.busy) return;
    const current = begin('confirm:email');
    if (!await confirm({ title: '移除屏蔽邮箱', message: `确定移除 ${email}？该邮箱将可以重新申请验证码。`, okText: '确认移除', danger: true }) || !current()) return;
    void submit('emails', () => adminAPI.removeBlockedEmail(email), () => { void loadBlock('emails'); });
  };
  const changePassword = () => {
    if (!password.old || password.fresh.length < 8) { updateFeedback('password', { error: '请输入当前密码，新密码至少 8 位。' }); return; }
    void submit('password', () => adminAPI.resetPassword(password.old, password.fresh), () => { setPassword({ old: '', fresh: '' }); });
  };
  const editSetting = draft => { if (saveKey) return; updateFeedback('setting', { error: '', notice: '' }); setSaveKey(draft); };
  const filtered = (resources.settings.data || []).filter(setting => setting.key.toLowerCase().includes(query.trim().toLowerCase()));
  if (sessionEnded) return <ErrorBox msg="管理员会话已变更，旧请求反馈已废弃。请在当前账号下重新打开设置。" />;
  return <div className="ac-page-stack ac-system-settings">
    <nav className="ac-settings-nav" aria-label="设置模块"><a href="#settings-runtime">运行模式</a><a href="#settings-values">站点配置</a><a href="#settings-emails">邮箱治理</a><a href="#settings-password">账号安全</a></nav>
    <section id="settings-runtime"><Card title="运行模式" description="仅保存本块。控制未登录访问范围，会直接影响前台可访问页面。" icon="fa-flask">
      <SettingsResource resource={resources.beta} onRetry={reloadBeta}>
        <p className="ac-section-note">已保存内测模式：{beta?.enabled ? '启用' : '关闭'}；白名单 {beta?.allowedRoutes?.length || 0} 条。以下为编辑草稿。</p>
        <fieldset className="ac-settings-fieldset" disabled={feedback.beta?.busy || resources.beta.loading}>
          <label className="ac-check-row"><input type="checkbox" checked={betaForm.enabled} onChange={event => { setBetaForm(form => ({ ...form, enabled: event.target.checked })); updateFeedback('beta', { notice: '', error: '' }); }} /><span>启用内测模式，未登录用户仅可访问白名单路由</span></label>
          <details className="ac-settings-details"><summary>编辑白名单与前台提示</summary><div className="ac-form-grid">
            <FormField label="允许访问的路由" hint="每行一个站内路由，必须以 / 开头。" htmlFor="beta-routes"><textarea id="beta-routes" className="ac-textarea" rows={5} value={betaForm.allowedRoutes} onChange={event => { setBetaForm(form => ({ ...form, allowedRoutes: event.target.value })); updateFeedback('beta', { notice: '', error: '' }); }} /></FormField>
            <FormField label="前台提示文案" htmlFor="beta-message"><input id="beta-message" className="ac-input" value={betaForm.message} onChange={event => { setBetaForm(form => ({ ...form, message: event.target.value })); updateFeedback('beta', { notice: '', error: '' }); }} /></FormField>
          </div></details>
          <button type="button" className="ac-btn primary" disabled={!betaDirty || !!resources.beta.error} onClick={saveBeta}>{feedback.beta?.busy ? '正在保存…' : '保存运行配置'}</button>
        </fieldset>
      </SettingsResource>
      <SettingsSaveState {...feedback.beta} dirty={betaDirty} />
      <button type="button" className="ac-btn" disabled={feedback.beta?.busy || resources.beta.loading} onClick={reloadBeta}>重新读取运行模式</button>
    </Card></section>
    <section id="settings-values"><Card title="站点配置" description="逐项编辑，不提交其他模块。敏感值只可替换，不展示、不回填。保留 App 配置请使用专用表单。" icon="fa-database" action={<button type="button" className="ac-btn primary" disabled={!!saveKey || resources.settings.loading || !!resources.settings.error} onClick={() => editSetting({ key: '', value: '', existing: false })}>新增配置项</button>}>
      <FormField label="按配置键筛选" htmlFor="setting-search" hint="仅搜索键名，不搜索或暴露敏感值。"><input id="setting-search" className="ac-input" type="search" value={query} onChange={event => setQuery(event.target.value)} /></FormField>
      <SettingsResource resource={resources.settings} onRetry={() => loadBlock('settings')} emptyText="请求成功，暂无配置项（0）">{filtered.length ? <SettingsTable records={filtered} onEdit={editSetting} /> : <Empty text="没有匹配的配置键；清空筛选查看全部。" />}</SettingsResource>
      <SettingsSaveState {...feedback.setting} dirty={!!saveKey} />
      <button type="button" className="ac-btn" disabled={resources.settings.loading || feedback.setting?.busy} onClick={() => loadBlock('settings')}>刷新配置列表（保留编辑输入）</button>
    </Card></section>
    <section id="settings-emails"><Card title="邮箱治理" description="屏蔽注册、绑定和找回密码验证码申请；不会发送邮件。" icon="fa-ban">
      <form onSubmit={event => { event.preventDefault(); addBlockedEmail(); }}><fieldset className="ac-settings-fieldset" disabled={feedback.emails?.busy || resources.emails.loading || !!resources.emails.error}>
        <div className="ac-form-grid ac-form-grid-2"><FormField label="邮箱地址" required htmlFor="blocked-email"><input id="blocked-email" className="ac-input" type="email" required value={blockForm.email} onChange={event => { setBlockForm(form => ({ ...form, email: event.target.value })); updateFeedback('emails', { notice: '', error: '' }); }} /></FormField><FormField label="屏蔽原因" hint="可选，最多 200 个字符。" htmlFor="blocked-reason"><input id="blocked-reason" className="ac-input" maxLength={200} value={blockForm.reason} onChange={event => { setBlockForm(form => ({ ...form, reason: event.target.value })); updateFeedback('emails', { notice: '', error: '' }); }} /></FormField></div>
        <button type="submit" className="ac-btn primary">{feedback.emails?.busy ? '正在提交…' : '添加屏蔽'}</button>
      </fieldset></form>
      <SettingsSaveState {...feedback.emails} dirty={!!(blockForm.email || blockForm.reason)} />
      <SettingsResource resource={resources.emails} onRetry={() => loadBlock('emails')} emptyText="请求成功，暂无屏蔽邮箱（0）"><div className="ac-table-wrap"><table className="ac-table"><thead><tr><th scope="col">邮箱 / 原因</th><th scope="col">操作人 / 时间</th><th scope="col">操作</th></tr></thead><tbody>{(resources.emails.data || []).map(record => <tr key={record.email}><td><Pill tone="red">{record.email}</Pill><div className="ac-settings-value">{record.reason || '未填写原因'}</div></td><td>{record.created_by_username || '未提供'}<div className="ac-cell-muted">{record.created_at ? fmtFull(record.created_at) : '时间未提供'}</div></td><td><button type="button" className="ac-btn danger" disabled={feedback.emails?.busy || resources.emails.loading || !!resources.emails.error} onClick={() => removeBlockedEmail(record.email)}>移除</button></td></tr>)}</tbody></table></div></SettingsResource>
      <button type="button" className="ac-btn" disabled={resources.emails.loading || feedback.emails?.busy} onClick={() => loadBlock('emails')}>刷新屏蔽名单（保留输入）</button>
    </Card></section>
    <section id="settings-password"><Card title="管理员账号安全" description="仅修改当前管理员密码，不影响其他草稿。新密码至少 8 位。" icon="fa-key">
      <form onSubmit={event => { event.preventDefault(); changePassword(); }}><fieldset className="ac-settings-fieldset" disabled={feedback.password?.busy}>
        <FormField label="当前密码" required htmlFor="current-password"><input id="current-password" className="ac-input" type="password" autoComplete="current-password" required value={password.old} onChange={event => { setPassword(value => ({ ...value, old: event.target.value })); updateFeedback('password', { error: '', notice: '' }); }} /></FormField>
        <FormField label="新密码" required htmlFor="new-password"><input id="new-password" className="ac-input" type="password" autoComplete="new-password" minLength={8} required value={password.fresh} onChange={event => { setPassword(value => ({ ...value, fresh: event.target.value })); updateFeedback('password', { error: '', notice: '' }); }} /></FormField>
        <button type="submit" className="ac-btn primary">{feedback.password?.busy ? '正在修改…' : '修改密码'}</button>
      </fieldset></form><SettingsSaveState {...feedback.password} dirty={!!(password.old || password.fresh)} />
    </Card></section>
    <Modal open={!!saveKey} onClose={() => { void closeSetting(); }} title={saveKey?.existing ? `编辑配置 ${saveKey.key}` : '新增配置项'} width={520} className="ac-setting-editor" footer={<><button type="button" className="ac-btn" disabled={feedback.setting?.busy} onClick={() => { void closeSetting(); }}>取消</button><button type="button" className="ac-btn primary" disabled={feedback.setting?.busy} onClick={submitSetting}>{feedback.setting?.busy ? '正在保存…' : '保存此配置项'}</button></>}>
      {saveKey && <fieldset className="ac-settings-fieldset" disabled={feedback.setting?.busy}>
        <p className="ac-section-note">{APP_POLICY_SETTING_KEY}、{APP_REMINDER_SETTING_KEY} 与 {APP_NBW_LOCAL_ONLY_SETTING_KEY} 是保留配置，请使用 <Link className="ac-link-button" to="/admin/app-clients">App 管理</Link>，不要直接修改 JSON。</p>
        <FormField label="配置键" required htmlFor="setting-key"><input id="setting-key" className="ac-input" maxLength={64} disabled={saveKey.existing} value={saveKey.key} onChange={event => { const key = event.target.value; setSaveKey(value => ({ ...value, key, value: isSensitiveSetting(key) !== isSensitiveSetting(value.key) ? '' : value.value })); updateFeedback('setting', { error: '', notice: '' }); }} /></FormField>
        <FormField label={isSensitiveSetting(saveKey.key) ? '新敏感值（原值永不回填）' : '配置值'} hint="最多 8000 个字符。敏感值留空不提交，不提供查看原值。" htmlFor="setting-value">{isSensitiveSetting(saveKey.key) ? <input id="setting-value" className="ac-input" type="password" autoComplete="new-password" maxLength={8000} value={saveKey.value} onChange={event => setSaveKey(value => ({ ...value, value: event.target.value }))} /> : <textarea id="setting-value" className="ac-textarea" maxLength={8000} value={saveKey.value} onChange={event => setSaveKey(value => ({ ...value, value: event.target.value }))} />}</FormField>
        <SettingsSaveState {...feedback.setting} dirty />
      </fieldset>}
    </Modal>
  </div>;
}

export default function AdminSettings() {
  const { user, accounts } = useAuth();
  const token = accounts?.find(account => String(account.id) === String(user?.id))?.token || '';
  return <AdminLayout active="settings">{user?.role === 'admin' && <AdminSettingsContent key={`${user.id}:${token}`} />}</AdminLayout>;
}
