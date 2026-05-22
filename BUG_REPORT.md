# Bug Report

## 2025-01-23 — MIUI 灵动动画系统升级审查

---

### Bug #1 — 重复动画叠加 [P1]

- **严重程度**：P1（功能异常）
- **文件**：`client/src/pages/FollowersPage.jsx:96`、`NotificationsPage.jsx:71`、`Recommendations.jsx:154`、`TermWiki.jsx:46`、`PostDetail.jsx:349`
- **问题**：`PageLayout` 的 `useEffect` 会自动给所有 `.card` 元素添加 `miui-card-in` 类，但这些页面同时又在卡上写了 `stagger-item` 类，导致同一元素同时运行两个入场动画。
- **动画冲突**：
  - `stagger-item`：CSS animation `fadeInUp 0.45s cubic-bezier(0.22, 1, 0.36, 1)`
  - `miui-card-in`：CSS animation `miuiCardIn 0.45s var(--miui-ease)`
  - 两者叠加导致元素先执行一次动画再执行另一次，视觉上会有抖动/闪烁
- **建议修复**：
  - 方案A：在 `PageLayout` useEffect 中，只对**没有** `stagger-item` 类的 `.card` 添加 `miui-card-in`
  - 方案B：移除这些页面上的 `stagger-item`，统一由 PageLayout 管理
  - 推荐方案A，保持向后的灵活性

---

### Bug #2 — stagger-item 配合 animate-fade-in-up 冗余 [P2]

- **严重程度**：P2（代码质量）
- **文件**：`client/src/pages/PostDetail.jsx:349`
- **问题**：`<div className="card stagger-item animate-fade-in-up">`
  - `stagger-item` 已在 CSS 中定义了完整的 `animation: fadeInUp 0.45s ...`
  - `animate-fade-in-up` 又定义了一次（相同的 `fadeInUp` 动画），两个 animation 叠加
- **建议修复**：移除 `animate-fade-in-up`，仅保留 `stagger-item`

---

### Bug #3 — form-control focus 的 scale(1.01) 可能引发布局抖动 [P2]

- **严重程度**：P2（体验问题）
- **文件**：`client/src/styles/global.css`（`.form-control:focus`）
- **问题**：输入框获取焦点时 `transform: scale(1.01)` 会导致输入框略微放大，在密集表单场景下可能造成相邻元素位移
- **建议修复**：移除 `transform: scale(1.01)`，保留 `box-shadow` 和 `border-color` 变化即可提供视觉反馈

---

### Bug #4 — stagger-item nth-child 延迟只到第 8 项 [P3]

- **严重程度**：P3（代码质量）
- **文件**：`client/src/styles/global.css`（`.stagger-item` 相关）
- **问题**：交错动画只定义了 `nth-child(1)` 到 `nth-child(8)` 的延迟，第 9 个及之后元素没有延迟，列表长度不确定时体验不一致
- **建议修复**：补全 `nth-child(9)` 到 `nth-child(n+10)` 的延迟定义（参考 `miui-stagger` 的写法）

---

### 审查通过项 ✅

- **CSS 语法**：无多余 `}`、无缺失 `{`，结构正确
- **JSX className**：无拼写错误，无冲突
- **overflow hidden**：使用场景均为合理（hero shimmer、btn ripple effect）
- **构建状态**：`npm run build` 通过，无错误
- **MIUI 工具类**：7 个新增类命名一致，无冲突
- **PageLayout.jsx**：结构正常，useEffect 清理逻辑正确

---

### 状态：待修复（Bug #1 和 #3 需要优先处理）
