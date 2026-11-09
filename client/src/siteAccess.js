/**
 * Public access projection loaded once before the app renders.
 * A failed request fails open: a config outage must never take the site down.
 */
const EMPTY = { status: 'ok', message: '', login_prompt: '', download_open: false, revision: '' }
let state = { ...EMPTY }
let watching = false

/** Static pages that stay readable when browsing requires a session. */
const PUBLIC_PAGES = ['/login', '/forgot-password', '/about', '/app', '/privacy', '/terms', '/cookies', '/minor-protection']
/** Sign-up entry points, disabled whenever the site is not in its normal state. */
const REGISTER_PAGES = ['/register', '/auth/sign_up', '/beta-register', '/nbw-one-click-register']
const SIGN_IN_PAGES = ['/login', '/forgot-password']
const STATUSES = ['ok', 'login', 'closed']

/** Test-only. */
export function setSiteAccessForTests(next) {
  state = { ...EMPTY, ...next }
}

export function getSiteAccess() {
  return state
}

export function isAdminPage(pathname) {
  return pathname === '/admin' || pathname.startsWith('/admin/')
}

export function isStaticPage(pathname) {
  return PUBLIC_PAGES.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function isRegistrationPath(pathname) {
  return REGISTER_PAGES.some((path) => pathname === path)
}

/** True when the current page must be replaced by the unavailable page. */
export function isClosedFor(pathname) {
  if (state.status !== 'closed') return false
  if (state.download_open && pathname === '/app') return false
  return !isAdminPage(pathname) && !SIGN_IN_PAGES.includes(pathname)
}

export async function loadSiteAccess() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const response = await fetch('/api/site/status', {
      credentials: 'omit', cache: 'no-store', signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timer)
    if (response.ok) {
      const data = await response.json()
      state = {
        status: STATUSES.includes(data?.status) ? data.status : 'ok',
        message: typeof data?.message === 'string' ? data.message : '',
        login_prompt: typeof data?.login_prompt === 'string' ? data.login_prompt : '',
        download_open: data?.download_open === true,
        revision: typeof data?.revision === 'string' ? data.revision : '',
      }
    }
  } catch {
    // Fail open.
  }
  return state
}

/** Re-check periodically and after the tab becomes visible; reload when the projection changes. */
export function startSiteAccessWatch() {
  if (watching) return
  watching = true
  const check = async () => {
    const before = state
    const next = await loadSiteAccess()
    if (next.status !== before.status || next.revision !== before.revision) window.location.reload()
  }
  window.setInterval(check, 60_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check()
  })
}
