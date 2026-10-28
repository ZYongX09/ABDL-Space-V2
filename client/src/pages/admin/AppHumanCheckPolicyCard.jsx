import { useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { createHumanPolicyEditor, HUMAN_POLICY_LIMITS, HUMAN_POLICY_MODES, initialHumanPolicyState, isHumanPolicyDirty } from '../../appHumanCheck/model.js';
import { Card, ErrorBox, FormField, Loading, Pill } from './ui';

const NUMERIC_FIELDS = [
  ['email_window_seconds', '邮箱观察窗口（秒）', '同一邮箱的新协议发送风险观察窗口，60–86400 秒。'],
  ['email_threshold', '邮箱次数阈值', '1–20；用于风险判断，不替代现有邮件硬限流。'],
  ['source_window_seconds', '来源观察窗口（秒）', '可信来源的新协议发送风险观察窗口，60–86400 秒。'],
  ['source_threshold', '来源次数阈值', '1–200；仅可信来源证据参与来源风险判断。'],
  ['source_distinct_emails', '来源不同邮箱数阈值', '1–50，且不能超过来源次数阈值。'],
];

// 生产组件也使用此视图；SSR 测试验证各状态的实际可见内容，不另造测试版 UI。
export function AppHumanCheckPolicyView({ state, onChange, onSave, onReload, onCancel }) {
  const { saved, draft, loading, saving, needsReload, error, notice } = state;
  const dirty = isHumanPolicyDirty(saved, draft);
  const disabled = loading || saving || needsReload;
  return <Card title="新版 App 注册验证码安全验证" icon="fa-shield-halved" className="ac-app-human-check-card" description="仅控制新版 App 新协议的注册验证码首次发送与重发，不影响旧版 App 或网页注册。">
    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <p id="app-human-scope" className="ac-app-note">仅适用于新版 App 新协议的注册验证码邮件（type=register），包括首次发送与重发。429 硬限流始终优先；完成安全验证也不能绕过限流。旧版 App、网页注册和其他验证码用途不受此策略影响。</p>
      <p id="app-human-boundary" className="ac-section-note">旧发送端点仍可被调用；协议头和版本号不构成授权，因此此策略不代表全站防机器人。这里只保存服务器策略，不会发送邮件、启动挑战或验证组件。关闭窗口或取消验证不能视为通过。</p>
      <p className="ac-section-note">正在派送或结果未知的操作在窗口内保守占位，避免并发越阈；不把未知派送记录为成功，明确失败或取消不计成功。</p>
      {saved && <div id="app-human-saved-summary" className="ac-app-policy-status" role="status" aria-live="polite">
        <Pill tone={saved.mode === 'off' ? 'slate' : 'green'}>已保存模式：{HUMAN_POLICY_MODES[saved.mode]}</Pill>
        <Pill tone={saved.turnstile_configured ? 'green' : 'amber'}>{saved.turnstile_configured ? '验证组件：已配置（未实测）' : '验证组件：未配置'}</Pill>
        <span>已保存阈值：邮箱 {saved.email_window_seconds} 秒 / {saved.email_threshold} 次；来源 {saved.source_window_seconds} 秒 / {saved.source_threshold} 次 / {saved.source_distinct_emails} 个不同邮箱。仅按风险模式使用这些阈值。</span>
        <span>策略版本：{saved.revision}。此处为最后成功读取或保存的快照{needsReload ? '，尚需重新确认服务器状态' : ''}。</span>
      </div>}
      {saved && !saved.turnstile_configured && <p id="app-human-config-warning" role="alert" className="ac-app-note">服务器尚未配置可用的 Turnstile。仍可保存任意模式，但按风险或始终验证模式中需要挑战时将返回暂不可用，不会绕过验证；关闭模式无需验证组件。请由部署管理员配置，本表单不编辑或展示 sitekey / secret。</p>}
      {saved?.turnstile_configured && <p className="ac-section-note">“已配置”仅表示服务器配置状态，不代表外部服务已实测可用；这里不显示 sitekey / secret。</p>}
      {loading && <Loading text="正在读取安全验证策略…" />}
      <ErrorBox msg={error} />
      {saved && <form id="app-human-policy-form" onSubmit={event => { event.preventDefault(); onSave?.(); }} aria-describedby="app-human-scope app-human-boundary" style={{ marginTop: 14, minWidth: 0 }}>
        <fieldset className="ac-app-fieldset" disabled={disabled}>
          <legend className="ac-app-visually-hidden">新版 App 注册验证码安全验证策略</legend>
          <FormField label="验证模式" htmlFor="app-human-mode" hint="默认关闭。按风险仅在命中策略时要求验证；始终验证要求每个新协议注册发送操作验证，不受风险阈值影响。">
            <select id="app-human-mode" className="ac-select" value={draft.mode} onChange={event => onChange?.({ mode: event.target.value })}>
              <option value="off">关闭（默认）</option><option value="risk">按风险触发</option><option value="always">始终验证</option>
            </select>
          </FormField>
          <fieldset className="ac-app-fieldset" disabled={draft.mode !== 'risk'}>
            <legend>风险阈值（仅按风险模式可编辑）</legend>
            {NUMERIC_FIELDS.map(([key, label, hint]) => <FormField key={key} label={label} htmlFor={`app-human-${key}`} hint={hint}>
              <input id={`app-human-${key}`} className="ac-input" type="number" inputMode="numeric" step="1" min={HUMAN_POLICY_LIMITS[key][0]} max={HUMAN_POLICY_LIMITS[key][1]} required value={draft[key]} onChange={event => onChange?.({ [key]: event.target.value })} />
            </FormField>)}
          </fieldset>
          <button type="submit" className="ac-btn primary" style={{ justifySelf: 'start', maxWidth: '100%', whiteSpace: 'normal' }}>保存安全验证策略</button>
        </fieldset>
      </form>}
      <p id="app-human-form-status" role="status" aria-live="polite" className="ac-section-note">{notice || (saving ? '正在保存安全验证策略…' : needsReload ? '必须成功重新加载后才能保存；不会自动重放或覆盖冲突。' : dirty ? '表单有未保存更改，尚未生效。' : saved ? '当前表单与已保存策略一致。' : '')}</p>
      <div className="ac-action-group" style={{ marginTop: 14, minWidth: 0 }}>
        <button type="button" className="ac-btn" style={{ maxWidth: '100%', whiteSpace: 'normal' }} disabled={loading || saving} onClick={onReload}>重新加载已保存策略</button>
        {(loading || saving) && <button type="button" className="ac-btn" onClick={onCancel}>取消当前请求</button>}
      </div>
    </div>
  </Card>;
}

// 继承父级 AppClientsContent 的 AdminLayout，不嵌套布局；按管理员身份/会话 key 隔离，变更同步废弃在途响应。
export default function AppHumanCheckPolicyCard() {
  const [state, setState] = useState(initialHumanPolicyState);
  const editor = useRef(null);
  useEffect(() => {
    const current = createHumanPolicyEditor(adminAPI, { onChange: setState });
    editor.current = current;
    const sessionChanging = () => {
      current.dispose();
      setState({ ...initialHumanPolicyState(), loading: false, error: '管理员会话已变更，请在当前账号下重新打开管理页面。' });
    };
    window.addEventListener('auth-session-changing', sessionChanging);
    void current.load();
    return () => {
      window.removeEventListener('auth-session-changing', sessionChanging);
      current.dispose();
      if (editor.current === current) editor.current = null;
    };
  }, []);
  return <AppHumanCheckPolicyView state={state} onChange={patch => editor.current?.change(patch)} onSave={() => void editor.current?.save()} onReload={() => void editor.current?.load()} onCancel={() => editor.current?.cancel()} />;
}
