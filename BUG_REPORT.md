# Bug 报告

## [审查时间] 移动端 MobileHeader 布局提升

---

### Bug #1 — P1
- **文件**：`client/src/contexts/MobileHeaderContext.jsx:27`
- **问题**：`useMobileHeaderActions` 在 context 为 null 时静默返回 null，不抛错
- **影响**：任何在 `MobileHeaderProvider` 外使用的组件会静默失败（actions 为 undefined），调试困难
- **建议**：
  ```jsx
  export function useMobileHeaderActions() {
    const ctx = useContext(MobileHeaderContext);
    if (!ctx) throw new Error('useMobileHeaderActions must be used within MobileHeaderProvider');
    return ctx;
  }
  ```

---

### Bug #2 — P2
- **文件**：`client/src/pages/MessagesPage.jsx:25-30`
- **问题**：`useMobileHeaderActions()` 在组件顶层调用（line 25），但 `registerActions` 依赖 `setShowNewConvo`。当 `showNewConvo` 从父组件传入或在其他地方改变时，context 已注册的值不会更新，因为 effect deps 为 `[]`
- **影响**：MessagesPage header actions 只在初始化时注册一次，`showNewConvo` 状态变化不会更新 header
- **建议**：effect deps 应包含所有用到的 reactive 值，或确认 `registerActions` 在当前使用模式下行为符合预期

---

### Bug #3 — P3
- **文件**：`client/src/App.jsx:141-145`
- **问题**：`MobileHeaderLayout` 放在 JSX 中 `<Sidebar />` 和 `<NotificationProvider>` 同一层级，而非 `app-main-content` 的子组件。这在视觉上正确，但结构上 `NsfwProvider` 和 `NotificationProvider` 包裹的子组件无法访问 `MobileHeaderContext`，这可能是预期行为但不够显式
- **影响**：低——如果其他组件未来需要同时访问 NsfwContext 和 MobileHeaderContext，会有问题
- **建议**：在 `MobileHeaderLayout` 的位置加注释说明其放在这层的原因

---

### Bug #4 — P3
- **文件**：`client/src/pages/ForumFeed.jsx:93-94` & `MessagesPage.jsx:27-28`
- **问题**：cleanup 函数 `() => registerActions([], [])` 在 `useEffect` return 中注册空数组。React StrictMode 下 effect 会挂载→卸载→再挂载，连续两次 `registerActions([], [])` 会短暂清空 header actions再重新设置，造成视觉闪烁
- **影响**：开发模式下可见，生产环境影响极小
- **建议**：考虑使用 `React.memo` + 条件注册，或接受当前行为

---

### 总体评价

**改动方向正确**，解决了移动端加载期间 header 缺失导致的 padding-top:48px 空白问题。

核心修复：
- MobileHeader 从 Suspense 内（懒加载组件内部）提升到布局层（始终渲染）
- 使用 Context 机制解耦 header actions 和 header 本身的位置关系

**潜在风险**：
- 只有 ForumFeed 和 MessagesPage 两个页面迁移到新 context，其余 16 个页面如果原来有 MobileHeader，移除后会导致这些页面的 mobile header actions 丢失（如果老代码曾经注册过的话）。需要确认这 18 个页面中哪些原本依赖了 MobileHeader。

---

## [2026-06-04 01:23] 后端 f520f50 审查报告 — NBW OAuth 移动端独立 App ID

**审查范围**：`/home/ZYongX/projects/git/abdl-space` 仓库 commit `f520f50`，改动文件 `src/routes/nbw.ts`（+23/-8）

**改动核心**：新增 `getNBWConfig(c)` 辅助函数，根据 `Origin` / `Referer` 头判断请求是否来自 `m.abdl-space.top`，选择不同 OAuth 凭证集（NBW_CLIENT_ID_MOBILE 等）。三个端点 `/config`、`/callback`、`/bind` 都改用此函数。

---

### Bug #1 — P1（安全：子域名绕过）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/nbw.ts:20`
- **问题**：`origin.includes('m.abdl-space.top')` 是**子串匹配**，不是主机名匹配。攻击者只要在自己控制的域下注册一个含 `m.abdl-space.top` 子串的子域，就能伪造 Origin 触发移动端配置：
  ```
  Origin: https://m.abdl-space.top.evil.com   ← 包含 "m.abdl-space.top"，会被误判为移动端
  Origin: https://attacker-m.abdl-space.top   ← 同理
  Origin: https://x.m.abdl-space.top.evil.com ← 同理
  ```
  只要攻击者持有 `evil.com`（或任何含 `m.abdl-space.top` 字串的父域），就能让任何浏览器/客户端发起的请求拿到移动端 App ID + mobile `redirect_uri`。
