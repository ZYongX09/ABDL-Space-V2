import { useCallback, useEffect, useState } from 'react';
import { adminAPI } from '../../api';
import { useToast } from '../../contexts/ToastContext';
import AdminLayout from './layout';
import { Card, FormField, Loading } from './ui';

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

function emptyPost() {
  return { content: '', author: '', created_at: null };
}

export default function AdminSiteAccess() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await adminAPI.siteAccess();
      setForm({
        web_mode: result.web_mode || 'off',
        web_message: result.web_message || '',
        web_login_prompt: result.web_login_prompt || '',
        app_mode: result.app_mode || 'off',
        app_message: result.app_message || '',
        fake_posts: Array.isArray(result.fake_posts) ? result.fake_posts.map(post => ({ ...emptyPost(), ...post })) : [],
        app_download_open: result.app_download_open === true,
        revision: result.revision || '0',
      });
    } catch (error) {
      toast.error(`站点状态加载失败：${error.message || '未知错误'}`);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const patch = (key, value) => setForm(current => (current ? { ...current, [key]: value } : current));

  const patchPost = (index, key, value) => setForm(current => {
    if (!current) return current;
    const next = current.fake_posts.map((post, position) => (position === index ? { ...post, [key]: value } : post));
    return { ...current, fake_posts: next };
  });

  const addPost = () => setForm(current => (current && current.fake_posts.length < 20
    ? { ...current, fake_posts: [...current.fake_posts, emptyPost()] }
    : current));

  const removePost = (index) => setForm(current => (current
    ? { ...current, fake_posts: current.fake_posts.filter((_post, position) => position !== index) }
    : current));

  const save = async () => {
    if (!form) return;
    if (form.fake_posts.some(post => !post.content.trim())) {
      toast.error('列表内容不能为空');
      return;
    }
    setSaving(true);
    try {
      const saved = await adminAPI.saveSiteAccess({
        web_mode: form.web_mode,
        web_message: form.web_message.trim(),
        web_login_prompt: form.web_login_prompt.trim(),
        app_mode: form.app_mode,
        app_message: form.app_message.trim(),
        fake_posts: form.fake_posts.map(post => ({
          content: post.content.trim(),
          author: (post.author || '').trim(),
          created_at: Number.isSafeInteger(post.created_at) ? post.created_at : null,
        })),
        app_download_open: form.app_download_open === true,
        revision: form.revision,
      });
      setForm(current => ({ ...current, ...saved }));
      toast.success('站点状态已保存');
    } catch (error) {
      toast.error(error.message || '保存失败');
      if (error.status === 409) await load();
    } finally {
      setSaving(false);
    }
  };

  if (!form) {
    return (
      <AdminLayout active="site-access">
        <Loading text="正在加载站点状态…" />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout active="site-access">
      <div className="ac-page-stack">
        <Card title="网页端" description="未登录访问与页面可用范围。切换后约 15 秒内生效，已打开的页面会自动刷新。">
          <div className="ac-form-grid">
            <fieldset className="sa-access-choices">
              <legend className="ac-field-label">访问方式</legend>
              {WEB_OPTIONS.map(option => (
                <label key={option.value} className={`sa-access-choice${form.web_mode === option.value ? ' is-active' : ''}`}>
                  <input
                    type="radio"
                    name="web-mode"
                    value={option.value}
                    checked={form.web_mode === option.value}
                    onChange={() => patch('web_mode', option.value)}
                  />
                  <span className="sa-access-choice-label">{option.label}</span>
                  <span className="sa-access-choice-hint">{option.hint}</span>
                </label>
              ))}
            </fieldset>
            <FormField label="暂停提示" hint="暂停服务时显示在错误页上的文字，留空则使用默认提示。">
              <textarea
                className="ac-textarea"
                maxLength={2000}
                value={form.web_message}
                onChange={event => patch('web_message', event.target.value)}
                placeholder="网站暂时无法访问，请稍后再试。"
              />
            </FormField>
            <FormField label="登录提示" hint="未登录被拦到登录页时显示在表单上方的文字，留空则使用默认提示。">
              <input
                className="ac-input"
                maxLength={500}
                value={form.web_login_prompt}
                onChange={event => patch('web_login_prompt', event.target.value)}
                placeholder="请登录后继续访问。"
              />
            </FormField>
            <label className="sa-access-choice" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                checked={form.app_download_open === true}
                onChange={event => patch('app_download_open', event.target.checked)}
              />
              <span>
                <span className="sa-access-choice-label">暂停服务时放行 App 下载页</span>
                <span className="sa-access-choice-hint">开启后 /app 仍可访问；仅在「暂停服务」下生效。</span>
              </span>
            </label>
          </div>
        </Card>

        <Card title="App 端" description="由后端统一判定原生客户端；网页与其他浏览器请求不受影响。">
          <div className="ac-form-grid">
            <fieldset className="sa-access-choices">
              <legend className="ac-field-label">访问方式</legend>
              {APP_OPTIONS.map(option => (
                <label key={option.value} className={`sa-access-choice${form.app_mode === option.value ? ' is-active' : ''}`}>
                  <input
                    type="radio"
                    name="app-mode"
                    value={option.value}
                    checked={form.app_mode === option.value}
                    onChange={() => patch('app_mode', option.value)}
                  />
                  <span className="sa-access-choice-label">{option.label}</span>
                  <span className="sa-access-choice-hint">{option.hint}</span>
                </label>
              ))}
            </fieldset>
            <FormField label="拒绝提示" hint="未认证账号访问其他页面时返回的文字，留空则使用默认提示。">
              <input
                className="ac-input"
                maxLength={500}
                value={form.app_message}
                onChange={event => patch('app_message', event.target.value)}
                placeholder="内容暂时不可用，请稍后再试。"
              />
            </FormField>
            <div className="sa-access-posts-head">
              <div>
                <div className="ac-field-label">时间线内容</div>
                <p className="ac-section-note">仅「仅认证用户」时对未认证账号展示，按列表顺序排列，最多 20 条；纯文本，不含图片。</p>
              </div>
              <button type="button" className="ac-btn" onClick={addPost} disabled={form.fake_posts.length >= 20}>
                <i className="fa-solid fa-plus" aria-hidden="true" /> 添加一条
              </button>
            </div>
            {form.fake_posts.length === 0 && <p className="ac-section-note">尚未添加内容，此时未认证账号会看到空时间线。</p>}
            {form.fake_posts.map((post, index) => (
              <div className="sa-access-post" key={index}>
                <div className="sa-access-post-head">
                  <span className="ac-cell-muted">第 {index + 1} 条</span>
                  <button type="button" className="ac-btn danger" onClick={() => removePost(index)}>
                    删除
                  </button>
                </div>
                <FormField label="正文" required>
                  <textarea
                    className="ac-textarea"
                    maxLength={2000}
                    value={post.content}
                    onChange={event => patchPost(index, 'content', event.target.value)}
                    placeholder="显示在时间线里的文字"
                  />
                </FormField>
                <FormField label="作者昵称" hint="留空使用默认昵称。">
                  <input
                    className="ac-input"
                    maxLength={40}
                    value={post.author}
                    onChange={event => patchPost(index, 'author', event.target.value)}
                  />
                </FormField>
              </div>
            ))}
          </div>
        </Card>

        <div className="sa-access-savebar">
          <button type="button" className="ac-btn" onClick={load} disabled={saving}>重新加载</button>
          <button type="button" className="ac-btn primary" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存站点状态'}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
