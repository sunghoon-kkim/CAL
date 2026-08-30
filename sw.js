// 서비스워커: 홈화면 설치를 가능하게 해주고, 핵심 파일을 캐싱해서 다음 접속부터 더 빨리 열리게 함
// (Google Sheets 데이터 동기화는 항상 네트워크로 이루어지므로, 오프라인이어도 화면은 뜨지만
//  최신 데이터 동기화는 인터넷이 연결되어야 정상 작동합니다)

const CACHE_NAME = 'activity-calendar-v1';
// 이 앱은 CSS/JS가 전부 index.html 안에 인라인으로 들어있어서 캐싱할 정적 파일이 이거 하나뿐임.
// (예전에 style.css/script.js도 같이 캐싱하려 했었는데, 존재하지 않는 파일이라 cache.addAll이
//  통째로 실패해서 install 자체가 항상 실패하던 버그가 있었음 - 오프라인 캐싱이 계속 동작 안 하고 있었음)
const CORE_ASSETS = [
  './index.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 우리 사이트의 정적 파일(html/css/js)만 캐시 우선(있으면 캐시, 없으면 네트워크 후 캐시에 저장)으로 처리.
  // Google Apps Script API 요청 등 다른 모든 요청은 서비스워커가 손대지 않고 그대로 네트워크로 통과시킴
  // (항상 최신 데이터를 받아야 하므로)
  if (url.origin === self.location.origin && CORE_ASSETS.some((a) => url.pathname.endsWith(a.replace('./', '')))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse.clone()));
            return networkResponse;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
