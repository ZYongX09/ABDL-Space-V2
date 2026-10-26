# 后端无感注册防护与管理端随机测试码（2026-10-26已上线）

## 当前范围与发布状态

- 2026-10-26：仅保留后端无感防护的服务端代理配套与超级管理员查询功能。用户后续授权上线，已由develop非squash快进main，固定代码b75d783；Pages production部署b6744f23-9daa-4d52-a01f-8a08f1a0c0a5成功。Android及普通注册协议不动。
- 普通注册页面完整恢复各自 `HEAD`；`AuthContext.register` 与 `authAPI.register` 的实现也恢复各自 `HEAD`。不新增注册必填字段、客户端协议、校验或重试逻辑，原有注册、Captcha 与 NBW 行为不变。兼容旧 API 的防重逻辑由后端负责，本仓验证不代表后端已上线。
- `AuthContext` 只额外保留管理端清码使用的 `auth-session-changing` 通知，在退出、退出全部、切换账户或移除当前账户前同步触发。
- 保留 Pages 服务端签名代理及其相关测试和脚本；全部 `functions/` 由主代理独占，本次收敛不修改。未改 Android，也不修改 `AGENTS.md` 及既有权限规则。

## 管理查询约束

- 后台安全页的随机测试验证码查询卡片仅向超级管理员显示，必须显式查询；普通管理员不发请求。仅支持单个精确 `@test.top` 测试邮箱与 `register/reset/bind` 用途，拒绝真实邮箱、子域、通配和批量查询。后端须按当前数据库身份独立授权，前端不是安全边界。
- 验证码仅存组件/控制器内存，按服务端 Unix 秒 `expires_at` 到期清除；不写 localStorage、sessionStorage、公共 API 缓存或查询 URL。请求使用 cookie/当前 Bearer 与 `no-store`。
- 修改输入、新查询、失败、到期、会话变化、退出或卸载会清码；迟到响应不能恢复旧码。保留现有权限判断、会话隔离和 expiry 测试。
- 管理查询错误保留 HTTP status、后端 code 和 `Retry-After`，通过 React 文本显示，绝不当作 HTML。保留 400 `VERIFICATION_NOT_FOUND`、403 `TEST_EMAIL_REQUIRED`、503 `TEST_VERIFICATION_UNAVAILABLE` / `AUTH_AUDIT_UNAVAILABLE` / `AUTH_SECURITY_UNAVAILABLE` 和 429 `AUTH_RATE_LIMITED` 用例。邮箱输入类 403 可修正后查询；401 及其他权限 403 清码并阻断当前查询会话，不自动重试。

## 验证范围

- 在 `/home/ZYongX/projects/ABDL-Space-V2/client` 运行 `npm test` 与 `npm run build`；两站完整测试后串行构建。专项脚本保留名称 `npm run test:registration`，内容现仅管理查询与签名代理回归。
- 保留所有 HEAD 已有测试路径；新测试及内存 fixture 仅删除注册新协议部分，保留管理控制器、实际 adminAPI、权限、清码、错误文本安全与隔离 HTTP fixture 契约测试。
- 本轮不启动 UI fixture 或浏览器，不访问生产账号、不发真实邮件或生产请求。HTTP fixture 仅在测试进程内临时监听 loopback，结束即关闭；与 UI fixture 长驻服务不同。
- UI 仅沿用主代理此前浅色主题、390px 主要布局观察；本次未重新进行浏览器验收，其他主题及尺寸未验。不使用默认带生产代理的开发服务进行隔离验收。
- 后端数据库审计、限流和生产联调仍由其负责人验证；本地测试、构建通过不等于发布。

## 本次实测

- 主站完整 `npm test`：270/270 通过，失败、取消、跳过均为 0，退出码 0，命令耗时 15.662 秒。完整日志：`/tmp/registration-web-scope-main-test-20261026.log`。
- 同轮移动站完整 `npm test`：279/279 通过，失败、取消、跳过均为 0，退出码 0，耗时 17.514 秒。完整日志：`/tmp/registration-web-scope-mobile-test-20261026.log`。既有测试均保留；旧记录中客户端新协议用例已移除，不沿用旧数量。
- 两站完整测试后按主站→移动站串行 `npm run build`：主站退出码 0，命令耗时 51.068 秒（Vite 49.57 秒）；移动站退出码 0，命令耗时 42.562 秒（Vite 39.21 秒）。日志分别为 `/tmp/registration-web-scope-main-build-20261026.log` 和 `/tmp/registration-web-scope-mobile-build-20261026.log`。
- 非阻断构建警告：本地未配置 Captcha 站点 key（主站另缺 Turnstile 站点 key）、部分 chunk 超过 500 kB，主站另有 admin/ui 静态与动态导入混用提示；未为消除这些警告扩大改动。
- 普通注册页面及两处 register 实现已与各自 HEAD 逐字比较通过；AuthContext 的差异仅通知函数及四个清码触发点，api.js 的差异仅管理 helper 导入与查询入口。`git diff --check` 通过，既有测试命令保留，管理卡片/helper/error、HTTP fixture、代理测试、`functions/`、`AGENTS.md` 的收敛前后 SHA-256 一致；`main` 与 `origin/main` 本地引用未变。
- 删除前已核实注册 helper 是 HEAD 不存在的本轮新增文件，并连同被收敛文件归档于仓外 `/tmp/registration-web-scope-20261026-xkr06s6a`。新测试及 fixture 只删客户端注册新协议部分，管理用例保留。未启动浏览器/UI fixture，未提交、推送、合并或发布。

## 生产发布收尾（覆盖上述开发阶段未发布边界）

- 上线前补齐双层Worker→Pages→API签名验证，三份helper一致，真实CF客户端或有效上游HMAC方可重签，synthetic无证明不签；不信X-Real-Client-IP/XFF。两站最新完整295/295、304/304与串行构建全过；只改服务端代理，不加App字段。
- 生产正式域index/安全中心chunk已核验新卡片，浏览器匿名管理入口显示“请先登录管理员账号”。临时test.top send-code→错误计数→正确验证返回原action/email→重放拒绝、冷却429和匿名查询401均在两站正式链路通过；测试未发送真实邮件、未创建账号，challenge/escrow已精确清理。
- 后端固定acc09b1、Worker779/4fedead6承100%，0092/0093已单次执行，独立proxy/test密钥配置且0600备份。真实超管查询、真实邮件、第三方OAuth与完整建号未代测，不能称全部功能闭环。
- 本轮收尾记录进入develop；生产代码固定为b75d783，部署b6744f23-9daa-4d52-a01f-8a08f1a0c0a5。不为文档更新重复触发正式部署，main保持已验代码；develop继续包含main。生产证据位于仓外/home/ZYongX/.local/share/abdl-registration-production/20261026/。
