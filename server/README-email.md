# 邮件验证后端代码

> 给朋友集成到 `zhx589/abdl-space` 的 Hono Worker 中

## 1. 数据库迁移（D1）

在 D1 数据库执行以下 SQL：

```sql
CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL,       -- 'register' | 'bind' | 'reset'
  used INTEGER DEFAULT 0,
  request_count INTEGER DEFAULT 1,  -- 同一邮箱累计请求次数
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_email_verifications_code ON email_verifications(email, code, type);
```

## 2. 环境变量（Worker Secrets）

```
RESEND_API_KEY=re_xxxxxxxx
```

## 3. API 接口

见 `email-routes.ts`，注册到 Hono app：
```ts
import { emailRoutes } from './email-routes';
app.route('/api', emailRoutes);
```

## 4. 前端调用

- 发送验证码：`POST /api/auth/send-code`
- 注册（带验证码）：`POST /api/auth/register`（新增 `code` 字段）
- 找回密码：`POST /api/auth/reset-password`
- 绑定/换绑邮箱：`POST /api/auth/bind-email`
