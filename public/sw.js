/*
 * Shimo service worker.
 *
 * Strategy, tuned for tournament-day connectivity in the field:
 * - static assets (/_next/static, fonts, icons): cache-first — they're
 *   content-hashed and never change under one URL
 * - the golfer app's pages (/app/...): network-first with a cached fallback,
 *   so a phone on the course keeps opening with the last known good shell
 *   when the signal drops
 * - every other page (the landing, the desk, the clubhouse screen, the public
 *   board): straight to the network, never cached. None of them is meant to
 *   work offline, and a shell cached before a deploy points at build files
 *   the server no longer has, which left the screen stuck on "Loading" for
 *   anyone who had opened it before the deploy.
 * - score data itself never travels through here: it lives local-first in
 *   the app and syncs through the outbox
 */

// Bump this string on any change that must invalidate old caches. It is the
// cache key, and `activate` deletes every cache that is not the current
// VERSION, so bumping it purges a stale shell (e.g. a demo-mode bundle cached
// before this deployment switched to pilot, or the desk and screen shells v3
// used to keep).
const VERSION = "shimo-sw-v4";
const APP_SHELL = ["/app", "/app/leaderboard", "/app/live", "/app/tournaments", "/app/profile"];

/** The one part of Shimo that must open without a signal. */
function isGolferPage(pathname) {
  return pathname === "/app" || pathname.startsWith("/app/");
}

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

/** Keep a copy, but only of something worth keeping: a 404 cached once is a 404 forever. */
function remember(req, res) {
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
  }
  return res;
}

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
      caches.match(req).then((hit) => hit || fetch(req).then((res) => remember(req, res))),
    );
    return;
  }

  // golfer pages: network-first, cached shell as fallback. Everything else
  // is left to the browser, untouched and uncached.
  if (req.mode === "navigate" && isGolferPage(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => remember(req, res))
        .catch(async () => {
          const hit = await caches.match(req);
          return hit || caches.match("/app");
        }),
    );
  }
});
