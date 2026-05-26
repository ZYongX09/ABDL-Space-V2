# 移动端项目样式问题诊断报告

## 核心结论

**5 个配置差异导致样式崩坏**，其中 **Tailwind v3→v4 破坏性变更**是根本原因。

---

## 差异 1 — Tailwind 版本（根本原因）

| 项目 | 版本 |
|------|------|
| 主站 | v3.4.13 (`tailwindcss@^3.4.20`, `postcss`, `autoprefixer`) |
| 移动端 | v4.3.0 (`tailwindcss@^4.3.0`, `@tailwindcss/vite`) |

**v3→v4 是破坏性变更：**

| 变化 | v3 | v4 |
|------|----|----|
| CSS 导入 | `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| 配置 | `tailwind.config.js` | `@theme {}` in CSS 或 `tailwind.config.ts` |
| PostCSS | 需要 `postcss + autoprefixer` | 不再需要，用 `@tailwindcss/vite` 插件 |
| 指令 | `@apply` 工作 | v4 `@apply` 有差异 |
| `content` paths | `tailwind.config.js` 的 `content` 字段 | v4 自动扫描，无需手动配置 |

**影响**：v4 完全重写了 CSS 输出，v3 的工具类可能在 v4 下样式不同。v4 的 `@import "tailwindcss"` 生成的基础样式与 v3 的 `@tailwind base` 不同。

---

## 差异 2 — mobile.css 中 `@import "tailwindcss"` 重复导入

**文件**：`mobile.css:2`

```css
@import "tailwindcss";  /* 重复！global.css:1 已经导入过一次 */
```

**影响**：
- Tailwind v4 下重复导入可能造成 CSS 规则重复或覆盖
- `global.css` 和 `mobile.css` 都被 `main.jsx` 导入，`@import "tailwindcss"` 被处理两次
- v4 的 JIT 模式在两次扫描间可能产生不一致的 class 集

---

## 差异 3 — CSS 变量在 v3/v4 间差异

**主站** `:root` 定义了完整 CSS 变量集（`--primary`, `--text`, `--bg-card` 等），这些是样式系统的核心。

**移动端** `global.css:1` 是 `@import "tailwindcss"`，**没有先定义 `:root` CSS 变量**。

在 Tailwind v4 中，如果你的样式依赖 CSS 变量（如 `color: var(--primary)`），这些变量在 `@import "tailwindcss"` 之前必须已定义。移动端 `global.css` 顺序是：

```css
@import "tailwindcss";   /* ← 此时 CSS 变量尚未定义！*/

