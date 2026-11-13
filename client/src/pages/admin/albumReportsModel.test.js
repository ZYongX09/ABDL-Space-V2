import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGE_SIZE,
  VIOLATION_PLACEHOLDER,
  normalizeStatus,
  paginationState,
  normalizeReport,
  normalizePhoto,
  normalizePhotos,
  safePreviewUrl,
  photoDisplayUrl,
  newOperationId,
  desiredBlockedIds,
  diffBlockedState,
} from './albumReportsModel.js';

test('status 归一化只接受 open/resolved/all，未知回退 open', () => {
  assert.equal(normalizeStatus('open'), 'open');
  assert.equal(normalizeStatus('resolved'), 'resolved');
  assert.equal(normalizeStatus('all'), 'all');
  assert.equal(normalizeStatus('pending'), 'open');
  assert.equal(normalizeStatus(''), 'open');
  assert.equal(normalizeStatus(undefined), 'open');
});

test('分页由 offset/limit 契约推导，页码夹取有效范围', () => {
  assert.equal(paginationState(0, 1).totalPages, 1);
  const first = paginationState(95, 1);
  assert.equal(first.offset, 0);
  assert.equal(first.totalPages, Math.ceil(95 / PAGE_SIZE));
  const mid = paginationState(95, 4);
  assert.equal(mid.offset, (4 - 1) * PAGE_SIZE);
  assert.equal(mid.page, 4);
  assert.equal(paginationState(95, 99).page, paginationState(95, 99).totalPages);
  assert.equal(paginationState(95, 0).page, 1);
  assert.equal(paginationState(-5, 2).total, 0);
  assert.equal(paginationState('abc', 2).total, 0);
  assert.equal(paginationState(40, 3).offset, (2 - 1) * PAGE_SIZE, '页码夹取后按实际页计算 offset');
  assert.equal(paginationState(60, 3).offset, (3 - 1) * PAGE_SIZE);
});

test('报告归一化剥离未知字段，download_protected 仅接受布尔语义', () => {
  const report = normalizeReport({
    id: 'r1', album_id: 77, album_name: '夏季相册', owner_id: 9, reporter_id: '12',
    reason: '违规内容', detail: '包含侵权图片', created_at: '2026-10-01 10:00:00',
    resolved_at: null, status: 'open', blocked_photo_count: 2, album_photo_count: 8,
    download_protected: 1,
    // 契约外字段必须被丢弃，避免未来服务端误加直链后进入渲染层
    hd_url: 'https://cdn.example.com/hd/1', original_url: 'https://cdn.example.com/o/1', secret: 'x',
  });
  assert.equal(report.id, 'r1');
  assert.equal(report.album_id, '77');
  assert.equal(report.owner_id, '9');
  assert.equal(report.reporter_id, '12');
  assert.equal(report.status, 'open');
  assert.equal(report.download_protected, true);
  assert.equal(report.blocked_photo_count, 2);
  assert.equal(report.album_photo_count, 8);
  assert.equal('hd_url' in report, false);
  assert.equal('original_url' in report, false);
  assert.equal('secret' in report, false);
  assert.equal(normalizeReport(null), null);
  assert.equal(normalizeReport({ status: 'resolved' }).status, 'resolved');
  assert.equal(normalizeReport({}).download_protected, false);
  assert.equal(normalizeReport({ blocked_photo_count: -3 }).blocked_photo_count, 0);
});

test('safePreviewUrl 只放行站内相对路径与 http(s)，拒绝 data:/javascript:/blob:', () => {
  assert.equal(safePreviewUrl('/previews/abc.jpg'), '/previews/abc.jpg');
  assert.equal(safePreviewUrl('https://cdn.example.com/p/1.jpg'), 'https://cdn.example.com/p/1.jpg');
  assert.equal(safePreviewUrl('HTTP://cdn.example.com/p/1.jpg'), 'HTTP://cdn.example.com/p/1.jpg');
  for (const bad of ['data:image/png;base64,AAAA', 'javascript:alert(1)', 'blob:https://x/y', '//evil.example/x', 'ftp://x/y', '', null, 42]) {
    assert.equal(safePreviewUrl(bad), null, `应拒绝 ${String(bad)}`);
  }
});

test('照片归一化丢弃 hd/original 字段；屏蔽照片 preview 强制为空并回退本地占位图', () => {
  const photo = normalizePhoto({
    id: 'p1', admin_blocked: 1, preview_url: null, width: 800, height: 600, description: '沙滩',
    hd_url: 'https://cdn.example.com/hd/1', original_url: '/original/1', signed_hd: 'zzz',
  });
  assert.equal(photo.admin_blocked, true);
  assert.equal(photo.preview_url, null);
  assert.equal(photo.width, 800);
  assert.equal(photo.height, 600);
  assert.equal('hd_url' in photo, false);
  assert.equal('original_url' in photo, false);
  assert.equal('signed_hd' in photo, false);
  assert.equal(photoDisplayUrl(photo), VIOLATION_PLACEHOLDER);

  const open = normalizePhoto({ id: 'p2', admin_blocked: false, preview_url: 'https://cdn.example.com/p/2.jpg', width: 100, height: 50 });
  assert.equal(photoDisplayUrl(open), 'https://cdn.example.com/p/2.jpg');

  // 未屏蔽但预览地址非法（如误发原图地址之外的奇怪协议）也不渲染
  const weird = normalizePhoto({ id: 'p3', admin_blocked: false, preview_url: 'data:text/html,x' });
  assert.equal(weird.preview_url, null);
  assert.equal(photoDisplayUrl(weird), VIOLATION_PLACEHOLDER);

  assert.equal(normalizePhoto(null), null);
  assert.equal(normalizePhoto({ admin_blocked: true }), null, '缺少 id 的照片整条丢弃');
  assert.deepEqual(normalizePhotos('nope'), []);
  const dedup = normalizePhotos([
    { id: 'a', admin_blocked: false, preview_url: '/a.jpg' },
    { id: 'a', admin_blocked: false, preview_url: '/a.jpg' },
    { id: 'b', admin_blocked: true },
  ]);
  assert.deepEqual(dedup.map(p => p.id), ['a', 'b']);
});

