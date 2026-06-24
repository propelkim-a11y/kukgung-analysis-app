/**
 * sw.js (Service Worker) - PC/모바일 호환 완결판
 */

const CACHE_NAME = 'bow-archery-v16'; 

const ASSETS_TO_CACHE = [
    '/kukgung-analysis-app/index.html',
    '/kukgung-analysis-app/style.css',
    '/kukgung-analysis-app/manifest.json',
    '/kukgung-analysis-app/icon-192.png',
    '/kukgung-analysis-app/icon-512.png',
    '/kukgung-analysis-app/js/sensor.js',
    '/kukgung-analysis-app/js/analyzer.js',
    '/kukgung-analysis-app/js/app_core.js',
    '/kukgung-analysis-app/js/app_gesture.js',
    '/kukgung-analysis-app/js/app.js'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[PWA] 크로스 플랫폼 에셋 캐싱 완료.');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting(); 
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[PWA] 구버전 인프라 청소 완료.');
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim(); 
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
