"use client";

/**
 * A crashed screen, in Shimo's own dress.
 *
 * The product's promise is that nothing is lost, and the moment a caddymaster
 * most needs to hear it is the moment something breaks. So this says the one
 * true thing first: the round is saved on this device and the outbox keeps
 * syncing, and reopening carries on where it left off. Then it offers a way
 * back. The error itself goes to the console for whoever is looking.
 */

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  canReloadOntoFreshBuild,
  isStaleBuildError,
  reloadOntoFreshBuild,
} from "@/lib/stale-build";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // a screen built before the last deploy is not broken, only old: one
  // reload onto the fresh build, and the ordinary screen if that already
  // happened a moment ago
  const refreshing = isStaleBuildError(error) && canReloadOntoFreshBuild();
  useEffect(() => {
    console.error(error);
    if (isStaleBuildError(error)) reloadOntoFreshBuild();
  }, [error]);

  if (refreshing) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12 text-center">
        <Logo className="text-[19px]" />
        <p className="smallcaps mt-8 text-muted-foreground">A newer Shimo was published</p>
        <h1 className="mt-3 font-serif text-[30px] leading-tight text-foreground">
          Reloading onto it.
        </h1>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-12 text-center">
      <Logo className="text-[19px]" />
      <p className="smallcaps mt-8 text-muted-foreground">Something went wrong on this screen</p>
      <h1 className="mt-3 font-serif text-[30px] leading-tight text-foreground">
        Your scores are safe on this device.
      </h1>
      <p className="mt-3 max-w-[340px] text-[15px] leading-relaxed text-ink-soft">
        Everything entered so far is saved here and keeps syncing to the club.
        Reload to carry on where you were, or go back to the start.
      </p>
      <div className="mt-8 flex w-full max-w-[300px] flex-col gap-2">
        <Button variant="clay" size="lg" onClick={() => reset()}>
          <RotateCcw className="size-4" />
          Try again
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href="/">Back to the start</Link>
        </Button>
      </div>
      {error.digest && (
        <p className="mt-8 font-mono text-[11px] text-muted-foreground">Ref {error.digest}</p>
      )}
    </main>
  );
}
