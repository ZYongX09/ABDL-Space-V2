import { isSuperAdmin, userActionPolicy } from '../../src/pages/admin/access.js';
import { validateUnbindInput } from '../../src/adminIdentity/model.js';
import { testVerificationQuery } from '../../src/pages/admin/testVerificationCode.js';
import { copy, createReceipts, fail, IMAGE, iso, missing, ok, paginate, routeSignature, rowsForScenario, search } from './core.js';

export function createCommunityState({ scenario = 'normal', now }) {
  const count = scenario === 'longlists' ? 87 : 8;
  const users = Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return { id, username: ['fixture_super', 'fixture_admin', 'fixture_user', 'fixture_member'][index] || `fixture_member_${id}`, display_name: ['合成超级管理员', '合成管理员', '合成测试用户', '合成待提升用户'][index] || `合成成员 ${id}`, role: id <= 2 ? 'admin' : 'user', is_super_admin: id === 1, email: `fixture_${id}@example.invalid`, avatar: IMAGE, qq_bound: id === 3 || id === 5, banned: id === 6, created_at: iso(now - id * 86400), last_login_at: iso(now - id * 60), points: id * 10, bio: '仅用于本地管理界面验收的虚构资料。' };
  });
  const posts = Array.from({ length: scenario === 'longlists' ? 95 : 6 }, (_, index) => ({ id: 101 + index, user: copy(users[2 + index % 4]), username: users[2 + index % 4].username, content: `合成帖子 ${index + 1}：这是一条社区管理验收内容。` + (index % 2 ? '长文本换行与展开收起。\n'.repeat(18) : '仅保存在内存。'), pinned: index === 0, has_nsfw: index === 2, is_announcement: index === 0, like_count: index + 4, comment_count: 2, created_at: iso(now - index * 3600), images: [] }));
  const comments = Array.from({ length: scenario === 'longlists' ? 73 : 6 }, (_, index) => ({ id: 201 + index, post_id: posts[index % posts.length].id, user: copy(users[2 + index % 4]), content: `合成评论 ${index + 1}。` + (index % 2 ? '评论完整段落需要可以展开。\n'.repeat(12) : '无真实社区内容。'), like_count: index + 1, created_at: iso(now - index * 1800) }));
  const reports = Array.from({ length: scenario === 'longlists' ? 65 : 6 }, (_, index) => ({ id: 301 + index, target_type: index % 2 ? 'comment' : 'post', target_id: index % 2 ? comments[0].id : posts[1].id, content_preview: '合成被举报内容；用于检查详情、驳回和仅处理/删除内容。', reporter_name: users[3].username, reason: '本地合成举报：请核实是否违反社区规则。', status: ['pending', 'pending', 'resolved', 'dismissed'][index % 4], created_at: iso(now - index * 2400) }));
  const friendReports = reports.map((row, index) => ({ ...row, id: 401 + index, request_id: 501 + index, request_user_id: users[2].id, request_username: users[2].username, request_user_email: users[2].email, request_title: '合成交友请求', request_description: '用于检查交友请求举报的采纳、驳回和回复；无真实个人信息。', looking_for: '合成测试伙伴', admin_reply: row.status === 'dismissed' ? '已完成本地复核' : '' }));
  return { users, posts, comments, reports, friendReports, identityVersions: new Map(users.map(user => [user.id, 1794528000])), identityAudit: new Map(), tracked: new Set(), securityLogs: Array.from({ length: scenario === 'longlists' ? 83 : 5 }, (_, index) => ({ id: 601 + index, created_at: iso(now - index * 600), event_type: index % 2 ? 'login_failed' : 'rate_limit', score: 15 + index * 10 % 90, ip: `192.0.2.${index + 1}`, session_id: `synthetic-session-${index}`, user_agent: 'Synthetic acceptance browser', details: '仅本地合成安全事件，不包含真实请求信息。' })) };
}

