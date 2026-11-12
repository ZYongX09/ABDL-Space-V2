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

实际Wrangler4.88编译：主站只`/oauth/*`与`/api/*`、移动只`/api/*`，没有`/*`根middleware，Functions源文件分别3/2份逐字保持原main。源与构建产物均无归档Function、_routes或_worker；robots/headers/SW/meta与源匹配。本轮不挪用此前完整guard611/618或381检查点作为声明候选结果。正式robots/meta/header及App公共/账号时间线、预检、管理员鉴权和关联文件只读验收34/34通过；未生产提交OAuth授权/换token，原代理逐字保持且本地既有契约回归通过，不声称真实OAuth完整闭环。

## 部署状态

| 资源 | 正式main提交 | Pages production | 成功时间UTC |
|---|---|---|---|
| 主站 | `81493694f6c9bbb817521d26ad2102008f02f9fc` | `5ad96cf4-9a33-4f19-bd64-ee81ab47ee66` | 2026-11-12 11:08:33.903266 |
| 移动站 | `c701679c54c52eea10ca370fb6a43955f7e04ccb` | `ed052f84-7de5-477c-b9dc-af93e4548d4d` | 2026-11-12 11:09:11.238962 |

两站production deploy成功、canonical对应目标，构建/来源/环境配置hash与发布前相同。声明候选已先合并进develop（主站`47cf40b`、移动`e0bc4aa`），仅main发布声明候选，不squash/force/reset完整develop。完整守卫仍在develop，**不能直接全量develop→main把未授权的逐资源调用方案带上**。

后端保持Worker884/`15f0b5df-3fb4-463e-afa3-385c7ede432e`，活动deployment与发布前完全相同，本轮不部署Worker、不执行生产迁移。

线上34/34：两站首页/深链接/后台HTML/直接index均有meta和响应头noarchive，CSP等安全头保留；robots声明、SW及assetlinks与候选匹配，AppUA公共/个人时间线代理200、管理匿名401、预检204、入口JS可读。自定义域robots存在既有Cloudflare托管Content-Signal/训练爬虫前缀，新文件完整作为尾部保留；部署pages.dev文件与源逐字相同。测试仅核验本站及平台部署地址，未向归档服务发保存请求。

过程如实保留：首次robots逐字断言被既有托管前缀触发；后续CCBot自定义域访问403而部署地址200。独立检查表明ArchiveBot自定义域200，CCBot被既有Cloudflare边缘层拦截；本次未改WAF，不能把边缘403归功于声明层。最终按源声明完整保留、部署字节相等与声明层不主动拦ArchiveBot/PagesCCBot验收通过。

证据：仓外`abdl-space-archive-production-20261112/`，含发布前配置、GraphQL容量、候选路由、部署记录、各轮失败与最终`attempt-3-declarations-smoke-complete.json`。没有全路径Functions增量、套餐升级、WAF/生产fail_open更改或Android改动。
