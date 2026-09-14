import { configRequest, parseAdminItem, parseAudit, parseCertificate, parseConfig, parseList, parseMe, parsePhotoAccess } from './model.js';

function activeToken() {
	try {
		const accounts = JSON.parse(localStorage.getItem('abdl_accounts') || '[]');
		const activeId = localStorage.getItem('abdl_active_account');
		return accounts.find(account => String(account.id) === String(activeId))?.token || localStorage.getItem('token') || '';
	} catch { return ''; }
}

async function decode(response) {
	if (response.status === 204) return {};
	try { return await response.json(); } catch { throw new Error('服务器响应无法解析'); }
}

function messageFor(response, data) {
	if (response.status === 401) return '登录已过期，请重新登录';
	if (response.status === 403) return '服务器拒绝访问，请确认管理员权限';
	if (response.status === 404) return '记录不存在或已被移除';
	if (response.status === 409) return '记录已被其他管理员更新，请刷新后重试';
	return typeof data?.error === 'string' ? data.error : `请求失败（${response.status}）`;
}

export function createBabyVerificationAPI({ base = '', fetcher = (...args) => fetch(...args), getToken = activeToken, operationId = () => crypto.randomUUID() } = {}) {
	const root = base.replace(/\/$/, '');
	async function request(path, { method = 'GET', body, auth = true, parser = value => value, signal } = {}) {
		const headers = { Accept: 'application/json' };
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		const token = auth ? getToken() : '';
		if (token) headers.Authorization = `Bearer ${token}`;
		let response;
		try {
			response = await fetcher(`${root}${path}`, {
				method, headers, credentials: auth ? 'include' : 'omit', cache: 'no-store', redirect: 'error',
				referrerPolicy: 'no-referrer', signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
			});
		} catch (error) {
			if (error?.name === 'AbortError') throw error;
			throw new Error('网络连接失败，请稍后重试', { cause: error });
		}
		const data = await decode(response);
		if (!response.ok) {
			const error = new Error(messageFor(response, data));
			error.status = response.status;
			throw error;
		}
		return parser(data);
	}
	const id = value => encodeURIComponent(value);
	const query = values => {
		const params = new URLSearchParams();
		Object.entries(values || {}).forEach(([key, value]) => { if (value !== '' && value != null) params.set(key, String(value)); });
		return params.size ? `?${params}` : '';
	};
	const merge = (current, patch) => parseAdminItem({
		id: current.id, user_id: current.userId ?? current.user_id, username: current.username, display_name: current.displayName ?? current.display_name,
		status: current.status, submitted_at: current.submittedAt ?? current.submitted_at, updated_at: current.updatedAt ?? current.updated_at,
		claimed_by: current.claimedBy ?? current.claimed_by ?? null, claim_expires_at: current.claimExpiresAt ?? current.claim_expires_at,
		decision_note: current.reason ?? current.decision_note, evidence: current.photos ?? current.evidence, profile: current.profile, certificate: current.certificate,
		...patch,
	});
	return {
		verify: (token, signal) => request(`/api/v1/baby-verification/verify/${id(token)}`, { auth: false, parser: parseCertificate, signal }),
		me: async signal => {
			const state = await request('/api/v1/baby-verification/me', { signal });
			const certificate = await request('/api/v1/baby-verification/certificates/me', { signal });
			return parseMe({ ...state, certificate: certificate.certificate });
		},
		admin: {
			list: params => {
				const status = params?.status === 'pending' ? 'submitted' : params?.status;
				const offset = Math.max(0, ((Number(params?.page) || 1) - 1) * (Number(params?.limit) || 20));
				return request(`/api/admin/baby-verification/applications${query({ status, limit: params?.limit, offset })}`, { parser: parseList });
			},
			detail: verificationId => request(`/api/admin/baby-verification/applications/${id(verificationId)}`, { parser: parseAdminItem }),
claim: async (verificationId, _reason, current) => merge(current, await request(`/api/admin/baby-verification/applications/${id(verificationId)}/claim`, { method: 'POST', body: {} })),
				release: async (verificationId, _reason, current) => merge(current, await request(`/api/admin/baby-verification/applications/${id(verificationId)}/release`, { method: 'POST', body: {} })),
				approve: async (verificationId, reason, current, stableOperationId) => merge(current, await request(`/api/admin/baby-verification/applications/${id(verificationId)}/decision`, { method: 'POST', body: { decision: 'approve', note: reason, operation_id: stableOperationId || operationId() } })),
				reject: async (verificationId, reason, current, stableOperationId) => merge(current, await request(`/api/admin/baby-verification/applications/${id(verificationId)}/decision`, { method: 'POST', body: { decision: 'reject', note: reason, operation_id: stableOperationId || operationId() } })),
			revoke: async (verificationId, reason, current) => {
				if (!current?.certificate?.id) throw new Error('当前申请没有可吊销证书');
				const certificate = parseCertificate(await request(`/api/admin/baby-verification/certificates/${id(current.certificate.id)}/revoke`, { method: 'POST', body: { reason, operation_id: operationId() } })).certificate;
				return { ...current, certificate };
			},
			reissue: async (verificationId, reason, current) => {
				if (!current?.certificate?.id) throw new Error('当前申请没有可补发证书');
				const certificate = parseCertificate(await request(`/api/admin/baby-verification/certificates/${id(current.certificate.id)}/reissue`, { method: 'POST', body: { reason, operation_id: operationId() } })).certificate;
				return { ...current, certificate };
			},
			photo: (verificationId, photoId, signal) => request(`/api/admin/baby-verification/applications/${id(verificationId)}/evidence/${id(photoId)}/view-authorize`, { method: 'POST', body: {}, parser: parsePhotoAccess, signal }),
			audit: params => {
				const offset = Math.max(0, ((Number(params?.page) || 1) - 1) * (Number(params?.limit) || 20));
				return request(`/api/admin/baby-verification/audit${query({ application_id: params?.applicationId, limit: params?.limit, offset })}`, { parser: parseAudit });
			},
			config: () => request('/api/admin/baby-verification/config', { parser: parseConfig }),
			saveConfig: (config, reason) => request('/api/admin/baby-verification/config', { method: 'PUT', body: configRequest(config, reason), parser: parseConfig }),
		},
	};
}

const ENV_BASE = import.meta.env?.VITE_API_BASE ?? '';
export const babyVerificationAPI = createBabyVerificationAPI({ base: ENV_BASE });
