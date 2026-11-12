import { adminSessionKey, isSuperAdmin } from '../pages/admin/access.js';
import { boundedExport, day, expirySeconds, filters, localExpiry, MAX_RECORDS, policyInput, readGeneration, reason, reasonRevision, shanghaiDay, targetEligible, targetInput, TIMEZONE, userId } from './model.js';

export function initialObservationState(now = Date.now()) {
  return { blocked: false, pending: {}, errors: {}, conflicts: {}, policy: null, policyForm: null, targets: null, selected: null, targetForm: null, days: null, ips: null, requests: null, legacy: null, legacyReason: '', selectedIPs: [], actionReason: '', exportReason: '', filters: { day: shanghaiDay(now), method: '', status: '', ipAll: true }, output: null, notice: '', exportProgress: 0 };
}

/** 所有敏感状态只活在本实例内；代次与会话同时检查，abort 失效也不能回填旧响应。 */
export function createUserObservationController({ api, getSession, onChange = () => {}, onRejected = () => {}, now = Date.now, createId = () => crypto.randomUUID(), clipboard = value => navigator.clipboard.writeText(value) }) {
  let state = initialObservationState(now()), disposed = false, epoch = 0;
  const key = adminSessionKey(getSession()?.user, getSession()?.token);
  const jobs = new Map(), operations = new Map();
  const publish = patch => { state = { ...state, ...patch }; if (!disposed) onChange(state); };
  const sessionCurrent = () => !disposed && !state.blocked && isSuperAdmin(getSession()?.user) && key === adminSessionKey(getSession()?.user, getSession()?.token);
  const cancelJob = name => { const job = jobs.get(name); job?.abort.abort(); jobs.delete(name); };
  const abortAll = () => { for (const name of jobs.keys()) cancelJob(name); epoch += 1; };
  const block = () => { abortAll(); operations.clear(); publish({ ...initialObservationState(now()), blocked: true }); };
  const mutationOptions = (name, input, signal) => {
    const signature = `${name}:${JSON.stringify(input)}`;
    if (!operations.has(signature)) operations.set(signature, createId());
    return { signal, operationId: operations.get(signature) };
  };
  async function run(name, work, apply, { scope = false, write = false } = {}) {
    if (!sessionCurrent()) { block(); return false; }
    if (write && [...jobs.keys()].some(value => ['policyWrite', 'targetWrite', 'clearDay', 'legacyWrite', 'export'].includes(value))) return false;
    cancelJob(name);
    const abort = new AbortController(), generation = epoch, selectedId = state.selected?.user?.id;
    const job = { abort }; jobs.set(name, job);
    const current = () => sessionCurrent() && jobs.get(name) === job && (!scope || generation === epoch && selectedId === state.selected?.user?.id);
    publish({ pending: { ...state.pending, [name]: true }, errors: { ...state.errors, [name]: '' }, ...(write ? { notice: '' } : {}) });
    try {
      const result = await work(abort.signal, current);
      if (!current()) return false;
      apply(result); if (write) operations.clear(); return true;
    } catch (error) {
      if (!current()) { if (!sessionCurrent() && !disposed) block(); return false; }
      if (error.status === 401 || error.status === 403) { block(); onRejected(error, key); return false; }
      if (error.name !== 'AbortError') publish({ errors: { ...state.errors, [name]: error.message || '观察请求失败，未确认成功' }, ...(error.status === 409 ? { conflicts: { ...state.conflicts, [name]: true } } : {}) });
      return false;
    } finally {
      if (jobs.get(name) === job) { jobs.delete(name); if (!disposed) publish({ pending: { ...state.pending, [name]: false } }); }
    }
  }
  const selectedId = () => {
    if (!targetEligible(getSession()?.user, state.selected?.user)) throw new Error('只能观察非本人、非管理员且 ID 不为 1 的普通用户');
    return state.selected.user.id;
  };
  const targetRevision = () => state.selected?.target?.revision ?? '0';
  const clearPages = () => { for (const name of ['days', 'ips', 'requests', 'export', 'legacy', 'targetWrite', 'clearDay', 'legacyWrite']) cancelJob(name); publish({ days: null, ips: null, requests: null, legacy: null, selectedIPs: [], legacyReason: '', output: null, exportProgress: 0, pending: {}, errors: {}, conflicts: {} }); };
  const controller = {
    getState: () => { if (!sessionCurrent() && !disposed && !state.blocked) block(); return state; },
    block,
    dispose() { disposed = true; abortAll(); operations.clear(); state = initialObservationState(now()); },
    cancel(name) {
      if (name) { cancelJob(name); publish({ pending: { ...state.pending, [name]: false }, ...(name === 'export' ? { output: null, notice: '已取消导出；不会覆盖剪贴板。若写请求已发出，审计可能已经记录。' } : {}) }); }
      else { abortAll(); publish({ pending: {}, output: null, notice: '已取消进行中的读取；写入结果请重新读取确认。' }); }
    },
    clearOutput() { publish({ output: null }); },
    changePolicy(patch) { if (state.policyForm) publish({ policyForm: { ...state.policyForm, ...patch } }); },
    changeTarget(patch) { if (state.targetForm) publish({ targetForm: { ...state.targetForm, ...patch } }); },
    changeReason(name, value) { if (['actionReason', 'legacyReason', 'exportReason'].includes(name)) publish({ [name]: value, output: null }); },
    selectLegacyIP(ip, checked) { if (!state.legacy?.bans.some(b => b.ip === ip)) return; publish({ selectedIPs: checked ? [...new Set([...state.selectedIPs, ip])].slice(0, 100) : state.selectedIPs.filter(value => value !== ip) }); },
    setFilters(patch) {
      epoch += 1;
      for (const name of ['ips', 'requests', 'export', 'clearDay', 'targetWrite', 'legacyWrite']) cancelJob(name);
      publish({ filters: { ...state.filters, ...patch }, ips: null, requests: null, output: null, pending: {}, errors: {}, notice: '' });
    },
    loadPolicy({ preserve = false } = {}) {
      return run('policy', signal => api.policy({ signal }), result => publish({ policy: result, policyForm: preserve && state.policyForm ? { ...state.policyForm, revision: result.policy.revision } : { ...result.policy, reason: '' }, conflicts: { ...state.conflicts, policyWrite: false }, ...(preserve ? { notice: '已读取最新策略版本，保留您的表单；请对照当前服务端策略后再次确认。' } : {}) }));
    },
    loadTargets(cursor = '') { return run('targets', signal => api.targets({ cursor, limit: 50 }, { signal }), page => publish({ targets: page })); },
    async select(value, { preserve = false } = {}) {
      let id;
      try { id = userId(value); } catch (error) { publish({ errors: { ...state.errors, target: error.message } }); return false; }
      const oldSelected = preserve && state.selected?.user?.id === id ? state.selected : null;
      const oldForm = oldSelected ? state.targetForm : null, oldConflicts = oldSelected ? state.conflicts : {};
      epoch += 1; clearPages(); cancelJob('target');
      publish({ selected: oldSelected, targetForm: oldForm, conflicts: oldConflicts, actionReason: '', exportReason: '', notice: '' });
      const ok = await run('target', signal => api.target(id, { signal }), result => {
        if (result.user.id !== id || !targetEligible(getSession()?.user, result.user) || result.target && result.target.user_id !== id) throw new Error('服务端返回了受保护或不匹配的目标，未显示观察数据');
        const target = result.target;
        publish({ selected: result, conflicts: {}, targetForm: oldForm ? { ...oldForm, revision: target?.revision ?? '0' } : { observe_ip: target?.observe_ip ?? false, observe_requests: target?.observe_requests ?? false, expires: target?.expires_at ? new Date(target.expires_at * 1000 + 8 * 3600000).toISOString().slice(0, 16) : localExpiry(now()), reason: '', revision: target?.revision ?? '0' }, ...(oldForm ? { notice: '已读取最新目标版本并保留表单，请核对现有开关再提交。' } : {}) });
      });
      if (ok && state.selected?.user?.id === id) await Promise.all([controller.loadDays(), controller.loadIPs(), controller.loadRequests()]);
      return ok;
    },
    loadDays(cursor = '') { return run('days', signal => api.days(selectedId(), { cursor, limit: 50 }, { signal }), page => publish({ days: page }), { scope: true }); },
    loadIPs(cursor = '') { return run('ips', signal => api.ips(selectedId(), { ...(state.filters.ipAll ? {} : { day: state.filters.day }), cursor, limit: 50 }, { signal }), page => { if (!state.filters.ipAll && page.items.some(row => row.day !== state.filters.day)) throw new Error('IP 响应日期不匹配，未展示数据'); publish({ ips: page, output: null }); }, { scope: true }); },
    loadRequests(cursor = '') { return run('requests', signal => api.requests(selectedId(), filters({ ...state.filters, cursor, status: state.filters.status === '' ? '' : Number(state.filters.status) }), { signal }), page => { if (page.items.some(row => row.user_id !== state.selected.user.id || shanghaiDay(row.occurred_at) !== state.filters.day)) throw new Error('请求响应目标或日期不匹配，未展示数据'); publish({ requests: page, output: null }); }, { scope: true }); },
    savePolicy() {
      if (state.conflicts.policyWrite) return false;
      return run('policyWrite', signal => {
        if (!state.policy?.schema_available) throw new Error('观察数据表不可用，禁止写入或伪造策略');
        const body = policyInput(state.policyForm);
        return api.savePolicy(body, mutationOptions('policy', body, signal));
      }, result => publish({ policy: { ...state.policy, policy: result.policy }, policyForm: { ...result.policy, reason: '' }, notice: `策略已由服务端确认；审计 ${result.audit_id}。关闭只停止将来采集，不删除历史。` }), { write: true });
    },
    saveTarget({ stop = false } = {}) {
      if (state.conflicts.targetWrite) return false;
      return run('targetWrite', signal => {
        const id = selectedId();
        const form = state.targetForm;
        const body = targetInput({ observe_ip: stop ? false : form.observe_ip, observe_requests: stop ? false : form.observe_requests, expires_at: stop || !form.observe_ip && !form.observe_requests ? undefined : expirySeconds(form.expires), reason: form.reason, revision: form.revision }, now());
        return api.saveTarget(id, body, mutationOptions(`target:${id}`, body, signal));
      }, result => {
        if (result.target.user_id !== state.selected.user.id) throw new Error('服务端目标不匹配，未确认保存成功');
        publish({ selected: { ...state.selected, target: result.target, status: result.status }, targetForm: { ...state.targetForm, observe_ip: result.target.observe_ip, observe_requests: result.target.observe_requests, revision: result.target.revision, reason: '' }, notice: `${stop ? '已停止将来观察，历史没有删除' : '目标配置已保存，不会触发封禁'}；审计 ${result.audit_id}` });
      }, { scope: true, write: true });
    },
    async clearDay() {
      if (state.conflicts.clearDay) return false;
      const ok = await run('clearDay', signal => {
        const id = selectedId(), body = { day: day(state.filters.day), ...reasonRevision({ reason: state.actionReason, revision: targetRevision() }) };
        return api.clearDay(id, body, mutationOptions(`clear:${id}`, body, signal));
      }, result => publish({ selected: { ...state.selected, target: state.selected.target ? { ...state.selected.target, revision: result.revision } : null }, targetForm: { ...state.targetForm, revision: result.revision }, actionReason: '', ips: null, requests: null, days: null, output: null, notice: `已清除所选日 ${result.deleted_requests} 条请求与 ${result.deleted_ips} 条 IP 记录；未停用将来观察，未解封任何 IP。审计 ${result.audit_id}` }), { scope: true, write: true });
      if (ok) await Promise.all([controller.loadDays(), controller.loadIPs(), controller.loadRequests()]);
      return ok;
    },
    loadLegacy() { return run('legacy', signal => api.legacy(selectedId(), { signal }), result => { if (result.user_id !== state.selected.user.id) throw new Error('旧机制目标不匹配'); publish({ legacy: result, selectedIPs: [], conflicts: { ...state.conflicts, legacyWrite: false } }); }, { scope: true }); },
    legacyAction(action) {
      if (!['stop', 'unban'].includes(action) || state.conflicts.legacyWrite) return false;
      return run('legacyWrite', signal => {
        const id = selectedId();
        if (!state.legacy) throw new Error('请先显式读取旧机制状态');
        const body = { ...reasonRevision({ reason: state.legacyReason, revision: state.legacy.rule_revision }), ...(action === 'unban' ? { ips: [...state.selectedIPs] } : {}) };
        if (action === 'unban' && (!body.ips.length || body.ips.some(ip => !state.legacy.bans.some(ban => ban.ip === ip)))) throw new Error('仅可解封明确选择且属于该目标来源的旧机制封禁');
        return api[action === 'stop' ? 'stopLegacy' : 'unbanLegacy'](id, body, mutationOptions(`legacy:${id}:${action}`, body, signal));
      }, result => publish({ legacy: { ...state.legacy, rule_revision: result.rule_revision, ...(action === 'stop' ? { tracking: false } : { bans: state.legacy.bans.filter(ban => !state.selectedIPs.includes(ban.ip)) }) }, selectedIPs: [], legacyReason: '', notice: `${action === 'stop' ? '旧机制已停止将来自动封禁；已有封禁未移除' : `已复核解除 ${result.deleted_bans} 个所选来源封禁，请重读名单确认` }；审计 ${result.audit_id}` }), { scope: true, write: true });
    },
    async copy({ scope = 'current_page', kind = 'requests', format = 'json', confirmed = false } = {}) {
      if (!confirmed) return false;
      publish({ output: null, exportProgress: 0 });
      return run('export', async (signal, current) => {
        const id = selectedId(), selectedDay = day(state.filters.day), why = reason(state.exportReason);
        const chosen = filters({ ...state.filters, status: state.filters.status === '' ? '' : Number(state.filters.status), limit: 200 });
        const meta = { schema_version: 1, user_id: id, scope, timezone: TIMEZONE, day: selectedDay, filters: { method: chosen.method ?? null, status: chosen.status ?? null, ip_day: state.filters.ipAll ? null : selectedDay }, generatedAt: new Date(now()).toISOString(), coverage: 'unknown', continuation: null, truncated: false, audit_ids: [] };
        let requests = [], ips = [];
        if (scope === 'current_page') {
          if (!['requests', 'ips'].includes(kind)) throw new Error('请选择当前请求页或当前 IP 页');
          if (kind === 'ips' && state.filters.ipAll) throw new Error('复制 IP 页前请选择“仅所选日”，避免将全部留存误标为所选日');
          const page = state[kind];
          if (!page) throw new Error('请先成功读取当前页；失败不能当作空页导出');
          const generation = readGeneration(page.generation);
          const body = { day: selectedDay, scope, reason: why, count: page.items.length, generation };
          const result = await api.authorizeExport(id, body, mutationOptions(`copy:${id}:${kind}`, { ...body, items: page.items }, signal));
          if (!current()) return null;
          requests = kind === 'requests' ? page.items : []; ips = kind === 'ips' ? page.items : [];
          meta.kind = kind; meta.audit_ids = [result.audit_id]; meta.continuation = { next_cursor: page.next_cursor }; meta.truncated = !!page.next_cursor;
        } else if (scope === 'day') {
          meta.kind = 'requests_and_ips';
          let cursor = '', count = 0;
          const seen = new Set(), seenEvents = new Set(), seenIPs = new Set();
          do {
            const body = { ...chosen, reason: why, ...(cursor ? { cursor } : {}) };
            const page = await api.exportDay(id, body, mutationOptions(`export:${id}`, body, signal));
            if (!current()) return null;
            if (page.user_id !== id || page.day !== selectedDay) throw new Error('导出目标或日期不匹配，已拒绝输出');
            if (page.items.some(row => row.user_id !== id || shanghaiDay(row.occurred_at) !== selectedDay) || page.ips.some(row => row.day !== selectedDay)) throw new Error('导出行不属于当前目标或日期，已拒绝输出');
            for (const row of page.items) { if (seenEvents.has(row.event_id)) throw new Error('导出事件重复，已拒绝拼接不稳定快照'); seenEvents.add(row.event_id); }
            for (const row of page.ips) { const ipKey = `${row.day}:${row.ip}`; if (seenIPs.has(ipKey)) throw new Error('导出 IP 重复，已拒绝拼接不稳定快照'); seenIPs.add(ipKey); }
            if (count && (page.generated_at !== meta.generated_at || page.coverage !== meta.coverage)) throw new Error('导出快照发生变化，已拒绝拼接不同快照');
            meta.generated_at = page.generated_at; meta.coverage = page.coverage; meta.audit_ids.push(page.audit_id);
            requests.push(...page.items); ips.push(...page.ips); count += 1;
            meta.continuation = { page_cursor: cursor || null, next_cursor: page.next_cursor, page_review_required: false };
            meta.truncated = page.truncated;
            const bounded = boundedExport({ ...meta, requests, ips }, format);
            publish({ exportProgress: bounded.count });
            if (bounded.count < requests.length + ips.length) {
              // 有界输出会先保留 IP；不能只给最后页游标而跳过前面被字节/条数限制移出的请求。
              // 明确要求从首快照页重审并按 event_id / day+ip 去重续传，绝不声称 next_cursor 能无损续传。
              meta.truncated = true;
              meta.continuation = { ...meta.continuation, page_review_required: true, restart_required: true, resume_strategy: 'restart_snapshot_and_deduplicate_event_id_day_ip', returned_next_cursor: page.next_cursor, next_cursor: null };
              break;
            }
            if (requests.length + ips.length >= MAX_RECORDS || count >= 26) { meta.truncated = !!page.next_cursor || page.truncated; break; }
            if (page.next_cursor && seen.has(page.next_cursor)) throw new Error('导出游标未前进，已中止且未复制不完整结果');
            if (page.next_cursor) seen.add(page.next_cursor);
            cursor = page.next_cursor;
          } while (cursor);
        } else throw new Error('不支持的导出范围');
        const output = boundedExport({ ...meta, ips, requests }, format);
        if (!current()) return null;
        try {
          await clipboard(output.text);
          if (current()) return { ...output, copied: true, text: '', scope, format };
        } catch {
          if (current()) return { ...output, copied: false, scope, format };
        }
        return null;
      }, output => { if (output) publish({ output, notice: output.copied ? `已复制${output.scope === 'day' ? '所选日有界导出' : '当前页'}（${output.count} 条）。${output.truncated ? '输出有截断或后续页，请检查 continuation 与 coverage。' : '仅代表已记录数据，不代表全部用户行为。'}` : '剪贴板不可用。审计已完成，请在下方只读文本框中手动选择复制，或清空取消。' }); }, { scope: true, write: true });
    },
  };
  return controller;
}