- **影响**：
  1. 绕过 App ID 隔离的设计意图——攻击者可从桌面端浏览器调用 `/api/auth/nbw/callback`，使用本应只属于移动端 App ID 的凭证
  2. 若移动端 App ID 的 `redirect_uri` 在 NBW 后台注册为 `https://m.abdl-space.top/...`，攻击者可在桌面伪造 OAuth 流程并把回调劫持到自己的域名（取决于 NBW provider 是否校验 redirect_uri 注册项，但更坏情况是 NBW provider 接受了桌面域名但用 mobile app 完成 token 交换）
  3. `/api/auth/nbw/config` 是公开端点（无鉴权），泄露的 `client_id` + `redirect_uri` 信息可被滥用做钓鱼
- **建议**：用 URL 解析 + 主机名精确匹配：
  ```typescript
  function getNBWConfig(c: Context<AppType>) {
    const origin = c.req.header('Origin') || ''
    let isMobile = false
    try {
      const u = new URL(origin)
      isMobile = u.hostname === 'm.abdl-space.top'
    } catch {
      isMobile = false
    }
    // ...
  }
  ```
  或者至少用 `origin.endsWith('.m.abdl-space.top') || origin === 'https://m.abdl-space.top'`，并对 `Referer` 做同样的 URL 解析（不要子串匹配）。

---

### Bug #2 — P1（一致性：auth.ts 注册流程未同步更新）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/auth.ts:297-299`
- **问题**：注册端点 `POST /api/auth/register` 里的 NBW 旧流程分支（`nbw_code` 路径）**仍然直接读 `c.env.NBW_CLIENT_ID/SECRET/REDIRECT_URI`**，没走 `getNBWConfig()`：
  ```typescript
  // auth.ts:297
  const clientId = c.env.NBW_CLIENT_ID
  const clientSecret = c.env.NBW_CLIENT_SECRET
  const redirectUri = c.env.NBW_REDIRECT_URI
  ```
- **影响**：
  1. 移动端用户走 `nbw_code`（旧）注册流程时，server 用的是**桌面端**的 `client_id` / `client_secret` / `redirect_uri` 去 NBW 换 token
  2. 移动端 App ID 注册的 `redirect_uri` 大概率是 `https://m.abdl-space.top/...`，而这里用的是桌面 `redirect_uri`。NBW provider 大概率会拒绝（redirect_uri mismatch），用户看到模糊的"NBW 授权码无效"错误
  3. 即便 NBW provider 容忍了，这种 client_id/redirect_uri 错配就是设计本意被破坏的体现
- **建议**：把 `auth.ts:297-299` 也换成 `getNBWConfig(c)`，并把 `NBW_TOKEN_URL` / `NBW_USERINFO_URL` 提到模块顶部复用（同 `nbw.ts` 已有常量）。最稳妥的做法：把 `getNBWConfig` 从 `nbw.ts` 抽到 `src/lib/nbw.ts` 共享给两个路由。

---

### Bug #3 — P2（安全：Referer 回退放大攻击面）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/nbw.ts:18`
- **问题**：
  ```typescript
  const origin = c.req.header('Origin') || c.req.header('Referer') || ''
  ```
  `Referer` 头是完整 URL（含 path + query），可被攻击者在自己的页面里通过 `<a href="...">` 诱导触发，或在 `fetch()` 之外用 `no-cors` 模式被发送时携带。`Referer` 也不受 CORS 限制（任何跨站导航都会带）。相比 `Origin`，`Referer` 更易伪造/被引导。
- **影响**：
  - 浏览器对 `POST` 跨域 `application/json` 请求**总是**带 `Origin` 头（即便没 CORS 也会带），所以正常前端调用不会走 Referer 回退
  - 但自定义客户端（curl、Postman、恶意 JS）可以省略 `Origin`、只设 `Referer: https://m.abdl-space.top/anything`，从而触发移动端配置
  - 配合 Bug #1 的子串匹配，攻击面进一步放大
