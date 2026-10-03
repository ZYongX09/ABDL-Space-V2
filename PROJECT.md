# ABDL Space V2 — 项目档案

> 最后更新：2026-05-28（收工更新）
> 维护目的：防止上下文丢失后无法快速恢复项目理解

---

## 📌 项目简介

ABDL Space V2 是一个面向 ABDL（Adult Baby Diaper Lover）社区的中文 Web 平台，核心功能包括纸尿裤评价、排行榜、AI 智能推荐、社区论坛、私信系统等。

- **项目名称**：ABDL Space v2
- **当前版本**：v2.21.0
- **部署平台**：Cloudflare Pages（前端）、Cloudflare Worker（后端 API）
- **生产域名**：`abdl-space.top`（前端），`api.abdl-space.top`（后端 API）
- **代码仓库**：`/home/ZYongX/projects/abdl-space-v2/`（本地），GitHub 由用户管理
- **图片床**：`img.abdl-space.top`（Cloudflare ImgBed）

### 🎨 品牌资源

| 资源 | 格式 | 说明 | URL |
|------|------|------|-----|
| 横版logo | JPG | 白色背景，左图标右文字 | https://img.abdl-space.top/file/1779879217956_ABDL.jpg |
| 横版logo | PNG | 无背景，左图标右文字 | https://img.abdl-space.top/file/1779879241082_ABDL.png |
| 网站icon | SVG | 无背景 | https://img.abdl-space.top/file/1779879250278_ABDL_icon.svg |
| 竖版logo | SVG | 无背景，上图标下文字 | https://img.abdl-space.top/file/1779879267209_ABDL_logo_word.svg |
| 纯艺术文字 | SVG | 无背景 | https://img.abdl-space.top/file/1779879269255_ABDL_word.svg |

---

## 🏗️ 技术栈

### 前端（client/）
| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^18.3.1 | UI 框架 |
| Vite | ^5.4.0 | 构建工具 |
| React Router DOM | ^6.26.0 | 路由管理 |
| Tailwind CSS | ^3.4.13 | 样式框架（无 daisyUI） |
| Font Awesome 6 | — | 图标库（fa-solid 为主） |
| PostCSS + Autoprefixer | — | CSS 后处理 |

### 后端
- **API 地址**：`api.abdl-space.top`（Cloudflare Worker）
- **后端仓库**：`zhx589/abdl-space`（朋友的仓库，与 wiki 前端共用）
- **后端本地目录**：`/home/ZYongX/projects/git/abdl-space/`
- **本地 server/ 目录**：当前为空，后端不在本项目中
- **后端本地目录**：`/home/ZYongX/projects/git/abdl-space/`（zhx589/abdl-space 仓库）

### 外部服务
- **DeepSeek AI**：用于智能推荐功能
- **百度统计**：全站流量分析
- **Cloudflare**：域名 DNS、Pages 部署、Worker API

---

## 📁 项目结构

