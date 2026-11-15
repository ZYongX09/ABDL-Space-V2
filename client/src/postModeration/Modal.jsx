import { useCallback, useEffect, useRef, useState } from 'react';
import { adminSessionKey } from '../pages/admin/access.js';
import { ErrorBox, FormField, Modal, Pill } from '../pages/admin/ui.jsx';
import { createPostModerationAPI } from './api.js';
import { createPostModerationController } from './controller.js';
import { ARCHIVE_LABELS, DELETE_LABELS, ERROR_LABELS, MAX_REASON, assetSummary, canRetry, initialModerationState, legalNotice } from './model.js';

const ACKNOWLEDGEMENT = '原文永久留证；仅迁移腾讯云已有缩略图到私有 R2；归档完成后删除本站可证明独占且未共享的 COS 原图/预览；删除后无法通过本功能恢复原图';
const PENDING_LABELS = { target: '读取处理状态', detail: '刷新处理状态', create: '提交违规处理', snapshot: '读取原件快照', thumbnail: '加载缩略图', retry: '请求重试调度' };
const PHASE_NOTES = {
  conflict: '源内容或案件状态已变化；请点击“刷新处理状态”重新读取，理由会保留。',
  unknown: '原写入结果尚未确认。只能继续查询回执，请勿重复提交；关闭弹窗不会回滚服务端操作。',
  'read-error': '尚未取得本次处理状态。请重新读取后再操作，当前不显示旧案件。',
};

function previewNotice(reason) {
  try { return legalNotice(reason); } catch { return ''; }
}
function assetTone(value) {
  if (value === 'verified' || value === 'deleted') return 'green';
  if (value === 'pending') return 'amber';
  if (value === 'blocked') return 'red';
  return 'slate';
}

