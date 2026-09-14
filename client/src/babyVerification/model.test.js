import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyVerificationOrigin, configRequest, createDecisionOperationStore, parseCertificate, parseList, parseMe, parsePhotoAccess, validateReason } from './model.js';
import { createBabyVerificationAPI } from './api.js';

test('解析后端 active、revoked、superseded 和 unknown 证书', () => {
	assert.equal(parseCertificate({ valid: true, status: 'active', username: 'baby', issued_at: 1 }).status, 'approved');
	assert.equal(parseCertificate({ valid: false, status: 'revoked' }).status, 'revoked');
	assert.equal(parseCertificate({ valid: false, status: 'superseded' }).status, 'superseded');
	assert.deepEqual(parseCertificate({ valid: false, status: 'unknown' }), { status: 'not_found', certificate: null });
});

test('解析 me 的 application、月额度和独立证书', () => {
	const me = parseMe({ application: { id: 'R1', status: 'submitted', decision_note: '' }, quota: { limit: 3, used: 1, remaining: 2 }, certificate: { id: 'C1', status: 'active', verification_token: 'TOKEN' } });
	assert.equal(me.status, 'pending');
	assert.equal(me.quota.remaining, 2);
	assert.equal(me.certificates[0].token, 'TOKEN');
});

test('解析审核 evidence、嵌套 user 和数字管理员', () => {
	const item = parseList({ items: [{ id: 'R1', user_id: 7, status: 'submitted', claimed_by: 9, user: { username: 'baby' }, evidence: [{ id: 'E1', kind: 'capture_photo', status: 'ready' }] }], total: 1 }).items[0];
	assert.equal(item.status, 'pending');
	assert.equal(item.username, 'baby');
	assert.equal(item.photos[0].label, '认证拍摄照片');
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

test('审核 operation ID 对相同申请、动作和理由复用，并在参数变化或确定拒绝后更换', () => {
	let sequence = 0;
	const store = createDecisionOperationStore(() => `operation-${++sequence}`);
	assert.equal(store.acquire('R1', 'approve', '资料相符'), 'operation-1');
	assert.equal(store.acquire('R1', 'approve', '资料相符'), 'operation-1');
	assert.equal(store.acquire('R1', 'approve', '理由变化'), 'operation-2');
	assert.equal(store.acquire('R1', 'reject', '资料相符'), 'operation-3');
	store.reject('R1', 'approve', '资料相符', new Error('网络未知'));
	assert.equal(store.acquire('R1', 'approve', '资料相符'), 'operation-1');
	const rejected = new Error('服务器拒绝'); rejected.status = 409;
	store.reject('R1', 'approve', '资料相符', rejected);
	assert.equal(store.acquire('R1', 'approve', '资料相符'), 'operation-4');
});

test('verify 使用实际路径、no-store、no-referrer 且不附带认证', async () => {
	let call;
	const api = createBabyVerificationAPI({ base: 'https://api.example', getToken: () => 'secret', fetcher: async (url, options) => { call = { url, options }; return Response.json({ valid: true, status: 'active', username: 'baby', issued_at: 1 }); } });
	await api.verify('TOKEN_1');
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
		if (url.includes('/decision')) return Response.json({ id: 'R1', status: 'approved', certificate_id: 'C1', verification_token: 'TOKEN' });
		return Response.json({ items: [], total: 0 });
	} });
	await api.admin.list({ status: 'pending', page: 2, limit: 20 });
	await api.admin.approve('R1', '资料相符', current);
	assert.match(calls[0].url, /applications\?status=submitted&limit=20&offset=20$/);
	assert.equal(calls[0].options.headers.Authorization, 'Bearer current-token');
	assert.deepEqual(JSON.parse(calls[1].options.body), { decision: 'approve', note: '资料相符', operation_id: '00000000-0000-4000-8000-000000000000' });
});

test('配置保存使用 expected_version、reason 和 config 包装', () => {
	const body = configRequest({ version: 2, enabled: true, declaration_version: '2026-09-13', free_monthly_limit: 2, sponsor_monthly_limit: 3, capture_ttl_seconds: 900, upload_ttl_seconds: 300, max_evidence_size: 10485760 }, '调整额度');
	assert.equal(body.expected_version, 2);
	assert.equal(body.config.free_monthly_limit, 2);
	assert.equal(body.reason, '调整额度');
});
