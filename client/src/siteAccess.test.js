import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSiteAccess, isAdminPage, isClosedFor, isRegistrationPath, isStaticPage, setSiteAccessForTests,
} from './siteAccess.js';

test('admin and static page classification covers the agreed allowlist only', () => {
  assert.equal(isAdminPage('/admin'), true);
  assert.equal(isAdminPage('/admin/site-access'), true);
  assert.equal(isAdminPage('/administrator'), false);
  for (const path of ['/login', '/forgot-password', '/about', '/app', '/privacy', '/terms', '/cookies', '/minor-protection']) {
    assert.equal(isStaticPage(path), true, path);
  }
  for (const path of ['/', '/diapers', '/forum/1', '/profile', '/c/abc', '/register']) {
    assert.equal(isStaticPage(path), false, path);
  }
  for (const path of ['/register', '/auth/sign_up', '/beta-register', '/nbw-one-click-register']) {
    assert.equal(isRegistrationPath(path), true, path);
  }
  assert.equal(isRegistrationPath('/login'), false);
});

test('closed state keeps only sign-in and admin routes reachable', () => {
  setSiteAccessForTests({ status: 'closed', message: '维护中' });
  assert.equal(getSiteAccess().status, 'closed');
  for (const path of ['/admin', '/admin/site-access', '/login', '/forgot-password']) {
    assert.equal(isClosedFor(path), false, path);
  }
  for (const path of ['/', '/forum/1', '/register', '/c/abc', '/about']) {
    assert.equal(isClosedFor(path), true, path);
  }
  setSiteAccessForTests({ status: 'login' });
  assert.equal(isClosedFor('/'), false);
  setSiteAccessForTests({ status: 'ok' });
  assert.equal(isClosedFor('/'), false);
});

test('unknown or missing projection values fall back to the open state', () => {
  setSiteAccessForTests({});
  assert.deepEqual(getSiteAccess(), { status: 'ok', message: '', login_prompt: '', revision: '' });
});
