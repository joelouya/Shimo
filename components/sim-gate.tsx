"use client";

import { useEffect, useState } from "react";

import { startSim } from "@/lib/sim/store";

export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
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