```
abdl-space-v2/
├── client/                      # 前端项目
│   ├── src/
│   │   ├── pages/               # 页面组件（26 个）
│   │   │   ├── ForumFeed.jsx    # 广场/论坛首页（默认首页 /）
│   │   │   ├── PostDetail.jsx   # 帖子详情
│   │   │   ├── CreatePost.jsx   # 发帖页
│   │   │   ├── Home.jsx         # 纸尿裤列表（/diapers）
│   │   │   ├── DiaperDetail.jsx # 纸尿裤详情
│   │   │   ├── Rankings.jsx     # 排行榜
│   │   │   ├── ComparePage.jsx  # 纸尿裤对比
│   │   │   ├── Recommendations.jsx # AI 推荐
│   │   │   ├── TermWiki.jsx     # 术语 Wiki
│   │   │   ├── About.jsx        # 关于页（含版本号、更新日志）
│   │   │   ├── Login.jsx        # 登录
│   │   │   ├── Register.jsx     # 注册
│   │   │   ├── Profile.jsx      # 个人中心（支持 /profile/:id）
│   │   │   ├── Settings.jsx     # 设置
│   │   │   ├── MessagesPage.jsx # 私信
│   │   │   ├── NotificationsPage.jsx # 通知
│   │   │   ├── AdminPage.jsx    # 管理后台
│   │   │   ├── UserPage.jsx     # 用户主页
│   │   │   ├── FollowersPage.jsx # 粉丝/关注列表
│   │   │   ├── ExternalLink.jsx # 外部链接跳转
│   │   │   ├── CookiePolicy.jsx # Cookie 政策
│   │   │   ├── PrivacyPolicy.jsx # 隐私政策
│   │   │   └── TermsOfService.jsx # 用户协议
│   │   ├── components/          # 通用组件（26 个）
│   │   │   ├── Sidebar.jsx      # PC 端侧边栏（可折叠，hover 展开，200ms 延迟）
│   │   │   ├── MobileBottomNav.jsx # 移动端底部导航栏
│   │   │   ├── MobileHeader.jsx # 移动端顶部标题栏（毛玻璃效果）
│   │   │   ├── PageLayout.jsx   # 页面通用布局（含 hero 区域）
│   │   │   ├── BackButton.jsx   # 圆形半透明返回按钮
│   │   │   ├── BackToTop.jsx    # 回到顶部按钮
│   │   │   ├── ScrollProgress.jsx # 滚动进度条
│   │   │   ├── ErrorBoundary.jsx # 错误边界
│   │   │   ├── Feedback.jsx     # LoadingSkeleton / EmptyState
│   │   │   ├── ImageUploader.jsx # 图片上传组件
│   │   │   ├── ImageGrid.jsx    # 图片网格预览
│   │   │   ├── RichContent.jsx  # 富文本内容渲染
│   │   │   ├── OfficialBadge.jsx # 官方认证徽章
│   │   │   ├── CookieConsent.jsx # Cookie 同意弹窗
│   │   │   ├── PullToRefresh.jsx # 下拉刷新
│   │   │   ├── TabBar.jsx       # Tab 切换栏
│   │   │   ├── AccountSwitcher.jsx # 多账户切换
│   │   │   ├── QuantumVerify.jsx # 人机验证（CAPTCHA）
│   │   │   ├── VerifyModal.jsx  # 验证弹窗
│   │   │   ├── NewConversation.jsx # 新建对话
│   │   │   └── ChatMessage.jsx  # 聊天消息气泡
│   │   ├── contexts/            # React Context（4 个）
│   │   │   ├── AuthContext.jsx  # 认证（支持多账户切换、离线模式）
│   │   │   ├── ThemeContext.jsx # 主题切换（浅色/深色/多彩）
│   │   │   ├── ToastContext.jsx # Toast 提示
│   │   │   └── NotificationContext.jsx # 通知状态
│   │   ├── hooks/
│   │   │   └── useExternalLinkInterceptor.js # 外部链接拦截
│   │   ├── utils/
│   │   │   ├── externalLink.js  # 外部链接工具
│   │   │   └── baiduAnalytics.js # 百度统计封装
│   │   ├── styles/
│   │   │   └── global.css       # 全局样式（CSS 变量、三套主题、动画）
│   │   ├── api.js               # API 数据层（含内存缓存、离线模式）
│   │   ├── App.jsx              # 根组件（路由配置、全局快捷键）
│   │   └── main.jsx             # 入口
│   ├── public/
│   │   └── data/
│   │       ├── diapers.json     # 纸尿裤数据
│   │       ├── levels.json      # 用户等级数据
│   │       ├── terms.json       # 术语数据
│   │       └── manifest.json    # 清单
│   ├── index.html               # HTML 入口
│   ├── vite.config.js           # Vite 配置
│   ├── tailwind.config.js       # Tailwind 配置（自定义色板、圆角、动画）
│   ├── postcss.config.js        # PostCSS 配置
│   ├── package.json             # 前端依赖
│   └── .env                     # 环境变量（VITE_API_BASE 等）
├── package.json                 # 根 package.json（dev/build/preview 脚本）
├── client/public/_redirects    # Cloudflare Pages SPA 重定向
├── client/public/_headers      # Cloudflare Pages 安全头（CSP 等）
├── .env.example
├── .gitignore
├── CHANGELOG.md                 # 用户面向的更新日志
├── README.md                    # 项目说明
└── PROJECT.md                   # 本文件 — 项目档案
```

