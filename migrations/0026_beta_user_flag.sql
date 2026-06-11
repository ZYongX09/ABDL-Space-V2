-- ============================================================
-- Migration 0026: 创始成员计划 / 内测预注册用户标记
-- Date: 2026-06-09
-- Description: users 表新增 is_beta_user 与 beta_joined_at 字段
--              用于标记创始成员候选/正式内测用户
-- ============================================================

ALTER TABLE users ADD COLUMN is_beta_user INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN beta_joined_at TEXT;

-- 索引：仅索引内测用户，提升查询效率
CREATE INDEX idx_users_beta ON users(is_beta_user) WHERE is_beta_user = 1;

-- ============================================================
-- 后端接口参考（由 zhx589 在 abdl-space 后端仓库实现）
-- ============================================================
--
-- 1) POST /api/beta/beta-register
--    行为同 /api/auth/register
--    额外写入 is_beta_user = 1, beta_joined_at = datetime('now')
--    返回 user 对象带 is_beta_user: true
--
-- 2) GET /api/beta/info  (可选)
--    Response: {
--      name: "ABDL Space 创始成员计划",
--      version: "v0.1",
--      endsAt: "2026-07-31T23:59:59Z",
--      capacity: 120,
--      used: 87,
--      status: "active" | "full" | "ended"
--    }
--    前端在接口不可用时静默降级，使用 VITE_BETA_* 环境变量
--
-- 3) /api/auth/me 与 /api/users/:id 返回的 user 对象
--    应包含 is_beta_user 字段，供前端 BetaBadge 展示
