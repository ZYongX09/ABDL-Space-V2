# 管理端「新版 App AI 服务配置」卡片

日期：2026-10-26。分支 `feat/app-ai-forum-controls-20261026`（基于 main `d720d22` 之后的 develop 线）。本轮为主站管理后台新增 App AI 上游配置卡片，对应后端 `GET/PUT /api/admin/app-ai/provider`（见后端仓 `docs/nbw-v2-app-ai-forum-controls-2026-10-26.md`）。**本轮仅交付 develop 分支代码，不部署生产。**

## 2026-10-29 自定义主机与测试按钮（开发线，未上线）

本轮按用户要求移除固定供应商主机白名单，允许符合规则的自定义公网 HTTPS Base URL；仍拒绝本机/内网/IP、凭据、非默认端口、query/fragment 与重定向，出站由后端公共 DNS 预检。此预检不是连接 IP pinning，管理员仍须信任自己选择的供应商，不宣称解决所有 DNS rebinding。

卡片明确显示 **OpenAI 兼容 Chat Completions 协议**：后端向填写的 Base URL 追加 `/chat/completions`，不自动加 `/v1`，不是 Responses API `/responses`。新增“测试当前草稿（不保存）”按钮，使用当前 base/model/token动作和已保存 revision，不必先保存，也不把成功测试当作配置已生效。

测试通过同源、鉴权的 `POST /api/admin/app-ai/provider/test` 完成，浏览器不直接访问供应商；后端固定短提示、一次模型请求、最多16输出token、总10秒/4KiB，可能计费且无自动重试。返回协议/请求模型/耗时与固定“收到有效文本”状态，不回上游任意正文或错误体；token只在replace请求发送，不进入状态/日志。keep跨origin仍要求更换token，clear或无有效token不发测试。

测试独立loading/result/error，前端20秒截止；任何字段、密码输入、会话变更、加载或取消使旧结果失效，不改saved/draft/revision。取消只停止等待，不能承诺撤回上游请求或退款。GET与保存本身不触发供应商调用，下文“只配置/无测试调用”为历史实现。本轮只交付develop，不部署生产、不更改真实配置或密钥，不改Android/V4。最终测试/构建与界面证据在本节收尾补充。

## 范围

- `client/src/appAI/`：`model.js`（表单校验与 revision CAS 状态机）、`api.js`（对接 admin API，token 永不落入本地状态）、`fixture.js`、`model.test.js`。
- `client/src/pages/admin/AppAIProviderCard.jsx`：卡片渲染进既有 App 客户端管理页（`appClients.jsx`）。
- `tests/app-clients-fixture-server.js` 增加 AI provider 路由，fixture 与真实 API 契约一致。
- 卡片文案明确边界：仅影响带新版协议头（`X-ABDL-App-AI: 1`）的 App AI 功能；保存只更新配置，不自动调用供应商、不测试连接、不拉取模型列表。

## 行为要点

- 令牌三态：默认 keep；「替换」才显示并必填新令牌（密码框非受控、不回显、保存/取消/离开/切换账号即清空）；「清除」需勾选确认，清除后新版 App AI 不可用、本站发帖不受影响。
- 跨 origin 变更 base_url 时必须携带新令牌（keep 被阻止），与后端 422 契约一致；revision 字符串 CAS 冲突时提示刷新重试。
- GET 只回 `token_configured`，页面任何路径都不显示、不持久化令牌。

## 验证

- `npm test` 全量 **315/315 通过**（含 `src/appAI/model.test.js` 新增用例），`npm run build` 成功。
- 未改路由代理、广告、赞助等其他管理卡片；`.mimosa` 目录不提交。
- 仅本地验证与构建；生产 Pages/Vercel 部署需用户另行指示。

## 2026-10-27 推送门禁误报处理

用户授权对低风险告警做定点风险接受、实际高风险修复。逐项复核发现六条 SSRF high 均是项目图将测试夹具 `tests/registration-guard-fixture.js` 的同名 `fetch` 方法错误关联为生产浏览器/固定上游代理的全局 fetch。单文件直接扫描零发现，项目上下文扫描明确指向该 fixture，不能将其当成已证实生产漏洞。

只将内存夹具方法改为 `handleFixtureRequest`，同步三处测试调用；生产 AuthContext、两份 API 代理和 OAuth 代理未改，未知路径拒绝、测试隔离与断言保持。相同项目上下文复扫中 AuthContext 告警6→0、API代理3→0；完整测试315/315复测通过。未禁用Hook、未添加抑制注释或改写安全账本；不据此声称全项目安全。证据在仓外 `app-ai-controls-production-20261027/`。本轮两站只推 develop，用户明确授权上线的仅后端。
