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

---

## [2026-06-04 01:43] 验证报告 — 2e510fa 修复 b61a05a P1/P2

**范围**：`/home/ZYongX/projects/git/abdl-space` 仓库 commit `2e510fa`，3 文件 +51/-50

**目标**：验证 b61a05a 审查报告中的 P1/P2 修复是否到位

---

### P1 #1（API key 加密单向死路）— ✅ 修复到位
- **diff 显示**：
  - `deriveEncKey` / `encryptValue` / `decryptValue` 三个函数**全部删除**（旧 -28 行）
  - POST handler 改为直接 `[key_value, label ?? null, provider]` 写入（无加密）
- **全仓库 grep 验证**：
  ```
  grep -rn "encryptValue\|decryptValue\|deriveEncKey" src/  → 无任何命中
  ```
- **结论**：死路代码彻底清除，回到 b61a05a 之前的状态。功能可恢复——但 at-rest 不再加密（这本来就是 review 的「方案 B」建议）

### P1 #2（adminMiddleware 漏 password_changed_at 检查）— ✅ 修复到位
- **新函数** `src/middleware/auth.ts:72-86` `assertSessionNotStale(payload, db)`：
  ```typescript
  async function assertSessionNotStale(payload, db): Promise<string | null> {
    if (payload.iat <= 0) return null  // OAuth 跳过
    const user = await queryOne<{password_changed_at: string | null}>(...)
    if (user?.password_changed_at) {
      const pwdChangedSec = Math.floor(new Date(...).getTime() / 1000)
      const tokenIat = payload.iat > 1e12 ? Math.floor(payload.iat/1000) : payload.iat
      if (tokenIat < pwdChangedSec) return 'Session expired, please login again'
    }
    return null
  }
  ```
- **调用点 grep 验证**：
  - `authMiddleware:99-101` 调用 ✅
  - `adminMiddleware:118-120` 调用 ✅
- **顺序正确**：`adminMiddleware` 先 `assertSessionNotStale`（401）→ 再 `role` 检查（403）——过期 token 不会泄露「你不是 admin」信息
- **OAuth 跳过逻辑**：`payload.iat <= 0`（`lookupOAuthToken` 写的是 `iat: 0`）正确跳过

### P2 #3（LIKE 缺 ESCAPE 子句）— ✅ 修复到位
- **diff**：`posts.ts:81` 由 `p.content LIKE ?` 改为 `"p.content LIKE ? ESCAPE '\\'"`
- **JS 字符串** `'\\'` 在 SQL 里是单个 `\`——SQLite 接受此语法
- **效果**：`100%` 现在能被正确转义为字面量匹配；`a_b` 的下划线也正确转义

### P2 #4（图片 URL 静默跳过）— ✅ 修复到位
- **diff**：
  - 帖子图片（`posts.ts:369-375`）改为 `return c.json({ error: '图片 URL 必须以 http(s) 开头' }, 400)`
  - 评论图片（`posts.ts:519-525`）同样改 400 报错
  - 协议不匹配 / URL 不合法都明确报错
- **效果**：XSS 试探（`javascript:alert(1)` / `data:text/html,...`）会得到明确的 400 响应，攻击者无法盲探

---

### 残留小问题（不阻塞 merge，但建议跟进）

**P3-A：LIKE 转义缺反斜杠预处理**（`posts.ts:83`）
当前实现：
```typescript
const escapedSearch = search.replace(/%/g, '\\%').replace(/_/g, '\\_')
```
如果用户搜索字面 `100\5`（含一个反斜杠），结果 `escapedSearch = '100\5'`→ 包裹后 `'%100\5%'`→ SQL `LIKE '%100\5%' ESCAPE '\'`→ `5` 前的 `\` 把 `5` 当 escape 字符吃掉，可能匹配到错误结果。
**更稳妥的写法**（先转反斜杠）：
```typescript
const escapedSearch = search.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
```
影响：边缘情况，实际生产中很少有用户在搜索里含反斜杠。**P3 不阻塞**。

**P3-B：`search.ts` 仍有 4 处 LIKE 无 ESCAPE**
```
src/routes/search.ts:39  d.brand LIKE ? OR d.model LIKE ?
src/routes/search.ts:67  title LIKE ? OR content LIKE ?
src/routes/search.ts:85  term LIKE ? OR definition LIKE ?
```
本 commit 只改了 `posts.ts`，搜索接口的 LIKE 通配符问题（搜 `100%` 还是无结果）依然存在。
**建议**：下个 PR 一起修，模式参考 posts.ts:81。

**P3-C：图片 400 错误把完整 URL 回显给客户端**（`posts.ts:374, 524`）
```typescript
return c.json({ error: `无效的图片 URL: ${img.url}` }, 400)
```
- 不是安全漏洞（JSON 响应，非 HTML，无 XSS）
- 但攻击者可以利用 `img.url` 字段在错误响应里塞 10MB 长字符串制造大响应（DoS amplification 风险低，因为是 POST 入口）
- **建议**：服务端 `console.warn` 记日志，响应里只回 `图片 URL 格式不合法 (位置 ${i})`

**P3-D：缺安全日志**
原本 review 建议加 `console.warn('[posts] blocked non-http(s) image URL:', ...)`，这次没加。**建议下个 PR 补**。

---

### 验证结论

| 修复目标 | 状态 | 备注 |
|---|---|---|
| **P1 #1** API key 加密回退 | ✅ | 三个函数全删，plaintext 恢复 |
| **P1 #2** adminMiddleware 检查 password_changed_at | ✅ | `assertSessionNotStale` 抽共享函数，两处都调 |
| **P2 #3** LIKE 加 ESCAPE 子句 | ✅ | `ESCAPE '\'` 已加 |
| **P2 #4** 图片 URL 校验 400 | ✅ | 帖子+评论两处都改 |

**所有 P1/P2 修复到位，可以 merge。** 4 个 P3 残留项都不阻塞：
- LIKE 反斜杠预处理（边缘 case）
- `search.ts` 同样问题（建议下个 PR 一起修）
- 错误回显完整 URL（不是漏洞但可优化）
- 缺安全日志

**报告**已写入 `BUG_REPORT.md`（commit `cfd5700` 之后追加）。

---

## [2026-06-04 02:16] 后端 32d54fd 审查报告 — Resend → 腾讯云 SES 迁移

**范围**：`/home/ZYongX/projects/git/abdl-space` 仓库 commit `32d54fd`，3 文件 +144/-41

**改动核心**：新增 `src/lib/ses.ts`（TC3-HMAC-SHA256 签名 + SendEmail 调用），`auth.ts` 改用模板发送，`nbw.ts` 一行注释更新（`Origin/Referer` → `Origin`）。

**总体**：TC3 签名实现**正确**（按官方文档逐步对照过），代码清爽。但**类型/配置层有 4 个 P1/P2 必须修**。

---

### Bug #1 — P1（类型/配置：`Env` 接口未更新，TypeScript 会报错）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/types/index.ts:278`
- **问题**：
  ```typescript
  export interface Env {
    abdl_space_db: D1Database
    JWT_SECRET: string
    RESEND_API_KEY: string          // ❌ 还在，但已无人用
    TURNSTILE_SITE_KEY?: string
    TURNSTILE_SECRET_KEY?: string
    ENCRYPT_KEY?: string
    // ❌ 缺：TENCENT_SECRET_ID, TENCENT_SECRET_KEY, SES_FROM_EMAIL, SES_TEMPLATE_ID
  }
  ```
  而 `auth.ts:168` 现在读 `c.env.TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` / `SES_FROM_EMAIL`，`auth.ts:165` 读 `c.env.SES_TEMPLATE_ID`。
- **影响**：
  1. **TypeScript 编译失败**（如果开了 `strict` + `noImplicitAny`）——`c.env` 上访问不存在的字段会报错
  2. 即使编译过，**运行时如果 env 没配**，所有 4 个字段都是 `undefined`：
     - `Number(undefined)` → `NaN` → 发送 `TemplateID: NaN` 给 TC3
     - `hmacSha256(undefined, ...)` → `TextEncoder().encode(undefined)` 抛 TypeError
  3. 用户看到「发送验证码失败，请稍后再试」但 ops 排查不知道是 env 没配
- **建议**：
  ```typescript
  export interface Env {
    abdl_space_db: D1Database
    JWT_SECRET: string
    // 移除 RESEND_API_KEY（已废弃）
    // 腾讯云 SES（必填）
    TENCENT_SECRET_ID: string
    TENCENT_SECRET_KEY: string
    SES_FROM_EMAIL: string
    SES_TEMPLATE_ID: string
    // 其他可选
    TURNSTILE_SITE_KEY?: string
    TURNSTILE_SECRET_KEY?: string
    ENCRYPT_KEY?: string
  }
  ```

---

### Bug #2 — P1（配置文档：`.env.example` 没更新）
- **文件**：`/home/ZYongX/projects/git/abdl-space/.env.example`
- **问题**：新部署看 `.env.example` 完全不知道要配腾讯云 SES 的 4 个变量。`RESEND_API_KEY` 注释也还在。
- **影响**：部署后第一次发邮件才报错，**首次用户体验**=验证码发不出去
- **建议**：在 `.env.example` 加：
  ```
  # 腾讯云 SES（验证码邮件）
  TENCENT_SECRET_ID=AKIDxxxxxxxxxxxxxxxx
  TENCENT_SECRET_KEY=xxxxxxxxxxxxxxxx
  SES_FROM_EMAIL=noreply@abdl-space.top
  SES_TEMPLATE_ID=12345
  ```
  并删除旧的 `RESEND_API_KEY` 注释

---

### Bug #3 — P2（错误处理：`Number(undefined)` 静默变成 NaN）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/routes/auth.ts:165`
- **问题**：
  ```typescript
  Number(c.env.SES_TEMPLATE_ID)  // 如果 undefined → NaN
  ```
  `NaN` JSON.stringify 成 `null`，TC3 API 会返回参数错误，但**错误信息是「TemplateID 类型不合法」**，看不出是 env 缺失。
- **影响**：故障定位慢，ops 看到「参数错误」会以为是 SES 后台问题
- **建议**：在 `send-code` 入口加显式检查：
  ```typescript
  if (!c.env.TENCENT_SECRET_ID || !c.env.TENCENT_SECRET_KEY || !c.env.SES_FROM_EMAIL || !c.env.SES_TEMPLATE_ID) {
    console.error('[send-code] SES env vars missing:', {
      TENCENT_SECRET_ID: !!c.env.TENCENT_SECRET_ID,
      TENCENT_SECRET_KEY: !!c.env.TENCENT_SECRET_KEY,
      SES_FROM_EMAIL: !!c.env.SES_FROM_EMAIL,
      SES_TEMPLATE_ID: !!c.env.SES_TEMPLATE_ID,
    })
    return c.json({ error: '邮件服务未配置' }, 503)  // 503 Service Unavailable
  }
  ```

---

### Bug #4 — P2（错误处理：`res.json()` 可能抛错未捕获）
- **文件**：`/home/ZYongX/projects/git/abdl-space/src/lib/ses.ts:113-127`
- **问题**：
  ```typescript
  const res = await fetch(...)
  const data = await res.json() as { Response?: {...} }  // ⚠️ 非 JSON 会抛 SyntaxError
  if (!res.ok || data.Response?.Error) { ... }
  ```
  - 如果 TC3 返回 HTML 错误页（5xx 维护期），`res.json()` 抛 `SyntaxError`
  - 网络层 `fetch` 失败（DNS/timeout/TLS）会抛 `TypeError`
  - 这些错误**不会被** `if (!res.ok)` 拦截，**直接抛到调用方**（auth.ts 的 try/catch 兜住）
  - 但 SES.ts 内部「不知道」发生了什么，console.error 打出来的 stack trace 会从 `res.json()` 起点而不是 `fetch` 起点
- **影响**：错误日志定位不友好，但功能不破
- **建议**：
  ```typescript
  let data: any
  try {
    data = await res.json()
  } catch {
    throw new Error(`SES: invalid JSON response (status ${res.status})`)
  }
  // 加上超时控制
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 10_000)  // 10s
  try {
    const res = await fetch(url, { ..., signal: controller.signal })
    // ...
  } finally {
    clearTimeout(timeoutId)
  }
  ```

---

### 总体评价

**TC3 签名实现是正确的**——按官方文档 4 步法逐步对照过：
1. ✅ CanonicalRequest 格式（POST / + 空 query + headers + signed-headers + payload-hash）
2. ✅ StringToSign（algorithm + timestamp + credential-scope + canonical-hash）
3. ✅ Signature 三层 HMAC 链（TC3+secretKey → date → service → tc3_request）
4. ✅ Authorization 头格式（Credential + SignedHeaders + Signature）

**代码风格也清爽**：
- 用 `env` 参数注入（可测试，不依赖全局）
- `TriggerType=1` 是触发类（验证码）专用通道 ✅
- 重命名 `RESEND_COOLDOWN_SECONDS → EMAIL_COOLDOWN_SECONDS`（provider-neutral）✅
- 移除 `sendEmail` / `codeEmailHtml` 死代码 ✅

**但 4 个配置/错误处理问题需要修**：
1. **#1 (P1) `Env` 类型未更新**——TS 编译失败 + 运行时 NaN
2. **#2 (P1) `.env.example` 未文档化**——首次部署必踩坑
3. **#3 (P2) `Number(undefined)` 静默 NaN**——错误信息不友好
4. **#4 (P2) `res.json()` 未捕获 + 无超时控制**——错误日志不友好

