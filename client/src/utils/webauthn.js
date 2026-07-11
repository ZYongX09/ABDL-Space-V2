import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

export function isWebAuthnSupported() {
  // 检查 navigator.credentials 是否存在
  if (!window.navigator.credentials) return false

  // 检查 PublicKeyCredential 是否存在
  if (typeof window.PublicKeyCredential === 'undefined') return false

  // 尝试检测是否真正支持（某些浏览器可能有对象但不支持）
  try {
    // 如果能调用这个方法，说明真正支持
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return true
    }
  } catch {}

  // 即使检测方法失败，只要基础对象存在就认为可能支持
  // 让实际调用时捕获具体错误
  return true
}

export async function isPlatformAuthAvailable() {
  try {
    return await platformAuthenticatorIsAvailable()
  } catch {
    return false
  }
}

export function isPWA() {
  return window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
}

function getDeviceName() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Android/.test(ua)) {
    const match = ua.match(/Android.*?;\s?([^)]+)\)/)
    return match ? `Android (${match[1]})` : 'Android 设备'
  }
  if (/Windows/.test(ua)) return 'Windows 设备'
  return '未知设备'
}

export async function registerPasskey() {
  const optionsRes = await fetch(`${API_BASE}/api/webauthn/register/options`, {
    method: 'POST',
    credentials: 'include',
  })
  const optionsJSON = await optionsRes.json()

  const deviceName = getDeviceName()

  let attResp
  try {
    attResp = await startRegistration({ optionsJSON })
  } catch (e) {
    // 显示实际错误信息，帮助调试
    console.error('[WebAuthn] register error:', e)
    throw new Error(`安全识别注册失败: ${e.message || e.name || '未知错误'}`)
  }

  const verifyRes = await fetch(`${API_BASE}/api/webauthn/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ...attResp, challenge: optionsJSON.challenge, nickname: deviceName }),
  })

  return verifyRes.json()
}

export async function authenticateWithPasskey(username) {
  const optionsRes = await fetch(`${API_BASE}/api/webauthn/authenticate/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
  const optionsJSON = await optionsRes.json()

  let asseResp
  try {
    asseResp = await startAuthentication({ optionsJSON })
  } catch (e) {
    const msg = e.message || ''
    if (msg.includes('credential manager') || msg.includes('Credential Manager')) {
      throw new Error('浏览器安全模块不可用，请尝试：1) 使用 Chrome 浏览器 2) 在系统设置中启用屏幕锁定')
    }
    if (e.name === 'NotAllowedError') {
      throw new Error('用户取消了验证或设备不支持')
    }
    if (e.name === 'SecurityError') {
      throw new Error('安全错误：请确保在 HTTPS 环境下使用')
    }
    if (e.name === 'NotSupportedError') {
      throw new Error('此设备不支持安全识别')
    }
    throw e
  }

  const verifyRes = await fetch(`${API_BASE}/api/webauthn/authenticate/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...asseResp, challenge: optionsJSON.challenge }),
  })

  return verifyRes.json()
}
    throw e
  }

  const verifyRes = await fetch(`${API_BASE}/api/webauthn/register/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ ...attResp, challenge: optionsJSON.challenge, nickname: deviceName }),
  })

  return verifyRes.json()
}

export async function authenticateWithPasskey(username) {
  const optionsRes = await fetch(`${API_BASE}/api/webauthn/authenticate/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
  const optionsJSON = await optionsRes.json()

  let asseResp
  try {
    asseResp = await startAuthentication({ optionsJSON })
  } catch (e) {
    // 显示实际错误信息，帮助调试
    console.error('[WebAuthn] authenticate error:', e)
    throw new Error(`安全识别失败: ${e.message || e.name || '未知错误'}`)
  }

  const verifyRes = await fetch(`${API_BASE}/api/webauthn/authenticate/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...asseResp, challenge: optionsJSON.challenge }),
  })

  return verifyRes.json()
}

export async function getMyCredentials() {
  const res = await fetch(`${API_BASE}/api/webauthn/credentials`, {
    credentials: 'include',
  })
  return res.json()
}

export async function deleteCredential(id) {
  const res = await fetch(`${API_BASE}/api/webauthn/credentials/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  return res.json()
}
