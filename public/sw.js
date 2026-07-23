/*
 * Shimo service worker.
 *
 * Strategy, tuned for tournament-day connectivity in the field:
 * - static assets (/_next/static, fonts, icons): cache-first — they're
 *   content-hashed and never change under one URL
 * - page navigations: network-first with a cached fallback, so the golfer
 *   screens keep opening with the last known good shell when offline
 * - score data itself never travels through here: it lives local-first in
 *   the app and syncs through the outbox
 */

const VERSION = "shimo-sw-v1";
const APP_SHELL = ["/app", "/app/leaderboard", "/app/live", "/app/tournaments", "/app/profile"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // hashed build assets + icons: cache-first
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // page navigations: network-first, cached shell as fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(req);
          return hit || caches.match("/app");
        }),
    );
  }
});
