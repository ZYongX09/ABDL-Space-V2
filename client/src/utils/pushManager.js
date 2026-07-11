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
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const key = await getVapidKey();
  if (!key) throw new Error('VAPID key not available');

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });

  const subJson = sub.toJSON();
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
