import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import AdminLayout from './layout';
import { Card, ErrorBox, FormField, Loading, Pill, useConfirm } from './ui';
import './siteAccess.css';

const WEB_OPTIONS = [
  { value: 'off', label: '正常', hint: '所有页面按现有规则访问。' },
  { value: 'limited', label: '仅登录访问', hint: '未登录访问内容页会跳转到登录页，同时关闭网页注册。' },
  { value: 'closed', label: '暂停服务', hint: '除管理后台与登录页外，所有页面显示下方的提示。' },
];
const APP_OPTIONS = [
  { value: 'off', label: '正常', hint: 'App 注册与浏览不受影响。' },
  { value: 'limited', label: '禁止注册', hint: '后端拒绝 App 发起的新注册。' },
  { value: 'closed', label: '仅认证用户', hint: '未通过宝宝认证的账号只能登录、认证，时间线只显示下方列表。' },
];
const emptyPost = () => ({ content: '', author: '', created_at: null });

// 既有 PUT 返回完整服务器文档及新 revision，不能用提交草稿补齐缺失回执。
const readSavedAccess = (value, previousRevision) => {
  const text = (entry, max) => typeof entry === 'string' && entry.length <= max;
  const valid = value && typeof value === 'object' && !Array.isArray(value)
    && ['off', 'limited', 'closed'].includes(value.web_mode) && ['off', 'limited', 'closed'].includes(value.app_mode)
    && text(value.web_message, 2000) && text(value.web_login_prompt, 500) && text(value.app_message, 500)
    && typeof value.app_download_open === 'boolean' && typeof value.revision === 'string' && value.revision.trim()
    && value.revision !== previousRevision && Array.isArray(value.fake_posts) && value.fake_posts.length <= 20
    && value.fake_posts.every(post => post && typeof post === 'object' && !Array.isArray(post)
      && text(post.content, 2000) && post.content.trim() && text(post.author, 40)
      && (post.created_at === null || Number.isSafeInteger(post.created_at) && post.created_at >= 0 && post.created_at <= 4_102_444_800));
  if (!valid) throw new Error('站点状态保存回执不完整，结果未知');
  return accessDraft(value);
};
const accessDraft = value => ({
  web_mode: value.web_mode || 'off', web_message: value.web_message || '', web_login_prompt: value.web_login_prompt || '',
  app_mode: value.app_mode || 'off', app_message: value.app_message || '',
  fake_posts: Array.isArray(value.fake_posts) ? value.fake_posts.map(post => ({ ...emptyPost(), ...post })) : [],
  app_download_open: value.app_download_open === true, revision: value.revision || '0',
});

