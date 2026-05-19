// ============================================================
// 邮件验证路由 — 给朋友集成到 Hono Worker
// ============================================================
// 使用方式：import { emailRoutes } from './email-routes';
//          app.route('/api', emailRoutes);
// ============================================================

import { Hono } from 'hono';

// 类型声明（根据实际环境调整）
interface Env {
  DB: D1Database;
  RESEND_API_KEY: string;
}

interface Variables {
  userId?: number;
  user?: any;
}

export const emailRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// ============================================================
// 工具函数
// ============================================================

/** 生成 6 位验证码 */
function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** 发送邮件（Resend API） */
async function sendEmail(to: string, subject: string, html: string, apiKey: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'ABDL Space <admin@abdl-space.top>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend API error: ${res.status} ${err}`);
  }
  return res.json();
}

/** 邮箱格式验证 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================
// POST /api/auth/send-code — 发送验证码
// ============================================================
// Body: { email, type: 'register' | 'bind' | 'reset' }
// - register: 不需要登录
// - bind: 需要登录（Authorization header）
// - reset: 不需要登录
// - 同一邮箱 60 秒内不能重发
// - 同一邮箱未登录类型累计请求不超过 5 次，超限禁止
// ============================================================
emailRoutes.post('/auth/send-code', async (c) => {
  try {
    const body = await c.req.json<{ email: string; type: string }>();
    const { email, type } = body;

    if (!email || !isValidEmail(email)) {
      return c.json({ error: '请输入有效的邮箱地址' }, 400);
    }
    if (!['register', 'bind', 'reset'].includes(type)) {
      return c.json({ error: '无效的验证码类型' }, 400);
    }

    const db = c.env.DB;

    // bind 类型需要登录
    if (type === 'bind') {
      const authHeader = c.req.header('Authorization');
      if (!authHeader) return c.json({ error: '请先登录' }, 401);
      // 验证 token（复用现有中间件逻辑，这里简化处理）
      // 实际应复用项目的 auth 中间件
    }

    // 检查该邮箱累计请求次数（未使用的记录）
    const countResult = await db.prepare(
      `SELECT COUNT(*) as cnt FROM email_verifications 
       WHERE email = ? AND type = ? AND used = 0 AND expires_at > datetime('now')`
    ).bind(email, type).first<{ cnt: number }>();

    if (countResult && countResult.cnt >= 5) {
      return c.json({ error: '该邮箱验证码请求次数已达上限，请稍后再试' }, 429);
    }

    // 检查 60 秒内是否已发送
    const recent = await db.prepare(
      `SELECT id FROM email_verifications 
       WHERE email = ? AND type = ? AND created_at > datetime('now', '-60 seconds')
       ORDER BY id DESC LIMIT 1`
    ).bind(email, type).first();

    if (recent) {
      return c.json({ error: '请等待 60 秒后再发送' }, 429);
    }

    // 作废旧的未使用验证码
    await db.prepare(
      `UPDATE email_verifications SET used = 1 
       WHERE email = ? AND type = ? AND used = 0`
    ).bind(email, type).run();

    // 生成新验证码
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await db.prepare(
      `INSERT INTO email_verifications (user_id, email, code, type, expires_at, request_count)
       VALUES (?, ?, ?, ?, ?, 1)`
    ).bind(null, email, code, type, expiresAt).run();

    // 发送邮件
    const subjects: Record<string, string> = {
      register: '【ABDL Space】注册验证码',
      bind: '【ABDL Space】邮箱绑定验证码',
      reset: '【ABDL Space】密码重置验证码',
    };

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #333; margin: 0;">ABDL Space</h2>
        </div>
        <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; text-align: center;">
          <p style="color: #666; font-size: 14px; margin: 0 0 12px;">您的验证码为：</p>
          <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #333; font-family: monospace;">${code}</div>
          <p style="color: #999; font-size: 12px; margin: 16px 0 0;">验证码 5 分钟内有效，请勿泄露给他人</p>
        </div>
        <p style="color: #bbb; font-size: 11px; text-align: center; margin-top: 24px;">如非本人操作，请忽略此邮件</p>
      </div>
    `;

    await sendEmail(email, subjects[type], html, c.env.RESEND_API_KEY);

    return c.json({ message: '验证码已发送' });
  } catch (err: any) {
    console.error('send-code error:', err);
    return c.json({ error: '发送验证码失败，请稍后再试' }, 500);
  }
});

// ============================================================
// POST /api/auth/register — 注册（新增 code 参数）
// ============================================================
// Body: { username, password, email, code }
// - 验证码校验通过后才创建用户
// - 注册即绑定邮箱
// ============================================================
emailRoutes.post('/auth/register', async (c) => {
  try {
    const body = await c.req.json<{
      username: string; password: string; email: string; code: string;
    }>();
    const { username, password, email, code } = body;

    if (!username || !password || !email || !code) {
      return c.json({ error: '请填写所有字段' }, 400);
    }
    if (!isValidEmail(email)) {
      return c.json({ error: '请输入有效的邮箱地址' }, 400);
    }
    if (password.length < 8) {
      return c.json({ error: '密码至少 8 位' }, 400);
    }

    const db = c.env.DB;

    // 验证码校验
    const record = await db.prepare(
      `SELECT id FROM email_verifications 
       WHERE email = ? AND code = ? AND type = 'register' AND used = 0 
       AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`
    ).bind(email, code).first();

    if (!record) {
      return c.json({ error: '验证码无效或已过期' }, 400);
    }

    // 标记验证码已使用
    await db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?')
      .bind(record.id).run();

    // 检查用户名是否已存在
    const existing = await db.prepare('SELECT id FROM users WHERE username = ?')
      .bind(username).first();
    if (existing) {
      return c.json({ error: '用户名已被使用' }, 409);
    }

    // 检查邮箱是否已被绑定
    const emailTaken = await db.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email).first();
    if (emailTaken) {
      return c.json({ error: '该邮箱已被注册' }, 409);
    }

    // 创建用户（密码哈希逻辑复用项目现有的 bcrypt/hash）
    // 这里示意，实际应复用项目的密码哈希函数
    const passwordHash = await hashPassword(password); // 需替换为项目实际函数

    const result = await db.prepare(
      `INSERT INTO users (username, password_hash, email, role, created_at)
       VALUES (?, ?, ?, 'user', datetime('now'))`
    ).bind(username, passwordHash, email).run();

    const userId = result.meta.last_row_id;

    // 生成 token（复用项目现有的 JWT 逻辑）
    const token = await generateToken(userId); // 需替换为项目实际函数

    return c.json({
      token,
      user: { id: userId, username, email, role: 'user' },
    });
  } catch (err: any) {
    console.error('register error:', err);
    return c.json({ error: '注册失败，请稍后再试' }, 500);
  }
});

// ============================================================
// POST /api/auth/reset-password — 找回密码
// ============================================================
// Body: { email, code, newPassword }
// ============================================================
emailRoutes.post('/auth/reset-password', async (c) => {
  try {
    const body = await c.req.json<{
      email: string; code: string; newPassword: string;
    }>();
    const { email, code, newPassword } = body;

    if (!email || !code || !newPassword) {
      return c.json({ error: '请填写所有字段' }, 400);
    }
    if (newPassword.length < 8) {
      return c.json({ error: '密码至少 8 位' }, 400);
    }

    const db = c.env.DB;

    // 验证码校验
    const record = await db.prepare(
      `SELECT id FROM email_verifications 
       WHERE email = ? AND code = ? AND type = 'reset' AND used = 0 
       AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`
    ).bind(email, code).first();

    if (!record) {
      return c.json({ error: '验证码无效或已过期' }, 400);
    }

    // 标记验证码已使用
    await db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?')
      .bind(record.id).run();

    // 查找用户
    const user = await db.prepare('SELECT id FROM users WHERE email = ?')
      .bind(email).first<{ id: number }>();

    if (!user) {
      return c.json({ error: '该邮箱未注册' }, 404);
    }

    // 更新密码
    const passwordHash = await hashPassword(newPassword);
    await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(passwordHash, user.id).run();

    return c.json({ message: '密码已重置，请重新登录' });
  } catch (err: any) {
    console.error('reset-password error:', err);
    return c.json({ error: '重置密码失败，请稍后再试' }, 500);
  }
});

// ============================================================
// POST /api/auth/bind-email — 绑定/换绑邮箱（需登录）
// ============================================================
// Body: { email, code }
// 需要 Authorization header
// ============================================================
emailRoutes.post('/auth/bind-email', async (c) => {
  try {
    // 需要登录（复用项目的 auth 中间件获取 userId）
    const userId = c.get('userId'); // 假设 auth 中间件已设置
    if (!userId) return c.json({ error: '请先登录' }, 401);

    const body = await c.req.json<{ email: string; code: string }>();
    const { email, code } = body;

    if (!email || !isValidEmail(email)) {
      return c.json({ error: '请输入有效的邮箱地址' }, 400);
    }
    if (!code) {
      return c.json({ error: '请输入验证码' }, 400);
    }

    const db = c.env.DB;

    // 验证码校验
    const record = await db.prepare(
      `SELECT id FROM email_verifications 
       WHERE email = ? AND code = ? AND type = 'bind' AND used = 0 
       AND expires_at > datetime('now')
       ORDER BY id DESC LIMIT 1`
    ).bind(email, code).first();

    if (!record) {
      return c.json({ error: '验证码无效或已过期' }, 400);
    }

    // 标记验证码已使用
    await db.prepare('UPDATE email_verifications SET used = 1 WHERE id = ?')
      .bind(record.id).run();

    // 检查邮箱是否已被其他用户绑定
    const emailTaken = await db.prepare(
      'SELECT id FROM users WHERE email = ? AND id != ?'
    ).bind(email, userId).first();

    if (emailTaken) {
      return c.json({ error: '该邮箱已被其他用户绑定' }, 409);
    }

    // 更新邮箱
    await db.prepare('UPDATE users SET email = ? WHERE id = ?')
      .bind(email, userId).run();

    return c.json({ message: '邮箱绑定成功' });
  } catch (err: any) {
    console.error('bind-email error:', err);
    return c.json({ error: '绑定邮箱失败，请稍后再试' }, 500);
  }
});
