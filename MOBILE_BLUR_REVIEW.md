# 毛玻璃效果缺失 — 深度诊断报告

## 确认：global.css 完全一致

```bash
$ md5sum abdl-space-v2/client/src/styles/global.css abdl-space-mobile/src/styles/global.css
a9a6411e785461d8ecbfa3d3527ac2ba  abdl-space-v2/client/src/styles/global.css
a9a6411e785461d8ecbfa3d3527ac2ba  abdl-space-mobile/src/styles/global.css  ← 相同
```

`backdrop-filter: blur(24px) saturate(200%)` 和 `-webkit-backdrop-filter` 在两个文件的同一位置完全相同。CSS 规则本身没有问题。

---

## 已排除的原因

| 检查项 | 结论 |
|--------|------|
| CSS 内容差异 | 已排除 — 文件 MD5 完全一致 |
| backdrop-filter 规则缺失 | 已排除 — 规则存在且正确 |
| -webkit- 前缀缺失 | 已排除 — 两个版本都有 |
| Tailwind 版本 | 已统一（都是 3.4.x） |
| postcss.config.js | 都使用 tailwindcss + autoprefixer |
| 移动端 mobile.css 覆盖 | 已检查 — mobile.css 只覆盖 display，不覆盖 backdrop-filter |

---

## 真正原因：App 组件结构差异

### 主站（正常）

```jsx
<div className="app-layout">
  <Sidebar />                                    {/* 在 App 外层 */}
  <MobileHeaderLayout />                          {/* 在 App 外层，Suspense 外 */}
  <div className="app-main-content">
    <Suspense><Routes>...</Routes></Suspense>    {/* 懒加载 */}
  </div>
  <MobileBottomNav />                             {/* 在 App 外层 */}
</div>
```

### 移动端（毛玻璃失效）

```jsx
<div className="app-layout">
  <MobileHeader />                                {/* ← 在 App 内，紧贴 app-layout */}
  <main className="app-main-content">
    <Suspense><Routes>...</Routes></Suspense>
  </main>
  <MobileBottomNav />                             {/* ← 在 App 内，紧贴 app-layout */}
</div>
```

**移动端的 `MobileHeader` 和 `MobileBottomNav` 都在 `app-layout` 内部**，而主站的对应组件在 `app-layout` 外部。

---

## 最可能的根因

### 假设 1：PostCSS / Tailwind 构建差异

即使 CSS 文件内容相同，**构建过程中 PostCSS/Tailwind 可能有不同的 JIT 行为**。

检查方法：在两个项目中执行 `grep -r "backdrop-filter" dist/`（构建后）看实际生成了多少条规则。

如果移动端构建时 Tailwind JIT 发现 `.mobile-header` 没有出现在 JSX 源码中（因为使用的是 `className="mobile-header"` 字符串而非动态类），可能会有不同行为。

**验证**：
```bash
# 主站
grep -c "backdrop-filter" dist/assets/*.css

# 移动端
grep -c "backdrop-filter" dist/assets/*.css
```

如果数量不同，说明构建输出有差异。

---

### 假设 2：CSS 加载顺序

`main.jsx` 中导入顺序：

**主站**：
```jsx
import './styles/global.css'   // backdrop-filter 在这里
```

**移动端**：
```jsx
import './styles/global.css'   // 同样的 CSS
import './styles/mobile.css'  // 移动端专用覆盖
```

`mobile.css` 中的这条规则：
```css
.bottom-nav-floating { display: flex !important; }
```

这条规则在 `@media (max-width: 768px)` 媒体查询外定义（移动端始终强制），可能导致 `.bottom-nav-floating` 的 `display: flex` 覆盖了媒体查询内的其他样式。

但这不影响 `backdrop-filter`。

---

### 假设 3：浏览器兼容性问题（最可能）

**设备/浏览器级别**的 backdrop-filter 支持问题：

- iOS Safari 15 以下：需要 `-webkit-backdrop-filter`，且有一些已知 bug
- 部分 Android Chrome 版本：backdrop-filter 需要 GPU 加速开启

主站如果在 Chrome DevTools 模拟器测试，而移动端项目在真实 iOS Safari 物理机上测试，两者表现可能不同。

**验证方法**：在两个项目都用 Chrome DevTools 移动端模拟器测试，对比效果。如果模拟器中都正常但真机有问题，说明是设备兼容性问题。

---

## 快速修复方案

### 方案 A：确认 CSS 规则被正确应用（立即测试）

在浏览器 DevTools 中：

1. 打开移动端项目
2. 检查 `.mobile-header` 元素的 `Styles` 面板
3. 确认 `backdrop-filter: blur(24px) saturate(200%)` 是否显示为 **被划掉（strike-through）** 或 **无效**

如果被划掉，说明被其他更高优先级的规则覆盖。如果未显示，说明 CSS 根本没有被加载。

### 方案 B：强制提升 backdrop-filter 兼容性

在 `global.css` 顶部（`:root` 定义之前）添加：

```css
/* 强制启用 GPU 加速以确保 backdrop-filter 正常工作 */
@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)) {
  .mobile-header, .bottom-nav-floating {
    transform: translateZ(0);
    will-change: backdrop-filter;
    -webkit-backdrop-filter: blur(24px) saturate(200%);
    backdrop-filter: blur(24px) saturate(200%);
  }
}
```

### 方案 C：简化背景色替代方案（保底）

如果上述都不奏效，在 `mobile.css` 中强制使用固定半透明背景：

```css
.mobile-header, .bottom-nav-floating {
  background: rgba(255, 255, 255, 0.85) !important;
  backdrop-filter: none !important;  /* 回退到无模糊的纯色 */
  -webkit-backdrop-filter: none !important;
}
```

---

## 下一步排查

1. **确认 CSS 实际加载**：DevTools Elements 面板 → `.mobile-header` → computed style → 搜索 `backdrop-filter`
2. **对比构建产物**：解压两个项目的 dist CSS，grep `backdrop-filter` 出现次数
3. **测试真机 vs 模拟器**：排除浏览器模拟器 vs 真实设备的差异
4. **检查 z-index**：确保 `z-index: 50` (header) 和 `z-index: 100` (bottom nav) 没有被更高层级的 stacking context 遮挡