export function SiteAccessView({ state, postEditors = [], onTogglePost, onPatch, onPatchPost, onAdd, onRemove, onMove, onSave, onReload }) {
  const { form, saved, loading, saving, error, notice, needsReload } = state;
  const dirty = !!saved && JSON.stringify(form) !== JSON.stringify(saved);
  if (!form) return <div className="ac-page-stack ac-site-access">{loading && <Loading text="正在加载站点状态…" />}<ErrorBox msg={error} />{!loading && <button type="button" className="ac-btn" onClick={onReload}>重试读取站点状态</button>}</div>;
  const patch = onPatch;
  return <div className="ac-page-stack ac-site-access">
    <div className="sa-access-overview" role="status" aria-live="polite"><strong>已保存状态（不是当前草稿）</strong><div className="ac-action-group"><Pill tone={saved?.web_mode === 'closed' ? 'amber' : 'slate'}>网页：{WEB_OPTIONS.find(option => option.value === saved?.web_mode)?.label || '未知'}</Pill><Pill tone={saved?.app_mode === 'closed' ? 'amber' : 'slate'}>App：{APP_OPTIONS.find(option => option.value === saved?.app_mode)?.label || '未知'}</Pill><span>/app 额外放行：{saved?.app_download_open ? '已配置开启，仅网页暂停时生效' : '关闭'}；内容 {saved?.fake_posts.length ?? '未知'} 条；版本 {saved?.revision || '未提供'}</span></div></div>
    <nav className="sa-access-nav" aria-label="站点状态模块"><a href="#access-web">网页端</a><a href="#access-app">App 端</a><a href="#access-posts">时间线内容（{form.fake_posts.length}/20）</a><a href="#access-save">核对与保存</a></nav>
    {loading && <Loading text="正在重新读取，成功前保留当前草稿…" />}
    <ErrorBox msg={error} />
    <fieldset className="sa-access-editor" disabled={saving || loading}>
      <legend className="sa-access-sr">站点访问范围草稿</legend>
      <section id="access-web"><Card title="网页端" description="以下为未保存草稿。保存后约 15 秒内生效，已打开页面会自动刷新。">
        <fieldset className="sa-access-choices"><legend className="ac-field-label">访问方式</legend>{WEB_OPTIONS.map(option => <label key={option.value} className={`sa-access-choice${form.web_mode === option.value ? ' is-active' : ''}`}><input type="radio" name="web-mode" value={option.value} checked={form.web_mode === option.value} onChange={() => patch('web_mode', option.value)} /><span className="sa-access-choice-label">{option.label}</span><span className="sa-access-choice-hint">{option.value === 'closed' && form.app_download_open ? '除管理后台、登录页与 /app 下载页外，所有页面显示下方的提示。' : option.hint}</span></label>)}</fieldset>
        {form.web_mode === 'closed' && <label className="sa-access-choice sa-access-download"><input type="checkbox" aria-label="下载 App 开关" aria-describedby="app-download-switch-description" checked={form.app_download_open === true} onChange={event => patch('app_download_open', event.target.checked)} /><span><span className="sa-access-choice-label">下载 App 开关</span><span id="app-download-switch-description" className="sa-access-choice-hint">开启后仅额外放行 /app 下载页，其他前台页面仍暂停服务。</span></span></label>}
        {form.web_mode !== 'closed' && <p className="ac-section-note">下载页额外放行草稿：{form.app_download_open ? '开启' : '关闭'}。仅暂停服务时生效；切换访问方式不会清除该值。</p>}
        <details className="sa-access-details"><summary>编辑暂停与登录提示（留空使用默认文案）</summary><div className="ac-form-grid">
          <FormField label="暂停提示" htmlFor="access-web-message" hint={`${form.web_message.length} / 2000 字符；只在暂停服务时展示。`}><textarea id="access-web-message" className="ac-textarea" maxLength={2000} value={form.web_message} onChange={event => patch('web_message', event.target.value)} placeholder="网站暂时无法访问，请稍后再试。" /></FormField>
          <FormField label="登录提示" htmlFor="access-web-login" hint={`${form.web_login_prompt.length} / 500 字符；未登录被拦到登录页时展示。`}><input id="access-web-login" className="ac-input" maxLength={500} value={form.web_login_prompt} onChange={event => patch('web_login_prompt', event.target.value)} placeholder="请登录后继续访问。" /></FormField>
        </div></details>
      </Card></section>
      <section id="access-app"><Card title="App 端" description="由后端统一判定原生客户端；网页与其他浏览器请求不受影响。">
        <fieldset className="sa-access-choices"><legend className="ac-field-label">访问方式</legend>{APP_OPTIONS.map(option => <label key={option.value} className={`sa-access-choice${form.app_mode === option.value ? ' is-active' : ''}`}><input type="radio" name="app-mode" value={option.value} checked={form.app_mode === option.value} onChange={() => patch('app_mode', option.value)} /><span className="sa-access-choice-label">{option.label}</span><span className="sa-access-choice-hint">{option.hint}</span></label>)}</fieldset>
        <FormField label="拒绝提示" htmlFor="access-app-message" hint={`${form.app_message.length} / 500 字符；留空使用默认提示。`}><input id="access-app-message" className="ac-input" maxLength={500} value={form.app_message} onChange={event => patch('app_message', event.target.value)} placeholder="内容暂时不可用，请稍后再试。" /></FormField>
        <p className="ac-section-note">当前草稿为「{APP_OPTIONS.find(option => option.value === form.app_mode)?.label}」。时间线内容仅在「仅认证用户」时向未认证账号展示，其他模式保留列表但不展示。</p>
      </Card></section>
      <section id="access-posts"><Card title={`App 时间线内容 · ${form.fake_posts.length} / 20 条`} description="顺序即展示顺序。纯文本、不含图片；展开单条编辑不会提交任何更改。" action={<button type="button" className="ac-btn" onClick={onAdd} disabled={form.fake_posts.length >= 20}>添加一条</button>}>
        {form.fake_posts.length === 0 && <p className="ac-section-note">尚未添加内容（0 条）。仅认证用户模式下，未认证账号会看到空时间线。</p>}
        {form.fake_posts.length >= 20 && <p role="status" className="ac-section-note">已达 20 条上限；可编辑、排序或删除后添加。</p>}
        <div className="sa-access-post-list">{form.fake_posts.map((post, index) => <details className="sa-access-post" key={postEditors[index]?.id ?? index} open={postEditors[index]?.open === true} onToggle={event => onTogglePost?.(index, event.currentTarget.open)}>
          <summary>第 {index + 1} 条 · {post.author || '默认昵称'} · {post.content.trim().slice(0, 60) || '待填写正文'}</summary>
          <div className="sa-access-post-body"><div className="ac-action-group"><button type="button" className="ac-btn" disabled={index === 0} aria-label={`上移第 ${index + 1} 条`} onClick={() => onMove(index, -1)}>上移</button><button type="button" className="ac-btn" disabled={index === form.fake_posts.length - 1} aria-label={`下移第 ${index + 1} 条`} onClick={() => onMove(index, 1)}>下移</button><button type="button" className="ac-btn danger" aria-label={`删除第 ${index + 1} 条`} onClick={() => onRemove(index)}>删除</button></div>
            <FormField label="正文" required htmlFor={`access-post-content-${index}`} hint={`${post.content.length} / 2000 字符；不能为空。`}><textarea id={`access-post-content-${index}`} className="ac-textarea" rows={4} maxLength={2000} required value={post.content} onChange={event => onPatchPost(index, 'content', event.target.value)} /></FormField>
            <FormField label="作者昵称" htmlFor={`access-post-author-${index}`} hint="留空使用默认昵称，最多 40 字符。"><input id={`access-post-author-${index}`} className="ac-input" maxLength={40} value={post.author} onChange={event => onPatchPost(index, 'author', event.target.value)} /></FormField>
          </div>
        </details>)}</div>
      </Card></section>
    </fieldset>
    <section id="access-save" className="sa-access-savebar"><div><p role="status" aria-live="polite">{saving ? '正在保存站点状态…请勿重复提交。' : notice || (needsReload ? '当前草稿保留；服务器状态待确认，必须成功重新加载后才能再次保存。' : dirty ? '有未保存更改，尚未生效。' : '当前草稿与已保存状态一致。')}</p><p className="ac-section-note">本页仍使用原有单次站点状态保存，包含网页、App、下载开关和全部 {form.fake_posts.length} 条内容；不提交其他管理页面。</p></div><div className="ac-action-group"><button type="button" className="ac-btn" onClick={onReload} disabled={saving || loading}>重新加载</button><button type="button" className="ac-btn primary" onClick={onSave} disabled={saving || loading || !dirty || needsReload}>{saving ? '保存中…' : '保存站点状态'}</button></div></section>
  </div>;
}

