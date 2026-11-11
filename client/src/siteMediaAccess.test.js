import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldBlockSiteMedia } from './siteMediaAccess.js'

test('restricted media requires an authenticated user and an exact true certificate flag', () => {
  for (const user of [null, {}, { id: 1 }, { baby_verified: true }, { id: 1, baby_verified: false }, { id: 1, baby_verified: 'true' }]) {
    assert.equal(shouldBlockSiteMedia({ status: 'login' }, user), true)
  }
  assert.equal(shouldBlockSiteMedia({ status: 'login' }, { id: 1, baby_verified: true }), false)
  assert.equal(shouldBlockSiteMedia({ status: 'login' }, { id: '1', baby_verified: true }), false)
})

test('normal state allows media; paused state stays blocked even for a certified session', () => {
  assert.equal(shouldBlockSiteMedia({ status: 'ok' }, null), false)
  assert.equal(shouldBlockSiteMedia({ status: 'closed', download_open: true }, { id: 1, baby_verified: true }), true)
})