- **建议**：
  - 删除 Referer 回退，只信任 `Origin`
  - 如果一定要支持 Referer 回退，至少做 URL 解析后比较 hostname（见 Bug #1 修复方案）

---

### Bug #4 — P3（类型安全）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/nbw.ts:17`
- **问题**：`function getNBWConfig(c: any)` 用了 `any`，丢失类型检查
- **影响**：低——IDE 无法补全 `c.env.NBW_*`，未来重构 env 类型时不会报错
- **建议**：用 `Context<AppType>` 替换 `any`，并把返回类型里的 `string` 收紧为模板字面量类型或 brand type

---

### Bug #5 — P3（文档缺失）
- **文件**：`/home/ZYongX/projects/git/abdl-space/.env.example`
- **问题**：`.env.example` **没有文档化**新增的 `NBW_CLIENT_ID_MOBILE` / `NBW_CLIENT_SECRET_MOBILE` / `NBW_REDIRECT_URI_MOBILE` 三个变量。新部署者不会知道这些变量需要配置（虽然代码有 fallback 到桌面变量，但意图不明显）
- **建议**：在 `.env.example` 加上：
  ```
  # 移动端独立 NBW OAuth App（可选，未配置时 fallback 到主站 App）
  # NBW_CLIENT_ID_MOBILE=
  # NBW_CLIENT_SECRET_MOBILE=
  # NBW_REDIRECT_URI_MOBILE=
  ```

---

### Bug #6 — P3（可观测性）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/nbw.ts:17-31`
- **问题**：`getNBWConfig` 静默选择配置，调用点没有日志区分走的是 mobile 还是 desktop
- **影响**：当 OAuth 失败需要排查时，不知道是不是因为请求被错配到错误的 App ID
- **建议**：在调用点或函数内打印一行 debug 日志（`console.log` 或结构化 logger），记录 `isMobile` 和最终使用的 `clientId` 前 8 位（不要打印 secret）

---

### 总体评价

**改动方向正确**——为移动端提供独立 OAuth App ID 是合理的（不同 redirect_uri、不同 client 隔离），代码也做了 fallback（移动端变量未配置时回退到主站），对部署友好。

**但存在 2 个 P1 问题必须修复**：
1. **`includes` 子串匹配可被子域名绕过**（Bug #1）—— 安全设计失效
2. **`auth.ts` 注册端点的旧 `nbw_code` 流程没同步更新**（Bug #2）—— 一致性破坏，移动端旧流程会失败

**建议优先修复顺序**：
1. Bug #1（用 URL 解析 + 精确 hostname 匹配）—— 一次修复同时解决 Bug #3
2. Bug #2（把 `getNBWConfig` 抽到 `src/lib/nbw.ts` 并让 `auth.ts` 复用）
3. Bug #5（更新 `.env.example`）
4. Bug #4、Bug #6（可后续 cleanup）

---

## [2026-06-04 01:33] 后端 b61a05a 审查报告 — 批量安全修复 + N+1 优化

**审查范围**：`/home/ZYongX/projects/git/abdl-space` 仓库 commit `b61a05a`，15 个文件，+332/-165

**改动核心**：安全响应头 / PBKDF2 600k / JWT 秒级 + 向后兼容 / `password_changed_at` 失效旧 session / API key AES-GCM 加密 / Admin 自删防护 / LIKE 转义 / 图片 URL 协议校验 / Wiki 编辑权限 / 频率限制 / N+1 优化（posts/messages/reports/users）。

**总体**：方向都是对的，N+1 优化和性能改动收益明显。**但发现 2 个 P1 + 3 个 P2** 必须修复。

---

### Bug #1 — P1（功能破损：API key 加密是单向死路）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/api_keys.ts:23-29, 73-90`
- **问题**：本 commit 给 `api_keys.key_value` 上了 AES-GCM 加密（PBKDF2 派生 + 12B 随机 IV），但**整个仓库里 `decryptValue` 函数从未被调用过**。验证方法：`grep -rn "decryptValue" --include="*.ts"` 仅在定义处命中，无调用点。
- **影响**：
  1. **数据迁移遗留问题**：部署后所有**历史明文 key_value 仍是明文**（未做迁移），新写入的变成密文——出现混合状态
  2. **新写入的密文永远无法读出**——如果以后想真正用这些 key（多 provider 动态切换、A/B 测试等），需要重新设计
  3. **API key 现在实际上是「写不进去」的状态**——POST 成功返回 201，但表里的内容是无意义的密文
