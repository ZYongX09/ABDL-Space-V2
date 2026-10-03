// App 管理的纯数据规则；不能用旧 has_app 推断安装或版本。
export const APP_POLICY_SETTING_KEY = 'app_client_policy';
export const DEFAULT_APP_POLICY = Object.freeze({ enabled: false, deprecated_version_codes: [], block_unversioned: false, update_message: '当前 App 版本已停止支持，请更新到最新版本后继续使用。' });
export const TOTAL_KEYS = ['observed_users', 'versioned_users', 'unversioned_users', 'active_1d', 'active_7d', 'active_30d'];
export const VERSION_KEYS = ['observed_users', 'latest_users', 'active_1d', 'active_7d', 'active_30d'];

export const MAX_VERSION_CODE = 2147483647;
export const MAX_DEPRECATED_CODES = 200;
export const MAX_UPDATE_MESSAGE = 2000;
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const versionInteger = value => positiveInteger(value) && value <= MAX_VERSION_CODE;
const count = value => Number.isSafeInteger(value) && value >= 0;
const validVersion = value => value === null || versionInteger(value);
const invalid = subject => { throw new Error(`${subject}响应格式异常，请重试或联系后端管理员`); };

export function normalizeVersionCodes(input) {
  const tokens = Array.isArray(input) ? input : String(input ?? '').trim().split(/[\s,，;；、]+/).filter(Boolean);
  const values = tokens.map(token => {
    if (typeof token !== 'number' && !/^\d+$/.test(String(token))) throw new Error(`废弃版本号「${token}」无效：只能填写正整数内部版本号`);
    const value = Number(token);
    if (!versionInteger(value)) throw new Error(`废弃版本号「${token}」无效：必须是 1 至 ${MAX_VERSION_CODE} 的正整数`);
    return value;
  });
  const normalized = [...new Set(values)].sort((a, b) => a - b);
  if (normalized.length > MAX_DEPRECATED_CODES) throw new Error(`最多填写 ${MAX_DEPRECATED_CODES} 个不同的废弃版本号`);
  return normalized;
}

export function policyPayload(form) {
  if (typeof form?.enabled !== 'boolean' || typeof form?.block_unversioned !== 'boolean' || typeof form?.update_message !== 'string') throw new Error('策略字段无效');
  if (!form.update_message.trim() || form.update_message.trim().length > MAX_UPDATE_MESSAGE) throw new Error(`更新提示不能为空，且最多 ${MAX_UPDATE_MESSAGE} 个字符`);
  return {
    enabled: form.enabled,
    deprecated_version_codes: normalizeVersionCodes(form.versionText ?? form.deprecated_version_codes),
    block_unversioned: form.block_unversioned,
    update_message: form.update_message.trim(),
  };
}

export function readPolicy(data) {
  if (!data || typeof data.enabled !== 'boolean' || typeof data.block_unversioned !== 'boolean' || typeof data.update_message !== 'string' || !Array.isArray(data.deprecated_version_codes) || !data.deprecated_version_codes.every(versionInteger)) invalid('App 策略');
  return policyPayload(data);
}

export function readStats(data) {
  if (typeof data?.available !== 'boolean') invalid('App 统计');
  if (!data.available) return { available: false, measurement_started_at: data.measurement_started_at ?? null };
  if (!(data.measurement_started_at === null || typeof data.measurement_started_at === 'string') || !TOTAL_KEYS.every(key => count(data.totals?.[key])) || !Array.isArray(data.versions)) invalid('App 统计');
  const seen = new Set();
  for (const row of data.versions) {
    if (!validVersion(row.version_code) || !VERSION_KEYS.every(key => count(row[key])) || seen.has(row.version_code)) invalid('App 统计');
    seen.add(row.version_code);
  }
  return data;
}

export function usersQuery({ version_code = 'all', page = 1, limit = 20, q = '' } = {}) {
  const version = String(version_code);
  if (version !== 'all' && version !== 'missing' && (!/^\d+$/.test(version) || !versionInteger(Number(version)))) throw new Error('版本筛选无效');
  if (!positiveInteger(page) || !positiveInteger(limit)) throw new Error('分页参数无效');
  return new URLSearchParams({ version_code: version === 'all' || version === 'missing' ? version : String(Number(version)), page, limit, q: String(q).trim() }).toString();
}

export function readUsers(data) {
  const p = data?.pagination;
  if (!Array.isArray(data?.users) || !p || !positiveInteger(p.page) || !positiveInteger(p.limit) || !count(p.total) || !count(p.totalPages)) invalid('App 用户列表');
  for (const row of data.users) {
    if (row.id == null || typeof row.username !== 'string' || !validVersion(row.version_code) || typeof row.first_seen_at !== 'string' || typeof row.last_seen_at !== 'string') invalid('App 用户列表');
  }
  return data;
}

export function versionLabel(code) { return code === null ? '未上报版本号' : `内部版本号 ${code}`; }
export function exactCount(value) { return count(value) ? value.toLocaleString('zh-CN') : '—'; }

// 只有最后一个请求能回写，卸载及账户切换同样使旧请求失效。
export function createRequestGate() {
  let generation = 0;
  return {
    begin() { const ticket = ++generation; return () => ticket === generation; },
    invalidate() { generation += 1; },
  };
}
