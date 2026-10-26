# 管理端「新版 App AI 服务配置」卡片

日期：2026-10-26。分支 `feat/app-ai-forum-controls-20261026`（基于 main `d720d22` 之后的 develop 线）。本轮为主站管理后台新增 App AI 上游配置卡片，对应后端 `GET/PUT /api/admin/app-ai/provider`（见后端仓 `docs/nbw-v2-app-ai-forum-controls-2026-10-26.md`）。**本轮仅交付 develop 分支代码，不部署生产。**

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
