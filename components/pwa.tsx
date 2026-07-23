"use client";

import { useEffect, useState } from "react";
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
    // stash the install event — it often fires before any screen listens
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

export function InstallPrompt() {
  const [kind, setKind] = useState<"none" | "native" | "ios">("none");

  useEffect(() => {
    try {
      if (isStandalone() || localStorage.getItem("shimo-install-dismissed"))
        return;
      if (window.__shimoInstallEvent) setKind("native");
      else if (isIos()) setKind("ios");
      const onInstallable = () => setKind("native");
      window.addEventListener("shimo-installable", onInstallable);
      return () => window.removeEventListener("shimo-installable", onInstallable);
    } catch {}
  }, []);

  if (kind === "none") return null;

  const dismiss = () => {
    try {
      localStorage.setItem("shimo-install-dismissed", "1");
    } catch {}
    setKind("none");
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
          className="shrink-0 rounded-lg bg-clay px-4 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-clay-deep cursor-pointer"
        >
          Install
        </button>
      ) : null}
      <button
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 self-start rounded p-1 text-muted-foreground/60 hover:text-muted-foreground cursor-pointer"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
