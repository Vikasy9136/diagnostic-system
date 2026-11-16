/* LabSetu Partner Service Worker — Background Pickup Alerts */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const payload = event.data || {};
  if (payload.type === 'SHOW_PICKUP_NOTIFICATION') {
    const title = payload.title || 'New Sample Pickup Nearby';
    const body =
      payload.body || 'Open LabSetu Partner App to view pickup details and claim this trip.';
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        tag: payload.tag || 'labsetu-pickup-alert',
        renotify: true,
        requireInteraction: true,
        vibrate: [250, 120, 250, 120, 400],
        data: {
          orderId: payload.orderId || '',
          url: '/',
        },
        actions: [
          { action: 'open', title: 'Open Request' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      })
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'LabSetu Nearby Pickup Broadcast';
  const body =
    payload.body || 'A nearby collection lab needs specimen pickup. Open now to claim.';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag: payload.tag || 'labsetu-pickup-push',
      renotify: true,
      requireInteraction: true,
      vibrate: [250, 120, 250],
      data: {
        orderId: payload.orderId || '',
        url: payload.url || '/',
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetOrderId = event.notification?.data?.orderId || '';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.postMessage({
            type: 'OPEN_BROADCAST_ORDER',
            orderId: targetOrderId,
          });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
      return undefined;
    })
  );
});

