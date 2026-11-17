/* global self, clients */
/**
 * Пуш-сповіщення в сервіс-воркері (підключається до згенерованого Workbox SW через importScripts,
 * див. vite.config.ts). Сервер надсилає JSON { title, body, tag } — показуємо як системне сповіщення;
 * тап відкриває (або виводить наперед) застосунок.
 */
self.addEventListener('push', (event) => {
  /** @type {{ title?: string, body?: string, tag?: string }} */
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Calories', {
      body: data.body || '',
      tag: data.tag || 'calories',
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => 'focus' in c)
      return open ? open.focus() : clients.openWindow('/')
    }),
  )
})
