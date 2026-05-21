# ABDL Space V2 — 修改记录

> 每次对项目进行修改后，由 AI 助手自动更新此文件
> 记录格式：日期时间、版本、修改内容、涉及文件、原因/背景

## 2026-05-20

### 04:21 — 编辑资料拆分为独立组件
- **类型**：重构
- **内容**：
  1. 编辑资料功能从 Profile.jsx 拆分为独立 EditProfile 组件
  2. MIUI 底部弹出 sheet 风格，移动端全屏，PC 端 max-width 520px
  3. 毛玻璃背景 + 弹性动画
  4. 清理 Profile.jsx 中未使用的导入和状态
- **涉及文件**：Profile.jsx、EditProfile.jsx（新建）、global.css
- **Git**：commit 8cf7741

### 00:00-01:32 — v2.8.0 收工发布

#### NSFW 敏感内容智能检测体系
- 接入 NSFWJS + TensorFlow.js 浏览器端 AI 分类
- 两级检测：高敏感（Porn≥0.2/Hentai≥0.25）禁止上传，低敏感（Sexy≥0.15/Hentai≥0.1）模糊+黄色发光+类型标签
- 上传时检测并标记，后端存储 is_nsfw，前端根据标记 blur
- CORS 兼容：独立 Image 元素分类，无 CORS 头时跳过检测
- 设置页「敏感内容屏蔽」开关 + 「搜索包含敏感内容」开关
- 新增 NsfwContext、NsfwGuard 组件

#### 举报系统
- 帖子/评论新增红色盾牌举报按钮
- ReportModal 举报弹窗（敏感内容/垃圾广告/其他）
- 管理后台新增「举报管理」tab（待处理/已处理/已驳回）
- 后端新增 reports 表 + 举报 API

#### 头像上传
- 个人中心编辑模式新增头像上传区域
- 上传前 NSFW 检测，敏感内容拒绝上传
- 支持 JPG/PNG/GIF/WEBP，最大 5MB

#### 批量删除帖子
- 个人中心「管理」按钮进入选择模式
- 复选框多选 + 批量删除

#### MIUI/HyperOS 移动端优化
- 卡片弹性触控反馈 + cubic-bezier 弹性曲线
- 底部导航栏/标题栏毛玻璃增强
- 模态框底部弹出（MIUI sheet 风格）
- Toast 底部居中 + 弹性入场动画
- 骨架屏丝滑动画、通知徽章脉冲
- 搜索框/输入框 MIUI 圆角 + focus 发光
- 帖子操作栏触控区 40px、标签页胶囊样式

#### Bug 修复
- 模型加载竞态：loadModel 后 modelReady state 异步更新导致误报
- 删除帖子需两次点击：setTimeout 延迟触发验证
- Settings searchNsfw 未定义：补回状态定义
- CSP connect-src none：新增 _headers 文件配置
- NSFW 刷新后 blur 消失：后端 safeGetImages 加 is_nsfw 查询
- API 返回图片不含 is_nsfw：所有 .map() 加 is_nsfw 字段
- 图片数据格式不兼容：后端兼容 {url, is_nsfw} 对象
- 图床改用 ImgBed：代理到 img.abdl-space.top
- 删除帖子/评论清理图床图片
- 移动端图标不显示：fa-regular 改 fa-solid
- 私信页面被容器限制：破出父容器全屏显示

#### 涉及文件
前端：NsfwContext.jsx、NsfwGuard.jsx、ReportModal.jsx、ImageUploader.jsx、ImageGrid.jsx、ForumFeed.jsx、PostDetail.jsx、Profile.jsx、Settings.jsx、AdminPage.jsx、App.jsx、api.js、global.css、_headers、About.jsx、CHANGELOG.md、PROJECT.md
后端：posts.ts、images.ts、reports.ts、admin.ts、index.ts、types/index.ts、schema.sql

---

## 2026-05-19

