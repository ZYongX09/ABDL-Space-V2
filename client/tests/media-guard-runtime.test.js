import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../src/utils/mediaGuard.js', import.meta.url), 'utf8')
const COS = 'https://fixture.cos.ap-shanghai.myqcloud.com/test.jpg'
const LOCAL = '/app-icon.png'

// Deterministic DOM/network stand-ins: no real Tencent request or user credential is involved.
function fixture(pathname = '/') {
  const elements = []
  const requests = []
  let observe
  class Element {
    constructor() { this.attributes = new Map(); this.isConnected = true; elements.push(this) }
    setAttribute(name, value) { this.attributes.set(String(name), String(value)) }
    getAttribute(name) { return this.attributes.get(String(name)) ?? null }
    removeAttribute(name) { this.attributes.delete(String(name)) }
    querySelectorAll() { return [] }
  }
  const property = (prototype, name) => Object.defineProperty(prototype, name, {
    configurable: true,
    get() { return this.getAttribute(name) || '' },
    set(value) { this.attributes.set(name, String(value)) },
  })
  class HTMLImageElement extends Element {}
  class HTMLSourceElement extends Element {}
  class HTMLMediaElement extends Element {}
  class HTMLVideoElement extends HTMLMediaElement {}
  for (const prototype of [HTMLImageElement.prototype, HTMLSourceElement.prototype]) {
    property(prototype, 'src')
    property(prototype, 'srcset')
  }
  property(HTMLMediaElement.prototype, 'src')
  property(HTMLVideoElement.prototype, 'poster')
  class XMLHttpRequest {
    open(method, url) { this.url = url }
    send() { requests.push(String(this.url)) }
  }
  const navigator = { sendBeacon(url) { requests.push(String(url)); return true } }
  const window = {
    location: { href: `https://abdl-space.top${pathname}`, pathname },
    HTMLImageElement, HTMLSourceElement, HTMLMediaElement, HTMLVideoElement, XMLHttpRequest,
    fetch(input) { requests.push(String(input?.url || input)); return Promise.resolve({ ok: true }) },
  }
  const document = { documentElement: new Element(), querySelectorAll: () => elements.filter(element => element.isConnected) }
  const context = {
    window, document, navigator, Element, HTMLImageElement, XMLHttpRequest, URL,
    atob: value => Buffer.from(value, 'base64').toString('binary'),
    MutationObserver: class { constructor(callback) { observe = callback } observe() {} },
  }
  const guard = runInNewContext(`${source.replaceAll('export function ', 'function ')}\n({ installMediaGuard, setMediaGuardEnabled, isMediaBlocked, placeholderForTest });`, context)
  return { guard, window, navigator, requests, observe: records => observe(records), Element, Image: HTMLImageElement, Source: HTMLSourceElement, Video: HTMLVideoElement, XMLHttpRequest }
}

test('blocked image and srcset property writes are restored once certification allows media', () => {
  const f = fixture()
  f.guard.installMediaGuard()
  const image = new f.Image()
  const source = new f.Source()
  image.src = COS
  source.srcset = `${COS} 1x, ${COS}?size=2 2x`
  assert.equal(image.src, f.guard.placeholderForTest())
  assert.equal(source.srcset, '')
  // Mutation observer must retain the URL rather than overwrite it with its own placeholder.
  f.observe([{ type: 'attributes', target: image }, { type: 'attributes', target: source }])
  f.guard.setMediaGuardEnabled(false)
  assert.equal(image.src, COS)
  assert.equal(source.srcset, `${COS} 1x, ${COS}?size=2 2x`)
  f.guard.setMediaGuardEnabled(true)
  assert.equal(image.src, f.guard.placeholderForTest())
  assert.equal(source.srcset, '')
})

test('an application change or explicit removal is never overwritten by replay', () => {
  const f = fixture()
  f.guard.installMediaGuard()
  const replaced = new f.Image()
  const removed = new f.Image()
  replaced.setAttribute('src', COS)
  replaced.src = LOCAL
  removed.src = COS
  removed.removeAttribute('src')
  f.guard.setMediaGuardEnabled(false)
  assert.equal(replaced.src, LOCAL)
  assert.equal(removed.getAttribute('src'), null)
})

test('admin-entry patches remain installed on a later frontend SPA transition', async () => {
  const f = fixture('/admin/site-access')
  f.guard.installMediaGuard()
  const image = new f.Image()
  image.src = COS
  assert.equal(image.src, COS)
  await f.window.fetch(COS)
  f.window.location.pathname = '/login'
  f.guard.setMediaGuardEnabled(true)
  assert.equal(image.src, f.guard.placeholderForTest())
  await assert.rejects(f.window.fetch(COS), /Blocked media host/)
  assert.deepEqual(f.requests, [COS])
  f.window.location.pathname = '/admin/baby-verifications'
  f.guard.setMediaGuardEnabled(true)
  assert.equal(image.src, COS)
})

test('fetch string, URL and Request-like inputs, beacon and XHR cannot bypass a session change', async () => {
  const f = fixture()
  f.guard.installMediaGuard()
  await assert.rejects(f.window.fetch(COS), /Blocked media host/)
  await assert.rejects(f.window.fetch(new URL(COS)), /Blocked media host/)
  await assert.rejects(f.window.fetch({ url: COS }), /Blocked media host/)
  assert.equal(f.navigator.sendBeacon(COS, 'fixture'), false)
  const xhr = new f.XMLHttpRequest()
  assert.throws(() => xhr.open('GET', COS), /Blocked media host/)
  f.guard.setMediaGuardEnabled(false)
  xhr.open('GET', COS)
  f.guard.setMediaGuardEnabled(true)
  assert.throws(() => xhr.send(), /Blocked media host/)
  assert.deepEqual(f.requests, [])
  await f.window.fetch(LOCAL)
  assert.deepEqual(f.requests, [LOCAL])
})

test('preview-wrapped Tencent media and video posters obey the same restore rule', () => {
  const f = fixture()
  f.guard.installMediaGuard()
  const wrapped = `https://api.abdl-space.top/api/v1/media/preview/v3/${Buffer.from(COS).toString('base64url')}`
  const image = new f.Image()
  const video = new f.Video()
  image.setAttribute('src', wrapped)
  video.poster = COS
  assert.equal(image.src, f.guard.placeholderForTest())
  assert.equal(video.poster, f.guard.placeholderForTest())
  f.guard.setMediaGuardEnabled(false)
  assert.equal(image.src, wrapped)
  assert.equal(video.poster, COS)
})
