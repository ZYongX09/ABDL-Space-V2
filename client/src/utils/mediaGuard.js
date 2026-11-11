/** Browser-side Tencent media guard; installed once, with an account-scoped runtime policy. */
const TENCENT_HOST = /(^|\.)(myqcloud\.com|qcloud\.com|tencentcloud\.com|tencentcloudapi\.com)$/i
const PREVIEW_PATH = /\/api\/v1\/media\/(?:preview|avatar)\/v3\//
const MEDIA_SELECTOR = 'img[src], img[srcset], source[src], source[srcset], video[src], video[poster], audio[src]'
const PLACEHOLDER = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8"><rect width="8" height="8" fill="#e6e6e6"/></svg>',
)}`

let installed = false
let enabled = true
let reconcile = () => {}

/** Switch before committing the next session's media, restoring deferred images when allowed. */
export function setMediaGuardEnabled(value) {
  enabled = value !== false
  reconcile()
}

function blocked(value) {
  const path = typeof window === 'undefined' ? '' : window.location?.pathname || ''
  if (path === '/admin' || path.startsWith('/admin/')) return false
  return enabled && isTencentMediaUrl(value)
}

/** Effective policy check, including the current route and runtime toggle. */
export function isMediaBlocked(value) {
  return blocked(value)
}

export function isTencentHost(hostname) {
  return typeof hostname === 'string' && TENCENT_HOST.test(hostname.replace(/\.$/, ''))
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

/** True for a direct Tencent URL or a preview whose embedded source is Tencent. */
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

function blockedSrcset(value) {
  return value.split(',').some(part => blocked(part.trim().split(/\s+/)[0]))
}

/** Install even on an admin entry: the route exemption is evaluated for every request. */
export function installMediaGuard() {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return
  installed = true
  const rawSetAttribute = Element.prototype.setAttribute
  const rawRemoveAttribute = Element.prototype.removeAttribute
  // Only elements with a deferred attribute are retained; replay or removal releases them.
  const deferred = new Map()

  const forget = (element, name) => {
    const attributes = deferred.get(element)
    if (!attributes) return
    attributes.delete(name)
    if (!attributes.size) deferred.delete(element)
  }

  const safeAttribute = (element, name, input) => {
    const value = String(input)
    const previous = deferred.get(element)?.get(name)
    // Observer records of our own placeholder must not erase the original URL.
    const placeholder = name === 'srcset' ? '' : PLACEHOLDER
    if (previous !== undefined && value === placeholder) return value
    const denied = name === 'srcset' ? blockedSrcset(value) : blocked(value)
    if (!denied) {
      forget(element, name)
      return value
    }
    let attributes = deferred.get(element)
    if (!attributes) deferred.set(element, attributes = new Map())
    attributes.set(name, value)
    return placeholder
  }

  const scrub = element => {
    for (const name of ['srcset', 'src', 'poster']) {
      const value = element.getAttribute(name)
      if (value === null) continue
      const next = safeAttribute(element, name, value)
      if (next !== value) rawSetAttribute.call(element, name, next)
    }
  }

  const patchProperty = (prototype, name) => {
    if (!prototype) return
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name)
    if (!descriptor?.set || descriptor.configurable === false) return
    Object.defineProperty(prototype, name, {
      ...descriptor,
      set(value) { descriptor.set.call(this, safeAttribute(this, name, value)) },
    })
  }
  patchProperty(window.HTMLImageElement?.prototype, 'src')
  patchProperty(window.HTMLImageElement?.prototype, 'srcset')
  patchProperty(window.HTMLSourceElement?.prototype, 'src')
  patchProperty(window.HTMLSourceElement?.prototype, 'srcset')
  patchProperty(window.HTMLMediaElement?.prototype, 'src')
  patchProperty(window.HTMLVideoElement?.prototype, 'poster')

  Element.prototype.setAttribute = function setAttribute(name, value) {
    const key = String(name).toLowerCase()
    return rawSetAttribute.call(this, name, ['src', 'srcset', 'poster'].includes(key) ? safeAttribute(this, key, value) : value)
  }
  Element.prototype.removeAttribute = function removeAttribute(name) {
    forget(this, String(name).toLowerCase())
    return rawRemoveAttribute.call(this, name)
  }

  reconcile = () => {
    for (const [element, attributes] of deferred) {
      for (const [name, value] of attributes) {
        if (name === 'srcset' ? blockedSrcset(value) : blocked(value)) continue
        // Do not resurrect a URL overwritten by another component or removed in the meantime.
        const placeholder = name === 'srcset' ? '' : PLACEHOLDER
        if (element.getAttribute(name) === placeholder) rawSetAttribute.call(element, name, value)
        forget(element, name)
      }
    }
    for (const element of document.querySelectorAll(MEDIA_SELECTOR)) scrub(element)
  }

  const rawFetch = window.fetch?.bind(window)
  if (rawFetch) {
    window.fetch = function guardedFetch(input, init) {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url
      if (blocked(url)) return Promise.reject(new TypeError('Blocked media host'))
      return rawFetch(input, init)
    }
  }

  if (window.XMLHttpRequest) {
    const urls = new WeakMap()
    const rawOpen = XMLHttpRequest.prototype.open
    const rawSend = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.open = function guardedOpen(method, url, ...rest) {
      if (blocked(String(url))) throw new TypeError('Blocked media host')
      urls.set(this, String(url))
      return rawOpen.call(this, method, url, ...rest)
    }
    XMLHttpRequest.prototype.send = function guardedSend(body) {
      if (blocked(urls.get(this))) throw new TypeError('Blocked media host')
      return rawSend.call(this, body)
    }
  }

  if (navigator.sendBeacon) {
    const rawBeacon = navigator.sendBeacon.bind(navigator)
    navigator.sendBeacon = function guardedBeacon(url, data) {
      return blocked(String(url)) ? false : rawBeacon(url, data)
    }
  }

  // Parsed markup needs a second line of defence; normal React/property writes are blocked first.
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target instanceof Element) scrub(record.target)
        continue
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue
        scrub(node)
        for (const element of node.querySelectorAll(MEDIA_SELECTOR)) scrub(element)
      }
      for (const node of record.removedNodes) {
        for (const element of deferred.keys()) {
          if (!element.isConnected && (node === element || node.contains?.(element))) deferred.delete(element)
        }
      }
    }
  })
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset', 'poster'] })
  reconcile()
}

/** Test-only. */
export function placeholderForTest() {
  return PLACEHOLDER
}
