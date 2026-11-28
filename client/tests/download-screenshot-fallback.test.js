import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const SLOTS = [
  ['community-light', 'community-light', 720, 1640],
  ['community-dark', 'community-dark', 720, 1563],
  ['rankings-light', 'rankings-light', 720, 1640],
  ['rankings-dark', 'rankings-dark', 720, 1640],
  ['reading-light', 'reading-light', 720, 1640],
  ['reading-dark', 'reading-dark', 720, 1640],
];

test('six bundled screenshots exist as real WebP assets', () => {
  for (const [slot, file, width, height] of SLOTS) {
    const url = new URL(`../src/assets/app-download/${file}.webp`, import.meta.url);
    const bytes = readFileSync(url);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', `${file} RIFF header`);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', `${file} WEBP signature`);
    assert.ok(bytes.byteLength > 10_000, `${file} is a real screenshot`);
    assert.ok(statSync(url).size < 200 * 1024, `${file} stays small enough to bundle`);
    assert.ok(width > 0 && height > 0, slot);
  }
});

test('the fallback map covers every slot and prefers the requested theme', () => {
  const source = read('../src/pages/downloadScreenshotFallback.js');
  for (const [slot] of SLOTS) assert.match(source, new RegExp(`'${slot}': \\{ url: `), slot);
  assert.match(source, /theme === 'light' \? 'light' : 'dark'/);
  assert.match(source, /export function fallbackDownloadScreenshot\(feature, theme\)/);
});

test('the download hook falls back only when the backend has no image', () => {
  const source = read('../src/pages/useDownloadScreenshots.js');
  assert.match(source, /import \{ fallbackDownloadScreenshot \} from '\.\/downloadScreenshotFallback\.js';/);
  for (const feature of ['community', 'rankings', 'reading']) {
    assert.match(source, new RegExp(`withFallback\\('${feature}', ${feature}\\)`), feature);
  }
  assert.match(source, /const withFallback = \(feature, image\) => image \?\? fallbackDownloadScreenshot\(feature, effective\);/);
});

test('the phone frame matches the screenshot exactly without a border box', () => {
  const page = read('../src/pages/AppDownloadShowcase.jsx');
  assert.match(page, /aspectRatio: `\$\{image\.width\} \/ \$\{image\.height\}`/, 'frame ratio comes from the image');
  const css = read('../src/pages/AppDownload.css');
  assert.match(css, /\.adl-phone \{[^}]*box-shadow: 0 0 0 4px #181820/, 'the bezel is drawn outside the layout');
  assert.doesNotMatch(css, /\.adl-phone \{[^}]*border: 4px solid/, 'no border steals frame space from the image');
  assert.match(css, /\.adl-phone img \{[^}]*object-fit: cover;/, 'the screenshot fills the frame exactly');
});
