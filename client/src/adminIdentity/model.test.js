import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdminIdentityAPI } from './api.js';
import { assertSafeIdentityResponse, operationKeeper, qqBindingPresentation, qqBindingState, validateBindingVersion, validateReason, validateUnbindInput, validateUsername } from './model.js';

const detail = () => ({
	user: { id: 42, username: 'tester' },
	methods: {
		password: true,
		verified_email: true,
		nbw: false,
		passkeys: { count: 1, last_used_at: 1 },
		qq: { bound: true, nickname: 'QQ 用户', avatar: 'https://example.test/avatar.png', created_at: 2, updated_at: 3, can_unbind: true, block_reason: null },
	},
	audit: [{ id: 'a', action: 'qq_unbind', actor: { id: 1, username: 'admin' }, reason: 'test', created_at: 4 }],
});

test('QQ 状态兼容明确的布尔和 0/1，缺失与未知不显示未绑定', () => {
	for (const value of [true, 1, '1', 'true']) {
		assert.equal(qqBindingState(value), 'bound');
		assert.deepEqual(qqBindingPresentation(value), { state: 'bound', label: '已绑定', tone: 'blue' });
	}
	for (const value of [false, 0, '0', 'false']) {
		assert.deepEqual(qqBindingPresentation(value), { state: 'unbound', label: '未绑定', tone: 'slate' });
	}
	for (const value of [undefined, null, '', 'unknown', 'null', 2, -1, [], {}, NaN]) {
		assert.deepEqual(qqBindingPresentation(value), { state: 'unknown', label: '状态未知', tone: 'amber' });
	}
});

test('身份详情缺失 QQ 状态保留为未知，非法结构仍拒绝且不推断头像昵称', async () => {
	for (const qq of [undefined, null, {}, { bound: null }, { nickname: '旧资料', avatar: 'https://example.test/qq.png' }]) {
		const payload = detail();
		payload.methods.qq = qq;
		const api = createAdminIdentityAPI({ fetcher: async () => Response.json(payload) });
		assert.equal(qqBindingState((await api.detail(42)).methods.qq?.bound), 'unknown');
	}
	for (const qq of [[], true, 'bound']) {
		const payload = detail();
		payload.methods.qq = qq;
		const api = createAdminIdentityAPI({ fetcher: async () => Response.json(payload) });
		await assert.rejects(api.detail(42), /契约不一致/);
	}
});

test('解绑表单严格校验理由、用户名和绑定版本', () => {
	assert.deepEqual(validateUnbindInput({ reason: ' 用户申请 ', confirmUsername: 'tester', username: 'tester', expectedBindingVersion: '3' }), {
		reason: '用户申请', confirm_username: 'tester', expected_binding_version: 3,
	});
	assert.throws(() => validateReason(' '), /理由/);
	assert.throws(() => validateReason('x'.repeat(501)), /500/);
	assert.throws(() => validateUsername('other', 'tester'), /不一致/);
	assert.throws(() => validateBindingVersion(0), /版本/);
	assert.throws(() => validateBindingVersion(-1), /版本/);
	assert.throws(() => validateBindingVersion('1e2'), /版本/);
});

test('响应在任意深度拒绝QQ敏感字段', () => {
	assert.equal(assertSafeIdentityResponse(detail()).user.id, 42);
	for (const key of ['openid', 'unionid', 'openid_hmac', 'unionid_hmac', 'hmac', 'access_token', 'refresh_token', 'authorization_code', 'app_id']) {
		assert.throws(() => assertSafeIdentityResponse({ user: {}, methods: { qq: { [key]: 'secret' } }, audit: [] }), /敏感字段/);
	}
	assert.throws(() => assertSafeIdentityResponse({ items: [{ nested: [{ Access_Token: 'secret' }] }] }), /敏感字段/);
});

test('operation keeper 对相同解绑参数复用ID并禁止改参重试', () => {
	let next = 0;
	const keeper = operationKeeper(() => `operation-${++next}`);
	const body = { reason: '用户申请', confirm_username: 'tester', expected_binding_version: 3 };
	const first = keeper.get('qq:42', body);
	assert.equal(keeper.get('qq:42', { expected_binding_version: 3, confirm_username: 'tester', reason: '用户申请' }), first);
	assert.throws(() => keeper.get('qq:42', { ...body, reason: '其他理由' }), /尚未确认/);
	keeper.done('qq:42');
	assert.notEqual(keeper.get('qq:42', body), first);
});

test('身份API携带token和cookie并禁用缓存与重定向，路径编码正确', async () => {
	const calls = [];
	const api = createAdminIdentityAPI({
		base: 'https://api.example.test/',
		getToken: () => 'admin-token',
		fetcher: async (url, options) => { calls.push({ url, options }); return Response.json(detail()); },
	});
	await api.detail('user/42');
	assert.equal(calls[0].url, 'https://api.example.test/api/admin/identities/users/user%2F42');
	assert.equal(calls[0].options.headers.Authorization, 'Bearer admin-token');
	assert.equal(calls[0].options.credentials, 'include');
	assert.equal(calls[0].options.cache, 'no-store');
	assert.equal(calls[0].options.redirect, 'error');
	assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
	assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('解绑API只发送批准契约参数且不自动重试', async () => {
	const calls = [];
	const api = createAdminIdentityAPI({ fetcher: async (url, options) => { calls.push({ url, options }); return Response.json({ operation_id: 'op-1', user_id: 42, username: 'tester', qq_bound: false, previous_binding_version: 3, auth_invalid_before: 4 }); } });
	const body = { operation_id: 'op-1', reason: '用户申请', confirm_username: 'tester', expected_binding_version: 3 };
	await api.unbindQQ(42, body);
	assert.equal(calls[0].url, '/api/admin/identities/users/42/qq/unbind');
	assert.equal(calls[0].options.method, 'POST');
	assert.deepEqual(JSON.parse(calls[0].options.body), body);
	const failed = createAdminIdentityAPI({ fetcher: async () => { throw new TypeError('network'); } });
	await assert.rejects(failed.unbindQQ(42, body), /可能已受理/);
});

test('会话切换阻止请求并忽略旧响应', async () => {
	let called = false;
	const stale = createAdminIdentityAPI({ isCurrentSession: () => false, fetcher: async () => { called = true; } });
	await assert.rejects(stale.detail(42), /会话已切换/);
	assert.equal(called, false);
	let current = true;
	const changed = createAdminIdentityAPI({ isCurrentSession: () => current, fetcher: async () => { current = false; return Response.json(detail()); } });
	await assert.rejects(changed.detail(42), /忽略旧账户响应/);
});

test('错误、无效响应及错误体敏感字段均不会被视为成功', async () => {
	for (const [status, expression] of [[401, /过期/], [403, /无权/], [409, /已变化/]]) {
		const api = createAdminIdentityAPI({ fetcher: async () => Response.json({ error: 'test' }, { status }) });
		await assert.rejects(api.detail(42), error => error.status === status && error.definitive && expression.test(error.message));
	}
	const invalid = createAdminIdentityAPI({ fetcher: async () => Response.json({ user: {}, methods: [], audit: [] }) });
	await assert.rejects(invalid.detail(42), /契约不一致/);
	const leaked = createAdminIdentityAPI({ fetcher: async () => Response.json({ error: 'denied', openid: 'secret' }, { status: 403 }) });
	await assert.rejects(leaked.detail(42), /敏感字段/);
});
