import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAvatarPreviewUrl,
  buildMediaPreviewUrl,
  originalMediaUrl,
  withAvatarPreviews,
} from './mediaUrl.js';

const apiOrigin = 'https://api.abdl-space.top';
const cosSource = 'https://abdl-1339643562.cos.ap-shanghai.myqcloud.com/posts/example.jpg';
const imgbedSource = 'https://img.abdl-space.top/file/posts/example image.jpg';
const previewPrefix = `${apiOrigin}/api/v1/media/preview/v3/`;
const avatarPrefix = `${apiOrigin}/api/v1/media/avatar/v3/`;

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
