export const VIEWABLE_RATIO = 0.5;
export const VIEWABLE_MS = 1000;

export const supportsAdViewability = () => typeof globalThis.IntersectionObserver === 'function' && typeof globalThis.document?.visibilityState === 'string';
export const shouldRequestAdViewability = ({ page, search, filter, excludeNsfw, adViewability }) => adViewability === true && Number(page) === 1 && !search && !filter && !excludeNsfw;

// Use monotonic time and a fresh observer after each foreground interruption. Cleanup never reports.
export function observeViewableAd(element, report, {
  doc = document, win = window, Observer = globalThis.IntersectionObserver,
  now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout,
} = {}) {
  if (!element || typeof Observer !== 'function') return () => {};
  let observer = null;
  let timer = null;
  let since = null;
  let stopped = false;
  let pageHidden = false;
  const foreground = () => !pageHidden && doc.visibilityState === 'visible' && (typeof doc.hasFocus !== 'function' || doc.hasFocus());
  const reset = () => {
    if (timer !== null) cancel(timer);
    timer = null;
    since = null;
  };
  const disconnect = () => { reset(); observer?.disconnect(); observer = null; };
  const qualifies = entry => entry.target === element && entry.isIntersecting && entry.intersectionRatio >= VIEWABLE_RATIO
    && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
  const onEntries = entries => {
    for (const entry of entries) {
      if (entry.target !== element) continue;
      if (!foreground() || !qualifies(entry)) reset();
      else if (since === null) {
        since = now();
        timer = schedule(check, VIEWABLE_MS);
      }
    }
  };
  function check() {
    timer = null;
    if (stopped || !foreground() || element.isConnected === false || !observer) { reset(); return; }
    const records = observer.takeRecords();
    if (records.length) {
      onEntries(records);
      if (timer !== null) return;
    }
    if (since === null) return;
    const remaining = VIEWABLE_MS - (now() - since);
    if (remaining > 0) { timer = schedule(check, remaining); return; }
    stop();
    report();
  }
  const refresh = () => {
    disconnect();
    if (stopped || !foreground()) return;
    const next = new Observer(entries => { if (observer === next) onEntries(entries); }, { threshold: [VIEWABLE_RATIO] });
    observer = next;
    next.observe(element);
  };
  const hide = () => { pageHidden = true; disconnect(); };
  const show = () => { pageHidden = false; refresh(); };
  function stop() {
    stopped = true;
    disconnect();
    doc.removeEventListener('visibilitychange', refresh);
    win.removeEventListener('blur', disconnect);
    win.removeEventListener('focus', refresh);
    win.removeEventListener('pagehide', hide);
    win.removeEventListener('pageshow', show);
  }
  doc.addEventListener('visibilitychange', refresh);
  win.addEventListener('blur', disconnect);
  win.addEventListener('focus', refresh);
  win.addEventListener('pagehide', hide);
  win.addEventListener('pageshow', show);
  refresh();
  return stop;
}
