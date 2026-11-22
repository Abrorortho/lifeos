/* Life OS offline cache.
   App files: served from the cache at once and refreshed in the background, so the app opens without
   internet and picks up a new version on the next launch. Google Fonts: cached on first use; until then
   (or without network) the CSS falls back to system fonts. Everything else — Yandex Disk API included —
   goes straight to the network and is never cached. Bump VERSION when the list of app files changes. */
const VERSION = 'lifeos-v1';
const APP = ['./', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (FONTS.test(req.url)) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin !== location.origin) return;
  const isPage = req.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname);
  e.respondWith(caches.open(VERSION).then(async c => {
    // navigations (with ?query or #token) all map to the cached app page
    const hit = isPage ? (await c.match('./')) || (await c.match('index.html')) : await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(res => {
      if (res.ok) c.put(isPage ? './' : req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('Нет сети', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
