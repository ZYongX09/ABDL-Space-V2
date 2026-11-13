import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  SPONSOR_CHANNEL_LABELS, SPONSOR_LEDGER_CHANNELS, SPONSOR_LEDGER_PAGE_SIZE,
  alipayRefundRequest, formatLedgerMoney, formatLedgerTime, fullRefundAmount, isRefundable,
  ledgerEmptyText, ledgerMessage, ledgerPage, ledgerUser, newIdempotencyKey, recordKey,
  refundErrorMessage, sponsorLedgerError, sponsorLedgerQuery, verifySponsorRefundReceipt,
} from './sponsorLedgerModel.js';
import './sponsorLedger.css';

function LedgerAvatar({ src, name, known = true }) {
  const fallback = known ? (name || '?').slice(0, 1).toUpperCase() || '?' : '?';
  return <span className="sa-ledger-avatar" data-known={known ? 'true' : 'false'} aria-hidden="true">
    <span className="sa-ledger-avatar-fallback">{fallback}</span>
    {src ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /> : null}
  </span>;
}

function LedgerValue({ value, label }) {
  const text = String(value ?? '—');
  return text.length > 32 || text.includes('\n') ? <details className="sa-long-value"><summary>查看完整{label}（{text.length} 字符）</summary><span className="sa-full-value">{text}</span></details> : <span className="sa-full-value">{text}</span>;
}

export function RecordRow({ record, onRefund, refundOpen }) {
  const user = ledgerUser(record), message = ledgerMessage(record);
  const unredeemed = record.channel === 'afdian' && record.redeemer === null;
  const refundable = isRefundable(record);
  return <article className="sa-ledger-row" data-channel={record.channel} data-testid={`ledger-row-${record.channel}`}>
    <div className="sa-ledger-user">
      <LedgerAvatar src={user.avatar} name={user.username} known={user.known} />
      <div className="sa-ledger-user-copy">
        <strong>{user.username}</strong>
        <span className="sa-ledger-tags">
          <span className="sa-badge" data-channel={record.channel}>{SPONSOR_CHANNEL_LABELS[record.channel]}</span>
          {unredeemed && <span className="sa-badge" data-state="unknown">未兑换</span>}
        </span>
      </div>
    </div>
    <dl className="sa-ledger-fields">
      <div><dt>支付时间</dt><dd>{formatLedgerTime(record.paid_at)}</dd></div>
      <div><dt>{record.channel === 'afdian' ? '爱发电订单号' : '订单号'}</dt><dd className="sa-ledger-mono"><LedgerValue value={record.order_no} label="订单号" /></dd></div>
      <div><dt>套餐</dt><dd><LedgerValue value={record.plan_name} label="套餐" /></dd></div>
      {message && <div className="sa-ledger-field-wide"><dt>留言</dt><dd><LedgerValue value={message} label="留言" /></dd></div>}
      <div><dt>实付金额</dt><dd className="sa-ledger-amount">{formatLedgerMoney(record.amount_minor)}</dd></div>
    </dl>
    <div className="sa-ledger-row-actions">
      {refundable ? <button type="button" className="sa-button sa-danger" onClick={() => onRefund(record)} disabled={refundOpen}>退款</button> : <span className="sa-muted">{record.channel === 'afdian' ? '本站不提供爱发电退款' : '服务器未开放退款'}</span>}
    </div>
  </article>;
}

