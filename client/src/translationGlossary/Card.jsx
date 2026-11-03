import { useEffect, useRef, useState } from 'react';
import { adminAPI } from '../api';
import { Card, Empty, ErrorBox, FormField, Loading, Pill } from '../pages/admin/ui';
import { bindTranslationGlossarySession, createTranslationGlossaryEditor, glossaryCodePoints, glossaryJSONBytes, initialTranslationGlossaryState, isTranslationGlossaryDirty, searchTranslationGlossary, TRANSLATION_GLOSSARY_CACHE_WARNING, TRANSLATION_GLOSSARY_LIMITS, TRANSLATION_GLOSSARY_SAVED_EVENT, translationGlossaryDraftPayload } from './model.js';
import './card.css';

export function TranslationGlossaryCardView({ state, onAdd, onChange, onRemove, onSearch, onSave, onConfirmSave, onReload, onConfirmReload, onDiscard, onConfirmDiscard, onCancelConfirmation, onCancel }) {
  const { saved, draft, query, loading, saving, needsReload, confirm, error, notice } = state;
  const dirty = isTranslationGlossaryDirty(saved, draft);
  const disabled = loading || saving || needsReload || !!confirm;
  const visible = searchTranslationGlossary(draft, query);
  let bytes = null;
  try { bytes = glossaryJSONBytes(translationGlossaryDraftPayload(saved, draft).entries); } catch { /* 不用无效草稿假装规范化成功。 */ }
  return <Card title="App 中英翻译词库" icon="fa-book" className="ac-translation-glossary-card" description="管理统一 App AI 的中英双向参考术语；同条多个变体是同义候选，实际翻译按上下文选择，不作本地字符串替换。">
    <div className="ac-glossary-content">
      <p id="translation-glossary-cache-warning" className="ac-app-note">{TRANSLATION_GLOSSARY_CACHE_WARNING}</p>
      <p id="translation-glossary-limits" className="ac-section-note">最多 200 条；中文、英文各 1–10 个非空变体，每行一个，每变体最多 120 个 Unicode 码点；可选备注最多 500 码点。trim/NFC 后同条去重，跨条同语言不能重复（英文忽略大小写）。规范化词条 JSON ≤64 KiB，完整请求 ≤96 KiB；服务器校验为准。</p>
      <p id="translation-glossary-safety" className="ac-section-note">只读取和显式保存全部词库，不调用 AI、不测试供应商、不设置密钥。术语和备注均为不可信纯文本，备注不是系统指令。草稿仅在本页内存，离开页面或切换账号会丢失。</p>
      {saved && <div id="translation-glossary-saved-summary" className="ac-app-policy-status" role="status" aria-live="polite"><Pill tone="slate">已保存 {saved.entries.length} 条</Pill><span>词库版本：{saved.revision}；最后成功读取或保存的快照{needsReload ? '，尚需重新确认服务器状态' : ''}。</span></div>}
      {loading && <Loading text="正在读取翻译词库…" />}
      <ErrorBox msg={error} />
      {saved && <form id="translation-glossary-form" noValidate onSubmit={event => { event.preventDefault(); onSave?.(); }} aria-describedby="translation-glossary-cache-warning translation-glossary-limits translation-glossary-safety">
        <FormField label="搜索词库草稿" htmlFor="translation-glossary-search" hint="按中文、英文或备注筛选，不修改词条；保存始终提交全部草稿，不只提交搜索结果。">
          <input id="translation-glossary-search" className="ac-input" type="search" value={query} onChange={event => onSearch?.(event.target.value)} />
        </FormField>
        <p className="ac-section-note" id="translation-glossary-count" role="status" aria-live="polite">草稿 {draft.length} / {TRANSLATION_GLOSSARY_LIMITS.entries} 条，显示 {visible.length} 条；规范化词条 JSON：{bytes === null ? '待补全或修正后计算' : `${bytes} / ${TRANSLATION_GLOSSARY_LIMITS.entriesBytes} 字节`}。{draft.length >= TRANSLATION_GLOSSARY_LIMITS.entries && '已达 200 条上限，可编辑或删除后添加。'}</p>
        <button type="button" className="ac-btn" disabled={disabled || draft.length >= TRANSLATION_GLOSSARY_LIMITS.entries} onClick={onAdd}>添加词条</button>
        {!draft.length ? <Empty text="词库为空（0 条）；可添加中英同义词，不会自动调用 AI。" /> : !visible.length ? <Empty text="没有匹配的词条；清空搜索可查看全部草稿，其他词条没有被删除。" /> : <ol className="ac-glossary-list" aria-label="词库草稿，可直接编辑">
          {visible.map(entry => <li key={entry.id} className="ac-glossary-entry">
            <fieldset className="ac-app-fieldset" disabled={disabled}>
              <legend>编辑词条 {draft.indexOf(entry) + 1}</legend>
              <p className="ac-section-note">UUID：{entry.id}</p>
              <div className="ac-glossary-languages">
                <FormField label="中文同义词（每行一个）" htmlFor={`glossary-chinese-${entry.id}`} required hint="1–10 个，每个最多 120 Unicode 码点；空白行不作为同义词。">
                  <textarea id={`glossary-chinese-${entry.id}`} className="ac-textarea" rows={3} value={entry.chineseText} onChange={event => onChange?.(entry.id, { chineseText: event.target.value })} />
                </FormField>
                <FormField label="英文同义词（每行一个）" htmlFor={`glossary-english-${entry.id}`} required hint="1–10 个，每个最多 120 Unicode 码点；同条忽略大小写去重。">
                  <textarea id={`glossary-english-${entry.id}`} className="ac-textarea" rows={3} value={entry.englishText} onChange={event => onChange?.(entry.id, { englishText: event.target.value })} />
                </FormField>
              </div>
              <FormField label="备注（可选，纯文本）" htmlFor={`glossary-note-${entry.id}`} hint={`trim/NFC 后 ${glossaryCodePoints(entry.note.trim().normalize('NFC'))} / 500 Unicode 码点；备注不会作为系统指令。`}>
                <textarea id={`glossary-note-${entry.id}`} className="ac-textarea" rows={2} value={entry.note} onChange={event => onChange?.(entry.id, { note: event.target.value })} />
              </FormField>
              <button type="button" className="ac-btn danger" aria-label={`从草稿删除词条 ${draft.indexOf(entry) + 1}`} onClick={() => onRemove?.(entry.id)}>删除词条（尚未保存）</button>
            </fieldset>
          </li>)}
        </ol>}
        <button type="submit" className="ac-btn primary" disabled={disabled || !dirty}>保存全部词库</button>
      </form>}
      <p id="translation-glossary-status" role="status" aria-live="polite" className="ac-section-note">{saving ? '正在保存全部词库…取消请求不代表撤回服务器写入。' : loading ? '正在加载，当前草稿未被替换。' : notice || (needsReload ? '必须成功重新加载后才能保存；不会自动重试。已有草稿在重新加载失败或取消时保留，成功后才替换。' : dirty ? '有未保存更改，尚未生效；删除、编辑和添加都需要显式保存全部词库。' : saved ? '当前草稿与已保存词库一致。' : '')}</p>
      {confirm && <div className="ac-glossary-confirm" role="group" aria-label={confirm === 'save' ? '确认保存全部词库' : '确认丢弃未保存草稿'}>
        <h3>{confirm === 'save' ? '确认保存全部词库？' : confirm === 'reload' ? '确认重新加载并替换草稿？' : '确认放弃未保存草稿？'}</h3>
        <p>{confirm === 'save' ? TRANSLATION_GLOSSARY_CACHE_WARNING : confirm === 'reload' ? '当前未保存更改将仅在重新加载成功后丢弃，并以服务器版本替换；加载失败或取消仍保留草稿。不会合并或重放冲突保存。' : '恢复最后成功读取的快照，不向服务器写入；若服务器状态未知，仍需重新加载才能保存。'}</p>
        <div className="ac-action-group"><button type="button" className="ac-btn" onClick={onCancelConfirmation}>取消，保留草稿</button><button type="button" className="ac-btn primary" onClick={confirm === 'save' ? onConfirmSave : confirm === 'reload' ? onConfirmReload : onConfirmDiscard}>{confirm === 'save' ? '确认失效共享译文并保存' : confirm === 'reload' ? '确认丢弃并重新加载' : '确认放弃草稿'}</button></div>
      </div>}
      <div className="ac-action-group ac-glossary-actions">
        <button type="button" className="ac-btn" disabled={loading || saving || !!confirm} onClick={onReload}>重新加载已保存词库</button>
        <button type="button" className="ac-btn" disabled={!dirty || loading || saving || !!confirm} onClick={onDiscard}>放弃未保存更改</button>
        {(loading || saving) && <button type="button" className="ac-btn" onClick={onCancel}>取消当前请求</button>}
      </div>
    </div>
  </Card>;
}

