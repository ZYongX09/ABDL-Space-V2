# 定向IP/请求观察管理（2026-11-12开发，2026-11-13前端候选未发布）

## 范围与入口

安全中心`/admin/security`保留原安全概览，新增“定向观察”。普通用户详情提供内部跳转预填ID，不自动启用观察。仅当前超级管理员会话挂载敏感模块；普通管理员不因能访问原安全中心而获得IP/端点记录。Android不在本轮范围。

IP与请求两个开关独立，记录不封禁。需要操作理由，默认7天、最长30天；停止未来观察与清理已有某日记录分开。旧“追踪并封禁IP”继续独立危险确认，新增旧规则停止/来源复核/明确选择解除，不根据历史IP泛删共享封禁。

后端接口以`/api/admin/user-observation`为前缀，专用API不使用通用离线假成功。配置revision是1–128字符不透明token：初始0、后续UUID或SHA256，不能转换数字。读/写失败如实显示，409保留草稿并要求重读确认。

## 查看、清理和复制

- 固定北京时间`Asia/Shanghai`自然日、UTC时间值；IP/请求/日统计分页，方法与状态筛选独立，默认50条。
- 请求保存已注册脱敏模板、固定业务说明、方法、状态、耗时和事件ID，不显示动态路径值/查询串/正文/凭据。业务说明描述请求，不证明人为点击或业务成功。
- 日页面明确coverage已记录/已达上限/停用/未知，不把空页当作没有活动。代理无法证实时显示未知IP来源。
- 当前页复制只复制选中IP或请求页，须确认/理由和服务器审计。页面响应带目标/策略generation，授权原样回传；清日/策略或目标变化后旧页新授权及幂等重放均拒绝。
- 单日复制服务端稳定双流快照，每页请求与IP各至多200；前端合计5000条/1MiB硬限，明确部分结果、续页/页内进度及需重启去重，不把第一页冒充全日。
- 剪贴板失败显示只读可选文本；不上传第三方、不写localStorage。已复制到外部的副本无法由服务端收回。
- 注销、切号、401/403、销毁清空页面内存敏感数据，拒绝旧请求晚回填。

两站隐私政策8.1同步说明定向排障用途、字段、权限和新观察数据最多30天留存，不把旧日志承诺成统一清理。

## 代理与发版边界

主站`client/functions/`API代理仅新增独立purpose/method/path/time绑定HMAC观察信封；原认证POST签名和限流范围不扩大，保CORS/响应/原生App头与WebSocket合同。根目录备用handler/helper保持镜像，不部署第二套后端。没有读取或写入生产secret值，仓外CDN Worker未修改，不能验证原始IP时诚实未知。

**2026-11-12开发轮只提交推送develop，未推main、部署、执行后端0112或启用任何真实用户观察；这不是其他发布任务的状态记录。** 用户7的误设旧追踪已由明确授权的独立生产修正撤销，新功能不把该用户重新加入。

前端develop仍含尚未上线的全路径防归档守卫；生产只上线声明层（main8149369）。未来发布观察管理不能整体提升develop而夹带该守卫的Functions调用成本，须维持分层发布。

## 开发阶段历史验证（非本候选）

当时develop完整 **677/677**，0失败/跳过/取消，最终Vite build exit0；Pages Functions真实编译exit0。真实UUID/hash版本、控制字符及清日generation修后module/privacy **66/66**，scoped ESLint exit0/0error/10既有warnings。另用真实后端Hono/SQLite响应喂给双站模型，验证UUID保存/读页generation/清理旧授权409/legacy hash，跨仓探针通过。模块测试覆盖角色/会话/分页/独立开关/导出硬限/剪贴板回退，不代替真实浏览器验收。

隔离fixture只监听loopback、不代理生产：`node client/src/userObservation/fixture-server.js`，入口`http://127.0.0.1:8796/admin/security?tab=user-observation&user_id=3`。正式GUI未开始：浏览器newTab/list连续工具超时，未取得截图、未验桌面/窄屏三主题或系统剪贴板，不声称视觉交互通过。临时fixture已停止释放资源。

开发阶段实际测试退出码、原失败日志和指纹在仓外`abdl-space-user-observation-evidence-20261112/`，后端开发记录同时保留基线失败/类型诊断、真实workerd完整入口和D1写放大说明。当时未做生产部署或真实账号闭环。

## 2026-11-13声明层基线发布候选（仅本地，未发布）

- 从`origin/main` `81493694f6c9bbb817521d26ad2102008f02f9fc`新建`release/user-observation-20261113`，只选择性应用观察提交`e041a98429a2241a64ce9d8eda91c766e0662b0e`，不整体合并develop。工作树为`/home/ZYongX/projects/ABDL-Space-V2-user-observation-release-20261113`。
- `package.json`保留main完整测试清单并新增观察模块测试，隐私测试仍在原legal通配符内；不注册main不存在的`archive-guard.test.js`。声明测试额外严格枚举Functions文件并证明无根守卫、全路径路由或advanced Worker。
- 本候选独立完整 **661/661**，0失败/跳过/取消；`NODE_OPTIONS=--max-old-space-size=1536 npm run build` exit0。构建后声明/SW/代理/隐私专项 **100/100**。不以develop的677或完整守卫测试数字冒充本候选结果。
- Wrangler **4.88.0**本地Pages Functions编译exit0，实际路由仅`/api/*`、`/oauth/*`，无`/*`。源及dist Functions恰为API、OAuth及auth-client-ip helper三文件；无`functions/_middleware`、archive-policy、`_routes.json`、`_worker.js`。编译器生成的路由证据只放仓外，不复制到dist。
- 观察签名API/helper保留已审查字节指纹，根备用API/helper保持镜像；旧`attachAuthClientIp`实现、AuthContext/认证headers、OAuth、robots/HTML/noarchive/静态头/SW及Vite配置逐字保持main，限流和原认证范围不变。
- 真实编译Pages在本地workerd的双站代理回归 **30/30**，含独立观察HMAC与伪造拒绝、原认证、方法/正文/响应/CORS/App头、stream、真实101 WebSocket echo、401、502、静态ArchiveBot与OAuth边界。全部出站转同进程合成上游，禁止外网；随机本地key，不读取生产secret。首轮合成WS fixture缺关闭ACK出现runtime日志警告，保留原日志；只修仓外fixture关闭握手后重跑30/30且无该警告，候选源码未变。
- fixture源码仅用于测试/显式本地入口，生产入口依赖与产物检查不包含fixture；源hash、产物hash、路由、guard明确缺失及既有工作树/暂存状态保护证据保存在`/home/ZYongX/projects/abdl-space-user-observation-production-20261113/frontend-20261113T020541Z-ea8a6c/`。未启动UI fixture、未做GUI/三主题/剪贴板验收，不声称浏览器通过。
- 本准备任务仅本地候选提交，**不push、不合并develop/main、不部署、不调用生产API、不修改后端源码/secret/配置、不做Android或真实目标启用**。其他任务的后端发布状态不由本文代证；父流程须先审查并将候选集成develop（保留未授权guard在develop），再按授权单独提升该候选，不得整体develop上线。
