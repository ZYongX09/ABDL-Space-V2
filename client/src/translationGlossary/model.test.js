import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranslationGlossaryAPI } from './api.js';
import { createTranslationGlossaryFixture, parseTranslationGlossaryFixtureJSON, TRANSLATION_GLOSSARY_FIXTURE_CONTROL_PATH } from './fixture.js';
import { bindTranslationGlossarySession, createTranslationGlossaryEditor, glossaryCodePoints, glossaryJSONBytes, initialTranslationGlossaryState, isTranslationGlossaryDirty, normalizeTranslationGlossaryEntries, readTranslationGlossary, sanitizeTranslationGlossaryError, searchTranslationGlossary, TRANSLATION_GLOSSARY_LIMITS, TRANSLATION_GLOSSARY_PATH, translationGlossaryDraft, translationGlossaryDraftPayload, translationGlossaryPayload } from './model.js';

const REVISION = '12345678-1234-4123-8123-123456789abc';
const PRIVATE = 'FIXTURE_ONLY_SECRET_DO_NOT_ECHO';
const id = (index = 1) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const entry = (index = 1, patch = {}) => ({ id: id(index), chinese: [`术语${index}`], english: [`Term ${index}`], note: '', ...patch });
const payload = (entries = [entry()], revision = REVISION) => ({ entries, revision });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { resolve, reject, promise }; };
const fixtureAPI = fixture => createTranslationGlossaryAPI(async (path, options) => {
  const result = fixture.respond(path, options.method, new URLSearchParams(), options.body ? JSON.parse(options.body) : null);
  if (result.status !== 200) throw Object.assign(new Error(result.data.error), { status: result.status, code: result.data.code });
  return result.data;
});
const addValid = editor => { assert.equal(editor.add(), true); const row = editor.getState().draft.at(-1); editor.change(row.id, { chineseText: '纸尿裤\n尿布', englishText: 'Diaper\nNappy', note: '' }); return row.id; };

test('初始加载不展示假空词库，只有成功GET才有稳定revision快照', async () => {
  const initial = initialTranslationGlossaryState();
  assert.equal(initial.saved, null); assert.deepEqual(initial.draft, []); assert.equal(initial.loading, true); assert.equal(initial.needsReload, true);
  const fixture = createTranslationGlossaryFixture(), editor = createTranslationGlossaryEditor(fixtureAPI(fixture));
  await editor.load(); const state = editor.getState();
  assert.deepEqual(state.saved.entries, []); assert.equal(state.saved.revision, id()); assert.equal(isTranslationGlossaryDirty(state.saved, state.draft), false);
  assert.deepEqual(await fixtureAPI(fixture).translationGlossary(), state.saved);
  for (const value of [state, state.saved, state.saved.entries, state.draft]) assert.ok(Object.isFrozen(value));
});

test('GET/PUT只允许精确两字段及词条必需三字段+可选note，拒额外字段、类型强转和原型字段', () => {
  const withoutNote = entry(); delete withoutNote.note;
  assert.equal(translationGlossaryPayload(payload([withoutNote])).entries[0].note, '');
  for (const value of [null, [], {}, Object.create(payload()), { entries: [], revision: REVISION, secret: PRIVATE }, { entries: [], revision: 'uuid' }, { entries: [], revision: ` ${REVISION}` }, { entries: [], revision: 1 }, { entries: null, revision: REVISION }, { entries: new Array(1), revision: REVISION }, { entries: [], revision: REVISION, [Symbol('extra')]: true }]) {
    assert.throws(() => translationGlossaryPayload(value)); assert.throws(() => readTranslationGlossary(value), { code: 'INVALID_RESPONSE' });
  }
  for (const row of [null, [], Object.create(entry()), entry(1, { extra: PRIVATE }), entry(1, { chinese: '中文' }), entry(1, { english: 1 }), entry(1, { note: null }), entry(1, { [Symbol('extra')]: true })]) assert.throws(() => translationGlossaryPayload(payload([row])));
  for (const key of ['id', 'chinese', 'english']) { const row = entry(); delete row[key]; assert.throws(() => translationGlossaryPayload(payload([row]))); }
  for (const key of ['entries', 'revision']) { const body = payload(); delete body[key]; assert.throws(() => translationGlossaryPayload(body)); }
});

