// GSSC RFO service worker. The version is stamped by tools/build.py from a hash of the shell and data files.
const V = 'gsscrfo-2fc7a97e47';
// The sandbox website (…/gpsc-forest-officer-staging/) and GPSCavy share this browser's cache storage on raghav511.github.io:
// every cache of this app starts with its own prefix, and only those are ever cleaned up.
const CP = self.registration.scope.indexOf('-staging/') > -1 ? 'stgrfo-' : 'gsscrfo-';
const CV = CP + V.slice(V.indexOf('-') + 1);
const SHELL = ['./', 'index.html', 'js/app.js', 'js/core.js', 'js/runner.js', 'js/study.js', 'manifest.webmanifest',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png', 'fonts/jakarta-latin.woff2', 'fonts/inter-latin.woff2', 'fonts/tiro-deva-subset.woff2', 'js/thought.js', 'js/ai.js', 'js/account.js', 'js/config.js', 'js/licence.js', 'js/vault.js',
  'data/index.json', 'data/meta.json', 'data/keys.json'];

self.addEventListener('install', e => {
  // Fetch every shell file with the version in the query, so a CDN edge still holding the previous
  // deploy cannot hand back a mix of old and new files. Modules are stored under their versioned URL
  // (the page asks for js/app.js?v=V and they import each other the same way); the rest under the plain URL.
  e.waitUntil(caches.open(CV).then(c => Promise.all(SHELL.map(u => fetch(u + (u.includes('?') ? '&' : '?') + 'v=' + V, { cache: 'reload' })
    .then(r => { if (!r.ok) throw new Error(u + ' ' + r.status); return c.put(u.endsWith('.js') ? u + '?v=' + V : u, r); })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // Take over at once (iOS often never closes the old page), then reload any open page that is not running:
  // a page stuck on a half-updated cache cannot answer the ping, so it is reloaded onto this complete cache.
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(CP) && k !== CV).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then(cs => Promise.all(cs.map(c => new Promise(done => {
      let alive = false;
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { alive = true; done(); };
      try { c.postMessage('gps-ping', [ch.port2]); } catch (err) { }
      setTimeout(() => { if (!alive && c.navigate) c.navigate(c.url).catch(() => { }); done(); }, 2000);
    })))));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share-target')) {
    // A progress file shared into the app from WhatsApp or Files: park it, then open the app on the upload preview.
    e.respondWith(req.formData().then(fd => {
      const f = fd.getAll('file').find(x => x && typeof x !== 'string');
      if (!f) return Response.redirect('./?shared=1#/', 303);
      return caches.open('inbox-gsscrfo').then(c => c.put('inbox', new Response(f, { headers: { 'x-name': encodeURIComponent(f.name || 'shared-file.json') } })))
        .then(() => Response.redirect('./?shared=1#/', 303));
    }).catch(() => Response.redirect('./?shared=1#/', 303)));
    return;
  }
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const path = url.pathname.slice(self.registration.scope.length - location.origin.length);
  if (path.startsWith('content/pdfs/')) return; // PDFs are never cached: fetched only when opened
  if (path === 'version.json') return; // always straight from the website: it says which version is newest
  if (req.mode === 'navigate') {
    // Network first (4 s), so a launch always gets the newest page when online; the saved copy when offline.
    e.respondWith(new Promise(done => {
      let settled = false;
      const fromCache = () => caches.open(CV).then(c => c.match('index.html')).then(hit => hit || fetch(req));
      const t = setTimeout(() => { if (!settled) { settled = true; done(fromCache()); } }, 4000);
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
        if (settled) return; settled = true; clearTimeout(t);
        done(res.ok ? res : fromCache());
      }).catch(() => { if (!settled) { settled = true; clearTimeout(t); done(fromCache()); } });
    }));
    return;
  }
  // Modules: exact versioned URL only, so a module from one version is never handed to another.
  if (path.startsWith('js/')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type === 'basic' && url.search.includes('v=' + V)) { const copy = res.clone(); caches.open(CV).then(c => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  // other shell files: cache first (versioned); data files: stale-while-revalidate
  e.respondWith(caches.open(CV).then(c => c.match(req, { ignoreSearch: true }).then(hit => {
    const net = fetch(new Request(req, { cache: 'no-cache' })).then(res => { if (res.ok && res.type === 'basic') c.put(req, res.clone()); return res; });
    if (hit) { if (path.startsWith('data/')) net.catch(() => { }); return hit; }
    return net;
  })));
});
