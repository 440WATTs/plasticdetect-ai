const CACHE_NAME = "plasticdetect-v9";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/i18n.js",
  "./js/data.js",
  "./js/classifier.js",
  "./js/recyclingLocator.js",
  "./js/app.js",
  "./img/resin-code-example.png",
  "./js/model/model.json",
  "./js/model/weights.bin",
  "./js/model/class_map.json",
  "./manifest.json",
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
];

// Live-data hosts for the Nearby Recycling locator: always prefer a fresh
// network response (centers/geocoding/map tiles change or get added), but
// fall back to whatever was last cached when offline or when every
// Overpass mirror is unreachable — recyclingLocator.js also keeps its own
// longer-lived localStorage cache on top of this.
const NETWORK_FIRST_HOSTS = [
  "overpass-api.de",
  "overpass.kumi.systems",
  "overpass.openstreetmap.ru",
  "nominatim.openstreetmap.org",
  "tile.openstreetmap.org"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isNetworkFirstHost(url) {
  try {
    const hostname = new URL(url).hostname;
    return NETWORK_FIRST_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

function networkFirst(event) {
  return fetch(event.request)
    .then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    })
    .catch(() => caches.match(event.request));
}

function cacheFirst(event) {
  return caches.match(event.request).then((cached) => {
    if (cached) return cached;
    return fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => cached);
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    isNetworkFirstHost(event.request.url) ? networkFirst(event) : cacheFirst(event)
  );
});
