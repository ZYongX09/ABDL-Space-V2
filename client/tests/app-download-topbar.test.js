import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the download page keeps a minimal sticky top bar', () => {
  const page = read('../src/pages/AppDownload.jsx');
  assert.match(page, /<header className="adl-topbar">/, 'header exists');
  assert.match(page, /className="adl-brand adl-topbar-brand" href="#top"[\s\S]{0,120}<img src="\/app-icon\.png"/, 'icon plus name link');
  assert.match(page, /className="adl-button adl-primary adl-topbar-cta" href="#download"/, 'single download entry');
  const css = read('../src/pages/AppDownload.css');
  assert.match(css, /\.adl-topbar \{[^}]*position: sticky; top: 0;/, 'bar stays visible while scrolling');
  assert.match(css, /\.adl-topbar \{[^}]*backdrop-filter: blur\(14px\);/, 'bar blends with the page');
  assert.match(css, /scroll-margin-top: 76px;/, 'anchors clear the sticky bar');
});

test('the top bar exposes nothing beyond icon, name and download', () => {
  const page = read('../src/pages/AppDownload.jsx');
  const start = page.indexOf('<header className="adl-topbar">');
  const header = page.slice(start, page.indexOf('</header>', start));
  assert.equal((header.match(/<a /g) ?? []).length, 2, 'exactly two links');
  assert.doesNotMatch(header, /功能|界面|使用方式|常见问题|nav/, 'no section navigation');
});
