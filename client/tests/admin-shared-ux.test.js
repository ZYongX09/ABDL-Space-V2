import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createDialogManager } from '../src/pages/admin/dialog.js';

const source = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

function documentFixture() {
  const listeners = new Map(), frames = new Map();
  let frame = 0;
  const document = { activeElement: null, defaultView: {
    getComputedStyle() { return { display: 'block', visibility: 'visible' }; },
    requestAnimationFrame(fn) { frames.set(++frame, fn); return frame; },
    cancelAnimationFrame(id) { frames.delete(id); },
  }, addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); } };
  class Element {
    constructor(name, parent = null) { this.name = name; this.tagName = 'DIV'; this.children = []; this.parentElement = parent; this.attributes = new Map(); this.inert = false; this.hidden = false; this.isConnected = true; this.events = new Map(); this.style = {}; if (parent) parent.children.push(this); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    contains(other) { return other === this || this.children.some(child => child.contains(other)); }
    closest(selector) { if (selector.includes('[inert]') && this.inert || selector.includes('[hidden]') && this.hidden || selector.includes('[aria-hidden="true"]') && this.getAttribute('aria-hidden') === 'true') return this; return this.parentElement?.closest(selector) ?? null; }
    descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); }
    querySelectorAll() { return this.descendants().filter(child => child.tagName === 'BUTTON' && !child.disabled); }
    querySelector(selector) { return this.querySelectorAll().find(child => selector.includes('data-dialog-cancel') ? child.getAttribute('data-dialog-cancel') !== null : child.getAttribute('data-autofocus') !== null) ?? null; }
    addEventListener(name, fn) { this.events.set(name, fn); }
    removeEventListener(name, fn) { if (this.events.get(name) === fn) this.events.delete(name); }
    focus() { document.activeElement = this; }
  }
  document.body = new Element('body'); document.body.style.overflow = 'auto';
  const background = new Element('background', document.body);
  const trigger = new Element('trigger', background); trigger.tagName = 'BUTTON'; trigger.focus();
  const dialog = name => {
    const layer = new Element(`${name}-layer`, document.body), panel = new Element(name, layer);
    const cancel = new Element(`${name}-cancel`, panel); cancel.tagName = 'BUTTON'; cancel.setAttribute('data-dialog-cancel', '');
    const execute = new Element(`${name}-execute`, panel); execute.tagName = 'BUTTON'; execute.setAttribute('data-autofocus', '');
    return { layer, panel, cancel, execute };
  };
  const flush = () => { const queue = [...frames.values()]; frames.clear(); queue.forEach(fn => fn()); };
  const key = (value, shiftKey = false) => { const event = { key: value, shiftKey, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } }; listeners.get('keydown')?.(event); return event; };
  return { document, background, trigger, dialog, flush, key, listeners };
}

test('stacked admin overlays only dismiss the top layer, preserve the scroll lock and restore focus', () => {
  const f = documentFixture(), manager = createDialogManager(f.document), first = f.dialog('detail'), second = f.dialog('confirm');
  const calls = [];
  const removeFirst = manager.register(first.panel, () => calls.push('detail'));
  f.flush(); assert.equal(f.document.activeElement, first.execute);
  assert.equal(f.background.inert, true); assert.equal(f.document.body.style.overflow, 'hidden');
  const removeSecond = manager.register(second.panel, () => calls.push('confirm'), { initialFocus: 'cancel' });
  f.flush(); assert.equal(f.document.activeElement, second.cancel); assert.equal(first.layer.inert, true);
  const escape = f.key('Escape'); assert.deepEqual(calls, ['confirm']); assert.equal(escape.prevented, true); assert.equal(escape.stopped, true);
  second.execute.focus(); assert.equal(f.key('Tab').prevented, true); assert.equal(f.document.activeElement, second.cancel);
  assert.equal(f.key('Tab', true).prevented, true); assert.equal(f.document.activeElement, second.execute);
  removeSecond(); assert.equal(f.document.activeElement, first.execute); assert.equal(f.document.body.style.overflow, 'hidden'); assert.equal(first.layer.inert, false);
  f.key('Escape'); assert.deepEqual(calls, ['confirm', 'detail']);
  removeFirst(); assert.equal(f.document.activeElement, f.trigger); assert.equal(f.background.inert, false); assert.equal(f.background.getAttribute('aria-hidden'), null); assert.equal(f.document.body.style.overflow, 'auto'); assert.equal(f.listeners.size, 0);
});

