# Bug 报告 — d27ab19 (后端) + e49fc27 (前端)

---

## 安全性审查

---

### Bug #1 — P1（安全性）
- **文件**：`src/routes/nbw.ts` (`bind-existing`)
- **问题**：`nbw_code`（NBW OAuth 授权码）在 `/callback` 端点已被换取 token 并消耗，但前端将此 code 又传递给 `/bind-existing`，后端再次用它换 token。**如果 NBW OAuth 实现允许同一 code 被多次交换**（不幂等），攻击者可以截获 `nbw_code` 并在**其他已登录 ABDL Space 用户**的浏览器中完成绑定流程，将该 NBW 账号绑定到受害者账号（但攻击者仍需知道受害者 ABDL Space 账号密码）。
- **利用条件**：受害者已登录 ABDL Space + 攻击者知道受害者密码（或通过钓鱼）
- **建议**：在 `/callback` 端点不消费 code，而是将 `code` 直接透传给 `/bind-existing`，确保 code 只被消费一次；或在后端引入一次性 `nbw_bind_token` 替代 code 流转

---

### Bug #2 — P2（安全性）
- **文件**：`src/routes/nbw.ts` (`bind-existing`)
- **问题**：端点无需 ABDL Space 会话即可调用（无 `authMiddleware`），仅凭账号密码即可绑定。这使得**跨站请求**（CSRF-like）攻击可行：已登录受害者访问恶意页面，恶意页面用受害者知道的密码向 `/bind-existing` 发起绑定请求。
- **缓解**：攻击者仍需知道受害者 ABDL Space 密码，且绑定操作本身对用户有利（不造成损失）
- **建议**：考虑增加 CSRF token，或要求 `bind-existing` 携带 ABDL Space session cookie 验证

---

### Bug #3 — P2（安全性）
- **文件**：`client/src/pages/NBWChoicePage.jsx:50`
- **问题**：`location.state` 可通过用户修改 browser history / 书签注入伪造数据。若用户把 `/auth/nbw/choose?code=xxx` 收藏后直接访问，`nbw_code` 和 `nbw_user` 来自可控的 state，可能导致后续绑定流程异常
- **缓解**：`nbw_code` 仍需后端验证，且 `nbw_user.username` 仅作展示
- **建议**：`nbw_code` 应通过后端 session 或加密 token 传递，而非前端 state

---

### Bug #4 — P3（安全）
- **文件**：`client/src/pages/NBWChoicePage.jsx:35` & `client/src/pages/NBWCallback.jsx:80-88`
- **问题**：`action === 'register'` 分支存在但永远不会被新流程触发（后端已改为 `choose`），属于死代码
- **影响**：旧版后端部署时行为不一致，增加维护负担

---

## 代码质量审查

---

### Bug #5 — P2
- **文件**：`client/src/pages/NBWChoicePage.jsx:47`
- **问题**：`authLogin({ login: login.trim(), password })` 之后立刻 `window.location.href = '/'`。`authLogin` 是异步的但没有 await，且 redirect 用的是 full page load 而非 React Router
- **影响**：用户可能看到两次登录（authLogin 触发一次，页面 reload 时后端 cookie 又设置一次）
- **建议**：直接用后端返回的 token：`localStorage.setItem('abdl_token', data.token)` + `window.location.href = '/'`

---

### Bug #6 — P3
- **文件**：`client/src/pages/NBWChoicePage.jsx:21`
- **问题**：`useState(null)` 后直接读取 `location.state`，SSR 下 `location.state` 可能为 undefined，但这里组件是纯客户端渲染，影响较小
- **影响**：低

---

### Bug #7 — P1
- **文件**：`src/routes/nbw.ts:153` (`bind-existing` 端点)
- **问题**：`token` 返回在 JSON body 中，同时也通过 `Set-Cookie` 设置。若前端用 `localStorage` 存储 token（如 authLogin 的实现），cookie 设置是冗余的；若用 cookie 则 JSON body 返回的 token 不必要
- **实际影响**：取决于 AuthContext 实际如何处理登录——需确认 AuthContext 是用 cookie 还是 localStorage 存储/发送 token
- **建议**：统一 token 传递方式，避免双重存储

---

### Bug #8 — P2
- **文件**：`client/src/App.jsx:81` & `client/src/pages/NBWChoicePage.jsx`（路由 title）
- **问题**：`ROUTE_TITLES` 中 `/auth/nbw/choose` 路由 title 为 `'关联账户 — ABDL Space'`，但 NBWChoicePage 组件 title 显示的是 `'关联账户'`。不一致
- **影响**：低——只是 document.title 差异

---

## 总体评价

**方向正确**，但存在关键安全隐患：code 被消费两次（callback + bind-existing），如果 NBW OAuth 不是真·一次性 code，存在 replay 风险。

| # | 级别 | 概要 |
|---|------|------|
| 1 | **P1** | `nbw_code` 在 callback 和 bind-existing 各被消费一次，存在 replay 风险（如果 NBW code 非真幂等） |
| 2 | P2 | `/bind-existing` 无会话验证，可被 CSRF-like 攻击（但攻击需知道密码） |
| 3 | P2 | `location.state` 存储 nbw_code 可被用户篡改 |
| 4 | P3 | `action === 'register'` 死代码 |
| 5 | **P2** | `authLogin` 后未 await 即 redirect，可能双次登录 |
| 6 | P3 | useState(null) 读取 location.state |
| 7 | **P1** | Token 双重传递（cookie + body），需确认 AuthContext 实际存储机制 |
| 8 | P2 | document.title 与页面显示不一致 |
