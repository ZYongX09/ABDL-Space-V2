import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRelease } from './appDownloadRelease.js';

const apk = 'https://r2.abdl-space.top/apk/app.apk';

test('normalizes release metadata for an official APK', () => {
  assert.deepEqual(normalizeRelease({
    hasUpdate: true, downloadUrl: apk, versionName: ' 3.3.0 ',
    releasedAt: '2026-11-06T18:00:00Z', apkSize: 150 * 1024 ** 2, changelog: ' 更新内容 ',
  }), {
    status: 'ready', downloadUrl: apk, version: '3.3.0',
    date: '2026年11月7日', size: '150 MB', changelog: '更新内容',
  });
});

test('accepts alternate official storage origins without inventing missing metadata', () => {
  for (const url of [
    'https://img.abdl-space.top/file/app.apk',
    'https://abdl-1339643562.cos.ap-shanghai.myqcloud.com/releases/app.apk',
  ]) {
    assert.deepEqual(normalizeRelease({ hasUpdate: true, downloadUrl: url, releasedAt: 'invalid' }), {
      status: 'ready', downloadUrl: url, version: '', date: '', size: '', changelog: '',
    });
  }
});

test('distinguishes an unpublished release from service failures', () => {
  assert.deepEqual(normalizeRelease({ hasUpdate: false, message: '暂无版本信息' }), { status: 'empty' });
  assert.deepEqual(normalizeRelease({ hasUpdate: false }), { status: 'empty' });
  for (const data of [null, {}, { hasUpdate: 'true' }, { hasUpdate: false, message: '版本服务暂不可用' },
    { hasUpdate: false, message: '版本信息格式错误' }]) {
    assert.deepEqual(normalizeRelease(data), { status: 'error' });
  }
});

test('does not render a download target for missing, untrusted, or malformed URLs', () => {
  for (const url of [undefined, '', '/app.apk', 'file:///tmp/app.apk', 'http://r2.abdl-space.top/app.apk',
    'https://r2.abdl-space.top.example.com/app.apk', 'https://r2.abdl-space.top:8000/app.apk',
    'https://another-bucket.cos.ap-shanghai.myqcloud.com/app.apk', 'https://abdl-space.top@localhost/app.apk',
    'https://user@r2.abdl-space.top/app.apk', 'blob:https://r2.abdl-space.top/app.apk', 'https://127.0.0.1/app.apk']) {
    assert.deepEqual(normalizeRelease({ hasUpdate: true, downloadUrl: url }), { status: 'error' });
  }
});
