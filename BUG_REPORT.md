# Bug Report

## 2025-01-23 全量审查报告

---

## 🔴 P0 — 崩溃 / 安全漏洞（立即修复）

### Bug #1 — 令牌明文存储在 localStorage [P0-SEC]
- **文件**：`client/src/api.js:42`、`client/src/contexts/AuthContext.jsx:103`
- **问题**：JWT token 以 `localStorage.setItem('token', token)` 明文存储，XSS 可直接读取。
- **影响**：XSS 攻击可窃取用户会话。
- **建议**：改用 `httpOnly` cookie；或对 token 加密存储。

### Bug #2 — 密码哈希本地存储可被提取 [P0-SEC]
- **文件**：`client/src/api.js:36-40`、`client/src/contexts/AuthContext.jsx`（离线模式）
- **问题**：离线模式下密码 SHA-256 哈希以明文存储在 `localStorage['abdl_users']` 中，攻击者通过 XSS 或物理访问可提取并暴力破解。
- **影响**：用户若多平台复用密码，离线数据泄露可能波及其他账户。
- **建议**：离线模式不存储密码哈希；改用 session-only 方案；或废弃离线注册功能。

### Bug #3 — `cachedFetch` 静默吞掉错误返回过期数据 [P0-SEC] ✅已修
- **文件**：`client/src/api.js:66-69`
- **问题**：`cacheGet` 命中有缓存时后台刷新失败，`.catch(() => {})` 完全吞掉错误，用户持续看到过期数据无任何提示。
- **状态**：✅ 已修复 — 改为 `console.warn` 记录错误，stale-while-revalidate 模式可接受

### Bug #4 — SQL 注入风险 [P0-SEC] ✅已修
- **文件**：`src/routes/likes.ts:27`
- **状态**：✅ 已修复 — 使用 tableMap 白名单映射替代字符串拼接

---

## 🟠 P1 — 功能异常（尽快修复）

### Bug #5 — ForumFeed 点赞无并发锁 [P1] ✅已修
- **文件**：`client/src/pages/ForumFeed.jsx:54-68`
- **问题**：点赞使用 optimistic update，但未防止并发请求。快速双击触发两次 API 调用导致状态错乱。
- **建议**：加锁（disable 按钮直到 API 返回）。

### Bug #6 — `window.history.back()` 删除后可能回到错误页面 [P1] ✅已修
- **状态**：✅ 已修复 — 改为 `navigate('/')`
- **文件**：`client/src/pages/PostDetail.jsx:213`
- **问题**：删除后硬跳转 `history.back()`，若用户从搜索/通知等渠道进入则不是预期页面。
- **建议**：删除成功后 `navigate('/')` 或记录来源页。

### Bug #7 — MessagesPage `loadMessages` 潜在无限循环 [P1] ✅已修
- **状态**：✅ 已修复 — useCallback 包裹，依赖稳定
- **文件**：`client/src/pages/MessagesPage.jsx:59`
- **问题**：`loadMessages` 内部调用 `loadConversations`，`loadConversations` 依赖 `toast`，导致引用不稳定可能触发循环。
- **建议**：用 `useRef` 缓存稳定引用或重构为自定义 hook。

### Bug #8 — 搜索框无防抖，每字符触发 API 请求 [P1-PERF] ✅已修
- **文件**：`client/src/pages/ForumFeed.jsx:30-38`
- **问题**：`useEffect(() => { loadPosts(); }, [search])` 每个字符都触发请求，无 debounce。
- **建议**：加 300-500ms 防抖或用 `useDeferredValue`。

### Bug #9 — 内存缓存无限增长无驱逐机制 [P1-PERF] ✅已修
- **状态**：✅ 已修复 — 100 条 LRU 驱逐
- **文件**：`client/src/api.js:42-56`
- **问题**：`_cache` 是 `Map()`，只有再次访问时检查 TTL 才删除，stale 条目永不清理，长期内存持续增长。
- **建议**：添加 `cachePrune()` 在缓存大小超限时 LRU 驱逐；或限制最大条目数。