**签名本体没问题，merge 前补一下 env 配置和错误处理。**

---

### 次要观察（不阻塞）

- `auth.ts:163-168` 用内联对象字面量传 env，可读性 OK 但稍冗长；如果将来有 2+ 处调用，可考虑在 `ses.ts` 接受完整 `Env` 类型
- `Subject` 字段在用 `Template` 时是 optional 覆盖；模板里若定义了主题，body 的 `Subject` 可能被忽略——建议 ops 在 SES 后台模板里固定主题，让 body 不传
- 频率限制变量重命名后，原先若有外部脚本/文档引用 `RESEND_COOLDOWN_SECONDS` 字面量会断——grep 一下文档
- 没看到 401/403 等鉴权错误重试逻辑（TC3 偶尔会返回 500），生产环境加一个 1-2 次的指数退避更稳

---

### 验证方法（推荐 CI 加）
写个 unit test 对照 TC3 官方 Node.js SDK 签出来的 Authorization 头，与本实现对比——一次验证终身放心：

```typescript
import { signRequest } from './ses.ts'  // 需 export
const expected = /* 官方 SDK 算出来的 Authorization */
const got = await signRequest(secretId, secretKey, 'DescribeUsers', '{}', 1700000000)
console.assert(got.Authorization === expected, 'TC3 signature mismatch')
```

---

## [2026-06-04 02:22] 验证报告 — f431cd0 + ef82eeb 修复 32d54fd P1/P2

**范围**：
- `f431cd0`（修复）3 文件 +38 行
- `ef82eeb`（文档）1 文件 +21 行

**目标**：验证 32d54fd 审查报告的 P1/P2 修复是否到位

---

### P1 #1（Env 类型接口）— ✅ 修复到位
**`src/types/index.ts:275-292`** 当前状态：
```typescript
export interface Env {
  abdl_space_db: D1Database
  JWT_SECRET: string
  FRONTEND_ORIGIN?: string
  // 腾讯云 SES
  TENCENT_SECRET_ID: string      // ✅ 新增必填
  TENCENT_SECRET_KEY: string     // ✅ 新增必填
  SES_FROM_EMAIL: string         // ✅ 新增必填
  SES_TEMPLATE_ID: string        // ✅ 新增必填
  // NBW OAuth
  NBW_CLIENT_ID?: string         // ✅ 补全（可选）
  NBW_CLIENT_SECRET?: string
  NBW_REDIRECT_URI?: string
  NBW_CLIENT_ID_MOBILE?: string  // ✅ 移动端三件套
  NBW_CLIENT_SECRET_MOBILE?: string
  NBW_REDIRECT_URI_MOBILE?: string
  // 其他
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  DEEPSEEK_API_KEY?: string      // ✅ 顺手补
  ENCRYPT_KEY?: string
}
```
- **RESEND_API_KEY 已移除** ✅
- **4 个 SES 必填**（无 `?`）—— deploy 时必须设，否则 TS 编译失败
- **6 个 NBW 可选**（带 `?`）—— getNBWConfig 的 fallback 链生效
- **`DEEPSEEK_API_KEY` 顺手补**（`recommend.ts:220` 早就用着，没在 Env 声明过）✅

### P1 #2（.env.example 文档化）— ✅ 修复到位
**`ef82eeb`** +21 行：
- SES 4 个变量**未注释**（必填，示例值可直接复用）：
  ```
  TENCENT_SECRET_ID=your-tencent-secret-id
  TENCENT_SECRET_KEY=your-tencent-secret-key
  SES_FROM_EMAIL=ABDL Space <admin@abdl-space.top>
  SES_TEMPLATE_ID=100000
  ```
- NBW 6 个变量**注释**（可选，fallback 到主站或空）：
  - `NBW_REDIRECT_URI=https://abdl-space.top/auth/nbw/callback`
  - `NBW_REDIRECT_URI_MOBILE=https://m.abdl-space.top/auth/nbw/callback` ← 与之前部署前提醒的 URL 一致
- Turnstile 2 个 + DeepSeek 1 个变量**注释**

### P2 #3（env 入口显式检查）— ✅ 修复到位
**`src/lib/ses.ts:99-103`**：
```typescript
if (!env.TENCENT_SECRET_ID || !env.TENCENT_SECRET_KEY || !env.SES_FROM_EMAIL) {
  throw new Error('SES env missing: TENCENT_SECRET_ID / TENCENT_SECRET_KEY / SES_FROM_EMAIL')
}
if (!templateId || isNaN(templateId)) {
  throw new Error('SES_TEMPLATE_ID is missing or not a number')
}
```
- 缺失字段 → 明确错误（含字段名），不再静默 NaN
- `!templateId` 顺便挡了 `0`（SES 模板 ID 从 1 起）
- 抛错在 auth.ts catch 块里被 `console.error('SES error:', err)` 记录，客户端仍是通用 500（不泄露内部信息）✅

### P2 #4（fetch 超时 + json 保护）— ✅ 修复到位
**`src/lib/ses.ts:130-156`**：
```typescript
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)  // 10s

let res: Response
try {
  res = await fetch(url, { ..., signal: controller.signal })
} catch (e) {
  clearTimeout(timeout)  // 失败路径也清理
  throw new Error(`SES fetch failed: ${e instanceof Error ? e.message : 'timeout'}`)
}
clearTimeout(timeout)  // 成功路径也清理

let data: { Response?: {...} }
try {
  data = await res.json()
} catch {
  const text = await res.text().catch(() => '')  // 二次 try/catch 防 res.text() 也抛
  throw new Error(`SES invalid response (${res.status}): ${text.slice(0, 200)}`)  // 截断 200 字符防日志洪水
}
```
- ✅ AbortController + 10s 超时（FETCH_TIMEOUT_MS 常量）
- ✅ 成功/失败两路径都 clearTimeout（无 timer 泄漏）
- ✅ res.json() try/catch 兜底
- ✅ res.text() 也 try/catch 二次保护
- ✅ 错误消息截断 200 字符（避免长 HTML 错误页把日志撑爆）

---

### 残留小问题（不阻塞 merge）

**P3-A：env 错误信息泄露字段名但客户端不知**
- 现状：用户看到「发送验证码失败，请稍后再试」（500）
- ops 看到 console.error「SES env missing: TENCENT_SECRET_ID / TENCENT_SECRET_KEY / SES_FROM_EMAIL」
- 这是**正确的**（不向客户端泄露内部配置），但建议加 Sentry / 日志告警，让 ops 第一时间发现

**P3-B：超时时间 10s 偏长**
- TC3 SendEmail 一般 100-500ms 返回
- 10s 容忍网络抖动够用，但**用户卡 10s** 体验差
- 建议：先用 3-5s，监控 p99 慢慢调（或者前端加 loading 提示让用户知道在转）

**P3-C：缺少 TC3 错误码的语义化映射**
- 现在所有 SES 错误统一转成 500
- TC3 错误码（`AuthFailure` / `LimitExceeded` / `InvalidParameter`）可以分类：
  - `AuthFailure.SignatureFailure` → ops 告警（密钥错了）
  - `LimitExceeded.EmailFrequency` → 429（用户要等）
  - `InvalidParameter` → 500 但要 log 含 RequestId
- 建议：加个错误码白名单表，先把 `LimitExceeded` 翻成 429

**P3-D：SES_FROM_EMAIL 实际格式疑问**
- 示例 `ABDL Space <admin@abdl-space.top>` 是 SES API 接受的 FromEmailAddress 格式
- 但**实际发件人**需要在 SES 后台通过 domain 验证（DKIM/SPF），否则进垃圾箱
- 建议：README 写明 SES 后台配置步骤

---

### 验证结论

| 修复目标 | 状态 | 关键证据 |
|---|---|---|
| **P1 #1** Env 类型补全 | ✅ | RESEND_API_KEY 删除；4 个 SES 必填 + 6 个 NBW 可选 + 1 个 DeepSeek |
| **P1 #2** .env.example 文档化 | ✅ | 21 行新增，SES 必填项未注释，NBW 可选项注释 |
| **P2 #3** env 显式检查 | ✅ | ses.ts 入口 2 个 if，错误信息含字段名 |
| **P2 #4** fetch 超时 + json 保护 | ✅ | AbortController + 10s + 双重 try/catch + text 截断 |

**所有 P1/P2 修复到位，可以 merge 部署。** TC3 签名实现未动（之前验证正确，回归风险零）。

**报告**已写入 `BUG_REPORT.md`（commit `0e72f2c` 之后追加）。

**最终部署 checklist 提醒**：
1. Cloudflare Dashboard 加 env vars（4 个 SES 必填 + 6 个 NBW 选填 + 2 个 Turnstile 选填 + 1 个 DeepSeek 选填）
2. **`NBW_CLIENT_SECRET_MOBILE` rotate**（之前 chat 里明文贴过，视为泄露）
3. D1 跑 `ALTER TABLE users ADD COLUMN password_changed_at DATETIME;`（如果之前没跑过）
4. 第一次部署后**发一封测试邮件**验证 SES 模板 ID 正确

## [2026-06-04 18:53] 审查报告 — 验证码 v2 + 安全中心 + SES_REGION 配置化

**审查范围**：`/home/ZYongX/projects/git/abdl-space` 4 个 commit（`ae91d7f` / `2e76383` / `4cfcbb6` / `69f01ad`），后端 6 文件 + 前端 5 文件

**改动核心**：
- 后端 `captcha.ts` 重写：节点位置随机化、隐蔽 ctx HMAC、行为分析、security_logs 记录
- 后端 `admin.ts` 新增 `/security/logs` + `/security/stats` API
- `risk-assessment.ts` 阈值从 40 降到 25，UA 短字符从 < 20 改 < 50
- `ses.ts` 新增 `SES_REGION` 配置
- 前端 `useInlineVerify.jsx` 全新 hook，绕过 embed.js SDK
- 前端 `VerifyModal.jsx` 改为 Quantum→Turnstile
- `AdminPage.jsx` 新增「安全」Tab

**总体评价**：**5 个 P0（其中 2 个生产环境可被利用）必须先修**。验证码系统的「前后端整合」完全没有完成——前端费力气收集 token 提交，后端**完全忽略**。安全中心 API 漏了 `adminMiddleware`，任何人可读所有安全日志。ctx 隐蔽上下文校验逻辑是反的，行为分析在前端没接入。

---

### Bug #1 — P0（安全：安全中心 API 完全无鉴权）
- **文件**：`src/routes/admin.ts:427, 449`
- **问题**：
  ```typescript
  // src/routes/admin.ts:427
  admin.get('/security/logs', async (c) => {  // ❌ 缺 adminMiddleware
    ...
  })
  // src/routes/admin.ts:449
  admin.get('/security/stats', async (c) => {  // ❌ 缺 adminMiddleware
    ...
  })
  ```
  对比 `admin.get('/stats', adminMiddleware, ...)`（line 34）、`admin.get('/users', adminMiddleware, ...)`（line 55）等所有其他 admin 端点，**只有这两个新加的端点漏了 `adminMiddleware`**。
- **影响**：
  1. **任何匿名用户**（无登录、无 cookie）`GET /api/admin/security/logs` 即可读取 `security_logs` 全表
  2. 暴露的字段包括 `session_id`、`score`（行为评分）、`details`（完整 JSON，含 `clickTimes` 数组、`总用时`、触摸事件、`screen` 分辨率、`tz` 时区）、`event_type`
  3. `security_logs` 表有 `ip` 和 `user_agent` 列（migration 定义了），但 `logSuspiciousBehavior` INSERT 时**没写这两个字段**——所以攻击者目前拿不到真实 IP/UA，但能拿到可疑行为画像
  4. `/security/stats` 暴露「24h 可疑事件数」「7 天事件分布」「按小时趋势」「评分分级（critical/warning/info/normal）」——攻击者可据此**摸清防御节奏**、找到低谷时段批量攻击
- **建议**：
  ```typescript
  admin.get('/security/logs', adminMiddleware, async (c) => { ... })
  admin.get('/security/stats', adminMiddleware, async (c) => { ... })
  ```
  修复前可以临时在两个 handler 开头加 `const user = c.get('user'); if (!user || user.role !== 'admin') return c.json({error: 'forbidden'}, 403)`。

---

### Bug #2 — P0（安全：auth.ts 完全忽略 captchaToken）
- **文件**：`src/routes/auth.ts:83-180`（send-code）、`223-330`（register）、`336-376`（login）
- **问题**：
  1. **前端发送**（`client/src/contexts/AuthContext.jsx:87-95, 129-136`）：
     ```jsx
     const headers = { 'Content-Type': 'application/json' };
     if (captchaToken) headers['X-Captcha-Token'] = captchaToken;  // ✅ 客户端有发
     ```
  2. **后端接收**（`src/routes/auth.ts:336-376`）：
     ```typescript
     const body = await c.req.json<LoginRequest>()
     const { login, password } = body  // ❌ 没读 captchaToken
     // 而且 LoginRequest 类型里就只有 { login, password }，没有 captchaToken
     ```
  3. 全仓库 grep 结果：
     ```
     grep "X-Captcha-Token\|captcha_token\|verifyCaptchaToken" src/routes/auth.ts → 0 命中
     grep "captchaToken" src/routes/  → 0 命中
     ```
  4. `captchaMiddleware`（`src/middleware/captcha.ts`）也**从未被任何路由 import**（全仓库 grep 0 命中 `captchaMiddleware` 的实际引用）
