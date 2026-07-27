"use client";

import { useEffect, useSyncExternalStore } from "react";

import { startSim } from "@/lib/sim/store";

/** Mounted-ness flips exactly once, so there is nothing to subscribe to. */
const neverChanges = () => () => {};

export function useMounted() {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

/**
 * Boots the simulation once on the client and holds children back until
 * mounted, so localStorage-restored state never fights the server render.
 */
export function SimGate({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const mounted = useMounted();
  useEffect(() => {
    startSim();
  }, []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}
