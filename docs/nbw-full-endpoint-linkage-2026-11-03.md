# NBW 全链路主备联动（2026-11-03 开发，未上线）

## 范围与边界

用户要求当 NBW 主域失效、管理员切备用后，授权、原文、头像、媒体和相关功能跟随配置。本轮为后端、Android、主站和移动站的协同开发；只合回并推 develop，不发布 main、不切生产配置、不执行生产候选0105、不代用户真实授权、注册、发帖或上传，不调用 AI。

此前词库及翻译策略卡已在2026-11-03单独上线，主站main0b7b7e1/Pages e14449c5，移动main0103718/Pages c58afa16；那次发布不含本功能。后端生产仍Worker819/main43854dd，0104/id25、0103/id24、0102/id23禁止重放。

## 统一合同

公共 `GET /api/nbw/endpoints` 返回严格九字段：`schema_version:1, revision, mode, api_origin, authorize_origin, public_origin, media_origin, ttl_seconds:30, remote_mode`。四个origin与mode一致，只能是 `https://www.newbabyworld.top` 或 `https://nbw.abdlcalendar.top`，拒绝任意域名、userinfo、端口及URL混淆。

地址主备与 full/read_only/local_only 及指定原生版本策略互相独立。公共web/V1的remote_mode使用原能力基线，各业务原权限不变；新App取公开和认证能力更严格结果。每次管理员成功写mode均换持久revision，含same-mode和ABA；缓存和晚回包不能因地址切回原主机而复活。

## 授权

旧无state配置仅用于探测是否配置；新授权前生成本次随机state，向同站后端请求带state配置。响应包含服务端authorization_url和签名opaque oauth_context，绑定站点、client/redirect、endpoint、state、十分钟期限及单次回执。前端严格校验实际授权URL，不自行替换授权主机。

同源GET可能没有Origin，后端允许严格可信Referer等价，但非法Origin不回退；主/www组与移动组redirect严格匹配，不跨站搬运code/token绕sessionStorage。state/context仅存在本次sessionStorage；callback/bind携带二者，协议错误不丢上下文重试legacy，不自动重新POST已发code。注册透传的既有签名nbw_token不是上游access_token。

进行中的OAuth由服务器固定同一endpoint；配置切换可明确终止要求手动重开，但不把旧code重发新主机。旧无上下文客户端只能维持primary兼容，不能声称旧包已经全链路跟随。

## 展示与生命周期

采用集中纯URL投影和React订阅，在实际href/src取用点映射已知NBW来源；保留path/query/hash与签名语义，不修改任意用户正文或稳定UID/acct/uri，不使用全局DOM观察器或HTTP拦截器。

冷启动未知快照时NBW图片/链接占位，不先出站primary再改backup；非NBW/data/blob遵循原行为。App级单份短TTL刷新单飞，页面/图片仅订阅，不逐图轮询；后台及卸载清理。ImageGrid预览和原图采用同一当前快照，不因失败来回切主备。NSFW分类、模糊和访问控制沿原链，不借地址投影改变判定。

CSP仅增加固定备用域，不用通配。配置传播受30秒客户端及后端缓存边界限制，不宣称跨实例即时推送。真实备用域同资源、Cookie和OAuth回调白名单仍待真实上游契约验收。

## 验证

最终冻结生产 68 文件（主39/移29）逐 sha 匹配；完整 Node 回归主站 **508/508**、移动 **515/515**，均 0 fail/skip/cancel，双站 `npm run build` exit 0，运行前后源码指纹无变化。独立只读复核发现并修复的 P2（route cache acquisition 代次、ExternalLink 最终 sink、一键注册卸载后仍在写、冷启动 GET 被误拒无恢复）均已按最小范围修正并复核关闭。

本地受控浏览器（loopback fixture，真实共享 NBW 模块，CSP 拒绝外网，无真实授权）记录13个交互/DOM检查点；其中缺context只执行移除和警告观察，后续callback拒绝未完成GUI验证（自动化测试另覆盖），不计GUI通过。其余观察包括：冷启动 `endpoints:null` 且 NBW 图片无 `src`（不预取主域）；切备用后头像/原图/href 使用备用域并保留 path/query/签名，稳定 id/uri/正文不变；同源 GET 以 Referer 作为可信来源；切主域后提交回调记录 `pinned_mode=backup / current_mode=primary`，页面未离站且未重放 code；错误 state 不产生 POST，移除 context 出现明确警告；discovery 503 与非法快照均为安全错误且图片置空；local_only 下入口禁用；恶意 registrationURL 被拒；同域 revision 递增隔离；保持中的授权响应在快照变化后被丢弃并提示重开。证据见 `~/.local/share/abdl-seamless-nbw-20261103/web-browser-fixture-verification.json` 与 `web-renders/`。

仅归档并目视核验一张浏览器截图，不能称13项视觉验收全部通过。这些仍是合成数据验证：CSP 阻止外链媒体，所以只能核对派生属性而非真实上游图片；真实 NBW 双域同资源、浏览器 Cookie、合作方回调白名单契约未验证，不代表真实链路已通。

最终证据归档在 `~/.local/share/abdl-seamless-nbw-20261103/`，两站生产边界不因 develop 推送改变。
