# 翻译词库与策略管理前端生产发布（2026-11-03）

## 授权范围

用户明确要求“词库前端上线”。本轮发布主站和移动网页的中英翻译词库卡片，以及同一开发线内词库依赖的帖子翻译策略卡片；不发布后端或Android，不执行数据库迁移，不填写词库、不代管理员保存策略，不调用真实AI，不修改NBW主备、模式、版本策略、AI供应商或密钥。

用户同时询问NBW全功能随配置变化是否需要跨端改动：该项仅只读评估，不在本次上线中实施。主备域名、V2能力模式、指定原生版本仅本站是三个独立维度，不能相互替代。

## 固定源码与发布前验证

| 站点 | 原main | 本次main |
| --- | --- | --- |
| 主站 | `d59893d0b942905c07074b9340fbeddc736cd8f3` | `0b7b7e164ed264398ef4be77ac841ed6fb88f818` |
| 移动 | `fa4c4168c48e413964b8dcdbec7502cebe7f00aa` | `010371847b1af7a8fce2a4a1dc6bd27227cfb20c` |

两站相对原main的生产代码增量仅translationPolicy、translationGlossary及其API/AppClients接线；其余为测试和文档。依赖锁、Pages代理、Vite配置、CSP和部署配置无增量。

发布前以固定源码串行执行完整Node测试和正式构建：主站 **474/474**、移动 **483/483**，均0fail/skip/cancel，双build exit0；主站305、移动282个源码/配置文件验证前后逐hash相同。没有为构建改变依赖版本或清理用户环境。既有Browserslist、构建环境变量和chunk告警保留，不宣称无告警。

main均非squash快进已验develop，推送触发现有Cloudflare Pages Git集成；没有额外CLI重复部署。

## 实际生产部署

| 站点 | Pages production deployment | 部署成功时间（UTC） |
| --- | --- | --- |
| `abdl-space-v2` | `e14449c5-58a5-4544-8355-a920b228fa44` | `2026-11-03T12:37:38.26912Z` |
| `abdl-space-mobile` | `c58afa16-90de-4492-a769-007e9b60ebb9` | `2026-11-03T12:38:13.963077Z` |

API确认deployment对应固定commit、environment=production、deploy阶段success，并且project canonical_deployment已指向本次deployment。构建设置、source Git集成及deployment_configs（环境/绑定）与发布前逐对象相同。

正式域入口：

- 主站：`https://abdl-space.top/admin/app-clients`
- 移动：`https://m.abdl-space.top/admin/app-clients`

管理员登录后进入“App管理 → App中英翻译词库”；同页有“App帖子AI翻译策略”。中文、英文各每行一个别名，备注可选，最后显式“保存全部词库”并确认缓存失效。保存会更新共享缓存世代，后续新生成可能消耗发起者额度；不清日账本，不自动重译已显示内容，也不重发旧unknown。后端已有0104/id25，不需要任何重复迁移。

## 实际资源与代理核验

从正式域HTML解析当前entry，再从entry解析appClients模块与CSS，不猜旧构建hash：

- 主站模块 `appClients-Cm87Re-t.js`，63455字节，SHA256 `77cabe2261ac7e8d4e8a83086e1449a574585dd55dba85e9f82c576173cc2b2d`。
- 移动模块 `appClients-b0HMpbap.js`，63454字节，SHA256 `5e2cb3d7ac881301861b97e74ec274c438a953aeb9d658bced39cc5ea8855cb2`。
- 两站CSS与本地已验证构建逐字节一致，SHA256 `7e6ce32bc6c9ff02ef02cc6446da59318c775f3f18fc0c29e6b245316a450d3e`。
- 移动模块及三个共享依赖逐字节匹配；主站appClients仅静态import资产文件名不同，替换这些实际import路径后其余代码完全一致。主站共享entry/layout的原始字节不同，不将其冒充逐字节一致；部署commit/canonical核验和词库/策略API方法、路径、no-store标记也已确认。
- 实际模块包含词库标题、中英多别名、可选纯文本备注、保存、缓存失效确认、丢弃重载确认及翻译策略标题；共享API模块包含词库/策略GET/PUT接线。

两站同源 `/api/health`、`/api/health/db`均200；匿名词库GET/PUT及策略GET均401固定安全错误，并保留no-store。共10项有界代理检查通过，无有效管理员身份或正文请求。首轮主站资源及代理检查通过、移动后段传输RemoteDisconnected，保留首轮文件后完整复验两站通过，未因此改代码或重发部署。

官方浏览器分别打开两正式管理路由，最终均显示“请先登录管理员账号 / 登录后才能验证管理后台权限”，并提供登录/返回前台链接。移动短暂身份验证中状态后正确落到登录门禁。没有用本地fixture冒充正式页面，也没有用私有凭据模拟用户；因此不声称已代验生产管理员编辑/保存闭环。

## 未执行与归档

后端仍为既有Worker819/`742bd7c7-9e53-4a52-b276-f64773b5e0d4`；Android main不动、beta35测试包不变。无D1操作、无NBW行为修改、无供应商/策略/词库写入或真实AI。0104已生产唯一id25，禁止重放0104/0103/0102或全量apply。

发布文档仅合回并推develop，不再推进main触发第二次部署。私有证据：`~/.local/share/abdl-glossary-web-production-20261103/`，包含release-intent、源码指纹、完整测试/build、Pages前后metadata、production-assets-verification、正式浏览器门禁记录及首轮失败文件。