test('native cancel and out-of-order teardown do not close or unlock another active dialog', () => {
  const f = documentFixture(), manager = createDialogManager(f.document), first = f.dialog('first'), second = f.dialog('second');
  f.background.inert = true; f.background.setAttribute('aria-hidden', 'true');
  const closed = [];
  const removeFirst = manager.register(first.panel, () => closed.push('first'));
  const removeSecond = manager.register(second.panel, () => closed.push('second'));
  let prevented = false;
  first.panel.events.get('cancel')({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.deepEqual(closed, []);
  second.panel.events.get('cancel')({ preventDefault() {} }); assert.deepEqual(closed, ['second']);
  removeFirst(); assert.equal(manager.size, 1); assert.equal(f.document.body.style.overflow, 'hidden');
  removeSecond(); assert.equal(manager.size, 0); assert.equal(f.background.inert, true); assert.equal(f.background.getAttribute('aria-hidden'), 'true'); assert.equal(f.document.body.style.overflow, 'auto');
});

test('real shared views link field errors, keep unknown resources unavailable and provide compact pagination', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../', import.meta.url).pathname, server: { middlewareMode: true, hmr: false }, appType: 'custom', esbuild: { jsx: 'automatic' } });
  try {
    const ui = await server.ssrLoadModule('/src/pages/admin/ui.jsx');
    const field = renderToStaticMarkup(React.createElement(ui.FormField, { label: '操作理由', htmlFor: 'reason', hint: '不会自动提交', error: '请填写理由', required: true }, React.createElement('textarea', { id: 'reason' })));
    assert.match(field, /for="reason"/); assert.match(field, /aria-describedby="reason-hint reason-error"/); assert.match(field, /aria-invalid="true"/); assert.match(field, /aria-required="true"/);
    const missing = renderToStaticMarkup(React.createElement(ui.ResourceState, { error: '服务不可用', hasData: false, empty: true, onRetry() {} }, '不得显示旧或默认数据'));
    assert.match(missing, /服务不可用/); assert.match(missing, /重新读取/); assert.doesNotMatch(missing, /不得显示|暂无记录/);
    const stale = renderToStaticMarkup(React.createElement(ui.ResourceState, { loading: true, hasData: true }, '旧结果'));
    assert.match(stale, /上次读取/); assert.match(stale, /aria-busy="true"/); assert.match(stale, /旧结果/);
    const pages = renderToStaticMarkup(React.createElement(ui.Pagination, { page: 50, totalPages: 100, total: 2000, onChange() {} }));
    assert.match(pages, /ac-pagination-compact/); assert.match(pages, /移动列表分页/); assert.match(pages, /50 \/ 100/);
    const tabs = renderToStaticMarkup(React.createElement(ui.Tabs, { id: 'module-tabs', value: 'a', onChange() {}, items: [{ value: 'a', label: '列表', panelId: 'panel-a' }, { value: 'b', label: '配置', panelId: 'panel-b' }] }));
    assert.match(tabs, /aria-controls="panel-a"/); assert.match(tabs, /tabindex="-1"/);
  } finally { await server.close(); }
});

test('danger confirmation, admin mobile visibility and feedback semantics stay explicit', () => {
  const ui = source('src/pages/admin/ui.jsx'), css = source('src/pages/admin/admin.css'), layout = source('src/pages/admin/layout.jsx'), toast = source('src/contexts/ToastContext.jsx');
  assert.match(ui, /initialFocus: state\?\.danger \? 'cancel'/); assert.match(ui, /data-dialog-cancel/);
  assert.doesNotMatch(ui, /window\.addEventListener\('keydown'/); assert.match(layout, /useDialogLifecycle\(sideOpen && narrow/);
  assert.match(layout, /aria-label="返回前台"/); assert.doesNotMatch(layout, /'生产环境'/);
  assert.match(css, /\.ac-pagination-desktop\s*\{\s*display: none/); assert.match(css, /\.ac-desktop-only/); assert.match(css, /\.ac-mobile-only/);
  assert.match(toast, /role=\{toast\.type === 'error' \? 'alert' : 'status'\}/); assert.match(toast, /aria-label="关闭操作反馈"/); assert.match(toast, /clearTimeout/); assert.match(toast, /\+\+nextId\.current/);
});
