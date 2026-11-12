# 网页防归档声明层发布（2026-11-12）

## 用户选择与范围

用户要求网页防归档后，完整方案已在develop实现并验证；用户要求上线时，容量前检发现全路径Functions可能影响既有API可用性，用户明确选择**“仅声明层（推荐）”**。

本次从原main整理独立发布候选，只包含：
- `robots.txt`归档组`Disallow: /`，普通搜索组不禁爬。
- HTML robots noarchive与静态`X-Robots-Tag: noarchive`。
- SW拒绝存储/重放HTML/XHTML及private/no-store，普通静态资产缓存保留。

**不发布**根`functions/_middleware.js`、归档判断Function、全路径`_routes.json`或`_worker.js`，不新增每资源Functions调用，不主动403归档UA。原App/API/OAuth/WebSocket代理及应用关联文件不改；后端、Android、WAF/套餐/生产开关均不动。

这不是完整防快照访问控制。公开页面仍可能被不遵守声明或伪装客户端复制；不会删除已有存档，不向档案馆外发URL或权属资料。

## 容量前检

只读GraphQL当日截至10:24UTC账户Workers调用27406；近7个完整UTC日最高89061，同日双站HTTP39938。两者有代理/子请求等交叉，不能直接相加作为精确预测，但全路径守卫会增加原静态请求调用，不能证明低于Free日100000。

账户订阅读取403，`usage_model=standard`仅说明Standard模型，不能证明Workers Paid；网站Free套餐也不等于Workers订阅。官方Pages API的fail_open含义是“部署配置无法应用时是否fail open”，不能推断为额度耗尽时API自动透传。保持现有fail_open=true，不代为升级/付费/全站fail-closed。用户据此选择声明层。

## 分支与验证原则

完整送达前拦截留在develop；仅声明候选先集成develop使其包含将发布main，再单独提升声明候选main，不把整个develop合main，不回退/重写其他提交。

本次声明候选已独立实跑：主站597/597、移动604/604，0失败/跳过/取消，双build exit0。首轮测试正则两个空格触发lint，改为等价` {2}`后最终声明/SW专项各13/13及scopedlint0、显式SWlint0；业务源码不因lint改变。

实际Wrangler4.88编译：主站只`/oauth/*`与`/api/*`、移动只`/api/*`，没有`/*`根middleware，Functions源文件分别3/2份逐字保持原main。源与构建产物均无归档Function、_routes或_worker；robots/headers/SW/meta与源匹配。本轮不挪用此前完整guard611/618或381检查点作为声明候选结果。正式robots/meta/header及API时间线/OAuth/关联文件只读验收待部署后执行。

## 部署状态

待验证与自动部署；尚未写入生产结果。后端保持Worker884/`15f0b5df-3fb4-463e-afa3-385c7ede432e`，本轮不部署Worker、不执行生产迁移。
