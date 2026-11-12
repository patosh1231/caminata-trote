const CACHE = 'caminata-trote-v3';
const SHELL = ['./', './index.html', './app.js', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const cacheable = url.origin === self.location.origin || url.hostname === 'cdnjs.cloudflare.com';
  if (!cacheable) return; // los mapas (OpenStreetMap) siempre desde la red

  const sameOrigin = url.origin === self.location.origin;
  // Archivos propios: red primero (así las actualizaciones llegan solas); sin red, usa la copia guardada.
  // Leaflet (CDN): caché primero, porque no cambia.
  const handler = sameOrigin
    ? fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req))
    : caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }));
  e.respondWith(handler);
});
