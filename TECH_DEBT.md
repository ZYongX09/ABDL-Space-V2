# ABDL Space v2 — 技术债务与未来规划分析

> 分析时间：2026-05-31
> 分析范围：前端全代码库（70+ 文件，15000+ 行代码）

---

## 📊 代码质量现状

### 代码规模
| 模块 | 文件数 | 总行数 | 最大文件 |
|------|--------|--------|----------|
| Pages | 26 | ~8,500 | ProfilePageV2.jsx (1,251) |
| Components | 26 | ~4,500 | QuantumVerify.jsx (492) |
| Contexts | 5 | ~700 | AuthContext.jsx (315) |
| Utils | 5 | ~300 | nbwOAuth.js (118) |
| API | 1 | 1,041 | api.js (单文件) |
| **总计** | **63** | **~15,074** | — |

### 已知技术债务
1. **无 TypeScript** — 全 JavaScript，无类型安全
2. **无测试** — 0 个测试文件，无 Jest/Vitest
3. **无错误监控** — ErrorBoundary 有 TODO 注释但未接入 Sentry
4. **单文件大组件** — ProfilePageV2 (1,251行)、AdminPage (654行)
5. **API 层单文件** — api.js (1,041行) 所有 API 集中在一个文件
6. **CSS 内联** — ProfilePageV2 有 ~700 行 JS 内联样式对象
7. **构建产物过大** — 多个 chunk 超过 5MB（NSFW 模型）

---

## 🔧 技术债务优先级

### P0 — 必须解决（影响稳定性）
1. **错误监控接入** — 生产环境无任何错误追踪
   - 方案：接入 Sentry 或 Cloudflare Workers Analytics
   - 工作量：2-4 小时
   
2. **API 错误统一处理** — 部分 `.then()` 链无 `.catch()`
   - 已发现：AccountPrivacy.jsx whenNBWReady()（已修复）
   - 方案：apiFetch 层统一错误边界
   - 工作量：1-2 小时

### P1 — 应该解决（影响开发效率）
3. **TypeScript 迁移** — 逐步迁移，从 api.js 和 utils 开始
   - 方案：`jsconfig.json` → 逐步改 `.tsx`
   - 工作量：持续进行，每次 1-2 个文件
   
4. **测试框架搭建** — 至少覆盖核心流程
   - 方案：Vitest + React Testing Library
   - 优先测试：登录、发帖、评分、关注
   - 工作量：框架搭建 2 小时 + 每个测试 30 分钟

5. **组件拆分** — ProfilePageV2 拆分为子组件
   - 拆分方案：
     - `ProfileHeader.jsx` — 头像+用户名+关注
     - `ProfileStats.jsx` — 统计数据栏
     - `ProfileTabs.jsx` — Tab 切换
     - `ProfilePosts.jsx` — 帖子列表
     - `ProfileWorn.jsx` — 穿过的纸尿裤
   - 工作量：3-4 小时

### P2 — 可以解决（影响性能/体验）
6. **API 层拆分** — api.js 按领域拆分
   - `api/auth.js`、`api/forum.js`、`api/diapers.js` 等
   - 工作量：2-3 小时

7. **构建优化** — NSFW 模型懒加载 + code splitting
   - 当前 NSFW 模型 shard 文件 ~5.5MB each
   - 方案：仅在需要时加载模型（图片上传时）
   - 工作量：2-3 小时

8. **CSS 架构** — 减少内联样式
   - ProfilePageV2 的 `S` 对象应迁移到 CSS modules 或 Tailwind
   - 工作量：4-6 小时

---

## 🚀 未来功能规划

### 短期（1-2 周）
1. **帖子分页/无限滚动** — 已实现 ForumFeed 加载更多，需扩展到其他列表
2. **通知可点击导航** — 已实现
3. **移动端适配优化** — 持续改进

### 中期（1-2 月）
4. **React Native 原生 APP** — MEMORY.md 中已规划
   - 技术栈：React Native + NativeWind
   - 复用：API 层、业务逻辑、部分组件
   - 工作量：4-8 周

5. **OAuth token refresh 原子化** — MEMORY.md 中已规划
   - 当前问题：token 过期时并发请求可能都失败
   - 方案：请求队列 + 原子 refresh

6. **图片懒加载优化** — 当前所有图片同时加载
   - 方案：IntersectionObserver + 占位符

### 长期（3-6 月）
7. **PWA 支持** — Service Worker + 离线缓存
8. **实时通知** — WebSocket 或 Server-Sent Events
9. **国际化（i18n）** — 如果需要扩展到非中文用户
10. **A/B 测试框架** — 数据驱动的功能迭代

---

## 🐛 待修复 Bug 清单（本次发现但未修复）

| # | Bug | 严重性 | 原因 |
|---|-----|--------|------|
| UX-021 | AdminPage 列表无搜索 | P3 | 工作量大 |
| UX-025 | form-control 无 label | P3 | 系统性问题 |
| UX-027 | Home 纸尿裤无分页 | P4 | 当前数据量小 |
| UX-029 | AdminPage 删除无 loading | P3 | 需重构 |
| UX-030 | Profile 帖子无加载更多 | P3 | 需后端分页 |

---

## 📋 建议下一步行动

1. ✅ 接入错误监控（Sentry）— 最高优先级
2. ✅ 搭建测试框架（Vitest）— 保证核心流程
3. ✅ 继续组件拆分（ProfilePageV2 → 子组件）
4. ✅ TypeScript 逐步迁移（从 api.js 开始）
5. ✅ React Native APP 前期调研
