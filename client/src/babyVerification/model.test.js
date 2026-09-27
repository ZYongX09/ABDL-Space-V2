import test from 'node:test';
import assert from 'node:assert/strict';
import { adminActionAvailability, canViewPhoto, classifyVerificationOrigin, configRequest, createDecisionOperationStore, parseCertificate, parseList, parseMe, parsePhotoAccess, parsePublicVerification, validateReason } from './model.js';
import { createBabyVerificationAPI, messageFor } from './api.js';

test('错误码优先映射照片访问提示，未知 404 保留通用文案', () => {
	assert.equal(messageFor({ status: 409 }, { code: 'application_claim_required' }), '请先认领审核后再查看照片');
	assert.equal(messageFor({ status: 409 }, { code: 'application_claimed_by_other' }), '该申请已由其他管理员认领');
	assert.equal(messageFor({ status: 409 }, { code: 'evidence_not_ready' }), '照片仍在校验');
	assert.equal(messageFor({ status: 404 }, { code: 'evidence_not_found' }), '照片不存在或已被移除');
	assert.equal(messageFor({ status: 404 }, { error: '其它错误' }), '记录不存在或已被移除');
});

test('只有当前管理员认领且照片 ready 时允许查看', () => {
	const application = { status: 'reviewing', claimedBy: 42 };
	assert.equal(canViewPhoto(application, { status: 'ready' }, 42), true);
	assert.equal(canViewPhoto({ ...application, claimedBy: 7 }, { status: 'ready' }, 42), false);
	assert.equal(canViewPhoto({ ...application, status: 'submitted' }, { status: 'ready' }, 42), false);
	assert.equal(canViewPhoto(application, { status: 'processing' }, 42), false);
});

test('证书模型严格解析 active/revoked 和管理字段', () => {
	const active = parseCertificate({ id: 'C1', status: 'active', generation: 2, verification_token: 'TOKEN' });
	assert.equal(active.status, 'active');
	assert.equal(active.generation, 2);
	assert.equal(active.token, 'TOKEN');
	const revoked = parseCertificate({ id: 'C1', status: 'revoked', generation: 2, revoked_at: 10, revoke_reason: '资料失效', revoked_by: 42, revoked_by_username: 'admin' });
	assert.equal(revoked.revokedAt, 10);
	assert.equal(revoked.revokeReason, '资料失效');
	assert.equal(revoked.revokedBy, '42');
	assert.equal(revoked.revokedByName, 'admin');
	assert.throws(() => parseCertificate({ id: 'C1', status: 'superseded' }), /证书状态/);
});

test('公开验真严格区分 active/superseded/revoked/unknown 且不解析替代 token', () => {
	assert.equal(parsePublicVerification({ valid: true, status: 'active', username: 'baby', issued_at: 1, generation: 3 }).status, 'active');
	const revoked = parsePublicVerification({ valid: false, status: 'revoked', revoked_at: 2, revoke_reason: '已撤销' });
	assert.equal(revoked.certificate.revokedAt, 2);
	assert.equal(revoked.certificate.revokeReason, '已撤销');
	const superseded = parsePublicVerification({ valid: false, status: 'superseded', superseded_at: 3, replacement_token: 'SECRET' });
	assert.equal(superseded.certificate.supersededAt, 3);
	assert.equal('replacementToken' in superseded.certificate, false);
	assert.deepEqual(parsePublicVerification({ valid: false, status: 'unknown' }), { status: 'unknown', certificate: null });
});

test('解析 me 的 application、月额度和独立证书', () => {
	const me = parseMe({ application: { id: 'R1', status: 'submitted', decision_note: '' }, quota: { limit: 3, used: 1, remaining: 2 }, certificate: { id: 'C1', status: 'active', generation: 1, verification_token: 'TOKEN' } });
	assert.equal(me.status, 'submitted');
	assert.equal(me.quota.remaining, 2);
	assert.equal(me.certificates[0].token, 'TOKEN');
});

