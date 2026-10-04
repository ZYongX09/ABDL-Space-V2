/** 仅用于界面；所有管理写入仍须由服务端按当前数据库身份授权。 */
export function isSuperAdmin(user) {
  if (!user || user.role !== 'admin' || String(user.id) !== '1') return false;
  // 新协议严格 boolean，显式 false 或异常类型绝不回退。
  if (Object.hasOwn(user, 'is_super_admin')) return user.is_super_admin === true;
  // 兼容旧 /auth/me；配套服务端必须同样按当前 DB id=1 && role=admin 校验。
  return true;
}

export function adminRoleLabel(user) {
  return isSuperAdmin(user) ? '超级管理员' : user?.role === 'admin' ? '管理员' : '普通用户';
}

export function userActionPolicy(actor, target) {
  const administrator = target?.role === 'admin';
  const protectedId = String(target?.id) === '1';
  return {
    canChangeRole: isSuperAdmin(actor) && !!target && !protectedId,
    canGovern: actor?.role === 'admin' && !!target && !administrator && !protectedId,
    governanceReason: protectedId ? '超级管理员账号受保护，不能封禁、追踪或删除。' : administrator ? '管理员账号受保护，请先由超级管理员撤销管理员角色。' : '',
    nextRole: administrator ? 'user' : 'admin',
    roleActionLabel: administrator ? '撤销管理员' : '提升为管理员',
  };
}

// 字段缺失与显式 null/false 也属于不同会话能力，避免旧协议回退跨会话保留。
export function adminSessionKey(user, token = '') {
  return JSON.stringify([user?.id, user?.role, Object.hasOwn(user || {}, 'is_super_admin'), user?.is_super_admin, token]);
}

export function adminAccessState(user, loading) {
  if (loading) return 'loading';
  if (!user) return 'anonymous';
  return user.role === 'admin' ? 'allowed' : 'denied';
}
