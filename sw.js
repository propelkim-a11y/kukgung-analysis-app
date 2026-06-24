/**
 * sw.js (Service Worker)
 * 국궁 자세 분석 시스템 - 모바일 크로스 플랫폼 앱 설치 공인화 인프라
 */

const CACHE_NAME = 'bow-archery-v12';
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

// 최초 앱 구동 시 코어 에셋 백그라운드 사전 예약 캐싱
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[PWA] 코어 에셋 임시 스토리지 캐싱 성공.');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 구버전 캐시 데이터 자동 파괴 및 엔진 정렬
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[PWA] 구버전 캐시 파일 청소 완료.');
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 실시간 파일 요청 가로채기 (네이티브 오프라인 안정성 확보)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

