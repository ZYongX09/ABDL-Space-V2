# Bug 报告 — commit 5d170da (前端) + d2f5669 (后端)

---

## 前端审查 — 5d170da

---

### Bug #1 — P1
- **文件**：`client/src/pages/NBWCallback.jsx:55`
- **问题**：`verifyNBWState` 内部调用 `sessionStorage.removeItem('nbw_oauth_state')`，消费 state 后立即删除。StrictMode 下 effect 第二次执行时 state 已不存在，`verifyNBWState` 返回 false，但此时 `handledRef.current = true`，流程跳过了错误分支直接结束，没有 navigate。用户在 StrictMode 下不会看到错误，但也不会正确跳转。
- **影响**：StrictMode 开发环境下，若 `verifyNBWState` 失败，不会提示用户，也不会有导航
- **建议**：在 `verifyNBWState` 失败且 `handledRef` 尚未设置时，应导航到 login

---

### Bug #2 — P2
- **文件**：`client/src/pages/AccountPrivacy.jsx:18`
- **问题**：`useEffect(() => { refreshUser(); }, [])` 每次进入 AccountPrivacy 页面都会额外请求一次 `/api/auth/me`，即使 user 对象可能还是新鲜的（已从其他流程更新过）
- **影响**：不必要的额外请求，尤其在 `/account?from=bind` 等跳转场景下会额外调用一次
- **建议**：加条件判断，仅在 user 对象缺少 `nbw_username` 且需要刷新时才请求，或在跳转链接中加 state 标记

---

### Bug #3 — P3
- **文件**：`client/src/contexts/AuthContext.jsx:264-276` (refreshUser)
- **问题**：`refreshUser` 捕获 `USE_API` 和 `API_BASE`，但它们是外部常量，不会变化，可以接受。不过没有错误返回值，调用方无法知道刷新是否成功
- **影响**：低——调用方（AccountPrivacy）不关心失败，silent fail 是可接受的设计
- **建议**：无严重问题，可接受

---

### Bug #4 — P2
- **文件**：`client/src/pages/AccountPrivacy.jsx:127-155`
- **问题**：移动端账号切换 UI 中，用 `accounts.filter(a => a.id !== user.id)` 判断多账号，但 `user.id` 可能是 `number`，`a.id` 可能是 `string`，比较可能失效（取决于存储时类型是否一致）
- **影响**：`accounts` 中 id 类型不一致时过滤失效，显示当前账号
- **建议**：`String(a.id) !== String(user.id)` 统一类型后再比较

---

## 后端审查 — d2f5669 (推测，实际对应最新迁移)

---

### Bug #5 — P1
- **文件**：`migrations/0022_users_nbw_username.sql`
- **问题**：migration 用 `ALTER TABLE users ADD COLUMN nbw_username TEXT DEFAULT NULL`，但如果 `nbw_username` 列已存在（之前运行过部分迁移），会报错而非幂等
- **影响**：重复部署 migration 时失败
- **建议**：SQLite 不支持 `IF NOT EXISTS`，可改为 `CREATE TABLE IF NOT EXISTS ...` 风格，或在应用层确保 migration 只跑一次

---

### Bug #6 — P2
- **文件**：`src/routes/auth.ts:506-507`
- **问题**：`/me` 返回 `nbw_username: user.nbw_username || null`，但 users 表 INSERT 时（line 331-332）没有写入 `nbw_username`，老用户即使有 `nbw_uid` 也没有 `nbw_username`
- **影响**：老用户绑定 NBW 后能看到 `nbw_uid`，但 `nbw_username` 为 null，需用户重新登录或额外查询才能补全
- **建议**：绑定流程（`/api/auth/nbw/bind`）已写入 `nbw_username`，但 `/me` 的缓存用户对象可能不会更新（因为 AuthContext 只在登录时设置 user）。`refreshUser` 会重新请求 `/me`，应该能获取到正确的 `nbw_username`

---

### Bug #7 — P3
- **文件**：`src/lib/oauth.ts:424-435` (getUserTokens)
- **问题**：`SELECT *` 配合 `GROUP BY t.client_id`，返回的 `t.scopes`、`t.access_expires_at` 等字段取的是分组内任意一行，而非 token 最新或最优先的。在前端只展示 app name + logo 的场景下不影响，但语义上不精确
- **影响**：低——前端目前只使用 `client_name` 和 `logo_url`，但若未来展示 scopes 或过期时间，会造成误导
- **建议**：如需精确获取最新 token，用子查询 `ORDER BY t.created_at DESC LIMIT 1` 而非 `GROUP BY`

---

## 总体评价

**整体质量良好**，改动合理，修复了真实的 UX 问题。

| # | 级别 | 概要 |
|---|------|------|
| 1 | **P1** | NBWCallback: StrictMode 下 verifyNBWState 失败无导航 |
| 2 | **P2** | AccountPrivacy 每次 mount 都调用 refreshUser |
| 3 | P3 | refreshUser 无错误返回（可接受） |
| 4 | **P2** | 账号切换比较 id 类型不一致 |
| 5 | **P1** | Migration 非幂等，重复运行会报错 |
| 6 | P2 | 老用户 nbw_username 旧数据问题 |
| 7 | P3 | getUserTokens SELECT * 语义不精确 |
