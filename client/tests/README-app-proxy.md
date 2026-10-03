# App 请求代理回归

`node --test tests/app-proxy.test.js` 在本地模拟用户提供的 `main-cdn` 请求头转发代码，并执行实际部署来源 `client/functions/api/[[path]].js`。

验证范围：

- `MastodonAndroid` User-Agent、`X-App-Version-Code`、Bearer 和 `X-Real-Client-IP` 在两层转发后保持原值。
- 未上报版本号的原生客户端仍保留原生 User-Agent；网页请求不会被代理补成 App 请求。
- 后端的 `Cache-Control: private, no-store`、`Vary` 与无分页 `Link` 的更新提示响应原样传回。

测试不运行真实 Cloudflare 链路，不代表已检查线上 Cache Rules 或路由绑定。用户提供的 `main-cdn` 代码无显式缓存操作，现有 Pages 代理也无 `caches.default` 读写；仍应确认线上没有覆盖 App 时间线 `private, no-store` 的“缓存所有内容”等规则。

本次不改 `main-cdn`，不改网页请求身份，也不新增设备标识。后端负责识别 App、按已登录账号统计和版本废弃策略；代理只透明转发。
