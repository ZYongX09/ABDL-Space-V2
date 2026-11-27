import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseDownloadScreenshots, getAdminDownloadScreenshots, getDownloadScreenshots, getScreenshotBlob,
  MAX_SCREENSHOT_BYTES, saveDownloadScreenshot, SCREENSHOT_GROUPS, SCREENSHOT_THEMES, SCREENSHOT_TYPES,
} from './appDownloadScreenshots.js';

const uuid = '00000000-0000-4000-8000-000000000001';
const makeSlots = (image = null) => Object.fromEntries(SCREENSHOT_GROUPS.flatMap(group => SCREENSHOT_THEMES.map(theme => {
  const slot = `${group.id}-${theme.id}`;
  return [slot, { slot, revision: image ? uuid : '0', image: image ? { width: 720, height: 1640, url: `/api/admin/app-clients/download-screenshots/${slot}/${uuid}.webp` } : null }];
})));

test('slot selection follows theme, falls back to the matching feature only, and verifies a revisioned route', () => {
  const slots = makeSlots();
  const communityDark = { url: `/api/app-download/screenshots/community-dark/${uuid}.webp`, width: 720, height: 1640 };
  slots['community-dark'] = { slot: 'community-dark', revision: uuid, image: communityDark };
  slots['rankings-light'] = { slot: 'rankings-light', revision: uuid, image: { ...communityDark, url: `/api/app-download/screenshots/rankings-light/${uuid}.webp` } };
  assert.deepEqual(chooseDownloadScreenshots(slots, 'community', 'light'), [communityDark]);
  assert.deepEqual(chooseDownloadScreenshots(slots, 'community', 'dark'), [communityDark]);
  assert.deepEqual(chooseDownloadScreenshots(slots, 'reading', 'dark'), []);
});

test('manifest rejects duplicates, foreign or malformed URLs, dimensions and response shapes', async t => {
  const cases = [
    { screenshots: [{ slot: 'community-light', revision: uuid, image: { width: 1, height: 2, url: `https://another.example/${uuid}.webp` } }] },
    { screenshots: [{ slot: 'community-light', revision: uuid, image: { width: 8000, height: 16000, url: `/api/app-download/screenshots/community-light/${uuid}.webp` } }] },
    { screenshots: [{ slot: 'community-light', revision: '0', image: { width: 1, height: 2, url: `/api/app-download/screenshots/community-light/${uuid}.webp` } }] },
    { screenshots: [{ slot: 'other-light', revision: '0', image: null }] },
    { screenshots: [...SCREENSHOT_GROUPS.slice(0, 1), ...SCREENSHOT_GROUPS.slice(0, 1)].map(() => ({ slot: 'community-light', revision: '0', image: null })) },
    {}, null,
  ];
  for (const body of cases) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(body));
    await assert.rejects(getDownloadScreenshots(), /截图服务/u);
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, 'fetch', async () => Response.json({ screenshots: [] }));
  assert.deepEqual(await getDownloadScreenshots(), Object.create(null));
  t.mock.restoreAll();
});

test('admin manifest requires all six slots and an image for every published revision', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options?.mode, 'same-origin');
    assert.equal(options?.credentials, 'same-origin');
    return Response.json({ screenshots: Object.values(makeSlots()) });
  });
  assert.equal(Object.keys(await getAdminDownloadScreenshots()).length, 6);
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ screenshots: [] }));
  await assert.rejects(getAdminDownloadScreenshots(), /截图服务/u);
  t.mock.restoreAll();
});

test('selection validates slot, CAS revision, image MIME and size before any network request', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return Response.json({ slot: 'community-light', revision: '0', image: null }); });
  for (const [slot, revision, file] of [
    ['bogus', '0', new Blob(['x'], { type: 'image/png' })],
    ['community-light', 'bad', new Blob(['x'], { type: 'image/png' })],
    ['community-light', '0', new Blob(['x'], { type: 'image/svg+xml' })],
    ['community-light', '0', new Blob([new Uint8Array(MAX_SCREENSHOT_BYTES + 1)], { type: 'image/png' })],
  ]) await assert.rejects(saveDownloadScreenshot(slot, revision, file));
  assert.equal(requests, 0);
  const file = new Blob(['synthetic only'], { type: 'image/png' });
  await saveDownloadScreenshot('community-light', '0', file);
  assert.equal(requests, 1);
  t.mock.restoreAll();
});

test('protected same-origin screenshot path, credentials, no-store and media bounds are enforced', async t => {
  const route = `/api/app-download/screenshots/community-light/${uuid}.webp`;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, route);
    assert.equal(options?.mode, 'same-origin');
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.cache, 'no-store');
    assert.equal(options?.referrerPolicy, 'origin');
    assert.equal(options?.credentials, 'same-origin');
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/webp', 'Content-Length': '3' } });
  });
  const blob = await getScreenshotBlob(route);
  assert.equal(blob.type, 'image/webp');
  assert.equal(blob.size, 3);
  t.mock.restoreAll();
  for (const body of [
    () => new Response('not an image', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response(new Uint8Array(1), { headers: { 'Content-Type': 'image/jpeg' } }),
    () => new Response(new Uint8Array(0), { headers: { 'Content-Type': 'image/webp' } }),
  ]) {
    t.mock.method(globalThis, 'fetch', async () => body());
    await assert.rejects(getScreenshotBlob(route));
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('external URL fetch must not happen'); });
  await assert.rejects(getScreenshotBlob(`https://external.example/${uuid}.webp`));
  t.mock.restoreAll();
  assert.deepEqual(SCREENSHOT_TYPES, ['image/png', 'image/jpeg', 'image/webp']);
});
