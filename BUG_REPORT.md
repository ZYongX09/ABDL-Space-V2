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
