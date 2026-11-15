import { useEffect, useRef, useState } from 'react';
import { adminAPI } from '../../api';
import { createPolicyEditor, initialPolicyState, isPolicyDirty } from '../../babyVerificationPolicy/model.js';
import { Card, ErrorBox, Loading, Pill } from './ui';

export function AppBabyVerificationPolicyView({ state, onChange, onSave, onReload, onCancel, confirmReload, onConfirmReload, onCancelReload }) {
  const { saved, provinces, draft, loading, saving, needsReload, error, notice } = state;
  const dirty = isPolicyDirty(saved, draft);
  return <Card title="宝宝认证内容访问策略" icon="fa-baby" description="默认关闭。对所选省份的未认证访问者要求宝宝认证；适用于网页与 App 内容，不修改用户资料或认证状态。">
    <p className="ac-app-note">省份由服务器可信边缘网络证据判断，不使用用户填写的地区。普通用户只会看到通用认证提示，不展示命中省份或判断原因。登录、安全设置、宝宝认证与订单等必要入口保留。</p>
    {saved && <div className="ac-app-policy-status" role="status"><Pill tone={saved.enabled ? 'amber' : 'slate'}>已保存：{saved.enabled ? '开启' : '关闭'}</Pill><span>所选省份：{provinces.filter(item => saved.province_codes.includes(item.code)).map(item => item.name).join('、') || '无'}</span><span>策略版本：{saved.revision}{needsReload ? '（需重新确认）' : ''}</span></div>}
    {loading && <Loading text="正在读取宝宝认证访问策略…" />}
    <ErrorBox msg={error} />
    {saved && <form onSubmit={event => { event.preventDefault(); onSave?.(); }}>
      <fieldset className="ac-app-fieldset" disabled={loading || saving || needsReload || confirmReload}>
        <legend className="ac-app-visually-hidden">宝宝认证内容访问策略</legend>
        <label className="ac-check-row"><input type="checkbox" checked={draft.enabled} onChange={event => onChange?.({ enabled: event.target.checked })} /><span>开启宝宝认证访问要求（默认关闭）</span></label>
        <fieldset className="ac-app-fieldset"><legend>适用省份（可多选，共 31 个）</legend>
          <p className="ac-section-note">不预选任何省份。开启时至少选择一个；关闭会保留已选范围，但不会启用要求。</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8 }}>
            {provinces.map(({ code, name }) => <label key={code} className="ac-check-row"><input type="checkbox" value={code} checked={draft.province_codes.includes(code)} onChange={event => onChange?.({ province_codes: event.target.checked ? [...draft.province_codes, code] : draft.province_codes.filter(item => item !== code) })} /><span>{name}</span></label>)}
          </div>
        </fieldset>
        <button type="submit" className="ac-btn primary" disabled={!dirty}>保存宝宝认证访问策略</button>
      </fieldset>
    </form>}
    <p className="ac-section-note" role="status" aria-live="polite">{notice || (saving ? '正在保存策略…' : needsReload ? '必须成功重新加载后才能保存；不会自动重试或覆盖冲突。' : dirty ? '表单有未保存更改，尚未生效。' : saved ? '当前表单与已保存策略一致。' : '')}</p>
    {confirmReload && <div className="ac-app-note" role="group" aria-label="确认替换宝宝认证策略草稿"><p>重新加载成功后将替换本卡片草稿；失败仍保留输入，其他模块不受影响。</p><div className="ac-action-group"><button type="button" className="ac-btn" onClick={onCancelReload}>取消，保留草稿</button><button type="button" className="ac-btn" onClick={onConfirmReload}>确认重新加载</button></div></div>}
    <div className="ac-action-group"><button type="button" className="ac-btn" disabled={loading || saving} onClick={onReload}>重新加载已保存策略</button>{(loading || saving) && <button type="button" className="ac-btn" onClick={onCancel}>取消当前请求</button>}</div>
  </Card>;
}

// 继承父级 AppClientsContent 的 AdminLayout；与 AppHumanCheckPolicyCard 一样独立挂载、保留内存草稿并同步中止换号请求。
export default function AppBabyVerificationPolicyCard() {
  const [state, setState] = useState(initialPolicyState);
  const [confirmReload, setConfirmReload] = useState(false);
  const editor = useRef(null);
  useEffect(() => {
    const current = createPolicyEditor(adminAPI, { onChange: setState }); editor.current = current;
    const sessionChanging = () => { current.dispose(); setConfirmReload(false); setState({ ...initialPolicyState(), loading: false, error: '管理员会话已变更，请在当前账号下重新打开管理页面。' }); };
    window.addEventListener('auth-session-changing', sessionChanging); void current.load();
    return () => { window.removeEventListener('auth-session-changing', sessionChanging); current.dispose(); if (editor.current === current) editor.current = null; };
  }, []);
  return <AppBabyVerificationPolicyView state={state} onChange={patch => editor.current?.change(patch)} onSave={() => void editor.current?.save()} onReload={() => { if (isPolicyDirty(state.saved, state.draft)) setConfirmReload(true); else void editor.current?.load(); }} confirmReload={confirmReload} onCancelReload={() => setConfirmReload(false)} onConfirmReload={() => { setConfirmReload(false); void editor.current?.load(); }} onCancel={() => editor.current?.cancel()} />;
}
