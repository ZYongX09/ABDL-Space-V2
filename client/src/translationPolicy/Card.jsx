import { useEffect, useRef, useState } from 'react';
import { adminAPI } from '../api';
import { Card, ErrorBox, FormField, Loading, Pill } from '../pages/admin/ui';
import { createTranslationPolicyEditor, initialTranslationPolicyState, isTranslationPolicyDirty, TRANSLATION_POLICY_LIMITS } from './model.js';

const NUMERIC_FIELDS = [
  ['daily_limit', '普通账号每日额度', '默认 5 次；0–10000 的整数。'],
  ['english_daily_limit', '英文阅读普通账号每日额度', '默认 10 次；使用账号同步的英文阅读偏好，不按单次翻译目标授予额度。'],
  ['sponsor_daily_limit', '当前有效赞助账号每日额度', '默认 100 次；赞助资格由服务器实时判断。三档额度不叠加。'],
  ['cache_epoch', '翻译缓存世代（cache_epoch）', '大于等于 1 的安全整数。变更后后续请求使用对应缓存命名空间；不会清空或重置当日已用、预留额度。'],
];

// 生产组件与 SSR 共用同一视图；既有管理主题变量与响应式表单原语覆盖三种主题。
export function TranslationPolicyCardView({ state, onChange, onSave, onReload, onCancel }) {
  const { saved, draft, loading, saving, needsReload, error, notice } = state;
  const dirty = isTranslationPolicyDirty(saved, draft);
  const disabled = loading || saving || needsReload;
  return <Card title="App 帖子 AI 翻译策略" icon="fa-language" className="ac-translation-policy-card" description="管理帖子翻译总开关、三档每日额度、赞助自动翻译与缓存世代；复用统一 App AI 服务，不新增密钥。">
    <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <p id="translation-policy-scope" className="ac-app-note">三档额度分别为普通账号、英文阅读普通账号和当前有效赞助账号，不叠加。每天按 Asia/Shanghai（上海时区）结算；切换语言、赞助档位、翻译目标或本策略均不清空同一账号当天的已用与预留额度。</p>
      <p id="translation-policy-auto-note" className="ac-section-note">允许赞助自动翻译不等于为所有赞助账号开启：仍需账号当前有效赞助、用户主动启用自动翻译，并由服务器实时校验能力。总开关关闭时不提供帖子翻译，但保留以下配置。</p>
      <p id="translation-policy-safety" className="ac-section-note">只读取或保存策略，不调用 AI、不测试供应商，也不编辑地址、模型或密钥。实际翻译复用上方统一 App AI 服务配置；保存成功不代表模型已配置或可用。</p>
      {saved && <div id="translation-policy-saved-summary" className="ac-app-policy-status" role="status" aria-live="polite">
        <Pill tone={saved.enabled ? 'green' : 'slate'}>已保存翻译：{saved.enabled ? '启用' : '关闭'}</Pill>
        <Pill tone={saved.sponsor_auto_allowed ? 'green' : 'slate'}>已保存赞助自动翻译：{saved.sponsor_auto_allowed ? '允许' : '不允许'}</Pill>
        <span>已保存每日额度：普通 {saved.daily_limit} / 英文阅读普通 {saved.english_daily_limit} / 有效赞助 {saved.sponsor_daily_limit}；缓存世代：{saved.cache_epoch}。</span>
        <span>策略版本：{saved.revision}。此处为最后成功读取或保存的快照{needsReload ? '，尚需重新确认服务器状态' : ''}。</span>
      </div>}
      {loading && <Loading text="正在读取翻译策略…" />}
      <ErrorBox msg={error} />
      {saved && <form id="translation-policy-form" onSubmit={event => { event.preventDefault(); onSave?.(); }} aria-describedby="translation-policy-scope translation-policy-auto-note translation-policy-safety" style={{ marginTop: 14, minWidth: 0 }}>
        <fieldset className="ac-app-fieldset" disabled={disabled}>
          <legend className="ac-app-visually-hidden">App 帖子 AI 翻译策略配置</legend>
          <label className="ac-check-row"><input id="translation-policy-enabled" type="checkbox" role="switch" checked={draft.enabled} onChange={event => onChange?.({ enabled: event.target.checked })} /><span>启用帖子翻译（总开关）</span></label>
          {NUMERIC_FIELDS.map(([key, label, hint]) => <FormField key={key} label={label} htmlFor={`translation-policy-${key}`} hint={hint}>
            <input id={`translation-policy-${key}`} className="ac-input" type="number" inputMode="numeric" step="1" min={TRANSLATION_POLICY_LIMITS[key][0]} max={TRANSLATION_POLICY_LIMITS[key][1]} required value={draft[key]} onChange={event => onChange?.({ [key]: event.target.value })} />
          </FormField>)}
          <label className="ac-check-row"><input id="translation-policy-sponsor-auto" type="checkbox" role="switch" checked={draft.sponsor_auto_allowed} aria-describedby="translation-policy-auto-note" onChange={event => onChange?.({ sponsor_auto_allowed: event.target.checked })} /><span>允许当前有效赞助账号使用自动翻译</span></label>
          <FormField label="每日额度结算时区（只读）" htmlFor="translation-policy-timezone" hint="固定上海时区，不随管理员浏览器时区变化，不能在此修改。">
            <input id="translation-policy-timezone" className="ac-input" type="text" value={saved.timezone} readOnly />
          </FormField>
          <button type="submit" className="ac-btn primary" style={{ justifySelf: 'start', maxWidth: '100%', whiteSpace: 'normal' }}>保存翻译策略</button>
        </fieldset>
      </form>}
      <p id="translation-policy-form-status" role="status" aria-live="polite" className="ac-section-note">{notice || (saving ? '正在保存翻译策略…' : needsReload ? '必须成功重新加载后才能保存；不会自动重放或覆盖冲突。重新加载成功会以服务器状态替换当前草稿。' : dirty ? '表单有未保存更改，尚未生效；重新加载成功会以服务器状态替换当前草稿。' : saved ? '当前表单与已保存翻译策略一致。' : '')}</p>
      <div className="ac-action-group" style={{ marginTop: 14, minWidth: 0 }}>
        <button type="button" className="ac-btn" style={{ maxWidth: '100%', whiteSpace: 'normal' }} disabled={loading || saving} onClick={onReload}>重新加载已保存翻译策略</button>
        {(loading || saving) && <button type="button" className="ac-btn" onClick={onCancel}>取消当前请求</button>}
      </div>
    </div>
  </Card>;
}

// 继承 AppClientsContent 的管理员及账号/token key 边界；切换事件立即废弃旧请求。
export default function TranslationPolicyCard() {
  const [state, setState] = useState(initialTranslationPolicyState);
  const editor = useRef(null);
  useEffect(() => {
    const current = createTranslationPolicyEditor(adminAPI, { onChange: setState });
    editor.current = current;
    const sessionChanging = () => {
      current.dispose();
      setState({ ...initialTranslationPolicyState(), loading: false, error: '管理员会话已变更，请在当前账号下重新打开管理页面。' });
    };
    window.addEventListener('auth-session-changing', sessionChanging);
    void current.load();
    return () => {
      window.removeEventListener('auth-session-changing', sessionChanging);
      current.dispose();
      if (editor.current === current) editor.current = null;
    };
  }, []);
  return <TranslationPolicyCardView state={state} onChange={patch => editor.current?.change(patch)} onSave={() => void editor.current?.save()} onReload={() => void editor.current?.load()} onCancel={() => editor.current?.cancel()} />;
}
