**裤裤百科频道 (v2.23.0) — 2026-06-07 23:50**
- 爬取 ABU (ABUniverse Australia) + REARZ (Rearz Inc.) 两大 ABDL 品牌商品数据
  - ABU: 11 款 (PeekABU, LittlePawz, Little Kings, DinoRawrZ 等)
  - REARZ: 30 款 (Daydreamer, Princess Pink, Safari, Critter Caboose 等)
- 数据字段: 商品图集、官方介绍、详细规格、尺码表、用户评价、价格、规格 variants
- 新增页面: `/diaper-wiki` (主页) + `/diaper-wiki/:id` (详情)
- 集成到 DiaperDetail: 自动按 brand+model 匹配，显示"裤裤百科"入口按钮
- Sidebar 导航: 添加"裤裤百科"链接
- 移动端同步: abdl-space-mobile 也添加了相同页面和路由
- 移动端 _headers CSP: img-src 增加 cdn11.bigcommerce.com / cdn.shopify.com / au.abuniverse.com / us.rearz.com
- 数据文件: `client/public/data/diaper-wiki.json` (225KB)

**关键文件:**
- `client/src/pages/DiaperWiki.jsx` (415 行) — 单商品百科页
- `client/src/pages/DiaperWikiList.jsx` (230 行) — 百科主页
- `client/src/api.js` — 新增 `diaperWikiAPI` 模块
- `client/src/App.jsx` — 新增路由
- `client/src/components/Sidebar.jsx` — 新增导航
- `client/src/pages/DiaperDetail.jsx` — 集成百科入口

**待用户确认事项:**
- 商品图目前用 CDN URL (au.abuniverse.com, cdn11.bigcommerce.com)，后续需要用户授权 token 后批量上传到 img.abdl-space.top/file/diapers/ 目录

# ABDL Space V2 — 修改记录

> 每次对项目进行修改后，由 AI 助手自动更新此文件
> 记录格式：日期时间、版本、修改内容、涉及文件、原因/背景

## 2026-06-07

### 23:15 — v2.22.0 电脑端全站布局重构
- **类型**：UI 优化
- **内容**：
  - 新增通用 `page-container` CSS 类（max-width 1024px），所有 PageLayout 页面自动居中
  - 新增 `SettingsLayout` 组件，电脑端采用「左菜单 + 右内容」双栏布局（移动端自动单列）
  - Settings、AccountPrivacy 重构为 sections（带 id）+ 滚动定位
  - NotificationsPage 重构为「类型过滤菜单 + 通知列表」双栏（前端过滤）
  - MessagesPage 私信容器加 max-width 1200px 居中
  - 登录页、注册页等表单页保持原样未动
- **涉及文件**：
  - 新增 `client/src/components/SettingsLayout.jsx`
  - 重写 `client/src/pages/Settings.jsx`
  - 重写 `client/src/pages/AccountPrivacy.jsx`
  - 重写 `client/src/pages/NotificationsPage.jsx`
  - 修改 `client/src/components/PageLayout.jsx`（加 page-container 包裹）
  - 修改 `client/src/styles/global.css`（page-container + settings-layout CSS）

### 22:18 — v2.21.1 支持我们模块新增爱发电创作者认证提示
- **类型**：功能增强
- **内容**：About 页"支持我们"模块新增紫色提示框，引导用户认准爱发电创作者 @ZYongX，谨防仿冒
- **Git**：`ca75cfc`（后续追加版本号/CHANGELOG）
- **涉及文件**：`client/src/pages/About.jsx`、`CHANGELOG.md`

## 2026-05-22

### 23:32 — 全项目 Bug 修复（P0/P1 部分）
- **类型**：Bug 修复
- **内容**：Agent2 全量扫描发现 30 个 Bug，已修复 10 个，剩余 20 个 P2/P3 见 BUG_REPORT.md
- **Git**：后端 `710a5b0`，前端 `6f86581` `75e4351` `1eb6dcc`

### 22:38 — AI 推荐重构（结构化输出 + ABDL 提示词）
- **类型**：功能重构
- **Git**：后端 `db2c6e9` `4578211`，前端 `c4998c6`

### 22:08 — AI 推荐 SQL 语法修复
- **类型**：Bug 修复
- **Git**：后端 `0af3896`

### 20:38 — 侧边栏导航切换灵动动画
- **类型**：功能增强
- **Git**：`019bda4` `de60a5c`

### 20:30 — Tab 切换方向感知动画
- **类型**：功能增强
- **Git**：`3ebe3d4`

### 20:16 — 侧边栏覆盖式展开 + 动画优化
- **类型**：Bug 修复 + 性能优化
- **Git**：`a26adf4` `11beac1`

### 19:55 — 品牌图标颜色反转
- **类型**：功能增强
- **Git**：前端 `ec0d5eb`，后端 `de85f45`

### 19:50 — 管理页 Tab 栏移动端适配
- **类型**：Bug 修复
- **Git**：`1db2302`

### 17:52 — 品牌图标功能 + 上传竞态修复
- **类型**：功能增强 + Bug 修复
- **Git**：`5d1132b` `2969538` `fb46f29`

