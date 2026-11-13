import { copy, fail, IMAGE, iso, missing, nonempty, ok, rowsForScenario } from './core.js';

export function registerCatalogRoutes({ add }, state, { scenario, now }) {
  const visible = rows => rowsForScenario(scenario(), rows);
  const many = scenario() === 'longlists';
  state.brands = Array.from({ length: many ? 45 : 3 }, (_, index) => ({ id: 701 + index, name: `合成品牌 ${index + 1}`, country: '合成地区', website: '', description: '本地产品资料验收，不对应任何真实商品。', created_at: iso(now() - index * 86400) }));
  state.diapers = Array.from({ length: many ? 75 : 5 }, (_, index) => ({ id: 801 + index, brand: state.brands[index % state.brands.length].name, brand_id: state.brands[index % state.brands.length].id, model: `合成产品 ${index + 1}`, product_type: '纸尿裤', is_baby_diaper: 0, absorbency_mfr: 3000 + index * 100, avg_price: 12.5 + index, description: '虚构产品参数，仅用于管理表单；不构成购买建议。', sizes: [{ size: 'M', waist: '70-95', price: 12.5 }], images: [], created_at: iso(now() - index * 86400) }));
  state.badges = Array.from({ length: many ? 35 : 3 }, (_, index) => ({ key: `fixture_badge_${index + 1}`, name: `合成徽章 ${index + 1}`, description: '本地验收定义，用于颁发、收回、持有人与修改。', color: ['#4E7394', '#A15E7C', '#795500'][index % 3], icon: 'fa-medal', created_at: iso(now()) }));
  state.holders = new Map(state.badges.map(badge => [badge.key, new Set([3, 4])]));
  let sequence = 1000;
  add('diapers', 'GET', '/api/admin/diapers', () => ok({ diapers: visible(state.diapers) }));
  add('diapers', 'POST', '/api/admin/diapers', ({ body }) => {
    if (!nonempty(body?.brand)) return fail(422, 'brand_required');
    const diaper = { ...copy(body), id: ++sequence, created_at: iso(now()), sizes: body.sizes || [], images: body.images || [] };
    state.diapers.push(diaper); return ok({ id: diaper.id, message: '已创建（仅内存）' });
  });
  add('diapers', 'PATCH', '/api/admin/diapers/:id', ({ ids, body }) => {
    const diaper = state.diapers.find(row => String(row.id) === ids.id); if (!diaper) return missing();
    Object.assign(diaper, copy(body), { id: diaper.id }); return ok({ message: '已更新（仅内存）' });
  });
  add('diapers', 'DELETE', '/api/admin/diapers/:id', ({ ids }) => {
    const index = state.diapers.findIndex(row => String(row.id) === ids.id); if (index < 0) return missing();
    state.diapers.splice(index, 1); return ok({ message: '已删除（仅内存）' });
  });
  add('diapers', 'GET', '/api/admin/brands', () => ok({ brands: visible(state.brands) }));
  add('diapers', 'POST', '/api/admin/brands', ({ body }) => {
    if (!nonempty(body?.name)) return fail(422, 'brand_name_required');
    const current = state.brands.find(row => String(row.id) === String(body.id));
    if (current) Object.assign(current, copy(body), { id: current.id });
    else state.brands.push({ ...copy(body), id: ++sequence, created_at: iso(now()) });
    return ok({ message: '品牌已保存（仅内存）' });
  });
  add('diapers', 'DELETE', '/api/admin/brands/:id', ({ ids }) => {
    const index = state.brands.findIndex(row => String(row.id) === ids.id); if (index < 0) return missing();
    state.brands.splice(index, 1); return ok({ message: '已删除（仅内存）' });
  });
  add('badges', 'GET', '/api/admin/badges', () => ok({ badges: visible(state.badges).map(badge => ({ ...badge, holders: state.holders.get(badge.key)?.size || 0 })) }));
  add('badges', 'POST', '/api/admin/badges', ({ body }) => {
    if (!nonempty(body?.key) || !nonempty(body?.name)) return fail(422, 'invalid_badge');
    if (state.badges.some(badge => badge.key === body.key)) return fail(409, 'badge_exists');
    state.badges.push(copy(body)); state.holders.set(body.key, new Set()); return ok({ success: true, key: body.key });
  });
  add('badges', 'PATCH', '/api/admin/badges/:key', ({ ids, body }) => {
    const badge = state.badges.find(row => row.key === ids.key); if (!badge) return missing();
    Object.assign(badge, copy(body), { key: badge.key }); return ok({ success: true });
  });
  add('badges', 'DELETE', '/api/admin/badges/:key', ({ ids }) => {
    const index = state.badges.findIndex(row => row.key === ids.key); if (index < 0) return missing();
    state.badges.splice(index, 1); state.holders.delete(ids.key); return ok({ success: true });
  });
  add('badges', 'GET', '/api/admin/badges/:key/holders', ({ ids }) => {
    const holders = state.holders.get(ids.key); if (!holders) return missing();
    const rows = visible(state.users.filter(user => holders.has(user.id))).map(user => ({ user_id: user.id, username: user.username, avatar: IMAGE, unlocked_at: iso(now() - 86400), acknowledged_at: user.id === 3 ? iso(now()) : null }));
    return ok({ holders: rows, total: rows.length });
  });
  for (const action of ['grant', 'revoke']) add('badges', 'POST', `/api/admin/badges/${action}`, ({ body }) => {
    const holders = state.holders.get(body?.badge_key);
    const user = state.users.find(row => body.user_id ? row.id === body.user_id : row.username === body?.username);
    if (!holders || !user) return missing();
    if (action === 'grant') holders.add(user.id); else holders.delete(user.id);
    return ok({ success: true });
  });
}
