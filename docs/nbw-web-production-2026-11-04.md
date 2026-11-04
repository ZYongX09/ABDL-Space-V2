# NBW 主备全链路联动双网页发布（2026-11-04）

## 授权与固定源码

用户明确要求“网页上线”，本次只发布主站与移动站NBW联动：端点发现、固定OAuth上下文、展示/媒体实际取用点、真实获取世代及列表恢复。保留已上线词库/翻译策略管理及原有权限，不再部署后端、执行数据库迁移、修改主备/能力模式/AI配置或发布App。

| 站点 | 原main | 本次生产main | 实际Pages deployment | 生产成功时间UTC |
|---|---|---|---|---|
| 主站abdl-space-v2 | `0b7b7e164ed264398ef4be77ac841ed6fb88f818` | `b8bb02eda537e6a3b9e4ae9e2309e4f57468cc9c` | `d1c65ffd-c057-4d51-9d65-8172223ad4a9` | `2026-11-04T10:52:54.717927Z` |
| 移动abdl-space-mobile | `010371847b1af7a8fce2a4a1dc6bd27227cfb20c` | `122b08c6e674f621ce7283769df20b1ceccd0f6e` | `8979c5ae-99f8-48e8-9d79-ba15252b2a20` | `2026-11-04T10:53:38.22395Z` |

两站main均非squash快进已验develop，develop包含main增量。Pages API确认production、准确commit、deploy success与canonical匹配，build_config/source/deployment_configs相对发布前逐对象不变。

## 发布前验证

新label一次串行执行完整测试与正式构建：主站 **508/508**、移动 **515/515**，均0fail/cancel/skip，双build exit0。主站315、移动292个业务源码/配置逐hash前后不变，与开发验收一致。原始主站manifest另含一个未跟踪的嵌套Mimosa工具状态文件(raw316)，未清理/编辑或提交工具状态。

依赖锁、Vite、Pages代理/Functions和部署配置均未改，CSP只增加固定备用域（主站img/frame、移动img），不用通配。构建原有captcha/主站turnstile占位、Browserslist陈旧及大chunk告警如实保留，不声称零告警。

## GitHub触发异常与恢复

普通main推送曾遇GitHub Internal Server Error（主一次、移动两次）；每次先核远端refs仍旧main及Pages未创建目标，再普通重试，没有force-push。移动改用HTTP/1.1非薄包普通push后成功。

main提交已更新但Pages Git webhook超过15分钟未产生两站目标deployment（不是正在build）；保留多次只读观察。再次核对远端main、未存在目标deployment及原Git集成配置后，使用官方Create deployment端点 `POST /accounts/{account}/pages/projects/{project}/deployments`、仅multipart `branch=main` 各触发一次已有Git源构建。不是本地Direct Upload，没有上传本地assets、创建hook、改环境/绑定或重复已有目标build。返回的Git commit准确，随后成功生效。

## 实际资源与代理

- 从正式域HTML取得实际entry，再按entry引用取得Login、NBWCallback、ExternalLink、appClients、ImageGrid、首页/ForumFeed及主站OneClickRegister模块，不猜旧hash。
- 两站实际entry、主站8个/移动7个关键懒加载模块及CSS均与**固定目标Pages canonical deployment**逐字节一致；CSP精确包含两NBW主机。32份JS样本经Acorn和Babel只解析全部合法，不执行下载JS。
- 移动entry和7个模块与本地已验构建逐字节一致；主站云端与本地entry、部分模块的压缩产物不同，不能称字节/AST等价。主站ExternalLink/appClients/ImageGrid/ForumFeed/OneClickRegister仅引用hash归一后相同，其他差异只记录不作任意变量归一化。准确部署commit、canonical与NBW核心标记另已确认。
- 首轮资源下载有传输断开及单次read短读：旧主站样本恰为完整canonical的前346191字节，缺末14937字节而导致静态解析失败；改有界循环读到EOF并核Content-Length后，完整361128字节的正式域/目标canonical完全一致。原失败样本保留，没有因取样问题改代码或重复部署。
- 两站同源health/DB、九字段发现、旧config、安全拒绝非法state及词库/策略匿名鉴权最终 **14/14通过**；首轮仅主站旧config一次RemoteDisconnected留证后重新读取通过。新discovery为primary/web原能力基线full，不表示改变原生V2 local_only或任何原业务权限。

## 实际浏览器与未验边界

官方浏览器实际打开两正式`/login`及`/admin/app-clients`：登录页渲染且管理页均显示“请先登录管理员账号 / 登录后才能验证管理后台权限”。主/移初次导航超时后同标签已实际完成，未伪造瞬时成功。移动393px截图曾出现“配置暂不可用，请稍后刷新重试”的安全禁用状态，本轮观察期间网络不稳；保留此观察，不把它称成功授权，本站登录表单仍可用。

未点击NBW授权按钮、登录真实账号、保存管理员设置或启动注册/发帖/上传；因此不声称真实主备切换、双域资源/Cookie/合作方回调白名单与账号授权闭环已验。客户端配置传播有TTL，不虚称全局即时推送。Android仍为既有签名测试包cfac28cd，不正式发版或安装。

后端保持Worker822/`1d7da1f3-0287-4930-819f-f7901ae1801b`，本次无D1调用、无迁移，0105已唯一id26（及0104id25等）禁止重放。NBW/AI/版本/词库/配额配置本轮不写。文档只合回推develop，不再次推进main。

## 证据

`~/.local/share/abdl-nbw-web-production-20261104/`：release-intent、Pages前后metadata、GitHub错误及未触发观察、branch-only Git build回执、正式资源逐hash、完整流取样与旧截断样本分析、14项同源proxy、浏览器门禁及收尾结果。新测试/build/源码和dist清单在 `~/.local/share/abdl-seamless-nbw-20261103/web-release-preflight-20261104-*`。生产metadata、凭据和构建产物不提交仓库。
