/** Neutral outage page: no product name, no reason, no reference to any setting. */
export default function SiteUnavailablePage({ message }) {
  return (
    <div className="site-unavailable" role="alert">
      <div className="site-unavailable-box">
        <div className="site-unavailable-code">503</div>
        <h1 className="site-unavailable-title">网站暂时无法访问</h1>
        <p className="site-unavailable-message">{message || '请稍后刷新页面重试。'}</p>
        <p className="site-unavailable-hint">Service Temporarily Unavailable</p>
      </div>
    </div>
  );
}