/* ... 后面才定义 :root { --primary: ... } */
```

**正确顺序**：

```css
/* 先定义 CSS 变量 */
:root { --primary: #A8D8F0; ... }

/* 后导入 Tailwind */
@import "tailwindcss";
```

---

## 差异 4 — 移动端缺少 Sidebar 导致的 CSS 选择器失效

**问题**：`mobile.css` 用 `!important` 隐藏了所有 sidebar 相关元素：

```css
.sidebar-desktop, .sidebar-placeholder, .sidebar-collapsible, .sidebar-overlay { display: none !important; }
```

但 **移动端的 `App.jsx` 根本没有渲染 `<Sidebar />` 组件**，所以这些 `.sidebar-*` 选择器本来就不匹配任何东西。

**真正的问题**：主站的 CSS 中很多样式依赖 DOM 结构，例如：

```css
@media (max-width: 768px) {
  .app-layout { flex-direction: column; ... }
  .app-main-content { padding-top: 48px; }
  .sidebar-desktop { display: none; }
}
```

移动端用 `!important` 强制覆盖，但这些覆盖**没有完整包含所有需要修复的布局规则**。例如 `bottom-nav-floating` 的完整样式在主站中可能包含更复杂的媒体查询规则，而移动端的 `mobile.css` 只覆盖了部分。

---

## 差异 5 — 主站毛玻璃效果（glass-card, glass-sidebar, glass-navbar）仅限 `[data-theme="colorful"]`

**观察**：`mobile.css` 定义的毛玻璃对 `.mobile-header` 和 `.bottom-nav-floating` 设置了 `!important`，但 `mobile-header` 的毛玻璃在主站 `global.css` 中定义在媒体查询内：

```css
@media (max-width: 768px) {
  .mobile-header { display: none; }  /* ← 主站只在移动端隐藏！ */
}
```

移动端应该显示 `.mobile-header`，但因为主站 CSS 大量依赖媒体查询判断是否渲染，如果移动端的 `global.css` 内容与主站不一致（同步时间差），毛玻璃效果可能没被正确应用。

---

## 差异 6 — 百度统计等外部脚本缺失

**主站 `index.html` 有**：
```html
<script>var _hmt = _hmt || []; ... </script>
```

**移动端 `index.html` 没有**，不影响样式，但说明两个 index.html 存在分叉。

---

## 差异 7 — React/React Router 版本差异

| 项目 | React | React Router |
|------|-------|-------------|
| 主站 | ^18.3.1 | ^6.26.0 |
| 移动端 | ^19.2.6 | ^7.15.1 |

**React 19** 有 breaking changes，可能影响组件渲染行为和 CSS 类名。

**React Router v7** (RR7) 是 RR v6 的重大更新，API 有变化，组件结构可能受影响。

---

## 修复方案

### 立即修复（Priority 1）

**1. 修正 CSS 导入顺序**

在 `global.css` 顶部，`@import "tailwindcss"` **之前**先定义所有 CSS 变量：

```css
/* global.css — 移动端 */
:root {
  --primary: #A8D8F0;
  --primary-dark: #6AAEC8;
  /* ... 所有 :root 变量 ... */
}

@import "tailwindcss";

/* 后面继续 :root 的其他主题覆盖 */
```

**2. 删除 `mobile.css` 中的重复 `@import "tailwindcss"`**

```css
/* mobile.css */
@import "tailwindcss";  /* 删除这行，global.css 已处理 */

/* 移动端覆盖... */
```

### Priority 2

**3. 统一 Tailwind 版本（推荐降级到 v3）**

移动端 `package.json` 修改：

```json
{
  "dependencies": {
    "tailwindcss": "^3.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.47"
  }
}
```

`vite.config.js` 改回：

```js
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import postcss from 'postcss'

export default defineConfig({
  plugins: [react()],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  // ...
})
```

并创建 `postcss.config.js`：

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**4. 删除 `tailwind.config.js`（v3 需要）或确认 v4 兼容（v4 不需要）**

如果降级到 v3，保留 `tailwind.config.js`；如果坚持 v4，需要重新配置 `@theme` block 并完全迁移所有 CSS 变量。

### Priority 3

**5. 确保移动端 App.jsx 结构与主站一致**

移动端 `App.jsx` 的 provider 包裹顺序和组件结构应与主站对齐，特别是 `NotificationProvider` / `NsfwProvider` 应该在 `App` 外部。

**6. React 19 降级到 18**

React 19 还在 RC 阶段，生产环境使用有风险。降级到 `^18.3.1`。

---

## 总结优先级

| # | 问题 | 影响 | 优先级 |
|---|------|------|--------|
| 1 | Tailwind v4 不兼容 CSS 变量定义顺序 | 大量样式丢失 | **P0** |
| 2 | 移动端 `mobile.css` 重复导入 Tailwind | CSS 重复/冲突 | **P0** |
| 3 | Tailwind v3→v4 破坏性变更 | 工具类样式差异 | **P1** |
| 4 | React 19 + RR7 新版本风险 | 行为异常 | **P1** |
| 5 | Sidebar 隐藏逻辑 vs 实际 DOM 不匹配 | 覆盖不完整 | **P2** |
| 6 | 百度统计等外部资源缺失 | 无样式影响但需同步 | **P3** |

**最紧急修复**：修正 global.css 中 CSS 变量在 `@import "tailwindcss"` 之前定义，删除 mobile.css 的重复导入。