- **影响**：
  1. **整个 captcha 系统对 auth 端点零保护**——攻击者根本不需要过验证，可直接暴力撞库
  2. 前端 useInlineVerify / VerifyModal 收集的 token 是「空气 token」，传给后端就丢了
  3. 风险评估接口（`/api/captcha/risk`）给高风险 IP 返回 `flow: 'both'`，用户要多做一遍 Turnstile——但**后端根本不强制**，等于「给用户多添堵但对攻击者没效果」
  4. 设计意图（防撞库、防刷注册）完全失败
- **建议**（按优先级）：
  1. **方案 A（推荐）**：在 `auth.post('/login')` / `/register` / `/send-code` 三个端点读 `X-Captcha-Token` 头，调 `verifyCaptchaToken` 校验——但要先修 Bug #3（签名问题）
  2. **方案 B**：把 `captchaMiddleware` 挂到这三个端点（`auth.post('/login', captchaMiddleware, ...)`），并修 Bug #3 + #4
  3. **方案 C**：在限流层加 captcha token 校验（`checkD1RateLimit` 接受 token，token 存在时放行 10x 配额）

---

### Bug #3 — P0（安全：captcha token 签名未验证，可任意伪造）
- **文件**：`src/lib/captcha.ts:195-221`
- **问题**：
  ```typescript
  function createToken(sessionId: string, secret: string): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '')
    const payload = btoa(JSON.stringify({ sub: sessionId, iat: now, exp: now + TOKEN_TTL_S, type: 'captcha' })).replace(/=/g, '')
    const sig = btoa(sessionId + secret + now).replace(/=/g, '').slice(0, 43)  // ❌ 只是 btoa + 截断
    return `${header}.${payload}.${sig}`
  }

  export function verifyToken(token: string, secret: string): boolean {
    try {
      const parts = token.split('.')
      if (parts.length !== 3) return false
      const payload = JSON.parse(atob(parts[1]))
      if (payload.exp < Math.floor(Date.now() / 1000)) return false
      if (payload.type !== 'captcha') return false
      return true  // ❌ 从不校验签名！secret 参数都没用
    } catch { return false }
  }
  ```
- **影响**：
  1. 攻击者可手工构造：把 `{"sub":"x","iat":now,"exp":<2min later>,"type":"captcha"}` base64 一下，header 也 base64 一下，signature 随便填三个字符——**`verifyToken` 一律返回 true**
  2. 当前 captchaMiddleware 没被任何路由使用（见 Bug #2），所以**暂未造成实际损失**——但如果有人按 Bug #2 方案 B 把 `captchaMiddleware` 挂上去，攻击者立刻就能 100% 绕过
  3. 等于本 commit 引入了一个「将来一接就崩」的地雷
- **建议**：用 Web Crypto API 实现标准 HS256：
  ```typescript
  async function createToken(sessionId: string, secret: string): Promise<string> {
    const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
    const now = Math.floor(Date.now() / 1000)
    const payload = b64url(JSON.stringify({ sub: sessionId, iat: now, exp: now + TOKEN_TTL_S, type: 'captcha' }))
    const data = `${header}.${payload}`
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
    const sig = b64urlBytes(new Uint8Array(sigBuf))
    return `${data}.${sig}`
  }

  export async function verifyToken(token: string, secret: string): Promise<boolean> {
    const [header, payload, sig] = token.split('.')
    if (!header || !payload || !sig) return false
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const valid = await crypto.subtle.verify('HMAC', key, new TextEncoder().encode(`${header}.${payload}`), b64urlDecode(sig))
    if (!valid) return false
    const claims = JSON.parse(atob(payload))
    return claims.exp > Math.floor(Date.now() / 1000) && claims.type === 'captcha'
  }
  ```
  注意改成 async——`verifyCaptchaToken` 调用点也要 `await`。

---

### Bug #4 — P0（构建/类型：`verifyCaptchaToken` 未导出，import 会报 undefined）
- **文件**：`src/middleware/captcha.ts:3, 20` vs `src/lib/captcha.ts:209`
- **问题**：
  ```typescript
  // src/middleware/captcha.ts:3
  import { verifyCaptchaToken } from '../lib/captcha.ts'   // ❌ 没这个导出

  // src/middleware/captcha.ts:20
  const valid = await verifyCaptchaToken(token, c.env.JWT_SECRET)  // ❌ undefined

  // src/lib/captcha.ts:209
  export function verifyToken(token: string, secret: string): boolean { ... }  // 实际叫 verifyToken
  ```
- **影响**：
  1. TypeScript 编译会报 TS2305: 「Module has no exported member 'verifyCaptchaToken'」——如果 CI 开了 `noImplicitAny` 或 `strict` 就直接 fail
  2. 如果绕过 TS 编译（Cloudflare Workers 默认不在 build 时检查），运行期会抛 `verifyCaptchaToken is not a function`
  3. 该中间件当前**没被任何路由 import**（grep 验证 0 命中），所以是个埋着的雷——一旦有人按 Bug #2 方案 B 挂上去就立刻爆
- **建议**：把 `src/lib/captcha.ts:209` 的 `verifyToken` 重命名为 `verifyCaptchaToken`（和 middleware import 名一致），或者在 middleware 改 import 名为 `verifyToken`。**Bug #3 修复后顺带改**。

---

### Bug #5 — P0（安全：ctx 隐蔽上下文校验逻辑反了）
- **文件**：`src/lib/captcha.ts:124-147`（createContextToken / verifyContextToken）、`383-393`（verify 调用）
- **问题**：
  ```typescript
  // 创建挑战时：order = 原始正确顺序
  const order = shuffleArray(NODE_IDS)
  const ctx = await createContextToken(sessionId, nodes, order, secret)  // ctx 是 (sessionId, nodes, 原始order) 的 HMAC

  // 验证时（line 380-383）：
  const challengeData = JSON.parse(session.challenge)
  const order = answer.split(',')           // ❌ order 取的是用户答案！
  const ctxValid = await verifyContextToken(ctx, sessionId, challengeData.nodes, order, secret)
  ```
  ```typescript
  // verifyContextToken（line 138-147）：
  async function verifyContextToken(ctx, sessionId, nodes, order, secret) {
    const expected = await createContextToken(sessionId, nodes, order, secret)  // 用传入的 order 算 HMAC
    return ctx === expected
  }
  ```
  也就是说：**HMAC 用「用户提交的答案」做输入**重新算一遍，然后跟「原始 ctx」比较。
- **后果推导**：
  - 用户答案正确 → `order = 原始order` → `expected = HMAC(原始order)` = 原始 ctx → 校验通过
  - 用户答案错误 → `order ≠ 原始order` → `expected = HMAC(错误order)` ≠ 原始 ctx → 校验失败
  - **ctx 校验完全退化成「答案正确性」的二次确认**——和 HMAC「防篡改」的语义毫无关系
- **真实攻击场景**：
  1. 攻击者调用 `/api/captcha/challenge` 拿到 challenge（含 nodes、ctx）
  2. 攻击者**完全不需要 ctx**——只要把所有 5! = 120 种排列都试一遍，**纯靠答案穷举**就能过
  3. 服务端 ctx 校验对穷举攻击零保护
  4. 5 次锁定 + 5 分钟冷却 → 240 秒可试 5 次 = 4 分钟/次 → 5! = 120 次需要 120 × 4 = **8 小时**才能穷举完（理论值）——但 `attempts` 是 session 级锁定，攻击者可以反复 `/challenge` 拿新 session
  5. 每次 `/challenge` 限速 `IP_MAX_CHALLENGES = 20`/5min → 攻击者 5min 内可拿 20 个新 session × 5 次 attempts = **100 次/5min**，8h 就能穷举 9600 次——5! 远远够
- **建议**：ctx 校验应该用「原始 ctx 字符串直接比较」或「HMAC 用原始 order 校验」：
  ```typescript
  // 方案 A（最简单）：存的就是 ctx，直接比
  async verify(db, sessionId, answer, secret, behavior, ctx) {
    ...
    const challengeData = JSON.parse(session.challenge)
    if (ctx !== challengeData.ctx) {
      // ctx 被篡改或重放（注意：重放防护要靠 session.used 标记，靠 ctx 比对不够）
      console.warn(`[Captcha] Context mismatch for session ${sessionId.slice(0, 8)}`)
    }
    // 然后保留 answer hash 校验作为主要验证手段
  }

  // 方案 B（保留 HMAC 语义）：把 order 也存到 challenge JSON 里
  // 改 challengeData = { nodes, width, height, ctx, originalOrder: order }
  // 然后 verify 时用 challengeData.originalOrder 算 HMAC 与 ctx 比较
  ```
  顺带：**`session.used` 标记是真正的防重放机制**——但需要 `verifyToken` 之后立刻 `UPDATE ... SET used = 1`（当前已实现）——这个不能漏。
  实际生产环境的真正安全靠的是：① 节点位置随机 + ② HMAC ctx + ③ 答案 hash + ④ session 过期 + ⑤ attempts 锁定。当前 #1/#3/#4/#5 都到位，只有 #2（HMAC ctx）反了，攻击者可绕过 ctx 校验但仍需穷举 5! 答案。**先修这个**。

---

### Bug #6 — P1（功能：行为分析是死代码，前端从不发 behavior）
- **文件**：`client/src/components/useInlineVerify.jsx:268-274` vs `src/lib/captcha.ts:354-421`
- **问题**：前端 `submitQuantum` 的 fetch body：
  ```jsx
  body: JSON.stringify({
    session_id: quantumState.sessionId,
    answer: sequence.join(','),
    ctx: quantumState.ctx,
  }),  // ❌ 没有 behavior 字段
  ```
  后端 `assessBehavior(null)` 永远返回 50（中间分）：
  ```typescript
  function assessBehavior(data: BehaviorData | null): number {
    if (!data) return 50
    ...
  }
  ```
- **影响**：
  1. `behavior_score` 字段在响应里永远是 50（除非有人直接 curl 调 API 传假数据）
  2. `if (behaviorScore < 30)` 分支永远不进入
  3. `logSuspiciousBehavior` 几乎不会被调用
  4. `security_logs` 表基本空着，安全中心的「事件趋势」一片空白
- **建议**：
  - **方案 A（推荐）**：前端在 useInlineVerify 里加行为采集（mousemove 节流存轨迹、click 时间戳、节点悬停时长），提交时一起发
  - **方案 B**：去掉行为分析逻辑，简化代码——既然 UI 没采就别假装分析了
  - 顺带把 `BehaviorData.轨迹` 中文 key 改成英文 `mousePath`（跨工具链友好，避免某些 IDE/lint 误报）

---

### Bug #7 — P1（安全/UX：Turnstile 回调无 stale guard，关闭后仍标记成功）
- **文件**：`client/src/components/useInlineVerify.jsx:228-249`（renderTurnstile 的 callback）、`useEffect` 在 phase 变化时
- **问题**：
  ```jsx
  callback: async (token) => {
    try {
      const res = await fetch(`${API_BASE}/api/captcha/turnstile/verify`, ...)
      const result = await res.json()
      if (result.success) {
        tokenRef.current = token
        if (mode === 'both') { finishVerify(); } else { finishVerify(); }  // ❌ 不检查组件是否还 active
      }
    }
  }
  ```
  `cleanup()` 会移除 Turnstile widget + 清理 timer，但**没有 abort 标记**。如果用户点 × 关闭弹窗 → cleanup() 跑了，但 Turnstile 的内部 `await fetch` 还在飞，resolve 后会调 `finishVerify()` → `setVerified(true)`，导致：
  - 用户看到「验证已放弃」却实际 verified=true → 下次 submit 携带这个已过期的 captchaToken
  - tokenRef.current 被覆盖为「已关闭后获得的 token」，逻辑混乱
- **建议**：
  ```jsx
  const activeRef = useRef(false)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  callback: async (token) => {
    if (!activeRef.current) return  // ✅ stale guard
    ...
  }

  cleanup: () => {
    activeRef.current = false
    ...
  }
  ```
  同样适用于 `submitQuantum` 的 fetch 回调。

---

### Bug #8 — P1（竞态：重试按钮 + 多次 trigger 产生多个 in-flight 请求）
- **文件**：`client/src/components/useInlineVerify.jsx:113-130`（risk effect）、`438-446`（重试按钮）
- **问题**：
  ```jsx
  // 风险接口 effect
  useEffect(() => {
    if (!active) return;
    (async () => {
      const res = await fetch(`${API_BASE}/api/captcha/risk`, ...)
      if (!res.ok) throw new Error('Risk assessment failed');
      const data = await res.json();
      setFlow(data.flow);
      ...
    })();  // ❌ 无 cleanup、无 AbortController
  }, [active, retryCount]);  // retryCount 变化 → 重发

  // 重试按钮
  onClick={() => { setError(null); setRetryCount(c => c + 1); }}
  ```
  场景：用户连点 3 下「重试」→ retryCount 0→1→2→3 → 4 个 `/risk` 请求并发飞，**最后一个 resolve 决定 phase**。中间 resolve 会被覆盖，phase 短暂闪烁。
  另外：用户点 trigger() 多次（首次 active=true → cleanup 还没跑完 → 第二次 trigger()）也会产生孤儿 effect。
