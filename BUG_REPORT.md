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
