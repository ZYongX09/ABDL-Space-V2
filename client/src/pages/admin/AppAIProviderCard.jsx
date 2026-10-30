import { useCallback, useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { createProviderEditor, initialProviderState, providerOriginChangeRequiresToken } from '../../appAI/model.js';
import { Card, ErrorBox, FormField, Loading, Pill } from './ui';

// 生产组件共用此视图，SSR 覆盖真实加载/草稿/测试/保存状态，不另造测试 UI。
export function AppAIProviderView({ state, onChange, onSave, onTest, onReload, onCancel, onTokenInput, tokenRef }) {
  const { saved, draft, loading, saving, testing, testResult, testError, needsReload, error, notice } = state;
  const dirty = saved && (draft.base_url !== saved.base_url || draft.model_id !== saved.model_id || draft.token_action !== 'keep');
  const busy = loading || saving || testing;
  const disabled = busy || needsReload;
  const originNeedsToken = providerOriginChangeRequiresToken(saved, draft);
  const testNeedsToken = draft.token_action === 'clear' || (draft.token_action === 'keep' && !saved?.token_configured);
  return <Card title="新版 App AI 服务配置" icon="fa-robot" className="ac-app-ai-card" description="仅用于带新版协议头的 App AI 功能，不影响旧版 App 或网页 AI。保存与加载只管理配置；测试需手动点击。">
    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <p id="app-ai-scope" className="ac-app-note">仅作用于携带 X-ABDL-App-AI:1 协议头的新版 App 功能，包括宝宝新天地的 AI 板块分类。不会更改旧版 App 或网页 AI 的配置；浏览器不会直连模型。未配置令牌时无法使用此 AI，但本站发帖正常；分类失败仅在用户已同意默认板块时回退，不会擅自代选。</p>
      <p id="app-ai-host-policy" className="ac-section-note">不设固定供应商主机白名单，可填写自定义 HTTPS 公网域名与安全基础路径；服务器仍会校验 DNS 公网解析并拒绝私网地址、重定向等不安全请求。不得在地址中填写令牌、账号密码或查询参数。</p>
      <p id="app-ai-protocol" className="ac-app-note">实际使用：OpenAI兼容 Chat Completions协议（POST .../chat/completions），不是 Responses API。基础地址不自动添加 /v1；供应商需要 /v1 时请自行填写。协议为只读说明，不支持在此切换。</p>
      <p id="app-ai-test-policy" className="ac-section-note">测试当前草稿不保存配置、不更新版本；由服务器使用当前地址、模型及令牌操作发送一次固定简短无害提示词，可能产生供应商费用，不会自动重试。只验证收到非空有效文本，原始回复不展示。测试成功不等于已保存，也不代表全部 App AI 功能或模型质量已验证。停止等待不保证服务器调用已停止或不计费。</p>
      {saved && <div id="app-ai-saved-summary" className="ac-app-policy-status" role="status" aria-live="polite">
        <Pill tone={saved.token_configured ? 'green' : 'amber'}>{saved.token_configured ? '已保存令牌：已配置' : '已保存令牌：未配置，无法使用此 AI'}</Pill>
        <span>{saved.token_configured ? '已配置不代表供应商可用；仅手动测试才会发起验证调用。' : '本站发帖仍正常，不会自动使用其他环境令牌。'}服务器只返回是否配置，不返回原令牌或密文。</span>
      </div>}
      {loading && <Loading text="正在读取 App AI 配置…" />}
      <ErrorBox msg={error} />
      {saved && <form id="app-ai-provider-form" onSubmit={event => { event.preventDefault(); onSave?.(); }} autoComplete="off" aria-describedby="app-ai-scope app-ai-host-policy app-ai-protocol app-ai-test-policy" style={{ minWidth: 0, marginTop: 14 }}>
        <fieldset className="ac-app-fieldset" disabled={disabled}>
          <legend className="ac-app-visually-hidden">新版 App AI 服务配置</legend>
          <FormField label="接口基础地址" htmlFor="app-ai-base-url" required hint="填写 HTTPS 公网基础地址及需要的路径；不自动添加 /v1，保存不会测试连接。">
            <input id="app-ai-base-url" className="ac-input" type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={2048} value={draft.base_url} onChange={event => onChange?.({ base_url: event.target.value })} aria-describedby="app-ai-host-policy app-ai-protocol" />
          </FormField>
          <FormField label="模型名称" htmlFor="app-ai-model-id" required hint="模型由服务器调用；不自动获取模型列表，测试使用此处当前草稿名称。">
            <input id="app-ai-model-id" className="ac-input" type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={200} value={draft.model_id} onChange={event => onChange?.({ model_id: event.target.value })} />
          </FormField>
          <FormField label="令牌操作" htmlFor="app-ai-token-action" hint="默认保留现有令牌；密码框留空绝不会自动清除令牌。只有选择替换时才发送新令牌。">
            <select id="app-ai-token-action" className="ac-select" value={draft.token_action} onChange={event => onChange?.({ token_action: event.target.value })}>
              <option value="keep">保留现有令牌（不修改）</option>
              <option value="replace">替换为新令牌</option>
              <option value="clear">清除现有令牌</option>
            </select>
          </FormField>
          {originNeedsToken && <p id="app-ai-origin-warning" role="alert" className="ac-app-note">更换接口来源后不能保留原令牌，防止凭据泄露到新主机。测试须替换新令牌；保存也可选择清除并勾选确认。</p>}
          <FormField label="新 API 令牌" htmlFor="app-ai-token" hint="始终不回填已保存令牌；仅替换时填写。保存成功、重新加载、取消、离开页面或切换账号会清空密码框；测试不会将令牌存入草稿或保存。">
            <input ref={tokenRef} id="app-ai-token" className="ac-input" type="password" defaultValue="" autoComplete="new-password" autoCapitalize="none" spellCheck={false} maxLength={8192} disabled={draft.token_action !== 'replace'} required={draft.token_action === 'replace'} onInput={onTokenInput} aria-describedby="app-ai-token-safety" />
            <span id="app-ai-token-safety" className="ac-section-note">请勿在其他字段填写令牌。此页面不展示令牌预览；令牌只通过已认证的站内 API 发送，测试时由服务器调用供应商。</span>
          </FormField>
          {draft.token_action === 'clear' && <label className="ac-check-row"><input id="app-ai-clear-confirm" type="checkbox" checked={draft.clear_confirmed} onChange={event => onChange?.({ clear_confirmed: event.target.checked })} /><span>我确认清除令牌；新版 App 此 AI 将不可用，本站发帖不受影响。</span></label>}
          {testNeedsToken && <p id="app-ai-test-token-warning" className="ac-section-note">当前草稿没有可用令牌，不能测试；请替换并填写新令牌，或保留已配置的同源令牌。</p>}
          <div className="ac-action-group" style={{ minWidth: 0 }}>
            <button type="submit" className="ac-btn primary" style={{ justifySelf: 'start', maxWidth: '100%', whiteSpace: 'normal' }} disabled={originNeedsToken || (draft.token_action === 'clear' && !draft.clear_confirmed)}>保存 App AI 配置</button>
            <button type="button" className="ac-btn" style={{ maxWidth: '100%', whiteSpace: 'normal' }} disabled={originNeedsToken || testNeedsToken} onClick={onTest} aria-describedby="app-ai-test-policy">测试当前草稿（不保存）</button>
          </div>
        </fieldset>
      </form>}
      <p id="app-ai-form-status" role="status" aria-live="polite" className="ac-section-note">{notice || (saving ? '正在保存 App AI 配置…' : needsReload ? '未确认最新配置，必须成功重新加载后才能保存或测试；不会自动覆盖冲突。' : dirty ? '表单有未保存更改，尚未生效。' : saved ? '当前地址、模型与已保存配置一致；默认保留令牌。' : '')}</p>
      <div id="app-ai-test-status" role="status" aria-live="polite" aria-busy={testing}>
        {testing && <Loading text="正在测试当前草稿（不保存）…最多等待 20 秒，不会自动重试。" />}
        <ErrorBox msg={testError} />
        {testResult && <div className="ac-app-policy-status" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <Pill tone="green">当前草稿测试成功（未保存）</Pill>
          <span>协议：OpenAI 兼容 Chat Completions（{testResult.protocol}），不是 Responses API。</span>
          <span>测试模型：{testResult.model_id}；服务端耗时：{testResult.latency_ms} ms。</span>
          <span>回复状态：{testResult.result_text} 原始回复不展示。</span>
          <span>未保存配置或更新版本；不代表全部 App AI 功能或模型质量已验证。</span>
        </div>}
      </div>
      <div className="ac-action-group" style={{ marginTop: 14, minWidth: 0 }}>
        <button type="button" className="ac-btn" style={{ maxWidth: '100%', whiteSpace: 'normal' }} disabled={busy} onClick={onReload}>重新加载已保存 AI 配置</button>
        {busy && <button type="button" className="ac-btn" onClick={onCancel}>{testing ? '停止等待测试' : '取消当前请求'}</button>}
      </div>
    </div>
  </Card>;
}

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
    void current.load();
    return () => {
      window.removeEventListener('auth-session-changing', sessionChanging);
      current.dispose();
      if (editor.current === current) editor.current = null;
    };
  }, []);
  // 密码非受控且默认空白，只在手动操作调用栈读取；onInput 仅废弃结果，不传令牌。
  return <AppAIProviderView state={state} tokenRef={clearToken} onChange={patch => editor.current?.change(patch)} onTokenInput={() => editor.current?.tokenChanged()} onSave={() => void editor.current?.save(tokenInput.current?.value || '')} onTest={() => void editor.current?.test(tokenInput.current?.value || '')} onReload={() => void editor.current?.load()} onCancel={() => editor.current?.cancel()} />;
}
