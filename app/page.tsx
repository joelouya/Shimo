"use client";

/**
 * The root.
 *
 * A thin gate, not a page. It decides who sees what:
 *
 *   pilot mode : this link is for players and clubs, not prospects. Route
 *                straight into the app by device (phone -> golfer, laptop ->
 *                club), so a friend opening the pilot link lands in the app,
 *                not on a sales page. No marketing bundle, no session wait.
 *   demo mode  : a signed-in visitor goes to their side; everyone else gets
 *                the marketing landing, which is loaded lazily so its cinematic
 *                never weighs on this gate.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";

import { Logo } from "@/components/logo";
import { IS_PILOT } from "@/lib/mode";
import { routeForDevice } from "@/lib/device";
import { getSession } from "@/lib/sync/auth";

const MarketingLanding = dynamic(
  () =>
    import("@/components/landing/marketing-landing").then(
      (m) => m.MarketingLanding,
    ),
  {
    loading: () => <Splash />,
  },
);

function Splash() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background">
      <Logo className="text-[19px] opacity-70" />
    </main>
  );
}

export default function Root() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Pilot: the link is for players and clubs. Go straight to the app by
    // device, without waiting on a session check or loading the marketing page.
    if (IS_PILOT) {
      router.replace(routeForDevice());
      return;
    }

    // Demo: a signed-in visitor is not a prospect; send them to their side.
    let active = true;
    getSession()
      .then((session) => {
        if (!active) return;
        if (session) router.replace(routeForDevice());
        else setChecking(false);
      })
      .catch(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (IS_PILOT || checking) return <Splash />;

  return <MarketingLanding />;
}
