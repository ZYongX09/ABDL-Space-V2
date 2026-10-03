import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('./App.jsx', import.meta.url), 'utf8');
const terms = readFileSync(new URL('./pages/TermsOfService.jsx', import.meta.url), 'utf8');
const redirects = readFileSync(new URL('../public/_redirects', import.meta.url), 'utf8');
const modal = readFileSync(new URL('./components/PolicyModal.jsx', import.meta.url), 'utf8');

test('policy pages use canonical routes and titles', () => {
  for (const [path, title] of [
    ['/terms', '用户协议 — ABDL Space'],
    ['/privacy', '隐私政策 — ABDL Space'],
    ['/cookies', 'Cookie 政策 — ABDL Space'],
  ]) {
    assert.match(app, new RegExp(`<Route path="${path}"`));
    assert.ok(app.includes(`'${path}': '${title}'`));
  }
  assert.ok(terms.includes('href="/cookies"'));
  assert.ok(!terms.includes('href="/cookie"'));
});

test('registration summaries expose current complete policies', () => {
  assert.ok(modal.includes('2026.10'));
  assert.ok(modal.includes('年满18周岁'));
  assert.ok(modal.includes("'/terms'"));
  assert.ok(modal.includes("'/privacy'"));
  assert.ok(modal.includes('阅读完整'));
  assert.ok(!modal.includes('完整版将在内测正式开放时同步'));
});

test('legacy policy routes redirect before the SPA fallback', () => {
  const fallbackIndex = redirects.indexOf('/*    /index.html   200');
  assert.ok(fallbackIndex > 0);
  for (const rule of [
    '/agreement       /terms      301',
    '/user-agreement  /terms      301',
    '/privacy-policy  /privacy    301',
    '/cookie          /cookies    301',
  ]) {
    const ruleIndex = redirects.indexOf(rule);
    assert.ok(ruleIndex >= 0, `missing redirect: ${rule}`);
    assert.ok(ruleIndex < fallbackIndex, `redirect must precede SPA fallback: ${rule}`);
  }
});