---

## 🎨 设计系统

### 主题（三套）
1. **浅色主题**（默认）：白底、蓝粉配色，清新柔和
2. **深色主题**：暗色背景，降低饱和度，护眼
3. **多彩主题**：半透明毛玻璃卡片，渐变背景

### 色板
| 角色 | 浅色 | 深色 | 多彩 |
|------|------|------|------|
| Primary | #A8D8F0 | #7EB8D4 | #9BB8E0 |
| Accent | #FFB7C5 | #F5989E | #F0A0B8 |
| Background | #F5F8FC | #1A1D23 | 透明渐变 |
| Card | #FFFFFF | #252830 | rgba(255,255,255,0.55) |
| Text | #2C3E50 | #E0E4EA | #3A4A5C |

### 设计语言
- **圆角**：卡片 1.25rem、按钮 1rem、输入框 1rem
- **阴影**：柔和蓝色阴影（浅色）、深色阴影（深色）
- **字体**：Segoe UI → PingFang SC → Microsoft YaHei → system-ui
- **动效风格**：⚡ **参考 MIUI / Xiaomi Hyper OS（尤其是 MIUI 12）**
  - 流畅、弹性感、层次分明、丝滑过渡
  - 已有动画：fadeInUp、fadeIn、slideInLeft、scaleIn、shimmer、float、heroShimmer、colorfulGradient

### 布局
- **PC 端**：左侧可折叠侧边栏 + 右侧内容区（max-w-[1080px]）
- **移动端**：底部导航栏 + 顶部毛玻璃标题栏 + 全宽内容区
- **侧边栏**：hover 展开（200ms 延迟防误触），fixed 定位
- **移动端标题栏**：毛玻璃效果（blur 24px + saturate 200%）

---

## 🔑 核心功能

### 用户系统
- 注册/登录（支持离线模式，localStorage 存储）
- 多账户切换（AccountSwitcher）
- 个人中心（支持访问他人主页 /profile/:id, /user/:id）
- 用户等级与经验值
- 关注/粉丝系统

### 论坛/广场
- 帖子列表（ForumFeed，默认首页）
- 帖子详情（PostDetail）
- 发帖（CreatePost，独立页面）
- 图片上传与预览（ImageUploader + ImageGrid）
- 微信风格图片查看器（双指缩放/双击放大/左右滑动）
- 点赞、评论
- 富文本内容渲染（RichContent）
- 下拉刷新（PullToRefresh）

### 纸尿裤系统
- 纸尿裤列表（Home，/diapers）
- 纸尿裤详情（DiaperDetail）
- 排行榜（Rankings）
- 对比工具（ComparePage）
- AI 智能推荐（Recommendations，基于 DeepSeek）

### 其他
- 术语 Wiki（TermWiki）
- 私信系统（MessagesPage）
- 通知系统（NotificationsPage）
- 管理后台（AdminPage）
- Cookie 同意（CookieConsent）
- 人机验证（QuantumVerify，CAPTCHA 频率感知触发）
- 外部链接拦截与跳转提示
- 百度统计
- 键盘快捷键（Alt+数字导航）

---

