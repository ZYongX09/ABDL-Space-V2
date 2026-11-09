import assert from 'node:assert/strict';
import test from 'node:test';
import { isMediaBlocked, isTencentHost, isTencentMediaUrl, placeholderForTest, setMediaGuardEnabled } from './mediaGuard.js';

const preview = (source) => `https://api.abdl-space.top/api/v1/media/preview/v3/${Buffer.from(source, 'utf8').toString('base64url')}`;
const avatar = (source) => `https://api.abdl-space.top/api/v1/media/avatar/v3/${Buffer.from(source, 'utf8').toString('base64url')}`;
const COS = 'https://abdl-1339643562.cos.ap-shanghai.myqcloud.com/posts/a.jpg';

test('direct Tencent Cloud hosts are recognised', () => {
  assert.equal(isTencentHost('abdl-1339643562.cos.ap-shanghai.myqcloud.com'), true);
  assert.equal(isTencentHost('myqcloud.com'), true);
  assert.equal(isTencentHost('cos.ap-shanghai.qcloud.com'), true);
  assert.equal(isTencentHost('img.abdl-space.top'), false);
  assert.equal(isTencentHost('notmyqcloud.com'), false);
  assert.equal(isTencentMediaUrl(COS), true);
  assert.equal(isTencentMediaUrl('https://example.cos.myqcloud.com/a.png'), true);
});

test('preview endpoints are inspected through their embedded source', () => {
  assert.equal(isTencentMediaUrl(preview(COS)), true);
  assert.equal(isTencentMediaUrl(avatar(COS)), true);
  assert.equal(isTencentMediaUrl(preview('https://img.abdl-space.top/file/a.png')), false);
  assert.equal(isTencentMediaUrl(avatar('https://cloudflare-imgbed-790.pages.dev/a.png')), false);
  assert.equal(isTencentMediaUrl(preview('not a url')), false);
});

test('own hosts, relative paths and non-http schemes are never blocked', () => {
  for (const value of ['', null, undefined, '/logo.svg', 'https://img.abdl-space.top/a.png', 'https://api.abdl-space.top/api/v1/posts',
    'data:image/svg+xml;base64,AAAA', 'javascript:alert(1)', 'https://abdl-space.top/file.png']) {
    assert.equal(isTencentMediaUrl(value), false, String(value));
  }
});

test('placeholder is an inline image and therefore cannot reach any host', () => {
  assert.match(placeholderForTest(), /^data:image\/svg\+xml/);
});

test('runtime toggle disables the guard while the detection stays pure', () => {
  assert.equal(isMediaBlocked(COS), true);
  setMediaGuardEnabled(false);
  assert.equal(isMediaBlocked(COS), false);
  assert.equal(isTencentMediaUrl(COS), true);
  setMediaGuardEnabled(true);
  assert.equal(isMediaBlocked(COS), true);
});
