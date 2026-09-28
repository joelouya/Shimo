/**
 * A page built before the last deploy.
 *
 * Every deploy renames the hashed build files. A page shell that predates it
 * (held by the browser, or by a service worker that has not updated yet)
 * asks for files the server no longer has, and the router reports that as a
 * chunk that failed to load. Nothing on the page is wrong; it is just old.
 * The cure is a single reload onto the fresh build, and never more than one
 * in a short while, so a genuine outage cannot turn into a reload loop.
 */

const KEY = "shimo-stale-build-reload";
const ONCE_MS = 60_000;

/** Whether an error is the router failing to fetch a build file. */
export function isStaleBuildError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: unknown; message?: unknown };
  if (e.name === "ChunkLoadError") return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /loading chunk|failed to load chunk|chunkloaderror|failed to fetch dynamically imported module|importing a module script failed/i.test(
    message,
  );
}

/**
 * Whether a reload would happen right now: on a device with a window and
 * storage, and not within a minute of the last one. A pure read, so a screen
 * can decide what to show before the reload is asked for.
 */
export function canReloadOntoFreshBuild(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    return Date.now() - last >= ONCE_MS;
  } catch {
    // no storage means no way to stop a loop: leave the error on screen
    return false;
  }
}

/** Reload onto the fresh build, once. Returns false when it will not. */
export function reloadOntoFreshBuild(): boolean {
  if (!canReloadOntoFreshBuild()) return false;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
