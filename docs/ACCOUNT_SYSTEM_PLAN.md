# ABDL Space v2 — 账号体系升级方案 v4.6

> 最终版 · 2026-06-08 · 经 bug-reviewer 两轮审查 + 另一 AI 三轮建议

---

## 一、等级制度（Lv.1 ~ Lv.7）

| 等级 | 经验 | 签到倍率 | 积分倍率 |
|------|------|----------|----------|
| Lv.1 | 0 | ×1.0 | ×1.0 |
| Lv.2 | 100 | ×1.1 | ×1.05 |
| Lv.3 | 300 | ×1.2 | ×1.15 |
| Lv.4 | 600 | ×1.3 | ×1.15 |
| Lv.5 | 1000 | ×1.5 | ×1.20 |
| Lv.6 | 1500 | ×1.8 | ×1.30 |
| Lv.7 | 2100 | ×2.0 | ×1.50 |

- 所有功能注册即用，等级只带来数值加成
- 数字命名
- 等级由经验值实时计算，允许降级
- 经验缓存使用已有 `experience` 表（current_exp / total_exp / current_level）
- `experience` 表新增字段：`newbie_rating_bonus_count INT DEFAULT 0`（新手评价奖励计数）
- `experience` 表新增字段：`current_streak INT DEFAULT 0`、`last_checkin_date TEXT`

---

## 二、评价权重（后期扩展）

**当前未使用**，预留给未来评分算法升级。

公式：`权重 = 1.0 + min(评价数量 / 100, 0.3)`

**评分算法不变**：保留贝叶斯 + 维度权重（`bayesianAverage` + `dimensionWeightedScore` + `computeAvgScore`），不叠加评价数量权重。

**未来用途**：当评分算法升级时，可用此权重对高等级评价者的评分做加权处理。当前阶段不改 `diapers.ts` 等文件的 SQL。

---

## 三、经验值获取

| 行为 | 经验 | 备注 |
|------|------|------|
| 每日签到 | +10 | 每日 1 次 |
| 评价纸尿裤 | +30 | 删评扣回，每日最多 2 条获奖 |
| 新手评价额外 | +5 | 前 3 条，原子计数防竞态 |
| 发帖 | +10 | 删帖扣回 |
| 评论 | +5 | 删除扣回 |
| 收到点赞 | +3 | 内容删除时连锁扣回，每日上限 30 经验（10 赞） |
| 完善个人资料 | +50 | 一次性 |
| 邀请注册 | +50 | 邀请人得 |
| 被邀请人注册 | +10 | 注册即得 |

### 新手评价 +5 防竞态

- `experience.newbie_rating_bonus_count` 原子自增
- `UPDATE experience SET newbie_rating_bonus_count = newbie_rating_bonus_count + 1 WHERE user_id = ? AND newbie_rating_bonus_count < 3`
- affected rows = 1 才发 +5
- `exp_logs` 写 `source_type='rating'`, `source_id=<rating_id>`，删评时扣回

### 评价防刷

- 每日上限：每日最多 2 条评价获奖（按条数卡，不按金额），查 `exp_logs WHERE type='rating' AND created_at >= today`
- `ratings` 表加 `rewarded INT DEFAULT 0`，发奖后置 1
- 删评后重新评价同一款，`rewarded` 不重置（已拿过不重发）
- 评价必须有 review 文本（>10 字）才发奖
- 24h 内改评不重发奖励，24h 后只能删评重建

---

## 四、积分获取（受等级倍率加成）

| 行为 | 基础积分 | 备注 |
|------|----------|------|
| 每日签到 | 10 × 等级倍率 | 连续 7 天 +20，30 天 +100 |
| 评价纸尿裤 | 10 | 删评扣回，每日最多 2 条获奖 |
| 发帖 | 3 | 删帖扣回 |
| 评论 | 2 | 删除扣回 |
| 收到点赞 | 3 | 内容删除时连锁扣回，靠 toggle 约束防刷 |
| 邀请注册成功 | 20 | 邀请人得 |
| 被邀请人首次评价 | +50 | per-user 标志防刷 |

### 被邀请人积分防刷

