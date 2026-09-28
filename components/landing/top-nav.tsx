"use client";

/**
 * The floating landing nav.
 *
 * A single translucent pill, fixed at the top. Its own cream backdrop keeps
 * it legible over both the navy cinematic and the paper page beneath. Every
 * item leads somewhere real: the two halves of the product, a way to reach
 * the people behind it when one is configured, and the demo on whichever
 * half suits the device. Nothing here scrolls the page.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/logo";
import { routeForDevice } from "@/lib/device";
import { contactHref } from "@/lib/contact";

const linkClass =
  "focus-ring rounded-full px-3.5 py-2 text-[13px] font-medium text-foreground/70 transition-colors hover:bg-foreground/[0.06] hover:text-foreground";

export function TopNav() {
  const router = useRouter();
  const mail = contactHref("Shimo");
  return (
    <nav className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-[color-mix(in_srgb,var(--color-foreground)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-cream)_82%,transparent)] py-1.5 pr-1.5 pl-4 shadow-lift backdrop-blur-md">
        <Link href="/" aria-label="Shimo" className="focus-ring mr-1 rounded-md transition-opacity hover:opacity-70">
          <Logo className="text-[16px]" />
        </Link>

        <span className="mx-1 hidden h-4 w-px bg-[color-mix(in_srgb,var(--color-foreground)_14%,transparent)] sm:block" />

        <div className="hidden items-center sm:flex">
          <Link href="/admin" className={linkClass}>
            For clubs
          </Link>
          <Link href="/app" className={linkClass}>
            For golfers
          </Link>
          {mail && (
            <a href={mail} className={linkClass}>
              Talk to us
            </a>
          )}
        </div>

        <button
          type="button"
          onClick={() => router.push(routeForDevice())}
          className="focus-ring ml-1 inline-flex items-center gap-1.5 rounded-full bg-clay px-4 py-2 text-[13px] font-medium text-cream shadow-xs transition-[background-color,transform] duration-200 hover:bg-clay-deep active:scale-[0.98]"
        >
          Try the demo
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </nav>
  );
}