### 19:34 — NSFW 敏感图片检测功能（v1：客户端全量检测）
- **类型**：新功能
- **内容**：
  1. 接入 NSFWJS + TensorFlow.js，浏览器端 AI 图片分类
  2. 新增 NsfwContext（模型加载、分类队列）
  3. 新增 NsfwGuard 组件（高斯模糊遮罩 + 警告提示 + 显示图片按钮）
  4. ImageGrid 集成 NsfwGuard，所有帖子图片自动检测
  5. 设置页新增「内容安全」说明
- **涉及文件**：NsfwContext.jsx（新建）、NsfwGuard.jsx（新建）、ImageGrid.jsx、App.jsx、Settings.jsx、package.json

### 21:51 — 头像上传功能
- **类型**：新功能
- **内容**：
  1. 个人中心编辑模式新增头像上传区域（点击选择图片）
  2. 支持 JPG/PNG/GIF/WEBP，最大 5MB
  3. 上传前自动 NSFW 检测，敏感内容拒绝上传并提示
  4. 上传后显示预览，支持移除头像
  5. 点击保存后生效
- **涉及文件**：Profile.jsx
- **NSFW 策略**：头像属于「高度可见区域」，敏感内容一律拒绝

### 21:20 — 敏感内容管理体系（完整实现）
- **类型**：新功能
- **内容**：
  1. 数据库：新增 reports 表 + posts.has_nsfw 冗余标记
  2. 后端：举报 API（POST /api/reports）、管理员举报管理（GET/PATCH /api/admin/reports）、帖子 exclude_nsfw 过滤
  3. 前端：ReportModal 举报弹窗组件
  4. 前端：广场帖子卡片新增举报按钮 + 敏感内容标签
  5. 前端：帖子详情页菜单新增举报选项
  6. 前端：管理后台新增「举报管理」tab（待处理/已处理/已驳回筛选）
  7. 前端：设置页新增「搜索包含敏感内容」开关
  8. 前端：广场搜索默认排除敏感帖子（可在设置中开启）
- **涉及文件**：reports.ts（新建）、ReportModal.jsx（新建）、posts.ts、index.ts、api.js、ForumFeed.jsx、PostDetail.jsx、AdminPage.jsx、Settings.jsx、schema.sql
- **参考**：Twitter/X 敏感内容政策
- **Git 状态**：前端已 push（ce92a18），后端已部署（53a0f2ca），后端 git 仓库损坏需重新 clone

### 20:14 — 敏感内容屏蔽：强制检测 + 开关控制 blur
- **类型**：需求调整
- **内容**：
  1. 所有图片强制检测（后端 is_nsfw 标记优先，无标记时客户端实时检测）
  2. 设置开关改为「敏感内容屏蔽」，仅控制是否应用高斯模糊
  3. 关闭开关 → 所有图片正常显示（不 blur），但检测仍在跑
  4. 开关状态持久化到 localStorage，默认开启
- **涉及文件**：NsfwContext.jsx、NsfwGuard.jsx、Settings.jsx
- **用户需求**：开关不是控制是否检测，而是控制是否 blur

### 19:53 — NSFW 检测重构：上传时检测 + 后端标记
- **类型**：架构重构
- **内容**：
  1. NSFW 检测从「浏览时全量检测」改为「上传时一次性检测」
  2. ImageUploader 上传前自动加载模型并分类，结果随图片上传到后端
  3. 后端存储 `is_nsfw` 标记到数据库
  4. 前端 ImageGrid 优先读取后端标记，无标记时降级为客户端检测
  5. 图片预览网格中标记已检测的敏感图片（红色盾牌 badge）
  6. 设置页移除开关，改为功能说明
- **涉及文件**：NsfwContext.jsx、NsfwGuard.jsx、ImageGrid.jsx、ImageUploader.jsx、CreatePost.jsx、Settings.jsx、global.css
- **后端待配合**：
  - images 表新增 `is_nsfw` 列（BOOLEAN，默认 false）
  - `/api/images/upload` 接口接收 FormData 中的 `is_nsfw` 字段并存储
  - 帖子/评论接口返回图片数据时包含 `is_nsfw` 字段