- **建议**：
  1. 用 `useRef` 存 abort controller，cleanup 里 abort：
     ```jsx
     const abortRef = useRef(null)
     useEffect(() => {
       if (!active) return
       const ac = new AbortController()
       abortRef.current = ac
       ;(async () => {
         try {
           const res = await fetch(..., { signal: ac.signal })
           ...
         } catch (e) { if (e.name === 'AbortError') return; ... }
       })()
       return () => ac.abort()
     }, [active, retryCount])
     ```
  2. 在 `cleanup()` 里 abort：`abortRef.current?.abort()`

---

### Bug #9 — P1（内存泄漏：startCountdown 内的 setTimeout 不可清理）
- **文件**：`client/src/components/useInlineVerify.jsx:163-176`
- **问题**：
  ```jsx
  function startCountdown() {
    ...
    timerRef.current = setInterval(() => {
      ...
      if (remaining <= 0) {
        clearInterval(timerRef.current)
        setQuantumState(s => ({ ...s, timerExpired: true, ... }))
        setHint('超时，正在重新加载...')
        setTimeout(() => createQuantumChallenge(), 800)  // ❌ 没存 ref
      }
    }, 200)
  }
  ```
  `cleanup()` 清理了 `timerRef.current` 但**不清理 `setTimeout`**。场景：
  1. 倒计时归零 → 启动 800ms setTimeout
  2. 用户立刻点 × 关闭 → cleanup 跑（active=false）
  3. 800ms 后 setTimeout 触发 `createQuantumChallenge()` → fetch + setState on unmounted-like state
  4. React 会 warn "Can't perform a React state update on an unmounted component"
- **建议**：
  ```jsx
  const setTimeoutRef = useRef(null)
  function startCountdown() {
    ...
    if (setTimeoutRef.current) clearTimeout(setTimeoutRef.current)
    timerRef.current = setInterval(() => {
      ...
      if (remaining <= 0) {
        ...
        setTimeoutRef.current = setTimeout(() => {
          if (activeRef.current) createQuantumChallenge()  // ✅ stale guard
        }, 800)
      }
    }, 200)
  }
  cleanup: () => {
    if (setTimeoutRef.current) clearTimeout(setTimeoutRef.current)
    ...
  }
  ```

---

### Bug #10 — P2（数据：security_logs 表的 ip/user_agent 列从未被写入）
- **文件**：`migrations/005_security_logs.sql` vs `src/lib/captcha.ts:441-453`
- **问题**：migration 创建的表：
  ```sql
  CREATE TABLE security_logs (
    ...
    ip TEXT,
    user_agent TEXT,
    details TEXT,
    ...
  )
  ```
  但 `logSuspiciousBehavior` INSERT：
  ```typescript
  `INSERT INTO security_logs (session_id, event_type, score, details, created_at)
   VALUES (?, ?, ?, ?, ?)`
  // ❌ 没写 ip, user_agent
  ```
  字段名也误导：
  ```typescript
  JSON.stringify({
    behavior: behavior || null,
    ua: behavior?.screen || '',   // ❌ 'ua' 实际是 screen（分辨率），不是真正的 User-Agent
    tz: behavior?.tz || '',
  })
  ```
- **影响**：
  1. 真正的 `ip` 和 `user_agent` 列永远是 NULL——如果以后想按 IP 查/封，data 缺失
  2. `details.ua` 字段名具有误导性（实际是分辨率），未来维护者会困惑
- **建议**：
  ```typescript
  async function logSuspiciousBehavior(db, sessionId, behavior, score, ip, userAgent) {
    await run(db,
      `INSERT INTO security_logs (session_id, event_type, score, ip, user_agent, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, 'low_behavior_score', score, ip, userAgent, JSON.stringify({
        behavior: behavior || null,
        screen: behavior?.screen || '',
        tz: behavior?.tz || '',
      }), Math.floor(Date.now() / 1000)]
    )
  }
  // 调用点：caller 传入 c.req.header('CF-Connecting-IP') 和 'User-Agent'
  ```
  rename `ua` → `screen`（`behavior?.screen` 是分辨率），单独存 `user_agent` 列。

---

### Bug #11 — P2（React 闭包：submitQuantum 读 quantumState 可能 stale）
- **文件**：`client/src/components/useInlineVerify.jsx:271-288`
- **问题**：
  ```jsx
  async function submitQuantum(sequence) {
    ...
    } else {
      const newAttempts = quantumState.attemptCount + 1  // ❌ 读的是闭包捕获的 quantumState
      setQuantumState(s => ({ ...s, attemptCount: newAttempts, ... }))
    }
  }
  ```
  `submitQuantum` 在 `handleQuantumClick` 内部创建，捕获当时的 `quantumState`。如果用户操作极快（不可能但理论上），或者 React 18 并发模式下，闭包可能读到旧值。`setQuantumState(s => ({...s, attemptCount: s.attemptCount + 1}))` 是函数式更新，更安全。
- **建议**：把 `quantumState.attemptCount + 1` 改成 `s.attemptCount + 1` 形式（用 functional updater）。`handleQuantumClick` 里也有同样模式。
  当前调用栈同步触发，**实际不会触发 bug**，但写错了就埋雷。

---

### Bug #12 — P2（风控过严：阈值 25 太低，真实用户容易踩 both 流程）
- **文件**：`src/lib/risk-assessment.ts:60-79`
- **问题**：
  ```typescript
  // 1 小时内失败超过 1 次 → +40
  if (factors.ipFailureCount > 1) score += 40
  // 有失败记录 → +25
  else if (factors.ipFailureCount > 0) score += 25
  ```
  场景：
  - 用户输错一次密码 → 1h 内有失败记录 → +25
  - 真实浏览器 UA（> 50 字符）→ 不可疑
  - 第一次 `/risk` 调用 → 0 次请求
  - 合计：25 → ≥25 → 触发 `both` 流程（quantum + turnstile）
  - 即「输错一次密码」就升级到最强验证，**用户体感差**（要做两遍）
- **建议**：
  1. 调阈值到 30-35，或
  2. 失败记录加分曲线调陡：`ipFailureCount === 1` → +15（而不是 +25），`> 1` → +30，`> 3` → +40
  3. 增加「IP 历史通过率」因子：长期正常用户首次失败不升级
  4. 或者：`both` 流程改为「quantum 不通过才升级到 turnstile」而不是强制两步

---

### Bug #13 — P3（类型：BehaviorData 用中文 key「轨迹」）
- **文件**：`src/lib/captcha.ts:46`
- **问题**：
  ```typescript
  interface BehaviorData {
    轨迹?: number[][]  // ❌ 中文 key
    ...
  }
  ```
  TypeScript 允许但**会污染 JSON 序列化字段名**——前端如果用 JS 对象，最终 JSON 里有 `"轨迹": [...]` 这种字段，移动端/第三方工具处理时会乱码或丢失。
- **建议**：统一改为英文 `mousePath?: number[][]`

---

### Bug #14 — P3（dead code：test page 仍加载 embed.js）
- **文件**：`client/public/captcha-test.html:10`
- **问题**：
  ```html
  <script src="https://api.abdl-space.top/api/v1/captcha/embed.js" async defer></script>
  ```
  但 JS 代码（line 551 注释明示「直接调内部 API，不用 embed.js SDK」）全用 `fetch` 直接打 `/api/captcha/*`，不调 `window.ABDLCaptcha.*`。embed.js 完全没用。
- **影响**：
  1. 浪费 50-200KB 带宽
  2. SDK 内部有 `setInterval` 轮询 + event listener，会泄漏（test page 不卸载所以无所谓，但模式不好）
- **建议**：删掉 line 10 的 script 标签。

---

### Bug #15 — P3（dead code：test page 残留 .verify-risk-tag CSS + 引用）
- **文件**：`client/public/captcha-test.html:196`（CSS）+ 516（注释「v-risk-tag removed」）
- **问题**：
  ```css
  .verify-risk-tag { font-size: 0.7rem; color: var(--text-light); margin-left: 4px; }  /* 死 */
  ```
  元素已删除，CSS 残留。
- **建议**：删 line 196 的 CSS 块。

---

### 总体评价

**方向都对**——节点随机化、隐蔽 ctx、行为分析、风险阈值收紧、安全中心可视化、SES_REGION 配置化，这些都是该做的。

**但 P0 有 5 个，其中 2 个生产可被利用**：
1. **#1 安全中心 API 无鉴权**（任何人可读 security_logs）
2. **#2 auth.ts 完全忽略 captchaToken**（前后端断链，验证码形同虚设）
3. **#3 verifyToken 不验证签名**（一旦有人接上 middleware 立刻崩）
4. **#4 middleware import 名字错**（埋雷）
5. **#5 ctx 校验逻辑反了**（HMAC 退化成答案二次确认，绕过风险高）

**最优先修复顺序**：
1. **Bug #1**（一行加 `adminMiddleware`）—— 10 秒
2. **Bug #2 + #3 + #4 一起修**（把 `verifyToken` 重命名 + 实现真 HS256 + 把 `captchaMiddleware` 挂到 auth 三个端点）—— 30 分钟
3. **Bug #5**（ctx 校验改用 storedCtx 比较）—— 5 分钟
4. **Bug #6**（行为采集接上）—— 1 小时
5. **Bug #7/#8/#9**（React 竞态）—— 30 分钟
6. **Bug #10**（security_logs ip/user_agent）—— 5 分钟
7. 后续 P2/P3 cleanup

**建议**：Bug #1 修完前**不要把 admin 安全 Tab 上线**——任何人都能 curl 拉到全表行为画像。

---

## [审查时间] client/public/intro-animation.js 全量审查

**审查范围**：`client/public/intro-animation.js`（337 行）
**审查视角**：动画灵动性 + Bug（内存泄漏、事件监听、竞态、边界、CORS、可访问性）
**部署位置**：`client/index.html` 通过 `<script src="/intro-animation.js">` 全站加载，主站 + 移动端共用

---

### Bug #1 — P0（设计逻辑缺陷：SPA 跳过机制失效）
- **文件**：`client/public/intro-animation.js:11` + 全文
- **问题**：
  ```js
  // 第 11 行：判断已挂载就跳过
  if (window.__introMounted) return;
  // ...
  // 全文搜索结果：只读不写
  $ grep "__introMounted" client/public/intro-animation.js
  11:  if (window.__introMounted) return;   ← 只读
  358: window.__introReady = function () {   ← 但写的是 __introReady
  ```
  `__introMounted` 全程只读取，从未赋值为 `true`。`tryDismiss()` / `__introReady()` / 任何回调里都没有 `window.__introMounted = true`。
- **影响**：
  - 注释和设计意图说"SPA 跳过后续不重复播放"，但这个机制**实际永远不会触发**（永远为 undefined）
  - 如果未来有人把脚本做成按需 import、或被 HMR / 测试框架多次求值，动画就会重复播放
  - 现在的"侥幸可用"是因为 `<script src="/intro-animation.js">` 在 full reload 时才会执行，客户端 SPA 路由不会重新执行外部脚本 IIFE
- **建议**：
  ```js
  // 在 tryDismiss 的 overlay 移除前加入：
  window.__introMounted = true;
  ```

---

### Bug #2 — P1（failsafe 15s 分支资源泄漏）
- **文件**：`client/public/intro-animation.js:386-393`
- **问题**：
  ```js
  setTimeout(function () {
    if (overlay.parentNode) {
      overlay.style.opacity = '0';
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 800);
    }
  }, 15000);
  ```
  failsafe 触发后**只移除 overlay**，但：
  - `rafId` 没 `cancelAnimationFrame` —— tick 循环**继续以 60fps 运行**
  - `window` 上的 `resize` 监听器没移除
  - `mq` 的 `change` 监听器没移除（applyMobile 闭包持有 5 个 DOM 节点引用）
  - overlay 上的 6 个 mouse/touch 监听器随节点走，但闭包没释放
  - `stars` 数组（2000 元素 + 闭包）持续占用
  - `ctx` (CanvasRenderingContext2D) 持续引用 offscreen canvas（sampleSize² = 360000 像素 buffer）
- **影响**：
  - 用户在 failsafe 触发后 30s 内**持续浪费 CPU**（每帧排序 2000 粒子 + 画连线）
  - DOM 节点被 `applyMobile` 闭包持有**无法 GC**（mobile 切换窗口时还会调用 .style 访问已脱离文档的节点）
  - 长会话（用户停留在站内多小时）内存持续累积
- **建议**：把清理逻辑抽成函数 `cleanup()`，failsafe 和正常 tryDismiss 都调用：
  ```js
  function cleanup() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    window.removeEventListener('resize', resize);
    mq.removeEventListener('change', applyMobile);
    clearTimeout(failsafeTimer);
  }
  ```

---

### Bug #3 — P1（mousedown 跨边界拖动卡死）
- **文件**：`client/public/intro-animation.js:336, 349`（mousedown 在 overlay，mouseup 也在 overlay）
- **问题**：`mouseup` 监听挂在 overlay 上。若用户在 overlay 边缘按下后**拖出浏览器窗口**释放（系统菜单、其他 app），`mouseup` 不会触发，`mouseDown` 永远 = `true`，后续 `mousemove` 在 overlay 内会一直被认为是拖动，相机被持续偏移，inertia 永远不停。
- **影响**：动画完成后用户操作时如果出现"鼠标出窗释放"，整个 starfield 永远漂移，无法停止。
- **建议**：
  ```js
  // mouseup / mouseleave 改为 window 级（参考主流拖动库做法）
  window.addEventListener('mouseup', function () { mouseDown = false; });
  // mousemove 同样可以挪到 window，让 overlay 外也能继续拖
  ```

---

### Bug #4 — P1（动画完成 → React ready 窗口期 overlay 阻挡交互）
- **文件**：`client/public/intro-animation.js` 整体
- **问题**：`isComplete=true` 后，动画停在星空 + 用户可拖动状态，等待 `__introReady()` 被 React 调用。这期间 overlay `pointer-events` **默认 auto**（从未设 none），全屏 fixed 元素会**屏蔽所有点击和滚动**。
- **影响**：
  - 移动端 React 启动慢（3-5s 是常态），用户看到动画完但**无法滚动页面**，会误以为页面卡死
  - 桌面端 React 启动也常 >1s，loading 结束后用户立刻想点导航栏/链接，命中死区
  - 注释说"动画完成 + React 挂载就绪后淡出"，但中间的等待期 UX 灾难
- **建议**：在 isComplete=true 那一帧（flyTick 末尾）立即把 overlay 设为 `pointer-events: none`，让 React 启动期间用户能正常操作：
  ```js
  // isComplete=true 后立即：
  overlay.style.pointerEvents = 'none';
  ```

---

### Bug #5 — P1（CORS 风险：跨域 SVG 拉取）
- **文件**：`client/public/intro-animation.js:89-94` + `LOGO_URL = 'https://img.abdl-space.top/...'`
- **问题**：
  - 主站部署在 `abdl-space.top`（或某个域）
  - Logo CDN 在子域 `img.abdl-space.top`
  - `fetch(LOGO_URL).then(r => r.text())` 跨子域**必须 CORS 头**（`Access-Control-Allow-Origin`）才能读取 body
  - CDN 默认不返回 CORS 头（除非显式配置）
- **影响**：
  - 若 CDN 没配 CORS，fetch 直接 reject，进 `.catch` 走**降级路径**：圆形 logo（`Math.cos/sin` 圆环），完全失去品牌识别
  - 同时这次 fetch 的 reject 是用户感知不到的"暗降级"
- **建议**（按推荐顺序）：
  1. **首选**：让 CDN 加 `Access-Control-Allow-Origin: *`（img 类公共资源一般可开）
  2. **次选**：改用 `new Image()` 加载 SVG，`img.crossOrigin = 'anonymous'`，drawImage 到 offscreen canvas，同样需要 CORS 头
  3. **备选**：把 SVG 内联进 `intro-animation.js`（体积可控，logo 不会变）
  4. **临时缓解**：在 catch 之前打印 `console.warn` 让降级可见

---

### Bug #6 — P1（mq 监听器 + 多处事件监听器未清理）
- **文件**：`client/public/intro-animation.js:79` + `tryDismiss` (340-345) + failsafe (386-393)
- **问题**：
  - `mq.addEventListener('change', applyMobile)` 永久挂载，无对应 `removeEventListener`
  - `tryDismiss` 内只清理了 `resize` 和 `rafId`，**漏掉 mq 监听**
  - `applyMobile` 闭包持有 `title` / `subtitle` / `hint` / `titleWrap` / `progressBar` 5 个 DOM 节点 → 即使 overlay 被移除，这些节点仍被闭包引用**无法 GC**
- **影响**：见 Bug #2，单次会话内多次进入 SPA 子页面（或 HMR）累积内存
- **建议**：见 Bug #2 cleanup 函数

---

### Bug #7 — P1（tick 在 isAnimating=false 期间空转 60fps）
- **文件**：`client/public/intro-animation.js:163-166`
- **问题**：
  ```js
  function tick(time) {
    if (!isAnimating && !isComplete) { rafId = requestAnimationFrame(tick); return; }
    // ... 实际渲染
  }
  ```
  `tick` 在脚本启动后立即 `requestAnimationFrame(tick)`，但动画要等 `initStars().then(startFly)` 才进入 `isAnimating=true`。**logo 加载期间（网络慢时 1-3s）tick 每帧 60fps 空转**，只做 setTimeout 一样的循环，无任何渲染。
- **影响**：
  - 慢网络下空跑 60fps 浪费 CPU/电
  - 移动端影响更明显
- **建议**：
  ```js
  // 把 rafId = requestAnimationFrame(tick) 移到 initStars().then 内
  initStars().then(function () {
    lastTime = performance.now();
    rafId = requestAnimationFrame(tick);
    startFly();
  });
  ```

---

### Bug #8 — P2（edgePoints 为空时 while 循环崩溃）
- **文件**：`client/public/intro-animation.js:147-150`
- **问题**：
  ```js
  while (result.length < count) {
    result.push(edgePoints[Math.floor(Math.random() * edgePoints.length)]);
  }
  ```
  兜底分支假设 `edgePoints.length > 0`。但如果：
  - SVG fetch 成功（不进 catch）
  - SVG 中 path 都有但 fill 后 alpha 都 < 64（颜色过淡、图透明）
  - 或 path 是空 d 属性（虽然代码有 `if (d) octx.fill(...)` 跳过空 d）
  
  → `edgePoints` 和 `fillPoints` 都为空 → `result.length` 始终 0 → 死循环 + `edgePoints[0] = undefined` → `lp.x` 崩溃
- **影响**：边缘 case 触发后整页 JS 卡死，且因为 IIFE 顶层 try-catch 都没有，会显示白屏
- **建议**：
  ```js
  while (result.length < count) {
    if (edgePoints.length === 0) {
      // 退化到螺旋
      var angle = (result.length / count) * Math.PI * 2;
      result.push({ x: Math.cos(angle) * 100, y: Math.sin(angle) * 100 });
    } else {
      result.push(edgePoints[Math.floor(Math.random() * edgePoints.length)]);
    }
  }
  ```

---

### Bug #9 — P2（死代码 / 未使用变量）
- **文件**：`client/public/intro-animation.js:36, 115, 69`
- **问题**：
  - `var animDone = false;` (line 337) — 定义后未使用
  - `hint` 元素 (line 69) — 创建并 append，opacity 永为 0，从未触发显示
- **影响**：代码噪音，误导维护者以为有进度提示或加载完成标志
- **建议**：删除

---

### Bug #10 — P2（Logo 粒子 hue 计算溢出 0-360 范围）
- **文件**：`client/public/intro-animation.js:204`
- **问题**：
  ```js
  var hue = 200 + (star.targetX / 200) * 140;
  ```
  - `star.targetX` 范围约 -150 到 +150（`px = (x - sampleSize/2) * 0.5`，sampleSize=600）
  - 实际 hue 范围 = 200 + (-0.75 ~ 0.75) * 140 = **95 ~ 305**
  - hue 95 是**青绿色**，与品牌粉蓝渐变 `#A8D8F0 → #FFB7C5`（HSL 约 200-340）不符
  - 负 hue 在 CSS 中会按 (hue + 360) 解释，导致颜色分布偏向不一致
