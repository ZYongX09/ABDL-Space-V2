const FORBIDDEN_RESPONSE_KEY_PARTS = [
	'openid',
	'unionid',
	'hmac',
	'access_token',
	'refresh_token',
	'authorization_code',
	'app_id',
];

export function assertSafeIdentityResponse(value) {
	const seen = new WeakSet();
	const visit = current => {
		if (!current || typeof current !== 'object') return;
		if (seen.has(current)) return;
		seen.add(current);
		if (Array.isArray(current)) {
			for (const item of current) visit(item);
			return;
		}
		for (const [key, item] of Object.entries(current)) {
			const normalizedKey = key.toLowerCase();
			if (FORBIDDEN_RESPONSE_KEY_PARTS.some(part => normalizedKey.includes(part))) throw new Error(`服务器响应包含禁止下发的敏感字段：${key}`);
			visit(item);
		}
	};
	visit(value);
	return value;
}

export function validateReason(value) {
	if (typeof value !== 'string' || !value.trim()) throw new Error('请填写解绑理由');
	if (value.length > 500) throw new Error('解绑理由最多 500 个字符');
	return value.trim();
}

export function validateUsername(value, expected) {
	if (typeof value !== 'string' || !value.trim()) throw new Error('请输入用户名以确认解绑');
	const username = value.trim();
	if (username.length > 64) throw new Error('用户名最多 64 个字符');
	if (typeof expected !== 'string' || username !== expected) throw new Error('确认用户名与当前用户不一致');
	return username;
}

export function validateBindingVersion(value) {
	if (!['number', 'string'].includes(typeof value) || !/^\d+$/.test(String(value))) throw new Error('QQ 绑定版本无效，请刷新详情后重试');
	const version = Number(value);
	if (!Number.isSafeInteger(version) || version < 1 || version > 2147483647) throw new Error('QQ 绑定版本无效，请刷新详情后重试');
	return version;
}

export function validateUnbindInput({ reason, confirmUsername, username, expectedBindingVersion }) {
	return {
		reason: validateReason(reason),
		confirm_username: validateUsername(confirmUsername, username),
		expected_binding_version: validateBindingVersion(expectedBindingVersion),
	};
}

export function operationKeeper(randomUUID = () => crypto.randomUUID()) {
	const pending = new Map();
	const canonical = value => Array.isArray(value)
		? value.map(canonical)
		: value && typeof value === 'object'
			? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
			: value;
	return {
		get(key, body) {
			const payload = JSON.stringify(canonical(body));
			const prior = pending.get(key);
			if (prior) {
				if (prior.payload !== payload) throw new Error('上次解绑结果尚未确认，请恢复原表单重试或刷新状态，不能修改理由后重复发送');
				return prior.id;
			}
			const id = randomUUID();
			pending.set(key, { id, payload });
			return id;
		},
		done(key) { pending.delete(key); },
	};
}