- **建议**：
  - **方案 A（推荐）**：要么在同一个 PR 里完成解密读取路径（`recommend.ts:220` 等其他文件改用表里的 key 替换 env 变量），要么
  - **方案 B**：回退这个改动，等有读取需求时再上加密
  - **方案 C**：至少加一段迁移 SQL：检测 key_value 是否含 `:` 且 base64 解码后是 12+N 字节（密文特征），否则当作明文重新加密一次

---

### Bug #2 — P1（安全：`adminMiddleware` 漏掉 `password_changed_at` 检查）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/middleware/auth.ts:80-94, 96-110`
- **问题**：
  ```typescript
  // authMiddleware 里有：
  if (payload.iat > 0) {
    const user = await queryOne(...)
    if (user?.password_changed_at) {
      // ... 401 if token issued before password change
    }
  }

  // 但 adminMiddleware 里没有这个检查！
  export async function adminMiddleware(c, next) {
    const payload = await extractUser(c)
    if (!payload) return c.json({ error: 'Authentication required' }, 401)
    if (payload.role !== 'admin') return c.json({ error: 'Admin access required' }, 403)
    c.set('user', payload)
    await next()
  }
  ```
- **影响**：
  1. **管理员改密后，旧 JWT 仍可访问管理面板**——绕过了本 commit 引入的 `password_changed_at` 安全机制
  2. 高权限账户尤其需要这个保护（admin 账户被攻破后无法通过改密阻断）
  3. 与 Bug #3（重置密码时未吊销 OAuth token）叠加：换密不能 kill 任何 admin 会话
- **建议**：把 `password_changed_at` 检查抽成共享函数 `assertSessionNotStale(payload, db)`，两个 middleware 都调用：
  ```typescript
  export async function adminMiddleware(c, next) {
    const payload = await extractUser(c)
    if (!payload) return c.json({ error: 'Authentication required' }, 401)
    if (payload.role !== 'admin') return c.json({ error: 'Admin access required' }, 403)
    const stale = await assertSessionNotStale(payload, c.env.abdl_space_db)
    if (stale) return stale
    c.set('user', payload)
    await next()
  }
  ```

---

### Bug #3 — P2（功能：LIKE 转义缺 `ESCAPE` 子句，搜索含 `%` 或 `_` 失效）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/posts.ts:79-84`
- **问题**：
  ```typescript
  if (search) {
    conditions.push('p.content LIKE ?')
    const escapedSearch = search.replace(/%/g, '\\%').replace(/_/g, '\\_')
    params.push(`%${escapedSearch}%`)
  }
  ```
  SQLite 默认 LIKE **没有 escape 字符**。这里把 `100%` 转成 `100\%`，但 SQL 引擎把 `\%` 当成字面量「反斜杠 + 百分号」去匹配——**实际找不到任何含 `100%` 的内容**。PostgreSQL/MySQL 也是一样，必须显式 `ESCAPE '\\'`。
- **影响**：
  1. 用户搜 `100%` 永远无结果（即使数据库有）
  2. 用户搜 `a_b`（含下划线）会变成通配符匹配（任意字符）——这才是转义本来要防的，反而**留下一个通配符注入隐患**（虽然只能查本业务表，影响有限，但属于语义错误）
  3. 修复后两个问题一起解决
- **建议**：
  ```typescript
  conditions.push(`p.content LIKE ? ESCAPE '\\'`)
  const escapedSearch = search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  params.push(`%${escapedSearch}%`)
  ```
  注意：JS 字符串里 `\\\\` 是 2 字节 `\\`，SQL 看到 1 字节 `\`；SQLite 解析后 `LIKE ... ESCAPE '\'` 才会启用。

---

### Bug #4 — P2（安全/UX：图片 URL 协议校验「静默跳过」太宽松）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/posts.ts:367-372`
- **问题**：
  ```typescript
  // BUG-548: Validate image URL format
  try {
    const parsed = new URL(img.url)
    if (!['https:', 'http:'].includes(parsed.protocol)) continue
  } catch { continue }
  ```
  协议非 http/https 时 `continue`——**静默丢弃**该图片，请求仍然 200 返回。