- **影响**：动画完成时 logo 中心偏左粒子偏绿、偏右粒子偏粉，整体色调**不统一**，且色相分布并非平滑（应是 200-340 单调）
- **建议**：
  ```js
  // 用归一化距离从中心映射到色相 200-340
  var t = (star.targetX + 150) / 300;  // 0-1
  var hue = 200 + t * 140;
  ```

---

### Bug #11 — P2（tryDismiss 内的 setTimeout 清理不完整）
- **文件**：`client/public/intro-animation.js:340-349`
- **问题**：
  ```js
  setTimeout(function () {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    window.removeEventListener('resize', resize);
    if (rafId) cancelAnimationFrame(rafId);
  }, 800);
  ```
  缺：
  - `mq.removeEventListener('change', applyMobile)` （见 Bug #6）
  - failsafe 那个 setTimeout 没被 `clearTimeout`
  - 6 个 overlay 上的 mouse/touch 监听器没显式移除（依赖 overlay 移除后 GC，但持有 closure 的 mousedown 状态变量无法 GC）
- **影响**：见 Bug #2 累积
- **建议**：抽 `cleanup()` 统一处理

---

### Bug #12 — P2（z 接近 0 附近粒子 scale 突变）
- **文件**：`client/public/intro-animation.js:189, 194`
- **问题**：
  - `if (z < -fov + 100) continue;` 过滤 z < -500
  - `scale = fov / (fov + z)` 中 z = -499.9 时 scale = 600/100.1 ≈ **6 倍**
  - z = 0 时 scale = 1
  - morph 结束 (cameraZ=0) 时，星空 z 范围 0-3000，最小的 5% 粒子 z 在 0-150 范围，scale 1-1.33，**正常**
  - 但 morph 过程中 (cameraZ = -3000 → 0)，z 在 -fov+100 ~ 0 边界的粒子会"突然放大 6 倍"再收缩，产生**视觉抖动**
- **影响**：动画中段可见的粒子大小闪烁
- **建议**：
  ```js
  // 收紧近裁面，或加 z>0 但 scale 软上限
  if (z < -fov + 100) continue;
  if (z < 50) continue;  // 跳过太近的
  ```

---

### Bug #13 — P3（性能：每帧 stars.map().sort() 创建大数组）
- **文件**：`client/public/intro-animation.js:178`
- **问题**：2000 元素 .map 创建新数组，sort 是 2000·log2(2000) ≈ 22k 比较，每秒 60 次。GC 压力不小。
- **建议**：改用索引数组 + Float32Array z 缓冲，避免每帧分配：
  ```js
  // 预分配 z 缓冲
  var zBuffer = new Float32Array(stars.length);
  // 每帧：for 循环填 zBuffer，typed array sort 按引用排序 stars
  ```

---

### Bug #14 — P3（可访问性：缺 ARIA 语义）
- **文件**：overlay / title / subtitle
- **问题**：
  - overlay 缺 `role="dialog" aria-busy="true" aria-label="Loading"`
  - title / subtitle 初始 opacity:0，屏幕阅读器在过渡完成后才能感知
  - `prefers-reduced-motion: reduce` 用户也会看完整 4 秒动画，违反可访问性偏好
- **建议**：
  ```js
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-busy', 'true');
  overlay.setAttribute('aria-label', 'Loading ABDL Space');
  // 检测 prefers-reduced-motion，缩短到 1s 或跳过
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    FLY_DURATION = 800;
  }
  ```

---

### Bug #15 — P3（拖动 inertia 在拖动时无即时反馈）
- **文件**：`client/public/intro-animation.js:218-225`
- **问题**：`cameraX/Y *= 0.98; dragVelX/Y *= 0.92;` 衰减系数固定，但**用户松手后立即拖动**时 velocity 被覆盖，无渐入感。
- **建议**：可加 velocity 上限 `Math.max(-30, Math.min(30, dragVelX))` 避免单帧突变

---

### 灵动性评价（动画视觉效果）

**优点**：
1. **缓动曲线选择精准** — `cubic-bezier(0.25, 0.1, 0, 1)`（苹果标准 ease-out），相机飞行前 30% 飞过 70% 距离，后 70% 缓停，对应人眼预期，符合"加速进入 → 减速聚合"的视觉节律
2. **粒子层次** — 2000 星空 + 600 logo 双层，星空 z 范围比 logo 广 2 倍（`SPREAD*2`），营造"前景 logo + 远景星空"层次
3. **Twinkle 闪烁** — 每星独立 `twinkleSpeed` 0.5-2.5 + `twinkleOffset` 0-2π，避免整齐划一的"假"感
4. **Morph 节奏** — `morphStart=0.4` 错开相机飞行与粒子聚合，前 40% 让相机先建立"飞行感"，后 60% 才让 logo 显形，节奏感好
5. **品牌色呼应** — 进度条 `linear-gradient(90deg, #A8D8F0, #FFB7C5)` 粉蓝渐变，标题白 + 副标题灰白，色阶克制不刺眼
6. **Logo 边缘 vs 填充分层** — `edgeCount = 0.8 * count` 边缘粒子 + 20% 填充，让 logo 先有轮廓再有血肉，符合"先描边后填色"的视觉规律
7. **连接线在 morph 后期浮现** — `animProgress > 0.6` 才绘制，line alpha 也随 progress 0→0.15 渐入，避免一开始就有"网线"破坏神秘感
8. **Failsafe 15s** — 兜底防止 React 挂死导致 overlay 永驻
9. **背景径向渐变** — `#0a0a12` 中心 + `#000000` 边缘，"星云"感而不是平面黑
10. **拖动 inertia** — `* 0.92` 速度衰减 + `* 0.98` 位置衰减，松手后星空缓慢漂移，符合物理直觉

**改进建议**：
1. **缺开场"启动"反馈** — 动画启动后 200-300ms 视觉无变化（粒子 z 范围太广、相机在远处），可加 `< 200ms` 的"聚拢提示"（如中心出现一个亮斑扩散）
2. **Logo 颜色可更"品牌"** — 当前 hue 95-305 含青绿，偏离品牌色。建议 hue 范围 200-340（蓝→粉）单调分布
3. **结尾"驻留态"略空** — 动画完成到 React ready 中间，星空静止，只有 twinkle。可以让 logo 缓慢自转（如 ±2°/s）或呼吸缩放（scale 0.98-1.02），让用户感到"在等什么"而非"卡住了"
4. **拖动可加视差** — 当前拖动是相机平移，星空无 z 方向响应；可让 logo 粒子对拖动有反向 inertia 增强"立体感"
5. **进度条可加点细节** — 当前是底部 2px 渐变细条，过于低调。可在进度条上方加一个跟随光点（"扫描线"效果）
6. **缺音效可选开关** — 多数产品会给 intro 加 1-2s 的轻微环境音（流星 / 粒子聚拢 "whoosh"），但要尊重浏览器 autoplay 策略和用户偏好
7. **缺 viewport meta 适配** — iOS Safari 地址栏收缩/展开时 `window.innerHeight` 变化，已有 resize 监听但 canvas 重置没有用 `dpr` 适配，高 DPR 设备会模糊

