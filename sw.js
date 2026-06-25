/**
 * sw.js (Service Worker) - PC/모바일 호환 완결판 (v18.0)
 */

// 💡 [굳음 박멸 핵심] 캐시 네임스페이스 버전을 격상하여 모바일 디스크의 고착 데이터를 강제 청소합니다.
const CACHE_NAME = 'bow-archery-v18-0'; 

const ASSETS_TO_CACHE = [
    'index.html',
    'style.css',
    'manifest.json',
    'icon-192.png',
    'icon-512.png',
    'js/sensor.js',
    'js/analyzer.js',
    'js/app_core.js',
    'js/app_gesture.js',
    'js/app.js'
];
// 인스톨 세션: 최신 버전 에셋 강제 캐싱 파이프라인 가동
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[PWA] v18.0 최신 에셋 캐싱 완료.');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting(); 
});

// 액티베이트 세션: 굳어버린 구버전(v16, v17 등) 캐시 인프라 즉시 완전 파괴 소거
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[PWA] 구버전 인프라 전면 삭제 완료:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim(); 
});

// 패치 세션: 정적 자원 실시간 프록싱
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
