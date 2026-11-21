/*!
 * Kevloro 2.0 — service worker.
 *
 * Стратегия: сеть в приоритете (с таймаутом), кэш — резерв для офлайна.
 * Так пользователь всегда получает свежий HTML и свежие app.js/core.js,
 * а без интернета калькулятор продолжает работать.
 */

var CACHE_VERSION = 'kevloro-v11';
var NETWORK_TIMEOUT = 3000;

var PRECACHE = [
    '/',
    '/index.html',
    '/laminat/',
    '/spc/',
    '/plitka/',
    '/oboi/',
    '/kraska/',
    '/styazhka/',
    '/kalkulyatory/',
    '/privacy.html',
    '/404.html',
    '/styles.css',
    '/core.js',
    '/app.js',
    '/ui.js',
    '/calculators.js',
    '/engine.js',
    '/manifest.json',
    '/favicon.ico',
    '/icon.svg',
    '/icon-192.png',
    '/icon-512.png',
    '/icon-maskable-192.png',
    '/icon-maskable-512.png',
    '/apple-touch-icon.png',
    '/og-image.png'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(function (cache) {
                return Promise.all(PRECACHE.map(function (url) {
                    return cache.add(url).catch(function () { /* один недоступный файл не ломает установку */ });
                }));
            })
            .then(function () {
                return self.skipWaiting();
            })
    );
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(keys.map(function (key) {
                    if (key !== CACHE_VERSION) {
                        return caches.delete(key);
                    }
                    return Promise.resolve();
                }));
            })
            .then(function () {
                return self.clients.claim();
            })
    );
});

function networkFirst(request) {
    return new Promise(function (resolve) {
        var timer = setTimeout(function () {
            resolve(caches.match(request).then(function (cached) {
                return cached || caches.match('/');
            }));
        }, NETWORK_TIMEOUT);

        fetch(request).then(function (response) {
            clearTimeout(timer);
            if (response && response.ok && request.method === 'GET') {
                var copy = response.clone();
                caches.open(CACHE_VERSION).then(function (cache) {
                    cache.put(request, copy).catch(function () { /* ignore */ });
                });
            }
            resolve(response);
        }).catch(function () {
            clearTimeout(timer);
            resolve(
                caches.match(request).then(function (cached) {
                    if (cached) {
                        return cached;
                    }
                    if (request.mode === 'navigate') {
                        return caches.match('/index.html').then(function (fallback) {
                            return fallback || caches.match('/404.html');
                        });
                    }
                    return Response.error();
                })
            );
        });
    });
}

self.addEventListener('fetch', function (event) {
    var request = event.request;
    if (request.method !== 'GET') {
        return;
    }

    var url;
    try {
        url = new URL(request.url);
    } catch (error) {
        return;
    }

    // Сторонние запросы (аналитика, шрифты) не перехватываем.
    if (url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(networkFirst(request));
});

self.addEventListener('message', function (event) {
    if (event.data === 'skip-waiting') {
        self.skipWaiting();
    }
});
