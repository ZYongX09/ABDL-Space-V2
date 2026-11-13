import { parseAdminItem, parseConfig } from '../../src/babyVerification/model.js';
import { copy, createReceipts, fail, missing, nonempty, ok, paginate, routeSignature, rowsForScenario } from './core.js';

export function registerVerificationRoutes({ add }, state, { scenario, now, photoURL }) {
  const visible = rows => rowsForScenario(scenario(), rows);
  const receipts = createReceipts();
  const count = scenario() === 'longlists' ? 81 : 8;
  state.applications = Array.from({ length: count }, (_, index) => {
    const status = ['submitted', 'submitted', 'reviewing', 'approved', 'rejected', 'reviewing', 'approved', 'cancelled'][index % 8];
    const id = `application-${index + 1}`, user = state.users[2 + index % Math.min(4, state.users.length - 2)];
    return { id, user_id: user.id, username: user.username, display_name: user.display_name, status, submitted_at: now() - index * 3600, updated_at: now(), claimed_by: status === 'reviewing' ? (index % 8 === 5 ? 2 : 1) : null, claim_expires_at: status === 'reviewing' ? now() + 900 : null, decision_note: status === 'rejected' ? '合成资料需要补充' : '', profile: { 成年声明: '已确认（合成）', 声明版本: 'synthetic-1' }, photo_count: 2, evidence: [{ id: `evidence-${index + 1}-1`, kind: 'capture_photo', status: 'ready' }, { id: `evidence-${index + 1}-2`, kind: 'supporting_photo', status: index % 2 ? 'processing' : 'ready' }], certificate: status === 'approved' ? { id: `certificate-${index + 1}`, token: `synthetic-certificate-${index + 1}`, status: 'active', generation: 1, display_name: user.display_name, username: user.username, issued_at: now() - 3600 } : null };
  });
  state.verificationConfig = { enabled: true, declaration_version: 'synthetic-1', free_monthly_limit: 2, sponsor_monthly_limit: 5, capture_ttl_seconds: 900, upload_ttl_seconds: 300, max_evidence_size: 10485760, version: 1 };
  state.verificationAudit = [{ id: 'verification-audit-seed', action: 'submit', application_id: 'application-1', actor_id: 3, reason: '合成认证申请已提交', created_at: now() - 600 }];
  const audit = (ctx, action, id) => state.verificationAudit.unshift({ id: `verification-audit-${state.verificationAudit.length + 1}`, action, application_id: id, actor_id: ctx.actor.id, actor_username: ctx.actor.username, reason: ctx.body?.note || ctx.body?.reason || '', created_at: now() });
  const find = id => state.applications.find(row => row.id === id);
  add('baby-verifications', 'GET', '/api/admin/baby-verification/applications', ({ params }) => {
    const rows = visible(state.applications).filter(row => !params.get('status') || row.status === params.get('status'));
    return ok({ ...paginate(rows, params), pending: visible(state.applications).filter(row => row.status === 'submitted').length });
  });
  add('baby-verifications', 'GET', '/api/admin/baby-verification/applications/:id', ({ ids }) => find(ids.id) ? ok(find(ids.id)) : missing());
  for (const action of ['claim', 'release']) add('baby-verifications', 'POST', `/api/admin/baby-verification/applications/:id/${action}`, ctx => {
    const item = find(ctx.ids.id); if (!item) return missing();
    if (action === 'claim') {
      if (item.status !== 'submitted' || item.claimed_by) return fail(409, 'application_claimed_by_other');
      Object.assign(item, { status: 'reviewing', claimed_by: ctx.actor.id, claim_expires_at: now() + 900, updated_at: now() });
    } else {
      if (item.status !== 'reviewing' || item.claimed_by !== ctx.actor.id) return fail(403, 'application_claim_required');
      Object.assign(item, { status: 'submitted', claimed_by: null, claim_expires_at: null, updated_at: now() });
    }
    audit(ctx, action, item.id); return ok(item);
  });
  add('baby-verifications', 'POST', '/api/admin/baby-verification/applications/:id/decision', ctx => receipts(ctx.body?.operation_id, routeSignature(ctx), () => {
    const item = find(ctx.ids.id); if (!item) return missing();
    if (item.status !== 'reviewing' || item.claimed_by !== ctx.actor.id) return fail(409, 'application_claim_required');
    if (!['approve', 'reject'].includes(ctx.body?.decision) || !nonempty(ctx.body.note) || ctx.body.note.length > 500) return fail(422, 'invalid_decision');
    item.status = ctx.body.decision === 'approve' ? 'approved' : 'rejected'; item.decision_note = ctx.body.note; item.updated_at = now();
    if (item.status === 'approved') item.certificate = { id: `certificate-${item.id}`, token: `synthetic-${item.id}`, status: 'active', generation: 1, display_name: item.display_name, username: item.username, issued_at: now() };
    audit(ctx, ctx.body.decision, item.id); parseAdminItem(item); return ok(item);
  }));
  add('baby-verifications', 'POST', '/api/admin/baby-verification/applications/:id/evidence/:photoId/view-authorize', ctx => {
    const item = find(ctx.ids.id), photo = item?.evidence.find(row => row.id === ctx.ids.photoId);
    if (!photo) return fail(404, 'evidence_not_found');
    if (item.status !== 'reviewing' || item.claimed_by !== ctx.actor.id) return fail(403, 'application_claim_required');
    if (photo.status !== 'ready') return fail(409, 'evidence_not_ready');
    if (!photoURL()) return fail(503, 'synthetic_media_not_ready', '请从本地浏览器宿主入口初始化合成照片');
    audit(ctx, 'view_evidence', item.id); return ok({ url: photoURL(), expires_at: now() + 300 });
  });
  for (const action of ['revoke', 'reissue']) add('baby-verifications', 'POST', `/api/admin/baby-verification/certificates/:id/${action}`, ctx => receipts(ctx.body?.operation_id, routeSignature(ctx), () => {
    const item = state.applications.find(row => row.certificate?.id === ctx.ids.id); if (!item) return missing();
    if (!nonempty(ctx.body.reason) || item.certificate.status !== 'active') return fail(409, 'certificate_conflict');
    if (action === 'revoke') Object.assign(item.certificate, { status: 'revoked', revoked_at: now(), revoked_by: ctx.actor.id, revoked_by_username: ctx.actor.username, revoke_reason: ctx.body.reason });
    else Object.assign(item.certificate, { generation: item.certificate.generation + 1, token: `synthetic-${item.id}-g${item.certificate.generation + 1}`, issued_at: now() });
    audit(ctx, action, item.id); return ok({ certificate: item.certificate });
  }));
  add('baby-verifications', 'GET', '/api/admin/baby-verification/audit', ({ params }) => ok(paginate(visible(state.verificationAudit).filter(row => !params.get('application_id') || row.application_id === params.get('application_id')), params, 'items', 50)));
  add('baby-verifications', 'GET', '/api/admin/baby-verification/config', () => ok(state.verificationConfig));
  add('baby-verifications', 'PUT', '/api/admin/baby-verification/config', ctx => {
    if (ctx.body?.expected_version !== state.verificationConfig.version) return fail(409, 'config_version_conflict');
    if (!nonempty(ctx.body.reason)) return fail(422, 'reason_required');
    try { parseConfig(ctx.body.config); } catch { return fail(422, 'invalid_config'); }
    state.verificationConfig = { ...copy(ctx.body.config), version: state.verificationConfig.version + 1 };
    audit(ctx, 'config_update', null); return ok(state.verificationConfig);
  });
}