- `users.invite_first_rating_bonus_at DATETIME`
- 评价时 `UPDATE users SET invite_first_rating_bonus_at = ? WHERE user_id = ? AND invite_first_rating_bonus_at IS NULL`
- affected rows = 1 才发 +50 积分
- 删评不撤销（已拿过就拿过）

---

## 五、核心实现规则

| 规则 | 实现 |
|------|------|
| 时区 | `shared/time.js`：`Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' })` 格式化，不用 `Date.now() + offset` |
| 积分扣回 | `balance = MAX(0, balance - deduction)`，不允许负数 |
| 经验扣回 | 允许降级，应用层先 SELECT → 计算 new_level → 传参 UPDATE |
| 连锁扣回 | 扣创作者从该内容获得的全部经验（行为基础 + 收到的点赞经验），不级联扣回点赞者。一条汇总流水 |
| 点赞取消 | 扣回（type='unlike'），取消后 5 分钟内不可重新点赞同一内容（单向冷却，点赞后可随时取消） |
| 改评 | 24h 内改评不重发奖励，24h 后只能删评重建 |
| 事务 | 写流水 + 更新余额用 `db.batch()` 原子操作 |
| streak | `experience` 表存 `current_streak` + `last_checkin_date`，签到时 SQL 增量更新 O(1) |
| 等级阈值 | 前端 `levels.json`，后端 `src/lib/level.ts`，CI 检查 drift |
| amount 符号 | `> 0` 获得，`< 0` 扣回，`CHECK (amount != 0)` |

---

## 六、积分用途

| 用途 | 积分 | 类型 | 初期 |
|------|------|------|------|
| 自定义头像框 | 200 | 装饰性（永久） | ✅ |
| 自定义称号 | 500 | 装饰性（永久） | ✅ |
| 补签卡 | 50 | 消耗型（断签次日 23:59:59 前，保 streak + 计入连续奖励窗口，不补发当天签到积分） | ✅ |
| 帖子置顶 24h | 1000 | 功能性（限时） | 预留 |
| 高级筛选器 | 200 | 功能性（永久） | 预留 |

---

## 七、徽章系统

**仅建表 + 预留 API**，具体徽章定义和触发逻辑后期用户自行添加。

- `badges` 表：徽章定义（`condition_type` + `condition_value`，`icon` 存图标名如 `fa-star`）
- `user_badges` 表：用户已解锁徽章
- API：获取列表 / 设置展示（后端校验 ≤3）
- 初期不写触发逻辑

---

## 八、邀请码制度（注册选填）

- 格式：`ABDL-XXXX-XXXX`，CHECK 约束校验
- 注册后自动生成 3 个，每码限用 1 次，90 天有效期，每用户上限 10 个
- 禁止自邀，记录使用 IP（加盐 Hash），外键 `ON DELETE SET NULL`
- 只在注册时消费，无独立使用接口
- 过期惰性过滤，不清理

**奖励**：
- 被邀请人：注册时 +10 经验，首次评价后 +50 积分（per-user 标志）
- 邀请人：+50 经验 + 20 积分

---

## 九、每日签到

- 基础：10 积分 × 等级倍率
- 连续签到额外：7 天 +20，30 天 +100
- 并发安全：`INSERT OR IGNORE`
- 拆两条流水：`type='checkin'` + `type='checkin_streak_bonus'`
- streak 动态计算（Worker JS，查最近 31 天，`Intl` 时区）
- 补签：`daily_checkins` 插入一条 `type='makeup'` 记录，streak 计算时视同签到，计入连续奖励窗口，不补发当天签到积分

---

## 十、数据库变更

### 新建表

