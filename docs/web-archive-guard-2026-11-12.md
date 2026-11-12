# 网页归档抓取控制（2026-11-12）

## 范围与保证边界

只修改主站/移动网页的Pages层。降低已知归档爬虫取得网页快照的机会，不改变Android、后端Worker、App时间线、站点访问策略、支付或小说审核开关。

公开网页无法保证不被截图、手动保存、伪装UA或不遵守规则的客户端复制；本轮不是防截屏或DRM，不承诺阻止所有机构，也不能删除对方已持有的副本。没有向档案馆提交本站URL、Save Page Now、删除申请或权属材料。

## 机制

1. `public/robots.txt`对归档产品组声明`Disallow: /`，普通`*`组不禁爬，避免把防归档扩大为全站退出搜索。
2. HTML的`<meta name="robots" content="noarchive">`与静态`_headers`声明归档偏好。它们是自愿信号，不能当作Internet Archive或其他服务必然遵守的保证；不全站设置noindex/nofollow。
3. 根`functions/_middleware.js`在`context.next()`之前检查归档产品UA，命中即返回短文本403，HEAD无正文，不先读取受保护HTML。拒绝响应private/no-store、CDN no-store、Vary User-Agent，无标题/用户内容/资源清单。
4. 未命中网页响应保留原状态/正文流和安全头，追加noarchive及Vary User-Agent；实际Content-Type为HTML/XHTML时private/no-store/CDN no-store，带hash静态资产原缓存不变。不存在URL后缀伪装的HTML缓存例外。
5. 精确`/api`及其子路径、`/oauth`及其子路径、robots和应用关联文件先透传，不重新构造响应；原代理/CORS/Auth/OAuth POST/302/WebSocket101均不改。类似`/apiary`或`/oauth2`不获得例外。
6. `_routes.json`显式include所有路径、不exclude API，保留代理执行，同时根中间件覆盖首页、index、深链接、静态路径、自定义域和Pages自身预览域。
7. SW继续不缓存导航/API；按实际响应类型和Cache-Control拒存HTML/private/no-store，旧误缓存HTML也不重放，清理仅影响该请求而不清除全部用户缓存。

UA列表是小型、可审查的产品标识：`archive.org_bot`、`ia_archiver`、`ia_archiver-web.archive.org`、`ArchiveBot`、`CCBot`、`heritrix`。逐产品token、大小写不敏感，不做泛化`bot`/`archive`子串封禁。`CCBot/2.0 (https://commoncrawl.org/faq/)`及robots标签可从Common Crawl官方核实；部分Internet Archive/Alexa标识是历史/兼容标签，不证明当前所有归档任务都携带它。dotted robots名称是遗留实现扩展，不满足RFC9309纯product-token语法，不能因此扩大到普通`archive`匹配。

## 运行成本与上线门槛

全路径Pages Functions会增加每个网页/静态请求的Functions调用；ASSETS返回静态文件不代表该次请求没有调用Function。不能只凭单元测试或仓内配置推断实际额度足够。

2026-11-12只读控制面查询：既有OAuth首轮401，在Wrangler刷新现有授权后恢复读取，没有新建token或变更授权。两项目production均`usage_model=standard`、`fail_open=true`，账户默认standard；控制面字段没有证明剩余额度或超额行为。现有fail-open保留，不能称防归档是不可绕过的边缘访问控制。

**当前仅开发，不推main、不部署、不改WAF/套餐/生产fail_open。** 正式上线前需核对真实请求量、可用Functions额度与耗尽行为；若无法确认不影响API/普通访问，暂停这层阻断上线，不代为付费升级、关闭全站或改fail-closed。robots/noarchive声明也应按明确上线授权发布。

## 验证记录

全部代码和测试写完后统一验证，生产未部署：
- 两站完整Node测试主站**611/611**、移动**618/618**（含各24个新增测试），0失败/跳过/取消。测试覆盖各1680个拒绝组合、完整产品token、空/普通/搜索/AppUA、HEAD、HTML/XHTML/静态流、精确接口旁路与无正文读取。SW使用实际源码VM覆盖旧HTML删除/不重放、在线HTML不存和正常资产离线回放。
- 两站正式build均exit0；构建产物真实携带与源一致的middleware/policy/robots/_routes/SW，include`/*`且无exclude，API原代理源码未改。
- Wrangler4.88实际编译+workerd/真实Pages dev共**381**检查点：主站174+17、移动173+17。已知归档请求ASSETS实际调用增量均0，普通HTML/深链接/query/资产200、归档403、robots/关联文件原内容、_headers与_redirects保留。实际编译API、WebSocket101/echo及主站OAuthPOST/302/body通过；移动无OAuth代理，只测中间件透传，不发明业务路由。
- 编译框架本身会clone各handler响应，未把跨编译边界对象identity说成已证；源函数级identity由Node测试验证，实际运行时只报告协议/流/WS保持。
- 修改函数/测试scoped ESLint及显式浏览器+ServiceWorker+Node globals的SW lint均exit0。首轮lint3处测试getter-return错误及public被忽略警告保留；以return assert.fail修测试后重跑。没有把ignored文件称lint通过。
- 普通浏览器实际访问本地Pages深链接，文档标题正确，robots返回真实文本；HTML仅最小合成入口，不当作整站ReactUI视觉或生产验收。没有模拟真实外部归档请求，也不发送用户原文。
- 初轮运行时工具错误：workerd拒绝deny public/private网络配置，Miniflare RPC拦截合成Origin返回403；均改仓外harness入口/断网策略而非业务判断。最终使用dispatchFetch和本地service协议替身、所有终端外呼抛错；PagesWorkerfetch关闭，CLI仅loopback，子进程均清理。

证据：仓外`abdl-space-archive-evidence-20261112/runtime-BT71vx/result.json`及编译/Pages日志；Node/build/lint各轮原始日志在既有仓外`abdl-space-novel-evidence-20261112/archive-*.log`。后续文档修改不改变业务源码。功能分支待实际提交/推送后登记，生产不动。

## 参考

- [RFC9309](https://www.rfc-editor.org/rfc/rfc9309.html)：robots不是访问授权，各scheme/authority独立。
- [Common Crawl CCBot](https://commoncrawl.org/ccbot)：明确产品标识及抓取偏好。
- [Pages Middleware](https://developers.cloudflare.com/pages/functions/middleware/)、[Routing](https://developers.cloudflare.com/pages/functions/routing/)、[Headers](https://developers.cloudflare.com/pages/configuration/headers/)、[Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)：中间件静态覆盖、include/exclude、Functions响应头与调用成本。

Internet Archive具体移除渠道和Google当前noarchive政策本轮访问官方资料超时，未把未经读取的旧说法写成当前事实。已有快照如需清理，应另行核实机构现行要求并取得外发授权。
