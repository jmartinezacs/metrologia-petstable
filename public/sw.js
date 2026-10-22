// Service worker de Metrología · Pet's Table
// Solo habilita la instalación como app. No guarda caché ni funciona sin conexión:
// los registros metrológicos siempre se leen y guardan en el servidor.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* red directa */ });