test('解析审核 evidence、嵌套 user、证书和数字管理员', () => {
	const item = parseList({ items: [{ id: 'R1', user_id: 7, status: 'submitted', claimed_by: 9, user: { username: 'baby' }, evidence: [{ id: 'E1', kind: 'capture_photo', status: 'ready' }], certificate: { id: 'C1', status: 'revoked', generation: 2, revoked_at: 5, revoke_reason: '原因', revoked_by: 9 } }], total: 1 }).items[0];
	assert.equal(item.status, 'submitted');
	assert.equal(item.username, 'baby');
	assert.equal(item.photos[0].label, '认证拍摄照片');
	assert.equal(item.certificate.status, 'revoked');
	assert.equal(item.certificate.generation, 2);
	assert.equal(item.certificate.revokedBy, '9');
});

test('管理操作矩阵结合申请、证书状态、认领人和当前管理员', () => {
	assert.deepEqual(adminActionAvailability({ status: 'submitted', claimedBy: '' }, 42), {
		claim: true, release: false, approve: false, reject: false, revoke: false, reissue: false,
		claimedByCurrentAdmin: false, claimedByOtherAdmin: false, readOnly: false,
	});
	const owned = adminActionAvailability({ status: 'reviewing', claimedBy: 42 }, 42);
	assert.equal(owned.release, true); assert.equal(owned.approve, true); assert.equal(owned.reject, true); assert.equal(owned.claim, false);
	const other = adminActionAvailability({ status: 'reviewing', claimedBy: 7 }, 42);
	assert.equal(other.readOnly, true); assert.equal(other.claimedByOtherAdmin, true);
	const active = adminActionAvailability({ status: 'approved', certificate: { status: 'active' } }, 42);
	assert.equal(active.revoke, true); assert.equal(active.reissue, true);
	const revoked = adminActionAvailability({ status: 'approved', certificate: { status: 'revoked' } }, 42);
	assert.equal(revoked.readOnly, true); assert.equal(revoked.revoke, false); assert.equal(revoked.reissue, false);
});

test('拒绝无效照片协议、空理由，并为缺失到期时间设置五分钟兜底', () => {
	assert.throws(() => parsePhotoAccess({ download_url: 'http://example.com/a.jpg' }), /协议/);
	assert.throws(() => validateReason('  '), /不能为空/);
	const access = parsePhotoAccess({ download_url: 'https://example.com/a.jpg' }, 1_000);
	assert.equal(new Date(access.expiresAt).getTime(), 301_000);
});

test('严格识别主站规范地址和移动官方入口', () => {
	assert.equal(classifyVerificationOrigin('https://abdl-space.top/c/TOKEN_1', 'TOKEN_1'), 'canonical');
	assert.equal(classifyVerificationOrigin('https://m.abdl-space.top/c/TOKEN_1', 'TOKEN_1'), 'mobile');
	for (const url of ['http://abdl-space.top/c/TOKEN_1', 'https://www.abdl-space.top/c/TOKEN_1', 'https://abdl-space.top:444/c/TOKEN_1', 'https://abdl-space.top/c/OTHER', 'https://abdl-space.top/c/TOKEN_1?leak=1']) {
		assert.equal(classifyVerificationOrigin(url, 'TOKEN_1'), 'unofficial');
	}
});

test('operation ID 在结果未知时按同参数复用，参数变化或业务拒绝才更换', () => {
	let sequence = 0;
	const store = createDecisionOperationStore(() => `operation-${++sequence}`);
	assert.equal(store.acquire('R1', 'reissue', '补发二维码'), 'operation-1');
	assert.equal(store.acquire('R1', 'reissue', '补发二维码'), 'operation-1');
	store.reject('R1', 'reissue', '补发二维码', new Error('网络结果未知'));
	assert.equal(store.acquire('R1', 'reissue', '补发二维码'), 'operation-1');
	assert.equal(store.acquire('R1', 'reissue', '理由变化'), 'operation-2');
	assert.equal(store.acquire('R1', 'reissue', '补发二维码'), 'operation-3');
	const rejected = new Error('服务器拒绝'); rejected.status = 409;
	store.reject('R1', 'reissue', '补发二维码', rejected);
	assert.equal(store.acquire('R1', 'reissue', '补发二维码'), 'operation-4');
	assert.equal(store.acquire('R1', 'revoke', '补发二维码'), 'operation-5');
});