export function SiteAccessContent() {
  const confirm = useConfirm();
  const [state, setState] = useState({ form: null, saved: null, loading: true, saving: false, error: '', notice: '', needsReload: false });
  const [postEditors, setPostEditors] = useState([]);
  const postSequence = useRef(0);
  const life = useRef({ alive: false, generation: 0, request: 0, busy: false });
  const begin = () => {
    const current = life.current, generation = current.generation, request = ++current.request;
    return () => current.alive && current.generation === generation && current.request === request;
  };
  const load = useCallback(async () => {
    if (!life.current.alive || life.current.busy) return;
    life.current.busy = true;
    const current = begin();
    setState(value => ({ ...value, loading: true, error: '', notice: '' }));
    try {
      const result = await adminAPI.siteAccess();
      if (!current()) return;
      const form = accessDraft(result);
      setPostEditors(form.fake_posts.map(post => ({ id: ++postSequence.current, open: !post.content })));
      setState({ form, saved: form, loading: false, saving: false, error: '', notice: '已读取服务器状态。', needsReload: false });
    } catch (error) { if (current()) setState(value => ({ ...value, loading: false, error: `站点状态读取失败${error.status ? `（${error.status}）` : ''}；当前草稿保留，未将失败当作默认状态。` })); }
    finally { if (current()) life.current.busy = false; }
  }, []);
  useEffect(() => {
    life.current.alive = true;
    const stop = () => { life.current.alive = false; life.current.generation++; life.current.busy = false; setState(value => ({ ...value, loading: false, saving: false, needsReload: true, error: '管理员会话已变更，请重新打开此页；旧请求结果已废弃。' })); };
    window.addEventListener('auth-session-changing', stop); void load();
    return () => { window.removeEventListener('auth-session-changing', stop); life.current.alive = false; life.current.generation++; life.current.busy = false; };
  }, [load]);
  const change = transform => setState(value => ({ ...value, form: transform(value.form), error: value.needsReload ? value.error : '', notice: '' }));
  const reload = async () => {
    if (!life.current.alive || life.current.busy) return;
    const generation = life.current.generation;
    const dirty = state.saved && JSON.stringify(state.form) !== JSON.stringify(state.saved);
    if (dirty && !await confirm({ title: '重新加载站点状态', message: '仅在读取成功后替换当前全部站点状态草稿。409 不会自动合并、覆盖或重放；失败仍保留输入。', okText: '确认替换并读取' })) return;
    if (life.current.alive && life.current.generation === generation) void load();
  };
  const save = async () => {
    if (!state.form || !life.current.alive || life.current.busy || state.needsReload) return;
    const form = state.form;
    if (form.fake_posts.length > 20 || form.fake_posts.some(post => !post.content.trim())) { setState(value => ({ ...value, error: '时间线内容不能为空，最多 20 条；请展开未完成条目补全。' })); return; }
    const payload = { web_mode: form.web_mode, web_message: form.web_message.trim(), web_login_prompt: form.web_login_prompt.trim(), app_mode: form.app_mode, app_message: form.app_message.trim(), fake_posts: form.fake_posts.map(post => ({ content: post.content.trim(), author: (post.author || '').trim(), created_at: Number.isSafeInteger(post.created_at) ? post.created_at : null })), app_download_open: form.app_download_open === true, revision: form.revision };
    life.current.busy = true;
    const current = begin();
    setState(value => ({ ...value, saving: true, error: '', notice: '' }));
    try {
      const result = await adminAPI.saveSiteAccess(payload);
      if (!current()) return;
      const saved = readSavedAccess(result, payload.revision);
      setState({ form: saved, saved, loading: false, saving: false, error: '', notice: '站点状态已确认保存。网页端约 15 秒内刷新生效。', needsReload: false });
    } catch (error) {
      if (current()) setState(value => ({ ...value, saving: false, needsReload: true, error: error.status === 409 ? '站点状态已被其他管理员更新（409）。当前草稿完整保留，未自动重新加载、合并或重试。请先复制所需内容，再显式重新加载核对。' : `保存未确认成功${error.status ? `（${error.status}）` : ''}，当前草稿保留。中断不代表服务端未写入，请重新加载核对后再提交。` }));
    } finally { if (current()) life.current.busy = false; }
  };
  const addPost = () => {
    if (!state.form || state.form.fake_posts.length >= 20) return;
    setPostEditors(editors => [...editors, { id: ++postSequence.current, open: true }]);
    change(form => ({ ...form, fake_posts: [...form.fake_posts, emptyPost()] }));
  };
  const removePost = index => {
    setPostEditors(editors => editors.filter((_editor, position) => position !== index));
    change(form => ({ ...form, fake_posts: form.fake_posts.filter((_post, position) => position !== index) }));
  };
  const movePost = (index, direction) => {
    const destination = index + direction;
    if (!state.form || destination < 0 || destination >= state.form.fake_posts.length) return;
    setPostEditors(editors => { const next = [...editors]; [next[index], next[destination]] = [next[destination], next[index]]; return next; });
    change(form => { const posts = [...form.fake_posts]; [posts[index], posts[destination]] = [posts[destination], posts[index]]; return { ...form, fake_posts: posts }; });
  };
  return <SiteAccessView state={state} postEditors={postEditors} onTogglePost={(index, open) => setPostEditors(editors => editors[index]?.open === open ? editors : editors.map((editor, position) => position === index ? { ...editor, open } : editor))} onPatch={(key, value) => change(form => ({ ...form, [key]: value }))} onPatchPost={(index, key, value) => change(form => ({ ...form, fake_posts: form.fake_posts.map((post, position) => position === index ? { ...post, [key]: value } : post) }))} onAdd={addPost} onRemove={removePost} onMove={movePost} onSave={save} onReload={reload} />;
}

export default function AdminSiteAccess() {
  const { user, accounts } = useAuth();
  const token = accounts?.find(account => String(account.id) === String(user?.id))?.token || '';
  return <AdminLayout active="site-access">{user?.role === 'admin' && <SiteAccessContent key={`${user.id}:${token}`} />}</AdminLayout>;
}
