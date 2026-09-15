"use client";

/**
 * Whether a media query matches, as an external store: read synchronously,
 * updated when the viewport or pointer changes, false on the server. Used
 * where a whole experience is gated on the device (the pinned cinematic
 * only runs on a wide screen with a fine pointer) rather than on a style.
 */

import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => (typeof window === "undefined" ? false : window.matchMedia(query).matches),
    () => false,
  );
}
