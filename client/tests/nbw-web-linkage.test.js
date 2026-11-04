import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { transform } from 'esbuild';

const P = 'https://www.newbabyworld.top', B = 'https://nbw.abdlcalendar.top';
const snapshot = (mode = 'backup', revision = 'linkage-1') => ({ schema_version: 1, revision, mode, api_origin: mode === 'primary' ? P : B, authorize_origin: mode === 'primary' ? P : B, public_origin: mode === 'primary' ? P : B, media_origin: mode === 'primary' ? P : B, ttl_seconds: 30, remote_mode: 'full' });
const oldFetch = globalThis.fetch;
const pending = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const options = () => ({ configFile: false, envFile: false, root: new URL('../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
test.afterEach(() => { globalThis.fetch = oldFetch; });

test('真实NBWImage/RichContent SSR：冷启动无NBW出站源、切backup只改render属性不改正文/URI', async () => {
  const server = await createServer(options());
  globalThis.fetch = () => { throw new Error('render不得fetch'); };
  try {
    const { default: Image } = await server.ssrLoadModule('/src/components/NBWImage.jsx');
    const { default: RichContent } = await server.ssrLoadModule('/src/components/RichContent.jsx');
    const endpoints = await server.ssrLoadModule('/src/utils/nbwEndpoints.js');
    const raw = `${P}/forum.php?mod=viewthread&tid=42&sig=a%2Bb#raw`;
    const renderImage = src => renderToStaticMarkup(React.createElement(Image, { src, alt: 'fixture-avatar' }));
    assert.doesNotMatch(renderImage(`${P}/avatar.png`), /src=/);
    assert.match(renderImage('data:image/png;base64,AA'), /src="data:image\/png;base64,AA"/);
    const before = renderToStaticMarkup(React.createElement(RichContent, { text: `原正文 ${raw}` }));
    assert.doesNotMatch(before, /href="https:\/\/www.newbabyworld.top/);
    endpoints.adoptNBWEndpoints(snapshot());
    assert.match(renderImage(`${P}/avatar.png?sig=a%2Bb`), /src="https:\/\/nbw.abdlcalendar.top\/avatar.png\?sig=a%2Bb"/);
    const after = renderToStaticMarkup(React.createElement(RichContent, { text: `原正文 ${raw}` }));
    assert.match(after, /href="https:\/\/nbw.abdlcalendar.top\/forum.php/); assert.match(after, /原正文/); assert.match(after, /newbabyworld.top<\/span>/);
    endpoints.adoptNBWEndpoints(snapshot('primary', 'aba-2'));
    assert.match(renderImage(`${B}/avatar.png`), /src="https:\/\/www.newbabyworld.top\/avatar.png"/);
  } finally { await server.close(); }
});

test('实际API NBW缓存ABA/晚回包拒绝，只NBW typed数据受影响，本站posts缓存保留', async () => {
  const server = await createServer(options()); const calls = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  try {
    const endpoints = await server.ssrLoadModule('/src/utils/nbwEndpoints.js');
    endpoints.adoptNBWEndpoints(snapshot('primary', 'cache-A'));
    const { forumAPI } = await server.ssrLoadModule('/src/api.js');
    const old = pending();
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1) return old.promise;
      return Response.json({ post: { id: 'fixture-remote', content: 'fresh-B', images: [`${B}/image.png`] } });
    };
    const request = forumAPI.getPost('fixture-remote');
    endpoints.adoptNBWEndpoints(snapshot('backup', 'cache-B'));
    old.resolve(Response.json({ post: { id: 'fixture-remote', uri: `${P}/identity/42`, content: 'old-A', images: [`${P}/image.png`] } }));
    const fresh = await request;
    assert.equal(fresh.post.content, 'fresh-B'); assert.equal(calls.length, 2); assert.equal(endpoints.nbwAcquisitionEpoch(fresh), endpoints.getNBWEndpointState().epoch);
    globalThis.fetch = async url => { calls.push({ url }); return Response.json({ post: { id: 'fixture-local', content: 'local only', images: [] } }); };
    const local = await forumAPI.getPost('fixture-local');
    endpoints.adoptNBWEndpoints(snapshot('primary', 'cache-C'));
    assert.deepEqual(await forumAPI.getPost('fixture-local'), local);
    const latest = await forumAPI.getPost('fixture-remote'); assert.equal(latest.post.content, 'local only');
    assert.equal(calls.filter(call => call.url.endsWith('fixture-remote')).length, 3);
  } finally { delete globalThis.localStorage; await server.close(); }
});

test('实际注册API仅透传signed NBW字段，验证码/邮箱/人机证明和普通注册shape保持', async () => {
  const server = await createServer(options()), calls = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return Response.json({ user: { id: 1 } }); };
  try {
    const { authAPI } = await server.ssrLoadModule('/src/api.js');
    const ordinary = { username: 'fixture-person', email: 'fixture@example.invalid', password: 'FixtureOnly123', code: '123456', captchaToken: 'fixture-captcha', inviteCode: 'FIXTURE' };
    await authAPI.register(ordinary);
    assert.deepEqual(JSON.parse(calls[0].options.body), { username: ordinary.username, email: ordinary.email, password: ordinary.password, code: ordinary.code, invite_code: ordinary.inviteCode });
    await authAPI.register({ ...ordinary, nbw_token: 'signed.fixture-bind-token', host: 'evil.invalid', access_token: 'not-upstream-token' });
    assert.deepEqual(JSON.parse(calls[1].options.body), { username: ordinary.username, email: ordinary.email, password: ordinary.password, code: ordinary.code, invite_code: ordinary.inviteCode, nbw_token: 'signed.fixture-bind-token' });
    for (const call of calls) assert.equal(call.options.headers['X-Captcha-Token'], ordinary.captchaToken);
  } finally { delete globalThis.localStorage; await server.close(); }
});

test('敏感OAuth/path/code/token绝不重写host，ExternalLink冷未知禁用且最终open重读当前snapshot', () => {
  for (const path of ['../src/pages/ExternalLink.jsx', '../src/components/RichContent.jsx']) assert.match(source(path), /resolveNBWDisplayURL/);
  const page = source('../src/pages/ExternalLink.jsx');
  assert.match(page, /useNBWEndpoints\(\)/); assert.match(page, /disabled=\{waiting\}/); assert.match(page, /resolveNBWDisplayURL\(sourceURL, getNBWEndpointState\(\).endpoints\)/); assert.match(page, /if \(current\) window.open\(current/);
  assert.match(page, /isNBWSensitiveURL\(sourceURL\)/); assert.match(page, /授权链接不能从公开外链页继续/);
});

test('实际首页导航cache acquisition lease不被点赞重标，A→B→点赞→返回不restore A；本站数据不清', async () => {
  const server = await createServer(options());
  try {
    const endpoints = await server.ssrLoadModule('/src/utils/nbwEndpoints.js'), navigation = await server.ssrLoadModule('/src/utils/navigationState.js');
    endpoints.adoptNBWEndpoints(snapshot('primary', 'nav-A'));
    const acquisition = endpoints.getNBWEndpointState().epoch;
    const remote = { posts: [{ id: 'remote-42', images: [`${P}/old.png`], has_liked: false }], page: 1, hasMore: false };
    assert.equal(navigation.writeFeedState('remote', remote, acquisition), true);
    navigation.writeFeedState('local', { posts: [{ id: 12, content: 'local' }] });
    endpoints.adoptNBWEndpoints(snapshot('backup', 'nav-B'));
    const likedOld = { ...remote, posts: remote.posts.map(post => ({ ...post, has_liked: true })) };
    assert.equal(navigation.writeFeedState('remote', likedOld, acquisition), false);
    assert.equal(navigation.readFeedState('remote'), null); assert.equal(navigation.readFeedState('local').posts[0].id, 12);
    assert.equal(navigation.writeFeedState('remote', likedOld), false);
    const page = source(existsSync(new URL('../src/pages/HomeV2.jsx', import.meta.url)) ? '../src/pages/HomeV2.jsx' : '../src/pages/ForumFeed.jsx');
    assert.match(page, /useNBWEndpoints\(\)/); assert.match(page, /setPosts\(previous => previous.filter\(post => !hasNBWDisplayData\(post\)\)\)/); assert.match(page, /writeFeedState\(feedKey, \{ posts, (?:advertisements, )?page, hasMore \}, acquiredEpoch\)/);
  } finally { await server.close(); }
});

// 可控 hooks 只替代 React runtime/路由和toast；真正执行生产组件的effect/async函数，不改产品函数。
async function registerHarness() {
  const file = new URL('../src/pages/NBWOneClickRegister.jsx', import.meta.url);
  if (!existsSync(file)) return null;
  const code = readFileSync(file, 'utf8').replace(/^import .*;\n/gm, '').replace('export default function NBWOneClickRegister', 'function NBWOneClickRegister');
  const compiled = await transform(code, { loader: 'jsx', jsxFactory: 'createElement', format: 'cjs' });
  let cursor = 0, activeUser = { id: 1, email: 'first@example.invalid' }, endpoint = snapshot(), phase = 1;
  const states = [], refs = [], effects = [], callbacks = [], posts = [], timers = [];
  const hooks = {
    useState(initial) { const key = cursor++; if (!(key in states)) states[key] = typeof initial === 'function' ? initial() : initial; return [states[key], value => { states[key] = typeof value === 'function' ? value(states[key]) : value; }]; },
    useRef(initial) { const key = cursor++; return refs[key] ||= { current: initial }; },
    useEffect(fn, dependencies) { cursor++; effects.push({ fn, dependencies }); },
    useCallback(fn) { cursor++; callbacks.push(fn); return fn; },
  };
  let discovery = Promise.resolve(endpoint), status = Promise.resolve({ registered: true });
  const runtime = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }), PageLayout: 'layout',
    useNavigate: () => () => {}, useAuth: () => ({ user: activeUser }), useToast: () => ({ success() {} }),
    useNBWEndpoints: () => ({ endpoints: endpoint }), NBWError: class extends Error {},
    getNBWEndpointState: () => ({ endpoints: endpoint }), nbwEndpointKey: value => value?.revision || '',
    refreshNBWEndpoints: async () => discovery,
    fetchNBWJSON: async (path, options) => { posts.push({ path, options }); if (path.endsWith('check-register')) return status; if (path.endsWith('get-register-url')) return { code: 200, data: { register_url: `${B}/member.php?mod=register` } }; return {}; },
    registrationNBWURL: value => value,
  };
  const factory = new Function(...Object.keys(hooks), ...Object.keys(runtime), `${compiled.code}; return NBWOneClickRegister;`);
  const Component = factory(...Object.values(hooks), ...Object.values(runtime));
  const render = () => { cursor = 0; effects.length = 0; callbacks.length = 0; const tree = Component(); phase = states.find(value => value === 1 || value === 2 || value === 3) || 1; return tree; };
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  return { posts, states, callbacks, effects, render, flush,
    user: value => { activeUser = value; }, discovery: value => { discovery = value; }, status: value => { status = value; },
    mount() { render(); return effects[0].fn(); }, provision() { return effects.find(effect => effect.dependencies?.length === 2 && effect.dependencies[1] === activeUser.email)?.fn(); },
  };
}

