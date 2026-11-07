import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('admin API exposes the neutral site access endpoints', () => {
  const api = read('src/api.js');
  assert.match(api, /siteAccess: async \(\) => \{[\s\S]*?\/api\/admin\/site-access/);
  assert.match(api, /saveSiteAccess: async \(doc\) => \{[\s\S]*?method: 'PUT'/);
});

test('admin editor is registered and uses neutral wording only', () => {
  const app = read('src/App.jsx');
  const layout = read('src/pages/admin/layout.jsx');
  const page = read('src/pages/admin/siteAccess.jsx');
  assert.match(app, /path="\/admin\/site-access"/);
  assert.match(layout, /label: '站点状态'/);
  assert.match(page, /站点状态/);
  for (const forbidden of ['安全模式', '伪装', '强力模式', '普通模式', 'safety mode']) {
    assert.equal(page.includes(forbidden), false, forbidden);
    assert.equal(read('src/components/SiteUnavailablePage.jsx').includes(forbidden), false, forbidden);
  }
});

test('unavailable page is generic and never names a cause or a setting', () => {
  const page = read('src/components/SiteUnavailablePage.jsx');
  assert.match(page, /网站暂时无法访问/);
  assert.match(page, /503/);
  for (const forbidden of ['安全', '模式', '登录', '管理员', '监管']) {
    assert.equal(page.includes(forbidden), false, forbidden);
  }
});

test('app shell guards closed, registration and sign-in states before rendering content', () => {
  const app = read('src/App.jsx');
  assert.match(app, /isClosedFor\(pathname\)/);
  assert.match(app, /isRegistrationPath\(pathname\)/);
  assert.match(app, /isStaticPage\(pathname\)/);
  assert.match(app, /access\.status === 'login'/);
  assert.ok(app.indexOf('isClosedFor(pathname)') < app.indexOf('<Routes>'));
});
