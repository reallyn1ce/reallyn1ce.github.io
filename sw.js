// Service Worker KOGAMA ARCHIVE.
// VERSION подставляется скриптом scripts/stamp-version.js (хеш содержимого ресурсов).
// Любое изменение HTML/CSS/JS/иконок меняет VERSION -> меняется sw.js -> браузер ставит новую версию.
const VERSION = 'a2cfe02bccda';
const SHELL_CACHE = 'archive-shell-' + VERSION; // оболочка сайта: целиком одной версии
const DATA_CACHE = 'archive-data';              // JSON-данные: живут между версиями, нужны для офлайна
const IMG_CACHE = 'archive-img';                // архивные изображения: файлы не меняются, грузим один раз

const REQUIRED = [
  './index.html',
  `./style.css?v=${VERSION}`,
  `./app.js?v=${VERSION}`,
  `./analytics.js?v=${VERSION}`
];
const OPTIONAL = ['./', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];
const DATA = [
  './data/traffic.json', './data/meta.json', './data/events.json',
  './data/communities.json', './data/documents.json', './data/changelog.json',
  './data/gallery.json', './data/compare.json', './version.json'
];

const fresh = (u) => new Request(u, { cache: 'reload' }); // в обход HTTP-кэша GitHub Pages (max-age=600)

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL_CACHE);
    // Обязательные файлы: если хоть один не скачался, установка отменяется
    // и пользователь остаётся на прежней рабочей версии.
    await shell.addAll(REQUIRED.map(fresh));
    await Promise.all(OPTIONAL.map((u) => shell.add(fresh(u)).catch(() => {})));
    // Данные для первого офлайн-запуска (не критично для установки)
    const data = await caches.open(DATA_CACHE);
    await Promise.all(DATA.map((u) => data.add(fresh(u)).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE && k !== IMG_CACHE) // старые оболочки и legacy «archive-v9»
      .map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Сеть с ревалидацией (ETag -> 304, без повторной загрузки неизменённого) и таймаутом; затем кэш.
async function networkFirst(request, cacheName, timeoutMs, cacheKey) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(new Request(request.url, { cache: 'no-cache', signal: ctrl.signal }));
    clearTimeout(timer);
    if (res.ok && cacheName) {
      const c = await caches.open(cacheName);
      c.put(cacheKey || request, res.clone()).catch(() => {});
    }
    if (res.status < 500) return res;
    throw new Error('HTTP ' + res.status);
  } catch (err) {
    clearTimeout(timer);
    const c = await caches.open(cacheName || SHELL_CACHE);
    const hit = await c.match(cacheKey || request, { ignoreSearch: false });
    return hit || Response.error();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Данные и файл версии: всегда пробуем свежее, офлайн — последняя сохранённая копия
  if (url.pathname.includes('/data/') || url.pathname.endsWith('/version.json')) {
    e.respondWith(networkFirst(req, DATA_CACHE, 6000));
    return;
  }

  // Архивные изображения: кэш-первым и между версиями сайта (новое изображение — новое имя файла)
  if (url.pathname.includes('/img/')) {
    e.respondWith((async () => {
      const c = await caches.open(IMG_CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone()).catch(() => {});
        return res;
      } catch { return Response.error(); }
    })());
    return;
  }

  // HTML: сначала сеть, чтобы новая страница приходила сразу и ссылалась на новые версии CSS/JS.
  // В кэш оболочки HTML из сети не пишем: она обновляется только целиком при установке новой версии.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(new Request(req.url, { cache: 'no-cache', signal: ctrl.signal }));
        clearTimeout(timer);
        if (res.status < 500) return res;
      } catch {}
      const shell = await caches.open(SHELL_CACHE);
      return (await shell.match('./index.html')) || (await shell.match('./')) || Response.error();
    })());
    return;
  }

  // Остальное (CSS/JS с ?v=хеш, иконки): сначала кэш. Адрес с хешем неизменяем, поэтому это безопасно.
  e.respondWith((async () => {
    const shell = await caches.open(SHELL_CACHE);
    const hit = await shell.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) shell.put(req, res.clone()).catch(() => {});
      return res;
    } catch { return Response.error(); }
  })());
});
