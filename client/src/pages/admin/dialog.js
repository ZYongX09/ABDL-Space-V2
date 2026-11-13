const managers = new WeakMap();
const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** One document owns its overlay stack, background isolation and scroll lock. */
export function createDialogManager(document) {
  const layers = [];
  const isolated = new Map();
  let overflow;
  const top = () => layers.at(-1);
  const focusable = panel => [...panel.querySelectorAll(FOCUSABLE)].filter(element => element.getAttribute('tabindex') !== '-1' && !element.hidden && !element.closest('[hidden], [inert], [aria-hidden="true"]') && document.defaultView.getComputedStyle(element).display !== 'none' && document.defaultView.getComputedStyle(element).visibility !== 'hidden' && (typeof element.getClientRects !== 'function' || element.getClientRects().length > 0));
  const restoreIsolation = () => {
    for (const [element, previous] of isolated) {
      element.inert = previous.inert;
      if (previous.ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', previous.ariaHidden);
    }
    isolated.clear();
  };
  const isolate = () => {
    restoreIsolation();
    const current = top();
    if (!current) return;
    let child = current.panel;
    while (child?.parentElement) {
      for (const sibling of child.parentElement.children) {
        if (sibling === child || sibling.classList?.contains('toast-container') || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) continue;
        isolated.set(sibling, { inert: sibling.inert, ariaHidden: sibling.getAttribute('aria-hidden') });
        sibling.inert = true;
        sibling.setAttribute('aria-hidden', 'true');
      }
      child = child.parentElement;
      if (child === document.body) break;
    }
  };
  const initialFocus = layer => {
    const preferred = layer.initialFocus === 'cancel' ? layer.panel.querySelector('[data-dialog-cancel]:not(:disabled)') : layer.panel.querySelector('[data-autofocus]:not(:disabled)');
    const items = focusable(layer.panel);
    const target = items.includes(preferred) ? preferred : items[0] || layer.panel;
    target.focus();
  };
  const onKeyDown = event => {
    const layer = top();
    if (!layer || event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      layer.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = focusable(layer.panel);
    const first = items[0], last = items.at(-1);
    if (!items.length) { event.preventDefault(); layer.panel.focus(); return; }
    if (!layer.panel.contains(document.activeElement) || event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };
  const onFocusIn = event => {
    const layer = top();
    if (layer && !layer.panel.contains(event.target)) initialFocus(layer);
  };
  return {
    register(panel, close, { initialFocus: preferredFocus = 'first' } = {}) {
      const layer = { panel, close, initialFocus: preferredFocus, previousFocus: document.activeElement };
      if (!layers.length) {
        overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKeyDown, true);
        document.addEventListener('focusin', onFocusIn, true);
      }
      layers.push(layer);
      const previousTabIndex = panel.getAttribute('tabindex');
      if (previousTabIndex === null) panel.setAttribute('tabindex', '-1');
      const onCancel = event => { event.preventDefault(); if (top() === layer) close(); };
      panel.addEventListener('cancel', onCancel);
      isolate();
      const frame = document.defaultView.requestAnimationFrame(() => { if (top() === layer) initialFocus(layer); });
      return () => {
        document.defaultView.cancelAnimationFrame(frame);
        panel.removeEventListener('cancel', onCancel);
        const index = layers.indexOf(layer);
        if (index === -1) return;
        const wasTop = top() === layer;
        layers.splice(index, 1);
        restoreIsolation();
        if (previousTabIndex === null) panel.removeAttribute('tabindex');
        if (!layers.length) {
          document.body.style.overflow = overflow;
          document.removeEventListener('keydown', onKeyDown, true);
          document.removeEventListener('focusin', onFocusIn, true);
        } else isolate();
        if (wasTop) {
          const previous = layer.previousFocus;
          if (previous?.isConnected && (!top() || top().panel.contains(previous)) && !previous.closest('[inert]')) previous.focus();
          else if (top()) initialFocus(top());
        }
      };
    },
    isTop(panel) { return top()?.panel === panel; },
    get size() { return layers.length; },
  };
}

/** Register an actual mounted overlay without affecting another document or session. */
export function registerAdminDialog(panel, close, options) {
  const document = panel.ownerDocument;
  let manager = managers.get(document);
  if (!manager) { manager = createDialogManager(document); managers.set(document, manager); }
  return manager.register(panel, close, options);
}
