// App 管理的纯数据规则；不能用旧 has_app 推断安装或版本。
export const APP_POLICY_SETTING_KEY = 'app_client_policy';
export const APP_REMINDER_SETTING_KEY = 'app_client_reminder';
export const DEFAULT_APP_REMINDER_MESSAGE = '已有新版本 App，建议更新以获得更好的体验。';
export const DEFAULT_APP_REMINDER = Object.freeze({ enabled: false, version_codes: [], message: DEFAULT_APP_REMINDER_MESSAGE, include_unversioned: true });
export const isReservedAppClientSetting = key => [APP_POLICY_SETTING_KEY, APP_REMINDER_SETTING_KEY].includes(String(key).trim());
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

export function normalizeVersionCodes(input, subject = '废弃') {
  const tokens = Array.isArray(input) ? input : String(input ?? '').trim().split(/[\s,，;；、]+/).filter(Boolean);
  const values = tokens.map(token => {
    if (typeof token !== 'number' && !/^\d+$/.test(String(token))) throw new Error(`${subject}版本号「${token}」无效：只能填写正整数内部版本号`);
    const value = Number(token);
    if (!versionInteger(value)) throw new Error(`${subject}版本号「${token}」无效：必须是 1 至 ${MAX_VERSION_CODE} 的正整数`);
    return value;
  });
  const normalized = [...new Set(values)].sort((a, b) => a - b);
  if (normalized.length > MAX_DEPRECATED_CODES) throw new Error(`最多填写 ${MAX_DEPRECATED_CODES} 个不同的${subject}版本号`);
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

// 旧三字段配置仅在缺少新字段时默认包含未上报版本；显式错误类型不能转换。
const reminderIncludesUnversioned = data => Object.hasOwn(data, 'include_unversioned') ? data.include_unversioned : true;

// 留空 PUT 由后端选择默认文案，始终发送提醒四字段，不带入版本废弃字段。
export function reminderPayload(form) {
  if (typeof form?.enabled !== 'boolean' || typeof form?.message !== 'string') throw new Error('提醒字段无效');
  const includeUnversioned = reminderIncludesUnversioned(form);
  if (typeof includeUnversioned !== 'boolean') throw new Error('包含未上报版本的提醒字段无效：必须是布尔值');
  const message = form.message.trim();
  if (message.length > MAX_UPDATE_MESSAGE) throw new Error(`提醒内容最多 ${MAX_UPDATE_MESSAGE} 个字符`);
  return { enabled: form.enabled, version_codes: normalizeVersionCodes(form.versionText ?? form.version_codes, '提醒'), message, include_unversioned: includeUnversioned };
}

export function readReminder(data) {
  if (!data || typeof data.enabled !== 'boolean' || typeof data.message !== 'string' || !Array.isArray(data.version_codes) || !data.version_codes.every(versionInteger) || typeof reminderIncludesUnversioned(data) !== 'boolean') invalid('App 提醒');
  const reminder = reminderPayload(data);
  return { ...reminder, message: reminder.message || DEFAULT_APP_REMINDER_MESSAGE };
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