```sql
-- 积分主表
CREATE TABLE IF NOT EXISTS points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 积分流水
CREATE TABLE IF NOT EXISTS point_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL CHECK (amount != 0),
  type TEXT NOT NULL,
  related_id INTEGER,
  source_type TEXT,
  source_id INTEGER,
  description TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 经验流水
CREATE TABLE IF NOT EXISTS exp_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL CHECK (amount != 0),
  type TEXT NOT NULL,
  related_id INTEGER,
  source_type TEXT,
  source_id INTEGER,
  description TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 邀请码
CREATE TABLE IF NOT EXISTS invite_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL
    CHECK (code GLOB 'ABDL-[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]-[A-Z0-9][A-Z0-9][A-Z0-9][A-Z0-9]'),
  creator_id INTEGER,
  used_by INTEGER,
  used_at DATETIME,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
);

-- 签到记录（无 streak 列，动态计算）
CREATE TABLE IF NOT EXISTS daily_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  checkin_date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'normal',  -- 'normal' | 'makeup'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, checkin_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 徽章定义（预留）
CREATE TABLE IF NOT EXISTS badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  description TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  condition_value INTEGER NOT NULL
);

-- 用户徽章（预留）
CREATE TABLE IF NOT EXISTS user_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  badge_key TEXT NOT NULL,
  unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  displayed INTEGER DEFAULT 0,
  UNIQUE(user_id, badge_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### 已有表变更

```sql
-- users 表：被邀请人首次评价标志
ALTER TABLE users ADD COLUMN invite_first_rating_bonus_at DATETIME;

-- experience 表：新手评价奖励计数
ALTER TABLE experience ADD COLUMN newbie_rating_bonus_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE experience ADD COLUMN current_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE experience ADD COLUMN last_checkin_date TEXT;

-- ratings 表：奖励标志
ALTER TABLE ratings ADD COLUMN rewarded INTEGER NOT NULL DEFAULT 0;

