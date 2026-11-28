import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the download page fixes the minimal top bar to the viewport', () => {
  const page = read('../src/pages/AppDownload.jsx');
  assert.match(page, /<header className="adl-topbar"(?: ref=\{header\})?>/, 'header exists');
  assert.match(page, /className="adl-brand adl-topbar-brand" href="#top"[\s\S]{0,120}<img src="\/app-icon\.png"/, 'icon plus name link');
  assert.match(page, /className="adl-button adl-primary adl-topbar-cta" href="#download"/, 'single download entry');
  const css = read('../src/pages/AppDownload.css');
  const header = /\.adl-topbar \{([^}]+)\}/.exec(css)?.[1];
  assert.match(header, /position: fixed;\s*inset: 0 0 auto;/, 'bar stays pinned to the viewport');
  assert.match(header, /height: var\(--adl-topbar-height\);/, 'bar height includes the top safe area');
  assert.match(header, /padding-top: env\(safe-area-inset-top, 0px\);/, 'brand and button clear the safe area');
  assert.match(css, /\.app-landing \{[^}]*padding-top: var\(--adl-topbar-height\);/, 'the first screen reserves the header height');
  assert.match(css, /scroll-margin-top: calc\(var\(--adl-topbar-height\) \+ 15px\);/, 'anchors clear the fixed bar');
  assert.match(css, /\.adl-feature-stage \{[^}]*inset-block-start: calc\(var\(--adl-topbar-height\) \+ 24px\);/, 'the sticky feature preview stays below the bar');
});

test('the top bar exposes nothing beyond icon, name and download', () => {
  const page = read('../src/pages/AppDownload.jsx');
  const start = page.indexOf('<header className="adl-topbar"');
  const header = page.slice(start, page.indexOf('</header>', start));
  assert.equal((header.match(/<a /g) ?? []).length, 2, 'exactly two links');
  assert.doesNotMatch(header, /功能|界面|使用方式|常见问题|nav/, 'no section navigation');
});
