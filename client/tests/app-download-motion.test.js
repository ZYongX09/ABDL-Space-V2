import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { adjacentGalleryId, featureAtReadingLine, galleryEdges, heroIntroVisible, nextGalleryOffset, watchHeroImages } from '../src/pages/appDownloadPresentation.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const decoded = { complete: true, naturalWidth: 720, decode: async () => {} };

test('the hero intro waits for decoded images and never blocks on a failure', async () => {
  let settleLate;
  let finished = false;
  const late = { ...decoded, decode: () => new Promise(resolve => { settleLate = resolve; }) };
  const pending = watchHeroImages([decoded, late, { complete: true, naturalWidth: 0 }]).then(result => { finished = true; return result; });
  await Promise.resolve();
  assert.equal(finished, false, 'still waiting for the slow image');
  settleLate();
  assert.deepEqual(await pending, [true, true, false], 'broken image is excluded, not fatal');
});

test('a stalled image is dropped at the deadline and cancellation returns nothing', async () => {
  const stalled = { ...decoded, decode: () => new Promise(() => {}) };
  assert.deepEqual(await watchHeroImages([decoded, stalled], { timeout: 0 }), [true, false]);
  const controller = new AbortController();
  const pending = watchHeroImages([decoded], { signal: controller.signal });
  controller.abort();
  assert.deepEqual(await pending, []);
  assert.deepEqual(await watchHeroImages([]), []);
});

test('the intro only runs at the top of a visible, motion-enabled page', () => {
  const base = { reduced: false, hidden: false, hash: '', top: 480, bottom: 780, headerBottom: 61, viewportHeight: 820 };
  assert.equal(heroIntroVisible(base), true);
  assert.equal(heroIntroVisible({ ...base, hash: '#top' }), true);
  for (const override of [{ reduced: true }, { hidden: true }, { hash: '#features' }, { top: 820 }, { bottom: 61 }]) {
    assert.equal(heroIntroVisible({ ...base, ...override }), false, JSON.stringify(override));
  }
});

test('the active chapter follows the reading line below the fixed bar', () => {
  assert.equal(featureAtReadingLine([120, 480, 840], 61, 800), 0);
  assert.equal(featureAtReadingLine([-300, 40, 480], 61, 800), 1);
  assert.equal(featureAtReadingLine([-800, -260, 120], 61, 800), 2);
  assert.equal(featureAtReadingLine([], 61, 800), 0);
});

test('gallery controls appear only for real overflow and move one card at a time', () => {
  assert.deepEqual(galleryEdges(0, 780, 780), { maximum: 0, overflow: false, start: true, end: true });
  assert.equal(galleryEdges(0, 320, 760).overflow, true);
  assert.equal(galleryEdges(0, 320, 760).end, false);
  assert.equal(galleryEdges(438, 320, 760).end, true);
  assert.equal(nextGalleryOffset([0, 216, 432], 0, 440, 1), 216);
  assert.equal(nextGalleryOffset([0, 216, 432], 216, 440, 1), 432);
  assert.equal(nextGalleryOffset([0, 216, 432], 432, 440, 1), 440);
  assert.equal(nextGalleryOffset([0, 216, 432], 440, 440, -1), 432);
  assert.equal(nextGalleryOffset([0, 216, 432], 0, 440, -1), 0);
});

test('keyboard stepping wraps and stays put without multiple images', () => {
  assert.equal(adjacentGalleryId(['a', 'b', 'c'], 'a', -1), 'c');
  assert.equal(adjacentGalleryId(['a', 'b', 'c'], 'c', 1), 'a');
  assert.equal(adjacentGalleryId(['a'], 'a', 1), 'a');
  assert.equal(adjacentGalleryId([], null, 1), null);
});

test('the real page wires the hero intro, chapter tracking and gallery controls', () => {
  const page = read('../src/pages/AppDownload.jsx');
  const showcase = read('../src/pages/AppDownloadShowcase.jsx');
  assert.match(page, /import \{ FeatureShowcase, HeroScreenshots, Icon, ScreenshotGallery \} from '\.\/AppDownloadShowcase\.jsx';/);
  assert.match(page, /const header = useRef\(null\);/, 'one header ref drives offsets');
  assert.match(page, /<HeroScreenshots features=\{FEATURES\} images=\{images\} header=\{header\} \/>/);
  assert.match(page, /<FeatureShowcase features=\{FEATURES\} images=\{images\} header=\{header\} \/>/);
  assert.match(page, /<ScreenshotGallery features=\{FEATURES\} images=\{images\} \/>/);
  assert.match(page, /className="adl-hero-badge"/, 'hero positioning line');
  assert.match(showcase, /watchHeroImages\(photos/, 'intro waits for the rendered screenshots');
  assert.match(showcase, /featureAtReadingLine\(/, 'chapters follow the reading line');
  assert.match(showcase, /galleryEdges\(/, 'gallery controls derive from overflow');
  assert.match(showcase, /onKeyDown=\{onDialogKey\}/, 'arrow keys change the enlarged screenshot');
});

test('the layout keeps the fixed bar, uncropped phones and a reduced-motion fallback', () => {
  const css = read('../src/pages/AppDownload.css');
  assert.match(css, /\.adl-topbar \{[^}]*position: fixed;/, 'bar stays at the viewport top');
  assert.match(css, /\.adl-phone img \{[^}]*object-fit: cover;/, 'shared frame fills exactly');
  assert.match(css, /\.adl-gallery-card \.adl-phone img[^}]*object-fit: contain;/, 'gallery never crops the screenshot');
  assert.match(css, /@media \(max-width: 760px\), \(max-height: 639px\)/, 'short or narrow windows drop the sticky preview');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/, 'static fallback exists');
  assert.match(css, /\.adl-access-list li::before/, 'usage cards use a real checklist');
});
