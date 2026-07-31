"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";

import { Logo } from "@/components/logo";

/* ------------------------------------------------------------------ */
/* Boot: service worker registration (production only)                 */
/* ------------------------------------------------------------------ */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __shimoInstallEvent?: BeforeInstallPromptEvent | null;
  }
}

export function PwaBoot() {
  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    // stash the install event - it often fires before any screen listens
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__shimoInstallEvent = e as BeforeInstallPromptEvent;
      window.dispatchEvent(new Event("shimo-installable"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}

/* ------------------------------------------------------------------ */
/* Golfer layout: remember + restore the last-viewed screen            */
/* ------------------------------------------------------------------ */

const LAST_ROUTE_KEY = "shimo-last-golfer-route";

export function useGolferRouteMemory() {
  const pathname = usePathname();
  const router = useRouter();

  // restore once per app launch when opened from the home screen
  useEffect(() => {
    try {
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as { standalone?: boolean }).standalone === true;
      const restored = sessionStorage.getItem("shimo-route-restored");
      const last = localStorage.getItem(LAST_ROUTE_KEY);
      if (standalone && !restored) {
        sessionStorage.setItem("shimo-route-restored", "1");
        if (last && last !== pathname && last.startsWith("/app")) {
          router.replace(last);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      if (pathname.startsWith("/app")) {
        localStorage.setItem(LAST_ROUTE_KEY, pathname);
      }
    } catch {}
  }, [pathname]);
}

/* ------------------------------------------------------------------ */
/* Install prompt card (golfer home)                                   */
/* ------------------------------------------------------------------ */

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

export type InstallKind = "installed" | "native" | "ios" | "other";

/**
 * How this device can install Shimo. The platform owns the answer - the
 * display mode, the user agent, and the install event stashed by PwaBoot -
 * so it is read rather than copied into state. It stays a subscription
 * because `beforeinstallprompt` often lands after the screen has painted.
 */
function subscribeInstallable(onChange: () => void) {
  window.addEventListener("shimo-installable", onChange);
  return () => window.removeEventListener("shimo-installable", onChange);
}

function readInstallKind(): InstallKind {
  try {
    if (isStandalone()) return "installed";
    if (window.__shimoInstallEvent) return "native";
    if (isIos()) return "ios";
  } catch {}
  return "other";
}

export function useInstallKind() {
  return useSyncExternalStore(
    subscribeInstallable,
    readInstallKind,
    () => "other" as const,
  );
}

export function InstallPrompt() {
  const installable = useInstallKind();
  // the club member already said no on this device
  const [dismissed, setDismissed] = useState(() => {
    try {
      return Boolean(localStorage.getItem("shimo-install-dismissed"));
    } catch {
      return true;
    }
  });

  const kind =
    dismissed || (installable !== "native" && installable !== "ios")
      ? "none"
      : installable;

  if (kind === "none") return null;

  const dismiss = () => {
    try {
      localStorage.setItem("shimo-install-dismissed", "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="mt-6 flex items-center gap-4 rounded-2xl bg-card p-4 shadow-card">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-secondary/70">
        <Logo className="text-[13px]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-medium text-foreground">Install Shimo</p>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
          {kind === "native"
            ? "One tap from your home screen, works offline on the course."
            : "Open the share menu and choose “Add to Home Screen”."}
        </p>
      </div>
      {kind === "native" ? (
        <button
          onClick={async () => {
            const ev = window.__shimoInstallEvent;
            if (!ev) return;
            await ev.prompt();
            window.__shimoInstallEvent = null;
            dismiss();
          }}
          className="shrink-0 rounded-lg bg-clay px-4 py-2.5 text-[14px] font-medium text-cream transition-colors hover:bg-clay-deep cursor-pointer"
        >
          Install
        </button>
      ) : null}
      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 self-start rounded p-1 text-muted-foreground hover:text-muted-foreground cursor-pointer"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
