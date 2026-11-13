import { useEffect, useId, useState } from 'react';
import { formatTime } from './adminModel.js';
import { overviewIsEmpty, overviewSections, sponsorOverviewError } from './sponsorLedgerModel.js';
import './sponsorLedger.css';

// 概览只读取服务器汇总；金额由服务器以分返回，本组件仅换算展示，不做本地聚合或缓存。
export default function SponsorOverviewPanel({ api, revision = 0 }) {
  const titleId = useId();
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    setState({ data: null, loading: true, error: '' });
    Promise.resolve().then(() => api.overview()).then(data => {
      if (alive) setState({ data, loading: false, error: '' });
    }, error => { if (alive) setState({ data: null, loading: false, error: sponsorOverviewError(error) }); });
    return () => { alive = false; };
  }, [api, revision, reload]);
  const read = () => setReload(value => value + 1);

  return <section id="sponsor-income" className="sa-panel sa-ledger-overview" aria-labelledby={titleId} data-testid="sponsor-overview-panel" aria-busy={state.loading}>
    <header className="sa-ledger-heading">
      <div><h2 id={titleId}>赞助者概览</h2><p className="sa-muted">按渠道读取服务器汇总。金额单位为人民币元（服务器返回分），统计范围仅限本系统对应渠道订单，不代表平台全部资金。</p></div>
      <button type="button" className="sa-button" onClick={read} disabled={state.loading}>{state.loading ? '正在读取概览…' : '刷新概览'}</button>
    </header>
    {state.loading && <p role="status" className="sa-message">正在读取赞助者概览…</p>}
    {state.error && <div role="alert" className="sa-message sa-error"><p>{state.error}</p><p>概览未更新，不能据此判断收入或人次。</p><button type="button" className="sa-button" onClick={read}>重新读取</button></div>}
    {state.data && <>
      <div className="sa-sample-bar"><span className="sa-badge">服务器汇总样本 · 非实时余额</span><p className="sa-muted">服务器汇总时间：{formatTime(state.data.generated_at)}（Asia/Shanghai）</p><a className="sa-text-link" href="#sponsor-ledger">核对逐笔支付明细</a></div>
      <div className="sa-ledger-overview-grid">{overviewSections(state.data).map(section => <article className="sa-subpanel sa-ledger-overview-card" key={section.channel} data-channel={section.channel}>
        <h3>{section.label}</h3>
        <dl className="sa-ledger-metrics">{section.metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      </article>)}</div>
      {overviewIsEmpty(state.data) && <p className="sa-message">暂无赞助收入记录：两渠道当前汇总均为 0。0 是服务器返回的实际汇总，不是本地占位。</p>}
      <details className="sa-disclosure sa-ledger-scope"><summary>查看收入统计口径与退款影响</summary><p>仅支付宝渠道提供「当月人次」；爱发电不推断缺失字段。两个渠道分别展示服务器汇总，页面不自行合并或估算净收入。</p><p>刷新只读取，不执行对账、退款或权益操作。退款成功后请以刷新后的服务器汇总为准，已发放权益不会因退款自动取消。</p></details>
    </>}
  </section>;
}
