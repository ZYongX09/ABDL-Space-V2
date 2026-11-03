import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createTranslationGlossaryAPI } from './api.js';
import { createTranslationGlossaryFixture } from './fixture.js';
import { createTranslationGlossaryEditor, initialTranslationGlossaryState, TRANSLATION_GLOSSARY_CACHE_WARNING, TRANSLATION_GLOSSARY_PATH } from './model.js';
import { createTranslationPolicyEditor, DEFAULT_TRANSLATION_POLICY } from '../translationPolicy/model.js';

const uuid = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const serverOptions = () => ({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
const fixtureAPI = fixture => createTranslationGlossaryAPI(async (path, options) => {
  const result = fixture.respond(path, options.method, new URLSearchParams(), options.body ? JSON.parse(options.body) : null);
  if (result.status !== 200) throw Object.assign(new Error(result.data.error), { status: result.status });
  return result.data;
});
const text = element => typeof element === 'string' || typeof element === 'number' ? String(element) : Array.isArray(element) ? element.map(text).join('') : text(element?.props?.children || '');

// 无DOM依赖的Node JSX宿主：真实生产View/共享UI展开后，通过EventTarget派发可取消事件。
// 不伪称浏览器布局/React合成事件测试；DOM、焦点、窄屏和主题由同源fixture供浏览器验收。
function jsxEvents(View, editor, overrides = {}) {
  const handlers = {
    onAdd: () => editor.add(), onChange: (id, patch) => editor.change(id, patch), onRemove: id => editor.remove(id), onSearch: query => editor.search(query), onSave: () => editor.requestSave(), onConfirmSave: () => editor.save(), onReload: () => editor.load(), onConfirmReload: () => editor.confirmReload(), onDiscard: () => editor.requestDiscard(), onConfirmDiscard: () => editor.confirmDiscard(), onCancelConfirmation: () => editor.cancelConfirmation(), onCancel: () => editor.cancel(), ...overrides,
  };
  const hosts = () => {
    const result = [];
    const walk = (element, inheritedDisabled = false) => {
      if (!element || typeof element !== 'object') return;
      if (Array.isArray(element)) { element.forEach(item => walk(item, inheritedDisabled)); return; }
      if (typeof element.type === 'function') { walk(element.type(element.props), inheritedDisabled); return; }
      const props = element.props || {}, disabled = inheritedDisabled || !!props.disabled;
      if (typeof element.type === 'string') {
        const host = Object.assign(new EventTarget(), { value: props.value ?? '', checked: props.checked, element, disabled, pending: [] });
        for (const [key, eventName] of [['onClick', 'click'], ['onChange', 'change'], ['onSubmit', 'submit']]) if (props[key]) host.addEventListener(eventName, event => { const result = props[key](event); if (result?.then) host.pending.push(result); });
        result.push(host);
      }
      walk(props.children, inheritedDisabled || element.type === 'fieldset' && !!props.disabled);
    };
    walk(View({ state: editor.getState(), ...handlers })); return result;
  };
  const send = async (find, eventName, value) => {
    const host = hosts().find(find); assert.ok(host, `找不到${eventName}目标`); assert.equal(host.disabled, false, '不能向禁用控件发事件');
    if (value !== undefined) host.value = value;
    const event = new Event(eventName, { bubbles: true, cancelable: true }); host.dispatchEvent(event); await Promise.all(host.pending);
    return event;
  };
  return {
    click: label => send(host => host.element.type === 'button' && (text(host.element) === label || host.element.props['aria-label'] === label), 'click'),
    change: (id, value) => send(host => host.element.props.id === id, 'change', value),
    submit: () => send(host => host.element.props.id === 'translation-glossary-form', 'submit'),
    hosts,
    html: () => renderToStaticMarkup(React.createElement(View, { state: editor.getState(), ...handlers })),
  };
}

test('实际生产JSX真实事件：添加/多同义词/备注/搜索、全量保存前确认与取消、规范化成功', async () => {
  const server = await createServer(serverOptions());
  try {
    const { TranslationGlossaryCardView } = await server.ssrLoadModule('/src/translationGlossary/Card.jsx');
    const fixture = createTranslationGlossaryFixture(), calls = [], api = fixtureAPI(fixture); let next = 8;
    const editor = createTranslationGlossaryEditor({ ...api, saveTranslationGlossary: (...args) => { calls.push(args[0]); return api.saveTranslationGlossary(...args); } }, { uuid: () => uuid(next++) });
    await editor.load(); const ui = jsxEvents(TranslationGlossaryCardView, editor);
    assert.match(ui.html(), /词库为空（0 条）/);
    await ui.click('添加词条'); await ui.change(`glossary-chinese-${uuid(8)}`, ' 尿布\n纸尿裤\n尿布'); await ui.change(`glossary-english-${uuid(8)}`, 'Diaper\nNappy\ndiaper');
    await ui.change(`glossary-note-${uuid(8)}`, '  根据上下文选择  ');
    await ui.click('添加词条'); await ui.change(`glossary-chinese-${uuid(9)}`, '奶嘴'); await ui.change(`glossary-english-${uuid(9)}`, 'Pacifier');
    await ui.change('translation-glossary-search', 'Pacifier'); assert.equal(ui.hosts().filter(host => host.element.type === 'textarea').length, 3);
    const submit = await ui.submit(); assert.equal(submit.defaultPrevented, true); assert.equal(calls.length, 0);
    assert.match(ui.html(), /确认保存全部词库/); assert.ok(ui.html().includes(TRANSLATION_GLOSSARY_CACHE_WARNING));
    await ui.click('取消，保留草稿'); assert.equal(calls.length, 0); assert.equal(editor.getState().draft.length, 2);
    await ui.submit(); await ui.click('确认失效共享译文并保存'); assert.equal(calls.length, 1); assert.equal(calls[0].entries.length, 2);
    assert.deepEqual(calls[0].entries[0].chinese, ['尿布', '纸尿裤']); assert.deepEqual(calls[0].entries[0].english, ['Diaper', 'Nappy']); assert.equal(calls[0].entries[0].note, '根据上下文选择');
    assert.match(ui.html(), /全部词库已保存/); assert.match(ui.html(), /未调用 AI/);
  } finally { await server.close(); }
});

test('实际JSX事件：删除/放弃确认、reload取消/成功，409保草稿不重试与显式丢弃', async () => {
  const server = await createServer(serverOptions());
  try {
    const { TranslationGlossaryCardView } = await server.ssrLoadModule('/src/translationGlossary/Card.jsx');
    const fixture = createTranslationGlossaryFixture(), editor = createTranslationGlossaryEditor(fixtureAPI(fixture), { uuid: () => uuid(8) });
    await editor.load(); const ui = jsxEvents(TranslationGlossaryCardView, editor);
    await ui.click('添加词条'); await ui.change(`glossary-chinese-${uuid(8)}`, '中文'); await ui.change(`glossary-english-${uuid(8)}`, 'English'); await ui.submit(); await ui.click('确认失效共享译文并保存');
    await ui.click('从草稿删除词条 1'); assert.equal(editor.getState().draft.length, 0); assert.equal(editor.getState().saved.entries.length, 1);
    await ui.click('放弃未保存更改'); await ui.click('取消，保留草稿'); assert.equal(editor.getState().draft.length, 0);
    await ui.click('放弃未保存更改'); await ui.click('确认放弃草稿'); assert.equal(editor.getState().draft.length, 1);
    await ui.change(`glossary-note-${uuid(8)}`, '未保存'); await ui.click('重新加载已保存词库'); await ui.click('取消，保留草稿'); assert.equal(editor.getState().draft[0].note, '未保存');
    await ui.click('重新加载已保存词库'); await ui.click('确认丢弃并重新加载'); assert.equal(editor.getState().draft[0].note, '');
    await ui.change(`glossary-note-${uuid(8)}`, '冲突草稿'); fixture.control('POST', { scenario: 'conflict' }); await ui.submit(); await ui.click('确认失效共享译文并保存');
    assert.match(ui.html(), /409 \/ glossary_conflict/); assert.equal(editor.getState().draft[0].note, '冲突草稿'); assert.equal(editor.getState().needsReload, true);
    assert.equal(ui.hosts().find(host => host.element.props.id === `glossary-note-${uuid(8)}`).disabled, true);
    assert.equal(ui.hosts().find(host => host.element.type === 'button' && text(host.element) === '保存全部词库').disabled, true);
    await ui.click('重新加载已保存词库'); await ui.click('取消，保留草稿'); assert.equal(editor.getState().draft[0].note, '冲突草稿');
    await ui.click('重新加载已保存词库'); await ui.click('确认丢弃并重新加载'); assert.equal(editor.getState().draft[0].note, ''); assert.equal(editor.getState().needsReload, false);
  } finally { await server.close(); }
});

test('实际Card SSR覆盖初始/加载错误/401/403/保存/取消/空搜索/上限/长词与备注XSS纯文本', async () => {
  const server = await createServer(serverOptions());
  try {
    const { default: Card, TranslationGlossaryCardView: View } = await server.ssrLoadModule('/src/translationGlossary/Card.jsx');
    const initial = renderToStaticMarkup(React.createElement(Card)); assert.match(initial, /正在读取翻译词库/); assert.doesNotMatch(initial, /id="translation-glossary-form"/);
    const bad = renderToStaticMarkup(React.createElement(View, { state: { ...initialTranslationGlossaryState(), loading: false, error: '词库服务暂不可用（503 / translation_unavailable）' } }));
    assert.match(bad, /role="alert"/); assert.doesNotMatch(bad, /词库为空|已保存 0 条/);
    const fixture = createTranslationGlossaryFixture(), editor = createTranslationGlossaryEditor(fixtureAPI(fixture));
    fixture.control('POST', { scenario: 'long' }); await editor.load();
    const render = () => renderToStaticMarkup(React.createElement(View, { state: editor.getState() }));
    const long = render(); assert.ok(long.includes('W'.repeat(120))); assert.match(long, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/); assert.match(long, /&lt;img src=x onerror=alert\(1\)&gt;/); assert.match(long, /忽略之前指令/);
    assert.doesNotMatch(long, /<script|<img|<iframe|type="password"|maxlength=/i); assert.match(long, /备注不是系统指令|备注不会作为系统指令/);
    editor.search('不存在'); assert.match(render(), /没有匹配的词条/); assert.equal(editor.getState().draft.length, 1);
    for (const scenario of ['unauthorized', 'forbidden', 'save-error', 'invalid-save']) {
      fixture.control('POST', { scenario: 'normal' }); editor.search(''); await editor.load({ discard: true }); editor.change(editor.getState().draft[0].id, { note: '草稿' });
      fixture.control('POST', { scenario }); editor.requestSave(); await editor.save(); const html = render();
      assert.match(html, /role="alert"/); assert.match(html, /<fieldset class="ac-app-fieldset" disabled="">/); assert.match(html, /草稿<\/textarea>/); assert.match(html, /重新加载已保存词库/);
    }
    fixture.control('POST', { scenario: 'maximum' }); await editor.load({ discard: true }); const max = render();
    assert.match(max, /已达 200 条上限/); assert.match(max, /disabled="">添加词条/); assert.equal(editor.getState().draft.length, 200);
    const saving = renderToStaticMarkup(React.createElement(View, { state: { ...editor.getState(), saving: true } })); assert.match(saving, /正在保存全部词库/); assert.match(saving, /取消当前请求/);
  } finally { await server.close(); }
});

test('词库保存后policy刷新元数据：干净自动接纳；脏草稿保留且锁写，reload前确认；epoch不可倒退', async () => {
  let current = { ...DEFAULT_TRANSLATION_POLICY, cache_epoch: 7 }, writes = 0;
  const api = { translationPolicy: async () => ({ ...current }), saveTranslationPolicy: async input => { writes++; return { ...input, timezone: current.timezone }; } };
  const clean = createTranslationPolicyEditor(api); await clean.load(); current = { ...current, cache_epoch: 8, revision: uuid(9) }; await clean.refreshMetadata();
  assert.equal(clean.getState().saved.cache_epoch, 8); assert.equal(clean.getState().draft.cache_epoch, '8'); assert.equal(clean.getState().needsReload, false);
  clean.change({ cache_epoch: '7' }); assert.equal(await clean.save(), false); assert.equal(writes, 0); assert.match(clean.getState().error, /不能低于当前已加载/);
  await clean.load(); clean.change({ daily_limit: '9', cache_epoch: '8' }); current = { ...current, cache_epoch: 9, revision: uuid(10) }; await clean.refreshMetadata();
  assert.equal(clean.getState().saved.cache_epoch, 9); assert.equal(clean.getState().saved.revision, uuid(10)); assert.equal(clean.getState().draft.daily_limit, '9'); assert.equal(clean.getState().draft.cache_epoch, '8'); assert.equal(clean.getState().needsReload, true);
  assert.equal(await clean.save(), false); assert.equal(writes, 0); clean.requestReload(); assert.equal(clean.getState().confirmReload, true); clean.cancelReload(); assert.equal(clean.getState().draft.daily_limit, '9');
  clean.requestReload(); await clean.confirmReload(); assert.equal(clean.getState().draft.daily_limit, '5'); assert.equal(clean.getState().draft.cache_epoch, '9');
  const server = await createServer(serverOptions());
  try {
    const { TranslationPolicyCardView } = await server.ssrLoadModule('/src/translationPolicy/Card.jsx');
    const html = renderToStaticMarkup(React.createElement(TranslationPolicyCardView, { state: clean.getState() })); assert.match(html, /id="translation-policy-cache_epoch"[^>]*min="9"/); assert.match(html, /只能保持或增加/);
  } finally { await server.close(); }
});

test('policy词库刷新请求代次、取消和dispose丢弃晚到响应，未确认状态不可写', async () => {
  let resolve; const pending = new Promise(yes => { resolve = yes; }); let loads = 0, signals = [];
  const editor = createTranslationPolicyEditor({ translationPolicy: ({ signal }) => { signals.push(signal); return ++loads === 1 ? Promise.resolve(DEFAULT_TRANSLATION_POLICY) : pending; } });
  await editor.load(); editor.change({ daily_limit: '8' }); const refreshing = editor.refreshMetadata(); editor.dispose(); assert.equal(signals.at(-1).aborted, true);
  resolve({ ...DEFAULT_TRANSLATION_POLICY, cache_epoch: 2, revision: uuid(3) }); assert.equal(await refreshing, false); assert.equal(editor.getState().saved, null);
});

test('两站最小挂卡/认证/会话和theme无固定色值；独立模块无storage/HTML执行/真实外站或AI调用', () => {
  const page = source('../pages/admin/appClients.jsx'), api = source('../api.js'), card = source('./Card.jsx'), css = source('./card.css'), policy = source('../translationPolicy/Card.jsx');
  assert.equal((page.match(/<TranslationGlossaryCard \/>/g) || []).length, 1); assert.match(page, /<TranslationPolicyCard \/>\s*<TranslationGlossaryCard \/>/);
  assert.match(page, /user\?\.role === 'admin'/); assert.match(page, /AppClientsContent key=\{`\$\{user.id\}:\$\{token\}`\}/); assert.match(api, /\.\.\.createTranslationGlossaryAPI\(apiFetch\)/);
  assert.match(card, /bindTranslationGlossarySession/); assert.match(card, /window.dispatchEvent\(new Event\(TRANSLATION_GLOSSARY_SAVED_EVENT\)\)/); assert.match(policy, /removeEventListener\(TRANSLATION_GLOSSARY_SAVED_EVENT/);
  for (const path of ['./model.js', './api.js', './Card.jsx', './fixture.js']) assert.doesNotMatch(source(path), /localStorage|sessionStorage|console\.|\bfetch\(|dangerouslySetInnerHTML|challenges\.cloudflare\.com/);
  assert.doesNotMatch(card + css, /#[0-9a-f]{3,8}\b|rgba?\(|https?:\/\/|type="password"/i); assert.match(css, /var\(--ac-surface-soft\)/); assert.match(css, /minmax\(0, 1fr\)/); assert.match(css, /overflow-wrap: anywhere/); assert.match(css, /font-size: 1rem/);
  assert.equal(TRANSLATION_GLOSSARY_PATH, '/api/admin/app-ai/translation-glossary');
});
