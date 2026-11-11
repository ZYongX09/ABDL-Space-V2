import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

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

test('bootstrap always syncs before render and App has no passive media policy', () => {
  const main = read('src/main.jsx');
  assert.ok(main.indexOf('syncSiteMediaAccess(null)') < main.indexOf('ReactDOM.createRoot'));
  assert.doesNotMatch(main, /isAdminPage|installMediaGuard/);
  assert.doesNotMatch(read('src/App.jsx'), /setMediaGuardEnabled/);
});

test('user setter syncs normalized policy before commit and functional updates use latest ref', () => {
  const auth = read('src/contexts/AuthContext.jsx');
  const body = /const setUser = useCallback\(\(next\) => \{([\s\S]*?)\n  \}, \[\]\);/.exec(auth)?.[1];
  assert.ok(body);
  const events = [];
  const context = { userRef: { current: null }, buildAvatarPreviewUrl: value => `preview:${value}`, syncSiteMediaAccess: value => events.push(['policy', value]), setRawUser: value => events.push(['commit', value]) };
  const set = next => runInNewContext(`((next) => {${body}})(next)`, { ...context, next });
  set({ id: 1, avatar: 'cos', baby_verified: true });
  set(previous => ({ ...previous, baby_verified: false }));
  assert.deepEqual(events.map(event => event[0]), ['policy', 'commit', 'policy', 'commit']);
  assert.equal(events[0][1].avatar, 'preview:cos');
  assert.equal(events[2][1].id, 1);
  assert.equal(events[2][1].baby_verified, false);
  assert.strictEqual(events[2][1], events[3][1]);
  const changing = /function notifySessionChanging\(\) \{([\s\S]*?)\n\}/.exec(auth)[1];
  assert.ok(changing.indexOf('syncSiteMediaAccess(null)') < changing.indexOf('window.dispatchEvent'));
});

test('restricted session hydration runs once and periodic refresh ignores replaced sessions', () => {
  const auth = read('src/contexts/AuthContext.jsx');
  const body = /const mediaSessionKey = [^\n]+;\n  useEffect\(\(\) => \{([\s\S]*?)\n  \}, \[mediaSessionKey, loading, refreshUser\]\);/.exec(auth)?.[1];
  assert.ok(body);
  let calls = 0, interval, visible, cleared = 0, status = 'login';
  const context = { USE_API: true, loading: false, user: { id: 1 }, userRef: { current: { id: 1 } }, sessionChangingRef: { current: false }, sessionVersionRef: { current: 1 }, currentSession: { current: 'session-A' }, hydrationSessionRef: { current: null }, mediaSessionKey: 'A', refreshUser: () => { calls++; }, getSiteAccess: () => ({ status }), window: { setInterval: (callback, delay) => { assert.equal(delay, 60_000); interval = callback; return 7; }, clearInterval: () => { cleared++; } }, document: { visibilityState: 'visible', addEventListener: (_event, callback) => { visible = callback; }, removeEventListener() {} } };
  const setup = () => runInNewContext(`(() => {${body}})()`, context);
  const cleanup = setup();
  assert.equal(calls, 1);
  cleanup(); setup();
  assert.equal(calls, 1, 'StrictMode/re-render does not loop hydration');
  interval(); visible();
  assert.equal(calls, 3);
  context.sessionVersionRef.current++;
  interval(); visible();
  assert.equal(calls, 3, 'old callbacks cannot refresh a new session');
  status = 'ok';
  assert.equal(setup(), undefined);
  assert.equal(cleared, 1);
});

test('download control is closed-only, accessible and preserves its saved boolean', () => {
  const page = read('src/pages/admin/siteAccess.jsx');
  assert.match(page, /form\.web_mode === 'closed' && <label/);
  assert.match(page, /aria-label="下载 App 开关"/);
  assert.match(page, /仅额外放行 \/app 下载页/);
  assert.match(page, /option\.value === 'closed' && form\.app_download_open/);
  assert.match(page, /onChange=\{\(\) => patch\('web_mode', option\.value\)\}/);
  assert.match(page, /app_download_open: form\.app_download_open === true/);
});
