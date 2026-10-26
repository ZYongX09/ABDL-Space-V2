import { randomInt } from 'node:crypto';

/** 仅管理查询的内存 fetch fixture：未知路径直接报错，绝不透传、代理或访问生产服务。 */
export function createRegistrationGuardFixture({ now = Date.now } = {}) {
  const users = new Map([
    ['fixture-super', { id: 1, role: 'admin', is_super_admin: true }],
    ['fixture-admin', { id: 2, role: 'admin', is_super_admin: false }],
    ['fixture-user', { id: 3, role: 'user', is_super_admin: false }],
  ]);
  const codes = new Map(), calls = [];
  const response = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  return {
    calls, users,
    seed(email, type, seconds = 300) {
      const entry = { email, type, code: String(randomInt(100000, 1000000)), expires_at: Math.floor(now() / 1000) + seconds };
      codes.set(`${email}:${type}`, entry);
      return entry;
    },
    async fetch(url, options = {}) {
      const path = new URL(url, 'http://fixture.invalid').pathname;
      if (path !== '/api/admin/security/test-verification-code') throw new Error('fixture 阻止未知网络请求');
      options.signal?.throwIfAborted();
      calls.push({ url: String(url), options });
      const body = JSON.parse(options.body);
      const actor = users.get(options.headers.Authorization?.replace(/^Bearer /, ''));
      if (!actor) return response({ error: '未登录' }, 401);
      if (actor.id !== 1 || actor.role !== 'admin' || actor.is_super_admin !== true) return response({ error: '仅超级管理员', code: 'SUPERADMIN_REQUIRED' }, 403);
      if (options.method !== 'POST' || Object.keys(body).sort().join(',') !== 'email,type' || !/^[a-z0-9][a-z0-9._+-]{0,63}@test\.top$/.test(body.email) || !['register', 'reset', 'bind'].includes(body.type)) return response({ error: '无效输入' }, 400);
      const code = codes.get(`${body.email}:${body.type}`);
      if (!code || code.expires_at * 1000 <= now()) {
        codes.delete(`${body.email}:${body.type}`);
        return response({ error: '测试验证码不存在或已过期', code: 'VERIFICATION_NOT_FOUND' }, 400);
      }
      return response(code);
    },
  };
}
