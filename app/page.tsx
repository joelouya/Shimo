"use client";

/**
 * The landing page.
 *
 * Read as a document rather than as a product page: an editorial column, a
 * numbered sequence of claims, hairlines between them, and one terracotta mark
 * per screen. The three claims appear in the order PRODUCT.md commits to, and
 * each one is answered by a real fragment of the interface rather than by an
 * icon in a card. Three identical feature cards and a gradient hero are the
 * bound anti-reference here; this is the alternative.
 *
 * Every number, name and club on this page is the product's own demo data.
 * Nothing here claims a customer, a case study or a metric, because there are
 * none yet.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { CinematicHero } from "@/components/landing/cinematic-hero";
import { ReturnedCard } from "@/components/landing/returned-card";
import { LiveDot } from "@/components/live-dot";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/sync/auth";
import { cn } from "@/lib/utils";

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

/**
 * Reveal on scroll, once.
 *
 * `once` matters more than it looks: a section that re-animates every time it
 * crosses the viewport turns a page into a slideshow, and the second viewing
 * is always worse than the first.
 */
function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const still = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={still ? { opacity: 0 } : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{
        duration: still ? 0.25 : 0.7,
        ease: EASE,
        delay: still ? 0 : delay,
      }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ *
 * The evidence beside each claim.
 *
 * Deliberately three different shapes. A row of three matching cards is the
 * thing this page exists not to be, and each fragment is more convincing at
 * its own natural size anyway.
 * ------------------------------------------------------------------ */

function ChainEvidence() {
  const steps = [
    { label: "Entered twice", detail: "player and marker, independently" },
    { label: "Attested", detail: "by the marker who kept the card" },
    { label: "Certified", detail: "by the player" },
    { label: "Sealed", detail: "SHA-256 over every figure on it" },
  ];
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      {steps.map((s, i) => (
        <div key={s.label} className="flex gap-3.5">
          {/*
            The chain drawn as a chain: one rule running through the steps,
            marked in terracotta only at the end. Four accent dots would make
            four equal moments out of a sequence that has exactly one outcome.
          */}
          <div className="flex flex-col items-center">
            <span
              className={cn(
                "mt-1.5 size-1.5 rounded-full",
                i === steps.length - 1 ? "bg-clay" : "bg-stone/50",
              )}
            />
            {i < steps.length - 1 && <span className="w-px flex-1 bg-border" />}
          </div>
          <div className={i < steps.length - 1 ? "pb-4" : ""}>
            <p className="text-[13px] font-medium text-foreground">{s.label}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{s.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function OfflineEvidence() {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-amber-flag" />
        <span className="smallcaps text-amber-flag">Reconnecting</span>
      </div>
      <p className="mt-3 font-serif text-[22px] leading-tight text-foreground">
        Holding 11 scores
      </p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
        The board keeps the last figure it trusted. Nothing blanks and nothing
        reloads, and the moment the phone finds the club again everything
        reconciles in order.
      </p>
      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
        <span className="smallcaps text-muted-foreground">Last seen</span>
        <span className="ml-auto text-[13px] text-ink-soft tnum">14:07</span>
      </div>
    </div>
  );
}

function BoardEvidence() {
  const rows = [
    { pos: 1, name: "A. Wanjiru", score: "-4" },
    { pos: 2, name: "J. Ouya", score: "-2" },
    { pos: 3, name: "D. Kamau", score: "-1" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-broadcast-ink p-5 shadow-card">
      <p className="smallcaps text-cream/55">Through 14</p>
      <p className="mt-1 font-serif text-[22px] leading-tight text-cream">
        Captain&apos;s Prize
      </p>
      <div className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <div key={r.pos} className="flex items-baseline gap-3">
            <span
              className={`w-4 font-serif text-[13px] tnum ${
                r.pos === 1 ? "text-clay-lift" : "text-cream/55"
              }`}
            >
              {r.pos}
            </span>
            <span
              className={`flex-1 font-serif text-[15px] ${
                r.pos === 1 ? "text-cream" : "text-cream/70"
              }`}
            >
              {r.name}
            </span>
            <span
              className={`font-serif text-[15px] tnum ${
                r.pos === 1 ? "text-clay-lift" : "text-cream/70"
              }`}
            >
              {r.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CLAIMS = [
  {
    n: "01",
    title: "A result that holds up.",
    body: "Dual entry under Rule 3.3b: the player scores, the marker keeps a second card, and any disagreement surfaces before it reaches the board. The marker attests, the player certifies, and the card seals with a tamper-evident hash over every figure and every identity on it. The Committee gets an append-only audit trail and a real dispute path.",
    evidence: <ChainEvidence />,
  },
  {
    n: "02",
    title: "Works where the golf is.",
    body: "Parts of a golf course have no signal, and that is an ordinary condition rather than an error. Shimo scores offline, holds what it knows, says so quietly, and reconciles the moment the phone finds the club again.",
    evidence: <OfflineEvidence />,
  },
  {
    n: "03",
    title: "The club looks superb.",
    body: "Generated fixture and results posters in the club's own crest and colour, and a clubhouse screen that runs the whole afternoon unattended and holds the room through prizegiving. It never shows a member's worst hole.",
    evidence: <BoardEvidence />,
  },
];

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
      {/* The cinematic opening plays first, then scrolls into the editorial
          page below. It renders nothing under reduced motion, where this
          editorial hero serves directly. */}
      <CinematicHero
        onGetStarted={() => router.push(routeForDevice())}
        clubHref="/admin"
      />

      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Logo className="text-[19px]" />
        <nav className="flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/app">The golfer</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin">The club</Link>
          </Button>
        </nav>
      </header>

      {/* ---- hero ---- */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-6 pb-20 pt-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-28 lg:pt-16">
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
              onClick={() => router.push(routeForDevice())}
            >
              <LiveDot />
              Get started
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

      {/* ---- the three claims ---- */}
      <section className="mx-auto w-full max-w-6xl px-6">
        <Reveal>
          <p className="smallcaps border-t border-border pt-6 text-muted-foreground">
            What&apos;s included
          </p>
        </Reveal>

        <div className="mt-4">
          {CLAIMS.map((c, i) => (
            <Reveal key={c.n} delay={0.04}>
              <article
                className={`grid gap-8 py-12 lg:grid-cols-[1fr_auto] lg:gap-16 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                <div className="max-w-xl">
                  <span className="font-serif text-[clamp(32px,4.6vw,46px)] leading-none text-clay tnum">
                    {c.n}
                  </span>
                  <h2 className="mt-3 font-serif text-[clamp(29px,4.2vw,44px)] font-medium leading-[1.04] tracking-[-0.012em] text-foreground text-balance">
                    {c.title}
                  </h2>
                  <p className="mt-5 max-w-prose text-[clamp(15px,1.7vw,16.5px)] leading-[1.7] text-ink-soft">
                    {c.body}
                  </p>
                </div>
                <div className="w-full lg:w-[320px]">{c.evidence}</div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <footer className="mt-16 border-t border-border">
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