### Bug #10 — resize 监听器内联函数引用不稳定 [P1-MEM] ✅已修
- **状态**：✅ 已修复 — useEffect 内函数引用正确
- **文件**：`client/src/pages/ProfilePageV2.jsx:376-383`
- **问题**：`onResize` 是内联函数每次 render 新建，`removeEventListener` 移除的是旧引用，导致监听器累积。
- **建议**：用 `useCallback` 或 `useRef` 缓存稳定引用。

### Bug #11 — TabBar 动画 class 不重置 [P1] ✅已修
- **状态**：✅ 已修复 — setTimeout 重置为 ''
- **文件**：`client/src/components/TabBar.jsx:59-76`
- **问题**：`setAnimClass('tab-slide-${dir}')` 后从不重置为 `''`，新 tab 内容也带旧动画 class。
- **建议**：在 `setCurrentKey` 后将 `animClass` 重置为空。

### Bug #12 — XSS 风险 [P1-SEC] ✅已修
- **状态**：✅ 非问题 — React 自动转义文本内容，无 dangerouslySetInnerHTML
- **文件**：`src/routes/posts.ts`（帖子/评论内容）
- **问题**：用户提交的 `content`（1-5000/2000 字符）原样存储和返回，代码中无任何 HTML 转义处理，`<script>` 等恶意标签可存入。
- **建议**：后端统一对 `content` 做 HTML escape 后再存储；或在返回前端时转义。

### Bug #13 — `target_id` 未校验正整数 [P1] ✅已修
- **状态**：✅ 已修复 — parseInt + !targetId || targetId < 1 检查
- **文件**：`src/routes/likes.ts:13`
- **问题**：校验了 `target_type` 但未检查 `target_id` 是否为有效正整数，`parseInt` 后未校验 `isNaN`，`-1` 或 `0` 不会触发 SQL 错误但逻辑无效。
- **建议**：`const targetId = parseInt(target_id); if (!targetId || targetId < 1) return error`。

### Bug #14 — `/search` 无输入长度限制 [P1-PERF] ✅已修
- **状态**：✅ 已修复 — q.length > 100 返回 400
- **文件**：`src/routes/users.ts:32`
- **问题**：`q` 参数无最大长度限制，超长字符串导致 LIKE 查询性能问题（全表扫描无索引）。
- **建议**：`if (q.length > 100) return c.json({ error: 'Query too long' }, 400)`

---

## 🟡 P2 — 体验问题（计划修复）

### Bug #15 — `messages.ts` GROUP BY 非聚合列返回不确定值 [P2]
- **文件**：`src/routes/messages.ts:20`
- **问题**：
  ```sql
  SELECT content as last_msg, created_at as last_time
  FROM messages WHERE ... GROUP BY other_id
  ```
  `content` 和 `created_at` 未使用聚合函数，SQLite 返回组内任意行，不保证是最新消息。
- **影响**：对话列表 `last_message` 和 `last_message_at` 可能返回非最新消息。
- **建议**：使用子查询或窗口函数获取每个 `other_id` 的最新消息。

### Bug #16 — 用户删除未清理 `reports.reporter_id` [P2] ✅已修
- **状态**：✅ 已修复 — DELETE FROM reports WHERE user_id = ? OR reporter_id = ?
- **文件**：`src/routes/admin.ts:97`、`src/routes/admin.ts:110`
- **问题**：删除用户时只清理了 `reports WHERE user_id = ?`（被举报人），但 `reports.reporter_id`（举报人）未处理，变为孤儿引用。
- **建议**：同时清理 `reports WHERE reporter_id = ? OR user_id = ?`

### Bug #17 — `recommend.ts` AI JSON 解析脆弱无降级 [P2]
- **文件**：`src/routes/recommend.ts:152`
- **问题**：正则 `\{[\s\S]*\}` 贪心匹配可能截取不完整 JSON；AI 返回格式异常时前端收到 502 而非降级处理。
- **建议**：更严格的 JSON 提取 + Schema 验证；失败时返回纯数据推荐（fallback）。

