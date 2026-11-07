/**
 * Browser-side guard: when the site is in a restricted state, no request or image
 * may reach a Tencent Cloud host, including the preview endpoints that wrap a
 * Tencent object as their source. Admin pages never install this guard.
 */
const TENCENT_HOST = /(^|\.)(myqcloud\.com|qcloud\.com|tencentcloud\.com|tencentcloudapi\.com)$/i
const PREVIEW_PATH = /\/api\/v1\/media\/(?:preview|avatar)\/v3\//
const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8"><rect width="8" height="8" fill="#e6e6e6"/></svg>',
)}`

let installed = false

export function isTencentHost(hostname) {
  return typeof hostname === 'string' && TENCENT_HOST.test(hostname)
}

function decodePreviewSource(path) {
  const encoded = path.split('/v3/')[1]?.split('/')[0]
  if (!encoded) return null
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (encoded.length % 4)) % 4)
    return atob(padded)
  } catch {
    return null
  }
}

/** True for a direct Tencent URL or a media-preview URL whose embedded source is Tencent. */
export function isTencentMediaUrl(value) {
  if (typeof value !== 'string' || !value) return false
  let url
  try {
    const base = typeof window === 'undefined' ? undefined : window.location?.href
    url = new URL(value, base || 'https://abdl-space.top')
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  if (isTencentHost(url.hostname)) return true
  if (PREVIEW_PATH.test(url.pathname)) {
    const source = decodePreviewSource(url.pathname)
    if (!source) return false
    try {
      return isTencentHost(new URL(source).hostname)
    } catch {
      return false
    }
  }
  return false
}

function scrubSrcset(value) {
  if (typeof value !== 'string' || !value) return value
  return value.split(',').some((part) => isTencentMediaUrl(part.trim().split(/\s+/)[0])) ? PLACEHOLDER : value
}

export function installMediaGuard() {
  if (installed) return
  installed = true

  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')
  if (descriptor?.set) {
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(value) {
        descriptor.set.call(this, isTencentMediaUrl(value) ? PLACEHOLDER : value)
      },
    })
  }

  const rawSetAttribute = Element.prototype.setAttribute
  Element.prototype.setAttribute = function setAttribute(name, value) {
    const key = String(name).toLowerCase()
    if (key === 'src' && isTencentMediaUrl(value)) value = PLACEHOLDER
    else if (key === 'srcset') value = scrubSrcset(value)
    return rawSetAttribute.call(this, name, value)
  }

  const rawFetch = window.fetch?.bind(window)
  if (rawFetch) {
    window.fetch = function guardedFetch(input, init) {
      const url = typeof input === 'string' ? input : input?.url
      if (isTencentMediaUrl(url)) return Promise.reject(new TypeError('Blocked media host'))
      return rawFetch(input, init)
    }
  }

  const rawOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function guardedOpen(method, url, ...rest) {
    if (isTencentMediaUrl(String(url))) throw new TypeError('Blocked media host')
    return rawOpen.call(this, method, url, ...rest)
  }

  if (navigator.sendBeacon) {
    const rawBeacon = navigator.sendBeacon.bind(navigator)
    navigator.sendBeacon = function guardedBeacon(url, data) {
      return isTencentMediaUrl(String(url)) ? false : rawBeacon(url, data)
    }
  }

  // Markup parsed through innerHTML bypasses both setters, so repair it afterwards.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target
      if (!(target instanceof Element)) continue
      if (record.type === 'attributes') {
        if (record.attributeName === 'src' && isTencentMediaUrl(target.getAttribute('src'))) {
          rawSetAttribute.call(target, 'src', PLACEHOLDER)
        } else if (record.attributeName === 'srcset') {
          const value = target.getAttribute('srcset')
          const safe = scrubSrcset(value)
          if (safe !== value) rawSetAttribute.call(target, 'srcset', safe)
        }
      } else {
        for (const image of target.querySelectorAll('img[src], source[srcset]')) {
          if (isTencentMediaUrl(image.getAttribute('src'))) rawSetAttribute.call(image, 'src', PLACEHOLDER)
          const value = image.getAttribute('srcset')
          const safe = scrubSrcset(value)
          if (safe !== value) rawSetAttribute.call(image, 'srcset', safe)
        }
      }
    }
  })
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset'] })
}

/** Test-only. */
export function placeholderForTest() {
  return PLACEHOLDER
}
