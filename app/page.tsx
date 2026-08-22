"use client";

/**
 * The landing page.
 *
 * Ordered so a total stranger is carried from "what is this" to a real ask, one
 * section at a time: a cinematic overture, the hero, the problem named plainly,
 * how it works, the proof, who it is for, the actual product, questions, and the
 * close. Read as a document rather than a product page, editorial and quiet, one
 * terracotta mark per screen. Every section lives in components/landing.
 *
 * Every number, name and club on this page is the product's own demo data.
 * Nothing here claims a customer, a case study or a metric, because there are
 * none yet.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { CinematicHero } from "@/components/landing/cinematic-hero";
import { TopNav } from "@/components/landing/top-nav";
import { ReturnedCard } from "@/components/landing/returned-card";
import { Stakes } from "@/components/landing/stakes";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Proof } from "@/components/landing/proof";
import { Audiences } from "@/components/landing/audiences";
import { ProductShots } from "@/components/landing/product-shots";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/sync/auth";

/**
 * Which door a device opens.
 *
 * The visitor is already on one device: a phone opens the golfer, a laptop
 * opens the club. A coarse pointer or a narrow window reads as a phone.
 */
function routeForDevice(): "/app" | "/admin" {
  if (typeof window === "undefined") return "/app";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const narrow = window.innerWidth < 1024;
  return coarse || narrow ? "/app" : "/admin";
}

const EASE = [0.23, 1, 0.32, 1] as const;


/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const still = useReducedMotion();
  const router = useRouter();
  // A signed-in visitor is not a prospect: send them to their side rather than
  // showing the marketing page. Gate the first paint on the session check so a
  // returning user never sees this page flash before the redirect.
  const [checking, setChecking] = useState(true);

  useEffect(() => {
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

  if (checking) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <Logo className="text-[19px] opacity-70" />
        </motion.div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh">
      {/* One floating pill, fixed over everything, so scrolling is never the
          only way to move around. */}
      <TopNav />

      {/* The cinematic overture plays first, then lifts away to reveal the
          hero. It renders nothing under reduced motion, where the hero serves
          directly. */}
      <CinematicHero />

      {/* ---- §2 hero ---- */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 pb-20 pt-24 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-28 lg:pt-28">
        <div>
          <motion.p
            initial={{ opacity: 0, y: still ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="smallcaps flex items-center gap-3 text-muted-foreground"
          >
            <span className="h-px w-8 bg-clay/60" />
            Tournament golf, beautifully run
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: still ? 0 : 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: EASE, delay: 0.06 }}
            className="mt-5 font-serif text-[clamp(46px,8.2vw,88px)] font-medium leading-[0.98] tracking-[-0.021em] text-foreground text-balance"
          >
            Every card
            <br />
            comes back <span className="italic">signed.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: still ? 0 : 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: EASE, delay: 0.14 }}
            className="mt-6 max-w-lg font-serif text-[clamp(19px,2.2vw,23px)] leading-[1.55] text-ink-soft"
          >
            Shimo runs a club&apos;s tournament day end to end. Entries and tee
            sheets, live scoring on the course, cards certified to the Rules of
            Golf, and a clubhouse screen worth watching.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: still ? 0 : 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: EASE, delay: 0.22 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Button
              variant="clay"
              size="lg"
              onClick={() =>
                document
                  .getElementById("how-it-works")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              See how it works
              <ArrowRight className="size-4" />
            </Button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, ease: EASE, delay: 0.34 }}
            className="mt-6 text-[13px] leading-relaxed text-muted-foreground"
          >
            Built for the clubs of Kenya, and every course after that.
          </motion.p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <ReturnedCard />
        </div>
      </section>

      {/* ---- §3 the problem, named ---- */}
      <Stakes />

      {/* ---- §4 how it works ---- */}
      <HowItWorks />

      {/* ---- §5 proof / credibility ---- */}
      <Proof />

      {/* ---- §6 for the golfer / for the club ---- */}
      <Audiences />

      {/* ---- §7 real product screenshots ---- */}
      <ProductShots />

      {/* ---- §9 questions ---- */}
      <Faq />

      {/* ---- §8 pricing + §10 the final ask ---- */}
      <FinalCta onStart={() => router.push(routeForDevice())} />

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
          <Logo className="text-[15px]" />
          <p className="text-[13px] text-muted-foreground">
            A working prototype. The names, clubs and figures throughout are
            demo data.
          </p>
        </div>
      </footer>
    </main>
  );
}
