"use client";

/**
 * The marketing landing.
 *
 * Ordered so a total stranger knows what Shimo is before anything else: a
 * plain hero (who it is for, what it does, the one action), then the
 * cinematic showreel, then the parts named one by one, the problem, how it
 * works, why it holds up and who it serves, questions, and the close. Every
 * button leads somewhere real; nothing on the page scrolls the reader to
 * another button.
 *
 * This is the demo / sales surface. In pilot mode the root routes players
 * straight into the app instead of here, so this whole tree (and its cinematic)
 * is only ever loaded for prospects, never for someone opening a pilot link.
 */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Mail } from "lucide-react";

import { CinematicHero } from "@/components/landing/cinematic-hero";
import { TopNav } from "@/components/landing/top-nav";
import { ReturnedCard } from "@/components/landing/returned-card";
import { Features } from "@/components/landing/features";
import { Stakes } from "@/components/landing/stakes";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Proof } from "@/components/landing/proof";
import { Audiences } from "@/components/landing/audiences";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { routeForDevice } from "@/lib/device";
import { contactHref } from "@/lib/contact";

const EASE = [0.23, 1, 0.32, 1] as const;

export function MarketingLanding() {
  const still = useReducedMotion();
  const router = useRouter();
  const mail = contactHref("Running a tournament on Shimo");

  return (
    <main className="min-h-dvh">
      {/* One floating pill, fixed over everything, so scrolling is never the
          only way to move around. */}
      <TopNav />

      {/* ---- §1 hero: what this is, in plain words ---- */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 pb-16 pt-28 lg:grid-cols-[1fr_1.05fr] lg:gap-14 lg:pb-24 lg:pt-36">
        <div>
          <motion.p
            initial={{ opacity: 0, y: still ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="smallcaps flex items-center gap-3 text-muted-foreground"
          >
            <span className="h-px w-8 bg-clay/60" />
            Tournament software for golf clubs · Kenya
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: still ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: EASE, delay: 0.06 }}
            className="mt-5 font-serif text-[clamp(42px,6.6vw,74px)] font-medium leading-[1.0] tracking-[-0.021em] text-foreground text-balance"
          >
            Run your club&apos;s tournament day from one place.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: still ? 0 : 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: EASE, delay: 0.14 }}
            className="mt-6 max-w-lg text-[clamp(17px,1.9vw,19px)] leading-[1.6] text-ink-soft"
          >
            Entries and tee sheets, live scoring from players&apos; phones, cards
            certified to the Rules of Golf, a live leaderboard and a clubhouse
            screen. Free during the pilot.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: still ? 0 : 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: EASE, delay: 0.22 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Button variant="clay" size="lg" onClick={() => router.push(routeForDevice())}>
              Try the demo
              <ArrowRight className="size-4" />
            </Button>
            {mail && (
              <Button variant="outline" size="lg" asChild>
                <a href={mail}>
                  <Mail className="size-4" />
                  Talk to us
                </a>
              </Button>
            )}
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.34 }}
            className="mt-5 font-serif text-[15px] italic text-muted-foreground"
          >
            Every card comes back signed. No sign-up to look around.
          </motion.p>
        </div>

        {/* The product, not a metaphor: the desk's Live Ops screen, with the
            returned card sitting over its corner the way it sits on a desk. */}
        <motion.div
          initial={{ opacity: 0, y: still ? 0 : 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.18 }}
          className="relative"
        >
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
            <Image
              src="/shots/live-ops.jpg"
              width={1760}
              height={1100}
              priority
              sizes="(min-width: 1024px) 600px, 100vw"
              alt="The club's Live Ops screen: every group on the course, a live leaderboard and a running score feed."
              className="block h-auto w-full"
            />
          </div>
          {/* small, and only over the screenshot's bottom-left corner, so the
              product behind it stays readable */}
          <div className="pointer-events-none absolute -bottom-6 -left-3 hidden w-[280px] origin-bottom-left scale-[0.62] sm:block lg:-left-6">
            <ReturnedCard />
          </div>
        </motion.div>
      </section>

      {/* ---- §2 the showreel: the cinematic, pinned, lifting away into the
              parts it just showed. Renders nothing on phones and under
              reduced motion. ---- */}
      <CinematicHero />

      {/* ---- §3 the parts, named ---- */}
      <Features />

      {/* ---- §4 the problem ---- */}
      <Stakes />

      {/* ---- §5 how it works ---- */}
      <HowItWorks />

      {/* ---- §6 why it holds up, and who it is for ---- */}
      <Proof />
      <Audiences />

      {/* ---- §7 questions ---- */}
      <Faq />

      {/* ---- §8 the close ---- */}
      <FinalCta />

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4 px-6 py-8">
          <Logo className="text-[15px]" />
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            <Link href="/admin" className="focus-ring rounded-md text-foreground/70 hover:text-foreground">
              For clubs
            </Link>
            <Link href="/app" className="focus-ring rounded-md text-foreground/70 hover:text-foreground">
              For golfers
            </Link>
            {mail && (
              <a href={mail} className="focus-ring rounded-md text-foreground/70 hover:text-foreground">
                Talk to us
              </a>
            )}
          </nav>
          <p className="basis-full text-[13px] text-muted-foreground">
            A working prototype, built in Kenya. The names, clubs and figures
            throughout are demo data.
          </p>
        </div>
      </footer>
    </main>
  );
}