### Bug #18 — ErrorBoundary 无完整重试机制 [P2] ✅已修
- **状态**：✅ 已修复 — retryKey 驱动子组件重新挂载
- **文件**：`client/src/components/ErrorBoundary.jsx`
- **问题**：只有 `getDerivedStateFromError`，无 `componentDidCatch` 记录错误；重试按钮只是隐藏错误状态不重新挂载子组件。
- **建议**：用 `key` 驱动子组件重新创建。

### Bug #19 — 通知已读乐观更新失败无回滚 [P2] ✅已修
- **状态**：✅ 非问题 — await readAll() 失败时后续代码不执行
- **文件**：`client/src/pages/NotificationsPage.jsx:28-32`
- **问题**：`readAll` 失败时已本地标已读但服务器未更新，用户刷新后又看到未读。
- **建议**：`readAll` 失败时回滚本地状态；或乐观更新后 API 失败则重新拉取。

### Bug #20 — 内存缓存无大小限制 [P2-PERF] ✅已修
- **状态**：✅ 已修复 — 100 条上限 + LRU 驱逐
- **文件**：`client/src/api.js`（`_cache` Map）
- **问题**：缓存无最大条目数限制，长期运行可能占用过多内存。
- **建议**：添加 LRU 驱逐或限制最大条目数（如 100 条）。

### Bug #21 — ImageUploader `e.target.value = ''` 在 React 中不可靠 [P2]
- **文件**：`client/src/components/ImageUploader.jsx`
- **问题**：手动清空文件 input 的 `value` 是原生 DOM 操作，React synthetic event 下可能不生效。
- **建议**：用 `ref` + 原生方法；或用 `key` 驱动强制重置。

### Bug #22 — Captcha SDK 无加载超时 [P2] ✅已修
- **状态**：✅ 已修复 — 10s timeout 后 sdkReady=true
- **文件**：`client/src/components/VerifyModal.jsx:20-28`
- **问题**：SDK 加载失败时 `sdkReady` 永远 false，验证弹窗无法渲染，用户无法关闭。
- **建议**：添加 10s 超时，超时后让弹窗出现以便关闭。

### Bug #23 — `/send-code` type==='bind' 只检查 Authorization header 存在 [P2-SEC] ✅已修
- **状态**：✅ 已修复 — 改为 verifyJWT 验证 token 有效性
- **文件**：`src/routes/auth.ts:105`
- **问题**：`type === 'bind'` 时只检查 `Authorization` header 存在，未验证 token 有效性，任何持任意字符串的 Authorization header 都能绕过。
- **建议**：引入 `authMiddleware` 或手动调用 `verifyJWT`。

### Bug #24 — 限流 Map 无限增长无清理机制 [P2-MEM] ✅已修
- **状态**：✅ 已修复 — 1% 概率触发 cleanupRateLimits()
- **文件**：`src/routes/captcha_keys.ts:58`
- **问题**：`cleanupRateLimits()` 定义但从未被调用，`Map` 只增不减，长期内存泄漏。
- **建议**：在 `api-worker.ts` 或 health check 中定期调用清理。

---

## 🟢 P3 — 代码质量（有空修复）

### Bug #25 — ProfilePageV2 内联 style 标签重复注入 [P3-MEM]
- **文件**：`client/src/pages/ProfilePageV2.jsx:397-402`
- **问题**：React 严格模式下 `useEffect` 执行两次，ID 检测可能因 DOM 更新时序有问题。
- **建议**：用 `useInsertionEffect`（React 18）或用 ref 确保幂等。

### Bug #26 — `diapers.ts` ORDER BY 引用子查询别名不够健壮 [P3]
- **文件**：`src/routes/diapers.ts:57`
- **问题**：`ORDER BY avg_score` 引用子查询别名，标准 SQL 不允许，SQLite 支持但不够健壮。
- **建议**：显式引用子查询别名或用列位置号。

### Bug #27 — `posts.ts` `deleteImageFromImgbed` 静默失败 [P3]
- **文件**：`src/routes/posts.ts:26`
- **问题**：`catch {}` 吞掉所有异常，图床服务异常时用户不会感知，可能导致重复上传。
- **建议**：至少 `console.warn` 记录。