test('UUID版本1..8/variant89ab，id与revision小写规范化，重复ID含大小写拒绝', () => {
  for (let version = 1; version <= 8; version++) for (const variant of ['8', '9', 'a', 'b']) {
    const uuid = `ABCDEFAB-1234-${version}123-${variant}123-123456789ABC`;
    const saved = translationGlossaryPayload(payload([entry(1, { id: uuid })], uuid));
    assert.equal(saved.entries[0].id, uuid.toLowerCase()); assert.equal(saved.revision, uuid.toLowerCase());
  }
  for (const uuid of ['abcdefab-1234-0123-8123-123456789abc', 'abcdefab-1234-9123-8123-123456789abc', 'abcdefab-1234-4123-7123-123456789abc', 'abcdefab-1234-4123-c123-123456789abc', 'not-a-uuid']) assert.throws(() => translationGlossaryPayload(payload([entry(1, { id: uuid })])));
  assert.throws(() => translationGlossaryPayload(payload([entry(1, { id: REVISION }), entry(2, { id: REVISION.toUpperCase() })])), { code: 'DUPLICATE_ID' });
});

test('trim/NFC规范变体与note，同条中按NFC/英lower去重，保留首个候选原拼写与顺序', () => {
  const input = payload([entry(1, { chinese: ['  尿布 ', '尿布', 'e\u0301', 'é'], english: [' Diaper ', 'diaper', 'NAPPY'], note: ' e\u0301\n备注  ' })]);
  const result = translationGlossaryPayload(input);
  assert.deepEqual(result.entries[0], { id: id(), chinese: ['尿布', 'é'], english: ['Diaper', 'NAPPY'], note: 'é\n备注' });
  assert.deepEqual(Object.keys(result.entries[0]), ['id', 'chinese', 'english', 'note']);
  input.entries[0].chinese.push('新词'); input.entries[0].note = 'changed';
  assert.equal(result.entries[0].note, 'é\n备注'); assert.equal(result.entries[0].chinese.length, 2);
  for (const value of [result.entries[0], result.entries[0].chinese, result.entries[0].english]) assert.ok(Object.isFrozen(value));
});

test('跨词条同语言规范变体拒绝；跨语言不误拒，中文保留大小写敏感', () => {
  for (const rows of [[entry(), entry(2, { chinese: [' 术语1 '] })], [entry(1, { chinese: ['é'] }), entry(2, { chinese: ['e\u0301'] })], [entry(), entry(2, { english: ['TERM 1'] })]]) assert.throws(() => normalizeTranslationGlossaryEntries(rows), { code: 'AMBIGUOUS' });
  assert.equal(normalizeTranslationGlossaryEntries([entry(1, { chinese: ['A'], english: ['中文'] }), entry(2, { chinese: ['a'], english: ['A'] })]).length, 2);
});

test('原始每语言数组严格1..10再去重；空值/非字符串/无效Unicode拒绝', () => {
  for (const language of ['chinese', 'english']) {
    const ten = Array.from({ length: 10 }, (_, i) => `${language}${i}`);
    assert.equal(translationGlossaryPayload(payload([entry(1, { [language]: ten })])).entries[0][language].length, 10);
    assert.equal(translationGlossaryPayload(payload([entry(1, { [language]: Array(10).fill('同义词') })])).entries[0][language].length, 1);
    for (const values of [[], Array(11).fill('重复'), [''], ['  '], [null], [3], [true], ['ok', '\ud800'], ['\udc00'], new Array(1)]) assert.throws(() => translationGlossaryPayload(payload([entry(1, { [language]: values })])), { code: 'VARIANT_LIMIT' });
  }
  for (const note of [null, 5, '\ud800', '\udc00']) assert.throws(() => translationGlossaryPayload(payload([entry(1, { note })])), { code: 'NOTE_LIMIT' });
  const control = 'a\u0000b\u0080'; assert.equal(translationGlossaryPayload(payload([entry(1, { chinese: [control], note: control })])).entries[0].note, control);
});