### 17:01 — 纸尿裤列表图片正方形裁切
- **类型**：Bug 修复
- **Git**：`211818f`

### 16:40 — MIUI 动画系统重写（交互式）
- **类型**：功能重构
- **Git**：`c629ac2` `20b7e68`

### 15:22 — 新会话启动 + A2A 通信建立
- **类型**：基础设施

### 15:44 — MIUI 灵动动画系统全面升级
- **类型**：功能增强
- **内容**：
  1. **global.css 增强**：
     - `.card` 使用 MIUI 弹性曲线 hover（translateY(-3px) + 弹性缓动）
     - `.card-interactive` 新增类（cursor + active scale(0.97)）
     - `.btn` 改用 MIUI 弹性曲线 + 更强的 press 反馈（scale(0.94)）
     - `.form-control` focus 时微缩放（scale(1.01)）+ 弹性缓动
     - `.tag` hover 弹性上浮 + 缩放
     - `.modal` 改用 `miuiModalIn` 弹性弹出
     - `.dropdown-menu` 新增弹性弹入动画 + transform-origin
     - `.dropdown-item` hover 右滑 + active 缩放
     - `.sidebar-link` hover 右滑 + active 弹跳 + MIUI 缓动
     - `.bottom-nav-floating a` active 弹跳 + press 缩放
     - `.mobile-header-btn` press 缩放反馈
     - 新增 `.miui-card-in` 卡片入场动画
     - 新增 `.miui-stagger` 交错延迟容器
     - 新增 `.miui-badge-in` 徽章弹入动画
     - 新增 `.miui-ripple` 涟漪点击效果
     - 新增 `.miui-tab-indicator` 标签页指示器
     - 新增 `.miui-sidebar-item` 侧边栏动画
     - 新增 `.miui-input-group` 输入框组 focus 效果
  2. **PageLayout.jsx 增强**：
     - 自动 `miui-page-in` 页面入场动画
     - 自动给所有 `.card` 子元素添加 `miui-card-in` 交错入场
     - Hero card 图标添加 `miui-float` 浮动动画
  3. **页面更新**（添加 MIUI 交互类）：
     - Home：搜索区 `miui-input-group` + 按钮 `miui-press` + 卡片 `card-interactive miui-hover-lift`
     - ForumFeed：搜索区 `miui-input-group` + 发帖按钮 `miui-press` + 帖子卡片 `card-interactive miui-hover-lift` + 点赞 `miui-like`
     - Rankings：标签按钮 `miui-press` + 排行项 `card-interactive miui-hover-lift`
     - Settings：主题卡片 `card-interactive miui-hover-lift`
     - Login：输入框 `miui-input-group` + 卡片 `miui-card-in` + 按钮 `miui-press`
     - Register：卡片 `miui-card-in` + 按钮 `miui-press`
     - DiaperDetail：所有按钮 `miui-press`
     - PostDetail：评论按钮 `miui-press`
     - MessagesPage/NewConversation/ReportModal：按钮 `miui-press`
     - FollowersPage/ComparePage/Recommendations/CreatePost/TermWiki：按钮 `miui-press`
- **涉及文件**：global.css、PageLayout.jsx、Home.jsx、ForumFeed.jsx、Rankings.jsx、Settings.jsx、Login.jsx、Register.jsx、DiaperDetail.jsx、PostDetail.jsx、MessagesPage.jsx、FollowersPage.jsx、ComparePage.jsx、Recommendations.jsx、CreatePost.jsx、TermWiki.jsx、NotificationsPage.jsx
- **原因**：用户要求整个项目增加 MIUI 灵动动画

### 14:30 — 修复品牌图片上传失败
- **类型**：Bug 修复
- **内容**：`imageUpload.js` 直接上传到 `img.abdl-space.top` 但 `window.__ABDL_IMGBED_KEY` 从未设置，导致请求无认证、上传必定失败。改为通过后端代理 `/api/images/upload` 上传，后端持有 `IMGBED_UPLOAD_KEY`
- **涉及文件**：`client/src/utils/imageUpload.js`
- **原因**：AdminPage 品牌 logo 上传使用 `uploadImage` 工具函数，该函数绕过了后端代理
- **Git**：commit 3d59add，已 push

### 00:45 — 修复评论功能 4 个 Bug
- **类型**：Bug 修复
- **内容**：
  1. `PostDetail.jsx`：`imageUrls` undefined typo → `imageData`，修复带图评论 toast 报错
  2. `api.js`：`forumAPI.comment` 新增 `captchaToken` 参数，附加到 `X-Captcha-Token` 请求头
  3. `PostDetail.jsx`：`handleComment` 将 `tokenRef.current` 传入 `forumAPI.comment`，验证码 token 不再丢失
  4. `VerifyModal.jsx`：`cleanup` 时调用 `renderer.destroy()`，防止内存泄漏
- **涉及文件**：PostDetail.jsx、api.js、VerifyModal.jsx
- **Git**：commit 60bca6f，已 push

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