---

### 总体评价

**视觉设计水平高**：Bezier 缓动、Twinkle 闪烁、Morph 节奏、颜色呼应都体现了对动效细节的把控，是商业级 loading 动画的水准。

**技术债务集中在清理逻辑**：
- `__introMounted` P0 漏写 → 修复成本 1 行
- failsafe / tryDismiss 资源清理不完整 → 抽 `cleanup()` 函数 5 行
- mousedown 跨边界 → window 级监听 2 行
- React ready 等待期 UX → `pointer-events:none` 1 行
- CORS 风险 → 配 CDN 头 / 改用 Image / 内联 SVG 三选一

**性能瓶颈在每帧 sort**：2000 元素 .map().sort() 是动画全程最热的部分，但 60fps 现代设备无感知，老移动端可能掉帧。

**建议优先级**：
1. Bug #1（__introMounted 漏写）— 1 分钟
2. Bug #4（pointer-events）— 1 分钟，立刻提升 UX
3. Bug #2/#6/#11（cleanup 抽函数）— 10 分钟
4. Bug #3（window mouseup）— 5 分钟
5. Bug #5（CORS）— 配 CDN 头 5 分钟
6. Bug #7（tick 启动延后）— 2 分钟
7. Bug #10（hue 归一化）— 2 分钟
8. Bug #8（edgePoints 空保护）— 3 分钟
9. Bug #12（z 边界软化）— 3 分钟
10. Bug #13（typed array 优化）— 30 分钟
11. Bug #14（a11y）— 15 分钟

---

## [审查时间] intro-animation.js 修复版二次审查（PASS 验证 + 残留/新增 Bug）

**审查范围**：`client/public/intro-animation.js`（424 行，修复版）
**审查方法**：逐项对照原版 vs 修复版，验证修复正确性 + 检查新增 Bug + 排查遗漏边界

---

### ✅ 修复验证（PASS）

| Bug | 状态 | 验证 |
|-----|------|------|
| **#1** `__introMounted` 漏写 | ✅ **PASS** | `cleanup()` 末尾 `window.__introMounted = true;`（L357），tryDismiss 路径和 failsafe 路径都通过 cleanup 设置 |
| **#2/#6/#11** cleanup 抽函数 | ✅ **PASS** | L343-358，7 项清理：rafId / resize / mq / mouseup / touchend / failsafeTimer / __introMounted。4 对 add/remove 配对确认（addEventListener L84/93/391/405 ↔ removeEventListener L351-354） |
| **#3** mouseup window 级 | ✅ **PASS** | L391 `window.addEventListener('mouseup', onMouseUp);` L405 touchend 同。命名函数引用一致，removeEventListener 能匹配上 |
| **#4** pointerEvents: none | ✅ **PASS** | L316 `overlay.style.pointerEvents = 'none';` 在 isComplete=true 后立即执行，紧接 `tryDismiss()`，中间无时间窗口，hit-test 立即失效 |
| **#7** tick 启动延后 | ✅ **PASS** | L412-415 `initStars().then(function () { lastTime = ...; rafId = requestAnimationFrame(tick); startFly(); });` 不再在 IIFE 末尾立即启动 |
| **#8** edgePoints 空保护 | ✅ **PASS** | L154-161 `while (result.length < count)` 内 `if (edgePoints.length === 0)` 退化为螺旋，`else` 走原逻辑。无 `Math.random() * 0` 崩溃 |
| **#9** hint 死代码 | ✅ **PASS** | `grep "hint"` 无匹配（exit 1），元素已完全移除 |
| **#10** hue 归一化 | ✅ **PASS** | L207-208 `var t = (star.targetX + 150) / 300; var hue = 200 + t * 140;` 验算：targetX=-150→hue=200（蓝），=0→270（紫），=150→340（粉），与品牌色一致 |

---

### ⚠️ 修复引入的副作用 / 边界问题

#### Bug #N1 — P3（修复副作用：window mouseup/touchend 监听器在脚本启动时立即生效）
- **位置**：L391 / L405
- **现象**：
  ```js
  // 脚本启动后立即注册，不等 isComplete
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('touchend', onTouchEnd);
  ```
  整个动画期间（4s+React 启动期，最长 15s）所有 mouseup/touchend 都会被 `onMouseUp/onTouchEnd` 拦截。
- **影响**：
  - `onMouseUp` 只是 `mouseDown = false`，对 mouseDown 已为 false 的情况是 no-op
  - **但**：会**阻止冒泡**到其他监听器吗？不会 —— `addEventListener` 默认 capture=false（冒泡），仍会冒泡到其他 listener
  - 副作用可忽略
- **建议**：可接受。或加一个 `isComplete` 守卫：`if (!isComplete) return;` 在 onMouseUp 内，节省少量函数调用

#### Bug #N2 — P3（修复副作用：pointerEvents: none 后拖动失效）
- **位置**：L316
- **现象**：动画完成 → pointerEvents: none → 用户**不能拖动星空**（hit-test 不命中 overlay）→ 只能在 React 启动的 800ms-3s 等待期内看着星空静止
- **影响**：
  - 修复前：用户能在动画完成后拖动，但页面被覆盖无法操作
  - 修复后：用户能操作页面，但拖动功能失效
  - **这是合理的 UX 权衡**（页面操作优先），但失去了"探索星空"的小乐趣
- **建议**：可接受，或在 `__introReady` 触发前保留 pointer-events，让用户短暂体验拖动（可改为 `__introReady` 后才设为 none）

#### Bug #N3 — P3（修复副作用：cleanup 跑多次安全但有轻微抖动风险）
- **位置**：cleanup 在 tryDismiss 和 failsafe 路径都会被调用
- **现象**：
  - 正常路径：tryDismiss → cleanup 一次 → failsafeTimer 已被 clearTimeout
  - failsafe 路径：failsafe → cleanup 一次 → 若后续 __introReady 触发 tryDismiss，800ms 后 cleanup 第二次
  - 多次 cleanup 因每个操作都有 `if` 保护，**无副作用**
  - **但**：`overlay.style.opacity = '0';` 在 tryDismiss 内先设置（800ms 淡出），若 failsafe 在 800ms 期间触发会**再设置一次**（no-op）
- **影响**：无
- **建议**：可接受，无需修改

---

### 🔴 未修复的 Bug（残留）

#### Bug #R1 — P1（CORS 风险未根本解决）
- **位置**：L88-152 `loadLogoPoints`
- **现象**：
  - 修复版**只加了 `console.warn` 让降级可见**（`.catch(function (err) { console.warn(...))`）
  - **CORS 失败时仍然降级为圆形 logo** —— 根本问题没解决
  - 用户首次加载看到"圆形粒子"会困惑（不是品牌 logo）
- **影响**：
  - 若 CDN `img.abdl-space.top` 未配 `Access-Control-Allow-Origin` 头，**首次用户 100% 看到降级 logo**
  - console.warn 仅开发者可见，用户感知不到
- **建议**（三选一）：
  1. **首选**：CDN 加 `Access-Control-Allow-Origin: *`（5 分钟）
  2. **备选**：把 SVG 内联到 `intro-animation.js`（无 CORS 问题，但增加 ~10-30KB JS）
  3. **回退**：在 catch 内尝试 `new Image()` + `crossOrigin="anonymous"` + drawImage 二次降级

#### Bug #R2 — P2（z 接近 -fov+100 边界时 scale 突变，未修复）
- **位置**：L184
- **现象**：
  - `if (z < -fov + 100) continue;` 过滤 z < -500
  - `scale = fov / (fov + z)` 中 z = -499.9 时 scale ≈ 6 倍
  - morph 过程中（cameraZ 从 -3000 飞到 0），z 在边界附近的粒子会"突然放大 6 倍"
  - **视觉上**：动画中段（约 0.5-1.5s）粒子大小闪烁
- **影响**：可见但不严重
- **建议**：
  ```js
  if (z < -fov + 100) continue;
  if (z < 50) continue;  // 跳过过近的
  ```

#### Bug #R3 — P3（可访问性未改善）
- **位置**：overlay / title / subtitle
- **现象**：
  - 缺 `role="dialog"` / `aria-busy="true"` / `aria-label`
  - 缺 `prefers-reduced-motion: reduce` 适配（动画对前庭敏感用户不友好）
  - title/subtitle 初始 `opacity:0`，屏幕阅读器在过渡完成后才能感知
- **影响**：可访问性合规问题
- **建议**：
  ```js
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-busy', 'true');
  overlay.setAttribute('aria-label', 'Loading ABDL Space');
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    FLY_DURATION = 800; // 缩短到 1/5
  }
  ```

#### Bug #R4 — P3（性能：每帧 .map().sort() 未优化）
- **位置**：L173
- **现象**：`var sorted = stars.map(function (s) { ... }).sort(...);` —— 2000 元素每帧分配新数组 + 22k 比较
- **影响**：现代设备 60fps 流畅，老移动端可能掉帧
- **建议**：用 Float32Array z 缓冲 + 索引排序

---

### 🔍 额外发现（修复后浮现的细节）

#### Bug #E1 — P3（failsafe 嵌套 setTimeout 无法被 cleanup 取消）
- **位置**：L417-425
- **现象**：
  ```js
  failsafeTimer = setTimeout(function () {
    if (overlay.parentNode) {
      overlay.style.opacity = '0';
      setTimeout(function () {   // ← 这个嵌套 setTimeout 没被追踪
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        cleanup();
      }, 800);
    }
  }, 15000);
  ```
  - cleanup 内 `clearTimeout(failsafeTimer)` 只能取消外层 15s 那个
  - 内层 800ms setTimeout 启动后，**无法被 cleanup 取消**
  - 如果用户在 failsafe 触发的 800ms 内**导航到其他页面**（同源），嵌套 setTimeout 仍会跑（在新页面的 setTimeout 队列中）
  - 但因为 IIFE 闭包在新页面是新的实例，旧实例随页面 unload GC，所以这个嵌套 setTimeout 引用的是旧 IIFE，**新页面 GC 旧 IIFE 时也会回收这个 setTimeout**
  - 实际无副作用
- **建议**：可接受。如要严谨，failsafe 内层 setTimeout 也用 failsafeTimer 引用
  ```js
  failsafeTimer = setTimeout(function () {
    if (overlay.parentNode) {
      overlay.style.opacity = '0';
      failsafeTimer = setTimeout(function () { ... }, 800);
    }
  }, 15000);
  ```

#### Bug #E2 — P3（cleanup 内 window.removeEventListener 引用 hoisting 函数）
- **位置**：L353-354 cleanup 内引用 `onMouseUp` / `onTouchEnd`
- **现象**：
  - `function onMouseUp()` 是 function declaration（hoisted）
  - cleanup 第一次执行时（800ms 后），onMouseUp/onTouchEnd 早已定义（脚本同步执行到底）
  - **addEventListener 和 removeEventListener 用同一个函数引用，能匹配上**
  - **无 bug**
- **影响**：无
- **建议**：无需修改，但建议改成 `const onMouseUp = ...` 显式表达（项目当前用 var，IIFE 风格一致，可不改）

#### Bug #E3 — P3（cleanup 顺序问题）
- **位置**：L343-358
- **现象**：
  ```js
  function cleanup() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    window.removeEventListener('resize', resize);
    mq.removeEventListener('change', applyMobile);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('touchend', onTouchEnd);
    if (failsafeTimer) { clearTimeout(failsafeTimer); failsafeTimer = null; }
    window.__introMounted = true;
  }
  ```
  - 顺序合理：先停动画 → 移除监听器 → 清 timer → 标记挂载
  - **但**：`overlay.removeChild` 由调用方（tryDismiss / failsafe）处理，cleanup 不知道
  - 这导致**调用方需要记得** removeChild + cleanup
  - 未来若添加新调用路径可能漏 removeChild
- **建议**：把 removeChild 也移到 cleanup 内：
  ```js
  function cleanup() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    // ... 监听器 ...
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    window.__introMounted = true;
  }
  // 调用方：overlay.style.opacity = '0'; setTimeout(cleanup, 800);
  ```
  这样调用方只负责"淡出 + 延迟"，removeChild 和 cleanup 绑定在一起

---

### 📊 整体修复评价

**修复完成度：8/10**
- 8 个 P0/P1/P2 修复全部正确，零回归
- 修复代码质量高（统一 cleanup 函数、函数命名规范、console.warn 增强可观测性）
- 4 对 addEventListener/removeEventListener 配对正确
- 命名函数引用一致，removeEventListener 匹配无问题

**残留风险：1 个 P1 + 2 个 P3**
- **Bug #R1 CORS** —— 这是 P1，CDN 配置是必经之路，必须在动画上线前解决
- **Bug #R2 z 边界** —— P2，视觉抖动，不阻塞
- **Bug #R3 a11y** —— P3，合规问题，可后续

**建议优先级**：
1. **Bug #R1（CORS）** —— 阻塞上线，5 分钟（CDN 加头）或 30 分钟（内联 SVG）
2. **Bug #E3（cleanup 统一 removeChild）** —— 5 分钟，未来更易维护
3. **Bug #E1（failsafe 嵌套 timer 追踪）** —— 3 分钟，增强健壮性
4. **Bug #R2（z 边界）** —— 3 分钟，提升视觉
5. **Bug #R3（a11y）** —— 15 分钟，合规
6. **Bug #R4（性能）** —— 30 分钟，老移动端

