import { DEFAULT_POLICY, policyInput, targetInput, shanghaiDay, TIMEZONE } from './model.js';
import { ROOT } from './api.js';

// 合成 legacy 状态 JSON.stringify([tracking, ips]) 的预计算 SHA-256，保持同步 fixture。
const LEGACY_REVISIONS = Object.freeze({
  'true:1': '040d7dae279b28278ca86e7f9b0f8acf6fc40139682446898dc5bbfe6369c4db',
  'false:1': '5d81725e6d8dddd43b2674addbb3020b11333ba5efb3316b96651b2eb7298848',
  'false:0': 'fe4c07f571f9e0563a1d33188d74a78fb10605439069b39b9cd1b622cf6f39b7',
  'true:0': '1b711c794e69600117c71c8c8ec5589c7476f0646867c2fa0c9babc53b61aeed',
});
export const fixtureUser = id => ({ id, role: 'user', username: `fixture_user_${id}`, display_name: `本地测试用户 ${id}` });
export function fixtureTarget(id = 3, now = Date.now()) {
  return { user_id: id, observe_ip: true, observe_requests: false, expires_at: Math.floor(now / 1000) + 7 * 86400, reason: '本地验收既有配置（仅测试数据）', revision: '550e8400-e29b-41d4-a716-446655440000', updated_at: Math.floor(now / 1000), updated_by: 1 };
}
export function fixtureIP(index = 0, selectedDay = shanghaiDay()) {
  const start = Date.parse(`${selectedDay}T10:00:00+08:00`);
  return { day: selectedDay, ip: `2001:db8::${(index + 1).toString(16)}`, ip_source: index % 2 ? 'verified_proxy' : 'edge', first_seen_at: start, last_seen_at: start + index * 1000, count: index + 1 };
}
export function fixtureRequest(index = 0, id = 3, selectedDay = shanghaiDay()) {
  return { event_id: `fixture-event-${id}-${index}`, user_id: id, occurred_at: Date.parse(`${selectedDay}T10:00:00+08:00`) + index * 1000, method: index % 3 ? 'GET' : 'POST', endpoint_id: index % 3 ? 'community.timeline' : 'community.post.create', template: index % 3 ? '/api/posts' : '/api/posts/:id', business_note: index % 3 ? '请求社区时间线；不推断阅读行为' : '请求发布接口；不证明已提交或成功', metadata_version: '2026-11-12.1', status: index % 4 ? 200 : 403, duration_ms: 15 + index, ip: index % 2 ? null : fixtureIP(index, selectedDay).ip, ip_source: index % 2 ? 'unknown' : 'edge' };
}

