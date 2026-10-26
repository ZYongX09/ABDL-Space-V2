import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { createProviderEditor, DEFAULT_APP_AI_HOSTS, initialProviderState, providerOriginChangeRequiresToken } from '../../appAI/model.js';
import { Card, ErrorBox, FormField, Loading, Pill } from './ui';

// 继承 AppClientsContent 的 AdminLayout 与按管理员身份/会话 key 的卸载边界，不另嵌布局。
export default function AppAIProviderCard() {
  const [state, setState] = useState(initialProviderState);
  const editor = useRef(null);
  const tokenInput = useRef(null);
  const clearToken = useCallback(node => {
    if (tokenInput.current) tokenInput.current.value = '';
    tokenInput.current = node;
    if (node) node.value = '';
  }, []);
  useEffect(() => {
    // StrictMode 的 setup/cleanup/setup 各自创建独立代次，旧响应不能回写。
    const current = createProviderEditor(adminAPI, { onChange: setState, clearToken: () => { if (tokenInput.current) tokenInput.current.value = ''; } });
    editor.current = current;
    const sessionChanging = () => {
      current.dispose();
      setState({ ...initialProviderState(), loading: false, error: '管理员会话已变更，请在当前账号下重新打开管理页面。' });
    };
    window.addEventListener('auth-session-changing', sessionChanging);
    current.load();
    return () => {
      window.removeEventListener('auth-session-changing', sessionChanging);
      current.dispose();
      if (editor.current === current) editor.current = null;
    };
  }, []);
  const { saved, draft, loading, saving, needsReload, error, notice } = state;
  const change = patch => editor.current?.change(patch);
  const save = event => {
    event.preventDefault();
    // 密码框非受控且默认空白；不写入 React 状态、URL、日志、存储或错误消息。
    void editor.current?.save(tokenInput.current?.value || '');
  };
  const dirty = saved && (draft.base_url !== saved.base_url || draft.model_id !== saved.model_id || draft.token_action !== 'keep');
  const disabled = loading || saving || needsReload;
  const originNeedsToken = providerOriginChangeRequiresToken(saved, draft);
  return <Card title="新版 App AI 服务配置" icon="fa-robot" className="ac-app-ai-card" description="仅用于带新版协议头的 App AI 功能，不影响旧版 App 或网页 AI。保存与加载只管理配置，不自动调用供应商。">
    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <p id="app-ai-scope" className="ac-app-note">仅作用于携带 X-ABDL-App-AI:1 协议头的新版 App 功能，包括宝宝新天地的 AI 板块分类。不会更改旧版 App 或网页 AI 的配置；浏览器不会直连模型，也不提供任意接口试调用。未配置令牌时无法使用此 AI，但本站发帖正常；分类失败仅在用户已同意默认板块时回退，不会擅自代选。</p>
      <p id="app-ai-host-policy" className="ac-section-note">接口必须使用 HTTPS，且主机获服务器批准。默认批准主机：{DEFAULT_APP_AI_HOSTS.join('、')}。自定义域名必须先由服务器环境批准，本表单不能放开任意地址；不得在地址中填写令牌、账号密码或查询参数。</p>
      {saved && <div id="app-ai-saved-summary" className="ac-app-policy-status" role="status" aria-live="polite">
        <Pill tone={saved.token_configured ? 'green' : 'amber'}>{saved.token_configured ? '已保存令牌：已配置' : '已保存令牌：未配置，无法使用此 AI'}</Pill>
        <span>{saved.token_configured ? '已配置不代表已验证供应商可用；此页面不会发起验证调用。' : '本站发帖仍正常，不会自动使用其他环境令牌。'}服务器只返回是否配置，不返回原令牌或密文。</span>
      </div>}
      {loading && <Loading text="正在读取 App AI 配置…" />}
      <ErrorBox msg={error} />
      {saved && <form id="app-ai-provider-form" onSubmit={save} autoComplete="off" aria-describedby="app-ai-scope app-ai-host-policy" style={{ minWidth: 0, marginTop: 14 }}>
        <fieldset className="ac-app-fieldset" disabled={disabled}>
          <legend className="ac-app-visually-hidden">新版 App AI 服务配置</legend>
          <FormField label="接口基础地址" htmlFor="app-ai-base-url" required hint="填写获批准供应商的 HTTPS 基础地址；保存仅更新配置，不会测试连接。">
            <input id="app-ai-base-url" className="ac-input" type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={2048} value={draft.base_url} onChange={event => change({ base_url: event.target.value })} aria-describedby="app-ai-host-policy" />
          </FormField>
          <FormField label="模型名称" htmlFor="app-ai-model-id" required hint="模型由服务器调用；此页面不会自动获取模型列表或发起生成。">
            <input id="app-ai-model-id" className="ac-input" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={200} value={draft.model_id} onChange={event => change({ model_id: event.target.value })} />
          </FormField>
          <FormField label="令牌操作" htmlFor="app-ai-token-action" hint="默认保留现有令牌；密码框留空绝不会自动清除令牌。只有选择替换时才发送新令牌。">
            <select id="app-ai-token-action" className="ac-select" value={draft.token_action} onChange={event => change({ token_action: event.target.value })}>
              <option value="keep">保留现有令牌（不修改）</option>
              <option value="replace">替换为新令牌</option>
              <option value="clear">清除现有令牌</option>
            </select>
          </FormField>
          {originNeedsToken && <p id="app-ai-origin-warning" role="alert" className="ac-app-note">更换接口来源后不能保留原令牌，防止凭据泄露到新主机。请选择替换新令牌，或选择清除并勾选确认。</p>}
          <FormField label="新 API 令牌" htmlFor="app-ai-token" hint="始终不回填已保存令牌；仅替换时填写。保存成功、取消、离开页面或切换账号会清空密码框，不保存草稿。">
            <input ref={clearToken} id="app-ai-token" className="ac-input" type="password" defaultValue="" autoComplete="new-password" autoCapitalize="none" spellCheck={false} maxLength={8192} disabled={draft.token_action !== 'replace'} required={draft.token_action === 'replace'} aria-describedby="app-ai-token-safety" />
            <span id="app-ai-token-safety" className="ac-section-note">请勿在其他字段填写令牌。此页面不展示令牌预览，也不发送到模型供应商。</span>
          </FormField>
          {draft.token_action === 'clear' && <label className="ac-check-row"><input id="app-ai-clear-confirm" type="checkbox" checked={draft.clear_confirmed} onChange={event => change({ clear_confirmed: event.target.checked })} /><span>我确认清除令牌；新版 App 此 AI 将不可用，本站发帖不受影响。</span></label>}
          <button type="submit" className="ac-btn primary" style={{ justifySelf: 'start', maxWidth: '100%', whiteSpace: 'normal' }} disabled={originNeedsToken || (draft.token_action === 'clear' && !draft.clear_confirmed)}>保存 App AI 配置</button>
        </fieldset>
      </form>}
      <p id="app-ai-form-status" role="status" aria-live="polite" className="ac-section-note">{notice || (saving ? '正在保存 App AI 配置…' : needsReload ? '未确认最新配置，必须成功重新加载后才能保存；不会自动覆盖冲突。' : dirty ? '表单有未保存更改，尚未生效。' : saved ? '当前地址、模型与已保存配置一致；默认保留令牌。' : '')}</p>
      <div className="ac-action-group" style={{ marginTop: 14, minWidth: 0 }}>
        <button type="button" className="ac-btn" style={{ maxWidth: '100%', whiteSpace: 'normal' }} disabled={loading || saving} onClick={() => void editor.current?.load()}>重新加载已保存 AI 配置</button>
        {(loading || saving) && <button type="button" className="ac-btn" onClick={() => editor.current?.cancel()}>取消当前请求</button>}
      </div>
    </div>
  </Card>;
}
