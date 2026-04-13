/**
 * sw.js — Signage Service Worker
 *
 * Goals:
 *   1. Cache cross-origin video/image assets (Sanity CDN) after first fetch.
 *   2. Serve subsequent requests from local cache — instant, works offline.
 *   3. Handle HTTP Range requests from cached full responses (video seeking/buffering).
 *
 * Strategy:
 *   - Videos & images: cache-first. On first fetch, download full file and store.
 *     Range requests are sliced from the cached full response.
 *   - HTML / same-origin assets: network-first (always get latest build from Netlify).
 *   - Everything else: network passthrough.
 */

const CACHE_NAME   = 'signage-media-v1';
const VIDEO_RE     = /\.(mp4|webm|mov)(\?.*)?$/i;
const IMAGE_RE     = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

// ── Install: take control immediately ────────────────────────────────────────
self.addEventListener('install',   () => self.skipWaiting());
self.addEventListener('activate',  e  => {
  // Delete caches from old SW versions
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch intercept ───────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  const isVideo = VIDEO_RE.test(url.pathname);
  const isImage = IMAGE_RE.test(url.pathname);

  if (isVideo || isImage) {
    // Cache-first for media assets (cross-origin CDN videos/images)
    event.respondWith(handleMedia(request));
  }
  // Everything else: let browser handle normally (network)
});

// ── Media handler: cache full file, serve range slices from cache ─────────────
async function handleMedia(request) {
  const cache    = await caches.open(CACHE_NAME);
  // Always key by bare URL (no Range header) so one entry covers all range requests
  const cacheKey = request.url;
  const cached   = await cache.match(cacheKey);

  if (cached) {
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      return serveRange(cached, rangeHeader);
    }
    return cached;
  }

  // Not cached — fetch the full file (CORS mode; Sanity CDN allows it)
  try {
    const fullRequest = new Request(request.url, {
      method:      'GET',
      mode:        'cors',
      credentials: 'omit',
      // Deliberately no Range header so we fetch and cache the full file
    });
    const response = await fetch(fullRequest);
    if (!response || !response.ok) return response ?? fetch(request);

    // Store full response in cache
    cache.put(cacheKey, response.clone());

    // If original request had a Range header, slice from the fresh response
    const rangeHeader = request.headers.get('Range');
    if (rangeHeader) {
      return serveRange(response, rangeHeader);
    }
    return response;

  } catch (err) {
    console.warn('[SW] Fetch failed, network unavailable:', request.url);
    // Network is down and not cached — nothing we can do
    return new Response('Offline — media not cached', { status: 503 });
  }
}

// ── Range response builder ────────────────────────────────────────────────────
// Reads the full cached response body and returns a 206 Partial Content slice.
async function serveRange(response, rangeHeader) {
  const contentType = response.headers.get('Content-Type') || 'video/mp4';
  let buffer;
  try {
    buffer = await response.clone().arrayBuffer();
  } catch {
    // Body already consumed or unreadable — fall back to full response
    return response;
  }

  const total  = buffer.byteLength;
  const match  = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!match) {
    // Malformed Range header — return full file
    return new Response(buffer, {
      status: 200,
      headers: { 'Content-Type': contentType, 'Content-Length': String(total), 'Accept-Ranges': 'bytes' },
    });
  }

  const start = parseInt(match[1], 10);
  const end   = match[2] ? parseInt(match[2], 10) : total - 1;
  const chunk = buffer.slice(start, end + 1);

  return new Response(chunk, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type':   contentType,
      'Content-Range':  `bytes ${start}-${end}/${total}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges':  'bytes',
    },
  });
}

// ── Manual cache management (called from page via postMessage) ────────────────
self.addEventListener('message', event => {
  if (event.data?.action === 'clearCache') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports?.[0]?.postMessage({ success: true });
    });
  }

  // Pre-warm: cache all playlist URLs before they're needed
  if (event.data?.action === 'prewarm') {
    const urls = event.data.urls ?? [];
    event.waitUntil(prewarm(urls));
  }
});

async function prewarm(urls) {
  const cache = await caches.open(CACHE_NAME);
  let cached = 0, fetched = 0;

  for (const url of urls) {
    const already = await cache.match(url);
    if (already) { cached++; continue; }
    try {
      const r = await fetch(new Request(url, { mode: 'cors', credentials: 'omit' }));
      if (r.ok) { await cache.put(url, r); fetched++; }
    } catch { /* skip failed */ }
  }

  self.clients.matchAll().then(clients =>
    clients.forEach(c => c.postMessage({ action: 'prewarmDone', cached, fetched, total: urls.length }))
  );
}