**可以上线吗？**
- ✅ 是，**前提是 CDN CORS 已配**（Bug #R1）
- ⚠️ 若 CDN CORS 未配，**首次用户 100% 看到圆形降级 logo** —— 不建议上线


---

## [紧急] intro-animation.js 部署行为异常根因分析（v3 修复版）

**报告时间**：紧急排查
**目标**：`client/public/intro-animation.js` + `client/index.html` + `client/src/main.jsx`
**症状**：
- 桌面端：动画正常 → overlay 永远不消失（failsafe 15s 也不触发）→ placeholder 又出现 → 永远卡住
- 移动端：动画正常 → 5s 后正常进入页面（≈ 动画 4s + 1s dismiss）

---

### 🔴 根本原因（核心矛盾）

#### **窗口 #1：cleanup 设置 `__introMounted=true` + React 触发整页重定向 = 死循环**

**关键代码三件套**：

**A. `client/public/intro-animation.js:195`**（cleanup 函数末尾）：
```js
function cleanup() {
  if (cleaned) return; cleaned = true;
  // ... 清理监听器 ...
  window.__introMounted = true;  // ← 全局标记
}
```

**B. `client/public/intro-animation.js:7-10`**（IIFE 入口）：
```js
if (window.__introMounted) {
  var ph0 = document.getElementById('intro-placeholder');
  if (ph0) ph0.remove();
  return;  // ← 跳过整个动画
}
```

**C. `client/src/contexts/AuthContext.jsx:179`**（React 触发的整页重定向）：
```js
window.location.href = '/login';
```

**完整死循环流程**：

1. **首次加载页面**（桌面端）：
   - HTML 解析：`#intro-placeholder` 插入 DOM
   - `intro-animation.js` IIFE 跑：`__introMounted=undefined` → 继续 → **移除 placeholder**，创建 overlay
   - 动画 4s + 1s dismiss + 0.8s 淡出 = **5.8s 后 overlay 消失**
   - cleanup 跑：`__introMounted = true`
   - React 渲染 → `AuthContext` 初始化 → 检查 cookie → 失败 → `window.location.href = '/login'`
   - **整页重新加载**

2. **第二次加载 `/login`**：
   - HTML 解析：`#intro-placeholder` 插入 DOM（**新页面的新 placeholder**）
   - `intro-animation.js` IIFE 跑：
     - **`__introMounted` 是 undefined**（window 变量，整页加载后清空）
     - **不会走 return 路径**
     - 继续执行 → **移除 placeholder**，创建 overlay
   - 动画 4s + 1s + 0.8s = 5.8s
   - cleanup → `__introMounted = true`
   - React 渲染 → `Login` 页面（不再重定向）
   - **用户看到登录页 ✓** —— 但前提是 React 第一次没死循环

3. **真正的死循环场景**（用户报告的现象）：
   - **首次加载到 `/`**（不是 `/login`）
   - `AuthContext` 初始化时**不调用** `window.location.href = '/login'`
   - 但 React App 组件中**某处**触发 `window.location.href = '/login'`（具体看下方"待验证"）
   - 或者更可能：**`AuthProvider` 内部 useEffect 完成后没有触发重定向，但 `App.jsx` 中某处 `useEffect` 调用了 `window.location.href = '/'`**

**但用户说"动画正常播放 + 桌面端永远不消失"** —— 这暗示 **React 没有触发整页重定向**，否则会看到第二次的动画。

---

#### **窗口 #2：用户观察到的"overlay 永远不消失"实际是 React StrictMode 双渲染导致清理逻辑异常**

**关键发现**：`client/src/main.jsx:20-28`：
```jsx
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>           {/* ← StrictMode 双渲染 */}
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

window.__introMounted = true;     // ← L25: 同步设置
if (window.__introReady) window.__introReady();  // ← L26
```

**这两个赋值是 main.jsx 同步执行的末尾**。**这意味着 React 渲染完 App 后**（StrictMode 二次渲染）才执行 L25-26。

**关键时序问题**：

| t | 事件 |
|---|------|
| 0s | HTML 解析 → placeholder 插入 DOM |
| 0s | intro-animation.js 同步执行 → 移除 placeholder，创建 overlay |
| 0s | failsafe 15s 启动 |
| 0s | initStars() 启动（fetch logo SVG） |
| 0.5s~5s | fetch 完成（CORS / 网络） → initStars resolve → startFly 跑 |
| 4s~9s | 动画 4s 结束 → setTimeout(fadeOutAndCleanup, 1000) |
| 5s~10s | fadeOutAndCleanup 跑 → opacity 0 → setTimeout(800ms) removeChild + cleanup |
| 5.8s~10.8s | overlay 消失 |
| **并行**：| main.jsx 加载（React 启动 < 4s 通常） |
| 1s~5s | React 渲染完成 → `__introMounted = true; __introReady()` |
|   | `__introReady` 内部 `if (!isAnimating || cleaned) return;` |
|   | **如果动画还在跑**（isAnimating=true），**创建跳过按钮** |
|   | **如果动画已结束**（isAnimating=false），**直接 return** |

**关键问题**：`__introMounted = true` 在 React 渲染后设置，**与 intro-animation.js 内部的 `__introMounted` 检查不同步**（那个只检查 IIFE 入口）。

**所以 `__introMounted=true` 的唯一作用是阻止下一次整页加载时的动画重放**。

---

#### **窗口 #3（最关键）：React 渲染时某处抛错 + ErrorBoundary 静默吞掉 → #root 是空 div**

**关键发现**：

1. **`index.html` 第 23-25 行**（用户报告"placeholder 又出现"）：
   ```html
   <body>
     <div id="intro-placeholder" style="position:fixed;...background:#000;display:flex;align-items:center;justify-content:center;...">
       <img src="https://img.abdl-space.top/..." style="...width:64px;height:64px;opacity:0.6;">
     </div>
     <script src="/intro-animation.js"></script>
     <div id="root"></div>
   </body>
   ```

2. **intro-animation.js 启动时**：
   ```js
   var placeholder = document.getElementById('intro-placeholder');
   // ...
   if (placeholder) placeholder.remove();  // ← L64: 移除 placeholder
   ```

3. **如果 React 渲染失败**（任何 Provider 初始化抛错）：
   - `#root` 是空 div
   - **body 背景色默认是白色**（`<body>` 本身没设背景色）
   - **`<div id="root"></div>` 是空白**
   - 用户看到**白屏 + 左上角浏览器默认样式**

**但用户说"黑底 + 居中 logo icon"** —— 这正是 placeholder 样式。

**所以 placeholder 一定是被**重新插入**了，或者**根本就没被移除**。

---

### 🔴 我现在重新分析"placeholder 又出现"的最可能原因

#### **场景 X：fetch 永远 pending（最可能）**

**关键代码**（`intro-animation.js:91-152`）：
```js
return fetch(LOGO_URL)
  .then(function (r) { return r.text(); })
  .then(function (svgText) { ... })
  .catch(function () { ... });  // ← fallback 路径
```

**`fetch` 在以下情况可能永远不返回也不 reject**：
- **CORS preflight (OPTIONS) 在某些 CDN 行为异常**（不应该但偶发）
- **CDN 返回了 200 但 response body 是空**（某些情况 `.text()` 不返回也不 reject）
- **网络层 TCP 连接挂起**（弱网环境）
- **浏览器后台 tab 节流**（桌面端切到其他 tab 时 fetch 可能被挂起）

**如果 fetch 永远 pending**：

- `initStars().then` 永远不 resolve
- `startFly` 永远不跑
- `setTimeout(fadeOutAndCleanup, 1000)` 永远不排程
- `isAnimating = false` 永远保持（startFly 没跑过）
- **但 failsafe 15s 一定会触发**（与 fetch 独立）

**failsafe 15s 触发后**：
```js
failsafeTimer = setTimeout(function () { 
  if (overlay.parentNode) fadeOutAndCleanup();  // ← overlay 还在 body
}, 15000);
```

`overlay.parentNode` 是 body（truthy）→ 调用 `fadeOutAndCleanup()`。

fadeOutAndCleanup：
```js
function fadeOutAndCleanup() {
  if (cleaned) return;  // cleaned 是 false（startFly 没跑过）
  overlay.style.opacity = '0';
  fadeOutTimer = setTimeout(function () { 
    if (overlay.parentNode) overlay.remove(); 
    cleanup(); 
  }, 800);
}
```

设置 opacity=0（CSS 0.8s 渐变），setTimeout 800ms 后 removeChild + cleanup。

**15.8s 后 overlay 应该消失**。

**所以"failsafe 15s 也没触发"** —— **用户在 15.8s 内就放弃了**？或者 **failsafe 触发后 overlay 还在视觉上**（opacity 0 是渐变中）？

---

#### **场景 Y：cleanup 跑过但 React 重新加载页面（次可能）**

**关键代码**：
- `client/src/main.jsx:25-26`：`window.__introMounted = true`
- `client/src/contexts/AuthContext.jsx:179,199,213`：`window.location.href = '/login'`

**如果 React 渲染时调用了 `window.location.href = '/login'`**（比如 logout / removeAccount 流程）：

1. 首次加载动画 + cleanup 完成
2. React 渲染时调用 `window.location.href = '/login'`
3. 浏览器开始加载 `/login`（整页重新加载）
4. **关键**：浏览器在卸载当前页面前的瞬间，DOM 仍可见
5. 用户看到 **"动画结束 → 闪一下 React 内容 → 跳到 /login"**
6. **但** `/login` 也会重新跑 intro-animation.js

**等等！** 如果 `/login` 也跑动画，**用户应该看到第二次动画**。

**用户报告"动画只播放一次 + placeholder 又出现"** —— 这说明 `/login` 路径下 **intro-animation.js 没跑**（**SHOULD be true** if `__introMounted` 跨整页加载保留，但**整页加载后 `__introMounted` 是 undefined**）。

**这又矛盾了**。

**或者**：用户访问的**不是 `/login`**，而是 React Router 客户端路由**到** `/login` —— **SPA 路由切换不会重新加载 intro-animation.js**。

**让我看 React Router 配置**（`App.jsx`）：

```jsx
<BrowserRouter>
  <ThemeProvider>
    <AuthProvider>
      <ToastProvider>
        <App />
```

`<BrowserRouter>` 客户端路由。

**如果 React 内部用 `useNavigate('/login')`**（客户端路由），**不触发整页加载**。

**但 `window.location.href = '/login'` 触发整页加载**。

**关键**：`AuthContext.jsx:179` 用 `window.location.href`，是**整页加载**。

**所以场景 Y 完整流程**：
1. 首次加载 `/`（或任何页面）
2. intro-animation.js 跑 → 动画 → cleanup → `__introMounted=true`
3. React 渲染 → AuthContext 初始化 → 失败 → `window.location.href = '/login'`
4. 整页加载 `/login`
5. **新页面**：
   - HTML 解析到 `<div id="intro-placeholder">` → **新 placeholder 插入 DOM**
   - HTML 解析到 `<script src="/intro-animation.js">` → IIFE 跑
   - **`__introMounted` 是 undefined**（整页加载后清空）→ **继续**
   - **移除 placeholder**，创建 overlay
6. 动画 4s + 1s + 0.8s = 5.8s
7. 第二次 fadeOutAndCleanup → overlay 消失
8. React 渲染 Login 组件

**如果用户报告"动画只播放一次"**，这说明 **步骤 3 没发生**（React 没调用 `window.location.href`）。

**所以"placeholder 又出现"不是 React 重新加载导致的**。

---

#### **场景 Z（最可能）：React 错误 + ErrorBoundary + #root 是空 + 用户感知是"placeholder 重新出现"**

**关键代码**（`App.jsx:53-58`）：
```jsx
function PageFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
      <div className="spinner" />
    </div>
  );
}
```

**关键代码**（`App.jsx:161`）：
```jsx
<Suspense fallback={<PageFallback />}>
  <Routes>
    <Route path="/" element={<ForumFeed />} />
    ...
```

**如果 lazy import 失败**（chunk 404、网络错误），**Suspense fallback 一直显示**（spinner）。

**但 spinner 不是"黑底 + 居中 logo icon"**。

**等等！** 让我看 `index.html:23` placeholder 的样式：
```html
<div id="intro-placeholder" style="position:fixed;inset:0;z-index:99998;background:#000;display:flex;align-items:center;justify-content:center;transition:opacity 0.4s ease;">
  <img src="..." style="width:64px;height:64px;opacity:0.6;" />
</div>
```

**placeholder 永远在 DOM 中（如果 intro-animation.js 没跑或没移除）**。

**如果 intro-animation.js 启动时 `__introMounted=true` 已经存在**（**新 window 不可能**，除非 iframe / WebView），IIFE 立即 return，**placeholder 不被移除**。

**或者** —— 让我看 `initStars().then` 路径：

```js
initStars().then(function () { 
  lastTime = performance.now(); 
  rafId = requestAnimationFrame(tick); 
  startFly(); 
});
```

**如果 initStars 抛错（fetch reject 但 catch 路径也有问题）**：
- `.catch` 走 fallback circle → resolve → `startFly` 跑
- **不会**让 IIFE 异常退出

