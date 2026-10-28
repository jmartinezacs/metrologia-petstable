// Service worker de Metrología · Pet's Table
// Habilita la instalación como app y muestra los avisos push. No guarda caché ni
// funciona sin conexión: los registros metrológicos siempre se leen y guardan en el servidor.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* red directa */ });

const ICONO = '/icons/icon-192.png';

async function mostrar(d) {
  await self.registration.showNotification(d.title || 'Metrología', {
    body: d.body || '',
    icon: ICONO,
    tag: d.tag || `calbas-${Date.now()}`,
    renotify: true,
    vibrate: [300, 120, 300],
    timestamp: Date.now(),
    actions: [{ action: 'ver', title: 'Ver ahora' }],
    data: { url: d.url || '/' },
  });
}

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(mostrar(d));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin) {
        if ('navigate' in c) await c.navigate(url).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
