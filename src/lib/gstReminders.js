/**
 * GST Reminders and Web Push Notification Engine
 * - 8th day of month: GSTR-1 Filing Reminder (due by 11th)
 * - 19th day of month: GSTR-3B Tax Payment Reminder (due by 20th)
 */

export function getGstReminder(currentDate = new Date()) {
  const day = currentDate.getDate();

  // Day 8 to 11: GSTR-1 Filing window
  if (day >= 8 && day <= 11) {
    const daysLeft = 11 - day;
    return {
      type: 'GSTR-1',
      title: 'GST Filing Reminder: GSTR-1 Due Soon',
      badge: 'GSTR-1 Due',
      urgency: day === 11 ? 'urgent' : day === 8 ? 'reminder' : 'warning',
      message: day === 8
        ? 'Today is the 8th of the month. GSTR-1 return filing is due by the 11th. Please verify your monthly bills.'
        : day === 11
        ? 'URGENT: Today is the LAST DAY (11th) to file GSTR-1 monthly return!'
        : `Reminder: GSTR-1 filing is due on the 11th (${daysLeft} day${daysLeft > 1 ? 's' : ''} left).`,
      actionLabel: 'View Monthly Report',
      actionUrl: '/reports',
      day,
    };
  }

  // Day 19 to 20: GSTR-3B Tax Payment window
  if (day >= 19 && day <= 20) {
    const isDueToday = day === 20;
    return {
      type: 'GSTR-3B',
      title: isDueToday ? 'URGENT: GSTR-3B Tax Payment Due Today' : 'GST Payment Reminder: GSTR-3B Due Tomorrow',
      badge: 'GSTR-3B Due',
      urgency: isDueToday ? 'urgent' : 'warning',
      message: isDueToday
        ? 'URGENT: Today is the 20th! Complete GSTR-3B tax payment and filing before midnight to avoid interest and late fees.'
        : 'Today is the 19th. GSTR-3B tax payment & return is due TOMORROW (20th). Please verify tax payable and arrange payment.',
      actionLabel: 'View Tax Summary',
      actionUrl: '/reports',
      day,
    };
  }

  return null;
}

/**
 * Checks if browser notifications are supported
 */
export function isPushNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission() {
  if (!isPushNotificationSupported()) {
    return 'unsupported';
  }
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch (e) {
    console.warn('Error requesting notification permission:', e);
    return 'denied';
  }
}

/**
 * Plays an audible notification chime using Web Audio API and audio fallback.
 * Synthesizes a crisp, pleasant two-tone chime (E5 -> A5) without needing any external audio file.
 * Works offline with 0 network latency.
 */
export function playNotificationChime() {
  if (typeof window === 'undefined') return;

  // 1. Try HTML Audio element with /notification.wav
  try {
    const audio = new Audio('/notification.wav');
    audio.play().catch(() => {});
  } catch {
    // fallback to Web Audio synthesis
  }

  // 2. Synthesize with Web Audio API for instantaneous chime
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      // First tone: E5 (659.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, ctx.currentTime);
      gain1.gain.setValueAtTime(0.3, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.35);

      // Second tone: A5 (880 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
      gain2.gain.setValueAtTime(0.35, ctx.currentTime + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.55);
    }
  } catch (err) {
    console.warn('Audio chime playback notice:', err);
  }
}

/**
 * Send a web notification if conditions match.
 * Uses ServiceWorkerRegistration.showNotification first (standard & required on Android / Chrome Mobile / PWA).
 * Plays an audible notification sound chime and vibrates the device.
 * Falls back to desktop window.Notification constructor.
 */
export async function sendBrowserNotification(title, options = {}) {
  if (!isPushNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  // Always play notification chime
  playNotificationChime();

  const notificationOptions = {
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    sound: '/notification.wav',
    silent: false,
    vibrate: [300, 150, 300, 150, 300],
    ...options,
  };

  // 1. Primary: Use Service Worker registration (Works on Android, Chrome Mobile, iOS 16.4+, and Desktop)
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, notificationOptions);
        return true;
      }
    } catch (swErr) {
      console.warn('ServiceWorker showNotification notice:', swErr);
    }
  }

  // 2. Fallback for Desktop browsers without active Service Worker
  try {
    new Notification(title, {
      requireInteraction: true,
      ...notificationOptions,
    });
    return true;
  } catch (err) {
    console.warn('Browser notification fallback error:', err);
    return false;
  }
}

/**
 * Checks today's reminder and fires a browser notification if not already sent today.
 */
export async function checkAndNotifyGstReminders() {
  const reminder = getGstReminder();
  if (!reminder) return null;

  const todayKey = `khansa_gst_notified_${new Date().toISOString().slice(0, 10)}`;
  try {
    const alreadyNotified = localStorage.getItem(todayKey);
    if (!alreadyNotified && isPushNotificationSupported() && Notification.permission === 'granted') {
      const sent = await sendBrowserNotification(reminder.title, {
        body: reminder.message,
        tag: `gst-reminder-${reminder.type}`,
      });
      if (sent) {
        localStorage.setItem(todayKey, 'true');
      }
    }
  } catch (e) {
    // ignore localStorage error
  }

  return reminder;
}

/**
 * Daily sales notification helper:
 * Fires a reminder notification if 0 bills have been created today.
 */
export async function checkAndNotifyDailySales(todayCount) {
  if (todayCount !== 0) return false;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayKey = `khansa_no_sales_notified_${todayStr}`;

  try {
    const alreadyNotified = localStorage.getItem(todayKey);
    if (!alreadyNotified && isPushNotificationSupported() && Notification.permission === 'granted') {
      const sent = await sendBrowserNotification('No Bills Created Today', {
        body: `Reminder: You have not created any bills yet today (${todayStr}).`,
        tag: 'daily-sales-reminder',
      });
      if (sent) {
        localStorage.setItem(todayKey, 'true');
        return true;
      }
    }
  } catch (e) {
    // ignore
  }

  return false;
}