test('verify 使用实际路径、no-store、no-referrer 且不附带认证', async () => {
	let call;
	const api = createBabyVerificationAPI({ base: 'https://api.example', getToken: () => 'secret', fetcher: async (url, options) => { call = { url, options }; return Response.json({ valid: true, status: 'active', username: 'baby', issued_at: 1 }); } });
	const result = await api.verify('TOKEN_1');
	assert.equal(result.status, 'active');
	assert.match(call.url, /\/api\/v1\/baby-verification\/verify\/TOKEN_1$/);
	assert.equal(call.options.cache, 'no-store');
	assert.equal(call.options.referrerPolicy, 'no-referrer');
	assert.equal(call.options.credentials, 'omit');
	assert.equal(call.options.headers.Authorization, undefined);
});

test('管理 API 适配 applications 路径、状态和 decision 请求', async () => {
	const calls = [];
	const current = { id: 'R1', user_id: 7, status: 'reviewing', certificate: null };
	const api = createBabyVerificationAPI({ operationId: () => '00000000-0000-4000-8000-000000000000', getToken: () => 'current-token', fetcher: async (url, options) => {
		calls.push({ url, options });
		if (url.includes('/decision')) return Response.json({ id: 'R1', status: 'approved', certificate_id: 'C1', certificate_status: 'active', verification_token: 'TOKEN' });
		return Response.json({ items: [], total: 0 });
	} });
	await api.admin.list({ status: 'submitted', page: 2, limit: 20 });
	await api.admin.claim('R1', '', current);
	await api.admin.approve('R1', '资料相符', current);
	assert.match(calls[0].url, /applications\?status=submitted&limit=20&offset=20$/);
	assert.equal(calls[0].options.headers.Authorization, 'Bearer current-token');
	assert.equal(calls[1].options.headers['Content-Type'], 'application/json');
	assert.deepEqual(JSON.parse(calls[1].options.body), {});
	assert.deepEqual(JSON.parse(calls[2].options.body), { decision: 'approve', note: '资料相符', operation_id: '00000000-0000-4000-8000-000000000000' });
});

test('revoke/reissue 使用调用方稳定 operation_id 并解析证书响应', async () => {
	const calls = [];
	const current = { id: 'R1', status: 'approved', certificate: { id: 'C1', status: 'active', generation: 1 } };
	const api = createBabyVerificationAPI({ fetcher: async (url, options) => {
		calls.push({ url, options });
		return Response.json(url.endsWith('/revoke') ? { id: 'C1', status: 'revoked', revoked_at: 8 } : { id: 'C1', status: 'active', generation: 2, verification_token: 'NEW' });
	} });
	const revoked = await api.admin.revoke('R1', '吊销原因', current, 'revoke-operation');
	const reissued = await api.admin.reissue('R1', '补发原因', current, 'reissue-operation');
	assert.equal(revoked.certificate.status, 'revoked');
	assert.equal(reissued.certificate.generation, 2);
	assert.deepEqual(JSON.parse(calls[0].options.body), { reason: '吊销原因', operation_id: 'revoke-operation' });
	assert.deepEqual(JSON.parse(calls[1].options.body), { reason: '补发原因', operation_id: 'reissue-operation' });
});

test('确定 HTTP 业务拒绝带 definitive 标记，网络错误不带', async () => {
	const rejectedAPI = createBabyVerificationAPI({ fetcher: async () => Response.json({ code: 'certificate_conflict' }, { status: 409 }) });
	await assert.rejects(() => rejectedAPI.admin.reissue('R1', '原因', { certificate: { id: 'C1' } }, 'op'), error => error.status === 409 && error.definitive === true);
	const networkAPI = createBabyVerificationAPI({ fetcher: async () => { throw new TypeError('connection reset'); } });
	await assert.rejects(() => networkAPI.admin.reissue('R1', '原因', { certificate: { id: 'C1' } }, 'op'), error => error.status === undefined && error.definitive !== true);
});

test('配置保存使用 expected_version、reason 和 config 包装', () => {
	const body = configRequest({ version: 2, enabled: true, declaration_version: '2026-09-13', free_monthly_limit: 2, sponsor_monthly_limit: 3, capture_ttl_seconds: 900, upload_ttl_seconds: 300, max_evidence_size: 10485760 }, '调整额度');
	assert.equal(body.expected_version, 2);
	assert.equal(body.config.free_monthly_limit, 2);
	assert.equal(body.reason, '调整额度');
});
