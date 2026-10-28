# ABDL Space V2

ABDL 中文社区的 Web 前端，提供社区交流、纸尿裤评价与排行、百科和 AI 智能推荐，并包含站点管理后台与独立商家控制台。界面基于 React 构建，支持桌面侧栏、移动端导航及浅色、深色、多彩主题。

**本仓库不是完整的后端服务。** 采用本项目时，需要独立部署兼容的 API、数据库、图片存储和相关第三方服务；仅发布静态文件不能获得完整社区功能。仓库中出现的 `abdl-space.top` 及其子域名是原项目配置，不是可供所有部署者直接使用的公共服务。

## 相关仓库

| 仓库 | 职责 |
| --- | --- |
| [ABDL-Space-V2](https://github.com/ZYongX09/ABDL-Space-V2) | 本仓库，主站 Web 前端、管理后台和商家控制台 |
| [abdl-space](https://github.com/ZhX589/abdl-space) | 独立 API 后端，提供社区与 Wiki 等业务接口；采用 Cloudflare Workers、Hono、D1 等组件 |
| [abdl-space-mobile](https://github.com/ZYongX09/abdl-space-mobile) | 独立移动端 Web 前端 |
| [ABDL-Space-APP](https://github.com/ZYongX09/ABDL-Space-APP) | Android 客户端 |

各仓库独立安装、配置和部署；本仓库的构建不会部署后端、移动站或 Android App。

## 当前功能

以下按实际挂载的页面与路由列出，在线读写和权限校验仍依赖配套后端。

| 模块 | 页面与能力 |
| --- | --- |
| 社区 | 广场 `/`、搜索 `/search`、帖子详情 `/forum/:id`、发帖 `/create-post`、标签 `/tags/:name`；关注关系、私信 `/messages`、通知 `/notifications` |
| 纸尿裤与知识 | 列表 `/diapers`、详情与评价 `/diaper/:id`、排行 `/rankings`、对比 `/compare`、AI 推荐 `/recommend`、术语 Wiki `/termwiki`、裤裤百科 `/diaper-wiki` |
| 账户 | 登录、注册、找回密码，多账户切换，个人主页 `/profile`、`/user/:id`，账户与隐私 `/account`、设置 `/settings`、积分 `/points`、邀请码 `/invite` |
| 身份与开放能力 | 宝宝认证 `/baby-verification`、证书验真 `/c/:token`，NewBabyWorld OAuth 登录与绑定，OAuth 授权 `/oauth/authorize`、回调 `/oauth/callback`、应用管理 `/oauth-clients`，验证码 API 介绍 `/captcha-api` |
| 商家控制台 | `/merchant` 独立布局；广告列表 `/merchant/ads`、新建与编辑、排期、暂停/启用/归档/复制草稿、图文预览、企业资料 `/merchant/company`、效果报表与 CSV `/merchant/reports`、操作记录 `/merchant/audit`；企业管理 `/merchant/merchants` 受超级管理员权限限制 |
| 广告策略管理 | `/admin/advertising` 提供总开关、商家与官方/系统兜底概率、单条时间线上限、广告审核/停用及曝光点击概览。界面注明最小投放间隔字段目前仅保存，当前投放路径尚未读取，不能据此保证频控 |
| 相册治理 | `/admin/album-reports` 提供举报列表、状态筛选、分页、相册元信息与照片预览、批量屏蔽/解除屏蔽、处理举报。此仓已接入的是**管理端相册举报**，并没有独立的用户相册路由 |
| 站点管理 | `/admin` 下的用户、赞助者、宝宝认证审核、帖子/评论/小说、纸尿裤/品牌、徽章、举报、安全、设置与推送管理；`/admin/app-clients` 提供原生 App 更新提醒、版本废弃策略和请求观测 |
| 其他 | 客户端下载 `/app`、关于 `/about`、Bug 面板 `/bugs`、用户协议 `/terms`、隐私政策 `/privacy`、Cookie 政策 `/cookies`，Service Worker 与安装清单 |

管理端有前端路由门控，商家功能按服务器返回的身份与权限展示；部署者仍需在后端实施鉴权和数据隔离。AI 推荐、邮件、推送、验证码、OAuth、认证审核等能力需要分别配置相应服务。

### 新版 App 注册安全验证策略（开发集成，未发布）

`/admin/app-clients` 新增安全验证策略卡，通过专用 `GET/PUT /api/admin/app-human-check/policy` 管理 `off`、`risk`、`always` 三种模式；默认关闭，风险阈值仅在 `risk` 模式可编辑。卡片区分已保存快照与未保存草稿，保存带 revision CAS；冲突后须重新加载，不自动重放覆盖。功能交付于 `develop` 开发线，未合入或发布 `main`，不代表生产已启用，也不强制旧 App 升级。

配套后端已于 2026-10-28 上线：main `ab9651b`、Worker 791 承接 100% 流量，0097 已单次登记，不要重放。生产策略仍无设置行、默认关闭；这里的管理卡仍仅 develop，正式主站尚未发布该卡，不能把后端上线等同于管理页面已上线。

首期只作用于新版 App 新协议 `type=register` 的注册验证码邮件首次发送与重发，429 硬限流优先；旧版 App、网页注册及其他验证码用途不变。旧发送端点仍保留且可被调用，协议头与版本号不构成授权，不能将此功能称为全站防机器人。

本次未配置生产 Turnstile key、secret 或其他 Cloudflare 资源。管理卡只显示 `turnstile_configured` 布尔状态，不编辑或回显 sitekey / secret，也不发送邮件或加载挑战；无可用配置时仍允许保存策略，但需要挑战的操作会明确不可用，不会绕过验证，`off` 不依赖验证组件。已完成 Node 模型/API/fixture 与实际组件 SSR 可见内容验证，主站完整测试 332/332、构建通过；未进行浏览器 GUI、真实邮件或真实 Turnstile 闭环验收，SSR 不等同于 GUI 验收。

## 技术架构与目录

- **前端**：React 18、React Router 6、Vite 5；主要业务代码为 JavaScript/JSX，Vite 配置为 TypeScript。
- **样式**：Tailwind CSS 3、PostCSS、CSS 变量；不使用 daisyUI。Font Awesome 样式与字体随 `client/public/` 分发。
- **浏览器能力**：WebAuthn、二维码、TensorFlow.js / NSFWJS 等依赖；实际启用取决于页面、浏览器和后端配置。
- **API**：`client/src/api.js` 是主要请求层；商家、App 管理、认证、赞助等另有专用模块。
- **部署**：Cloudflare Pages 托管 SPA，Pages Functions 可代理 `/api/*` 和 `/oauth/*` 到独立后端 Worker。

```text
client/
  src/App.jsx          页面路由与懒加载
  src/api.js           主要 API、缓存与兼容逻辑
  src/merchant/        商家控制台与独立 API 层
  src/pages/admin/     管理后台
  public/              静态数据、字体、Service Worker、_headers、_redirects
  functions/           Pages Functions 的 API / OAuth 代理
  tests/               回归测试与本地 fixture
  vite.config.ts       构建与 Functions 拷贝插件
functions/             根目录旧 API 代理副本，不作为下文部署的 Functions 来源
server/                邮件路由移交材料，不是可启动的完整服务器
migrations/            配套后端数据库迁移材料
scripts/               数据导入、图片上传等一次性工具
```

根 `package.json` 的 `dev`、`build`、`preview` 是转发到 `client/` 的便利脚本；`server` 脚本引用的 `server/index.js` 不存在，不要将 `npm run server` 作为后端启动方式。数据库迁移应在配套后端仓库按其文档操作，不能直接把本仓迁移材料当作完整初始化流程。

## 本地开发、构建与测试

### 1. 安装与 API 配置

建议使用受支持的 Node.js LTS（如 Node.js 22）和 npm。仓库未锁定 Node 版本；Vite 5 的运行要求为 Node.js `^18.0.0 || >=20.0.0`。

```bash
git clone https://github.com/ZYongX09/ABDL-Space-V2.git
cd ABDL-Space-V2/client
npm ci
```

在 `client/.env.local` 中配置你自己部署的 API，例如：

```dotenv
VITE_API_BASE=http://localhost:8787
```

`8787` 只是后端本地地址示例，应以独立后端实际监听地址为准。后端需允许浏览器页面的来源（默认 `http://localhost:5173`）。根目录的 [.env.example](.env.example) 只是参考，Vite 默认从 `client/` 读取环境文件，且示例中的生产域名需替换。

**`VITE_API_BASE` 未设置或为空时，当前代码会请求同源 `/api/...`，不是完整离线模式。** `api.js` 中虽然仍保留 localStorage 分支，但基础地址先被归一化为空字符串，`USE_API` 仍为真；不能按照旧文档用空变量启动离线社区。普通 `vite` 开发服务器没有配置后端代理，也不会运行 Pages Functions，因此本地联调应使用可访问的绝对 API 地址。

### 2. 常用命令

以下均在 `client/` 执行：

```bash
npm run dev           # 默认 http://localhost:5173；端口占用时看终端实际地址
npm test              # package.json 中列出的 Node 测试
npm run test:merchant # 商家模型、API 与宿主回归
npm run build         # 输出 client/dist/（相对于仓库根）
npm run preview       # 预览构建产物，默认 http://localhost:4173
```

`preview` 只预览静态构建，并不运行 Pages Functions。当前没有 `lint`、`typecheck` 脚本，也没有仓内 CI 工作流；测试通过不等于真实后端、Cloudflare 路由或第三方服务已经验收。

### 3. 不连接生产服务的页面验收

通知/私信请求预算有独立入口（无新增依赖）：

```bash
npm run test:d1                # node:test 纯调度 + Vite/API/SSR 合同，已纳入 npm test
npm run test:d1-fixture -- 8795 # http://127.0.0.1:8795/messages?user=2
```

SSR 仅检查合同，不执行 React effects，不能算运行时验收。fixture 独立禁用生产 config/env/proxy、第三方脚本/字体、SW 与推送；真实 StrictMode 挂载 Provider/Toast/MessagesPage，点「查看请求计数」查看本地合成 API 记录。可切成功、429（Retry-After=3600 秒）、401、慢响应（20 秒）、消息失败、send-slow、load-send-error，结合账号 A/B/注销、同账号资料刷新、toast、隐藏/恢复和卸载验证。场景切换后用新 session 触发首拉；验证 429 冷却时不要切账号。send-slow 下发送后隐藏/恢复须解除 sending，且写请求不重放；load-send-error 下加载中发送失败须解除旧 loading。所有请求只打本机。

调度按每个资源**完成后** 30 秒执行，同资源 singleflight、错误 30/60/120/300 秒退避；429 尊重更长的秒数或 HTTP-date Retry-After，手动/可见恢复也不能绕过。401 暂停当前账号/凭据 session；隐藏、卸载、注销和 A-B-A 会 abort 并作废旧代。读取/聊天总时限 15 秒；会话 snapshot 由 Provider 共享，已读成功取消在途旧 snapshot 并保留当前本地已读。聊天不新增周期、发送/已读只写一次。跨域后端必须 `Access-Control-Expose-Headers: Retry-After`。现有 API_BASE 相对路径和 localStorage 分支语义保持不变。

商家控制台有独立的本机 fixture：

```bash
npm run dev:merchant-fixture
```

访问 `http://127.0.0.1:5173/merchant?fixture=ordinary`，可将 `fixture` 改为 `super`、`missing`、`error`、`inactive`、`anonymous`。该模式仅允许 loopback 开发服务，阻断非商家 API，不允许生产构建。

管理后台也有本地模拟服务：

```bash
ADMIN_FIXTURE_UI=1 npm run test:app-fixture
```

访问 `http://127.0.0.1:8791/__fixture/start` 选择测试身份，再进入相关后台页面。`ADMIN_FIXTURE_UI=1` 启用同源页面，`APP_FIXTURE_PORT` 可调整监听端口（默认 `8791`），`APP_FIXTURE_SCENARIO` 可选择初始场景（默认 `normal`）；它们是本地测试进程变量，不是生产构建配置。fixture 只模拟其实现的接口，不代表整个站点后端；数据与策略修改仅存于进程内存。不要把生产管理员会话或真实 API 用于这些保存操作测试。

## 环境变量参考

Vite 环境变量在开发启动/构建时读取，修改后须重启或重建；`VITE_*` 会暴露给浏览器，**不得放服务端密钥、邮件凭据、数据库令牌或 OAuth client secret**。

| 变量 | 默认/用途 | 配置建议 |
| --- | --- | --- |
| `VITE_API_BASE` | 默认 `''`，API 源地址；请求路径本身已带 `/api/...` | 直连填 `https://api.example.com`，不要再附加 `/api` 或尾部 `/`；同源 Pages 代理可留空。商家 API 层仅接受空值或 HTTP(S) 绝对地址，不要用 `/api` 充当基础地址 |
| `VITE_CAPTCHA_KEY` | `client/index.html` 注入的公开验证码接入标识 | 采用自己的验证码服务配置；不是服务端 secret，相关 SDK 地址还需按下文核对 |
| `VITE_TURNSTILE_SITE_KEY` | HTML 注入、验证组件使用的公开 site key | 使用自己账户创建且允许当前域名的 Turnstile 站点；secret 仅配置于后端 |
| `VITE_BETA_NAME` | 默认 `ABDL Space 创始成员计划` | 本地兼容/回退配置；不是后台活动配置的替代品 |
| `VITE_BETA_ENDS_AT` | 默认 `2026-07-31T23:59:59Z` | 旧活动时间，不应照抄为新部署的当前活动；在线活动状态需核对后端 |
| `VITE_BETA_CAPACITY` | 默认 `120` | 创始成员计划本地回退人数，按实际活动核对 |
| `VITE_ADMIN_FIXTURE` | 等于 `1` 时后台显示“本地验收” | 仅本地 fixture 使用，不应在生产设置，也不是鉴权开关 |

`.env.example` 中的 `VITE_MAIN_SITE` **当前未被前端代码读取**；它不能替换源码内的主站/移动站跳转域名。NewBabyWorld OAuth 的 `client_id`、`redirect_uri` 由 `/api/auth/nbw/config` 在运行时返回，不是前端环境变量。

## 部署到 Cloudflare Pages

仓库现有配置面向 **Cloudflare Pages + 独立 Worker API**。没有 Vercel 配置；Pages Functions 的 `onRequest`、`_headers`、`_redirects` 不能假定在 Vercel 自动生效。以下给出 Pages 的部署路径。

### 1. 先部署自己的后端

从相关仓库部署兼容 API，并按照其文档配置数据库、存储、邮件、AI、验证码与 OAuth。为 API 准备 HTTPS 地址，例如 `https://api.example.com`；确认 `/api/health` 返回 JSON，再连接前端。

后端应允许你的前端来源（协议、域名、端口均须匹配），包括确实需要的本地开发域名、Pages 预览域名和正式域名。配套后端当前在 `src/index.ts` 的 `ALLOWED_ORIGINS` 中维护部分接口的来源名单，其他 API 分组还可能有独立 CORS 处理，采用时要一起核对，不能假定存在通用 CORS 环境变量。

### 2. 选择 API 连接方式

- **直接访问独立 API**：将 Pages 构建变量 `VITE_API_BASE` 设为自己的 API 源地址。这只改变前端请求地址，**不会改变 Functions 的转发目标**。主要请求层带有 `credentials: 'include'`，后端必须返回具体的允许来源及 `Access-Control-Allow-Credentials: true`，并允许所需方法和 `Content-Type`、`Authorization`、`X-Captcha-Token` 等请求头。跨站 Cookie 还需正确设置 Domain、SameSite、Secure，并考虑浏览器限制。
- **同源代理**：`VITE_API_BASE` 留空，由 Pages `/api/*` 代理。部署前须将 [API 代理](client/functions/api/%5B%5Bpath%5D%5D.js) 和 [OAuth 代理](client/functions/oauth/%5B%5Bpath%5D%5D.js) 内的 `API_ORIGIN` 改为自己的后端源地址；当前它们硬编码为原项目的 Worker，且不读取 Pages 环境变量。务必在部署副本中完成适配，避免把用户凭据发往别人的服务。

两种方式下，都应明确原生客户端使用的 API/OAuth 入口。代理保留请求头和重定向响应，不会自动改写后端生成的 Cookie 域名、Location 或应用回调 URL。不要把代理对预检请求的宽松响应当作后端鉴权或来源隔离。

### 3. 核对域名、安全头与 OAuth 路由

发布自己的实例前，至少检查：

- [client/public/_headers](client/public/_headers)：CSP 的 `connect-src`、`script-src`、`img-src`、`frame-src` 等含原站 API、图片与第三方服务域名。替换/补充自己的实际来源，避免 API、验证码或媒体被浏览器拦截；不要用全面放开 CSP 代替配置。
- [client/index.html](client/index.html)：验证码 SDK URL、统计脚本仍指向原项目/第三方配置，`VITE_API_BASE` 不会替换这些地址。按自己的服务与隐私政策调整或移除。
- [client/src/App.jsx](client/src/App.jsx) 与 [RedirectNotice.jsx](client/src/components/RedirectNotice.jsx)：有主站与 `m.abdl-space.top` 的硬编码跳转，尤其手机访问 `/profile*` 会直接跳转移动站。采用者需要适配自己的域名和是否部署移动站；`VITE_MAIN_SITE` 无法控制它们。
- 后端 OAuth 与 NewBabyWorld 回调配置应使用自己的 HTTPS 前端地址；若使用 App Links，还需核对 [assetlinks.json](client/public/.well-known/assetlinks.json) 中的包名和签名关联，不能继承原应用身份。

**特别注意 OAuth 路由冲突**：现有 `client/functions/oauth/[[path]].js` 捕获整个 `/oauth/*`，而 `/oauth/authorize` 与 `/oauth/callback` 又是 React 页面。Functions 命中时优先于 SPA fallback，应先决定哪些路径交给后端、哪些由 SPA 处理。如果这两个路径由本前端处理，可在部署副本新增 `client/public/_routes.json`，让 Vite 复制到输出根目录：

```json
{
  "version": 1,
  "include": ["/api/*", "/oauth/*"],
  "exclude": ["/oauth/authorize", "/oauth/callback"]
}
```

该文件**当前未随仓库提供**，以上是采用者按自身授权流程选择的路由适配示例；不能只填环境变量就认定 OAuth 已可用。保留 `/oauth/token` 等后端端点的代理，并实际验收完整授权回调流程。

### 4. 在控制台连接 Git 仓库

在 Cloudflare 控制台创建 **Pages** 项目，导入你自己的仓库/部署副本，设置：

| 设置 | 值 |
| --- | --- |
| 生产分支 | `main` |
| 根目录（Root directory） | `client` |
| 构建命令 | `npm run build` |
| 构建输出目录 | `dist`（相对 `client`） |
| 构建环境变量 | 上述 API 与公开验证码变量；Production / Preview 分别配置 |

Pages Git 集成在构建时安装依赖。选择与本地一致的受支持 Node 版本；无需为这个前端项目绑定后端的 D1、存储或密钥。

**根目录必须与 Functions 布局匹配**：设为 `client` 后，Pages 能从项目根的 `client/functions/` 编译代理。Vite 插件还会拷贝一份到 `dist/functions/`，但 Cloudflare 官方要求 Functions 位于项目根，而不是静态输出目录；不能靠这份拷贝代替正确的 Root directory。只上传静态 `dist` 文件也不能视作已部署代理，尤其不要用控制台拖拽上传来部署 Functions。

### 5. 域名、预览与发布验收

1. 在 Pages 的自定义域名设置中添加自己的前端域名，按控制台提示完成 DNS 和 HTTPS；API 域名在独立 Worker 项目配置，不是把前端域名指向 API。
2. 将实际前端来源同步到后端 CORS、验证码允许域名、OAuth 回调与 CSP。预览环境使用测试后端及独立配置，不要用预览页面验证会修改生产策略的操作。
3. 检查 `/api/health` 是否返回 JSON 而不是 SPA HTML；检查登录/退出、验证码、媒体加载、深层路由刷新、OAuth 授权/回调与管理端权限。`_redirects` 已提供 SPA fallback 和协议旧路径的 301 跳转。
4. 如果服务原生 App，检查 API/OAuth 代理透传、版本头、下载配置和缓存策略；不要让 CDN 规则覆盖敏感接口的 `private, no-store`。

部署成功、前端构建通过、后端接口齐全是不同的检查项。具体操作可参阅 [Pages React 部署](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)、[Functions 目录要求](https://developers.cloudflare.com/pages/functions/get-started/) 与 [Functions 路由控制](https://developers.cloudflare.com/pages/functions/routing/)。

## 文档导航

- [项目结构与功能说明](PROJECT.md)：更详细的背景资料；其中部分旧环境变量、离线模式和历史验收描述需结合当前代码核对。
- [贡献与分支约定](AGENTS.md)：操作仓库前阅读，尤其是分支工作流。
- [变更记录](CHANGELOG.md)
- [App 客户端管理验收](docs/app-client-management-acceptance.md)、[App 更新提醒验收](docs/app-update-reminder-acceptance.md)
- [代理回归测试范围](client/tests/README-app-proxy.md)
- [管理后台主题与账户验收](docs/admin-theme-qq-fix-2026-10-03.md)
- [协议与隐私政策说明](docs/legal-policy-update-2026-10.md)
- [邮件路由移交说明](server/README-email.md)：需在独立后端中集成，不是本仓的后端启动教程。

## 分支与发布工作流

- **`develop` 是开发集成分支**，始终包含 `main` 的全部增量。
- 功能/修复分支 `feat/*`、`fix/*` 从 `develop` 创建，完成后合回 `develop`，再清理已合并的本地与远端功能分支。
- **`main` 是上线分支**。现有项目约定远端 `main` 更新触发 Cloudflare Pages 正式部署；采用者需在自己的 Pages 项目同样设为生产分支。推送 `develop` 或功能分支不等于发布主站，但可能触发预览部署。
- 只有获得明确发布指示，才将 `develop` 通过 merge 或 fast-forward 合入 `main` 并推送；**不得 squash `develop` → `main`**，也不得未经指示直接向 `main` 堆功能提交。
- 紧急修复从 `main` 创建 `hotfix/*`，获准修复发布后，必须把 `main` 合回 `develop`，保持 `develop ⊇ main`；不得用 reset 丢掉开发分支独有提交。

## 许可证

当前仓库没有 `LICENSE` / `COPYING` 文件，根目录与 `client/package.json` 也未声明许可证。**不能据此视为 MIT、GPL 或其他已授予的开源许可**；如需复用、修改、再分发或商业使用，请先向权利人确认授权范围。相关仓库各自的许可证不自动适用于本仓；第三方依赖、字体、图片和数据也须分别遵守其授权。
