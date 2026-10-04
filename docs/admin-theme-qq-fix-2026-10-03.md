# 管理端主题与 QQ 状态修复

用户要求修正管理端 QQ 绑定状态，并参照 `/admin/app-clients` 统一深浅色主题。本轮分支 `fix/admin-theme-qq-20261003`，未合并 main 或部署生产。

## 已修复

- 原列表将缺失 `qq_bound` 判为未绑定；后端管理用户查询也缺少该字段。前端现区分“已绑定”“未绑定”“状态未知”，兼容 boolean 与旧版 0/1，不依据昵称或头像推断绑定。
- 普通详情路径 `/api/admin/users/:id/detail` 将由配套后端修复提供 `user.qq_bound`。专用身份模块当前未挂载；其请求失败时保留错误提示，并只显示普通详情的只读 QQ 状态，不合成其他登录方式或解绑权限。专用接口成功时优先使用其明确状态。
- 当时将 App 管理页面的主题映射迁入共享管理样式，随站点 light/dark/colorful 主题变化；2026-10-04 的后续修复已改为独立后台 light/dark，详见下节。
- 保留业务配置色值（如管理员设定的徽章颜色）；未改变治理业务或生产鉴权。

## 验证

- 前端 `npm test`：104/104 通过。
- `npm run build`：成功；现有验证码环境变量缺失和大体积 chunk 提示保留。
- `git diff --check`：通过。
- 共享 CSS 三主题变量无循环；浅色与深色的语义状态文字、辅助文字及实心按钮文字对比度回归至少 4.5:1。
- 主代理官方浏览器在仅连接本地 fixture 的 UI 完成抽样验收：1280×720 用户列表多彩/浅色/深色，真实显示 QQ 三态；专用身份接口 404 时详情显示准确“已绑定”且无解绑；深色详情抽屉及治理确认层；深色赞助管理桌面和390×844移动布局。
- 治理确认仅打开后取消，未执行封禁或删除。没有生产管理员会话、真实解绑或全部管理页面逐页人工视觉验收。

本地 fixture 未接入生产入口，治理写入明确拒绝，全部业务 API 指向127.0.0.1。首次 Vite 预构建曾出现空白，reload 后页面正常，后台无编译异常；没有据此修改生产代码。临时启动脚本位于 `/tmp`，不是永久交付或线上功能。

## 发布边界

配套后端分支为 `fix/admin-qq-beta-20261003`；两端应配套发布，不能把 feature 分支推送当作生产部署。无需为 QQ 状态修复启用独立身份解绑模块或执行无关 migration 0069。

另外，用户要求的创始徽章已独立在生产 D1 补发：`is_beta_user=1` 的65名用户全部持有 `beta`，复核缺失0；默认不强制佩戴。此数据库发放已经生效，与本轮管理代码尚未部署的状态不同。

## 2026-10-04 后续：超级管理员、独立主题与路由门禁

开发分支 `feat/super-admin-console-20261004`；本节记录本仓主站改动。2026-10-05 用户授权提交、推送并通过 PR 交付到 `main`；GitHub PR 合并与 Cloudflare Pages 自动部署需分别核验，不能把推送等同部署成功。真实 Worker 的数据库授权改动在另一后端仓库由配套任务负责，不能把本地 fixture 或前端测试通过视为生产权限闭环已完成。

### 主站契约与权限界面

- 超级管理员派生条件为当前用户 `id=1 && role=admin`。UI 严格读取服务端 `is_super_admin` boolean：显式 false、null 或异常类型不回退；只有字段缺失才兼容旧响应。列表、详情、顶栏区分超级管理员、管理员和普通用户。
- 只有超级管理员显示提升/撤销按钮；新 `adminAPI.setUserRole(id, role)` 请求 `PATCH /api/admin/users/:id/role`，body 仅 `{role:"admin"}` 或 `{role:"user"}`，不自动改用旧接口或离线成功。旧 `POST /api/admin/add` 调用仍保留以兼容既有客户端，必须由真实后端限制仅超级管理员。
- ID1 始终禁止降权、封禁、IP 追踪与删除；其他管理员也不允许账户治理，必须先由超级管理员撤销管理员角色。上述 UI 限制不替代后端当前数据库鉴权。
- `/api/auth/me`、管理列表与普通详情的 `is_super_admin` 需由真实后端当前 DB 派生；客户端不依据 JWT 历史角色赋予权限。本地 fixture 只模拟这一契约。