- **影响**：
  1. **XSS 试探无反馈**：攻击者 POST 含 `javascript:alert(1)` / `data:text/html,<script>...` 的图片列表，server 默默丢弃，攻击者不知道是协议被拒还是其他原因
  2. **SSRF 探测同样静默**（虽然 Cloudflare Workers outbound 限制已能挡大部分，但留观感不好）
  3. **正常用户误输 `https//x.com/...`（漏冒号）** 也被静默丢弃，前端只看到「图片少了」无法排查
  4. **没记日志**——安全告警系统无信号
- **建议**：
  ```typescript
  try {
    const parsed = new URL(img.url)
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      console.warn('[posts] blocked non-http(s) image URL:', img.url.slice(0, 100), 'user:', user.sub)
      return c.json({ error: `图片 URL 必须以 http(s) 开头 (位置 ${i})` }, 400)
    }
  } catch {
    return c.json({ error: `图片 URL 格式不合法 (位置 ${i})` }, 400)
  }
  ```
  至少记一行 warn 日志，理想是 400 拒绝整个请求并告诉前端哪张图有问题。

---

### Bug #5 — P2（性能：`authMiddleware` 每次都查 `users.password_changed_at`）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/middleware/auth.ts:80-93`
- **问题**：每个受保护请求都多一次 D1 读：
  ```typescript
  if (payload.iat > 0) {
    const user = await queryOne<{ password_changed_at: string | null }>(
      c.env.abdl_space_db,
      'SELECT password_changed_at FROM users WHERE id = ?',
      [payload.sub]
    )
    ...
  }
  ```
- **影响**：
  1. 高频端点（`POST /likes`、`POST /posts`、`GET /posts/:id`）每次 +1 D1 round-trip
  2. Cloudflare D1 在同 region 延迟 5-20ms，p99 抖动更大
  3. N+1 优化已经把 DB 调用数从 `5N+1` 压到 `4`——但这一条又把 `+1` 加回来了，相当于把性能改进对冲掉一部分
- **建议**（按收益排序）：
  1. **缓存 60s**：用 `Cache API` 或 Workers KV 缓存 `user_id → password_changed_at`（这值 99% 时间不变）
  2. **降级到可选**：把检查挪到具体路由里，只对真正需要 session 失效的端点（`/auth/*`、`/admin/*`、`/users/me/*`）强制检查；其他端点跳过
  3. **加索引**：`CREATE INDEX idx_users_pwd_changed ON users(id, password_changed_at)`（覆盖索引，零成本）

---

### Bug #6 — P3（代码质量：`key_split.ts` 验证条件操作符优先级模糊）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/key_split.ts:42`
- **问题**：
  ```typescript
  if (!cipherB64 || !cipherB64.includes('+') && !cipherB64.includes('/') && cipherB64.length < 20) {
    throw new Error('Invalid encrypted key format')
  }
  ```
  JS 优先级 `!` > `&&` > `||`，实际解析为：
  ```typescript
  if (!cipherB64 || (!cipherB64.includes('+') && !cipherB64.includes('/') && cipherB64.length < 20))
  ```
  由于下面还有 `if (combined.length < 13) throw` 兜底，**实际能跑**——但阅读门槛高，且「短但有 + 或 /」的输入能穿过第一道检查（被第二道挡住）。
- **建议**：
  ```typescript
  if (!cipherB64) throw new Error('Empty ciphertext')
  const isStandardBase64 = /^[A-Za-z0-9+/=]+$/.test(cipherB64)
  if (!isStandardBase64 && cipherB64.length < 20) throw new Error('Invalid encrypted key format')
  ```
  或者更简单：直接 `if (!cipherB64 || cipherB64.length < 20) throw`——让长度和内容合法性都过第二道 `combined.length < 13` 检查。

---

### Bug #7 — P3（安全：API key 加密 salt 硬编码）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/api_keys.ts:11`
- **问题**：`salt: enc.encode('abdl-api-keys')`——所有 api_keys 共享同一个 salt。
- **影响**：因为主密钥是 server-side secret（`ENCRYPT_KEY || JWT_SECRET`），rainbow table 攻击不现实，**实际风险低**。但 PBKDF2 salt 的本意是「让同一密码派生出不同密钥」——这里违背了设计意图。
- **建议**：把 salt 改用每行随机值，存到数据库 `key_salt` 列里。或者直接用 HKDF（`src/routes/key_split.ts:25` 已经在用），更地道：
  ```typescript
  async function deriveEncKey(password: string, salt: Uint8Array) {
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'HKDF', false, ['deriveKey'])
    return crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('abdl-api-keys-v1') },
      keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    )
  }
  ```

