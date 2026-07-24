// GeoModel3D Service Worker v3.0 — 增强离线缓存 + 自动更新
const CACHE_NAME = 'geomodel3d-v3.1';
const RUNTIME_CACHE = 'geomodel3d-runtime';

// 核心静态资源（首次安装即缓存）
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './three.min.js',
  './OrbitControls.js',
  './leaflet.js',
  './leaflet.css',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// CDN 资源（运行时缓存，带过期时间）
const CDN_HOSTS = ['unpkg.com', 'is.autonavi.com', 'geo.datav.aliyun.com', 'tile.openstreetmap.org', 'basemaps.cartocdn.com', 'cartocdn.com', 'autonavi.com'];

// ===== 安装：预缓存核心资源 =====
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.allSettled(
        PRECACHE_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] 缓存失败:', url, err.message);
          });
        })
      );
    })
  );
  self.skipWaiting();
});

// ===== 激活：清理旧缓存 + 通知客户端更新 =====
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME && key !== RUNTIME_CACHE;
        }).map(function(key) {
          return caches.delete(key);
        })
      );
    }).then(function() {
      // 通知所有客户端有新版本
      return self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
      });
    })
  );
  self.clients.claim();
});

// ===== 请求拦截：缓存优先 + 网络回退 =====
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);
  var req = event.request;

  // 跳过非 GET 请求
  if (req.method !== 'GET') return;
  // 跳过 chrome-extension
  if (url.protocol === 'chrome-extension:') return;

  // CDN 资源：网络优先，缓存回退
  var isCDN = CDN_HOSTS.some(function(host) {
    return url.hostname.includes(host);
  });

  if (isCDN) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 本地资源：缓存优先，网络回退
  event.respondWith(cacheFirst(req));
});

// 缓存优先策略
function cacheFirst(request) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;

    return fetch(request).then(function(response) {
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response;
      }
      var cloned = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, cloned);
      });
      return response;
    }).catch(function() {
      // 导航请求返回首页
      if (request.mode === 'navigate') {
        return caches.match('./index.html');
      }
      return new Response('', { status: 408, statusText: 'Offline' });
    });
  });
}

// 网络优先策略（CDN资源）
function networkFirst(request) {
  return fetch(request).then(function(response) {
    if (response && response.status === 200) {
      var cloned = response.clone();
      caches.open(RUNTIME_CACHE).then(function(cache) {
        cache.put(request, cloned);
      });
      return response;
    }
    return caches.match(request);
  }).catch(function() {
    return caches.match(request);
  });
}

// ===== 消息处理：支持 skipWaiting 触发 =====
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});