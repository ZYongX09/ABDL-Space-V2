# 恢复说明（2026-09-25）

本分支基于云端还原提交 `51ecae78641e03f3af656d5c090fb37fe3804d6c`，从本机 ZCode 会话数据库恢复删除前未推送的增量。

恢复内容：

- 管理员 QQ 身份查询、筛选与解绑界面。
- QQ 响应敏感字段过滤、幂等 operation ID 和会话漂移保护。
- 宝宝认证照片访问错误提示和相关契约更新。
- QQ Android SDK 隐私政策披露。

验证：

- 单元测试：32/32 通过。
- `npm run build`：通过。
- 保留云端基线的 `abdl-v2` Service Worker 安全策略，未恢复旧版通用 GET 缓存实现。

证据来源：ZCode SQLite 会话库、Cloudflare Pages 部署记录。当前生产 Pages Source `e9e85f5` 与基线 merge 提交工作树无差异。
