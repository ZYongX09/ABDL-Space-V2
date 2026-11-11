import { getSiteAccess } from './siteAccess.js'
import { installMediaGuard, setMediaGuardEnabled } from './utils/mediaGuard.js'

/** Only a fresh, signed-in certificate projection opens restricted frontend media. */
export function shouldBlockSiteMedia(access, user) {
  if (access.status === 'ok') return false
  return !(access.status === 'login' && user?.id != null && user.baby_verified === true)
}

/** Apply before publishing an auth state; admin routes are exempted by the guard per request. */
export function syncSiteMediaAccess(user) {
  const access = getSiteAccess()
  setMediaGuardEnabled(shouldBlockSiteMedia(access, user))
  if (access.status !== 'ok') installMediaGuard()
}
