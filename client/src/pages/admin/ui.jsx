import { createContext, useCallback, useContext, useState } from 'react';

/**
 * 管理控制台共享 UI 原语（纯函数组件 + 轻量 Modal / Confirm）
 */

/* ───────── 确认弹窗（Context 化，任何子树可用） ───────── */
const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, danger, onOk }

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      setState({
        title: opts.title || '确认操作',
        message: opts.message || '',
        okText: opts.okText || '确认',
        danger: !!opts.danger,
        resolve,
      });
    });
  }, []);

  const close = (val) => {
    if (state) state.resolve(val);
    setState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="ac-overlay" onClick={() => close(false)}>
          <div className="ac-modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="ac-modal-head">
              <i className={`fa-solid ${state.danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}`} style={{ color: state.danger ? '#dc2626' : 'var(--primary-dark)' }} />
              {state.title}
            </div>
            <div className="ac-modal-body" style={{ fontSize: 13, color: 'var(--text)' }}>
              {state.message}
            </div>
            <div className="ac-modal-foot">
              <button className="ac-btn" onClick={() => close(false)}>取消</button>
              <button className={`ac-btn ${state.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>{state.okText}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm 必须在 ConfirmProvider 内使用');
  return ctx;
}

/* ───────── Modal ───────── */
export function Modal({ open, onClose, title, children, footer, width = 520 }) {
  if (!open) return null;
  return (
    <div className="ac-overlay" onClick={onClose}>
      <div className="ac-modal" style={{ maxWidth: width }} onClick={e => e.stopPropagation()}>
        <div className="ac-modal-head">
          {title}
          <button className="ac-modal-close" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="ac-modal-body">{children}</div>
        {footer && <div className="ac-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ───────── 抽屉（右侧详情） ───────── */
export function Drawer({ open, onClose, head, children }) {
  if (!open) return null;
  return (
    <>
      <div className="ac-drawer-overlay" onClick={onClose} />
      <div className="ac-drawer">
        <div className="ac-drawer-head">
          <button className="ac-btn ghost" onClick={onClose}><i className="fa-solid fa-arrow-left" /></button>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{head}</div>
        </div>
        <div className="ac-drawer-body">{children}</div>
      </div>
    </>
  );
}

/* ───────── 分页 ───────── */
export function Pagination({ page, totalPages, total, onChange, size = 'sm' }) {
  if (!totalPages || totalPages <= 1) {
    return <div className="ac-page-info">共 {total ?? 0} 条</div>;
  }
  const pages = [];
  const half = 2;
  const start = Math.max(1, page - half);
  const end = Math.min(totalPages, page + half);
  if (start > 1) pages.push(1);
  if (start > 2) pages.push('...');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < totalPages - 1) pages.push('...');
  if (end < totalPages) pages.push(totalPages);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <span className="ac-page-info">共 {total ?? 0} 条 · 第 {page}/{totalPages} 页</span>
      <div className="ac-pagination">
        <button className="ac-page-btn" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <i className="fa-solid fa-chevron-left" />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} style={{ color: 'var(--text-muted)', fontSize: 12 }}>…</span>
          ) : (
            <button key={p} className={`ac-page-btn ${p === page ? 'active' : ''}`} onClick={() => onChange(p)}>{p}</button>
          )
        )}
        <button className="ac-page-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          <i className="fa-solid fa-chevron-right" />
        </button>
      </div>
    </div>
  );
}

/* ───────── 小部件 ───────── */
export function Pill({ tone = 'slate', children }) {
  return <span className={`ac-pill ${tone}`}>{children}</span>;
}

const TONE_BY_STATUS = {
  pending: 'amber', resolved: 'green', dismissed: 'slate', rejected: 'red',
  published: 'green', archived: 'slate', draft: 'slate', review_pending: 'amber', reviewing: 'amber',
  accepted: 'green',
};

export function StatusPill({ status }) {
  return <Pill tone={TONE_BY_STATUS[status] || 'slate'}>{status || '-'}</Pill>;
}

export function Empty({ icon = 'fa-inbox', text = '暂无数据' }) {
  return (
    <div className="ac-empty">
      <i className={`fa-solid ${icon}`} />
      {text}
    </div>
  );
}

export function Loading({ text = '加载中...' }) {
  return (
    <div className="ac-loading">
      <i className="fa-solid fa-spinner fa-spin" />
      {text}
    </div>
  );
}

export function Avatar({ src, size = 30 }) {
  return (
    <img
      src={src || ''}
      alt=""
      className="ac-avatar"
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', background: 'var(--input-bg)' }}
      onError={e => { e.currentTarget.style.visibility = 'hidden'; }}
    />
  );
}

export function UserCell({ name, avatar, id, sub }) {
  return (
    <div className="ac-user-cell">
      <Avatar src={avatar} size={30} />
      <div style={{ minWidth: 0 }}>
        <div className="ac-uname">{name || '未命名'}</div>
        {(id != null || sub != null) && <div className="ac-uid">ID: {id ?? sub}</div>}
      </div>
    </div>
  );
}

/** 相对昨日/上周变化小标签 */
export function Delta({ cur, prev, suffix = '' }) {
  const d = pctDeltaLocal(cur, prev);
  if (d === null) return <span className="ac-delta flat">新增</span>;
  if (d === 0) return <span className="ac-delta flat">持平</span>;
  const up = d > 0;
  return <span className={`ac-delta ${up ? 'up' : 'down'}`}>
    <i className={`fa-solid ${up ? 'fa-caret-up' : 'fa-caret-down'}`} />{Math.abs(d)}%{suffix}
  </span>;
}

function pctDeltaLocal(cur, prev) {
  const c = Number(cur) || 0;
  const p = Number(prev) || 0;
  if (p <= 0) return c > 0 ? null : 0;
  return Math.round(((c - p) / p) * 100);
}

/* 卡片头部通用 */
export function Card({ title, icon, action, children, pad = true, foot }) {
  return (
    <div className="ac-card">
      <div className="ac-card-head">
        <span className="ac-card-title">
          {icon && <i className={`fa-solid ${icon} fa-icon`} />}
          {title}
        </span>
        {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
      </div>
      {pad ? <div className="ac-card-body">{children}</div> : children}
      {foot && <div className="ac-card-foot">{foot}</div>}
    </div>
  );
}

/** 错误提示条 */
export function ErrorBox({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ background: 'rgba(220,38,38,.08)', color: '#dc2626', borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
      <i className="fa-solid fa-circle-exclamation" />
      {msg}
    </div>
  );
}