test('operation_id 为 UUID v4 形态且逐次不同；无 crypto 环境仍可生成', () => {
  const a = newOperationId();
  const b = newOperationId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
  const fallback = newOperationId({});
  assert.match(fallback, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('批量屏蔽为全量期望状态：勾选即屏蔽、取消即解除，同端点幂等', () => {
  const photos = [
    { id: 'p1', admin_blocked: true },
    { id: 'p2', admin_blocked: false },
    { id: 'p3', admin_blocked: true },
    { id: 'p4', admin_blocked: false },
  ];
  // 无覆盖时 = 服务器当前状态
  assert.deepEqual(desiredBlockedIds(photos), ['p1', 'p3']);
  // 勾选 p2、p4：全量集合包含已屏蔽 + 新勾选
  assert.deepEqual(desiredBlockedIds(photos, { p2: true, p4: true }), ['p1', 'p2', 'p3', 'p4']);
  // 取消 p1：解除 = 全量集合中排除 p1
  assert.deepEqual(desiredBlockedIds(photos, { p1: false }), ['p3']);
  assert.deepEqual(desiredBlockedIds([], {}), []);
});

test('diffBlockedState 给出屏蔽/解除增量并判断是否有待应用变更', () => {
  const photos = [
    { id: 'p1', admin_blocked: true },
    { id: 'p2', admin_blocked: false },
    { id: 'p3', admin_blocked: true },
  ];
  assert.deepEqual(diffBlockedState(photos), { toBlock: [], toUnblock: [], hasChanges: false });
  assert.deepEqual(diffBlockedState(photos, { p2: true, p3: false }), { toBlock: ['p2'], toUnblock: ['p3'], hasChanges: true });
  assert.deepEqual(diffBlockedState([], { p9: true }), { toBlock: [], toUnblock: [], hasChanges: false });
  assert.equal(diffBlockedState(photos, { p2: true }).hasChanges, true);
});

test('全选/全取消覆盖完整照片清单，保存全量状态而非只提交增量', () => {
  const photos = normalizePhotos(Array.from({ length: 65 }, (_, index) => ({
    id: `photo-${index}`, admin_blocked: index % 2 === 0, preview_url: `/preview/${index}`,
  })));
  const allBlocked = Object.fromEntries(photos.map(photo => [photo.id, true]));
  const noneBlocked = Object.fromEntries(photos.map(photo => [photo.id, false]));
  assert.deepEqual(desiredBlockedIds(photos, allBlocked), photos.map(photo => photo.id));
  assert.equal(desiredBlockedIds(photos, allBlocked).length, 65, '不可按可见缩略图数量截断提交');
  assert.deepEqual(desiredBlockedIds(photos, noneBlocked), [], '空数组代表全部解除，不是没有操作');
  assert.equal(diffBlockedState(photos, allBlocked).toBlock.length, 32);
  assert.equal(diffBlockedState(photos, noneBlocked).toUnblock.length, 33);
  assert.equal(desiredBlockedIds(photos, { 'photo-1': true, 'not-in-report': true }).includes('not-in-report'), false);
});

test('屏蔽状态往返以服务器读回为准，解除选择不能在保存前暴露已屏蔽预览', () => {
  const initial = normalizePhotos([
    { id: 'one', admin_blocked: true, preview_url: 'https://example.invalid/blocked-preview', original_url: '/original' },
    { id: 'two', admin_blocked: false, preview_url: '/preview/two', hd_url: '/hd' },
    { id: 'three', admin_blocked: false, preview_url: '/preview/three' },
  ]);
  const overrides = { one: false, two: true };
  const desired = desiredBlockedIds(initial, overrides);
  assert.deepEqual(desired, ['two']);
  assert.equal(photoDisplayUrl(initial[0]), VIOLATION_PLACEHOLDER, '尚未保存的解除覆盖不改变当前服务器屏蔽态');
  const readback = normalizePhotos(initial.map(photo => ({ ...photo, admin_blocked: desired.includes(photo.id), preview_url: `/fresh-preview/${photo.id}` })));
  assert.deepEqual(desiredBlockedIds(readback), ['two']);
  assert.deepEqual(diffBlockedState(readback, {}), { toBlock: [], toUnblock: [], hasChanges: false });
  assert.equal(photoDisplayUrl(readback[1]), VIOLATION_PLACEHOLDER);
  assert.equal(photoDisplayUrl(readback[0]), '/fresh-preview/one');
  for (const photo of readback) {
    assert.equal('original_url' in photo, false);
    assert.equal('hd_url' in photo, false);
  }
});

test('operation UUID 优先调用浏览器 randomUUID，getRandomValues 回退正确设置版本和变体', () => {
  const expected = '12345678-1234-4123-8123-123456789abc';
  let uuidCalls = 0;
  assert.equal(newOperationId({ randomUUID() { uuidCalls++; return expected; } }), expected);
  assert.equal(uuidCalls, 1);
  let randomCalls = 0;
  const id = newOperationId({ getRandomValues(bytes) { randomCalls++; bytes.fill(255); return bytes; } });
  assert.equal(id, 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.equal(randomCalls, 1);
});