if (existsSync(new URL('../src/pages/NBWOneClickRegister.jsx', import.meta.url))) test('主注册held discovery卸载/换账号后不继续get-register-url；StrictMode只一provision写入', async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'); Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  try {
    for (const change of ['unmount', 'account', 'session']) {
      const harness = await registerHarness(), held = pending(); harness.discovery(held.promise);
      const unmount = harness.mount(); harness.provision();
      if (change === 'unmount') unmount();
      else if (change === 'account') { harness.user({ id: 2, email: 'second@example.invalid' }); harness.render(); }
      else window.dispatchEvent(new Event('auth-session-changing'));
      held.resolve(snapshot()); await harness.flush(); assert.equal(harness.posts.length, 0, change); unmount();
    }
    const harness = await registerHarness(), held = pending(); harness.discovery(held.promise);
    let cleanup = harness.mount(); let stop = harness.provision(); stop(); cleanup();
    cleanup = harness.mount(); harness.provision(); held.resolve(snapshot()); await harness.flush();
    assert.equal(harness.posts.filter(call => call.path.endsWith('get-register-url')).length, 1); cleanup();
  } finally { if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete globalThis.window; }
});

if (existsSync(new URL('../src/pages/NBWOneClickRegister.jsx', import.meta.url))) test('主注册held check状态卸载后无bind-by-email第二副作用', async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window'); Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  try {
    const harness = await registerHarness(), held = pending();
    const cleanup = harness.mount(); harness.provision(); await harness.flush(); harness.render();
    harness.status(held.promise); const check = harness.callbacks[0](); await harness.flush(); cleanup();
    held.resolve({ registered: true }); await check;
    assert.equal(harness.posts.filter(call => call.path.endsWith('check-register')).length, 1);
    assert.equal(harness.posts.filter(call => call.path.endsWith('bind-by-email')).length, 0);
  } finally { if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete globalThis.window; }
});
