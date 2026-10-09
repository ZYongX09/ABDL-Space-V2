import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMediaPreviewUrl } from './mediaUrl.js';

const apiOrigin = 'https://api.abdl-space.top';
const cosSource = 'https://abdl-1339643562.cos.ap-shanghai.myqcloud.com/posts/example.jpg';
const cosThumbnail = `${cosSource}?imageMogr2/thumbnail/720x720>/format/webp/quality/80`;

test('COS 对象改走源站图片处理缩略图', () => {
  assert.equal(buildMediaPreviewUrl(cosSource), cosThumbnail);
});

test('GIF 与已带查询串的 COS 对象保持原样', () => {
  const gif = 'https://abdl-1339643562.cos.ap-shanghai.myqcloud.com/posts/anim.GIF';
  assert.equal(buildMediaPreviewUrl(gif), gif);
  const signed = `${cosSource}?sign=abc`;
  assert.equal(buildMediaPreviewUrl(signed), signed);
});

test('非 https 的 COS 对象不改写', () => {
  const insecure = 'http://abdl-1339643562.cos.ap-shanghai.myqcloud.com/posts/example.jpg';
  assert.equal(buildMediaPreviewUrl(insecure), insecure);
});

test('可信图床仍走后端预览端点', () => {
  const source = 'https://img.abdl-space.top/file/posts/example image.jpg';
  const preview = buildMediaPreviewUrl(source);
  assert.ok(preview.startsWith(`${apiOrigin}/api/v1/media/preview/v3/`));
  assert.notEqual(preview, source);
});

test('未知来源与空值原样返回', () => {
  assert.equal(buildMediaPreviewUrl('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  assert.equal(buildMediaPreviewUrl(''), '');
  assert.equal(buildMediaPreviewUrl(undefined), undefined);
});
