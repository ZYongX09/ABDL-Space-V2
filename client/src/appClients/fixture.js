// 仅供 Node 本地测试服务器导入，不接入生产入口或鉴权代码。
import { DEFAULT_APP_POLICY, policyPayload } from './model.js';

const START = '2026-10-01T00:00:00Z';
const NOW = Date.parse('2026-10-03T12:00:00Z');
const user = id => ({ id, username: `fixture_${String(id).padStart(2, '0')}`, display_name: `本地测试用户 ${id}` });
const pair = (id, version_code, age) => ({ ...user(id), version_code, first_seen_at: START, last_seen_at: new Date(NOW - age * 3600000).toISOString() });
const pairs = [
  ...Array.from({ length: 26 }, (_, i) => pair(i + 1, 100, i + 10)),
  ...Array.from({ length: 6 }, (_, i) => pair(i + 27, null, i + 20)),
  ...[1, 2, 3, 4, 5, 6, 7, 27, 28, ...Array.from({ length: 14 }, (_, i) => i + 33)].map((id, i) => pair(id, 200, i)),
];
const latest = [...pairs.reduce((map, row) => {
  if (!map.has(row.id) || row.last_seen_at > map.get(row.id).last_seen_at) map.set(row.id, row);
  return map;
}, new Map()).values()];
const observed = rows => new Set(rows.map(row => row.id)).size;
const activity = rows => Object.fromEntries([1, 7, 30].map(days => [`active_${days}d`, observed(rows.filter(row => Date.parse(row.last_seen_at) >= NOW - days * 86400000))]));

export function createAppClientsFixture(initialScenario = 'normal') {
  let scenario = initialScenario;
  let policy = { ...DEFAULT_APP_POLICY, deprecated_version_codes: [100] };
  return {
    setScenario(value) { scenario = value; },
    getScenario() { return scenario; },
    delay(path, query) { return scenario === 'slow' && path.endsWith('/users') ? (query.get('version_code') === '100' ? 1500 : 100) : 0; },
    respond(path, method, query = new URLSearchParams(), body = null) {
      if (path === '/api/auth/me') return { status: 200, data: { id: 999, username: '本地测试管理员', role: 'admin' } };
      if (path === '/api/admin/beta-mode') return { status: 200, data: { enabled: false, allowedRoutes: [], message: '' } };
      if (path === '/api/admin/settings') return { status: 200, data: { settings: [{ key: 'app_client_policy', value: JSON.stringify(policy), updated_at: START }, { key: 'site_name', value: '本地测试站点', updated_at: START }] } };
      if (path === '/api/admin/blocked-emails') return { status: 200, data: { emails: [] } };
      if (path === '/api/admin/stats/overview') return { status: 200, data: { totals: { users: 46, appUsers: 46 }, today: {}, yesterday: {}, week: {}, prevWeek: {}, pending: {}, provinces: [], topBadges: [], recentUsers: [], recentPosts: [] } };
      if (path === '/api/admin/stats/trends') return { status: 200, data: { days: Number(query.get('days') || 30), series: {} } };
      if (!path.startsWith('/api/admin/app-clients/')) return { status: 404, data: { error: '本地 fixture 未定义此接口；不会访问真实后端' } };
      if (scenario === 'errors') return { status: 503, data: { error: '本地模拟：接口暂时不可用' } };
      if (path.endsWith('/policy')) {
        if (scenario === 'unavailable') return { status: 503, data: { error: '本地模拟：App 策略存储不可用，未确认已保存策略' } };
        if (method === 'PUT') {
          if (scenario === 'save-error') return { status: 500, data: { error: '本地模拟：策略保存失败' } };
          try { policy = policyPayload(body); } catch (error) { return { status: 400, data: { error: error.message } }; }
        }
        return { status: 200, data: structuredClone(policy) };
      }
      if (path.endsWith('/stats')) {
        if (scenario === 'unavailable') return { status: 200, data: { available: false, measurement_started_at: null, totals: null, versions: [] } };
        const rows = scenario === 'empty' ? [] : pairs;
        const mostRecent = scenario === 'empty' ? [] : latest;
        return { status: 200, data: {
          available: true, measurement_started_at: START,
          totals: { observed_users: observed(rows), versioned_users: observed(rows.filter(row => row.version_code !== null)), unversioned_users: observed(rows.filter(row => row.version_code === null)), ...activity(rows) },
          versions: [200, 100, null].filter(code => rows.some(row => row.version_code === code)).map(code => {
            const versionRows = rows.filter(row => row.version_code === code);
            return { version_code: code, observed_users: observed(versionRows), latest_users: observed(mostRecent.filter(row => row.version_code === code)), ...activity(versionRows) };
          }),
        } };
      }
      if (path.endsWith('/users')) {
        if (scenario === 'unavailable') return { status: 503, data: { error: '本地模拟：观测迁移未完成' } };
        const version = query.get('version_code') || 'all';
        const q = (query.get('q') || '').toLowerCase();
        const page = Number(query.get('page') || 1), limit = Number(query.get('limit') || 20);
        const rows = (scenario === 'empty' ? [] : version === 'all' ? latest : pairs.filter(row => row.version_code === (version === 'missing' ? null : Number(version))))
          .filter(row => `${row.username} ${row.display_name}`.toLowerCase().includes(q)).sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at) || a.id - b.id);
        return { status: 200, data: { users: rows.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: rows.length, totalPages: Math.ceil(rows.length / limit) } } };
      }
      return { status: 404, data: { error: '未定义本地 fixture 接口' } };
    },
  };
}
