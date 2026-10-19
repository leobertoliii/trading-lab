/* Service worker del Trading Lab: uso offline e avvio rapido. Versione 3d65b700e6 */
const VERSION = '3d65b700e6';
const CORE = 'core-' + VERSION, DATA = 'data-v1';
const PRECACHE = ["./", "index.html", "manifest.webmanifest", "favicon.svg", "icons/icon-192.png", "assets/style.88865f51b2.css", "assets/app.3d65b700e6.js", "assets/theme-init.js", "assets/fonts.css", "assets/vendor/lightweight-charts.standalone.production.js", "assets/fonts/nunito-sans-400.woff2", "assets/fonts/outfit-500.woff2", "data/overview.json", "data/trades.json", "data/chart-index.json", "data/help.json", "data/help_guida.json", "data/guida.json", "data/help_strumenti.json", "data/tutorial.json"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CORE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('core-') && k !== CORE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                         // prezzi in diretta e candele esterne: sempre rete vera
  const path = url.pathname;
  if (path.includes('/data/')) {                                       // dati: subito dalla cache e intanto aggiorna (stale-while-revalidate)
    e.respondWith(caches.open(DATA).then(async (c) => {
      const hit = await c.match(req);
      const net = fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  if (req.mode === 'navigate') {                                       // pagina: prima la rete (ultima versione), senza rete la copia salvata
    e.respondWith(fetch(req).then((r) => { const copy = r.clone(); caches.open(CORE).then((c) => c.put('index.html', copy)); return r; })
      .catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CORE).then((c) => c.put(req, copy)); } return r; })));
});