test('Unicode码点边界120/500含emoji及NFC，非UTF16截断，无额外maxLength误伤', () => {
  assert.equal(glossaryCodePoints('😀'.repeat(120)), 120); assert.equal('😀'.repeat(120).length, 240);
  for (const language of ['chinese', 'english']) {
    for (const text of ['😀'.repeat(120), 'e\u0301'.repeat(120), '中'.repeat(120)]) assert.equal(glossaryCodePoints(translationGlossaryPayload(payload([entry(1, { [language]: [text] })])).entries[0][language][0]), 120);
    assert.throws(() => translationGlossaryPayload(payload([entry(1, { [language]: ['😀'.repeat(121)] })])), { code: 'TERM_LIMIT' });
  }
  assert.equal(glossaryCodePoints(translationGlossaryPayload(payload([entry(1, { note: '😀'.repeat(500) })])).entries[0].note), 500);
  assert.throws(() => translationGlossaryPayload(payload([entry(1, { note: '😀'.repeat(501) })])), { code: 'NOTE_LIMIT' });
});

test('条数0..200，规范化entries JSON UTF8精确65536边界而非字符计数，请求限98304', () => {
  assert.equal(translationGlossaryPayload(payload([])).entries.length, 0);
  assert.equal(translationGlossaryPayload(payload(Array.from({ length: 200 }, (_, i) => entry(i + 1)))).entries.length, 200);
  assert.throws(() => translationGlossaryPayload(payload(Array.from({ length: 201 }, (_, i) => entry(i + 1)))), { code: 'ENTRY_LIMIT' });
  // 90条基础大小不足64KiB；用UTF8三字节中文和ASCII补齐到精确边界。
  const rows = Array.from({ length: 90 }, (_, i) => entry(i + 1));
  let remaining = 65536 - glossaryJSONBytes(rows);
  for (const row of rows) { const bytes = Math.min(remaining, 1500), count = Math.floor(bytes / 3); row.note = '备'.repeat(count) + 'a'.repeat(bytes % 3); remaining -= bytes; }
  assert.equal(remaining, 0); assert.equal(glossaryJSONBytes(rows), 65536);
  assert.equal(glossaryJSONBytes(translationGlossaryPayload(payload(rows)).entries), 65536);
  rows.at(-1).note += 'a'; assert.throws(() => translationGlossaryPayload(payload(rows)), { code: 'BYTE_LIMIT' });
  assert.equal(TRANSLATION_GLOSSARY_LIMITS.requestBytes, 98304);
  assert.equal(glossaryJSONBytes({ chinese: '中' }), new TextEncoder().encode(JSON.stringify({ chinese: '中' })).length);
});

test('草稿每行多同义词CRLF/空白行，先保留原文，显式保存才规范化；搜索含备注不更改全量', () => {
  const saved = readTranslationGlossary(payload()), draft = translationGlossaryDraft(saved);
  const changed = [{ ...draft[0], chineseText: '  尿布 \r\n\r\n纸尿裤\n尿布\n', englishText: 'Diaper\rNAPPY\n diaper ', note: '  备注  ' }];
  const result = translationGlossaryDraftPayload(saved, changed);
  assert.deepEqual(result.entries[0].chinese, ['尿布', '纸尿裤']); assert.deepEqual(result.entries[0].english, ['Diaper', 'NAPPY']); assert.equal(result.entries[0].note, '备注');
  assert.equal(changed[0].note, '  备注  '); assert.equal(searchTranslationGlossary(changed, 'Nappy').length, 1); assert.equal(searchTranslationGlossary(changed, '备注').length, 1); assert.equal(searchTranslationGlossary(changed, '无匹配').length, 0);
  assert.equal(isTranslationGlossaryDirty(saved, changed), true); assert.equal(isTranslationGlossaryDirty(saved, draft), false);
});

test('已保存合法C0换行术语不因仅改备注而隐式分拆，语言字段主动修改才按行解析', () => {
  const saved = readTranslationGlossary(payload([entry(1, { chinese: ['中\n文'], english: ['Line\r\nterm', 'Alias'] })]));
  const draft = translationGlossaryDraft(saved), changed = [{ ...draft[0], note: '只改备注' }];
  assert.deepEqual(translationGlossaryDraftPayload(saved, changed).entries[0].chinese, ['中\n文']);
  assert.deepEqual(translationGlossaryDraftPayload(saved, changed).entries[0].english, ['Line\r\nterm', 'Alias']);
  assert.deepEqual(translationGlossaryDraftPayload(saved, [{ ...changed[0], chineseText: '中\n文\n新词' }]).entries[0].chinese, ['中', '文', '新词']);
});

