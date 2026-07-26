// GeoModel3D Service Worker v8.0 — 强制更新缓存
const CACHE_NAME = 'geomodel3d-v8.0';
const RUNTIME_CACHE = 'geomodel3d-runtime-v8';

// 核心静态资源
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// CDN 资源
const CDN_HOSTS = ['unpkg.com', 'is.autonavi.com', 'autonavi.com', 'map.gtimg.com', 'gtimg.com', 'geo.datav.aliyun.com', 'tile.openstreetmap.org', 'basemaps.cartocdn.com', 'cartocdn.com', 'osm.tuna.tsinghua.edu.cn', 'server.arcgisonline.com', 'arcgisonline.com', 'cdn.jsdelivr.net', 'jsdelivr.net', 'supabase.co', 'supabase.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

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

// ===== 激活：清理所有旧缓存 =====
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) {
          return key !== CACHE_NAME && key !== RUNTIME_CACHE;
        }).map(function(key) {
          console.log('[SW] 删除旧缓存:', key);
          return caches.delete(key);
        })
      );
    }).then(function() {
      return self.clients.matchAll().then(function(clients) {
        clients.forEach(function(client) {
          client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
      });
    })
  );
  self.clients.claim();
});

// 请求拦截
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);
  var req = event.request;

  if (req.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;
  if (url.pathname.includes('appmaptile') || url.pathname.includes('realtimerender') || url.pathname.match(/\/\d+\/\d+\/\d+\./)) return;
  if (url.hostname.includes('supabase.co') && (url.pathname.includes('/auth/v1/') || url.pathname.includes('/rest/v1/'))) return;

  // index.html 和导航请求：始终网络优先
  if (url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // CDN 资源：网络优先
  var isCDN = CDN_HOSTS.some(function(host) {
    return url.hostname.includes(host);
  });

  if (isCDN) {
    event.respondWith(networkFirst(req));
    return;
  }

  // 本地资源：缓存优先
  event.respondWith(cacheFirst(req));
});

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
      if (request.mode === 'navigate') {
        return caches.match('./index.html');
      }
      return new Response('', { status: 408, statusText: 'Offline' });
    });
  });
}

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

self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
