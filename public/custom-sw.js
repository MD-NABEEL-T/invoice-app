// Custom Service Worker script imported into Workbox
// Handles background Push Notifications and Notification clicks when app is closed.

self.addEventListener('push', (event) => {
  let payload = {
    title: 'No sales today? ,no bills created',
    body: 'No bills have been recorded yet for today (10:00 PM). Tap to create one.',
    url: '/new',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    }
  } catch (e) {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    sound: '/notification.wav',
    silent: false,
    vibrate: [300, 150, 300, 150, 300],
    tag: 'khansa-daily-no-sales',
    renotify: true,
    data: {
      url: payload.url || '/new',
    },
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/new';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

