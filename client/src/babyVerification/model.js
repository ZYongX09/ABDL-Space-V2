const STATUSES = new Set(['pending', 'reviewing', 'approved', 'rejected', 'revoked', 'superseded', 'not_found']);
const STATUS_ALIASES = {
	draft: 'pending', submitted: 'pending', cancelled: 'rejected', active: 'approved', unknown: 'not_found',
};

export function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function text(value, field, { required = false, max = 2000 } = {}) {
	if (value == null && !required) return '';
	if (typeof value !== 'string') throw new Error(`${field}格式无效`);
	const result = value.trim();
	if (required && !result) throw new Error(`${field}不能为空`);
	if (result.length > max) throw new Error(`${field}过长`);
	return result;
}

export function identifier(value, field = '标识') {
	const result = text(value, field, { required: true, max: 160 });
	if (!/^[A-Za-z0-9_-]+$/.test(result)) throw new Error(`${field}格式无效`);
	return result;
}

export function integer(value, field, min = 0, max = Number.MAX_SAFE_INTEGER) {
	const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
	if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${field}格式无效`);
	return number;
}

function optionalTime(value, field) {
	if (value == null || value === '') return null;
	if ((typeof value !== 'string' && typeof value !== 'number') || !Number.isFinite(new Date(typeof value === 'number' ? value * 1000 : value).getTime())) throw new Error(`${field}格式无效`);
	return value;
}

export function normalizeStatus(value) {
	const raw = text(value, '状态', { required: true, max: 32 }).toLowerCase();
	const status = STATUS_ALIASES[raw] || raw;
	if (!STATUSES.has(status)) throw new Error('状态格式无效');
	return status;
}

export function parseCertificate(payload) {
	if (!isRecord(payload)) throw new Error('证书响应格式无效');
	const source = isRecord(payload.certificate) ? payload.certificate : payload;
	const status = normalizeStatus(source.status || (source.valid === true ? 'active' : source.valid === false ? 'unknown' : 'unknown'));
	if (status === 'not_found') return { status, certificate: null };
	const certificate = {
		id: text(source.id ?? source.certificate_id ?? `credential-${source.generation ?? 1}`, '证书编号', { required: true, max: 160 }),
		token: text(source.token ?? source.certificate_token ?? source.verification_token, '证书令牌', { max: 512 }),
		status,
		displayName: text(source.display_name ?? source.displayName ?? source.subject_name, '展示名称', { max: 100 }),
		username: text(source.username, '用户名', { max: 100 }),
		issuedAt: optionalTime(source.issued_at ?? source.certificate_issued_at ?? source.issuedAt, '签发时间'),
		revokedAt: optionalTime(source.revoked_at ?? source.revokedAt, '吊销时间'),
		supersededAt: optionalTime(source.superseded_at ?? source.supersededAt, '补发时间'),
		reason: text(source.reason ?? source.status_reason ?? source.revoke_reason, '状态原因', { max: 500 }),
		replacementToken: text(source.replacement_token ?? source.replacementToken, '替代证书令牌', { max: 512 }),
		verificationUrl: text(source.verification_url ?? source.verificationUrl ?? source.verify_path, '验真链接', { max: 2048 }),
	};
	return { status, certificate };
}

export function parseMe(payload) {
	if (!isRecord(payload)) throw new Error('认证状态响应格式无效');
	const source = isRecord(payload.application) ? payload.application : isRecord(payload.verification) ? payload.verification : payload;
	const certificatePayload = payload.certificate ?? (Array.isArray(payload.certificates) ? payload.certificates[0] : null);
	const certificates = certificatePayload ? [parseCertificate(certificatePayload).certificate].filter(Boolean) : [];
	return {
		status: normalizeStatus(source.status || (certificates.length ? certificates[0].status : 'pending')),
		requestId: text(source.id ?? source.request_id, '申请编号', { max: 160 }),
		submittedAt: optionalTime(source.submitted_at, '提交时间'),
		updatedAt: optionalTime(source.updated_at, '更新时间'),
		reason: text(source.reason ?? source.review_reason ?? source.decision_note, '审核说明', { max: 1000 }),
		quota: parseQuota(payload.quota ?? source.quota ?? { limit: 0, used: 0, remaining: 0 }),
		config: isRecord(payload.config) ? parseConfig(payload.config) : null,
		certificates,
	};
}

export function parseQuota(value) {
	if (!isRecord(value)) throw new Error('额度响应格式无效');
	const limit = integer(value.limit ?? value.monthly_limit ?? 0, '额度上限');
	const used = integer(value.used ?? 0, '已用额度');
	const remaining = integer(value.remaining ?? Math.max(0, limit - used), '剩余额度');
	return { limit, used, remaining, sponsorActive: value.sponsor_active === true, resetAt: optionalTime(value.reset_at, '额度重置时间') };
}

export function parseList(payload) {
	if (!isRecord(payload)) throw new Error('审核列表响应格式无效');
	const items = payload.items ?? payload.applications ?? payload.verifications;
	if (!Array.isArray(items)) throw new Error('审核列表响应格式无效');
	const total = integer(payload.total ?? items.length, '记录总数');
	const pending = payload.pending ?? payload.pending_count ?? (items.filter(item => ['submitted', 'pending'].includes(item.status)).length);
	return { items: items.map(parseAdminItem), total, pending: integer(pending, '待审核数') };
}

export function parseAdminItem(value) {
	if (!isRecord(value)) throw new Error('审核记录格式无效');
	const user = isRecord(value.user) ? value.user : {};
	const evidence = Array.isArray(value.evidence) ? value.evidence : Array.isArray(value.photos) ? value.photos : [];
	const profile = isRecord(value.profile) ? value.profile : {
		...(value.qq ? { QQ: value.qq } : {}),
		...(value.adult_declaration != null ? { 成年声明: value.adult_declaration ? '已确认' : '未确认' } : {}),
		...(value.declaration_version ? { 声明版本: value.declaration_version } : {}),
	};
	const certificateSource = value.certificate || (value.certificate_id ? { id: value.certificate_id, status: value.status === 'approved' ? 'active' : value.status, verification_token: value.verification_token, verify_path: value.verify_path } : null);
	return {
		id: identifier(String(value.id ?? value.request_id), '申请编号'),
		status: normalizeStatus(value.status),
		userId: text(String(value.user_id ?? user.id ?? ''), '用户编号', { required: true, max: 160 }),
		username: text(value.username ?? user.username, '用户名', { max: 100 }),
		displayName: text(value.display_name ?? user.display_name, '展示名称', { max: 100 }),
		submittedAt: optionalTime(value.submitted_at, '提交时间'),
		updatedAt: optionalTime(value.updated_at, '更新时间'),
		claimedBy: value.claimed_by == null ? '' : text(String(value.claimed_by), '认领管理员', { max: 160 }),
		claimExpiresAt: optionalTime(value.claim_expires_at, '认领到期时间'),
		reason: text(value.reason ?? value.review_reason ?? value.decision_note, '审核说明', { max: 1000 }),
		photoCount: integer(value.photo_count ?? evidence.length, '照片数量', 0, 20),
		photos: evidence.map(parsePhoto),
		profile,
		certificate: certificateSource ? parseCertificate(certificateSource).certificate : null,
	};
}

export function parsePhoto(value) {
	if (!isRecord(value)) throw new Error('照片信息格式无效');
	const kind = value.kind === 'capture_photo' ? '认证拍摄照片' : value.kind === 'supporting_photo' ? '辅助照片' : value.label;
	return { id: identifier(String(value.id ?? value.photo_id ?? value.evidence_id), '照片编号'), label: text(kind, '照片标签', { max: 80 }), status: text(value.status, '照片状态', { max: 32 }) };
}

export function parsePhotoAccess(payload, now = Date.now()) {
	if (!isRecord(payload)) throw new Error('照片访问响应格式无效');
	const url = text(payload.url ?? payload.signed_url ?? payload.download_url, '照片地址', { required: true, max: 4096 });
	const parsed = new URL(url);
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'blob:') throw new Error('照片地址协议无效');
	const suppliedExpiry = optionalTime(payload.expires_at, '照片地址到期时间');
	const expiresAt = suppliedExpiry ?? new Date(now + 5 * 60 * 1000).toISOString();
	return { url, expiresAt };
}

export function parseAudit(payload) {
	if (!isRecord(payload) || !Array.isArray(payload.items ?? payload.audit)) throw new Error('审计响应格式无效');
	const items = payload.items ?? payload.audit;
	return { items, total: integer(payload.total ?? items.length, '审计记录总数') };
}

export function parseConfig(payload) {
	if (!isRecord(payload)) throw new Error('配置响应格式无效');
	return {
		enabled: payload.enabled === true,
		declarationVersion: text(payload.declaration_version ?? payload.declarationVersion ?? '', '声明版本', { required: true, max: 64 }),
		freeMonthlyLimit: integer(payload.free_monthly_limit ?? payload.freeMonthlyLimit ?? 0, '普通用户月额度', 0, 1000),
		sponsorMonthlyLimit: integer(payload.sponsor_monthly_limit ?? payload.sponsorMonthlyLimit ?? 0, '赞助用户月额度', 0, 1000),
		captureTtlSeconds: integer(payload.capture_ttl_seconds ?? payload.captureTtlSeconds ?? 900, '拍摄会话有效期', 60, 86400),
		uploadTtlSeconds: integer(payload.upload_ttl_seconds ?? payload.uploadTtlSeconds ?? 300, '上传授权有效期', 60, 86400),
		maxEvidenceSize: integer(payload.max_evidence_size ?? payload.maxEvidenceSize ?? 10485760, '照片大小上限', 1024, 52428800),
		version: integer(payload.version ?? 1, '配置版本', 1),
	};
}

export function configRequest(config, reason) {
	const checked = parseConfig(config);
	return {
		expected_version: checked.version,
		reason: validateReason(reason),
		config: {
			version: checked.version,
			enabled: checked.enabled,
			declaration_version: checked.declarationVersion,
			free_monthly_limit: checked.freeMonthlyLimit,
			sponsor_monthly_limit: checked.sponsorMonthlyLimit,
			capture_ttl_seconds: checked.captureTtlSeconds,
			upload_ttl_seconds: checked.uploadTtlSeconds,
			max_evidence_size: checked.maxEvidenceSize,
		},
	};
}

export function validateReason(value) {
	return text(value, '操作理由', { required: true, max: 500 });
}

export function classifyVerificationOrigin(value, token) {
	let url;
	try { url = value instanceof URL ? value : new URL(value); } catch { return 'unofficial'; }
	if (url.protocol !== 'https:' || url.port !== '' || url.pathname !== `/c/${encodeURIComponent(token)}` || url.search || url.hash) return 'unofficial';
	if (url.hostname === 'abdl-space.top') return 'canonical';
	if (url.hostname === 'm.abdl-space.top') return 'mobile';
	return 'unofficial';
}

export function createDecisionOperationStore(createId = () => crypto.randomUUID()) {
	const operations = new Map();
	const keyFor = (applicationId, action, reason) => JSON.stringify([String(applicationId), action, reason]);
	return {
		acquire(applicationId, action, reason) {
			const key = keyFor(applicationId, action, reason);
			if (!operations.has(key)) operations.set(key, createId());
			return operations.get(key);
		},
		settle(applicationId, action, reason) {
			operations.delete(keyFor(applicationId, action, reason));
		},
		reject(applicationId, action, reason, error) {
			if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) operations.delete(keyFor(applicationId, action, reason));
		},
	};
}

export function statusMeta(status) {
	return ({
		approved: { label: '有效', tone: 'green', icon: 'fa-circle-check' },
		revoked: { label: '已吊销', tone: 'red', icon: 'fa-ban' },
		superseded: { label: '已补发替代', tone: 'amber', icon: 'fa-arrows-rotate' },
		not_found: { label: '证书不存在', tone: 'slate', icon: 'fa-circle-question' },
		pending: { label: '待审核', tone: 'amber', icon: 'fa-clock' },
		reviewing: { label: '审核中', tone: 'blue', icon: 'fa-user-shield' },
		rejected: { label: '未通过', tone: 'red', icon: 'fa-circle-xmark' },
	})[status] || { label: '未知状态', tone: 'slate', icon: 'fa-circle-question' };
}