export function RecordTable({ items, onRefund, refundOpen }) {
  return <table className="sa-table sa-ledger-table"><caption>支付记录 · 按服务器支付时间倒序</caption><thead><tr><th scope="col">渠道 / 用户</th><th scope="col">订单 / 套餐</th><th scope="col">支付时间（上海）</th><th scope="col">实付金额</th><th scope="col">操作</th></tr></thead><tbody>{items.map(record => {
    const user = ledgerUser(record), message = ledgerMessage(record);
    return <tr key={recordKey(record)}><td><strong>{user.username}</strong><p><span className="sa-badge">{SPONSOR_CHANNEL_LABELS[record.channel]}</span>{record.channel === 'afdian' && record.redeemer === null && <span className="sa-badge" data-state="unknown">未兑换</span>}</p></td><td><LedgerValue value={record.order_no} label="订单号" /><p><LedgerValue value={record.plan_name} label="套餐" /></p>{message && <details className="sa-disclosure"><summary>查看完整留言</summary><p className="sa-full-value">{message}</p></details>}</td><td>{formatLedgerTime(record.paid_at)}</td><td className="sa-ledger-amount">{formatLedgerMoney(record.amount_minor)}</td><td>{isRefundable(record) ? <button type="button" className="sa-button sa-danger" onClick={() => onRefund(record)} disabled={refundOpen}>退款</button> : <span className="sa-muted">{record.channel === 'afdian' ? '本站不提供爱发电退款' : '服务器未开放退款'}</span>}</td></tr>;
  })}</tbody></table>;
}

