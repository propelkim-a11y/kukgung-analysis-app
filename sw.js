// 서비스 워커 설치 이벤트 (최초 앱 등록)
self.addEventListener('install', (event) => {
  // 기다리지 않고 즉시 활성화하여 PWA 자격 획득
  self.skipWaiting();
});

// 서비스 워커 활성화 이벤트
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// 실시간 네트워크 요청 가로채기 (오직 PWA 설치 조건 충족용 빈 패치)
self.addEventListener('fetch', (event) => {
  // 필요한 경우 추후 오프라인 캐싱 로직을 여기에 작성할 수 있습니다.
});
