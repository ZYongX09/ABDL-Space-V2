# ABDL Space V2 — 项目档案

> 最后更新：2026-05-19（收工更新）
> 维护目的：防止上下文丢失后无法快速恢复项目理解

---

## 📌 项目简介

ABDL Space V2 是一个面向 ABDL（Adult Baby Diaper Lover）社区的中文 Web 平台，核心功能包括纸尿裤评价、排行榜、AI 智能推荐、社区论坛、私信系统等。

- **项目名称**：ABDL Space v2
- **当前版本**：v2.7.0
- **部署平台**：Vercel（前端）、Cloudflare Pages（备用）
- **生产域名**：`abdl-space.top`（前端），`api.abdl-space.top`（后端 API）
- **代码仓库**：`/home/ZYongX/projects/abdl-space-v2/`（本地），GitHub 由用户管理

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
- **本地 server/ 目录**：当前为空，后端不在本项目中

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
│   │   ├── pages/               # 页面组件（22 个）
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
│   │   ├── components/          # 通用组件（20 个）
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
├── vercel.json                  # Vercel 部署配置（SPA rewrite）
├── .vercelignore
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
| `/profile` | Profile | 个人中心 |
| `/profile/:id` | Profile | 用户主页 |
| `/user/:id` | Profile | 用户主页（兼容路由） |
| `/user/:id/followers` | FollowersPage | 粉丝列表 |
| `/user/:id/following` | FollowersPage | 关注列表 |
| `/settings` | Settings | 设置 |
| `/messages` | MessagesPage | 私信 |
| `/notifications` | NotificationsPage | 通知 |
| `/admin` | AdminPage | 管理后台 |
| `/external` | ExternalLink | 外部链接跳转 |

---

## ⚙️ 环境变量

- `VITE_API_BASE`：API 基础地址（为空时走离线/localStorage 模式）
  - 生产：`https://api.abdl-space.top`
  - 本地后端：`http://localhost:8787`

---

## 🔗 关联项目

| 项目 | 说明 | 部署 |
|------|------|------|
| abdl-space-v2（本项目） | 用户的 web 前端 | Vercel / Cloudflare Pages |
| zhx589/abdl-space | 朋友的 wiki 前端 + API Worker | Cloudflare |
| abdl-space-upload-proxy | 图床代理 Worker（未部署） | 待部署 |

### Cloudflare 账户
- **用户自己的账户**：`496b8cd5e81555f84350d21a703dde55`
- **朋友的账户**：`c5a9726ee4c59c70d9261881af33ca87`

### 朋友 CF 账户下的 3 个项目
1. `abdl-space.top` → 用户的 v2 前端（Pages）
2. `abdl-space` → 朋友的开发中前端（Pages），和 #3 共用 `zhx589/abdl-space` 仓库
3. `api.abdl-space.top` → 后端 API（Worker），和 #2 共用仓库

---

## 📋 待办事项

- [ ] **abdl-space 后端恢复**：被误部署覆盖，需要朋友重新部署后端
- [ ] **图床自定义域名**：img.abdl-space.top 的 CNAME 跨账户方案（CF Error 1014）未解决。代理 Worker 项目已创建在 `/home/ZYongX/projects/abdl-space-upload-proxy/`
- [ ] **安全验证接入 Cloudflare**：计划将 CAPTCHA 迁移到 Cloudflare 平台

---

## 📝 注意事项

- `abdl-space` 和 `abdl-space-v2` 是**两个不同项目**，部署前必须确认目标
- `abdl-space` 的 deploy 脚本会直接覆盖 Cloudflare Pages 上的内容
- API 地址是 `api.abdl-space.top`，不是 `abdl-space.pages.dev`
- 设计动效参考 MIUI 12 / Xiaomi Hyper OS 风格
- 更新日志写法：大厂风、简约、不透露技术细节、小更新一笔带过
