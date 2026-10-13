import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { merchantFixturePlugin, isLoopback } from './merchant-fixture-plugin.js';
const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('root App merchant 早 return，不重复 Toast 或前台外壳', async () => {
  const app = await source('../src/App.jsx'); const host = await source('../src/merchant/Host.jsx'); const console = await source('../src/merchant/Console.jsx');
  const early = app.match(/if \(isMerchant(?:Route)?\) return [^\n]+/);
  assert.ok(early?.[0].includes('MerchantHost')); assert.ok(app.indexOf(early[0]) < app.indexOf('<MobileHeaderProvider>'));
  for (const name of ['ToastPopup', 'Sidebar', 'MobileHeader', 'MobileBottomNav', 'PageLayout']) assert.equal(host.includes(name), false);
  assert.ok(host.includes('key={key}')); assert.ok(host.includes('api.abortAll')); assert.ok(host.includes('isCurrentSession'));
  assert.equal(console.includes('useToast'), false); assert.equal(console.includes('setInterval'), false); assert.ok(console.includes('controller.abort()'));
});
test('独立 route sections 使用 canonical URL，不把编辑表单塞进概览', async () => {
  const console = await source('../src/merchant/Console.jsx');
  for (const route of ['/merchant', '/merchant/ads', '/merchant/ads/new', '/merchant/ads/:id/edit', '/merchant/reports', '/merchant/company', '/merchant/audit', '/merchant/merchants']) assert.ok(console.includes(`path="${route}"`));
  assert.ok(console.includes('api.cloneAd')); assert.ok(console.includes('api.archiveAd')); assert.ok(console.includes('api.merchantStatus'));
});
test('fixture 明确 mode、无生产插件、无 SW/analytics/proxy，仅 loopback serve', async () => {
  const plugin = merchantFixturePlugin(); const config = plugin.config();
  assert.equal(config.server.host, '127.0.0.1'); assert.equal(config.server.proxy, undefined);
  assert.doesNotThrow(() => plugin.configResolved({ command: 'serve', server: { host: '127.0.0.1' } }));
  assert.throws(() => plugin.configResolved({ command: 'build', server: { host: '127.0.0.1' } }), /禁止/);
  assert.throws(() => plugin.configResolved({ command: 'serve', server: { host: '0.0.0.0' } }), /loopback/);
  assert.throws(() => plugin.configResolved({ command: 'serve', server: { host: '127.0.0.1', proxy: { '/api': {} } } }), /生产代理/);
  assert.equal(isLoopback('192.168.1.1'), false); assert.equal(isLoopback('localhost'), true);
  const html = plugin.transformIndexHtml.handler(); assert.ok(html.includes('/tests/merchant-fixture-entry.jsx')); assert.equal(/analytics|captcha|sw\.js|main\.jsx/.test(html), false);
  const fixture = await source('merchant-fixture-entry.jsx'); assert.ok(fixture.includes("'ordinary', 'super', 'missing', 'error'")); assert.ok(fixture.includes('MerchantConsole')); assert.equal(fixture.includes('AuthProvider'), false);
});
test('后台不含渐变、min-width 与抽屉为独立响应式', async () => {
  const css = await source('../src/merchant/console.css'); const layout = await source('../src/merchant/Layout.jsx');
  assert.equal(css.includes('gradient'), false); assert.ok(css.includes('min-width: 0')); assert.ok(css.includes('mc-drawer-backdrop')); assert.ok(css.includes('minmax(0, 1fr)'));
  assert.ok(layout.includes("event.key === 'Escape'")); assert.ok(layout.includes('aria-expanded={drawer}'));
});
