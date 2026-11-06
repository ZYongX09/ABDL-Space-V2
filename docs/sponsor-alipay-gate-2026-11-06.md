# 支付宝管理门禁候选（主站，2026-11-06，未上线）

基于develop addd991，隔离树ABDL-Space-V2-alipay-gate-20261106／feat/sponsor-alipay-gate-20261106。只在现SponsorAdmin配置与权益tab增加独立AlipayPolicyPanel，复用adminAPI/run/busy/确认/理由/版本CAS和主题，不改全站api.js、Android、原套餐与爱发电管理。

## 行为

独立“允许支付宝新购”默认关；人工merchant_status区分审核中未确认与restricted_allowed已确认受限许可，不伪作支付宝自动审核查询。单笔5000分/上海日100000分硬上限永远不能由管理开关绕过，只能更保守；monthunknown仍关闭，明确人工核实方可limited或unlimited_verified。表单不接收任何密钥。

GET/PUT `/api/admin/sponsors/alipay-policy`使用严格snake_case白名单，PUT仅expected_version/settings/reason；响应可购时reason严格null，不完整或未知enum拒绝。保存须PUT回执及GET重读验证，409/网络结果未知保草稿与理由并阻止重复保存；新版本须人工比较、明确采用CAS基准，不能静默覆盖。账户切换旧响应丢弃，不使用localStorage假保存。

usage以服务器as_of和Asia/Shanghai周期为准，120秒样本超时不再声称当前可购。paid/pending/occupied/remaining无上下文null显示不可获取，不造0；明确统计只属本系统账本，不是支付宝全部应用/站外收款/账户余额。关门只阻新购，不中止原订单通知/查询/履约，不假撤销已签出单。

## 已完成验证

固定基线508项/507pass/1skip，build0；当前新增API/model/真实handlers专项21/21，最终529/529、0fail/skip/cancel、build0，309份源码配置测试/构建前后不变。原跨仓同源测试在独立副本因另端缺失skip，当前工作区实际执行过，不是删测试。源码定点复核没有可确认P1/P2，不是完整安全认证。

首轮移动同源代码lint发现测试/fixture缺Node全局导入，已双站显式import node:timers/setImmediate和node:process，不关规则；移动相同9修改文件lint0、旧7warning零新增。主站无原lint脚本，未杜撰整仓lint通过。两站组件/model/API/CSS/测试/fixture逐字同实现，移动路径为src/。

## 未完成的页面验收

**真实浏览器交互/布局尚未执行。** 主站隔离fixture已成功启动，HTTP200、CSP限制同源，随后停止；当前会话未暴露浏览器控制工具，未截页面或亲自操作。Node测试执行真实无JSX handlers和fetchstub，不替代实际React页面/弹窗/主题验收。

只提交推送功能分支检查点，不合develop/main、不部署。恢复浏览器后先跑下述场景，再验证源码指纹，验收通过才合develop；不启用真实收款、不创建沙箱、不生产迁移0108。

## 恢复验收

在client目录：

```sh
node tests/alipay-policy-fixture-server.js
```

入口http://127.0.0.1:8813/__alipay-policy-fixture，仅本地内存Auth/数据，真实SponsorAdmin＋adminAPI，绝不转发生产。先在入口选scenario/theme并点“准备并打开真实配置页”。一次只启动一站，移动默认8814。

场景：normal、ready、missing-context、daily-exhausted、monthly-exhausted、stale、unknown-reason、missing-api、load-error、invalid-data、save-error、save-unknown、conflict、concurrent-after-save、slow-save、unauthorized、forbidden。验360/1280px、light/dark/colorful，保存重读、2.5秒延迟双击、409草稿、已受理回包失败、保存后并发及切管理员/退出时弹窗无旧响应。无真实支付或设备操作。

完整私有证据~/.local/share/abdl-sponsor-alipay-gate-20261106/，关键web-final2-result.json、pre-browser-source-freeze.json、lint-recheck2/lint-build-comparison.json。沙箱与生产参数配置均不在本候选执行范围。
