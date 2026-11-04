import { supabase } from './supabase.js';

export const VAPID_PUBLIC_KEY =
  'BP6nRYXoL5a-C6UYDP0aZsCRIlPq9J6NemBODwKZIozvuia0R7Q2dpUdnQXD8Z79N5m_EE1z_8TIqhJ-2p4NsKU';

/**
 * Convert URL-safe base64 string to Uint8Array for PushManager subscription
 */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const atobFn =
    typeof window !== 'undefined' && window.atob
      ? window.atob.bind(window)
      : (b64) => Buffer.from(b64, 'base64').toString('binary');
  const rawData = atobFn(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if Web Push is supported by the current browser/device
 */
export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Get current push subscription state:
 * 'unsupported' | 'denied' | 'subscribed' | 'prompt'
 */
export async function getPushSubscriptionState() {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) return 'subscribed';
    return Notification.permission === 'granted' ? 'ready_to_subscribe' : 'prompt';
  } catch (err) {
    console.warn('Error checking push subscription:', err);
    return 'prompt';
  }
}

/**
 * Subscribe current device to Web Push and save subscription in Supabase
 */
export async function subscribeToPushNotifications() {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported on this browser/device.');
  }

  // Request browser permission
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    throw new Error('Notification permission was not granted by user.');
  }

  const reg = await navigator.serviceWorker.ready;

  // Subscribe with VAPID Public Key
  const convertedVapidKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  let sub = await reg.pushManager.getSubscription();

  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedVapidKey,
    });
  }

  const subJson = sub.toJSON();
  const endpoint = subJson.endpoint;
  const p256dh = subJson.keys?.p256dh || '';
  const auth = subJson.keys?.auth || '';

  // Store in Supabase push_subscriptions table (with graceful fallback if table not yet created)
  try {
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint,
        p256dh,
        auth,
        user_agent: navigator.userAgent.slice(0, 255),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

    if (error) {
      console.warn('Supabase push_subscriptions warning:', error.message);
    }
  } catch (err) {
    console.warn('Could not store push subscription in database:', err);
  }

  // Save flag in localStorage
  try {
    localStorage.setItem('khansa_push_subscribed', 'true');
    localStorage.setItem('khansa_push_endpoint', endpoint);
  } catch (e) {
    // ignore
  }

  return sub;
}

/**
 * Unsubscribe current device from Web Push
 */
export async function unsubscribeFromPushNotifications() {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();

      // Remove from Supabase
      try {
        await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
      } catch (err) {
        // ignore
      }

      localStorage.removeItem('khansa_push_subscribed');
      localStorage.removeItem('khansa_push_endpoint');
      return true;
    }
  } catch (err) {
    console.warn('Unsubscribe error:', err);
  }
  return false;
}