/** 只在显式本地 fixture 服务 / 测试中使用；生产模块绝不 import 此文件。 */
export function createObservationFixture({ now = Date.now, scenario = 'normal' } = {}) {
  let mode = scenario, policy = { ...DEFAULT_POLICY }, targets = new Map([[3, fixtureTarget(3, now())]]), counter = 0, tracking = true;
  let bans = [{ ip: '192.0.2.17', reason: '旧来源封禁，需要人工复核共享风险', created_at: Math.floor(now() / 1000) - 3600, created_by: 1 }];
  const legacyRevision = () => LEGACY_REVISIONS[`${tracking}:${bans.length}`];
  const audit = [], calls = [], cache = new Map(), snapshots = new Map(), cleared = new Set();
  const ok = data => ({ status: 200, data });
  const fail = (status, code) => ({ status, data: { error: '本地验收预设错误（未访问生产服务）', code } });
  const auditId = () => `fixture-audit-${++counter}`;
  const status = target => !target ? 'not_configured' : !target.observe_ip && !target.observe_requests ? 'disabled' : target.expires_at <= now() / 1000 ? 'expired' : !policy.enabled ? 'policy_disabled' : 'active';
  const page = (rows, params, timezone = true) => {
    const limit = Math.max(1, Math.min(200, Number(params.get('limit')) || 50)), offset = Number(params.get('cursor') || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('invalid_cursor');
    return { items: rows.slice(offset, offset + limit), next_cursor: offset + limit < rows.length ? String(offset + limit) : null, ...(timezone ? { timezone: TIMEZONE } : {}) };
  };
  return {
    calls, audit,
    setScenario(value) { mode = value; },
    getScenario: () => mode,
    delay: () => mode === 'slow' ? 2500 : 0,
    respond(path, { method = 'GET', params = new URLSearchParams(), body, actorId = 1, operationId = '' } = {}) {
      calls.push({ path, method, body: body == null ? body : structuredClone(body), operationId });
      if (actorId === 0 || mode === 'unauthorized') return fail(401, 'unauthorized');
      if (actorId !== 1 || mode === 'forbidden') return fail(403, 'forbidden');
      if (!path.startsWith(ROOT)) return fail(404, 'not_found');
      const writing = method !== 'GET';
      if (mode === 'unavailable') return fail(503, 'observation_unavailable');
      if (mode === 'invalid') return ok({ unexpected: true });
      if (writing && !/^[0-9a-f-]{36}$/i.test(operationId)) return fail(400, 'idempotency_required');
      if (writing && (typeof body?.reason !== 'string' || !body.reason.trim() || body.reason.length > 500)) return fail(400, 'reason_required');
      if (writing && mode === 'conflict') return fail(409, 'revision_conflict');
      if (writing && mode === 'save-error') return fail(503, 'write_unavailable');
      const authorizationTarget = /^\/targets\/(\d+)\/export-authorization$/.exec(path.slice(ROOT.length));
      if (writing && authorizationTarget && (body?.generation?.target_revision !== (targets.get(Number(authorizationTarget[1]))?.revision ?? '0') || body?.generation?.policy_revision !== policy.revision)) return fail(409, 'generation_conflict');
      const cacheKey = `${method}:${path}:${operationId}`, signature = JSON.stringify(body);
      if (writing && cache.has(cacheKey)) { const saved = cache.get(cacheKey); return saved.signature === signature ? structuredClone(saved.result) : fail(409, 'idempotency_conflict'); }
      let result;
      try {
        const suffix = path.slice(ROOT.length);
        const match = /^\/(targets|legacy)\/(\d+)(?:\/(days|ips|requests|clear-day|export|export-authorization|stop|unban))?$/.exec(suffix);
        const id = match ? Number(match[2]) : null, action = match?.[3], target = targets.get(id);
        if (id != null && [1, 2].includes(id)) return fail(403, 'protected_target');
        if (id != null && ![3, 4].includes(id)) return fail(404, 'user_not_found');
        if (suffix === '/policy' && method === 'GET') result = ok({ policy, timezone: TIMEZONE, schema_available: mode !== 'schema-unavailable' });
        else if (suffix === '/policy' && method === 'PUT') {
          const input = policyInput(body); if (input.revision !== policy.revision) return fail(409, 'revision_conflict');
          const { reason: _reason, ...next } = input; policy = { ...next, revision: crypto.randomUUID() };
          result = ok({ policy, audit_id: auditId() });
        } else if (suffix === '/targets' && method === 'GET') result = ok(page(mode === 'empty' ? [] : [...targets.values()].map(t => ({ ...t, status: status(t) })), params, false));
        else if (!match) result = fail(404, 'not_found');
        else if (match[1] === 'legacy') {
          if (!action && method === 'GET') result = ok({ user_id: id, tracking, rule_revision: legacyRevision(), bans, truncated: false });
          else if (body?.revision !== legacyRevision()) result = fail(409, 'revision_conflict');
          else if (action === 'stop' && method === 'POST') { tracking = false; result = ok({ tracking, rule_revision: legacyRevision(), audit_id: auditId() }); }
          else if (action === 'unban' && method === 'POST' && Array.isArray(body.ips) && body.ips.length && body.ips.length <= 100 && body.ips.every(ip => bans.some(b => b.ip === ip))) {
            const old = bans.length; bans = bans.filter(b => !body.ips.includes(b.ip)); result = ok({ deleted_bans: old - bans.length, rule_revision: legacyRevision(), audit_id: auditId() });
          } else result = fail(400, 'legacy_invalid');
        } else if (!action && method === 'GET') result = ok({ user: fixtureUser(id), target: target ?? null, status: status(target), policy_enabled: policy.enabled, timezone: TIMEZONE });
        else if (!action && method === 'PUT') {
          const input = targetInput(body, now()); if (input.revision !== (target?.revision ?? '0')) return fail(409, 'revision_conflict');
          const next = { user_id: id, ...input, expires_at: input.expires_at ?? target?.expires_at ?? Math.floor(now() / 1000), revision: crypto.randomUUID(), updated_at: Math.floor(now() / 1000), updated_by: 1 };
          targets.set(id, next); result = ok({ target: next, status: status(next), audit_id: auditId() });
        } else {
          const selectedDay = body?.day ?? params.get('day') ?? shanghaiDay(now());
          const empty = mode === 'empty' || cleared.has(`${id}:${selectedDay}`);
          const ips = empty ? [] : Array.from({ length: mode === 'large' ? 2800 : 62 }, (_, i) => fixtureIP(i, selectedDay));
          const requests = (empty ? [] : Array.from({ length: mode === 'large' ? 3200 : 118 }, (_, i) => fixtureRequest(i, id, selectedDay))).filter(row => !(body?.method ?? params.get('method')) || row.method === (body?.method ?? params.get('method'))).filter(row => !(body?.status ?? params.get('status')) || row.status === Number(body?.status ?? params.get('status')));
          if (action === 'days' && method === 'GET') result = ok(page(empty ? [] : [{ day: selectedDay, accepted_count: requests.length, request_count: requests.length, ip_count: ips.length, first_seen_at: requests[0]?.occurred_at ?? null, last_seen_at: requests.at(-1)?.occurred_at ?? null, limit_reached: mode === 'large', coverage: mode === 'large' ? 'limit_reached' : 'unknown' }], params));
          else if (action === 'ips' && method === 'GET') result = ok({ ...page(ips, params), generation: { target_revision: target?.revision ?? '0', policy_revision: policy.revision } });
          else if (action === 'requests' && method === 'GET') result = ok({ ...page(requests, params), generation: { target_revision: target?.revision ?? '0', policy_revision: policy.revision } });
          else if (action === 'clear-day' && method === 'POST') {
            if (body.revision !== (target?.revision ?? '0')) return fail(409, 'revision_conflict');
            const nextRevision = crypto.randomUUID(); if (target) targets.set(id, { ...target, revision: nextRevision }); cleared.add(`${id}:${selectedDay}`);
            result = ok({ deleted_requests: requests.length, deleted_ips: ips.length, revision: nextRevision, audit_id: auditId() });
          } else if (action === 'export-authorization' && method === 'POST' && body.scope === 'current_page' && Number.isInteger(body.count) && body.count <= 200) result = ok({ audit_id: auditId() });
          else if (action === 'export' && method === 'POST') {
            const limit = Math.max(1, Math.min(200, body.limit || 50));
            let snapshot, offset = 0, snapshotKey;
            if (body.cursor) { const [key, rawOffset] = body.cursor.split(':'); snapshot = snapshots.get(key); snapshotKey = key; offset = Number(rawOffset); if (!snapshot || !Number.isSafeInteger(offset) || snapshot.revision !== target?.revision || snapshot.day !== selectedDay || snapshot.method !== (body.method ?? '') || snapshot.status !== (body.status ?? '')) return fail(409, 'snapshot_conflict'); }
            else { snapshotKey = `s${++counter}`; snapshot = { day: selectedDay, method: body.method ?? '', status: body.status ?? '', requests, ips, revision: target?.revision, generated_at: Math.floor(now() / 1000) }; snapshots.set(snapshotKey, snapshot); }
            const next = offset + limit < Math.max(snapshot.requests.length, snapshot.ips.length) ? `${snapshotKey}:${offset + limit}` : null;
            result = ok({ schema_version: 1, user_id: id, day: selectedDay, timezone: TIMEZONE, generated_at: snapshot.generated_at, items: snapshot.requests.slice(offset, offset + limit), ips: snapshot.ips.slice(offset, offset + limit), next_cursor: next, truncated: !!next, coverage: mode === 'large' ? 'limit_reached' : 'recorded', audit_id: auditId() });
          } else result = fail(404, 'not_found');
        }
      } catch { result = fail(400, 'invalid_fixture_input'); }
      result = structuredClone(result);
      if (writing && result.status === 200) { cache.set(cacheKey, { signature, result }); audit.push({ path, action: method, reason: body.reason, audit_id: result.data.audit_id }); }
      return result;
    },
  };
}
