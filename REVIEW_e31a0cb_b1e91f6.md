# Bug 报告 — e31a0cb (后端) + b1e91f6 (前端)

---

## 安全性审查

---

### Bug #1 — P1（安全性）
- **文件**：`src/routes/nbw.ts:113`
- **问题**：`cacheKey = \`${nbwUser.uid}_${Date.now()}\``。Cloudflare Workers 环境下，**全球多个 Worker 实例共享同一个 D1 数据库，但不共享内存**。`nbwTokenCache` 是进程内 Map，在多实例部署时：
  - 实例 A 写入的 cache key
  - 用户请求被路由到实例 B，B 的 Map 为空
  - 绑定失败："授权信息已过期"
- **影响**：多实例部署时约 50%+ 概率随机失败
- **建议**：改用 D1 表存储 cache（insert + 查询 + delete 原子化），或 Redis（若 Cloudflare KV 可用），或 JWT 内嵌 NBW uid 替代 cache key

---

### Bug #2 — P1（安全性）
- **文件**：`src/routes/nbw.ts:142-146`
- **问题**：`bind-existing` 验证 ABDL Space 密码**之前**就先 `nbwTokenCache.delete(body.nbw_token)`。验证失败时（401）token 已消费，用户刷新重试会得到过期错误，必须从头开始整个 OAuth 流程
- **影响**：合法用户输入错误密码后，必须重新授权 OAuth，体验差
- **建议**：密码验证成功后再 delete token

---

### Bug #3 — P2
- **文件**：`src/routes/nbw.ts:113`
- **问题**：`cacheKey = \`${nbwUser.uid}_${Date.now()}\`` 中 `nbwUser.uid` 是可控输入（来自 NBW API），用于生成 cache key 的组成部分。若 `nbwUser.uid` 含特殊字符（如 `_`），可能与分隔符混淆，造成 cache key 冲突或注入
- **缓解**：但 Map key 最终只是一条记录，攻击价值有限
- **建议**：用 `crypto.randomUUID()` 或 `crypto.getRandomValues()` 生成随机 key，摒弃 uid 组合

---

## 代码质量审查

---

### Bug #4 — P2
- **文件**：`src/routes/auth.ts:284-289` (register 中的 nbw_token 读取)
- **问题**：register 接受 `nbw_token` 时，若 cache 已过期（token 被 bind-existing 消耗或自然过期），返回 `'NBW 授权信息已过期，请重新登录'`。但此时用户已在注册表单中，输入的信息会丢失
- **影响**：用户在注册页填写完毕后若 token 过期，需重新发起 OAuth 流程，所有输入丢失
- **建议**：注册流程的 token 过期应给用户明确提示并引导重新 OAuth，或考虑延长缓存时间

---

### Bug #5 — P2
- **文件**：`client/src/pages/NBWChoicePage.jsx:60` & `client/src/pages/Register.jsx`
- **问题**：`handleRegister` 把 `nbw_token` 放到 React Router state（`navigate('/register', { state: { nbw_token, ... } })`），但 React Router state 存在内存中，刷新会丢失。用户从 `/auth/nbw/choose` 跳到 `/register` 后再刷新，`nbw_token` 就没了
- **缓解**：刷新 `/register` 页面时若 `nbwState` 缺失，可能导致注册流程异常
- **建议**：考虑将 token 存在 sessionStorage 或通过 URL 参数传递

---

### Bug #6 — P3
- **文件**：`src/routes/auth.ts:333-335`
- **问题**：register INSERT 增加了 `nbw_username`，但 INSERT 时 `isNBW` 判断条件是 `!!nbw_code || !!nbw_token`。这意味着用户用旧版前端（携带 `nbw_code`）注册时，`nbw_username` 仍为 null（旧流程未更新）
- **影响**：低——旧版前端流通量会逐渐减少，但短期内不一致
- **建议**：旧流程（nbw_code）也应该通过 NBW API 获取 username（已有代码可参考新流程）

---

### Bug #7 — P3
- **文件**：`src/routes/nbw.ts:19-21` (`cleanupNbwCache`)
- **问题**：`cleanupNbwCache` 只在 callback 写入时调用，不在 bind-existing 或 register 读取时调用。若在 10 分钟窗口内 cache 持续增长，且没有请求触发 callback，则过期 key 只在下次 callback 写入时清理
- **影响**：低——Map 内存占用有限，过期 key 最多存在 10 分钟
- **建议**：可接受，但不够干净

---

## 总体评价

**核心安全修复（code replay）方向正确**，但引入了新的多实例部署兼容性问题（进程内 Map 在 Cloudflare Workers 多实例环境下不可用）。

| # | 级别 | 概要 |
|---|------|------|
| 1 | **P1** | `nbwTokenCache` 是进程内 Map，多 Cloudflare Worker 实例不共享，导致随机失败 |
| 2 | **P1** | `bind-existing` 密码验证失败时提前 delete token，用户需重新 OAuth |
| 3 | P2 | `cacheKey` 含 NBW uid 分隔符风险，或可更随机 |
| 4 | P2 | 注册页 token 过期后用户输入丢失 |
| 5 | P2 | `nbw_token` 存在 React Router state，刷新丢失 |
| 6 | P3 | 旧版 nbw_code 流程不写 nbw_username |
| 7 | P3 | cleanupNbwCache 只在 callback 时调用 |

**Bug #1 是部署 blocker**，需要在 staging 环境验证多实例是否正常。其余问题优先级较低。