## 🌐 路由表

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | ForumFeed | 广场/论坛首页（默认） |
| `/forum/:id` | PostDetail | 帖子详情 |
| `/create-post` | CreatePost | 发帖 |
| `/diapers` | Home | 纸尿裤列表 |
| `/diaper/:id` | DiaperDetail | 纸尿裤详情 |
| `/rankings` | Rankings | 排行榜 |
| `/compare` | ComparePage | 对比工具 |
| `/recommend` | Recommendations | AI 推荐 |
| `/termwiki` | TermWiki | 术语 Wiki |
| `/about` | About | 关于页 |
| `/cookies` | CookiePolicy | Cookie 政策 |
| `/privacy` | PrivacyPolicy | 隐私政策 |
| `/terms` | TermsOfService | 用户协议 |
| `/login` | Login | 登录 |
| `/register` | Register | 注册 |
| `/profile` | ProfilePageV2 | 个人中心（新版本） |
| `/profile/:id` | ProfilePageV2 | 用户主页 |
| `/user/:id` | ProfilePageV2 | 用户主页（兼容路由） |
| `/user/:id/followers` | FollowersPage | 粉丝列表 |
| `/user/:id/following` | FollowersPage | 关注列表 |
| `/settings` | Settings | 设置 |
| `/messages` | MessagesPage | 私信 |
| `/notifications` | NotificationsPage | 通知 |
| `/admin` | AdminPage | 管理后台 |
| `/admin/baby-verifications` | AdminBabyVerifications | 宝宝认证审核 |
| `/admin/app-clients` | AdminAppClients | 原生 App 版本策略与请求观测统计 |
| `/baby-verification` | BabyVerificationStatus | 当前账号认证状态与额度 |
| `/c/:token` | CertificateVerify | 公开证书实时验真 |
| `/external` | ExternalLink | 外部链接跳转 |
| `/profile-legacy` | Profile | 旧版个人中心（仅管理员） |
| `/captcha-api` | CaptchaApiPage | 验证码 API Key 管理（隐藏页面） |
| `/oauth/authorize` | OAuthAuthorize | OAuth 授权同意页 |
| `/oauth-clients` | OAuthClientsPage | OAuth 应用管理（隐藏页面） |

---

## ⚙️ 环境变量

- `VITE_API_BASE`：API 基础地址（为空时走离线/localStorage 模式）
  - 生产：`https://api.abdl-space.top`
  - 本地后端：`http://localhost:8787`
- `VITE_CAPTCHA_KEY`：Captcha API Key（用于嵌入式 SDK，主站自己用）
- `VITE_MAIN_SITE`：主站地址（`https://abdl-space.top`）

---

## 🔗 关联项目

| 项目 | 说明 | 部署 |
|------|------|------|
| abdl-space-v2（本项目） | 用户的 web 前端 | Cloudflare Pages（`abdl-space.top`） |
| zhx589/abdl-space | 朋友的 wiki 前端 + API Worker | Cloudflare Worker + Pages |
| abdl-space-open-platform | 开放平台 | Cloudflare Pages（`open.abdl-space.top`） |

### 开放平台
- **仓库**：`ZYongX09/abdl-space-open-platform`（GitHub）
- **本地目录**：`/home/ZYongX/projects/abdl-space-open-platform/`
- **技术栈**：Vite + React
- **功能**：验证码 API Key 管理、OAuth 应用管理、API 文档
- **登录**：作为 ABDL-Space 的 OAuth 客户端（PKCE）

### Cloudflare 账户
- **用户自己的账户**：`496b8cd5e81555f84350d21a703dde55`
- **朋友的账户**：`c5a9726ee4c59c70d9261881af33ca87`

### 朋友 CF 账户下的 3 个项目
1. `abdl-space.top` → 用户的 v2 前端（Pages）
2. `abdl-space` → 朋友的开发中前端（Pages），和 #3 共用 `zhx589/abdl-space` 仓库
3. `api.abdl-space.top` → 后端 API（Worker），和 #2 共用仓库

