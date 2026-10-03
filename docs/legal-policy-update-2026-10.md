# 2026.10 网页协议与隐私政策更新

更新日期：2026-10-03。范围：ABDL-Space-V2 与 abdl-space-mobile 的网页法律文档、注册政策摘要和阅读入口。未修改 App、后端业务、生产数据库或运行开关。

## 编排与同步

- 用户协议与隐私政策均标记版本 2026.10、更新及生效日期 2026-10-03。
- 两站采用相同协议正文及逐项双语隐私数据；隐私保留英文正式、中文 AI 参考译文的现有语言规则。
- 使用目录锚点、重点提示和第三方服务卡片，保留现有主题变量与页面容器。
- 移动站统一 18+，修正未成年人补充说明和注册文案；补充法律页面标题及旧地址重定向。
- 注册弹窗标注摘要版本，并提供完整政策新窗口阅读入口。

## 已核对的实现依据

以下路径相对于同级后端 `../abdl-space` 和 Android `../ABDL-Space-APP`。

| 功能 | 主要依据 | 文档处理 |
| --- | --- | --- |
| QQ | 后端 `src/lib/qq.ts`、`src/routes/qq.ts`、`migrations/0067_qq_android_auth.sql`；App `QQAuthActivity.java` 与 SDK 依赖 | 授权码与 token 临时交换、OpenID/UnionID HMAC 映射、昵称头像、SDK型号、解绑与腾讯撤销区分 |
| 宝宝认证 | 后端 `src/lib/baby-verification.ts`、`src/routes/admin-baby-verification.ts`；App verification 目录 | 完整照片 COS、联系QQ、成年声明、审核记录与公开证书范围；取消不等于删证据 |
| 本地锁与Passkey | App security 模块；后端 `src/routes/webauthn.ts` | 本地PIN与系统生物识别模板不上传，服务器持有Passkey公钥等记录；不误称TOTP或实名 |
| App版本 | 后端 `src/lib/app-clients.ts`、`src/middleware/app-clients.ts`、`migrations/0070_app_clients.sql` | 请求版本信息和实际开放后的账号版本记录；不以政策断言已上线 |
| 推送 | App `MastodonApp.java`、jiguang-sdk；后端 `src/routes/jpush.ts`、`src/lib/jpush.ts` | 启动初始化、设备/网络信息及通知内容；关闭展示不等于停止全部SDK处理 |
| 付费 | 后端 sponsors、afdian 与 sponsor-stock；App SponsorPurchaseFragment | 外部爱发电付款、兑换和权益记录；取消纯赠与/绝不退款旧表述 |
| 小说 | 后端 `src/routes/novel-private.ts`、`src/routes/novel-authoring-v2.ts`；App novel/importer | 文件全文云端上传、校验摘要、进度笔记；删除含异步清理，不沿用已下线MiMo |
| NBW与AI | 后端 `src/routes/nbw.ts`、`src/lib/nbw-sync.ts`、`src/routes/recommend.ts` | 账号资料、邮箱流程、默认双发及第三方副本；DeepSeek资料/感受汇总及正文片段 |
| 安全与位置 | 后端 `src/middleware/ip-security.ts`、`src/lib/captcha.ts`、`src/lib/baidu-ip.ts`；App LocationUtils | IP/UA/路径与安全行为数据、系统定位逆编码、IP属地和统计 |
| 注销 | 后端 `src/routes/admin.ts`、auth路由和相关外键 | 现有完整自助注销/导出不可用，邮箱申请；不承诺全部即时自动删除 |

## 本次没有通过改条款修复的实现问题

1. NBW 双发：App 将关闭选择转换为空 `nbw_fid`，后端只有 `-1` 才明确跳过；空值可能默认同步。文档已披露不能仅凭关闭控件保证不发送，但该问题仍需要业务修复及实际验证。
2. 极光 SDK 在 Application 启动中直接初始化；系统通知权限与隐私同意门禁不是一回事。披露真实处理不代表已取得合法同意，也不能替代SDK初始化门禁整改。
3. 自助注销与导出没有完整后端实现；管理员删除还有赞助外键、QQ映射和认证COS对象等覆盖问题。权利申请渠道不等于清理链路已完善。
4. 认证照片没有审核/取消后定期自动销毁路径；日志与备份未核实统一保留期限，不能写虚构天数。
5. 私人小说对象实际Bucket Policy/ACL未远程核验；不作绝对私密或全量即时删除承诺。
6. App 精确版本记录与认证恢复修复在仓库记录中仍为未部署；未迁移D1或启用线上策略。
7. 运营名称及既有联系邮箱保留；未凭空填写未核实的法人身份、地址、统一保留期限或退款时限。
8. 网页Passkey/NBW/部分内测入口的年龄确认覆盖仍不一致；本轮仅统一法律文本及移动现有注册勾选文案，不重构身份验证流程。

以上为实现边界记录，不是完整安全审计或法律合规认证。上线公告、必要重新同意、数据处理留存制度和法律主体信息须与实际运营配套。

## 本轮验证

- 主站 `npm run test`：93/93 通过；移动站：84/84 通过。包含协议正文、逐项双语、实际 JSX 静态渲染、目录锚点、路由、摘要及未成年人补充说明。
- 两站 `npm run build` 成功。保留既有缺少验证码环境变量与大分块告警；没有因此修改验证码配置或构建架构。
- 移动本轮法律页面、摘要、legal 数据及测试的定向 ESLint 通过；首次发现测试中 Buffer 未显式导入，已同步修复两端并重跑全部测试。未宣称全仓 ESLint 通过。
- 两仓 `git diff --check` 通过，协议与隐私的页面、数据、测试文件两端逐字一致。
- 浏览器检查桌面1280px及移动390px的协议和隐私首屏，无横向溢出；验证协议QQ目录跳转和隐私英文正式版切换。未逐章、逐主题做完整视觉验收，也未验证线上发布。
- 未运行深度安全审计，未执行数据库迁移、Worker部署、App构建或真实第三方授权/付款/照片删除测试。

## 参考资料

仅借鉴其他平台的章节组织，不照搬其主体或业务事实。

- https://furryfurry.cn/user-agreement
- https://furryfurry.cn/privacy-policy
- https://wiki.connect.qq.com/qq互联sdk隐私保护声明
- https://wiki.connect.qq.com/开发者协议
- https://www.jiguang.cn/license/privacy
- 用户提供的宝宝新天地隐私政策（生效日期2024-08-05，联系admin@mail.newbabyworld.top）。该第三方14+规则不改变本站18+限制。
