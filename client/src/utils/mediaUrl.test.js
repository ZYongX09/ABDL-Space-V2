import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  buildAvatarPreviewUrl,
  buildMediaPreviewUrl,
  originalMediaUrl,
  firstPartyMediaPreviewUrl,
  isFirstPartyMediaPreview,
  withAvatarPreviews,
} from './mediaUrl.js';

const apiOrigin = '';
const cosSource = 'https://abdl-1339643562.cos.ap-shanghai.myqcloud.com/posts/example.jpg';
const imgbedSource = 'https://img.abdl-space.top/file/posts/example image.jpg';
const previewPrefix = `${apiOrigin}/api/v1/media/preview/v3/`;
const avatarPrefix = `${apiOrigin}/api/v1/media/avatar/v3/`;

test('仅精确自有 API 的 v3 预览转同源代理，Cookie 不放 URL、拒绝端口/凭据/后缀域名', () => {
  const path = '/api/v1/media/preview/v3/c2FmZQ';
  assert.equal(firstPartyMediaPreviewUrl(`https://api.abdl-space.top${path}`), path);
  assert.equal(firstPartyMediaPreviewUrl(`https://abdl-space-api.zhx589.workers.dev${path}`), path);
  assert.equal(withAvatarPreviews({ preview_url: `https://api.abdl-space.top${path}` }).preview_url, path);
  const immutable = { body: `https://api.abdl-space.top${path}`, avatar_url: `https://api.abdl-space.top${path}`, source: `https://api.abdl-space.top${path}` };
  assert.deepEqual(withAvatarPreviews(immutable), immutable, 'post text and editable/source fields must not be rewritten');
  for (const url of [`https://api.abdl-space.top:8443${path}`, `https://user:pass@api.abdl-space.top${path}`, `https://api.abdl-space.top.evil.test${path}`, `https://evil.test${path}`, `https://api.abdl-space.top${path}?token=private`, `https://api.abdl-space.top/api/auth/me`, `https://api.abdl-space.top/api/v1/media/preview/v2/c2FmZQ`]) assert.equal(firstPartyMediaPreviewUrl(url), url);
});

test('真实 ImageItem onError 不把受保护 v3 失败回退公开原图，外国图片保留原行为', () => {
  const source = readFileSync(new URL('../components/ImageGrid.jsx', import.meta.url), 'utf8');
  const handler = /const handleError = useCallback\(\(\) => \{([\s\S]*?)\}, \[fallbackUrl, src\]\);/.exec(source)?.[1];
  assert.ok(handler, 'exercise actual production error callback, not a replacement test UI');
  const original = 'https://img.abdl-space.top/file/source.jpg';
  for (const src of ['/api/v1/media/preview/v3/c2FmZQ', 'https://api.abdl-space.top/api/v1/media/avatar/v3/c2FmZQ']) {
    const writes = [], errors = [];
    runInNewContext(`(() => { ${handler} })()`, { fallbackUrl: original, src, isFirstPartyMediaPreview, setSrc: value => writes.push(value), setError: value => errors.push(value) });
    assert.deepEqual(writes, []); assert.deepEqual(errors, [true]);
  }
  const writes = [];
  runInNewContext(`(() => { ${handler} })()`, { fallbackUrl: original, src: 'https://foreign.test/preview.jpg', isFirstPartyMediaPreview, setSrc: value => writes.push(value), setError() { assert.fail('foreign fallback must stay'); } });
  assert.deepEqual(writes, [original]); assert.match(source, /aria-label="图片暂时无法显示"/);
});

test('COS 对象改走后端预览端点，不再直连原图', () => {
  const preview = buildMediaPreviewUrl(cosSource);
  assert.ok(preview.startsWith(previewPrefix));
  assert.notEqual(preview, cosSource);
  // 不含腾讯云源站图片处理参数（按次计费）
  assert.ok(!preview.includes('imageMogr2'));
});

test('可信图床与 COS 走同一套预览端点，未知来源与空值原样返回', () => {
  assert.ok(buildMediaPreviewUrl(imgbedSource).startsWith(previewPrefix));
  assert.equal(buildMediaPreviewUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  assert.equal(buildMediaPreviewUrl('https://other-bucket.cos.ap-shanghai.myqcloud.com/a.jpg'), 'https://other-bucket.cos.ap-shanghai.myqcloud.com/a.jpg');
  assert.equal(buildMediaPreviewUrl(''), '');
  assert.equal(buildMediaPreviewUrl(undefined), undefined);
});

test('头像走独立的 160px 预览路径', () => {
  const avatar = buildAvatarPreviewUrl(imgbedSource);
  assert.ok(avatar.startsWith(avatarPrefix));
  assert.equal(buildAvatarPreviewUrl('https://cdn.example.com/a.png'), 'https://cdn.example.com/a.png');
  assert.equal(buildAvatarPreviewUrl(''), '');
});

test('缩略图地址重复改写是幂等的', () => {
  const preview = buildMediaPreviewUrl(cosSource);
  assert.equal(buildMediaPreviewUrl(preview), preview);
  const avatar = buildAvatarPreviewUrl(cosSource);
  assert.equal(buildAvatarPreviewUrl(avatar), avatar);
});

test('originalMediaUrl 还原原始地址，供提交后端的字段使用', () => {
  assert.equal(originalMediaUrl(buildMediaPreviewUrl(imgbedSource)), imgbedSource);
  assert.equal(originalMediaUrl(buildAvatarPreviewUrl(cosSource)), cosSource);
  // 非缩略图地址原样返回
  assert.equal(originalMediaUrl(imgbedSource), imgbedSource);
  assert.equal(originalMediaUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  assert.equal(originalMediaUrl(null), null);
});

test('withAvatarPreviews 递归改写头像字段且不动其他字段', () => {
  const payload = {
    id: 1,
    avatar: imgbedSource,
    avatar_url: 'https://cdn.example.com/editable.png',
    user: { avatar: cosSource, avatar_static: cosSource, username: 'a' },
    items: [{ avatar: null }, { avatar: imgbedSource }],
  };
  const result = withAvatarPreviews(payload);

  assert.equal(result.avatar, buildAvatarPreviewUrl(imgbedSource));
  assert.equal(result.user.avatar, buildAvatarPreviewUrl(cosSource));
  assert.equal(result.user.avatar_static, buildAvatarPreviewUrl(cosSource));
  assert.equal(result.items[1].avatar, buildAvatarPreviewUrl(imgbedSource));
  assert.equal(result.items[0].avatar, null);
  // 可编辑字段与原始对象都不受影响
  assert.equal(result.avatar_url, 'https://cdn.example.com/editable.png');
  assert.equal(payload.avatar, imgbedSource);
  assert.equal(result.user.username, 'a');
});
