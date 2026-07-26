/*
 * Minimal app-shell service worker. Its job is to make the app installable
 * (Android's install prompt requires a fetch handler) and to survive a flaky
 * connection — not to be an offline-first cache.
 *
 * Rules, in order:
 *   - anything that isn't a same-origin GET is passed straight through
 *   - /api and text/event-stream are never touched (realtime must not be cached)
 *   - /_next/static is content-hashed, so cache-first is safe forever
 *   - navigations are network-first: online always means fresh HTML, and the
 *     cached shell only shows up when the network fails
 *
 * Bump CACHE to ship a new worker: activate deletes every other cache, so a
 * version bump fully replaces what clients are holding — which is also how the
 * hashed chunks of past deploys get cleared out (they linger until then).
 */
const CACHE = 'bridou-v1'
const SHELL = '/'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(SHELL, { cache: 'reload' })))
      .catch(() => {}) // a failed precache must not block installation
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

const putInCache = async (request, response) => {
  if (!response || !response.ok || response.type === 'opaque') return
  const cache = await caches.open(CACHE)
  await cache.put(request, response.clone())
}

const cacheFirst = async (request) => {
  const hit = await caches.match(request)
  if (hit) return hit
  const response = await fetch(request)
  await putInCache(request, response)
  return response
}

const networkFirst = async (request, fallback) => {
  try {
    const response = await fetch(request)
    await putInCache(request, response)
    return response
  } catch (err) {
    const hit = (await caches.match(request)) ?? (fallback && (await caches.match(fallback)))
    if (hit) return hit
    throw err
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // game server, Firebase, fonts
  if (url.pathname.startsWith('/api/')) return
  if (request.headers.get('accept')?.includes('text/event-stream')) return

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL))
  }
})