test('API固定GET/PUT路径、no-store、signal和精确body，额外options无效，无重试或AI入口', async () => {
  const calls = [], signal = new AbortController().signal;
  const api = createTranslationGlossaryAPI(async (path, options) => { calls.push({ path, options }); return payload(); });
  await api.translationGlossary({ signal, method: 'POST', body: PRIVATE, headers: { Authorization: PRIVATE }, cache: 'force-cache' });
  await api.saveTranslationGlossary(payload(), { signal, method: 'DELETE', body: PRIVATE, cache: 'force-cache' });
  assert.equal(calls.length, 2);
  for (const call of calls) { assert.equal(call.path, TRANSLATION_GLOSSARY_PATH); assert.equal(call.options.signal, signal); assert.equal(call.options.cache, 'no-store'); assert.equal(call.options.headers, undefined); }
  assert.deepEqual(Object.keys(api), ['translationGlossary', 'saveTranslationGlossary']); assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.body, undefined);
  assert.equal(calls[1].options.method, 'PUT'); assert.deepEqual(JSON.parse(calls[1].options.body), payload());
  await assert.rejects(api.saveTranslationGlossary({ ...payload(), secret: PRIVATE })); assert.equal(calls.length, 2);
});

test('401/403/409/422/413/415/503和网络错误白名单脱敏，不回显body/message/cause', async () => {
  for (const [status, code] of [[400, 'INVALID_BODY'], [401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [409, 'CONFLICT'], [413, 'BYTE_LIMIT'], [415, 'INVALID_BODY'], [422, 'INVALID_BODY'], [503, 'UNAVAILABLE'], [500, 'REQUEST_FAILED'], [undefined, 'REQUEST_FAILED']]) {
    let calls = 0;
    const api = createTranslationGlossaryAPI(async () => { calls++; throw Object.assign(new Error(PRIVATE), { status, code: PRIVATE, body: PRIVATE, cause: PRIVATE }); });
    await assert.rejects(api.translationGlossary(), error => error.code === code && !String(error).includes(PRIVATE) && !JSON.stringify(error).includes(PRIVATE) && !error.cause);
    assert.equal(calls, 1);
  }
  assert.equal(sanitizeTranslationGlossaryError(new Error(PRIVATE)).code, 'REQUEST_FAILED');
});

test('编辑器添加编辑删除只改内存，安全UUID，存取快照不可变且未确认保存不写入', async () => {
  let writes = 0;
  const fixture = createTranslationGlossaryFixture(), api = fixtureAPI(fixture);
  const editor = createTranslationGlossaryEditor({ ...api, saveTranslationGlossary: (...args) => { writes++; return api.saveTranslationGlossary(...args); } }, { uuid: () => id(8) });
  await editor.load(); assert.equal(await editor.save(), false); const rowId = addValid(editor), before = editor.getState();
  assert.equal(writes, 0); assert.equal(before.saved.entries.length, 0); assert.equal(before.draft[0].id, id(8));
  const patch = { note: '备注', id: PRIVATE, revision: PRIVATE }; editor.change(rowId, patch); patch.note = '外部修改';
  assert.equal(editor.getState().draft[0].note, '备注'); assert.ok(!JSON.stringify(editor.getState()).includes(PRIVATE)); assert.ok(Object.isFrozen(editor.getState().draft[0]));
  assert.throws(() => { editor.getState().draft[0].note = 'changed'; }, TypeError);
  editor.remove(rowId); assert.equal(editor.getState().draft.length, 0); assert.equal(writes, 0);
  const unsafe = createTranslationGlossaryEditor(api, { uuid: () => 'unsafe-random' }); await unsafe.load(); assert.equal(unsafe.add(), false); assert.equal(unsafe.getState().errorCode, 'UUID_UNAVAILABLE');
});

test('全量显式确认保存包括隐藏搜索结果；成功接受新revision和规范词条，不调用AI', async () => {
  const fixture = createTranslationGlossaryFixture(), api = fixtureAPI(fixture), calls = []; let next = 8;
  const editor = createTranslationGlossaryEditor({ ...api, saveTranslationGlossary: (...args) => { calls.push(args[0]); return api.saveTranslationGlossary(...args); } }, { uuid: () => id(next++) });
  await editor.load(); const revision = editor.getState().saved.revision; addValid(editor);
  editor.add(); editor.change(id(9), { chineseText: '奶嘴', englishText: 'Pacifier' }); editor.search('奶嘴');
  assert.equal(editor.requestSave(), true); assert.equal(editor.getState().confirm, 'save'); assert.equal(calls.length, 0);
  editor.cancelConfirmation(); assert.equal(await editor.save(), false); assert.equal(editor.getState().draft.length, 2);
  editor.requestSave(); assert.equal(await editor.save(), true); assert.equal(calls.length, 1); assert.equal(calls[0].entries.length, 2); assert.equal(calls[0].revision, revision);
  assert.notEqual(editor.getState().saved.revision, revision); assert.equal(isTranslationGlossaryDirty(editor.getState().saved, editor.getState().draft), false); assert.match(editor.getState().notice, /未调用 AI/);
});

test('无效草稿保原文可修正，非法请求不PUT；200条达上限仍可编辑或删除', async () => {
  const fixture = createTranslationGlossaryFixture(), editor = createTranslationGlossaryEditor(fixtureAPI(fixture), { uuid: () => id(800) });
  await editor.load(); editor.add(); assert.equal(editor.requestSave(), false); assert.equal(editor.getState().errorCode, 'VARIANT_LIMIT');
  editor.change(id(800), { chineseText: '中'.repeat(121), englishText: 'English' }); assert.equal(editor.requestSave(), false); assert.equal(editor.getState().draft[0].chineseText.length, 121);
  fixture.control('POST', { scenario: 'maximum' }); await editor.load({ discard: true }); assert.equal(editor.add(), false); assert.equal(editor.getState().errorCode, 'ENTRY_LIMIT');
  editor.change(id(1), { note: '可编辑' }); assert.equal(editor.getState().draft[0].note, '可编辑'); editor.remove(id(1)); assert.equal(editor.add(), true);
});

test('放弃和reload需要显式确认；取消/加载失败保留草稿，成功reload才替换', async () => {
  const fixture = createTranslationGlossaryFixture(), editor = createTranslationGlossaryEditor(fixtureAPI(fixture), { uuid: () => id(8) });
  await editor.load(); addValid(editor); const draft = editor.getState().draft;
  assert.equal(await editor.load(), false); assert.equal(editor.getState().confirm, 'reload'); assert.equal(editor.getState().draft, draft);
  editor.cancelConfirmation(); assert.equal(editor.getState().draft, draft);
  editor.requestDiscard(); editor.cancelConfirmation(); assert.equal(editor.getState().draft, draft);
  editor.requestDiscard(); editor.confirmDiscard(); assert.equal(editor.getState().draft.length, 0); assert.equal(editor.getState().needsReload, false);
  addValid(editor); await editor.load(); fixture.control('POST', { scenario: 'unavailable' }); assert.equal(await editor.confirmReload(), false); assert.equal(editor.getState().draft.length, 1); assert.equal(editor.getState().needsReload, true);
  fixture.control('POST', { scenario: 'normal' }); assert.equal(await editor.load(), false); assert.equal(await editor.confirmReload(), true); assert.equal(editor.getState().draft.length, 0);
});

test('409保留旧快照和草稿，明确锁写不自动重放；确认reload后才能重新手动编辑保存', async () => {
  const fixture = createTranslationGlossaryFixture(), editor = createTranslationGlossaryEditor(fixtureAPI(fixture), { uuid: () => id(8) });
  await editor.load(); addValid(editor); const saved = editor.getState().saved, draft = editor.getState().draft;
  fixture.control('POST', { scenario: 'conflict' }); editor.requestSave(); assert.equal(await editor.save(), false);
  assert.equal(editor.getState().saved, saved); assert.equal(editor.getState().draft, draft); assert.equal(editor.getState().errorCode, 'CONFLICT'); assert.equal(editor.getState().needsReload, true);
  assert.equal(editor.requestSave(), false); assert.equal(await editor.save(), false); editor.change(id(8), { note: 'no' }); assert.equal(editor.getState().draft, draft);
  assert.equal(await editor.load(), false); assert.equal(editor.getState().confirm, 'reload'); editor.cancelConfirmation(); assert.equal(editor.getState().draft, draft);
  await editor.load(); assert.equal(await editor.confirmReload(), true); assert.equal(editor.getState().draft.length, 0); assert.notEqual(editor.getState().saved.revision, saved.revision);
  addValid(editor); editor.requestSave(); assert.equal(await editor.save(), true);
});

test('保存权限/503/损坏响应保草稿需reload；初次GET失败不伪造空词库', async () => {
  for (const scenario of ['save-error', 'invalid-save', 'unauthorized', 'forbidden']) {
    const fixture = createTranslationGlossaryFixture(), editor = createTranslationGlossaryEditor(fixtureAPI(fixture), { uuid: () => id(8) });
    await editor.load(); addValid(editor); fixture.control('POST', { scenario }); editor.requestSave(); assert.equal(await editor.save(), false);
    assert.equal(editor.getState().draft.length, 1); assert.equal(editor.getState().saved.entries.length, 0); assert.equal(editor.getState().needsReload, true); assert.equal(await editor.save(), false);
  }
  for (const scenario of ['invalid', 'unavailable', 'unauthorized', 'forbidden']) {
    const fixture = createTranslationGlossaryFixture(); fixture.control('POST', { scenario }); const editor = createTranslationGlossaryEditor(fixtureAPI(fixture));
    assert.equal(await editor.load(), false); assert.equal(editor.getState().saved, null); assert.equal(editor.add(), false);
  }
});

test('请求代次丢弃晚到GET和错误；取消初始GET不展示默认', async () => {
  const first = deferred(), second = deferred(); let index = 0; const signals = [];
  const editor = createTranslationGlossaryEditor({ translationGlossary: ({ signal }) => { signals.push(signal); return [first, second][index++].promise; } });
  const old = editor.load(), fresh = editor.load(); assert.equal(signals[0].aborted, true);
  second.resolve(payload()); assert.equal(await fresh, true); first.reject(new Error(PRIVATE)); assert.equal(await old, false); assert.equal(editor.getState().saved.revision, REVISION); assert.equal(editor.getState().error, '');
  const read = deferred(), initial = createTranslationGlossaryEditor({ translationGlossary: () => read.promise });
  const loading = initial.load(); initial.cancel(); read.resolve(payload()); assert.equal(await loading, false); assert.equal(initial.getState().saved, null); assert.equal(initial.getState().needsReload, true);
});

test('双击确认仅单PUT，保存中冻结编辑；取消不声称回滚，晚到成功不能回写或重试', async () => {
  const write = deferred(); let writes = 0, signal;
  const editor = createTranslationGlossaryEditor({ translationGlossary: async () => payload([]), saveTranslationGlossary: (_body, options) => { writes++; signal = options.signal; return write.promise; } }, { uuid: () => id(8) });
  await editor.load(); addValid(editor); editor.requestSave(); const saving = editor.save(); assert.equal(await editor.save(), false);
  editor.change(id(8), { note: 'no' }); assert.equal(editor.getState().draft[0].note, ''); editor.cancel(); assert.equal(signal.aborted, true);
  assert.match(editor.getState().error, /不代表服务器写入已撤回/); write.resolve(payload([entry(8)], id(9))); assert.equal(await saving, false);
  assert.equal(editor.getState().saved.entries.length, 0); assert.equal(editor.getState().draft.length, 1); assert.equal(editor.getState().needsReload, true); assert.equal(await editor.save(), false); assert.equal(writes, 1);
});

test('auth-session-changing真实事件立即清内存、取消PUT，卸载/StrictMode晚响应不可污染新编辑器', async () => {
  for (const failure of [false, true]) {
    const write = deferred(), changes = [], resets = []; let signal;
    const editor = createTranslationGlossaryEditor({ translationGlossary: async () => payload([]), saveTranslationGlossary: (_body, options) => { signal = options.signal; return write.promise; } }, { onChange: state => changes.push(state), uuid: () => id(8) });
    const target = new EventTarget(), cleanup = bindTranslationGlossarySession(editor, target, state => resets.push(state));
    await editor.load(); addValid(editor); editor.requestSave(); const saving = editor.save(), before = changes.length;
    target.dispatchEvent(new Event('auth-session-changing')); assert.equal(signal.aborted, true); assert.equal(editor.getState().saved, null); assert.deepEqual(editor.getState().draft, []); assert.equal(resets.length, 1);
    target.dispatchEvent(new Event('auth-session-changing')); assert.equal(resets.length, 1);
    if (failure) write.reject(new Error(PRIVATE)); else write.resolve(payload());
    assert.equal(await saving, false); assert.equal(changes.length, before); cleanup();
  }
  const fresh = createTranslationGlossaryEditor(fixtureAPI(createTranslationGlossaryFixture())); await fresh.load(); assert.equal(fresh.getState().draft.length, 0);
});

test('API检查请求前后Abort，取消原因和晚到响应均脱敏，无隐式重试', async () => {
  let calls = 0; const stopped = new AbortController(); stopped.abort(PRIVATE);
  const api = createTranslationGlossaryAPI(async () => { calls++; return payload(); });
  await assert.rejects(api.translationGlossary({ signal: stopped.signal }), error => error.name === 'AbortError' && !String(error).includes(PRIVATE)); assert.equal(calls, 0);
  const late = deferred(), controller = new AbortController(), slow = createTranslationGlossaryAPI(() => late.promise);
  const request = slow.translationGlossary({ signal: controller.signal }); controller.abort(PRIVATE); late.resolve(payload()); await assert.rejects(request, { name: 'AbortError' });
});

test('fixture独立控制/错误code/上限/纯文本/稳定默认，拒未知接口与query且不污染provider', async () => {
  const fixture = createTranslationGlossaryFixture(), api = fixtureAPI(fixture);
  const first = await api.translationGlossary(); assert.deepEqual(await api.translationGlossary(), first);
  const saved = await api.saveTranslationGlossary(payload([entry()], first.revision)); assert.notEqual(saved.revision, first.revision);
  await assert.rejects(api.saveTranslationGlossary(payload([], first.revision)), { code: 'CONFLICT' });
  assert.equal(fixture.respond(TRANSLATION_GLOSSARY_PATH, 'POST').status, 405); assert.equal(fixture.respond(TRANSLATION_GLOSSARY_PATH, 'GET', new URLSearchParams({ secret: PRIVATE })).status, 400);
  assert.equal(fixture.respond('/api/admin/app-ai/provider', 'PUT').status, 404); assert.equal(fixture.control('POST', { secret: PRIVATE }).status, 400);
  for (const scenario of ['maximum', 'long', 'empty']) { fixture.control('POST', { scenario }); assert.doesNotThrow(() => readTranslationGlossary(fixture.control('GET').data.metadata)); }
  fixture.control('POST', { scenario: 'slow' }); assert.equal(fixture.delay(TRANSLATION_GLOSSARY_PATH), 1500);
  fixture.control('POST', { reset: true }); assert.deepEqual(await api.translationGlossary(), first); assert.equal(TRANSLATION_GLOSSARY_FIXTURE_CONTROL_PATH, '/__fixture/translation-glossary');
});

test('fixture JSON拒所有嵌套decoded重复key、坏JSON与超96KiB，合法备注字符串不误判', () => {
  for (const text of ['{"entries":[],"entries":[],"revision":"x"}', '{"entries":[],"\\u0065ntries":[]}', '{"entries":[{"note":"1","\\u006eote":"2"}]}', '{"entries":[{"chinese":[{"x":1,"x":2}]}]}', '{']) assert.throws(() => parseTranslationGlossaryFixtureJSON(text), { status: 422 });
  const data = payload([entry(1, { note: '"note": "{[]}" <script> "note":' })]); assert.deepEqual(parseTranslationGlossaryFixtureJSON(JSON.stringify(data)), data);
  assert.throws(() => parseTranslationGlossaryFixtureJSON(' '.repeat(98305)), { status: 413 });
});