-- 积分/经验流水表加 idempotency_key
ALTER TABLE point_logs ADD COLUMN idempotency_key TEXT;
ALTER TABLE exp_logs ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_point_logs_idem ON point_logs(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_exp_logs_idem ON exp_logs(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
```

### 索引

```sql
CREATE INDEX IF NOT EXISTS idx_points_user ON points(user_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_user ON point_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exp_logs_user ON exp_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_point_logs_source ON point_logs(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_exp_logs_source ON exp_logs(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_type ON point_logs(user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invite_codes_creator ON invite_codes(creator_id);
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);
CREATE INDEX IF NOT EXISTS idx_invite_codes_used_by ON invite_codes(used_by) WHERE used_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invite_codes_active ON invite_codes(creator_id, expires_at) WHERE used_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_daily_checkins_user ON daily_checkins(user_id, checkin_date);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_displayed ON user_badges(user_id) WHERE displayed = 1;
```

---

## 十一、新增 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/checkin | 每日签到（返回基础+奖励两条流水） |
| GET | /api/checkin/status | 签到状态（JS 动态算 streak） |
| GET | /api/users/:id/points | 积分余额 |
| GET | /api/users/:id/points/logs | 积分流水（?page=1&limit=20，默认 created_at DESC） |
| GET | /api/users/:id/exp/logs | 经验流水（?page=1&limit=20，默认 created_at DESC） |
| GET | /api/users/:id/level | 等级详情（含 current_exp / total_exp） |
| GET | /api/users/:id/badges | 用户徽章列表 |
| POST | /api/users/:id/badges/display | 设置展示（≤3） |
| POST | /api/invite/generate | 生成邀请码（上限 10） |
| GET | /api/invite/my-codes | 我的邀请码 |
| POST | /api/checkin/makeup | 补签（消耗 50 积分，断签次日 23:59:59 前） |
| POST | /api/auth/register | 增加 invite_code 字段 |
| GET | /api/sync/bootstrap?since= | 移动端增量同步 |

### 返回值规范

涉及经验/积分变动的接口（含注册），返回值增加 `rewards` 字段：

```json
{
  "success": true,
  "data": { ... },
  "rewards": {
    "total_exp": 35,
    "total_points": 10,
    "level_change": { "from": 3, "to": 4 },
    "details": [
      { "type": "rating", "amount": 30, "currency": "exp" },
      { "type": "newbie_rating", "amount": 5, "currency": "exp" },
      { "type": "rating", "amount": 10, "currency": "points" }
    ]
  }
}
```

分页响应结构：

```json
{
  "logs": [...],
  "pagination": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

---

## 十二、前端改动

| 页面/组件 | 改动 |
|-----------|------|
| ProfilePageV2 | 头像下 Lv.X + 经验条 + 积分余额 + 徽章展示位 |
| LevelBadge.jsx | 新增 等级徽章 |
| ExpBar.jsx | 新增 经验进度条 |
| CheckInButton.jsx | 新增 签到按钮 |
| BadgeGallery.jsx | 新增 徽章画廊（预留） |
| PointsCard.jsx | 新增 积分余额卡片 |
| InvitePage.jsx | 新增 邀请码管理 /invite |
| PointsPage.jsx | 新增 积分明细 /points |
| Register.jsx | 增加邀请码输入框（可选） |
| 帖子/评论组件 | 用户名旁 Lv.X |
| Toast 通知 | 行为触发后显示积分/经验变更 + level_change |

---

## 十三、开发顺序

1. 后端建表（含 CHECK 约束 + 补充索引 + experience/users ALTER）
2. 共享工具（`shared/time.js` + `src/lib/level.ts` + `client/src/shared/level.ts`）
3. 签到 API（Intl 时区 + streak JS 计算 + 拆流水）
4. 积分/经验基础 API（原子自增 + 每日上限 + 新手评价原子计数 + invite_bonus per-user）
5. 连锁扣回逻辑（负余额保护、汇总流水、降级处理、点赞取消扣回）
6. 邀请码 API（生成和查询，注册时消费）
7. 徽章 API（预留）
8. 前端组件（LevelBadge / ExpBar / CheckInButton / PointsCard）
9. Profile 增强
10. 新页面（积分明细 / 邀请码管理）
11. 注册页改
12. Toast 通知（含 level_change）
13. 移动端同步（/api/sync/bootstrap）

---

## 附录：实现注意事项

### 点赞每日上限原子性

并发场景下用单条原子 SQL 判断，不用“先查后判”：
```sql
INSERT INTO exp_logs (user_id, type, amount, source_id, created_at)
SELECT ?, 'like_received', 3, ?, ?
WHERE COALESCE(
  (SELECT SUM(amount) FROM exp_logs
   WHERE user_id = ? AND type = 'like_received' AND date(created_at) = date('now', 'localtime')),
  0
) + 3 <= 30;
```

第 10 个赞后达到 30，第 11 个赞全部拒绝（不写流水，点赞关系正常建立）。积分也设每日上限 30，与经验对齐。

### streak O(1) + 补签交互

- **正常签到**：SQL 增量更新 `current_streak`，O(1)
- **补签卡**：插入 `type='makeup'` 记录后，JS 端重算 streak（查最近 60 天，低频操作可接受）
- 补签天数计入连续奖励窗口，不补发当天签到积分
- 补签重算 streak 后，若恰好等于 7 或 30，补发对应连续奖励（+20 或 +100）

### db.batch() 幂等性

- 签到用 `INSERT OR IGNORE`（UNIQUE 约束天然幂等）
- 积分/经验变更加 `idempotency_key` 字段（前端生成 UUID，后端 UNIQUE 约束防重）
- batch 失败后先查流水是否已存在

### IP Hash

- HMAC-SHA256 with secret（secret 从 env 读）
- 用全局盐（不用 per-record 盐），保证可按 IP 查询防刷
- Web Crypto API，Worker 原生支持
- 用途仅为防刷检测，secret 加到 `.env.example` 注释

### 简化扣回边界

扣创作者从该内容获得的全部经验（行为基础 + 收到的点赞经验），不级联扣回点赞者。代码注释和 API 文档中显式声明。

---

## 附录：共享工具函数

### shared/time.js

```js
export function getBeijingDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d) // "2026-06-08"
}
```

### src/lib/level.ts（后端）

```ts
export const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100]

export function calcLevel(totalExp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalExp >= LEVEL_THRESHOLDS[i]) return i + 1
  }
  return 1
}
```

### client/src/shared/level.ts（前端）

```ts
export const LEVEL_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100]

export function calcLevel(totalExp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalExp >= LEVEL_THRESHOLDS[i]) return i + 1
  }
  return 1
}
```

> CI 检查两份 `LEVEL_THRESHOLDS` 数组是否一致，防 drift。
