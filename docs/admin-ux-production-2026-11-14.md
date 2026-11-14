# 全后台 UI/UX 分层上线记录（2026-11-14）

## 授权与发布范围

用户在开发交付后明确要求“上线”，覆盖本轮主站17个管理页、移动站16个管理页及嵌入模块。仅发布双站前端，不改后端、Android、数据库、部署环境变量或生产业务策略。没有真实AI、支付、推送、认证照片认领、观察目标或治理写操作。

此前开发交付说明中的“未上线”是历史状态；本次发布状态以本文为准。仍未完整覆盖的视觉矩阵见下文，不因上线而被记为通过。

## 分层候选与分支

| 站点 | 旧 main | 本次 main / 冻结候选 | 先集成 develop 的 merge |
| --- | --- | --- | --- |
| 主站 | `07d2d37bad276b5fccde00842155b1431f221a45` | `b3f7d0d0044278fe3e887d33e96e0fb2ef23cb70` | `d0814a8` |
| 移动 | `8403d3757e0522f04e8d7d5cc844b13e78c6eca8` | `4d70ec29ceb960519593ea801a343c66bbeeb0bb` | `d9a38af` |

从旧main cherry-pick开发交付主`ef9685b`/移`2bdf7b0`，仅测试命令因分层差异冲突：生产保留声明层测试并加入UX测试，不引入完整archive guard测试。候选src与开发交付逐文件一致；候选先合回develop再快进推main，发布后远端`develop ⊇ main`。develop合并保留其完整守卫和测试，merge前后树相同。

**完整防归档守卫没有发布**：两候选Functions/public/Vite配置相对旧main零变化；主站仅API/OAuth Functions，移动仅API Functions。构建产物无root middleware、全路径`_routes.json`、advanced Worker或archive-policy。生产仍为既有robots/noarchive及SW HTML缓存声明层。未来也不能整仓提升develop夹带守卫。

旧quota工作树仍位于本地`wip/preserved-develop-20261114`，暂存diff SHA256与开发交付前一致，未reset/stash/清理。依赖symlink和`.mimosa`仍未跟踪，不提交。

## 自动检查与真实构建

- 主站分层候选：**802/802**，0失败/跳过/取消；Vite build exit0。
- 移动分层候选：**806项/800通过/0失败/6 N/A**，0取消；build exit0。6项均为移动没有的web-only相册管理案例，不算通过。
- 相比develop的818/816通过，每站少16项完整archive guard测试；实际UI测试与源码相同，不放宽业务或安全断言。
- 候选所有改动文件SHA256在测试/构建前后相同。源代理、静态声明与构建配置匹配旧main；构建Functions清单再次核实。
- 开发交付的相同src范围lint为0error，主57/移64warnings；不称全仓零诊断。本次分层只改测试注册，不改规则/依赖。

## Pages正式部署

| 站点 / 项目 | deployment ID | 创建时间 UTC | 最终状态 |
| --- | --- | --- | --- |
| 主站 `abdl-space-v2` | `4fa27f9a-5b08-4e61-bac1-92d2230666e8` | 2026-11-14 00:49:44.727397 | production / deploy success / canonical与main commit一致 |
| 移动 `abdl-space-mobile` | `3589af9e-5530-4adc-9839-5ae97d16bf47` | 2026-11-14 00:49:48.800411 | production / deploy success / canonical与main commit一致 |

通过Git main自动部署，仅触发一轮；没有额外Wrangler upload或改Pages配置。部署前后source/build_config/deployment_configs元数据投影hash一致。secret字段仅记录存在性、类型与脱敏元数据，不读取或声称核验密钥明文。

Cloudflare首次只读GET遇401，失败证据保留；`wrangler whoami`刷新既有OAuth后新基线通过，未新建令牌或改权限。两站按候选完整commit查询既有production部署，成功后canonical再次匹配，没有因等待而重复部署。

后端Worker前后部署ID均`53f04e03-2d1e-4cc5-ac9a-62d2a65fe832`，版本`39c4d060-d99a-4a14-8f88-3b25ce5879b5`承100%。未发布Worker、执行D1查询/迁移或触碰Android。

## 上线后核验

首个匿名只读样本24/24通过；第二轮起始TLS EOF中断，原日志保留，再运行完成**85/85通过**：三入口health/public timeline/认证拒绝/观察private no-store/小说管理鉴权，双站全部17/16管理HTML、实际入口及关键后台JS/CSS、robots声明。HTTP成功不等于登录后逐页功能全部验收；站点状态revision/status/download投影在两个只读样本间一致，两个样本均在推main之后，不能称发布前后数据库快照比对。

### 本次补到的DOM＋已查看截图

- 本地合成390浅色：仪表盘、模态导航、赞助已加载概览/单h1/栏目横滚/独立保存分区、认证队列2条、帖子手机记录卡、站点已保存摘要与未提交草稿。
- 站点添加合成条目并输入首字，编辑器保持展开，页面标未保存；未点保存，没有生产写入。
- 本地1280浅色：仪表盘、相册举报单标题与完整ID、可聚焦局部横滚；键盘小幅右移后，通过实际水平滚动看到完整日期/状态/右侧详情操作，页面本身不横向撑宽。
- 正式390深色：既有超管会话只读查看已加载仪表盘、导航、赞助概览和安全/观察页。
- 正式1280深色：主站观察页已加载DOM和截图。

### 当前生产观察状态的重要更正

**2026-11-14本次正式双站只读页面显示“总开关开启”，已配置目标本页1个**；保留30天、单用户日2000/全局日5000。昨天关闭/空目标记录是历史，不能继续用作当前状态。未选择该目标、读取其敏感记录、保存策略或追查修改者；不能仅凭本次UI发布断言何时由谁改动。此次没有开启、关闭或修改观察，不擅自回退为昨日状态，也未重新操作用户7。

### 仍未完成、未冒充通过

并非完整17/16页所有主流程及内嵌栏目视觉矩阵：360/768/200%缩放/减少动画/全部主题映射/系统剪贴板及部分页面细节尚未覆盖。没有真实付款、退款、AI、推送、照片或治理/观察写入测试。此前浏览器guest附着/导航超时与旧截图失败均保留；新浏览器显示后已恢复并补到上述实际截图，不再笼统称手机0通过，也不扩大为全站验收全过。

## 证据与回退指针

仓外`/home/ZYongX/projects/abdl-space-admin-ux-production-20261114/`：`candidate-freeze.json`、`pages-preflight*.json`、`pages-verify-*.json`、`http-before.json`、`http-after.json`、`worker-deployment-*.json`、`acceptance.json`与`viewed-screenshots/`；测试/build完整日志沿用`abdl-space-admin-ux-evidence-20261113/{web,mobile}-ui-release-*-20261114.*`。原失败证据不覆盖。

如需回退，旧main/Pages ID见上表与上轮观察发布记录；本次没有执行回滚。回退仅前端，不重放迁移、不回滚数据库、不改变当前策略。后续操作先核对当时真实远端与canonical，不盲用历史指针。