---

## App 管理（2026-10-03）

- 页面：`/admin/app-clients`，管理导航「系统 → App 管理」。仪表盘链接读取专用观测统计，不回退到旧 `has_app` 标记。旧用户详情标签改为「历史客户端标记（非精确统计）」；它可能来自网页 OAuth，不能证明安装或原生使用。
- API：`GET/PUT /api/admin/app-clients/policy`、`GET /api/admin/app-clients/stats`、`GET /api/admin/app-clients/users`，均通过 `client/src/api.js` 的 `adminAPI`，不缓存管理员观测结果，不静默生成离线数据。
- 策略默认关闭；仅明确列出的内部 `versionCode` 被废弃，不是显示版本名或最低版本门槛。总开关关闭时所有版本拦截失效，但列表和独立 `block_unversioned` 配置保留。版本号范围 1–2147483647，自动去重、排序，最多 200 个；更新提示非空、最多 2000 字符。保存提交完整四字段 JSON。网页访问不受该策略影响。
- 保留键 `app_client_policy` 必须使用专用端点整体保存。通用站点配置只提供 App 管理链接；新增键也不能绕过此限制。
- 观测只记录认证原生时间线请求，从迁移开始，不回填历史。不是安装量、下载量、设备数，也不是 App 全活动。`available:false` 表示数据库迁移缺失或观测数据读取失败，不展示为 0；HTTP/响应错误独立显示并可重试。数值显示精确整数。
- 总账号数按账号去重；`versioned_users` / `unversioned_users` 是「曾上报」/「曾未上报有效版本」，可能重叠。版本行 `observed_users` 是历史账号×版本配对，同账号升级后跨行重叠；`latest_users` 按最近观测唯一归属。各行 1/7/30 天活跃同样可能重叠，不可直接相加。未上报组包含缺失或无效版本号，不代表未安装。
- 用户列表 `version_code=all` 每账号只显示最近记录；`version_code=missing` 或指定正整数显示该版本的历史配对，不表示账号当前仍使用此版本。支持 `q`、20 条分页及首次/末次观测时间（本地时区）。切换筛选、分页、刷新、卸载、切换管理员账户后，旧异步响应失效；保存失败保留输入且不自动重试写入。

### 仅本地的 GUI 验证 fixture

以下测试服务器仅监听 `127.0.0.1`，不转发生产 API；本地模拟 `/api/auth/me` 供原有鉴权 UI 验证，生产入口没有新增鉴权绕过。所有策略保存只写内存，服务器重启恢复默认关闭。

```bash
npm --prefix /home/ZYongX/projects/ABDL-Space-V2/client run test:app-fixture
VITE_API_BASE=http://127.0.0.1:8791 npm --prefix /home/ZYongX/projects/ABDL-Space-V2/client run dev -- --host 127.0.0.1
```

打开 `http://127.0.0.1:5173/admin/app-clients`（Vite 端口占用时用其实际端口）。fixtures 定义在 `client/src/appClients/fixture.js`，HTTP 包装在 `client/tests/app-clients-fixture-server.js`，均不被生产页面导入。不得用真实 API 地址进行策略保存测试。

在本地浏览器打开 `http://127.0.0.1:8791/__fixture?scenario=场景名` 切换场景，再回页面刷新对应策略/统计。

| 场景 | 验证目标 |
|---|---|
| `normal` | 46 个去重账号；42 曾上报、6 曾未上报（有重叠）；版本 100 有 26 条历史配对与 2 页；账号升级导致历史版本与最近版本不同 |
| `empty` | 迁移可用但全部为真实 0；搜索无匹配也是成功的空列表 |
| `unavailable` | 策略存储模拟 503（不把安全默认值当已保存配置）；统计迁移缺失，明确不可用而非 0；版本明细/用户列表不伪造为空 |
| `errors` | 策略/统计/列表模拟 503，显示错误与重试；不显示假成功或假 0 |
| `save-error` | GET 正常，PUT 模拟失败；保留输入、按钮恢复、显示错误 |
| `slow` | 版本 100 的列表延迟 1500ms，其余 100ms；快速从 100 切到 200/未上报/全部，旧响应不得覆盖新筛选 |

