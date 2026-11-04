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
 * Send a web notification if conditions match
 */
export function sendBrowserNotification(title, options = {}) {
  if (!isPushNotificationSupported()) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    const notif = new Notification(title, {
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      requireInteraction: true,
      ...options,
    });
    return true;
  } catch (err) {
    console.warn('Browser notification error:', err);
    return false;
  }
}

/**
 * Checks today's reminder and fires a browser notification if not already sent today.
 */
export function checkAndNotifyGstReminders() {
  const reminder = getGstReminder();
  if (!reminder) return null;

  const todayKey = `khansa_gst_notified_${new Date().toISOString().slice(0, 10)}`;
  try {
    const alreadyNotified = localStorage.getItem(todayKey);
    if (!alreadyNotified && isPushNotificationSupported() && Notification.permission === 'granted') {
      sendBrowserNotification(reminder.title, {
        body: reminder.message,
        tag: `gst-reminder-${reminder.type}`,
      });
      localStorage.setItem(todayKey, 'true');
    }
  } catch (e) {
    // ignore localStorage error
  }

  return reminder;
}