- **技术细节**：
  - 动态 import 实现懒加载，模型仅在首次上传时下载
  - NSFW 阈值 0.6（Porn + Hentai + Sexy 概率之和）
  - 前向兼容：旧图片无标记时自动降级为客户端实时检测

### 19:26 — 移动端图标修复 + 私信页面全屏布局
- **类型**：Bug 修复 + 布局优化
- **内容**：
  1. 修复 Profile 页抽屉菜单按钮图标不显示（fa-regular → fa-solid）
  2. 修复 MessagesPage 标题栏新私信按钮图标不显示（缺 fa-solid 前缀）
  3. 修复 ForumFeed 标题栏私信/发帖按钮图标不显示（同上）
  4. 移动端私信页面改为全屏布局，破出父容器 px-5/py-6/max-w 限制，不被标题栏和导航栏遮挡
- **涉及文件**：Profile.jsx、MessagesPage.jsx、ForumFeed.jsx、global.css
- **原因**：项目曾从 fa-regular 回退 fa-solid，但部分页面漏改；私信页面被 App.jsx 容器约束导致移动端显示不全
- **推送状态**：commit f33c45f，已 push ✅

### 04:22 — 收工流程 v2.7.0 发布
- **版本**：v2.7.0
- **类型**：收工发布
- **内容**：
  1. 关于页更新日志新增 v2.7.0 条目
  2. CHANGELOG.md 同步更新
  3. PROJECT.md 版本号更新为 v2.7.0
  4. 代码提交、推送并打 tag v2.7.0
- **涉及文件**：About.jsx、CHANGELOG.md、PROJECT.md、MODIFICATIONS.md
- **日志内容**：
  - 发帖支持上传图片，新增图片预览与查看功能
  - 全面优化移动端页面布局与交互体验
  - 新增私信功能（开发调试中）
  - 优化个人中心页面
  - 提升产品性能，修复已知问题
- **用户提供的部分日志**：发帖图片上传、移动端布局优化、私信功能
- **补全逻辑**：根据 git log 补充了个人中心优化和性能/稳定性提升

### 04:12 — 记录设计风格偏好与收工流程
- **类型**：记忆/规则
- **内容**：
  1. 设计动效参考 MIUI / Xiaomi Hyper OS（尤其是 MIUI 12）风格
  2. 建立「收工流程」：更新关于页日志 → 检查待办 → push & tag
- **涉及文件**：MEMORY.md
- **背景**：用户明确设计偏好和工作流程

### 04:17 — 建立项目档案与修改记录系统
- **类型**：基础设施
- **内容**：
  1. 创建 `PROJECT.md`（项目基本信息档案）
  2. 创建 `MODIFICATIONS.md`（本文件，每次修改的详细记录）
  3. 更新 MEMORY.md 记录这两个文件的存在和用途
- **涉及文件**：PROJECT.md（新建）、MODIFICATIONS.md（新建）、MEMORY.md
- **背景**：防止上下文丢失或清空后无法快速恢复项目理解

---

## 2026-05-18

### v2.6.1 发布
- **版本**：v2.6.1
- **内容**：
  - 关于页新增 GitHub 项目和开发者博客入口按钮
  - 支持部署到 Cloudflare Pages
- **涉及文件**：About.jsx、vercel.json 等

### v2.6.0 发布
- **版本**：v2.6.0
- **内容**：
  - 新增 ImageUploader 和 ImageGrid 图片上传与网格预览组件
  - CAPTCHA 频率感知触发：发帖/评论/删除 2 分钟内首次免验证；登录前 2 次失败不弹，第 3 次起才出现；注册保持始终验证
- **涉及文件**：ImageUploader.jsx、ImageGrid.jsx、QuantumVerify.jsx、VerifyModal.jsx

---

## 2026-05-17

### 图片上传组件开发
- **类型**：功能开发
- **内容**：创建 ImageUploader 和 ImageGrid 组件
- **涉及文件**：client/src/components/ImageUploader.jsx、ImageGrid.jsx

---

## 2026-05-16