也可启动时设置 `APP_FIXTURE_SCENARIO`、`APP_FIXTURE_PORT`（改端口需同步 `VITE_API_BASE`）。建议 GUI 检查正常保存后重载、独立开关保留、非法/重复版本、空提示、搜索/分页、未上报组、升级历史说明、浅色/深色/多彩、窄屏表格局部横滚与原生键盘标签。主题沿用全站设置；本地重载的存储键为 `abdl_theme`。

```bash
npm --prefix /home/ZYongX/projects/ABDL-Space-V2/client test
npm --prefix /home/ZYongX/projects/ABDL-Space-V2/client run build
node --test /home/ZYongX/projects/ABDL-Space-V2/client/src/appClients/model.test.js
```

新增纯 helper/API/fixture 测试覆盖版本归一化与边界、策略完整 payload、URL 编码、取消信号、去重/重叠、最近与历史列表、分页和晚到请求门控。客户端部署代理及 OAuth 版本头透传由主协调任务负责，不在 App 管理实现中修改。

## 📋 待办事项

- [ ] **图床自定义域名**：img.abdl-space.top 的 CNAME 跨账户方案（CF Error 1014）未解决
- [x] **安全验证接入 Cloudflare**：已迁移到 ABDLCaptcha 嵌入式 SDK（v2.14.0）
- [x] **ProfilePageV2 迁移**：已正式替代旧版（v2.20.0），旧版保留为 /profile-legacy（仅管理员）
- [x] **验证码系统**：后端 CaptchaService + 嵌入式 SDK + API Key 管理
- [x] **OAuth 2.0 系统**：授权码 + PKCE + 开放平台集成
- [ ] **img.abdl-space.top 加 CORS 头**：当前无 CORS 头
- [ ] **纸尿裤图片数据库建表**：diaper_images 表需在 D1 执行建表 SQL

---

## 🆕 v2.10+ 新增功能摘要

### 验证码系统 (v2.10-v2.14)
- 后端 CaptchaService：challenge 生成、answer 哈希校验、一次性 JWT
- 嵌入式 SDK (`embed.js`)：第三方一行代码嵌入
- API Key 管理页面（`/captcha-api`，隐藏）
- 主站全面迁移到 SDK（Login/Register/VerifyModal）

### OAuth 2.0 (v2.12)
- 标准授权码 + PKCE 支持
- 公开客户端/机密客户端双模式
- 授权同意页（`/oauth/authorize`）
- Client 管理页面（`/oauth-clients`，隐藏）

### 穿过的纸尿裤 (v2.15)
- 评分即标记穿过
- 个人中心显示穿过数量 + 列表
- `GET /api/users/:id/worn` 接口

### ProfilePageV2 (v2.16-v2.20)
- 全新个人中心设计
- MIUI 风格动画（弹性缓动 + 交错入场）
- 桌面端专项适配（双栏布局）
- 移动端优化
- v2.20.0 正式替代旧版

### 开放平台
- 独立项目 `abdl-space-open-platform`
- OAuth PKCE 登录
- 验证码 Key + OAuth App 管理
- API 文档

---

## 📝 注意事项

- `abdl-space` 和 `abdl-space-v2` 是**两个不同项目**，部署前必须确认目标
- `abdl-space` 的 deploy 脚本会直接覆盖 Cloudflare Pages 上的内容
- API 地址是 `api.abdl-space.top`，不是 `abdl-space.pages.dev`
- 设计动效参考 MIUI 12 / Xiaomi Hyper OS 风格
- 更新日志写法：大厂风、简约、不透露技术细节、小更新一笔带过
