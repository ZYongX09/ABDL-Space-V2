# App 帖子 AI 翻译策略卡

本轮仅开发交付。修改位于 `client/src/translationPolicy/`，挂载于管理端 App 客户端页面；没有部署主站、修改生产策略或发送真实 AI 请求。

## 配置与接口

复用统一 App AI 服务，不新增模型地址或密钥输入。通过 `GET/PUT /api/admin/app-ai/translation-policy` 管理：

- 总开关 `enabled`。
- 普通、英文阅读普通、当前有效赞助账号每日额度，默认分别为 5、10、100，不叠加；输入为 0–10000 的整数。
- 赞助者自动翻译许可 `sponsor_auto_allowed`。它不替用户开启自动翻译，实际执行仍需用户主动开启且赞助有效。
- 缓存世代 `cache_epoch`，大于等于 1 的安全整数。切换缓存命名空间不重置当日已用、预占额度。
- 上海时区 `Asia/Shanghai` 只读。

PUT 精确发送七个字段：`enabled/daily_limit/english_daily_limit/sponsor_daily_limit/sponsor_auto_allowed/cache_epoch/revision`。不发送只读时区或密钥。使用 UUID revision 的比较交换，不自动覆盖冲突、不自动重放保存。

读取失败不伪造已保存状态；离线无本地假成功。保存只写策略，不调用 AI，也不证明上游已配置可用。账号/token 变更、卸载、取消和晚回包均受 generation 与会话隔离。

## 验证

- 新增策略专项 23 项；与相邻管理模块合跑 104/104。
- 新鲜主站完整基线 418/418；加入本轮后完整 441/441，零跳过，构建成功。
- 每轮完整测试/构建前后源码指纹一致。首次相邻测试暴露既有 VM 夹具未注入新 API namespace，已仅补夹具并完整复跑，不隐藏首次失败。
- 本地内存 HTTP fixture 浏览器实际验证：普通额度 5→8 保存；下一草稿 9 遇 409 后保留并禁写；重新加载恢复已保存 8。1280px 浅色、390px 深色及 colorful 模式无横向溢出，截图留存仓外。
- Vite 环境变量、旧 Browserslist、既有大 chunk 告警仍在；构建并非无告警。

证据：`~/.local/share/abdl-post-translation-20261102/web-final-summary.json` 及其逐轮原始日志。没有更改依赖锁、既有 provider/human 策略或生产配置。后端须另获授权上线并完成新迁移后，生产页面才能使用新端点；本次推送 develop 不等于上线。
