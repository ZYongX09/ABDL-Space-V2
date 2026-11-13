import { isReservedAppClientSetting } from '../../src/appClients/model.js';
import { copy, createReceipts, fail, IMAGE, iso, missing, nonempty, ok, paginate, routeSignature, rowsForScenario } from './core.js';

export function registerSystemRoutes({ add }, state, { scenario, now, platform }) {
  const visible = rows => rowsForScenario(scenario(), rows);
  let sequence = 1200;
  state.settings = [{ key: 'site_name', value: '隔离合成测试站点', updated_at: iso(now()) }, { key: 'announcement', value: '所有写入仅在内存；不支付、不推送、不连接外部 AI。', updated_at: iso(now()) }];
  state.beta = { enabled: false, allowedRoutes: ['/about', '/login'], message: '合成内测提示' };
  state.blockedEmails = [{ email: 'blocked@example.invalid', reason: '合成邮箱治理记录', created_at: iso(now() - 86400), created_by_username: 'fixture_super' }];
  state.siteAccess = { web_mode: 'off', web_message: '本地合成暂停提示', web_login_prompt: '本地合成登录提示', app_mode: 'off', app_message: '本地合成 App 暂停提示', app_download_open: false, fake_posts: [{ content: '合成 App 展示条目', author: '合成管理', created_at: now() }], revision: 'fixture-site-1' };
  add('settings', 'GET', '/api/admin/settings', () => ok({ settings: [...visible(state.settings), ...state.appClientSettings()] }));
  add('settings', 'PUT', '/api/admin/settings', ({ body }) => {
    if (!nonempty(body?.key) || typeof body.value !== 'string' || isReservedAppClientSetting(body.key)) return fail(422, 'reserved_or_invalid_setting');
    const record = state.settings.find(row => row.key === body.key);
    if (record) Object.assign(record, { value: body.value, updated_at: iso(now()) });
    else state.settings.push({ key: body.key, value: body.value, updated_at: iso(now()) });
    return ok({ ok: true });
  });
  add('settings', 'GET', '/api/admin/beta-mode', () => ok(state.beta));
  add('settings', 'PUT', '/api/admin/beta-mode', ({ body }) => {
    if (typeof body?.enabled !== 'boolean' || !Array.isArray(body.allowedRoutes) || body.allowedRoutes.some(route => typeof route !== 'string' || !route.startsWith('/'))) return fail(422, 'invalid_beta');
    state.beta = copy(body); return ok({ ok: true });
  });
  add('settings', 'GET', '/api/admin/blocked-emails', () => ok({ emails: visible(state.blockedEmails) }));
  add('settings', 'POST', '/api/admin/blocked-emails', ({ body, actor }) => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body?.email || '')) return fail(422, 'invalid_email');
    const email = body.email.toLowerCase(); if (state.blockedEmails.some(row => row.email === email)) return fail(409, 'email_exists');
    state.blockedEmails.push({ email, reason: String(body.reason || '').slice(0, 200), created_at: iso(now()), created_by_username: actor.username }); return ok({ ok: true, email });
  });
  add('settings', 'DELETE', '/api/admin/blocked-emails/:email', ({ ids }) => { const index = state.blockedEmails.findIndex(row => row.email === ids.email); if (index < 0) return missing(); state.blockedEmails.splice(index, 1); return ok({ ok: true, email: ids.email }); });
  add('settings', 'POST', '/api/admin/reset/password', ({ body }) => !nonempty(body?.old_password) || typeof body?.new_password !== 'string' || body.new_password.length < 8 ? fail(422, 'invalid_password') : ok({ message: '合成密码修改已受理；不保存密码也不影响真实账号' }));
  add('site-access', 'GET', '/api/admin/site-access', () => ok(state.siteAccess));
  add('site-access', 'PUT', '/api/admin/site-access', ({ body }) => {
    if (body?.revision !== state.siteAccess.revision) return fail(409, 'revision_conflict');
    if (!['off', 'limited', 'closed'].includes(body.web_mode) || !['off', 'limited', 'closed'].includes(body.app_mode) || !Array.isArray(body.fake_posts) || body.fake_posts.length > 20 || body.fake_posts.some(row => !nonempty(row.content))) return fail(422, 'invalid_site_access');
    state.siteAccess = { ...copy(body), revision: `fixture-site-${++sequence}` }; return ok(state.siteAccess);
  });

  state.adPolicy = { enabled: 0, max_per_timeline: 1, min_interval_seconds: 8, ad_probability: 20, fallback_probability: 5, updated_at: iso(now()) };
  state.ads = Array.from({ length: scenario() === 'longlists' ? 51 : 4 }, (_, index) => ({ id: 1301 + index, title: `合成广告 ${index + 1}`, content: '本地投放策略与审核验收，不连接广告主或真实投放。', merchant_id: 1501 + index, merchant_name: `合成商家 ${index + 1}`, ad_type: index % 2 ? 'system' : 'merchant', status: ['active', 'paused', 'draft', 'archived'][index % 4], image_url: IMAGE, impression_count: 16, link_click_count: 2, image_view_count: 1, ad_navigation_count: 0, created_at: iso(now() - index * 3600), updated_at: iso(now()) }));
  state.adCodes = [{ id: 1601, masked_code: 'SYN***01', consumed_at: null, expires_at: null, created_at: iso(now()) }];
  add('advertising', 'GET', '/api/admin/advertising', ({ params }) => {
    const rows = visible(state.ads).filter(row => (!params.get('status') || row.status === params.get('status')) && (!params.get('merchant_id') || String(row.merchant_id) === params.get('merchant_id')));
    return ok({ ads: rows, items: rows, codes: visible(state.adCodes), impressions: scenario() === 'empty' ? 0 : 64, clicks: scenario() === 'empty' ? 0 : 12, pagination: { total: rows.length } });
  });
  add('advertising', 'GET', '/api/admin/advertising/stats', () => ok({ stats: { impressions: scenario() === 'empty' ? 0 : 64, clicks: scenario() === 'empty' ? 0 : 12 } }));
  add('advertising', 'GET', '/api/admin/advertising/policy', () => ok(state.adPolicy));
  add('advertising', 'PUT', '/api/admin/advertising/policy', ({ body }) => {
    const ranges = { max_per_timeline: 1, min_interval_seconds: 86400, ad_probability: 100, fallback_probability: 100 };
    if (!body || Object.entries(ranges).some(([key, max]) => !Number.isInteger(body[key]) || body[key] < 0 || body[key] > max)) return fail(422, 'invalid_advertising_policy');
    state.adPolicy = { ...copy(body), enabled: body.enabled ? 1 : 0, updated_at: iso(now()) }; return ok(state.adPolicy);
  });
  add('advertising', 'PATCH', '/api/admin/advertising/ads/:id', ({ ids, body }) => {
    const ad = state.ads.find(row => String(row.id) === ids.id); if (!ad) return missing();
    if (!['active', 'paused'].includes(body?.status)) return fail(422, 'invalid_ad_status');
    ad.status = body.status; ad.updated_at = iso(now()); return ok(ad);
  });
  if (platform === 'mobile') add('advertising', 'POST', '/api/admin/advertising/registration-codes', ({ body }) => {
    if (typeof body?.code !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(body.code)) return fail(422, 'invalid_code');
    // 既有后端每次只生成一条并忽略 count；不扩展为批量业务，不保存传入明文。
    const masked_code = `SYN***${String(++sequence).slice(-2)}`;
    state.adCodes.push({ id: sequence, masked_code, consumed_at: null, expires_at: null, created_at: iso(now()) });
    return ok({ success: true, masked_code });
  });

  state.pushLogs = Array.from({ length: scenario() === 'longlists' ? 54 : 3 }, (_, index) => ({ id: 1401 + index, title: `合成推送记录 ${index + 1}`, body: '这是内存投递回执，未发送任何通知。', sent_count: 3, jpush_sent: 2, created_at: iso(now() - index * 3600) }));
  add('notifications', 'GET', '/api/push/admin/stats', () => ok({ web_count: scenario() === 'empty' ? 0 : 7, jpush_count: scenario() === 'empty' ? 0 : 5, today_sent: visible(state.pushLogs).reduce((sum, row) => sum + row.sent_count + row.jpush_sent, 0), today_failed: 0 }));
  add('notifications', 'GET', '/api/push/admin/logs', ({ params }) => ok(paginate(visible(state.pushLogs), params, 'logs')));
  add('notifications', 'GET', '/api/push/admin/platforms', () => ok({ vapidConfigured: true, jpushEnabled: true, jpushAppKey: 'SYNTHETIC-NOT-A-CREDENTIAL' }));
  for (const action of ['send', 'test']) add('notifications', 'POST', `/api/push/admin/${action}`, ({ body }) => {
    if (action === 'send' && (!nonempty(body?.title) || !nonempty(body?.body))) return fail(422, 'push_content_required');
    if (action === 'test' && !Number.isSafeInteger(body?.user_id)) return fail(422, 'invalid_user');
    const webSent = body?.platform === 'jpush' ? 0 : 1, jpushSent = body?.platform === 'web' ? 0 : 1;
    state.pushLogs.unshift({ id: ++sequence, title: body?.title || '合成测试推送', sent_count: webSent, jpush_sent: jpushSent, created_at: iso(now()) });
    return ok(action === 'test'
      ? { success: true, sent: webSent + jpushSent, message: '仅内存模拟；没有执行 Web/JPush 投递' }
      : { success: true, webSent, jpushSent, failed: 0, msg_id: `synthetic-message-${sequence}`, message: '仅内存模拟；没有执行 Web/JPush 投递' });
  });
  add('notifications', 'GET', '/api/push/admin/jpush-stats', ({ params }) => ok({ items: (params.get('msg_ids') || '').split(',').filter(Boolean).map(msg_id => ({ msg_id, android_received: 1, android_clicked: 0, ios_apns_sent: 1, ios_clicked: 0 })) }));

  if (platform === 'web') {
    const receipts = createReceipts();
    state.albumReports = Array.from({ length: scenario() === 'longlists' ? 63 : 4 }, (_, index) => ({ id: `album-report-${index + 1}`, album_id: `album-${index + 1}`, album_name: `合成相册 ${index + 1}`, owner_id: '3', reporter_id: '4', reason: '合成相册举报', detail: '用于检查本地预览、批量屏蔽/解除和处理；不包含任何真实照片。', status: index % 3 ? 'open' : 'resolved', created_at: iso(now() - index * 3600), resolved_at: index % 3 ? '' : iso(now()), download_protected: true, photos: [{ id: `photo-${index + 1}-1`, admin_blocked: false, preview_url: IMAGE, width: 640, height: 480, description: '合成几何预览图' }, { id: `photo-${index + 1}-2`, admin_blocked: true, preview_url: IMAGE, width: 640, height: 480, description: '已屏蔽合成图' }] }));
    const present = row => ({ ...row, blocked_photo_count: row.photos.filter(photo => photo.admin_blocked).length, album_photo_count: row.photos.length });
    add('album-reports', 'GET', '/api/admin/album-reports', ({ params }) => { const rows = visible(state.albumReports).filter(row => !params.get('status') || params.get('status') === 'all' || row.status === params.get('status')).map(present); return ok(paginate(rows, params, 'reports')); });
    add('album-reports', 'GET', '/api/admin/album-reports/:id', ({ ids }) => { const report = state.albumReports.find(row => row.id === ids.id); return report ? ok(present(report)) : missing(); });
    add('album-reports', 'POST', '/api/admin/album-reports/:id/block', ctx => receipts(ctx.body?.operation_id, routeSignature(ctx), () => {
      const report = state.albumReports.find(row => row.id === ctx.ids.id); if (!report) return missing();
      if (!Array.isArray(ctx.body?.photo_ids) || ctx.body.photo_ids.some(id => !report.photos.some(photo => photo.id === id))) return fail(422, 'invalid_photos');
      report.photos.forEach(photo => { photo.admin_blocked = ctx.body.photo_ids.includes(photo.id); }); return ok({ blocked_photo_ids: report.photos.filter(photo => photo.admin_blocked).map(photo => photo.id) });
    }));
    add('album-reports', 'POST', '/api/admin/album-reports/:id/resolve', ({ ids }) => { const report = state.albumReports.find(row => row.id === ids.id); if (!report) return missing(); report.status = 'resolved'; report.resolved_at = iso(now()); return ok({ message: '已处理（仅内存）' }); });
  }
}