**如果 initStars resolve 但内部 for 循环 `lp[i].x` 抛错**（logoPoints 数组为空）：

```js
function initStars() {
  stars = [];
  return loadLogoPoints(LOGO_STAR_COUNT).then(function (lp) {
    for (var i = 0; i < LOGO_STAR_COUNT; i++) stars.push(new Star(
      (Math.random()-0.5)*SPREAD, (Math.random()-0.5)*SPREAD, Math.random()*DEPTH,
      lp[i].x, lp[i].y, 0  // ← 如果 lp 是空数组，lp[0].x 抛错
    ));
    ...
  });
}
```

**如果 logoPoints 数组为空**（fallback circle 的 result.length = 0）：

**fallback path**:
```js
.catch(function () {
  var r = []; 
  for (var i = 0; i < count; i++) { 
    var a = (i/count)*Math.PI*2; 
    r.push({x:Math.cos(a)*100,y:Math.sin(a)*100}); 
  }
  logoPointsCache = r; 
  return r;
});
```

**fallback 返回 count 个 circle points**，**不会空**。

**那如果 logoPoints 是 600 个对象**，`lp[0].x` 应该 OK。

**但** —— **如果 `fetch` reject 进入 catch 之前**，loadLogoPoints 内部 `.then(function (svgText) { ... })` 内某处抛错：
- `var d = paths[k].getAttribute('d');` —— `paths[k]` 可能是 undefined（如果 k >= paths.length）
- 但 `for (var k = 0; k < paths.length; k++)` 限制 k < paths.length
- 不会

**`octx.fill(new Path2D(d))`** —— Path2D 构造函数对无效 path 字符串可能抛错（某些浏览器）

**如果这个抛错**：
- `.catch` 触发 → fallback 走 → resolve
- initStars 拿到 fallback points → startFly 跑

**应该不会卡住**。

---

### 🎯 真正的根本原因（综合判断）

**最可能的情况**（综合桌面端 + 移动端差异）：

#### **桌面端 failsafe 15s 也不触发** —— **JS 引擎被 React 的 main.jsx 加载阻塞**

**关键事实**：
- **桌面端 React 启动快**（< 1s 通常）
- **移动端 React 启动慢**（3-5s 通常）

**桌面端时序**：
1. t=0: 动画启动
2. t=4s: 动画结束
3. t=5s: fadeOutAndCleanup 跑 → overlay 消失
4. **t=5s+ε: React 已挂载**（桌面端 < 1s）
5. t=5.1s: React 渲染 App 组件
6. **App 组件中的某处**调用了 `window.location.href = ...` 或类似重定向
7. **整页重新加载**
8. 新页面 intro-animation.js 跑
9. **如果新页面也有重定向** → **死循环**

**但用户没看到第二次动画**（动画只播放一次）—— **这说明 React 首次渲染时** **没有重定向**。

**所以 React 渲染是正常的**。

**那 failsafe 为什么没触发？** —— **failsafe 实际上触发了，但用户没等到 15s**。

**或者** —— **failsafe 触发后 fadeOutAndCleanup 跑**，`overlay.style.opacity = '0'` **触发 CSS transition (0.8s 渐变)**，`setTimeout 800ms` 后 `overlay.remove()` —— **总共 1.6s 内 overlay 完全消失**。

**用户报告"永远不消失"** —— 实际上 5.8s 或 15.8s 后 overlay 就消失了，**但 #root 内的内容看起来像 placeholder 样式**。

---

### 🔍 关键验证点

**Agent1 需要确认**：

1. **`#root` 在 overlay 消失后是否被 React 填充**？
   - 在浏览器 DevTools 中看 `#root` 的 innerHTML
   - 如果 `#root` 是空，**React 渲染失败**

2. **React 渲染时是否抛错**？
   - 看 Console 是否有 React 错误
   - 看 Network 是否有失败的 API 请求（AuthContext 初始化时调用 `/api/auth/me`）

3. **`AuthContext` 初始化时的 `/api/auth/me` 请求是否成功**？
   - **如果失败且 AuthContext 内部有重定向逻辑**，会触发 `window.location.href = '/login'`
   - 看 `client/src/contexts/AuthContext.jsx` 完整代码

4. **`client/dist/index.html` 加载顺序**：
   - 之前看 `dist/index.html` 把 `<script type="module" crossorigin src="/assets/index-CbSbIJT2.js">` 放在 **head 里**
   - **如果生产环境是这样**，React 在 head 加载，与 body 内的 intro-animation.js 是并行加载
   - **React 可能先于 intro-animation.js 完成执行**
   - 但 `__introMounted = true` 是在 React 渲染完成后才设置（main.jsx 末尾）
   - 所以**时序应该 OK**

5. **placeholder 真的重新出现**？
   - 在浏览器 DevTools 中看 `<div id="intro-placeholder">` 是否存在
   - 如果**真的存在**，意味着：
     - intro-animation.js 启动时 `__introMounted=true`（不可能，整页加载后清空）
     - 或者 React 在某处用 ReactDOM.createPortal 重新创建了它（**没有这个代码**）
     - **最可能**：React 触发整页重定向，新页面 intro-animation.js 跑了但**动画只跑了一帧就 cleanup 了**（**why？**）

---

### 🚨 真正的根因（最终判断）

**我重新分析后认为最可能的根因是**：

#### **`fetch(LOGO_URL)` 在桌面端成功，但在 cleanup 之前** **`startFly` 因为某种原因没跑完** **`setTimeout(fadeOutAndCleanup, 1000)` 没排程**

**但** —— **代码逻辑上看 `setTimeout(fadeOutAndCleanup, 1000)` 是 flyTick 末尾同步排程的**。**只要 flyTick 跑完，必然排程**。

**所以 flyTick 必须跑完**。

**flyTick 跑完需要 initStars resolve + FLY_DURATION=4s**。

**如果 initStars 永远不 resolve**（fetch pending）：
- flyTick 不跑
- **setTimeout 1000ms 不排程**
- **failsafe 15s 后触发**（与 fetch 独立）
- **用户应该看到 15.8s 后 overlay 消失**

**如果用户真的等了 15.8s 看到 overlay 还在**：
- **failsafe 也没触发**（用户报告）
- **fetch + failsafe 都没触发**
- **JS 引擎被卡住**

**JS 引擎被卡住的可能原因**：
- **main.jsx 中的某个 import 抛出 ReferenceError**（比如 AuthContext 内部调用未定义函数）
- **React 渲染时死循环**
- **Network 阻塞**（CDN 大量请求，TCP 拥塞）

**但 React 错误不会阻塞事件循环**（React 18+）—— 错误冒泡到 unhandledrejection，但 setTimeout 仍会触发。

---

### 🔴 真正可能让 failsafe 也不触发的 Bug

**让我再看一遍 cleanup 代码**：

```js
function cleanup() {
  if (cleaned) return; cleaned = true;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  window.removeEventListener('resize', resize);
  mq.removeEventListener('change', applyMobile);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('touchend', onTouchEnd);
  if (failsafeTimer) { clearTimeout(failsafeTimer); failsafeTimer = null; }  // ← L201
  if (fadeOutTimer) { clearTimeout(fadeOutTimer); fadeOutTimer = null; }     // ← L202
  window.__introMounted = true;
}
```

**等等！** `if (failsafeTimer) { clearTimeout(failsafeTimer); failsafeTimer = null; }` —— **如果 failsafe 已经被 trigger 过**（setTimeout 已"完成"），clearTimeout 无效，failsafeTimer 设为 null。**没问题**。

**但如果 fadeOutAndCleanup 跑过一次**（比如 5s 时 setTimeout 1000ms 触发），`fadeOutTimer` 是已完成的 timer 引用。clearTimeout 设为 null。**没问题**。

---

### ✅ 我现在给出最终诊断

**最可能的根本原因**（基于代码逻辑）：

#### **桌面端：`AuthContext` 初始化时调用 `/api/auth/me` 失败 + AuthContext 内部 `window.location.href = '/login'` 触发整页重定向 + 第二次加载时 placeholder 仍可见**

**关键证据**：
1. **用户报告"placeholder 重新出现"** —— 这只能由**整页重新加载**解释
2. **`client/src/contexts/AuthContext.jsx:179,199,213` 有 `window.location.href`** —— 整页重定向源头
3. **`__introMounted` 整页加载后是 undefined** —— 重定向后**会再次播放动画**
4. **但用户报告"动画只播放一次"** —— 矛盾

**解决矛盾的可能**：
- **第二次加载时** intro-animation.js **也跑了动画**，但**动画进行中**用户没看到（因为动画是黑底 + 星空 + 进度条 + 标题）
- **动画结束后** 又是 cleanup + `__introMounted=true` + `window.location.href = '/login'`
- **死循环** —— **但**这会导致用户**看到第二次动画**（除非动画在后台）

**或者**：
- **React 没抛错**，**AuthContext 初始化成功**
- **但** `AuthContext` 内部某处 useEffect 调用了 `window.location.href = '/login'`
- **整页重定向**
- **第二次加载**：动画 → cleanup → `__introMounted=true` → **React 渲染 Login 组件**（**不再重定向**）
- 用户看到 Login 页面

**但用户报告"永远不进入页面"** —— 看不到 Login 页面？

**这只能说明** **第二次加载的动画有问题**。

---

### 🛠 立即可执行的修复（无需诊断）

**根据代码逻辑，以下 3 个修复覆盖 90% 可能性**：

#### **修复 1（最优先）：`fadeOutAndCleanup` 改为无条件触发，不等 React ready**

**问题**：`setTimeout(fadeOutAndCleanup, 1000)` 在 flyTick 末尾，**但如果 initStars 永远不 resolve，flyTick 永远不跑，这个 setTimeout 永远不排程**。

**修复**：把 `fadeOutAndCleanup` 改为**兜底机制**：
```js
// 在 IIFE 末尾（failsafe 旁边）加一个独立兜底：
var hardTimeout = setTimeout(function () {
  if (overlay.parentNode && !cleaned) {
    console.warn('[intro-animation] hard timeout, forcing fadeOut');
    fadeOutAndCleanup();
  }
}, 8000);  // 8s 兜底

// cleanup 内也要 clearTimeout(hardTimeout)
```

#### **修复 2（次优先）：React 端在设置 `__introMounted` 前先检查 placeholder**

**问题**：React 代码（`client/src/main.jsx`）：
```js
window.__introMounted = true;
if (window.__introReady) window.__introReady();
```

**但没检查 placeholder 是否还在 DOM**。如果 intro-animation.js 启动失败（比如 `__introMounted` 已经 true），placeholder 不会被移除。

**修复**（`client/src/main.jsx`）：
```js
// 在 __introMounted 之前先移除 placeholder
var ph = document.getElementById('intro-placeholder');
if (ph) ph.remove();
window.__introMounted = true;
if (window.__introReady) window.__introReady();
```

#### **修复 3（防御性）：`__introReady` 不依赖动画状态**

**问题**：当前 `__introReady` 只处理"跳过按钮"，**不强制 cleanup**：
```js
window.__introReady = function () {
  if (!isAnimating || cleaned) return;
  // ... 创建跳过按钮
};
```

**修复**：无论动画状态如何，**`__introReady` 都触发 dismiss**：
```js
window.__introReady = function () {
  // 不管动画状态，立即 dismiss
  fadeOutAndCleanup();
  // 跳过按钮的逻辑保持不变
  if (isAnimating && !cleaned) {
    // ... 创建跳过按钮
  }
};
```

---

### 📊 关键诊断请求

**Agent1 需要立即收集以下信息**：

1. **桌面端浏览器 DevTools Console**：是否有任何 JS 错误？特别是 `fetch`、`AuthContext`、`AuthProvider` 相关
2. **桌面端 Network 标签**：`/api/auth/me` 请求状态？CORS 错误？
3. **桌面端 Elements 标签**：overlay 消失后 `<div id="intro-placeholder">` 是否真的存在？`<div id="root">` 的内容是什么？
4. **桌面端 Performance 录制**：从 t=0 到 t=20s 是否有长任务（> 50ms）？
5. **桌面端 Network 录制**：`img.abdl-space.top/file/1779879250278_ABDL_icon.svg` 是否成功？状态码？
6. **桌面端 Application 标签**：`window.__introMounted` 值？`window.__introReady` 是否是 function？

**最可能 3 个原因**（按可能性排序）：

1. **CORS preflight 失败** + React 渲染时 `window.location.href = '/login'` + 整页重定向 + 第二次动画被新 React 渲染卡住
2. **`fetch` 永远 pending**（TCP 拥塞 / CDN 异常）+ `initStars` 永远不 resolve + failsafe 触发但用户没等到
3. **React 渲染时某 Provider 抛错**（ThemeProvider / NsfwProvider / AuthProvider 初始化失败）+ 整个 React 树崩溃 + ErrorBoundary 吞掉错误 + `#root` 是空

**紧急建议**：
- 立即把 `client/src/main.jsx` 末尾改为：
  ```js
  var ph = document.getElementById('intro-placeholder');
  if (ph) ph.remove();
  window.__introMounted = true;
  if (window.__introReady) window.__introReady();
  ```
- 立即把 `intro-animation.js` 的 failsafe 改为：
  ```js
  setTimeout(function () { 
    if (!cleaned && overlay.parentNode) fadeOutAndCleanup(); 
  }, 8000);
  ```
- 立即把 `intro-animation.js` 的 `__introReady` 改为无条件 dismiss + 占位兜底

