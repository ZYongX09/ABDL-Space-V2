import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import NBWImage from '../../components/NBWImage.jsx';
import { registerAdminDialog } from './dialog.js';

/** 管理控制台共享 UI 原语。 */
const ConfirmCtx = createContext(null);

/** Share the same top-layer focus, Escape and scroll lifecycle across every admin overlay. */
export function useDialogLifecycle(open, onClose, panelRef, { initialFocus = 'first' } = {}) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return undefined;
    return registerAdminDialog(panel, () => onCloseRef.current?.(), { initialFocus });
  }, [open, panelRef, initialFocus]);
}

function ConfirmDialog({ state, onClose }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const close = useCallback((value) => onClose(value), [onClose]);
  useDialogLifecycle(!!state, () => close(false), panelRef, { initialFocus: state?.danger ? 'cancel' : 'first' });
  if (!state) return null;

  return (
    <div className="ac-overlay" role="presentation" onMouseDown={() => close(false)}>
      <div
        ref={panelRef}
        className={`ac-modal ac-confirm ${state.danger ? 'danger' : ''}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="ac-confirm-icon" aria-hidden="true">
          <i className={`fa-solid ${state.danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}`} />
        </div>
        <div className="ac-confirm-content">
          <h2 id={titleId}>{state.title}</h2>
          <div className="ac-confirm-message">{state.message}</div>
        </div>
        <div className="ac-modal-foot">
          <button type="button" className="ac-btn" data-dialog-cancel onClick={() => close(false)}>取消</button>
          <button type="button" className={`ac-btn ${state.danger ? 'danger solid' : 'primary'}`} data-autofocus={!state.danger || undefined} onClick={() => close(true)}>{state.okText}</button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const pending = useRef(null);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    pending.current?.(false);
    pending.current = resolve;
    setState({
      title: options.title || '确认操作',
      message: options.message || '',
      okText: options.okText || '确认',
      danger: !!options.danger,
      resolve,
    });
  }), []);

  const close = useCallback((value) => {
    pending.current?.(value);
    pending.current = null;
    setState(null);
  }, []);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <div className="ac-admin-theme">
        <ConfirmDialog state={state} onClose={close} />
      </div>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm 必须在 ConfirmProvider 内使用');
  return ctx;
}

export function Modal({ open, onClose, title, children, footer, width = 520, className = '' }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const close = useCallback(() => onClose?.(), [onClose]);
  useDialogLifecycle(open, close, panelRef);
  if (!open) return null;

  return (
    <div className="ac-overlay" role="presentation" onMouseDown={close}>
      <div
        ref={panelRef}
        className={`ac-modal ${className}`.trim()}
        style={{ '--ac-modal-width': `${width}px` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="ac-modal-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ac-modal-close" aria-label="关闭弹窗" onClick={close}>
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>
        <div className="ac-modal-body">{children}</div>
        {footer && <div className="ac-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, head, children }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const close = useCallback(() => onClose?.(), [onClose]);
  useDialogLifecycle(open, close, panelRef);
  if (!open) return null;

  return (
    <div className="ac-drawer-layer">
      <button type="button" className="ac-drawer-overlay" aria-label="关闭详情遮罩" onClick={close} />
      <aside ref={panelRef} className="ac-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ac-drawer-head">
          <button type="button" className="ac-icon-button" aria-label="关闭详情" onClick={close}>
            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
          </button>
          <h2 id={titleId}>{head}</h2>
        </div>
        <div className="ac-drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function Pagination({ page, totalPages, total, onChange, size = 'sm' }) {
  if (!totalPages || totalPages <= 1) return <div className="ac-page-info">共 {total ?? 0} 条</div>;
  const pages = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  if (start > 1) pages.push(1);
  if (start > 2) pages.push('...');
  for (let index = start; index <= end; index += 1) pages.push(index);
  if (end < totalPages - 1) pages.push('...');
  if (end < totalPages) pages.push(totalPages);

  return (
    <div className={`ac-pagination-wrap ${size}`}>
      <span className="ac-page-info">共 {total ?? 0} 条 · 第 {page}/{totalPages} 页</span>
      <nav className="ac-pagination ac-pagination-desktop" aria-label="分页">
        <button type="button" className="ac-page-btn" aria-label="上一页" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <i className="fa-solid fa-chevron-left" aria-hidden="true" />
        </button>
        {pages.map((item, index) => item === '...' ? (
          <span className="ac-page-ellipsis" aria-hidden="true" key={`e${index}`}>…</span>
        ) : (
          <button
            type="button"
            key={item}
            className={`ac-page-btn ${item === page ? 'active' : ''}`}
            aria-current={item === page ? 'page' : undefined}
            aria-label={`第 ${item} 页`}
            onClick={() => onChange(item)}
          >{item}</button>
        ))}
        <button type="button" className="ac-page-btn" aria-label="下一页" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </button>
      </nav>
      <nav className="ac-pagination ac-pagination-compact" aria-label="移动列表分页">
        <button type="button" className="ac-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
        <span className="ac-page-position" aria-current="page">{page} / {totalPages}</span>
        <button type="button" className="ac-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>下一页</button>
      </nav>
    </div>
  );
}

export function Pill({ tone = 'slate', children, className = '', ...props }) {
  return <span className={`ac-pill ${tone} ${className}`.trim()} {...props}>{children}</span>;
}

const TONE_BY_STATUS = {
  pending: 'amber', resolved: 'green', dismissed: 'slate', rejected: 'red',
  published: 'green', archived: 'slate', draft: 'slate', review_pending: 'amber', reviewing: 'amber',
  accepted: 'green', active: 'green', disabled: 'slate', banned: 'red',
};

const STATUS_LABELS = {
  pending: '待处理', resolved: '已处理', dismissed: '已驳回', rejected: '已拒绝',
  published: '已发布', archived: '已归档', draft: '草稿', review_pending: '待审核', reviewing: '审核中',
  accepted: '已接受', active: '启用', disabled: '停用', banned: '已封禁',
};

export function StatusPill({ status }) {
  return <Pill tone={TONE_BY_STATUS[status] || 'slate'}>{STATUS_LABELS[status] || status || '-'}</Pill>;
}

export function Empty({ icon = 'fa-inbox', text, children }) {
  return (
    <div className="ac-empty">
      <span className="ac-empty-icon"><i className={`fa-solid ${icon}`} aria-hidden="true" /></span>
      <span>{text || children || '暂无数据'}</span>
    </div>
  );
}

export function Loading({ text = '加载中...' }) {
  return (
    <div className="ac-loading" role="status" aria-live="polite">
      <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export function Avatar({ src, size = 30, alt = '' }) {
  return (
    <span className="ac-avatar-shell" style={{ '--ac-avatar-size': `${size}px` }}>
      {src ? (
        <NBWImage src={src} alt={alt} className="ac-avatar" onError={event => { event.currentTarget.style.display = 'none'; }} />
      ) : null}
      <i className="fa-solid fa-user" aria-hidden="true" />
    </span>
  );
}

export function UserCell({ name, avatar, id, sub }) {
  return (
    <div className="ac-user-cell">
      <Avatar src={avatar} size={32} />
      <div className="ac-user-copy">
        <div className="ac-uname">{name || '未命名'}</div>
        {(id != null || sub != null) && <div className="ac-uid">ID: {id ?? sub}</div>}
      </div>
    </div>
  );
}

export function Delta({ cur, prev, suffix = '' }) {
  const delta = pctDeltaLocal(cur, prev);
  if (delta === null) return <span className="ac-delta flat">新增</span>;
  if (delta === 0) return <span className="ac-delta flat">持平</span>;
  const up = delta > 0;
  return (
    <span className={`ac-delta ${up ? 'up' : 'down'}`}>
      <i className={`fa-solid ${up ? 'fa-caret-up' : 'fa-caret-down'}`} aria-hidden="true" />
      {Math.abs(delta)}%{suffix}
    </span>
  );
}

function pctDeltaLocal(cur, prev) {
  const current = Number(cur) || 0;
  const previous = Number(prev) || 0;
  if (previous <= 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function PageHeader({ title, description, action, eyebrow }) {
  return (
    <div className="ac-local-page-heading">
      <div>
        {eyebrow && <div className="ac-page-eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="ac-page-actions">{action}</div>}
    </div>
  );
}

export function Toolbar({ children, result, className = '' }) {
  return (
    <div className={`ac-toolbar ${className}`.trim()}>
      <div className="ac-toolbar-group">{children}</div>
      {result != null && <div className="ac-toolbar-result">{result}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon, tone = 'blue', meta, compact = false }) {
  return (
    <div className={`ac-stat ${compact ? 'compact' : ''}`}>
      {icon && <span className={`ac-stat-icon ${tone}`}><i className={`fa-solid ${icon}`} aria-hidden="true" /></span>}
      <div className="ac-stat-copy">
        <div className="ac-stat-label">{label}</div>
        <div className="ac-stat-num">{value}</div>
        {meta && <div className="ac-stat-meta">{meta}</div>}
      </div>
    </div>
  );
}

function AutoFormField(props) {
  const generatedId = useId();
  return <FormField {...props} htmlFor={`admin-field-${generatedId}`} />;
}

export function FormField({ label, hint, error, required, htmlFor, children, className = '' }) {
  const fieldId = htmlFor || (isValidElement(children) ? children.props.id : undefined);
  if (!fieldId) return <AutoFormField {...{ label, hint, error, required, children, className }} />;
  const hintId = `${fieldId}-hint`, errorId = `${fieldId}-error`;
  const nativeField = isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type);
  const describedBy = [nativeField && children.props['aria-describedby'], hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined;
  const field = nativeField ? cloneElement(children, { id: fieldId, 'aria-describedby': describedBy, 'aria-invalid': error ? true : children.props['aria-invalid'], 'aria-required': required || children.props['aria-required'] || undefined }) : children;
  return (
    <div className={`ac-form-field ${className}`.trim()}>
      {label && <label className="ac-field-label" htmlFor={fieldId}>{label}{required && <span aria-hidden="true"> *</span>}</label>}
      {field}
      {hint && <div id={hintId} className="ac-field-hint">{hint}</div>}
      {error && <div id={errorId} className="ac-field-error" role="alert">{error}</div>}
    </div>
  );
}

export function Tabs({ items, value, onChange, label = '页面分类', id }) {
  const generatedId = useId();
  const groupId = id || `admin-tabs-${generatedId}`;
  const selected = items.some(item => item.value === value && !item.disabled) ? value : items.find(item => !item.disabled)?.value;
  const moveFocus = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]:not(:disabled)')];
    const current = tabs.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    // Manual activation keeps arrow-key exploration from submitting queries or discarding a draft.
    tabs.forEach((tab, position) => { tab.tabIndex = position === index ? 0 : -1; });
    tabs[index]?.focus();
  };
  return (
    <div id={groupId} className="ac-tabs" role="tablist" aria-label={label} onKeyDown={moveFocus}>
      {items.map(item => (
        <button
          id={item.tabId || `${groupId}-${item.value}`}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          aria-controls={item.panelId}
          tabIndex={selected === item.value ? 0 : -1}
          disabled={item.disabled}
          className={`ac-tab ${value === item.value ? 'active' : ''}`}
          key={item.value}
          onClick={() => onChange(item.value)}
        >
          {item.icon && <i className={`fa-solid ${item.icon}`} aria-hidden="true" />}
          {item.label}
          {item.count != null && <span className="ac-tab-count">{item.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, description, icon, action, children, pad = true, foot, className = '' }) {
  return (
    <section className={`ac-card ${className}`.trim()}>
      {(title || action) && (
        <div className="ac-card-head">
          <div className="ac-card-heading">
            {icon && <span className="ac-card-icon"><i className={`fa-solid ${icon}`} aria-hidden="true" /></span>}
            <div>
              {title && <h2 className="ac-card-title">{title}</h2>}
              {description && <p className="ac-card-description">{description}</p>}
            </div>
          </div>
          {action && <div className="ac-card-action">{action}</div>}
        </div>
      )}
      {pad ? <div className="ac-card-body">{children}</div> : children}
      {foot && <div className="ac-card-foot">{foot}</div>}
    </section>
  );
}

export function ErrorBox({ msg, onRetry, retryText = '重新读取' }) {
  if (!msg) return null;
  return (
    <div className="ac-error-box" role="alert">
      <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
      <span>{msg}</span>
      {onRetry && <button type="button" className="ac-btn" onClick={onRetry}>{retryText}</button>}
    </div>
  );
}

/** Distinguish unavailable, stale and genuinely empty server resources without inventing data. */
export function ResourceState({ loading, error, hasData = false, empty = false, onRetry, loadingText = '正在读取…', emptyText = '暂无记录', children }) {
  if (loading && !hasData) return <Loading text={loadingText} />;
  if (error && !hasData) return <ErrorBox msg={error} onRetry={onRetry} />;
  return <div className="ac-resource" aria-busy={loading || undefined}>
    {loading && <p className="ac-refresh-note" role="status"><i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />正在刷新，以下为上次读取的结果。</p>}
    {error && <ErrorBox msg={`${error}；以下为上次读取的结果。`} onRetry={onRetry} />}
    {empty ? <Empty text={emptyText} /> : children}
  </div>;
}

/** Present local draft state without implying that a write was accepted by the server. */
export function SaveState({ dirty, busy, error, savedText = '当前显示已读取的配置' }) {
  return <div className={`ac-save-state ${error ? 'has-error' : dirty ? 'is-dirty' : ''}`} role={error ? 'alert' : 'status'}>
    <i className={`fa-solid ${error ? 'fa-circle-exclamation' : busy ? 'fa-spinner fa-spin' : dirty ? 'fa-pen-to-square' : 'fa-circle-check'}`} aria-hidden="true" />
    <span>{error || (busy ? '正在提交，请勿重复操作…' : dirty ? '有未保存修改' : savedText)}</span>
  </div>;
}

/** Readable narrow-screen record with actions kept beside its object context. */
export function RecordCard({ title, subtitle, meta, actions, children, className = '' }) {
  return <article className={`ac-record-card ${className}`.trim()}>
    <div className="ac-record-head"><div><div className="ac-record-title">{title}</div>{subtitle && <div className="ac-record-subtitle">{subtitle}</div>}</div>{meta && <div className="ac-record-meta">{meta}</div>}</div>
    {children}
    {actions && <div className="ac-record-actions">{actions}</div>}
  </article>;
}