---

### Bug #8 — P3（安全/UX：重置密码未吊销 OAuth tokens）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/auth.ts:443`
- **问题**：`reset-password` 只更新了 `password_hash` 和 `password_changed_at`：
  ```typescript
  await run(db, 'UPDATE users SET password_hash = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?', [passwordHash, user.id])
  ```
  没有删除该用户的 `oauth_tokens` 行（`access_token` + `refresh_token` 仍然有效）。
- **影响**：
  1. **合法用户视角**：重置密码后，已登录的移动 App / 第三方 OAuth 客户端**仍能继续访问**——违反「重置密码应该 kill 所有会话」的用户预期
  2. **账号被攻陷视角**：若攻击者通过 email 拦截触发了重置，他们手上的 OAuth token 在重置后**仍然有效**（因为 iat=0 绕过了 `password_changed_at` 检查）
  3. 与 Bug #2 叠加：管理员改密既不能 kill admin JWT，也不能 kill OAuth token
- **建议**：在 `reset-password` 末尾加：
  ```typescript
  // 吊销所有 OAuth tokens（access + refresh）
  await run(db, 'UPDATE oauth_tokens SET revoked = 1 WHERE user_id = ?', [user.id])
  ```
  （**先确认 `oauth_tokens` 表有 `revoked` 字段**——从 `auth.ts:lookupOAuthToken` 看 `revoked: number` 字段是有的）

---

### Bug #9 — P3（防御逻辑：Wiki `author_id = null` 时任意用户可编辑）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/wiki.ts:155`
- **问题**：
  ```typescript
  if (page.author_id !== null && page.author_id !== user.sub && user.role !== 'admin') {
    return c.json({ error: 'Forbidden: not the page author' }, 403)
  }
  ```
  条件三段式：`不是 null` AND `不是自己` AND `不是 admin` → 403。
  - `author_id = null`：跳过 403，**任意登录用户可编辑**
  - `author_id = X`（非自己非 admin）：403
  - `author_id = 自己` 或 admin：放行
- **影响**：
  1. **schema 约束 `author_id INTEGER`（无 NULL 标注）**——理论上不应有 null，但代码主动处理 null 说明历史数据可能存在
  2. 若历史数据真有 null 页面，**任何登录用户能改这些「系统页」**——可能改写站点规则、协议条款等敏感内容
  3. 修复前应先 audit DB 里 `author_id IS NULL` 的页面有多少
- **建议**：把 null 视为 admin-only：
  ```typescript
  if (page.author_id === null) {
    if (user.role !== 'admin') return c.json({ error: '仅管理员可编辑系统页' }, 403)
  } else if (page.author_id !== user.sub && user.role !== 'admin') {
    return c.json({ error: 'Forbidden: not the page author' }, 403)
  }
  ```

---

### Bug #10 — P3（性能：admin 删除帖子是 N+1）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/admin.ts:194-201`
- **问题**：
  ```typescript
  const comments = await query<{ id: number }>(c.env.abdl_space_db, 'SELECT id FROM post_comments WHERE post_id = ?', [id])
  for (const cmt of comments) {
    await run(c.env.abdl_space_db, "DELETE FROM likes WHERE target_type = 'comment' AND target_id = ?", [cmt.id])
  }
  ```
  一个 1000 评论的帖子，触发 1001 次 DB 写。
- **建议**：单条 SQL：
  ```sql
  DELETE FROM likes
  WHERE target_type = 'comment'
    AND target_id IN (SELECT id FROM post_comments WHERE post_id = ?)
  ```
  或者更好：用 `ON DELETE CASCADE`（但 `likes` 不是 FK 关联，需要 schema 迁移——这个 commit 没动 schema 是合理的）

---

### 总体评价

**安全意识明显提升**——OWASP 2023 PBKDF2 600k、RFC 7519 JWT 格式、AES-GCM、密码修改失效、admin 自删防护、LIKE 转义、图片协议白名单，这些都是正确的方向。

**N+1 优化扎实**——posts/messages/reports/users 四处批量查询改造，覆盖了主要热点。

