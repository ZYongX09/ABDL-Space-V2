import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'vite';
import { transform } from 'esbuild';
const P = 'https://www.newbabyworld.top', B = 'https://nbw.abdlcalendar.top';
const snapshot = revision => ({ schema_version: 1, revision, mode: 'backup', api_origin: B, authorize_origin: B, public_origin: B, media_origin: B, ttl_seconds: 30, remote_mode: 'full' });
const pending = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const options = () => ({ configFile: false, envFile: false, root: new URL('../', import.meta.url).pathname, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, hmr: false }, appType: 'custom', define: { 'import.meta.env.VITE_API_BASE': JSON.stringify('') } });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

async function pageHarness(api, endpoints) {
  const main = existsSync(new URL('../src/pages/HomeV2.jsx', import.meta.url)), pageFile = main ? '../src/pages/HomeV2.jsx' : '../src/pages/ForumFeed.jsx';
  let text = readFileSync(new URL(pageFile, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  text = text.replace(/export default function (HomeV2|ForumFeed)/, 'function Page');
  const code = (await transform(text, { loader: 'jsx', jsxFactory: 'h', jsxFragment: 'fragment', format: 'cjs' })).code;
  let cursor = 0; const values = [], refs = [], effects = [], callbacks = [];
  const runtime = {
    useState(initial) { const key = cursor++; if (!(key in values)) values[key] = typeof initial === 'function' ? initial() : initial; return [values[key], next => { values[key] = typeof next === 'function' ? next(values[key]) : next; }]; },
    useRef(initial) { const key = cursor++; return refs[key] ||= { current: initial }; },
    useEffect(fn, deps) { cursor++; effects.push({ fn, deps }); }, useCallback(fn) { cursor++; callbacks.push(fn); return fn; },
    useAuth: () => ({ user: null }), useNavigate: () => () => {}, useSearchParams: () => [new URLSearchParams()], useFollowStatuses: () => ({ followMap: {}, setFollowing() {} }), useMobileHeaderActions: () => ({ registerActions() {} }),
    useToast: () => ({ error() {} }), useNBWEndpoints: endpoints.getNBWEndpointState, getNBWEndpointState: endpoints.getNBWEndpointState, hasNBWDisplayData: endpoints.hasNBWDisplayData, nbwAcquisitionEpoch: endpoints.nbwAcquisitionEpoch,
    readFeedState: () => null, writeFeedState() {}, forumAPI: api, followsAPI: { statusMany: () => [] }, merchantAPI: {}, h: () => null, fragment: 'fragment',
    PillSelector: 'pill', InlineComposer: 'composer', PostCard: 'post', RightSidebar: 'aside', ThemeToggleBubble: 'theme', LoadingSkeleton: 'loading', EmptyState: 'empty', PullToRefresh: 'pull', PageLayout: 'layout', ImageGrid: 'images', NBWImage: 'img', RichContent: 'rich', OfficialBadge: 'badge', BetaBadge: 'beta', ReportModal: 'report', Link: 'a', buildMediaPreviewUrl: value => value,
  };
  const Page = new Function(...Object.keys(runtime), `${code};return Page;`)(...Object.values(runtime));
  const render = () => { cursor = 0; effects.length = 0; callbacks.length = 0; Page(); };
  render(); const effect = effects.find(effect => effect.deps?.length === 1 && typeof effect.deps[0] === 'string' && effect.deps[0].includes('|'));
  return { values, start: () => effect.fn(), render };
}

test('冷启动detail和实际首页feed：首GET被discovery跨代后整笔重取一次，成功data/page/cache持真实lease', async () => {
  const oldFetch = globalThis.fetch, storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  const server = await createServer(options());
  try {
    const endpoints = await server.ssrLoadModule('/src/utils/nbwEndpoints.js'), { forumAPI } = await server.ssrLoadModule('/src/api.js');
    const first = pending(); let calls = 0;
    globalThis.fetch = async () => { calls++; return calls === 1 ? first.promise : Response.json({ posts: [{ id: 'new-B', images: [`${B}/fresh.png`] }], pagination: {} }); };
    const page = await pageHarness(forumAPI, endpoints); page.start();
    assert.equal(endpoints.getNBWEndpointState().epoch, 0);
    endpoints.adoptNBWEndpoints(snapshot('cold-first'));
    first.resolve(Response.json({ posts: [{ id: 'old-A', images: [`${P}/old.png`] }], pagination: {} }));
    for (let i = 0; i < 40 && !page.values.some(value => Array.isArray(value) && value[0]?.id === 'new-B'); i++) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(calls, 2);
    assert.ok(page.values.some(value => Array.isArray(value) && value[0]?.id === 'new-B'));
    assert.ok(!page.values.some(value => Array.isArray(value) && value[0]?.id === 'old-A'));
    const held = pending(); calls = 0;
    globalThis.fetch = async () => { calls++; return calls === 1 ? held.promise : Response.json({ post: { id: 'detail-B', images: [`${B}/fresh.png`] } }); };
    const detail = forumAPI.getPost('cold-detail'); endpoints.adoptNBWEndpoints(snapshot('detail-new'));
    held.resolve(Response.json({ post: { id: 'detail-old', images: [`${P}/old.png`] } }));
    const result = await detail;
    assert.equal(calls, 2); assert.equal(result.post.id, 'detail-B'); assert.equal(endpoints.nbwAcquisitionEpoch(result), endpoints.getNBWEndpointState().epoch);
  } finally { globalThis.fetch = oldFetch; if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else delete globalThis.localStorage; await server.close(); }
});

test('只读ABA最多重取一次，第二次跨代terminal；POST副作用不自动重发', async () => {
  const oldFetch = globalThis.fetch, storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null } });
  const server = await createServer(options());
  try {
    const endpoints = await server.ssrLoadModule('/src/utils/nbwEndpoints.js'), { forumAPI } = await server.ssrLoadModule('/src/api.js'); endpoints.adoptNBWEndpoints(snapshot('A'));
    let gets = 0, posts = 0;
    globalThis.fetch = async (_url, options) => {
      if (options.method === 'POST') { posts++; endpoints.adoptNBWEndpoints(snapshot('post-switch')); return Response.json({ id: 4 }); }
      gets++; endpoints.adoptNBWEndpoints(snapshot(`changed-${gets}`)); return Response.json({ post: { id: 'old', images: [`${P}/a.png`] } });
    };
    await assert.rejects(forumAPI.getPost('two-changes'), error => error.code === 'NBW_ENDPOINT_CHANGED'); assert.equal(gets, 2);
    await forumAPI.create({ content: 'fixture-only' }); assert.equal(posts, 1);
  } finally { globalThis.fetch = oldFetch; if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else delete globalThis.localStorage; await server.close(); }
});