export default function PostModerationModal({ post, open, onClose, onStored, session }) {
  const [state, setState] = useState(initialModerationState);
  const controllerRef = useRef(null);
  const attemptsRef = useRef(new Map());
  const attemptsSessionRef = useRef('');
  const sessionRef = useRef(session);
  const onCloseRef = useRef(onClose);
  const onStoredRef = useRef(onStored);
  sessionRef.current = session;
  onCloseRef.current = onClose;
  onStoredRef.current = onStored;
  const postId = post?.id;

  useEffect(() => {
    if (!open || postId == null) return undefined;
    let alive = true;
    const initialSessionKey = adminSessionKey(sessionRef.current?.user, sessionRef.current?.token);
    if (attemptsSessionRef.current !== initialSessionKey) {
      attemptsRef.current.clear();
      attemptsSessionRef.current = initialSessionKey;
    }
    const isSessionCurrent = () => adminSessionKey(sessionRef.current?.user, sessionRef.current?.token) === initialSessionKey;
    const api = createPostModerationAPI({
      base: import.meta.env.VITE_API_BASE ?? '',
      getSession: () => sessionRef.current,
      isCurrent: isSessionCurrent,
    });
    const controller = createPostModerationController({
      api,
      attempts: attemptsRef.current,
      onChange: next => { if (alive) setState(next); },
      onStored: target => { if (alive) onStoredRef.current?.(target); },
    });
    controllerRef.current = controller;
    setState(initialModerationState());
    void controller.open(postId);

    const dispose = () => {
      if (!alive) return;
      alive = false;
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
    const discardForSession = () => {
      if (!alive) return;
      attemptsRef.current.clear();
      attemptsSessionRef.current = '';
      setState(initialModerationState());
      dispose();
      onCloseRef.current?.();
    };
    const clearOnPageHide = () => {
      if (!alive) return;
      setState(initialModerationState());
      dispose();
    };
    window.addEventListener('auth-session-changing', discardForSession);
    window.addEventListener('pagehide', clearOnPageHide);
    return () => {
      window.removeEventListener('auth-session-changing', discardForSession);
      window.removeEventListener('pagehide', clearOnPageHide);
      dispose();
    };
  }, [open, postId]);

  const close = useCallback(() => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    controller?.dispose();
    setState(initialModerationState());
    onCloseRef.current?.();
  }, []);

  if (!open || !post) return null;

  const moderation = state.target?.moderation ?? null;
  const preview = previewNotice(state.reason);
  const pending = state.pending;
  const admitted = state.phase === 'ready' && Boolean(state.target) && !moderation;
  const canEditReason = ['ready', 'conflict'].includes(state.phase) && !pending;
  const canSubmit = admitted && state.acknowledged && !pending && Boolean(preview);
  const retryable = canRetry(moderation);
  const pendingLabel = PENDING_LABELS[pending] || '';
  const retryLabel = state.retryAccepted ? '调度已受理，不代表已完成' : pending === 'retry' ? '正在请求重试调度…' : retryable ? '重试调度（调度已受理，不代表已完成）' : '无可重试任务';

  return (
    <Modal open={open} onClose={close} title={`违规处理 · 帖子 #${post.id}`} width={860} footer={<button type="button" className="ac-btn" onClick={close}>关闭并清除临时留证</button>}>
      <div className="ac-moderation ac-page-stack">
        <p className="ac-mod-note">先核对帖子与作者，再填写处理理由。提交后文字原件永久留证；附件归档与 COS 删除是后续任务，受理或 2xx 都不代表删除完成。</p>

        <FormField label="处理理由" hint={`必填，1–${MAX_REASON} 字。请勿填写姓名、电话、地址、证件号、订单号、聊天记录等个人信息；理由会写入永久留证，并原样出现在前台通知文案中。`} required>
          <textarea
            id="post-moderation-reason"
            className="ac-textarea"
            value={state.reason}
            maxLength={MAX_REASON}
            required
            disabled={!canEditReason}
            placeholder="例如：发布违规内容"
            onChange={event => controllerRef.current?.changeReason(event.target.value)}
          />
        </FormField>

        <div className="ac-form-field">
          <span className="ac-field-label">通知文案预览</span>
          {preview
            ? <p className="ac-mod-content" aria-live="polite" aria-atomic="true">{preview}</p>
            : <p className="ac-field-hint">填写 1–500 字有效理由后，这里显示将永久保存并公开展示的完整通知文案。</p>}
        </div>

        <label className="ac-check-row">
          <input
            type="checkbox"
            checked={state.acknowledged}
            disabled={!admitted || !!pending}
            onChange={event => controllerRef.current?.acknowledge(event.target.checked)}
          />
          <span>{ACKNOWLEDGEMENT}</span>
        </label>

        <div className="ac-action-group">
          <button type="button" className="ac-btn danger" disabled={!canSubmit} onClick={() => { void controllerRef.current?.submit({ confirmed: true }); }}>
            {pending === 'create' ? '提交中…' : '确认违规处理'}
          </button>
          {!moderation && <button type="button" className="ac-btn" disabled={!!pending} onClick={() => { void controllerRef.current?.refreshCase(); }}>刷新处理状态</button>}
          {!admitted && !moderation && <span className="ac-field-hint">读取处理状态并确认源版本后才能提交。</span>}
        </div>

        <div role="status" aria-live="polite" aria-atomic="true">
          {pending ? `正在${pendingLabel}，请勿重复操作…` : ''}
        </div>
        <div role="alert" aria-live="assertive" aria-atomic="true">{state.error ? <ErrorBox msg={state.error} /> : null}</div>
        <div role="status" aria-live="polite" aria-atomic="true">{state.message}</div>
        {PHASE_NOTES[state.phase] && <p className="ac-mod-note">{PHASE_NOTES[state.phase]}</p>}

        {moderation && (
          <section aria-label="已入库违规处理案件">
            <dl className="ac-mod-meta">
              <dt>案件编号</dt><dd><code>{moderation.id}</code></dd>
              <dt>处理摘要</dt><dd>{assetSummary(moderation.assets)}</dd>
              <dt>前台通知</dt><dd className="ac-mod-content">{moderation.notice}</dd>
            </dl>

            <h3 className="ac-field-label">附件安全任务</h3>
            {moderation.assets.length
              ? <ul className="ac-mod-action-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {moderation.assets.map(asset => (
                    <li key={asset.id} className="ac-mod-action-stack">
                      <div className="ac-action-group">
                        <strong>附件 #{asset.position + 1}</strong>
                        <Pill tone={assetTone(asset.archive_state)}>{ARCHIVE_LABELS[asset.archive_state]}</Pill>
                        <Pill tone={assetTone(asset.delete_state)}>{DELETE_LABELS[asset.delete_state]}</Pill>
                      </div>
                      {asset.error_code && <p className="ac-field-hint">{ERROR_LABELS[asset.error_code]}</p>}
                      {state.thumbnails[asset.id]
                        ? <>
                            <img src={state.thumbnails[asset.id]} alt={`附件 ${asset.position + 1} 的临时缩略图`} style={{ maxWidth: '180px', maxHeight: '180px', borderRadius: 'var(--ac-radius-sm)' }} />
                            <p className="ac-field-hint">缩略图仅通过当前管理员会话读取；关闭弹窗后立即清除。</p>
                          </>
                        : asset.thumbnail_available
                          ? <button type="button" className="ac-btn" disabled={!!pending} onClick={() => { void controllerRef.current?.thumbnail(asset.id); }}>{pending === 'thumbnail' ? '加载中…' : '加载缩略图'}</button>
                          : <p className="ac-field-hint">无可用缩略图，不显示任何源地址。</p>}
                    </li>
                  ))}
                </ul>
              : <p className="ac-mod-note">无附件任务；文字原件永久留证。</p>}

            <div className="ac-action-group">
              <button type="button" className="ac-btn" disabled={!!pending} onClick={() => { void controllerRef.current?.snapshot(); }}>查看原件快照</button>
              <button type="button" className="ac-btn" disabled={!!pending} onClick={() => { void controllerRef.current?.refreshCase(); }}>刷新处理状态</button>
              <button type="button" className="ac-btn" disabled={!retryable || !!pending || state.retryAccepted} onClick={() => { void controllerRef.current?.retry({ confirmed: true }); }}>{retryLabel}</button>
            </div>
            <p className="ac-mod-note">调度已受理，不代表已完成；归档与删除进度以附件状态为准，需主动刷新。查看快照不会自动加载缩略图，也不会自动重试。</p>
            {state.snapshotText && (
              <div className="ac-form-field">
                <span className="ac-field-label">原件快照（显式读取的 JSON）</span>
                <pre className="ac-mod-content" tabIndex={0} aria-label="原件快照 JSON">{state.snapshotText}</pre>
              </div>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}
