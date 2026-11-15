import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createBabyVerificationPolicyAPI } from './api.js';
import { BABY_VERIFICATION_POLICY_PATH, PROVINCES, createPolicyEditor, initialPolicyState, isPolicyDirty, policyPayload, readPolicyResponse } from './model.js';
const response = (patch = {}) => ({ policy: { enabled: false, province_codes: [], revision: '0', ...patch }, provinces: PROVINCES });
const pending = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };

test('31 个固定省级代码，初始无已保存快照、默认关闭且北京不预选', () => {
  assert.equal(PROVINCES.length, 31); assert.equal(new Set(PROVINCES.map(item => item.code)).size, 31);
  assert.deepEqual(PROVINCES.map(item => item.code), 'BJ TJ HE SX NM LN JL HL SH JS ZJ AH FJ JX SD HA HB HN GD GX HI CQ SC GZ YN XZ SN GS QH NX XJ'.split(' ').map(code => `CN-${code}`));
  assert.deepEqual(initialPolicyState().draft, { enabled: false, province_codes: [] }); assert.equal(initialPolicyState().saved, null);
  assert.equal(initialPolicyState().needsReload, true);
});
test('严格 GET 包装、catalog 与 flat PUT，拒绝未知/重复省份及开启空范围', () => {
  assert.deepEqual(readPolicyResponse(response()).policy, response().policy);
  assert.deepEqual(policyPayload({ enabled: true, province_codes: ['CN-SH', 'CN-BJ'], revision: 'opaque-v2' }), { enabled: true, province_codes: ['CN-BJ', 'CN-SH'], revision: 'opaque-v2' });
  for (const patch of [{ enabled: 'false' }, { province_codes: ['BJ'] }, { province_codes: ['CN-HK'] }, { province_codes: ['CN-BJ', 'CN-BJ'] }, { enabled: true }, { revision: '' }, { revision: 0 }, { extra: 'secret' }]) assert.throws(() => readPolicyResponse(response(patch)), { code: 'INVALID_RESPONSE' });
  for (const value of [{ ...response(), secret: 'unsafe' }, { ...response(), provinces: PROVINCES.slice(1) }, { ...response(), provinces: [...PROVINCES.slice(1), PROVINCES[1]] }, { ...response(), provinces: PROVINCES.map(item => ({ ...item, name: null })) }]) assert.throws(() => readPolicyResponse(value));
  assert.throws(() => policyPayload(response())); assert.throws(() => policyPayload({ enabled: true, province_codes: [], revision: '0' }));
});
test('固定端点 GET/PUT no-store 与 signal，PUT 仅三个字段，无自动重试', async () => {
  const calls = [], signal = new AbortController().signal;
  const api = createBabyVerificationPolicyAPI(async (path, options) => { calls.push({ path, options }); return response(); });
  await api.babyVerificationPolicy({ signal, method: 'DELETE', cache: 'force-cache' }); await api.saveBabyVerificationPolicy(response().policy, { signal });
  assert.equal(calls.length, 2);
  for (const call of calls) { assert.equal(call.path, BABY_VERIFICATION_POLICY_PATH); assert.equal(call.options.cache, 'no-store'); assert.strictEqual(call.options.signal, signal); }
  assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.body, undefined); assert.equal(calls[1].options.method, 'PUT'); assert.deepEqual(JSON.parse(calls[1].options.body), response().policy);
});
test('保存成功只接受真实服务器快照；开启必须至少一个，关闭保留选择', async () => {
  let writes = 0;
  const api = { babyVerificationPolicy: async () => response(), saveBabyVerificationPolicy: async value => { writes++; return response({ ...value, revision: 'next' }); } };
  const editor = createPolicyEditor(api); await editor.load(); editor.change({ enabled: true }); assert.equal(await editor.save(), false); assert.equal(writes, 0);
  editor.change({ province_codes: ['CN-SH'] }); assert.equal(isPolicyDirty(editor.getState().saved, editor.getState().draft), true); assert.equal(await editor.save(), true);
  assert.equal(editor.getState().saved.revision, 'next'); editor.change({ enabled: false }); await editor.save(); assert.deepEqual(editor.getState().saved.province_codes, ['CN-SH']);
});
test('409/失败/未知保存均保留草稿、锁定至显式 reload，无错误正文回显', async () => {
  for (const status of [401, 403, 409, 422, 503, 500, undefined]) {
    let writes = 0;
    const editor = createPolicyEditor({ babyVerificationPolicy: async () => response(), saveBabyVerificationPolicy: async () => { writes++; throw Object.assign(new Error('PRIVATE_BODY_NEVER_ECHO'), { status }); } });
    await editor.load(); editor.change({ enabled: true, province_codes: ['CN-BJ'] }); assert.equal(await editor.save(), false);
    assert.deepEqual(editor.getState().draft, { enabled: true, province_codes: ['CN-BJ'] }); assert.equal(editor.getState().saved.revision, '0'); assert.equal(editor.getState().needsReload, true);
    assert.equal(editor.getState().error.includes('PRIVATE_BODY'), false); assert.equal(await editor.save(), false); assert.equal(writes, 1);
    await editor.load(); assert.deepEqual(editor.getState().draft.province_codes, []);
  }
});
test('加载失败不能伪造默认关闭，损坏保存响应也不确认成功', async () => {
  const editor = createPolicyEditor({ babyVerificationPolicy: async () => { throw new Error('PRIVATE'); } }); await editor.load(); assert.equal(editor.getState().saved, null); assert.equal(await editor.save(), false);
  const invalid = createPolicyEditor({ babyVerificationPolicy: async () => response(), saveBabyVerificationPolicy: async () => ({}) }); await invalid.load(); invalid.change({ province_codes: ['CN-SH'] }); assert.equal(await invalid.save(), false); assert.deepEqual(invalid.getState().draft.province_codes, ['CN-SH']); assert.equal(invalid.getState().needsReload, true);
});
test('取消/换账号会中止信号并废弃晚到保存；StrictMode 代次独立', async () => {
  for (const action of ['cancel', 'dispose']) {
    const held = pending(), states = []; let signal;
    const editor = createPolicyEditor({ babyVerificationPolicy: async () => response(), saveBabyVerificationPolicy: async (value, options) => { signal = options.signal; return held.promise; } }, { onChange: state => states.push(state) });
    await editor.load(); editor.change({ enabled: true, province_codes: ['CN-SH'] }); const save = editor.save(); editor[action](); assert.equal(signal.aborted, true); const before = states.length;
    held.resolve(response({ enabled: true, province_codes: ['CN-SH'], revision: 'late' })); assert.equal(await save, false); assert.equal(states.length, before); assert.notEqual(editor.getState().saved?.revision, 'late');
  }
});
test('真实管理视图显示 31 多选、无默认选中；错误与冲突草稿可见，按现有模块挂载', async () => {
  const server = await createServer({ configFile: false, envFile: false, root: new URL('../../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
  try {
    const { AppBabyVerificationPolicyView } = await server.ssrLoadModule('/src/pages/admin/AppBabyVerificationPolicyCard.jsx');
    const editor = createPolicyEditor({ babyVerificationPolicy: async () => response() }); await editor.load();
    const html = renderToStaticMarkup(React.createElement(AppBabyVerificationPolicyView, { state: editor.getState() }));
    assert.equal((html.match(/type="checkbox"/g) || []).length, 32); assert.doesNotMatch(html, /checked=""/); assert.match(html, /默认关闭/); assert.match(html, /北京市/);
    editor.change({ enabled: true, province_codes: ['CN-SH'] }); const draftHTML = renderToStaticMarkup(React.createElement(AppBabyVerificationPolicyView, { state: { ...editor.getState(), needsReload: true, error: '策略冲突，草稿保留' } }));
    assert.match(draftHTML, /策略冲突，草稿保留/); assert.match(draftHTML, /checked=""[^>]*value="CN-SH"|value="CN-SH"[^>]*checked=""/); assert.match(draftHTML, /disabled=""/);
    const source = readFileSync(new URL('../pages/admin/appClients.jsx', import.meta.url), 'utf8'); assert.match(source, /<AppHumanCheckPolicyCard \/>\s*<AppBabyVerificationPolicyCard \/>/); assert.doesNotMatch(readFileSync(new URL('./model.js', import.meta.url), 'utf8'), /localStorage/);
  } finally { await server.close(); }
});