### v2.5.1 发布
- **版本**：v2.5.1
- **内容**：
  - 新增圆形半透明返回按钮（移动端左上角，PC 端内容区左上，智能判断来源页）
  - 移动端纸尿裤列表页新增「排行」按钮
  - 接入百度统计
  - 用户协议新增「捐赠」和「数据收集」条款
  - 移动端底部菜单栏去掉蓝色色块，改为图标文字直接变蓝
  - 排行榜移动端布局优化
  - 账户切换面板改为高模糊毛玻璃效果
  - 隐私政策和用户协议更新
- **涉及文件**：BackButton.jsx、Home.jsx、MobileBottomNav.jsx、Rankings.jsx、AccountSwitcher.jsx、baiduAnalytics.js、PrivacyPolicy.jsx、TermsOfService.jsx

### v2.5.0 — 捐赠功能
- **版本**：v2.5.0
- **内容**：新增捐赠功能
- **涉及文件**：Profile.jsx 等

### v2.4.0 — 安全性提升
- **版本**：v2.4.0
- **内容**：安全性与稳定性提升
- **涉及文件**：安全相关组件

---

## 2026-05-15

### v2.3.0
- **内容**：用户体验优化、问题修复
- **涉及文件**：多文件

### v2.1.0
- **内容**：用户体验优化、问题修复
- **涉及文件**：多文件

### v2.0.0 — 全面重写
- **版本**：v2.0.0
- **内容**：
  - 全新架构，全面重写
  - 三套主题：浅色 / 深色 / 多彩
  - AI 智能推荐（DeepSeek）
  - 纸尿裤对比功能
  - 使用感受系统
  - 用户等级与经验值
  - Wiki 与术语百科
  - 移动端体验优化
- **涉及文件**：全项目

---

## 历史重要修改（从 git log 提取）

### 移动端标题栏 UI 重构
- 13 个页面统一 MobileHeader
- 毛玻璃效果（blur 24px + saturate 200% + 微阴影）

### 个人中心移动端重构
- 滚动标题栏 + 侧边抽屉 + 自定义头部

### 移动端图片灯箱全屏优化
- 双指缩放 / 双击放大 / 左右滑动切换 / 安全区适配

### 独立发帖页
- 从弹窗改为独立页面
- 微信风格图片查看器

### 侧边栏交互优化
- 展开加 200ms 延迟防误触
- 覆盖式展开
- 始终 fixed 定位

### 图标风格调整
- 全局图标换为 fa-regular 简笔画风格（后因部分设备不显示回退 fa-solid）

### 帖子卡片改版
- 统一个人中心
- 返回按钮融入标题栏

---

> 📌 **使用说明**：每次修改项目后，AI 助手会在此文件顶部添加新条目。
> 条目包含：日期时间、修改类型、具体内容、涉及文件、修改原因/背景。

---

### 2026-05-21 验证码系统 + OAuth + 开放平台 + 个人中心 v2

**验证码系统对接后端 (v2.10.0)**
- QuantumVerify 支持 serverOrder prop
- VerifyModal 改为服务端模式
- Login/Register 集成后端验证
- api.js 新增 captchaAPI

**Captcha API 管理页面 (v2.11.0)**
- `/captcha-api` 隐藏页面
- API Key CRUD 管理
- 内嵌 API 文档

**OAuth 2.0 系统 (v2.12.0)**
- `/oauth/authorize` 授权同意页
- `/oauth-clients` Client 管理页面
- 支持 PKCE 公开客户端

**全面改用 ABDLCaptcha SDK (v2.14.0)**
- index.html 引入 embed.js
- VerifyModal/Login/Register/ForgotPassword/AccountPrivacy 统一使用 SDK
- 删除 QuantumVerify 组件依赖

**穿过的纸尿裤 (v2.15.0)**
- 个人中心显示穿过数量 + 列表
- ProfilePageV2 新增穿过标签页

**ProfilePageV2 全面升级 (v2.16-v2.20)**
- MIUI 风格动画（弹性缓动 + 交错入场）
- 桌面端专项适配（双栏布局：左侧用户卡片 + 右侧内容区）
- 点击头像/用户名跳转 /account
- v2.20.0 正式替代旧版，旧版保留为 /profile-legacy（仅管理员）
