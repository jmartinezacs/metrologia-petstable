// Service worker de Metrología · Pet's Table
// Habilita la instalación como app y muestra los avisos push. No guarda caché ni
// funciona sin conexión: los registros metrológicos siempre se leen y guardan en el servidor.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* red directa */ });

// Todo es relativo a su alcance: / cuando la app está sola y /metrologia/ dentro del Portal Pet's Table.
const enAlcance = (ruta) => new URL(String(ruta || '').replace(/^\//, ''), self.registration.scope).href;
const ICONO = enAlcance('icons/icon-192.png');
// Ícono pequeño de la barra de estado en Android: silueta blanca de Pet's Table sobre fondo
// transparente (Android solo usa el canal alfa; con fondo de color se ve un cuadro).
const BADGE = enAlcance('notif/badge-96.png');

async function mostrar(d) {
  await self.registration.showNotification(d.title || 'Metrología', {
    body: d.body || '',
    icon: ICONO,
    badge: BADGE,
    tag: d.tag || `calbas-${Date.now()}`,
    renotify: true,
    vibrate: [300, 120, 300],
    timestamp: Date.now(),
    actions: [{ action: 'ver', title: 'Ver ahora' }],
    // La función recordatorios_calbas manda rutas como '/#/verificar': se abren dentro del alcance de esta app
    data: { url: enAlcance(d.url || '') },
  });
}

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(mostrar(d));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) {
        if ('navigate' in c) await c.navigate(url).catch(() => {});
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