export function registerCommunityRoutes(registry, state, { scenario, now, appClients }) {
  const { add } = registry;
  const visible = rows => rowsForScenario(scenario(), rows);
  const receipts = createReceipts();
  const findUser = id => state.users.find(user => String(user.id) === String(id));
  const governance = (ctx, user) => !user ? missing() : !userActionPolicy(ctx.actor, user).canGovern ? fail(403, 'protected_target') : null;
  add('users', 'GET', '/api/admin/users', ({ params }) => {
    const rows = search(visible(state.users), params, ['username', 'display_name', 'email', 'id']).filter(user => (!params.get('role') || user.role === params.get('role')) && (!params.get('qq_bound') || user.qq_bound === (params.get('qq_bound') === 'bound')));
    return ok(paginate(rows, params, 'users'));
  });
  add('users', 'GET', '/api/admin/users/:id/detail', ({ ids }) => {
    const user = findUser(ids.id);
    if (!user) return missing();
    const posts = state.posts.filter(post => post.user.id === user.id);
    const comments = state.comments.filter(comment => comment.user.id === user.id);
    return ok({ user, counts: { posts: posts.length, comments: comments.length, likes: 12, checkins: 9, points: user.points }, badges: (state.badges || []).filter(badge => state.holders.get(badge.key)?.has(user.id)), tracking: { enabled: state.tracked.has(user.id), ips: [] }, trackEvents: [], recentPosts: posts.slice(0, 5) });
  });
  add('users', 'POST', '/api/admin/users/:id/ban', ctx => {
    const user = findUser(ctx.ids.id), denied = governance(ctx, user); if (denied) return denied;
    user.banned = !user.banned; return ok({ banned: user.banned });
  });
  add('users', 'DELETE', '/api/admin/users/:id', ctx => {
    const user = findUser(ctx.ids.id), denied = governance(ctx, user); if (denied) return denied;
    state.users.splice(state.users.indexOf(user), 1); return ok({ message: '已删除（仅本地内存）' });
  });
  add('users', 'PATCH', '/api/admin/users/:id/role', ctx => {
    const user = findUser(ctx.ids.id);
    if (!isSuperAdmin(ctx.actor)) return fail(403, 'super_admin_required');
    if (!user) return missing();
    if (user.id === 1 || !['admin', 'user'].includes(ctx.body?.role)) return fail(422, 'invalid_role');
    user.role = ctx.body.role; return ok({ user, message: '角色已更新（仅内存）' });
  });
  add('users', 'POST', '/api/admin/add', ctx => {
    if (!isSuperAdmin(ctx.actor)) return fail(403, 'super_admin_required');
    if (!Array.isArray(ctx.body?.user_ids) || !ctx.body.user_ids.length || ctx.body.user_ids.some(id => !findUser(id))) return fail(422, 'invalid_users');
    ctx.body.user_ids.forEach(id => { findUser(id).role = 'admin'; }); return ok({ message: '已提升（仅内存）' });
  });
  add('users', 'GET', '/api/admin/security/users/:id/tracking', ({ ids }) => findUser(ids.id) ? ok({ enabled: state.tracked.has(Number(ids.id)), ips: [{ ip: '192.0.2.17', count: 3, first_seen_at: iso(now() - 7200), last_seen_at: iso(now()) }] }) : missing());
  add('users', 'POST', '/api/admin/security/users/:id/track-and-ban', ctx => {
    const user = findUser(ctx.ids.id), denied = governance(ctx, user); if (denied) return denied;
    state.tracked.add(user.id); return ok({ tracked: true, banned_ip_count: 1 });
  });
  add('users', 'GET', '/api/admin/identities/users/:id', ctx => {
    const user = findUser(ctx.ids.id); if (!user) return missing();
    return ok({ user, methods: { password: true, verified_email: true, nbw: user.id === 4, passkeys: { count: 1 }, qq: { bound: user.qq_bound, nickname: user.qq_bound ? `合成 QQ 昵称 ${user.id}` : '', avatar: user.qq_bound ? IMAGE : '', created_at: 1793000000, updated_at: state.identityVersions.get(user.id), can_unbind: user.qq_bound === true && userActionPolicy(ctx.actor, user).canGovern, block_reason: user.role === 'admin' ? '管理员账号受保护' : '' } }, audit: state.identityAudit.get(user.id) || [] });
  });
  add('users', 'POST', '/api/admin/identities/users/:id/qq/unbind', ctx => {
    const user = findUser(ctx.ids.id), denied = governance(ctx, user); if (denied) return denied;
    let input;
    try { input = validateUnbindInput({ reason: ctx.body?.reason, confirmUsername: ctx.body?.confirm_username, username: user.username, expectedBindingVersion: ctx.body?.expected_binding_version }); } catch { return fail(422, 'invalid_identity_input'); }
    return receipts(ctx.body?.operation_id, routeSignature(ctx), () => {
      if (!user.qq_bound || input.expected_binding_version !== state.identityVersions.get(user.id)) return fail(409, 'binding_version_conflict');
      user.qq_bound = false; state.identityVersions.set(user.id, input.expected_binding_version + 1);
      state.identityAudit.set(user.id, [{ id: `qq-audit-${now()}`, action: 'qq_unbind', actor: { id: ctx.actor.id, username: ctx.actor.username }, reason: input.reason, created_at: now() }, ...(state.identityAudit.get(user.id) || [])]);
      return ok({ user_id: user.id, qq_bound: false, operation_id: ctx.body.operation_id });
    });
  });

  for (const [feature, key] of [['posts', 'posts'], ['comments', 'comments']]) {
    add(feature, 'GET', `/api/admin/${feature}`, ({ params }) => {
      let rows = search(visible(state[key]).map(row => ({ ...row, search_user: row.user.username })), params, ['id', 'content', 'search_user']);
      if (key === 'comments' && Number(params.get('post_id'))) rows = rows.filter(row => row.post_id === Number(params.get('post_id')));
      return ok(paginate(rows, params, key));
    });
    add(feature, 'DELETE', `/api/admin/${feature}/:id`, ({ ids }) => {
      const index = state[key].findIndex(row => String(row.id) === ids.id); if (index < 0) return missing();
      state[key].splice(index, 1); return ok({ message: '已删除（仅内存）' });
    });
  }
  add('posts', 'POST', '/api/admin/posts/:id/pin', ({ ids }) => { const post = state.posts.find(row => String(row.id) === ids.id); if (!post) return missing(); post.pinned = !post.pinned; return ok({ pinned: post.pinned }); });
  add('posts', 'PATCH', '/api/admin/posts/:id/nsfw', ({ ids, body }) => { const post = state.posts.find(row => String(row.id) === ids.id); if (!post) return missing(); if (typeof body?.has_nsfw !== 'boolean') return fail(422, 'invalid_nsfw'); post.has_nsfw = body.has_nsfw; return ok({ has_nsfw: post.has_nsfw }); });

  add('reports', 'GET', '/api/reports/admin', ({ params }) => ok(paginate(visible(state.reports).filter(row => !params.get('status') || row.status === params.get('status')), params, 'reports')));
  add('reports', 'PATCH', '/api/reports/admin/:id', ({ ids, body }) => {
    const report = state.reports.find(row => String(row.id) === ids.id); if (!report) return missing();
    if (report.status !== 'pending') return fail(409, 'report_conflict');
    if (!['resolve', 'dismiss'].includes(body?.action)) return fail(422, 'invalid_action');
    report.status = body.action === 'resolve' ? 'resolved' : 'dismissed';
    if (body.delete_content === true && body.action === 'resolve') { const key = report.target_type === 'post' ? 'posts' : 'comments'; const index = state[key].findIndex(row => row.id === report.target_id); if (index >= 0) state[key].splice(index, 1); }
    return ok({ message: '举报状态已更新（仅内存）' });
  });
  add('reports', 'GET', '/api/friend-request/admin/reports', ({ params }) => ok(paginate(visible(state.friendReports).filter(row => !params.get('status') || row.status === params.get('status')), params, 'reports')));
  for (const action of ['accept', 'dismiss']) add('reports', 'POST', `/api/friend-request/admin/reports/:id/${action}`, ({ ids, body }) => {
    const report = state.friendReports.find(row => String(row.id) === ids.id); if (!report) return missing();
    if (report.status !== 'pending') return fail(409, 'report_conflict');
    report.status = action === 'accept' ? 'resolved' : 'dismissed'; report.admin_reply = body?.reply || '';
    if (action === 'accept') report.request_deleted = true;
    return ok({ message: action === 'accept' ? '已采纳（仅内存）' : '已驳回（仅内存）' });
  });

  add('overview', 'GET', '/api/admin/stats', () => ok({ users: visible(state.users).length, posts: visible(state.posts).length, comments: visible(state.comments).length, diapers: visible(state.diapers || []).length, ratings: scenario() === 'empty' ? 0 : 17 }));
  add('overview', 'GET', '/api/admin/stats/overview', () => {
    const empty = scenario() === 'empty';
    const activity = factor => Object.fromEntries(['users', 'posts', 'post_comments', 'daily_checkins', 'likes', 'ratings'].map((key, index) => [key, empty ? 0 : (index + 1) * factor]));
    return ok({ generatedAt: iso(now()), totals: { users: visible(state.users).length, bannedUsers: visible(state.users).filter(user => user.banned).length, posts: visible(state.posts).length, comments: visible(state.comments).length, likes: empty ? 0 : 184, checkins: empty ? 0 : 53, ratings: empty ? 0 : 17, diapers: visible(state.diapers || []).length, novels: empty ? 0 : 1, badges: empty ? 0 : 6 }, today: activity(1), yesterday: activity(2), week: activity(5), prevWeek: activity(4), pending: { reports: visible(state.reports).filter(row => row.status === 'pending').length, friend_reports: visible(state.friendReports).filter(row => row.status === 'pending').length, novel_reports: empty ? 0 : 2, novel_appeals: empty ? 0 : 1, security_24h: visible(state.securityLogs).length }, provinces: empty ? [] : [{ name: '合成地域甲', c: 12 }, { name: '合成地域乙', c: 8 }], topBadges: empty ? [] : [{ name: '合成社区参与', c: 6 }], recentUsers: visible(state.users).slice(0, 5), recentPosts: visible(state.posts).slice(0, 5).map(post => ({ ...post, username: post.user.username })), novels: { published: empty ? 0 : 1, pending: empty ? 0 : 3 } });
  });
  add('overview', 'GET', '/api/admin/stats/trends', ({ params }) => {
    const days = Math.max(7, Math.min(90, Number(params.get('days')) || 30));
    return ok({ days, series: Object.fromEntries(['users', 'posts', 'comments', 'checkins', 'likes', 'ratings', 'novels'].map((key, index) => [key, scenario() === 'empty' ? [] : Array.from({ length: days }, (_, day) => ({ d: iso(now() - (days - day - 1) * 86400).slice(0, 10), c: (day + index) % 12 + 1 }))])) });
  });
  add('security', 'GET', '/api/admin/security/logs', ({ params }) => { const rows = visible(state.securityLogs).filter(row => !params.get('type') || row.event_type === params.get('type')); const data = paginate(rows, params, 'logs', 50); return ok({ ...data, page: data.pagination.page, limit: data.pagination.limit }); });
  add('security', 'GET', '/api/admin/security/stats', () => ok({ dayCount: visible(state.securityLogs).length, weekCount: visible(state.securityLogs).length * 3, typeStats: visible([{ event_type: 'login_failed', cnt: 3 }, { event_type: 'rate_limit', cnt: 2 }]), scoreDistribution: visible([{ level: 'warning', cnt: 3 }, { level: 'info', cnt: 2 }]), trend: visible([{ hour: now() - 3600, cnt: 5 }]) }));
  add('security', 'POST', '/api/admin/security/test-verification-code', ctx => {
    if (!isSuperAdmin(ctx.actor)) return fail(403, 'super_admin_required');
    let query; try { query = testVerificationQuery(ctx.body); } catch { return fail(422, 'invalid_verification_query'); }
    if (query.email !== 'tester@test.top') return fail(400, 'VERIFICATION_NOT_FOUND', '仅合成测试邮箱 tester@test.top 存在');
    return ok({ ...query, code: '123456', expires_at: now() + 300 });
  });
  // 站点配置里保留真实 App 专用字段，但保存仍由各自专用 fixture 处理。
  state.appClientSettings = () => appClients.respond('/api/admin/settings', 'GET').data.settings.filter(row => row.key !== 'site_name');
}
