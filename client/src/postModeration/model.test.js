import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHIVE_LABELS,
  DELETE_LABELS,
  caseId,
  legalNotice,
  readCase,
  readCaseEnvelope,
  readSnapshot,
  readTarget,
  validateReason,
} from './model.js';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CASE_ID = '33333333-3333-4333-8333-333333333333';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_REVISION = 'a'.repeat(64);
const REASON = '发布违规内容';
const NOTICE = `根据互联网用户公众账号信息服务管理规定，此内容由于 ${REASON} 已被屏蔽`;

const asset = (patch = {}) => ({ id: ASSET_ID, position: 0, archive_state: 'pending', delete_state: 'pending', thumbnail_available: true, error_code: null, ...patch });
const moderation = (patch = {}) => ({ id: CASE_ID, post_id: 42, author_id: 7, actor_id: 1, reason: REASON, notice: NOTICE, created_at: 1700000000, assets: [asset()], ...patch });
const target = (patch = {}) => ({ schema_version: 1, post_id: 42, source_revision: SOURCE_REVISION, moderation: null, ...patch });
const invalidResponse = error => error?.code === 'INVALID_RESPONSE';

test('法律通知文案精确匹配合同，理由先去除首尾空白', () => {
  assert.equal(NOTICE, '根据互联网用户公众账号信息服务管理规定，此内容由于 发布违规内容 已被屏蔽');
  assert.equal(legalNotice(`  ${REASON}  `), NOTICE);
  assert.equal(readCase(moderation()).notice, NOTICE);
  assert.equal(readCase(moderation()).reason, REASON);
});

test('处理理由必须去除首尾空白后为 1–500 字，且拒绝 NUL 与非字符串', () => {
  assert.equal(validateReason('  发布违规内容  '), '发布违规内容');
  assert.equal(validateReason('a'.repeat(500)).length, 500);
  for (const value of ['', '   ', 'a'.repeat(501), `理由\0注入`, null, 42, undefined]) {
    assert.throws(() => validateReason(value));
  }
  assert.throws(() => validateReason(`理由\0注入`), /NUL/);
  assert.throws(() => validateReason('a'.repeat(501)), /1–500/);
});

test('目标响应只接受 schema_version=1、匹配帖子且带 source_revision 的结构', () => {
  const parsed = readTarget(target());
  assert.equal(parsed.moderation, null);
  assert.equal(parsed.source_revision, SOURCE_REVISION);
  assert.equal(readTarget(target({ moderation: moderation() })).moderation.id, CASE_ID);

  const missingModeration = target();
  delete missingModeration.moderation;
  for (const value of [
    { ...target(), schema_version: 2 },
    { ...target(), post_id: 43 },
    { ...target(), source_revision: 'has space' },
    { ...target(), moderation: moderation({ post_id: 43 }) },
    missingModeration,
  ]) {
    assert.throws(() => readTarget(value, 42), invalidResponse);
  }
});

test('案件响应拒绝未知归档 / 删除状态、无效位置与重复资产', () => {
  assert.equal(ARCHIVE_LABELS.pending, '归档待处理');
  assert.equal(DELETE_LABELS.deleted, '已确认删除');
  assert.equal(readCase(moderation()).assets.length, 1);

  for (const assets of [
    [asset({ archive_state: 'done' })],
    [asset({ delete_state: 'done' })],
    [asset({ position: -1 })],
    [asset({ position: 1.5 })],
    [asset({ thumbnail_available: 'yes' })],
    [asset({ error_code: undefined })],
    [asset(), asset()],
  ]) {
    assert.throws(() => readCase(moderation({ assets })), invalidResponse);
  }

  assert.throws(() => readCase(moderation({ notice: '其他通知文案' })), invalidResponse);
  assert.throws(() => readCase(moderation({ assets: null })), invalidResponse);
  assert.throws(() => caseId('not-a-uuid'), invalidResponse);
});

test('未知错误码被归一化为人工核查，已知安全错误码保留', () => {
  assert.equal(readCase(moderation({ assets: [asset({ error_code: 'shared_reference' })] })).assets[0].error_code, 'shared_reference');
  assert.equal(readCase(moderation({ assets: [asset({ error_code: 'internal_secret_key' })] })).assets[0].error_code, 'manual_review');
});

test('案件信封同时校验预期案件与帖子，不把其他案件当作成功', () => {
  const envelope = { schema_version: 1, moderation: moderation() };
  assert.equal(readCaseEnvelope(envelope, CASE_ID, 42).moderation.id, CASE_ID);
  assert.throws(() => readCaseEnvelope(envelope, OTHER_CASE_ID, 42), invalidResponse);
  assert.throws(() => readCaseEnvelope(envelope, CASE_ID, 43), invalidResponse);
  assert.throws(() => readCaseEnvelope({ ...envelope, schema_version: 2 }, CASE_ID, 42), invalidResponse);
});

test('原件快照信封只接受 object snapshot 且案件编号必须匹配', () => {
  const snapshot = { text: '永久原件', images: [] };
  assert.deepEqual(readSnapshot({ schema_version: 1, case_id: CASE_ID, snapshot }, CASE_ID).snapshot, snapshot);

  for (const value of [
    { schema_version: 2, case_id: CASE_ID, snapshot },
    { schema_version: 1, case_id: OTHER_CASE_ID, snapshot },
    { schema_version: 1, case_id: CASE_ID, snapshot: null },
    { schema_version: 1, case_id: CASE_ID, snapshot: [] },
    { schema_version: 1, case_id: CASE_ID, snapshot: 'text' },
    { schema_version: 1, case_id: CASE_ID },
  ]) {
    assert.throws(() => readSnapshot(value, CASE_ID), invalidResponse);
  }
});