**但仍有 2 个 P1 阻塞问题**：
1. **API key 加密是单向死路**（Bug #1）——没解密路径就是给「永远读不出的数据」加了密，不如回退
2. **`adminMiddleware` 漏掉 `password_changed_at` 检查**（Bug #2）——高权限账户的 session 失效保护被绕过

**3 个 P2**（LIKE ESCAPE / 图片静默 skip / 每次 +1 DB 查询）也需要修。

**建议优先修复顺序**：
1. Bug #1（决定回退加密还是补全读取路径，二选一）
2. Bug #2（抽 `assertSessionNotStale` 共享函数）
3. Bug #3（LIKE 加 `ESCAPE` 子句，一行修复）
4. Bug #4（图片校验改为 400 拒绝 + 日志）
5. Bug #5（加覆盖索引 + 缓存，或降级到特定端点）
6. Bug #6~#10（按业务排期）

---

## [2026-06-04 01:39] 验证报告 — 764d265 修复 f520f50 P1

**范围**：`/home/ZYongX/projects/git/abdl-space` 仓库 commit `764d265`，3 文件 +35/-19

**目标**：验证 f520f50 审查报告中的 P1 修复是否到位

---

### P1 #1（子域名绕过）— ✅ 修复到位
- **变更**：`includes('m.abdl-space.top')` → `new URL(origin).hostname === 'm.abdl-space.top'`
- **新文件** `src/lib/nbw.ts:9-16` 抽出 `isMobileOrigin()` 辅助函数
- **绕过测试**（理论验证）：
  - `https://m.abdl-space.top.evil.com` → hostname = `m.abdl-space.top.evil.com` ≠ `m.abdl-space.top` → **false** ✅
  - `https://attacker-m.abdl-space.top` → hostname = `attacker-m.abdl-space.top` ≠ → **false** ✅
  - `https://m.abdl-space.top@evil.com` → hostname = `evil.com` → **false** ✅
  - `https://evil.com#m.abdl-space.top` → hostname = `evil.com` → **false** ✅
- **空值/异常处理**：`origin === ''` → false；`new URL('garbage')` 抛错 → catch 返回 false ✅

### P1 #2（auth.ts 一致性）— ✅ 修复到位
- **新文件** `src/lib/nbw.ts` 抽出 `getNBWConfig()`
- **`auth.ts:298` 旧 `nbw_code` 注册流程已改用 `getNBWConfig(c)`**（之前是直接读 `c.env.NBW_CLIENT_ID/SECRET/REDIRECT_URI`）
- **全仓库 grep 验证**：
  ```
  NBW_CLIENT_ID 仅在 src/lib/nbw.ts 出现（4 处）
  NBW_REDIRECT_URI 仅在 src/lib/nbw.ts 出现（2 处）
  ```
  路由层零硬编码 env 读取 ✅

### P2 #3（Referer 回退）— ✅ 顺手修复
- `isMobileOrigin` 只读 `Origin` 头，**Referer 回退已移除**
- 攻击面从「Origin 或 Referer 任一含 m.abdl-space.top 即通过」收窄到「必须伪造 Origin 头」（浏览器对跨域 POST 总带 Origin，且无法被 JS 篡改）

### 额外改进（顺带修了 P3 #4）
- `c: any` → 结构化类型 `c: { req: { header: (name: string) => string | undefined }; env: Env }`
- IDE 补全恢复，env 类型重构会报类型错误

---

### 残留小问题（可选）
- **`src/routes/nbw.ts:56` 注释过时**：仍写「根据请求来源（Origin/Referer）」，但实际只查 Origin
  - 影响：纯文档，零行为影响
  - 建议：改成「根据请求 Origin 返回对应配置」

---

### 验证结论

| 修复目标 | 状态 | 备注 |
|---|---|---|
| P1 #1 精确 hostname 匹配 | ✅ | `new URL(origin).hostname === 'm.abdl-space.top'` |
| P1 #2 auth.ts 复用 getNBWConfig | ✅ | 两个路由都从 `src/lib/nbw.ts` 导入 |
| P2 #3 移除 Referer 回退 | ✅ | 仅信任 Origin |
| P3 #4 c: any 类型 | ✅ | 改为结构化类型 |

**修复到位，可以 merge。** 不阻塞的残留项：
- `.env.example` 文档化移动端变量（建议下个 PR）
- `nbw.ts:56` 注释更新（一行 doc fix）
- `getNBWConfig` 调用点加 debug 日志（建议下个 PR）