### 独立主题与会话生命周期

- 路由 gate 在验证中、未登录、普通用户时不挂载管理数据页；未知管理地址呈现安全入口。gate 维护 `data-admin-theme` 与 `body.admin-mode` 生命周期。
- 后台只使用独立 light/dark 调色板。前台明确 light/dark（包括时间自动已解析结果）沿用；colorful 按 `matchMedia('(prefers-color-scheme: dark)')` 选择并监听系统变化。不修改前台 `abdl_theme` 或自动主题配置；退出后台清除独立属性。
- body、管理容器、共享确认层、dialog 与嵌入赞助表面不继承多彩渐变；业务图表/徽章色保留。六组前台/后台组合验证 CSS 变量无循环，文字对比回归仍至少 4.5:1。
- 会话 key 包含 ID、角色、super 字段存在性/值与 token；切换时重挂载内部确认 provider 和数据页，卸载取消旧确认。用户列表/详情以请求序号和当前会话丢弃旧响应；写入后刷新不会重新打开已关闭或已切换的抽屉。
- 修复开发 StrictMode 的 setup → cleanup → setup 清空 session 后未恢复导致用户列表始终加载的问题。AuthContext 仅对 `refreshUser` 增加请求/会话 guard，避免旧身份请求晚到覆盖已切换账号；当前 401/403 清除活动身份，不改变原登录或账户保存请求契约。

### 自动验证与本地启动

- 主站 `npm test`：125/125 通过（2026-10-05 合并前独立复跑），含后台宿主提示隔离、super/治理矩阵、route boundary 不渲染数据子页、StrictMode 生命周期、Auth refresh 晚到、真实 adminAPI PATCH/旧 POST 参数与错误、本地 HTTP 角色/列表/详情/overview 和即时撤权。生命周期测试为源码提取执行，route boundary 为 SSR 子组件计数；不等同于完整交互浏览器测试。
- `npm run build` 成功，保留缺少验证码环境变量、现有大 chunk 与共享 UI 静态/动态导入提示；`git diff --check` 通过。浏览器 GUI 验收由主代理单独负责，本代理未自行浏览。
- 从本仓 `client/` 工作目录运行 `ADMIN_FIXTURE_UI=1 APP_FIXTURE_PORT=8791 npm run test:app-fixture`，入口 `http://127.0.0.1:8791/__fixture/start`。保留现有 App fixture 场景，可选择本地 ID1/普通管理员/普通用户/匿名、light/dark/colorful/auto、server boolean/显式 false/旧缺字段、身份延迟；`/__fixture/session?dataDelay=1500` 可模拟旧数据请求晚到。
- 所有模拟角色修改仅进程内存，重置/重启恢复；本地 token 仅 `fixture-ID`，任意真实 token 不被接受。治理封禁、追踪、删除、身份解绑仍拒绝。API 未定义返回 404，不转发生产。
- fixture 同源 Vite 使用独立配置/预构建目录与显式 React 预构建入口，避免测试 SSR 与开发服务共享缓存；仅本地 origin 停用 SW/清除旧静态缓存，生产 SW 文件不改；注入 `VITE_ADMIN_FIXTURE=1` 显示“本地验收”，本地可见 error/rejection 诊断不接入生产入口。启动页预置 `cookie_consent.accepted=false`。仅 fixture 响应设置本地 CSP，额外仅允许该 fixture 的本地 HMR websocket，阻止外部统计/验证码脚本、connect、frame、头像和其他媒体，不修改生产 HTML 或 CSP。生产服务、真实管理员会话、DB、Cloudflare 路由与 `.mimosa` 均未操作。
