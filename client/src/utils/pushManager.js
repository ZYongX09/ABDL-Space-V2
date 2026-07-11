let vapidPublicKey = null;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getVapidKey() {
  if (vapidPublicKey) return vapidPublicKey;
  try {
    const res = await fetch('/api/push/vapid-key');
    if (res.ok) {
      const data = await res.json();
      vapidPublicKey = data.publicKey || data.public_key;
    }
  } catch {
    // VAPID key not available yet
  }
  return vapidPublicKey;
}

export async function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getPushSubscription() {
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function isPushSubscribed() {
  const sub = await getPushSubscription();
  return !!sub;
}

export async function subscribePush() {
  // 先检查是否已订阅
  const existingSub = await getPushSubscription();
  if (existingSub) {
    // 已有订阅，同步到后端
    const subJson = existingSub.toJSON();
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        platform: 'web',
        endpoint: subJson.endpoint,
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth,
        device_info: { os: navigator.platform, ua: navigator.userAgent },
      }),
    });
    return existingSub;
  }

  // 请求权限
  let permission;
  try {
    permission = await Notification.requestPermission();
  } catch (e) {
    console.warn('[Push] requestPermission failed:', e);
    return null;
  }

  if (permission !== 'granted') return null;

  // 获取 VAPID 密钥
  const key = await getVapidKey();
  if (!key) throw new Error('VAPID key not available');

  // 订阅
  let sub;
  try {
    const reg = await navigator.serviceWorker.ready;
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  } catch (e) {
    console.warn('[Push] pushManager.subscribe failed:', e);
    throw e;
  }

  // 同步到后端
  const subJson = sub.toJSON();
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      platform: 'web',
      endpoint: subJson.endpoint,
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth,
      device_info: { os: navigator.platform, ua: navigator.userAgent },
    }),
  });

  if (!res.ok) {
    console.warn('[Push] sync to backend failed:', res.status);
  }

  return sub;
}

export async function unsubscribePush() {
  const sub = await getPushSubscription();
  if (!sub) return;

  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    credentials: 'include',
  });

  await sub.unsubscribe();
}

/**
 * 同步已存在的订阅到后端
 * 用于用户通过系统弹窗允许通知后，自动同步到我们的数据库
 */
export async function syncExistingSubscription() {
  try {
    const sub = await getPushSubscription();
    if (!sub) return false;

    const subJson = sub.toJSON();
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        platform: 'web',
        endpoint: subJson.endpoint,
        p256dh: subJson.keys?.p256dh,
        auth: subJson.keys?.auth,
        device_info: { os: navigator.platform, ua: navigator.userAgent },
      }),
    });

    return res.ok;
  } catch {
    return false;
  }
}