export default function TranslationGlossaryCard() {
  const [state, setState] = useState(initialTranslationGlossaryState);
  const editor = useRef(null);
  useEffect(() => {
    const current = createTranslationGlossaryEditor(adminAPI, { onChange: setState });
    editor.current = current;
    const cleanup = bindTranslationGlossarySession(current, window, setState);
    void current.load();
    return () => { cleanup(); if (editor.current === current) editor.current = null; };
  }, []);
  const confirmSave = async () => {
    const current = editor.current;
    if (await current?.save() && editor.current === current && current.getState().saved) window.dispatchEvent(new Event(TRANSLATION_GLOSSARY_SAVED_EVENT));
  };
  return <TranslationGlossaryCardView state={state} onAdd={() => editor.current?.add()} onChange={(id, patch) => editor.current?.change(id, patch)} onRemove={id => editor.current?.remove(id)} onSearch={query => editor.current?.search(query)} onSave={() => editor.current?.requestSave()} onConfirmSave={() => void confirmSave()} onReload={() => void editor.current?.load()} onConfirmReload={() => void editor.current?.confirmReload()} onDiscard={() => editor.current?.requestDiscard()} onConfirmDiscard={() => editor.current?.confirmDiscard()} onCancelConfirmation={() => editor.current?.cancelConfirmation()} onCancel={() => editor.current?.cancel()} />;
}
