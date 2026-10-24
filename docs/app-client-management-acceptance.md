# App 版本策略与统计管理验收

## 2026-10-24：生产发布补充

用户授权后，main固定`fdc919d4e146c7bfb44384d157dcf99c05113503`已快进推送，Git集成Pages生产部署`67913866-488f-4d79-8f7c-70753602fd45`成功；正式域名入口及appClients-Czr6GF5N.js已核对新卡片/专用接口标识。发布前重新npm test/build均exit0，原253项通过。浏览器正式管理入口匿名显示管理员登录门禁，未用真实会话启用/保存；后台Worker759也已100%生效，生产策略记录仍为空、保持默认关闭。无DDL/无APK/无V2实施。完整证据`~/.local/share/abdl-space-release/20261024-nbw-local-only/`；本段只在develop维护，不为文档重复推main部署。

## 2026-10-24：指定版本仅本站模式（关闭 NBW）开发交付

- `/admin/app-clients` 新增独立卡片，复用原 Card、表单、状态提示和三主题管理样式；不改原提醒/废弃表单。默认 `{ enabled: false, version_codes: [], include_unversioned: false }`，无预选版本。仅显式开关和保存才更新配置；关闭保留列表及独立未上报选项。
- `adminAPI.appClientNbwLocalOnly` / `saveAppClientNbwLocalOnly` 使用专用 GET/PUT `/api/admin/app-clients/nbw-local-only`，请求与响应严格三字段，无 revision；整数范围 1–2147483647、最多 200 个唯一版本。草稿文本可分隔、去重、排序；损坏响应、网络、取消、401/403/500/503 均不回退默认成功。
- 有独立读取/保存/重试、规范化预览、未保存更改与已保存快照。说明仅影响命中的原生 App，网页/未命中新版不变；NBW 专栏空、首页移除外站源并保留本站帖、发帖仅本站不双发，不改真实 NBW 绑定。明确旧同步控件可能仍可见、code31 回复本地缺陷不能后端修复，不强停整个 App。
- `app_client_nbw_local_only` 加入通用设置保留键，连同原 policy/reminder 继续在 API、表单和 fixture 阻止通用 JSON 写入。
- 定向命令：在 `client/` 执行 `node --test src/appClients/model.test.js tests/admin-theme.test.js`，**43/43** 通过；`npm test` **253/253** 通过；`npm run build` 通过，保留既有 `%VITE_CAPTCHA_KEY%` 缺失与大 chunk 警告。
- 输出：`/home/ZYongX/projects/nbw-local-only-evidence-20261024/frontend-main-focused.log`、`frontend-main-full-tests.log`、`frontend-main-build.log`（同目录）。新增模型、实际 adminAPI、页面接线/主题和本地 HTTP fixture 回归均纳入全量测试。
- 初次浏览器初始化超时，恢复后主代理已在内存fixture完成1280×720默认状态、版本乱序去重、启用保存、重载一致及33x非法输入保留验证；移动390×844输入与布局另验。已查看截图在仓外证据目录gui-main-{input,save,reload,invalid}.png与gui-mobile-input.png；未验真实账号/旧APK、浅色多彩逐态或全部错误GUI。可在 `client/` 执行 `ADMIN_FIXTURE_UI=1 APP_FIXTURE_PORT=8791 npm run test:app-fixture`，打开 `http://127.0.0.1:8791/__fixture/start` 的 App 管理链接。全部数据仅内存、无真实 API 转发；`/__fixture?scenario=nbw-unavailable` / `nbw-invalid` / `save-error` / `slow` / `normal` 可分别准备仅本站读取 503、损坏响应、保存失败、延迟和恢复场景。
- 仅前端与本地 fixture/文档改动；未修改真实配置/凭据、根后端包，未提交、推送、切分支或部署；后端集成与最终提交由主代理负责。

## 历史验收（2026-10-03）

日期：2026-10-03。

## 实现与自动化验证

主实现提交为 `e135100`，推送到 `recovery/20260925`。管理入口为 `/admin/app-clients`。

- 前端 `npm test`：52/52 通过，含 App 数据规则、请求失效保护和 main-cdn → 实际 Pages 代理来源的请求头透传回归。
- 续接后对已提交的完整最终源码重新执行生产构建，成功；已有环境变量/大 chunk 告警仍存在。
- 后端配套提交 `46d88d6`：新增功能 17/17，组合定向 27/27；全量 342 通过、9 项既有失败，与修改前 325 通过、9 项失败对应，无新增失败。

## 本地浏览器验收

首次验收时浏览器连接反复超时；续接后恢复，因此补做以下实际界面操作。
所有请求均使用 `tests/app-clients-fixture-server.js` 的本地内存数据，无生产 API 转发，保存仅修改测试数据。

- 在 `http://127.0.0.1:5175/admin/app-clients` 确认已认证测试管理员能读取策略、统计与明细。
- 输入 `29, 28, 29`，界面规范化预览为 `28、29`；开启独立未上报版本号选项后保存成功，总开关保持关闭。
- 点击未上报版本号行的明细按钮，筛选值为 `missing`，用户表正确显示 6 个历史配对账号。
- 选择内部版本号 100，再点击第 2 页，显示账号 21–26，共 6 条该版本历史配对记录。
- 切换 fixture 为 `unavailable` 并刷新，统计明确显示不可用而不是 0；重新加载策略时展示存储不可用错误。
- 切换 fixture 为 `empty` 并刷新，展示已就绪但无观测记录（0），与不可用状态区分。
- 截图检查默认彩色主题的桌面 1280×720 和手机 390×844：策略输入、复选框、说明文字均可读，手机侧栏收起，未发现表单水平溢出。

视觉证据存于本次会话 artifacts 中，不写入生产资源：
- 桌面：`call_c78KepO5amu87064pS56sToN-tool-result-3a6cd16e-ed7c-4b47-b3b3-261d66826292.png`
- 手机：`call_0qCin4Ts8kSzmrzyCt29oBvh-tool-result-e637e275-4597-47a2-8b31-a2f2e8798039.png`

本轮没有逐项执行明暗主题截图、真实账号切换、全部错误/慢请求 GUI 场景；请求竞争与账户失效规则有自动化测试，不能将其称为完整 GUI 端到端验收。

## 上线边界

未执行远程 D1 迁移、后端 Worker 部署或线上策略启用。推送恢复分支不是生产上线证明。
应先应用后端 `migrations/0070_app_clients.sql`，再发布 Worker 与管理界面；代理已透传版本信息，不需改用户提供的 main-cdn 代码。
总开关默认关闭。部署后确认线上 Cache Rules 没有覆盖 native timeline 的 private/no-store，并验证实际链路和旧 APK 的更新提示，再决定是否启用。

统计是已认证原生 App 时间线访问的账号观测，不是安装量/设备数/完整 App 活跃人数。历史 has_app 不回填；同一账号的历史版本和无版本号配对可能重叠，不能相加当成去重账号总数。
