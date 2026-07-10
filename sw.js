/**
 * sw.js (Service Worker) - 완전한 오프라인 구동 완결판 (v20.6)
 */

// 캐시 네임스페이스 버전을 index.html과 동일하게 v20.6으로 격상
const CACHE_NAME = 'bow-archery-v20-6'; 

// index.html 내 실제 호출 경로와 쿼리 스트링까지 완벽하게 매핑
const ASSETS_TO_CACHE = [
 './',
 'index.html',
 'style.css?v=20.6',
 'manifest.json',
 'icon-192.png',
 'icon-512.png',
 'js/app_core.js?v=20.6',
 'js/sensor.js?v=20.6',
 'js/analyzer.js?v=20.6',
 'js/app_gesture.js?v=20.6',
 'js/app.js?v=20.6'
];

// 인스톨 세션: 최신 버전 에셋 강제 캐싱 파이프라인 가동
self.addEventListener('install', (event) => {
 event.waitUntil(
 caches.open(CACHE_NAME).then((cache) => {
 console.log('[PWA] v20.6 오프라인 필수 에셋 캐싱 완료.');
 return cache.addAll(ASSETS_TO_CACHE);
 })
 );
 self.skipWaiting(); 
});

// 액티베이트 세션: 굳어버린 구버전 캐시 인프라 즉시 완전 파괴 소거
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

// 패치 세션: 정적 자원 실시간 프록싱 및 오프라인 완벽 보장
self.addEventListener('fetch', (event) => {
 event.respondWith(
 caches.match(event.request).then((response) => {
 // 캐시에 있으면 즉시 반환(오프라인 보장), 없으면 네트워크에서 가져옴
 return response || fetch(event.request);
 })
 );
});