export default function SponsorLedgerPanel({ api, actions, onRefunded }) {
  const titleId = useId();
  const [channel, setChannel] = useState('');
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [notice, setNotice] = useState('');
  const [refund, setRefund] = useState(null);
  const [reloadError, setReloadError] = useState('');
  const mounted = useRef(true), locked = useRef(false), activeApi = useRef(api);
  activeApi.current = api;

  const query = useMemo(() => sponsorLedgerQuery({ channel, limit: SPONSOR_LEDGER_PAGE_SIZE, offset }), [channel, offset]);
  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true, error: '' });
    Promise.resolve().then(() => api.paymentRecords(query)).then(data => {
      if (!alive) return;
      setState({ data, loading: false, error: '' });
      const page = ledgerPage(data);
      if (page.empty && data.total > 0 && data.offset > 0) {
        setOffset(Math.max(0, Math.floor((data.total - 1) / SPONSOR_LEDGER_PAGE_SIZE) * SPONSOR_LEDGER_PAGE_SIZE));
      }
    }, error => { if (alive) setState({ data: null, loading: false, error: sponsorLedgerError(error) }); });
    return () => { alive = false; };
  }, [api, query, revision]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    // 账户/API 切换时丢弃旧草稿与退款操作标识，避免旧账户响应渗透。
    setChannel(''); setOffset(0); setRefund(null); setNotice(''); setReloadError('');
  }, [api]);

  const read = () => setRevision(value => value + 1);
  const refundActive = refund !== null;
  function changeChannel(value) {
    if (refundActive) return;
    setChannel(value); setOffset(0); setNotice(''); setReloadError('');
  }
  function openRefund(record) {
    if (refundActive || state.loading) return;
    try { setRefund({ record, amount: fullRefundAmount(record), reason: '', key: '', body: null, phase: 'form', error: '' }); setReloadError(''); }
    catch (error) { setReloadError(error.message); }
  }
  function patchRefund(patch) { setRefund(value => value && { ...value, ...patch }); }

  async function submitRefund(event) {
    event?.preventDefault?.();
    if (!refund || locked.current || actions.busy || state.loading || refund.phase === 'saving' || refund.phase === 'confirming') return;
    let body;
    try { body = refund.phase === 'unknown' && refund.body ? refund.body : alipayRefundRequest(refund.record, refund.amount, refund.reason); }
    catch (error) { patchRefund({ error: error.message }); return; }
    const reuse = refund.phase === 'unknown' && refund.key;
    const key = reuse ? refund.key : newIdempotencyKey();
    const scope = api;
    locked.current = true;
    patchRefund({ phase: 'confirming', key, body, error: '' });
    let accepted;
    try {
      accepted = await actions.confirm(`${reuse ? '上次退款结果未知，本次将复用同一操作标识重试。' : ''}确认对订单 ${refund.record.order_no} 退款 ${formatLedgerMoney(body.refund_amount)}？退款不会自动取消已发放权益，请先核对是否已人工处理。`);
    } finally { locked.current = false; }
    if (!mounted.current || activeApi.current !== scope) return;
    if (!accepted) { patchRefund({ phase: reuse ? 'unknown' : 'form' }); return; }
    locked.current = true;
    patchRefund({ phase: 'saving' });
    try {
      const receipt = verifySponsorRefundReceipt(await api.refundAlipayOrder(refund.record.order_no, body, key), refund.record.order_no, body);
      if (!mounted.current || activeApi.current !== scope) return;
      setNotice(`退款申请已受理：订单 ${receipt.order_no}，金额 ${formatLedgerMoney(receipt.refund_amount_minor)}，服务器状态 ${receipt.status}。退款不会自动取消已发放权益，请按需人工处理。`);
      setRefund(null);
      setRevision(value => value + 1);
      onRefunded?.();
    } catch (error) {
      if (!mounted.current || activeApi.current !== scope) return;
      const definitive = error.definitive === true;
      setRefund(value => value && { ...value, phase: definitive ? 'form' : 'unknown', error: refundErrorMessage(error), key: definitive ? '' : key, body: definitive ? null : body });
    } finally { locked.current = false; }
  }

  async function closeRefund() {
    if (!refund || refund.phase === 'saving' || refund.phase === 'confirming') return;
    if (refund.phase === 'unknown' && !await actions.confirm('退款结果仍未知。关闭后再次发起将生成新的操作标识，可能造成重复退款。请确认已核对订单与概览后再关闭。')) return;
    if (!mounted.current) return;
    if (refund.phase === 'unknown') setNotice('已关闭结果未知的退款操作；请以服务器订单状态与概览为准，不要直接重复扣款。');
    setRefund(null);
  }

  const page = state.data ? ledgerPage(state.data) : null;

  return <section id="sponsor-ledger" className="sa-panel sa-ledger" aria-labelledby={titleId} data-testid="sponsor-ledger-panel" aria-busy={state.loading}>
    <header className="sa-ledger-heading">
      <div><h2 id={titleId}>赞助明细</h2><p className="sa-muted">按支付时间倒序读取服务器支付记录。支付宝与爱发电共用分页；金额由分换算为元展示。</p></div>
      <button type="button" className="sa-button" onClick={read} disabled={state.loading || actions.busy}>{state.loading ? '正在读取明细…' : '刷新明细'}</button>
    </header>
    <div className="sa-ledger-toolbar">
      <label className="sa-ledger-filter">渠道筛选
        <select value={channel} onChange={event => changeChannel(event.target.value)} disabled={state.loading || refundActive}>
          <option value="">全部渠道</option>
          {SPONSOR_LEDGER_CHANNELS.map(value => <option key={value} value={value}>{SPONSOR_CHANNEL_LABELS[value]}</option>)}
        </select>
      </label>
      {refundActive && <p className="sa-muted">退款操作进行中：渠道筛选暂不可切换，避免丢失原因或操作标识。</p>}
    </div>
    {notice && <p role="status" className="sa-message">{notice}</p>}
    {reloadError && <p role="alert" className="sa-message sa-error">{reloadError}</p>}
    {state.loading && <p role="status" className="sa-message">正在读取支付明细…</p>}
    {state.error && <div role="alert" className="sa-message sa-error"><p>{state.error}</p><p>列表未更新，不能据此判断支付、退款或未兑换状态。</p><button type="button" className="sa-button" onClick={read}>重新读取</button></div>}
    {state.data && page && <>
      {page.empty ? <div className="sa-empty" role="status"><strong>{ledgerEmptyText(channel)}</strong><p>{channel ? '当前渠道读取成功但没有记录；可选择全部渠道核查。' : '服务器当前没有支付记录，不代表接口读取失败。'} 本页不创建订单、不推断到账。</p></div> : <><RecordTable items={state.data.items} onRefund={openRefund} refundOpen={refundActive || !!actions.busy} /><div className="sa-ledger-list sa-ledger-mobile">{state.data.items.map(record => <RecordRow key={recordKey(record)} record={record} onRefund={openRefund} refundOpen={refundActive || !!actions.busy} />)}</div></>}
      <nav aria-label="支付明细分页" className="sa-ledger-pagination">
        <span>共 {page.total} 条 · 第 {page.page} / {page.pages} 页</span>
        <div className="sa-actions">
          <button type="button" className="sa-button" disabled={state.loading || refundActive || actions.busy || !page.hasPrev} onClick={() => setOffset(Math.max(0, page.offset - page.limit))}>上一页</button>
          <button type="button" className="sa-button" disabled={state.loading || refundActive || actions.busy || !page.hasNext} onClick={() => setOffset(page.offset + page.limit)}>下一页</button>
        </div>
      </nav>
      <p className="sa-muted">时间倒序来自服务器；页面不按本地时间重排。未兑换的爱发电订单显示通用头像与「未知用户」，已兑换订单显示服务器给出的实际兑换用户。</p>
    </>}
    {refund && <form className="sa-ledger-refund" onSubmit={submitRefund} noValidate data-testid="refund-form">
      <h3>退款 · {SPONSOR_CHANNEL_LABELS[refund.record.channel]}订单</h3><p role="status" className="sa-save-state" data-dirty={!!refund.reason}>{refund.phase === 'unknown' ? '结果未知 · 原金额、原因与操作标识已锁定保留' : refund.phase === 'saving' ? '正在发送退款申请' : refund.phase === 'confirming' ? '等待核对目标与金额' : '退款草稿 · 未提交，不会自动发送'}</p><h4>1. 核对目标与影响</h4>
      <dl className="sa-ledger-refund-target">
        <div><dt>订单号</dt><dd className="sa-ledger-mono"><LedgerValue value={refund.record.order_no} label="退款订单号" /></dd></div>
        <div><dt>实付金额</dt><dd>{formatLedgerMoney(refund.record.amount_minor)}</dd></div>
      </dl>
      <p className="sa-ledger-warning">退款不会自动取消已发放权益。本操作只提交支付宝退款申请，不撤销赞助身份、额度、颜色或其他已发放权益；如需撤销请另行处理并留审计理由。</p>
      <h4>2. 金额与审计原因</h4><div className="sa-grid">
        <label className="sa-field">退款金额（元 / CNY）
          <input inputMode="decimal" value={refund.amount} onChange={event => patchRefund({ amount: event.target.value })} disabled={refund.phase === 'saving' || refund.phase === 'confirming' || refund.phase === 'unknown'} required aria-describedby={`${titleId}-refund-amount`} />
          <small id={`${titleId}-refund-amount`}>默认全额；必须大于 0 且不超过实付金额。结果未知时锁定为上次请求金额。</small>
        </label>
        <label className="sa-field">退款原因（必填）
          <textarea rows={3} maxLength={500} value={refund.reason} onChange={event => patchRefund({ reason: event.target.value })} disabled={refund.phase === 'saving' || refund.phase === 'confirming' || refund.phase === 'unknown'} required aria-describedby={`${titleId}-refund-reason`} />
          <small id={`${titleId}-refund-reason`}>最多 500 字；结果未知时会保留，重试沿用同一原因与操作标识。</small>
        </label>
      </div>
      {refund.phase === 'unknown' && <p role="alert" className="sa-message sa-error">上次退款结果未知。请先核对订单与概览；仅在确认需要重试时使用下方按钮，将复用同一操作标识，不会自动重复提交。</p>}
      {refund.error && <p role="alert" className="sa-message sa-error">{refund.error}</p>}
      {(refund.phase === 'saving' || refund.phase === 'confirming') && <p role="status" className="sa-message">正在提交退款申请，请勿重复操作…</p>}
      <div className="sa-actions">
        <button type="submit" className="sa-button sa-danger" disabled={actions.busy || state.loading || refund.phase === 'saving' || refund.phase === 'confirming'}>{refund.phase === 'saving' ? '正在提交退款…' : refund.phase === 'confirming' ? '等待确认…' : refund.phase === 'unknown' ? '重试同一退款请求' : '提交退款申请'}</button>
        <button type="button" className="sa-button" onClick={closeRefund} disabled={refund.phase === 'saving' || refund.phase === 'confirming'}>取消</button>
      </div>
    </form>}
  </section>;
}
