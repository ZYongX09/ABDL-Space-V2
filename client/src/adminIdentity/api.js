import { assertSafeIdentityResponse } from './model.js';

function isObject(value) {
	return value && typeof value === 'object' && !Array.isArray(value);
}

function validDetail(data) {
	return isObject(data) && isObject(data.user) && isObject(data.methods) && isObject(data.methods.qq) && Array.isArray(data.audit);
}

function validUnbind(data) {
	return isObject(data) && data.qq_bound === false && ['number', 'string'].includes(typeof data.user_id) && typeof data.operation_id === 'string';
}

export function createAdminIdentityAPI({ base = '', fetcher = (...args) => fetch(...args), getToken = () => '', isCurrentSession = () => true } = {}) {
	async function request(path, method = 'GET', body, shape = 'object') {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), method === 'GET' ? 30000 : 90000);
		try {
			if (!isCurrentSession()) throw new Error('账户会话已切换，请重新打开用户详情');
			const headers = { Accept: 'application/json' };
			if (body !== undefined) headers['Content-Type'] = 'application/json';
			const token = getToken();
			if (token) headers.Authorization = `Bearer ${token}`;
			const response = await fetcher(`${base.replace(/\/$/, '')}/api/admin/identities${path}`, {
				method,
				headers,
				credentials: 'include',
				cache: 'no-store',
				redirect: 'error',
				referrerPolicy: 'no-referrer',
				signal: controller.signal,
				...(body !== undefined ? { body: JSON.stringify(body) } : {}),
			});
			let data;
			try { data = await response.json(); } catch { throw new Error('服务器响应无法解析，请重新读取身份状态；写入结果可能尚未确定'); }
			if (!isCurrentSession()) throw new Error('账户会话已切换，已忽略旧账户响应');
			assertSafeIdentityResponse(data);
			if (!response.ok) {
				const message = response.status === 401
					? '登录已过期，请重新登录；未确认解绑成功。'
					: response.status === 403
						? '当前账户无权管理该用户的第三方身份。'
						: response.status === 409
							? 'QQ 绑定状态已变化，请刷新详情后重新确认。'
							: (typeof data?.error === 'string' ? data.error : `请求失败（${response.status}）`);
				const error = new Error(message);
				error.status = response.status;
				error.code = typeof data?.code === 'string' ? data.code : '';
				error.definitive = response.status >= 400 && response.status < 500;
				throw error;
			}
			const valid = isObject(data)
				&& (shape !== 'detail' || validDetail(data))
				&& (shape !== 'unbind' || validUnbind(data));
			if (!valid) throw new Error('服务器响应与身份管理契约不一致，请刷新详情并联系维护者；未确认操作成功');
			return data;
		} catch (error) {
			if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('网络中断或超时。解绑可能已受理，请先刷新身份详情；相同表单重试将沿用操作标识。');
			throw error;
		} finally {
			clearTimeout(timer);
		}
	}
	const id = value => encodeURIComponent(String(value));
	return {
		detail: userId => request(`/users/${id(userId)}`, 'GET', undefined, 'detail'),
		unbindQQ: (userId, body) => request(`/users/${id(userId)}/qq/unbind`, 'POST', body, 'unbind'),
	};
}