### Bug #28 — `users.ts` PATCH /me 数字字段无合理性校验 [P3] ✅已修
- **状态**：✅ 已修复 — weight/waist/hip 范围校验
- **文件**：`src/routes/users.ts:103`
- **问题**：`weight`/`waist`/`hip` 直接入库，`weight <= 0` 或异常大值被接受。
- **建议**：增加范围校验（如 `weight > 0 && weight < 500`）。

### Bug #29 — `oauth.ts` `introspectToken` 参数命名混淆 [P3]
- **文件**：`src/lib/oauth.ts:240`
- **问题**：第三个参数 `dbUser?: D1Database` 命名容易混淆，应为 `userDb`。
- **建议**：重命名并添加 JSDoc。

### Bug #30 — 关注操作后 `followMap` 未同步到服务器 [P3]
- **文件**：`client/src/pages/ForumFeed.jsx:70-85`
- **问题**：`handleFollow` 后 state 更新，服务器真实 follow 状态会覆盖本地 `followMap`。
- **建议**：follow 后直接更新对应帖子的 `followMap` 字段。

---

## 按严重程度汇总

| # | 严重度 | 文件 | 问题 |
|---|--------|------|------|
| 1 | P0 | api.js / AuthContext | 令牌明文 localStorage |
| 2 | P0 | api.js / AuthContext | 密码哈希本地存储可提取 |
| 3 | P0 | api.js:66-69 | cachedFetch 静默吞掉刷新错误 |
| 4 | P0 | likes.ts:27 | SQL 注入（table 拼接） |
| 5 | P1 | ForumFeed.jsx:54-68 | 点赞无并发锁 |
| 6 | P1 | PostDetail.jsx:213 | history.back() 跳到错误页 |
| 7 | P1 | MessagesPage.jsx:59 | loadMessages 潜在无限循环 |
| 8 | P1 | ForumFeed.jsx:30-38 | 搜索无防抖 |
| 9 | P1 | api.js:42-56 | 内存缓存无限增长 |
| 10 | P1 | ProfilePageV2.jsx:376 | resize 监听器泄漏 |
| 11 | P1 | TabBar.jsx:59-76 | 动画 class 不重置 |
| 12 | P1 | posts.ts | XSS 内容未转义 |
| 13 | P1 | likes.ts:13 | target_id 未校验正整数 |
| 14 | P1 | users.ts:32 | search 无长度限制 |
| 15 | P2 | messages.ts:20 | GROUP BY 非聚合列 |
| 16 | P2 | admin.ts:97,110 | 用户删除未清理 reporter_id |
| 17 | P2 | recommend.ts:152 | AI JSON 解析脆弱 |
| 18 | P2 | ErrorBoundary.jsx | 重试机制不完整 |
| 19 | P2 | NotificationsPage.jsx:28 | 已读乐观更新失败无回滚 |
| 20 | P2 | api.js | 缓存无大小限制 |
| 21 | P2 | ImageUploader.jsx | e.target.value='' 不可靠 |
| 22 | P2 | VerifyModal.jsx:20 | Captcha SDK 无超时 |
| 23 | P2 | auth.ts:105 | send-code bind 只检查 header 存在 |
| 24 | P2 | captcha_keys.ts:58 | 限流 Map 无清理 |
| 25 | P3 | ProfilePageV2.jsx:397 | style 标签重复注入 |
| 26 | P3 | diapers.ts:57 | ORDER BY 子查询别名 |
| 27 | P3 | posts.ts:26 | deleteImageFromImgbed 静默失败 |
| 28 | P3 | users.ts:103 | PATCH /me 字段无范围校验 |
| 29 | P3 | oauth.ts:240 | introspectToken 参数命名混淆 |
| 30 | P3 | ForumFeed.jsx:70-85 | followMap 未同步服务器 |

---

## 最高优先级修复顺序

1. **Bug #1 + #2 + #4**（安全：令牌/密码存储、SQL 注入）
2. **Bug #3**（P0 数据一致性：缓存静默失败）
3. **Bug #5**（功能：点赞竞态）
4. **Bug #7 + #9**（稳定性：无限循环、内存泄漏）
5. **Bug #12**（XSS 安全漏洞）