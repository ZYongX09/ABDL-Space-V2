// 仅供 Node 行为测试与本地验收服务器导入；生产入口不导入此文件，也不调用外部 AI。
export const FIXTURE_BODY = '　完整章节开头\n' + '这是仅保存在内存的合成小说段落，用于检查全文加载与同章分块。\n'.repeat(520) + '\n完整章节末尾：不能被截断。';
export const FIXTURE_HASH = 'a'.repeat(64);
export const fixtureAuthor = { id: 42, username: 'fixture_author', display_name: '本地合成作者', avatar: '', url: 'https://example.invalid/@fixture_author' };
export function fixtureAutoReview(patch = {}) {
  return { status: 'queued', policy_version: 'fixture-policy-1', completed_chunks: 0, total_chunks: 3, reason: null, failure_code: null, findings: [], updated_at: 1793174400, ...patch };
}
export function fixtureAIPolicy(patch = {}) {
  return { enabled: false, daily_call_limit: 200, job_call_limit: 256, revision: 'fixture-policy-1', ...patch };
}
export function fixtureReview(patch = {}) {
  return {
    id: 'review-pending', work_id: 'work-1', status: 'pending', version: 1, owner_id: 42, author: { ...fixtureAuthor },
    title: '完整候选审核示例', description: '本地合成小说，无生产账号、无外部 AI。\n简介第二行保留。', work_type: 'original', cover_url: null,
    tags: ['本地验收', '完整快照'], statements: ['作者确认原创或已取得授权', '声明此内容仅为合成测试数据'], source: '作者自行创作', authorization: '作者授权站内发布', completed: false,
    base_release_id: 'release-previous', submitted_at: 1793174400, claimed_by: null, reason: null,
    chapters: [{ id: 'chapter-1', title: '第一章 · 分块大章节', sort_order: 0, word_count: FIXTURE_BODY.length, generation: 2, body_sha256: FIXTURE_HASH, status: 'pending' }, { id: 'chapter-2', title: '第二章 · 全量正文结尾', sort_order: 1, word_count: 100, generation: 1, body_sha256: FIXTURE_HASH, status: 'pending' }],
    changes: { metadata: ['description', 'tags'], chapters: [{ id: 'chapter-1', title: '第一章 · 分块大章节', kind: 'updated' }, { id: 'chapter-2', title: '第二章 · 全量正文结尾', kind: 'added' }] },
    audit: [{ actor_id: 42, actor_name: 'fixture_author', action: 'submit', reason: '提交完整候选', created_at: 1793174400 }], ...patch,
  };
}
export function fixtureWork(patch = {}) {
  const review = fixtureReview();
  return { id: 'work-1', release_id: 'release-previous', title: review.title, description: review.description, work_type: review.work_type, cover_url: null, tags: [...review.tags], statements: [...review.statements], source: review.source, authorization: review.authorization, completed: false, status: 'published', author: { ...fixtureAuthor }, word_count: 20000, chapter_count: 2, reads: 128, collections: 12, comments: 4, published_at: 1793000000, updated_at: 1793174400, chapters: [...review.chapters], reviews: [review], reviews_next_cursor: null, ...patch };
}
export function createNovelFixture() {
  let scenario = 'normal', delay = 0;
  const reviews = new Map(['pending', 'reviewing', 'approved', 'rejected'].map(status => { const item = fixtureReview({ id: `review-${status}`, status, version: status === 'pending' ? 1 : 2, claimed_by: status === 'reviewing' ? 1 : null, title: `${({ pending: '待审核', reviewing: '审核中', approved: '已通过', rejected: '已驳回' })[status]} · 完整候选示例`, reason: status === 'rejected' ? '需要补充授权资料' : status === 'approved' ? '人工核对完整内容后通过' : null }); return [item.id, item]; }));
  for (let index = 1; index <= 69; index += 1) {
    const item = fixtureReview({ id: `review-history-${String(index).padStart(3, '0')}`, title: `历史候选版本 ${index}`, status: 'approved', version: 3, submitted_at: 1793174400 - index, reason: '本地历史版本人工通过' });
    reviews.set(item.id, item);
  }
  const automatic = [
    fixtureReview({ id: 'review-auto-queued', title: '自动审核排队 · 完整候选示例', auto_review: fixtureAutoReview() }),
    fixtureReview({ id: 'review-auto-running', title: '自动审核中 · 完整候选示例', auto_review: fixtureAutoReview({ status: 'running', completed_chunks: 1 }) }),
    fixtureReview({ id: 'review-auto-failure', title: '自动审核失败转人工 · 完整候选示例', status: 'reviewing', version: 2, claimed_by: 2, auto_review: fixtureAutoReview({ status: 'needs_human', completed_chunks: 1, reason: '自动审核未完成：单任务调用次数已用尽，请人工核对授权。', failure_code: 'JOB_CALL_LIMIT', findings: [{ chapter_id: 'chapter-1', field: 'authorization', reason: '授权说明需要人工确认', evidence: '合成依据 <script>不能执行</script>' }] }) }),
    fixtureReview({ id: 'review-auto-approved', title: '自动审核已通过 · 完整候选示例', status: 'approved', version: 2, auto_review: fixtureAutoReview({ status: 'passed', completed_chunks: 3, reason: '所有自动审核分块已完成，服务器已通过。' }) }),
  ];
  for (const item of automatic) {
    item.audit.push({ actor_type: 'system', actor_name: '自动审核', action: item.auto_review.status === 'passed' ? 'auto_passed' : item.auto_review.status === 'needs_human' ? 'auto_needs_human' : 'auto_queued', reason: item.auto_review.reason || '合成自动审核任务', created_at: 1793174500 });
    reviews.set(item.id, item);
  }
  let policy = fixtureAIPolicy(), policyVersion = 1;
  const work = fixtureWork();
  const comments = new Map([['comment-1', { id: 'comment-1', body: '本地被举报评论', deleted: false }]]);
  const reports = [
    { id: 'report-1', work_id: work.id, work_title: work.title, chapter_id: 'chapter-2', comment_id: null, reason: '本地合成举报：请人工核对授权', status: 'pending', reporter: { ...fixtureAuthor, id: 43, username: 'fixture_reporter' }, created_at: 1793174500 },
    { id: 'report-comment', work_id: work.id, work_title: '本地评论举报（只删除评论）', chapter_id: null, comment_id: 'comment-1', reason: '本地合成评论举报：只移除评论，不下架作品', status: 'pending', reporter: { ...fixtureAuthor, id: 43, username: 'fixture_reporter' }, created_at: 1793174501 },
  ];
  const receipts = new Map(), calls = [], creators = new Map([[42, 'active']]);
  const clone = value => structuredClone(value);
  const ok = data => ({ status: 200, data: clone(data) });
  const error = (status, code, message) => ({ status, data: { code, error: message } });
  return {
    configure(patch = {}) { if (typeof patch.scenario === 'string') scenario = patch.scenario; if (Number.isFinite(patch.delay)) delay = Math.min(10000, Math.max(0, patch.delay)); return { scenario, delay }; },
    state: () => ({ scenario, delay, calls: clone(calls), creators: [...creators], policy: clone(policy), reviews: [...reviews.values()].map(item => ({ id: item.id, status: item.status, version: item.version, auto_review: clone(item.auto_review ?? null) })), work: clone(work), reports: clone(reports), comments: clone([...comments.values()]) }),
    async respond(path, { method = 'GET', params = new URLSearchParams(), body, operationId, actorId = 1 } = {}) {
      calls.push({ path, method, params: Object.fromEntries(params), body: clone(body), operationId, actorId });
      if (delay || scenario === 'slow') await new Promise(resolve => setTimeout(resolve, delay || 3000));
      if (scenario === 'unauthorized') return error(401, 'session_expired', 'Local fixture expired session');
      if (scenario === 'forbidden') return error(403, 'admin_required', 'Local fixture denied');
      if (scenario === 'unavailable') return error(503, 'storage_unavailable', 'Local fixture unavailable');
      const suffix = path.replace('/api/admin/novels/rebuild', '');
      if (method !== 'GET' && !operationId) return error(400, 'idempotency_required', 'Local fixture requires operation key');
      const fingerprint = JSON.stringify({ path, method, body, actorId });
      if (operationId && receipts.has(operationId)) { const receipt = receipts.get(operationId); return receipt.fingerprint === fingerprint ? clone(receipt.result) : error(409, 'idempotency_conflict', 'Local fixture key reused'); }
      if ((scenario === 'conflict' || (scenario === 'policy-conflict' && suffix === '/ai-policy')) && method !== 'GET') return error(409, 'review_conflict', 'Local fixture version changed');
      const moderation = /^\/reviews\/[^/]+\/decision$/.test(suffix);
      if (method !== 'GET' && (suffix.endsWith('/decision') || suffix.endsWith('/action'))) {
        const reason = moderation && body?.reason === undefined ? '' : body?.reason;
        if (typeof reason !== 'string' || (!moderation && !reason.trim()) || reason.length > 2000 || reason.includes('\0')) return error(400, 'invalid_reason', 'Local fixture reason invalid');
      }
      const page = (items, prefix, take) => {
        const raw = params.get('cursor');
        const offset = raw?.startsWith(`${prefix}:`) ? Number(raw.slice(prefix.length + 1)) : 0;
        if (raw && (!raw.startsWith(`${prefix}:`) || !Number.isSafeInteger(offset) || offset < 0)) return error(400, 'invalid_cursor', 'Local fixture invalid cursor');
        return ok({ items: items.slice(offset, offset + take), next_cursor: offset + take < items.length ? `${prefix}:${offset + take}` : null });
      };
      let result;
      if (suffix === '/ai-policy' && method === 'GET') result = ok(policy);
      else if (suffix === '/ai-policy' && method === 'PUT') {
        if (body?.revision !== policy.revision) return error(409, 'policy_conflict', 'Local fixture policy CAS conflict');
        if (typeof body.enabled !== 'boolean' || !Number.isSafeInteger(body.daily_call_limit) || body.daily_call_limit < 1 || body.daily_call_limit > 10000 || !Number.isSafeInteger(body.job_call_limit) || body.job_call_limit < 1 || body.job_call_limit > 2048) return error(400, 'invalid_policy', 'Local fixture invalid call budgets');
        policyVersion += 1;
        policy = { enabled: body.enabled, daily_call_limit: body.daily_call_limit, job_call_limit: body.job_call_limit, revision: `fixture-policy-${policyVersion}` }; result = ok(policy);
      } else if (suffix === '/reviews' && method === 'GET') {
        const query = (params.get('query') || '').trim(), autoFilter = params.get('auto_filter') || 'all';
        if (!['all', 'needs_human', 'queued', 'running'].includes(autoFilter)) return error(400, 'invalid_auto_filter', 'Local fixture invalid auto filter');
        const matchesAuto = item => autoFilter === 'all' || (autoFilter === 'needs_human' ? !item.auto_review || ['needs_human', 'cancelled'].includes(item.auto_review.status) : item.auto_review?.status === autoFilter);
        const items = [...reviews.values()].filter(item => item.status === (params.get('status') || 'pending') && matchesAuto(item) && `${item.title} ${item.author.username}`.includes(query));
        result = page(items, 'fixture-list', Math.max(1, Math.min(50, Number(params.get('limit')) || 20)));
      } else if (suffix === '/works' && method === 'GET') result = ok({ items: (!params.get('status') || params.get('status') === work.status) && `${work.title} ${work.author.username} ${work.tags.join(' ')}`.includes(params.get('query') || '') ? [work] : [], next_cursor: null });
      else if (suffix === `/works/${work.id}` && method === 'GET') result = ok({ ...work, reviews: [...reviews.values()].slice(0, 50), reviews_next_cursor: reviews.size > 50 ? 'fixture-history:50' : null });
      else if (suffix === `/works/${work.id}/reviews` && method === 'GET') result = page([...reviews.values()], 'fixture-history', Math.max(1, Math.min(50, Number(params.get('limit')) || 20)));
      else if (suffix === '/reports' && method === 'GET') result = ok({ items: reports });
      else if (/^\/reviews\/[^/]+(?:\/.*)?$/.test(suffix)) {
        const [, , rawId, part, chapterId] = suffix.split('/'), id = decodeURIComponent(rawId), item = reviews.get(id);
        if (!item) return error(404, 'review_not_found', 'Local fixture review not found');
        if (!part && method === 'GET') result = ok(item);
        else if (part === 'chapters' && method === 'GET') {
          const chapter = item.chapters.find(ch => ch.id === chapterId);
          if (!chapter) return error(404, 'chapter_not_found', 'Local fixture chapter missing');
          result = ok({ ...chapter, body: chapterId === 'chapter-1' ? FIXTURE_BODY : '第二章正文。\n末尾标记 <script>不作为 HTML 执行</script>\n全章已返回。' });
          if (scenario === 'body-mismatch') result.data.body_sha256 = 'b'.repeat(64);
        } else if (part === 'claim' && method === 'POST') {
          if (!['pending', 'reviewing'].includes(item.status)) return error(409, 'review_conflict', 'Local fixture claim changed');
          item.status = 'reviewing'; item.claimed_by = actorId; item.version += 1;
          if (['queued', 'running'].includes(item.auto_review?.status)) item.auto_review = { ...item.auto_review, status: 'cancelled', reason: '管理员认领 / 接手，自动任务已取消。' };
          item.audit.push({ actor_id: actorId, actor_name: '本地管理员', action: 'claim', reason: '', created_at: 1793174600 }); result = ok(item);
        } else if (part === 'release' && method === 'POST') {
          if (item.status !== 'reviewing' || item.claimed_by !== actorId) return error(409, 'review_conflict', 'Local fixture not your claim');
          item.status = 'pending'; item.claimed_by = null; item.version += 1;
          item.audit.push({ actor_id: actorId, actor_name: '本地管理员', action: 'release', reason: '', created_at: 1793174700 }); result = ok(item);
        } else if (part === 'decision' && method === 'POST') {
          if (!['pending', 'reviewing'].includes(item.status) || item.version !== body.version) return error(409, 'review_conflict', 'Local fixture CAS conflict');
          if (!['approve', 'reject'].includes(body.decision)) return error(400, 'invalid_decision', 'Local fixture invalid decision');
          item.status = body.decision === 'approve' ? 'approved' : 'rejected'; item.reason = (body.reason ?? '').trim(); item.version += 1;
          if (['queued', 'running'].includes(item.auto_review?.status)) item.auto_review = { ...item.auto_review, status: 'cancelled', reason: '管理员已作人工决定，自动流程已结束。' };
          item.audit.push({ actor_id: actorId, actor_name: '本地管理员', action: body.decision === 'approve' ? 'human_approve' : 'human_reject', reason: item.reason, created_at: 1793174800 });
          if (body.decision === 'approve') { work.release_id = item.id; work.status = 'published'; }
          result = ok({ review: item, work: body.decision === 'approve' ? work : null });
        } else if (part === 'ai' && method === 'POST') {
          if (!['pending', 'reviewing'].includes(item.status)) return error(409, 'review_conflict', 'Local fixture inactive review');
          if (!Number.isSafeInteger(body?.offset) || body.offset < 0) return error(400, 'invalid_offset', 'Local fixture invalid chunk offset');
          const chapter = item.chapters.find(ch => ch.id === body.chapter_id);
          if (!chapter) return error(404, 'chapter_not_found', 'Local fixture chapter missing');
          const next = body.chapter_id === 'chapter-1' && body.offset === 0 ? 12000 : null;
          result = ok({ status: scenario === 'ai-unavailable' ? 'unavailable' : 'complete', findings: scenario === 'ai-unavailable' ? '本地模拟未配置' : `仅内存模拟意见：请人工核对 ${body.chapter_id} 偏移 ${body.offset} 的授权与上下文。`, chapter_id: chapter.id, body_sha256: chapter.body_sha256, next_offset: scenario === 'ai-stuck' ? body.offset : next });
        }
      } else if (suffix === `/works/${work.id}/action` && method === 'POST') { work.status = body.action === 'withdraw' ? 'withdrawn' : 'published'; result = ok({ success: true }); }
      else if (/^\/reports\/[^/]+\/decision$/.test(suffix) && method === 'POST') {
        const report = reports.find(item => item.id === suffix.split('/')[2]);
        if (!report || report.status !== 'pending') return error(409, 'report_conflict', 'Local fixture report already resolved');
        if (!['dismiss', 'withdraw'].includes(body.decision)) return error(400, 'invalid_decision', 'Local fixture invalid report decision');
        report.status = body.decision === 'dismiss' ? 'dismissed' : 'withdrawn';
        if (body.decision === 'withdraw') { if (report.comment_id) { comments.get(report.comment_id).deleted = true; work.comments -= 1; } else work.status = 'withdrawn'; }
        result = ok({ success: true });
      }
      else if (/^\/creators\/\d+\/action$/.test(suffix) && method === 'POST') { creators.set(Number(suffix.split('/')[2]), body.action === 'suspend' ? 'suspended' : 'active'); result = ok({ success: true }); }
      if (!result) return error(404, 'not_found', 'Local fixture route not found');
      if (operationId && result.status === 200) receipts.set(operationId, { fingerprint, result: clone(result) });
      return result;
    },
  };
}
