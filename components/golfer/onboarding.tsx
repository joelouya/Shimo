"use client";

/**
 * First-run onboarding for pilot players. A full-screen flow that turns a
 * phone into a signed-in player: welcome, magic-link sign-in, confirm the
 * roster match, signature method, permissions, add to home screen, ready.
 *
 * Signing in is what makes "you" real everywhere else (the leaderboard row,
 * the home greeting, and next, scoring your own card). The flow can be
 * skipped so the follow-only path keeps working without an account; signing
 * in later from Profile finishes the job.
 *
 * Motion: one persistent shell, with the content sliding through it in the
 * direction of travel and each element cascading in behind the last. The
 * steps read as one continuous story rather than seven separate screens.
 */

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  BellRing,
  Check,
  Fingerprint,
  Loader2,
  MapPin,
  PenLine,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import { Logo, LogoMark } from "@/components/logo";
import { useInstallKind } from "@/components/pwa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clubById } from "@/lib/data";
import { AUTH_AVAILABLE, sendLoginCode, signOut, verifyLoginCode } from "@/lib/sync/auth";
import { IS_PILOT } from "@/lib/mode";
import { useAuthReconcile } from "@/lib/sim/hooks";
import {
  authedPlayerId,
  setAuth,
  setLocationConsent,
  setOnboarded,
  setSignMethod,
  setUserPin,
  useSim,
  type SignMethod,
} from "@/lib/sim/store";
import { getGpsFix } from "@/lib/integrity";
import { cn, initials } from "@/lib/utils";

type Step =
  | "welcome"
  | "signin"
  | "profile"
  | "signature"
  | "permissions"
  | "install"
  | "ready";

const ORDER: Step[] = [
  "welcome",
  "signin",
  "profile",
  "signature",
  "permissions",
  "install",
  "ready",
];

const EASE = [0.22, 1, 0.36, 1] as const;

/* ---- motion vocabulary ---- */

/**
 * Everything here uses plain inline initial/animate/exit objects rather than
 * named variants with `custom`. Under AnimatePresence mode="wait" that
 * indirection could leave an entering step stalled part-way through its
 * animation, so the step travel and the per-element cascade are both spelled
 * out directly. See Reveal for the cascade timing.
 */

/**
 * A block inside a step, cascading in behind the one before it. `i` is its
 * place in the cascade, so the content assembles top to bottom.
 */
function Reveal({
  children,
  className,
  i = 0,
}: {
  children: React.ReactNode;
  className?: string;
  i?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE, delay: 0.1 + i * 0.07 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * First run, whichever build this is.
 *
 * Pilot runs the full flow, because a pilot player has to become a real signed
 * -in person before any of it means anything. Demo runs a three-step
 * orientation instead: there is nothing to sign into, but somebody opening
 * this for the first time still deserves to be told whose round they are
 * looking at and why there are two cards.
 *
 * Both write the same `onboarded` flag, so first run is one idea with two
 * lengths rather than two separate features.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  useAuthReconcile();
  const onboarded = useSim((s) => s.onboarded);
  const pilotFlow = IS_PILOT && AUTH_AVAILABLE && !onboarded;
  const demoFlow = !IS_PILOT && !onboarded;
  return (
    <>
      {children}
      <AnimatePresence>
        {pilotFlow && <OnboardingFlow key="onboarding" />}
        {demoFlow && <DemoIntro key="demo-intro" />}
      </AnimatePresence>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The demo orientation.
 *
 * Three screens, and every claim on them is checkable in the app within a
 * minute of finishing. Nothing here sells; it says who you are, what the two
 * cards are for, and where the other half of the product is.
 * ------------------------------------------------------------------ */

/* Each orientation step shows the thing it is describing. A screen with three
   lines of type and a button a phone-height away reads as unfinished, and the
   claim is more convincing shown than stated. */

function WhoArt() {
  const figures = [
    { label: "Position", value: "1", sub: "of 36" },
    { label: "Points", value: "48", sub: null },
    { label: "Playing HC", value: "12", sub: null },
  ];
  return (
    <div className="rounded-2xl bg-card p-4 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-clay-wash font-serif text-[15px] text-clay-deep">
          JO
        </span>
        <div>
          <p className="font-serif text-[17px] leading-none text-foreground">
            Joel Ouya
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Muthaiga Golf Club
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
        {figures.map((f) => (
          <div key={f.label}>
            <p className="smallcaps text-muted-foreground">{f.label}</p>
            <p className="mt-1 font-serif text-[22px] leading-none text-foreground tnum">
              {f.value}
              {f.sub && (
                <span className="ml-1 text-[13px] text-muted-foreground">
                  {f.sub}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function CardsArt() {
  /* Hole 3 is where they disagree. That is the whole point of the screen, so
     it is the only thing on it wearing a colour. */
  const yours = [4, 4, 5];
  const markers = [4, 4, 6];
  const row = (label: string, vals: number[], other: number[]) => (
    <div className="flex items-center gap-3">
      <span className="smallcaps w-[86px] shrink-0 text-muted-foreground">
        {label}
      </span>
      {vals.map((v, i) => (
        <span
          key={i}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg font-serif text-[15px] tnum",
            v === other[i]
              ? "bg-secondary text-foreground"
              : "bg-amber-wash text-amber-flag",
          )}
        >
          {v}
        </span>
      ))}
    </div>
  );
  return (
    <div className="space-y-2.5 rounded-2xl bg-card p-4 shadow-card">
      <div className="flex items-center gap-3 pb-0.5">
        <span className="w-[86px] shrink-0" />
        {[1, 2, 3].map((h) => (
          <span
            key={h}
            className="w-8 text-center text-[11px] text-muted-foreground tnum"
          >
            {h}
          </span>
        ))}
      </div>
      {row("Your card", yours, markers)}
      {row("D. Kamau", markers, yours)}
      <p className="border-t border-border pt-3 text-[13px] leading-relaxed text-muted-foreground">
        Hole 3 does not agree, so neither figure reaches the board until the
        desk has settled it.
      </p>
    </div>
  );
}

function BothArt() {
  const rows = [
    { pos: 1, name: "You", score: "48" },
    { pos: 2, name: "A. Wanjiru", score: "46" },
    { pos: 3, name: "D. Kamau", score: "45" },
  ];
  return (
    <div className="overflow-hidden rounded-2xl bg-broadcast-ink p-4 shadow-card">
      <div className="flex items-baseline justify-between">
        <p className="smallcaps text-cream/55">The clubhouse screen</p>
        <p className="smallcaps text-cream/55">Thru 3</p>
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.pos} className="flex items-baseline gap-3">
            <span
              className={cn(
                "w-3 font-serif text-[13px] tnum",
                r.pos === 1 ? "text-clay-lift" : "text-cream/55",
              )}
            >
              {r.pos}
            </span>
            <span
              className={cn(
                "flex-1 font-serif text-[15px]",
                r.pos === 1 ? "text-cream" : "text-cream/70",
              )}
            >
              {r.name}
            </span>
            <span
              className={cn(
                "font-serif text-[15px] tnum",
                r.pos === 1 ? "text-clay-lift" : "text-cream/70",
              )}
            >
              {r.score}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const DEMO_STEPS = [
  {
    key: "who",
    icon: <LogoMark className="size-6" />,
    title: "You are Joel Ouya",
    body: "Handicap 12, three holes into the Captain's Prize at Muthaiga. The tournament is running right now, and the other thirty-five players are playing alongside you.",
    art: <WhoArt />,
  },
  {
    key: "cards",
    icon: <ShieldCheck className="size-6" />,
    title: "Two cards, one result",
    body: "You keep your own score. David Kamau, playing with you, keeps a second copy of it. That is Rule 3.3b, and it is most of the reason Shimo exists.",
    art: <CardsArt />,
  },
  {
    key: "both",
    icon: <Smartphone className="size-6" />,
    title: "The club is watching",
    body: "The tournament desk is open at /admin in another tab, running the same afternoon. Anything you enter here reaches it within a second, and the room sees it too.",
    art: <BothArt />,
  },
] as const;

function DemoIntro() {
  const [i, setI] = useState(0);
  const step = DEMO_STEPS[i];
  const last = i === DEMO_STEPS.length - 1;
  const finish = () => setOnboarded(true);

  return (
    <Shell step={i + 1} total={DEMO_STEPS.length}>
      <AnimatePresence initial={false}>
        <motion.div
          key={step.key}
          initial={{ opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0, transition: { duration: 0.5, ease: EASE } }}
          exit={{
            opacity: 0,
            x: -28,
            transition: { duration: 0.3, ease: [0.4, 0, 1, 1] },
          }}
          className="absolute inset-0 flex flex-col overflow-y-auto"
        >
          <StepBody icon={step.icon} title={step.title}>
            <Reveal i={2}>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
                {step.body}
              </p>
            </Reveal>
            <Reveal i={3} className="mt-6">
              {step.art}
            </Reveal>
          </StepBody>

          <div className="mt-auto space-y-2 pt-8">
            <Reveal i={4}>
              <Button
                variant="clay"
                size="lg"
                className="w-full"
                onClick={() => (last ? finish() : setI(i + 1))}
              >
                {last ? "Start the round" : "Next"}
                <ArrowRight className="size-4" />
              </Button>
            </Reveal>
            {!last && (
              <Reveal i={5}>
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full text-muted-foreground"
                  onClick={finish}
                >
                  Skip
                </Button>
              </Reveal>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}

/* ------------------------------------------------------------------ */

/** The persistent frame: it never unmounts, so the story stays continuous. */
function Shell({
  children,
  step,
  total,
}: {
  children: React.ReactNode;
  step: number;
  total: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.4 } }}
      exit={{ opacity: 0, transition: { duration: 0.45, ease: EASE } }}
      className="fixed inset-0 z-50 overflow-hidden bg-background"
    >
      {/*
        Ambient wash for depth. Deliberately static: a large blurred layer is
        cheap to composite once but expensive to re-rasterise every frame, so
        animating it would jank on the mid-range Androids the pilot targets.
        The sense of travel comes from the content, which moves on transform
        and opacity only.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[520px] -translate-x-1/2 opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, var(--clay-wash), transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col px-6 pb-8 pt-[max(env(safe-area-inset-top),20px)]">
        <div className="flex items-center justify-between py-4">
          <Logo className="text-[15px]" />
          <div className="flex gap-1.5">
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className="h-1 w-5 overflow-hidden rounded-full bg-border"
              >
                <motion.span
                  className="block h-full w-full origin-left rounded-full bg-clay"
                  initial={false}
                  animate={{ scaleX: i < step ? 1 : 0 }}
                  transition={{ duration: 0.45, ease: EASE, delay: i < step ? 0.05 : 0 }}
                />
              </span>
            ))}
          </div>
        </div>
        {/* steps stack here absolutely, so one can leave as the next arrives */}
        <div className="relative flex-1 overflow-x-hidden">{children}</div>
      </div>
    </motion.div>
  );
}

function StepBody({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <Reveal i={0}>
        <div className="mt-6 flex size-12 items-center justify-center rounded-2xl bg-clay-wash text-clay-deep">
          {icon}
        </div>
      </Reveal>
      <Reveal i={1}>
        <h1 className="mt-5 font-serif text-[28px] leading-tight text-foreground">
          {title}
        </h1>
      </Reveal>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function OnboardingFlow() {
  // A player who signed in by tapping the emailed link comes back on a fresh
  // page load, so pick the flow up after sign-in rather than starting over.
  const alreadyMatched = useSim((s) => Boolean(authedPlayerId(s)));
  const [step, setStep] = useState<Step>(() =>
    alreadyMatched ? "profile" : "welcome",
  );
  const [dir, setDir] = useState(1);
  const idx = ORDER.indexOf(step);

  const go = (next: Step) => {
    setDir(ORDER.indexOf(next) >= ORDER.indexOf(step) ? 1 : -1);
    setStep(next);
  };
  const finish = () => setOnboarded(true);

  return (
    <Shell step={idx + 1} total={ORDER.length}>
      {/*
        No mode="wait": the outgoing and incoming steps overlap, which both
        reads better and avoids the stall that mode="wait" introduced. They sit
        absolutely on top of each other so the layout never jumps.
      */}
      <AnimatePresence initial={false}>
        <motion.div
          key={step}
          initial={{ opacity: 0, x: dir >= 0 ? 32 : -32 }}
          animate={{
            opacity: 1,
            x: 0,
            transition: { duration: 0.5, ease: EASE },
          }}
          exit={{
            opacity: 0,
            x: dir >= 0 ? -28 : 28,
            transition: { duration: 0.3, ease: [0.4, 0, 1, 1] },
          }}
          className="absolute inset-0 flex flex-col overflow-y-auto"
        >
          {step === "welcome" && (
            <Welcome onNext={() => go("signin")} onSkip={finish} />
          )}
          {step === "signin" && (
            <SignIn onMatched={() => go("profile")} onSkip={finish} />
          )}
          {step === "profile" && (
            <ConfirmProfile
              onNext={() => go("signature")}
              onReject={() => go("signin")}
            />
          )}
          {step === "signature" && (
            <SignatureSetup onNext={() => go("permissions")} />
          )}
          {step === "permissions" && <Permissions onNext={() => go("install")} />}
          {step === "install" && <InstallStep onNext={() => go("ready")} />}
          {step === "ready" && <Ready onDone={finish} />}
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}

/* ---- steps ---- */

function Welcome({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <Reveal i={0}>
        <motion.div
          className="mt-6 flex size-14 items-center justify-center rounded-2xl bg-clay-wash"
          initial={{ rotate: -8 }}
          animate={{ rotate: 0 }}
          transition={{ duration: 0.9, ease: EASE }}
        >
          <LogoMark className="size-8" />
        </motion.div>
      </Reveal>
      <Reveal i={1}>
        <h1 className="mt-5 font-serif text-[30px] leading-tight text-foreground">
          Welcome to Shimo
        </h1>
      </Reveal>
      <Reveal i={2}>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
          Your club runs its tournaments here. Live scoring, the leaderboard in
          your pocket, and your card signed and settled without paper.
        </p>
      </Reveal>
      <Reveal i={3}>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Let&apos;s set up your phone. It takes about a minute.
        </p>
      </Reveal>
      <div className="mt-auto flex flex-col gap-2 pt-8">
        <Reveal i={4}>
          <Button variant="clay" size="lg" className="w-full" onClick={onNext}>
            Get started
            <ArrowRight className="size-4" />
          </Button>
        </Reveal>
        <Reveal i={2}>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={onSkip}
          >
            I&apos;m just following along
          </Button>
        </Reveal>
      </div>
    </div>
  );
}

function SignIn({
  onMatched,
  onSkip,
}: {
  onMatched: () => void;
  onSkip: () => void;
}) {
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authEmail = useSim((s) => s.authEmail);
  const matchId = useSim(authedPlayerId);

  // Signed in but not on the roster. This is a reading of the session rather
  // than a step of its own, so it holds for as long as that is true and
  // clears itself when the session goes.
  const noMatch = Boolean(authEmail) && !matchId;

  // once a session lands on a roster player, the flow moves on
  useEffect(() => {
    if (authEmail && matchId) onMatched();
  }, [authEmail, matchId, onMatched]);

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      await sendLoginCode(email);
      setPhase("code");
    } catch (e) {
      setError((e as Error).message ?? "Couldn't send the code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const session = await verifyLoginCode(email, code);
      if (session?.user) setAuth(session.user.email ?? email, session.user.id);
      // the effect above routes to profile or no-match
    } catch {
      setError("That code didn't work. Check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (noMatch) {
    return (
      <StepBody icon={<ShieldCheck className="size-6" />} title="Almost there">
        <Reveal i={2}>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
            We couldn&apos;t find <span className="font-medium">{authEmail}</span>{" "}
            on the club roster yet. Ask the desk to add you with this email, or
            sign in with the address you registered with.
          </p>
        </Reveal>
        <div className="mt-auto flex flex-col gap-2 pt-8">
          <Reveal i={3}>
            <Button
              variant="clay"
              size="lg"
              className="w-full"
              onClick={async () => {
                await signOut();
                setAuth(null, null);
                setEmail("");
                setCode("");
                setPhase("email");
              }}
            >
              Try another email
            </Button>
          </Reveal>
          <Reveal i={4}>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={onSkip}
            >
              Continue as a guest
            </Button>
          </Reveal>
        </div>
      </StepBody>
    );
  }

  return (
    <StepBody icon={<ShieldCheck className="size-6" />} title="Sign in">
      {phase === "email" ? (
        <>
          <Reveal i={5}>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
              Use the email your club has on file. We&apos;ll send a six-digit
              code, so there&apos;s no password to remember.
            </p>
          </Reveal>
          <Reveal i={3}>
            <div className="mt-5">
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="h-12 text-[16px]"
                onKeyDown={(e) => e.key === "Enter" && email.includes("@") && send()}
              />
            </div>
          </Reveal>
          {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}
          <div className="mt-auto flex flex-col gap-2 pt-8">
            <Reveal i={4}>
              <Button
                variant="clay"
                size="lg"
                className="w-full"
                disabled={busy || !email.includes("@")}
                onClick={send}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Email me a code"}
              </Button>
            </Reveal>
            <Reveal i={5}>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={onSkip}
              >
                Skip for now
              </Button>
            </Reveal>
          </div>
        </>
      ) : (
        <>
          <Reveal i={2}>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
              Check <span className="font-medium">{email}</span>. Tap the link in
              that email and you&apos;ll come straight back signed in, or type
              the six-digit code below if the email shows one.
            </p>
          </Reveal>
          <Reveal i={3}>
            <div className="mt-5">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="h-14 text-center text-[26px] tracking-[0.4em] tnum"
                onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()}
              />
            </div>
          </Reveal>
          {error && <p className="mt-2 text-[13px] text-destructive">{error}</p>}
          <Reveal i={4}>
            <button
              onClick={send}
              disabled={busy}
              className="mt-3 self-start text-[13px] text-clay underline-offset-2 hover:underline"
            >
              Resend code
            </button>
          </Reveal>
          <div className="mt-auto flex flex-col gap-2 pt-8">
            <Reveal i={5}>
              <Button
                variant="clay"
                size="lg"
                className="w-full"
                disabled={busy || code.length !== 6}
                onClick={verify}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Verify"}
              </Button>
            </Reveal>
            <Reveal i={6}>
              <Button
                variant="ghost"
                className="w-full text-muted-foreground"
                onClick={() => {
                  setPhase("email");
                  setCode("");
                  setError(null);
                }}
              >
                Use a different email
              </Button>
            </Reveal>
          </div>
        </>
      )}
    </StepBody>
  );
}

function ConfirmProfile({
  onNext,
  onReject,
}: {
  onNext: () => void;
  onReject: () => void;
}) {
  const matchId = useSim(authedPlayerId);
  const roster = useSim((s) => s.roster);
  const player = useMemo(
    () => roster.find((p) => p.id === matchId) ?? null,
    [roster, matchId],
  );

  if (!player) return null;
  const club = clubById(player.clubId);

  return (
    <StepBody icon={<Check className="size-6" />} title="Is this you?">
      <Reveal i={2}>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
          We matched your email to this member.
        </p>
      </Reveal>
      <Reveal i={3}>
        <motion.div
          className="mt-5 flex items-center gap-4 rounded-2xl bg-card p-5 shadow-card"
          initial={{ scale: 0.97 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-lg text-primary-foreground">
            {initials(player.name)}
          </div>
          <div className="min-w-0">
            <p className="font-serif text-[20px] leading-tight text-foreground">
              {player.name}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {club.name} · HC {player.handicap}
            </p>
          </div>
        </motion.div>
      </Reveal>
      <div className="mt-auto flex flex-col gap-2 pt-8">
        <Reveal i={4}>
          <Button variant="clay" size="lg" className="w-full" onClick={onNext}>
            Yes, that&apos;s me
            <ArrowRight className="size-4" />
          </Button>
        </Reveal>
        <Reveal i={5}>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={async () => {
              await signOut();
              setAuth(null, null);
              onReject();
            }}
          >
            This isn&apos;t me
          </Button>
        </Reveal>
      </div>
    </StepBody>
  );
}

function SignatureSetup({ onNext }: { onNext: () => void }) {
  const current = useSim((s) => s.signMethod);
  const [method, setMethod] = useState<SignMethod>(
    current === "committee" ? "pin" : current,
  );
  const [pin, setPin] = useState("");

  const OPTIONS: { id: SignMethod; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: "pin", label: "PIN", hint: "A four-digit code", icon: <ShieldCheck className="size-4" /> },
    { id: "signature", label: "Finger signature", hint: "Sign with your finger", icon: <PenLine className="size-4" /> },
    { id: "biometric", label: "Biometric", hint: "Face or fingerprint", icon: <Fingerprint className="size-4" /> },
  ];

  const canContinue = method !== "pin" || pin.length === 4;

  return (
    <StepBody icon={<PenLine className="size-6" />} title="How you'll sign">
      <Reveal i={2}>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
          You certify your own card at the end of the round. Pick how. All three
          are legally valid, and you can change it later.
        </p>
      </Reveal>
      <Reveal i={3}>
        <div className="mt-5 flex flex-col gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => setMethod(o.id)}
              className={cn(
                "relative flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors cursor-pointer",
                method === o.id
                  ? "border-clay bg-clay-wash/50"
                  : "border-border bg-card hover:border-stone/50",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  method === o.id ? "bg-clay text-cream" : "bg-secondary text-ink-soft",
                )}
              >
                {o.icon}
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-medium text-foreground">
                  {o.label}
                </span>
                <span className="block text-[12px] text-muted-foreground">{o.hint}</span>
              </span>
              {method === o.id && (
                <motion.span layoutId="sig-check" transition={{ duration: 0.3, ease: EASE }}>
                  <Check className="size-4 text-clay" />
                </motion.span>
              )}
            </button>
          ))}
        </div>
      </Reveal>
      <AnimatePresence initial={false}>
        {method === "pin" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.32, ease: EASE }}
            className="overflow-hidden"
          >
            <Input
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Choose a 4-digit PIN"
              className="mt-4 h-12 text-center text-[20px] tracking-[0.3em] tnum"
            />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-auto pt-8">
        <Reveal i={4}>
          <Button
            variant="clay"
            size="lg"
            className="w-full"
            disabled={!canContinue}
            onClick={() => {
              setSignMethod(method);
              if (method === "pin") setUserPin(pin);
              onNext();
            }}
          >
            Continue
            <ArrowRight className="size-4" />
          </Button>
        </Reveal>
      </div>
    </StepBody>
  );
}

/** One permission the app can ask for, and where the asking has got to. */
function PermissionRow({
  icon,
  title,
  body,
  state,
  onAsk,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  state: "idle" | "granted" | "denied";
  onAsk: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card p-4 shadow-card">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-ink-soft">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-foreground">{title}</p>
        <p className="text-[12px] leading-snug text-muted-foreground">{body}</p>
      </div>
      {state === "granted" ? (
        <motion.span
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="flex items-center gap-1 text-[12px] text-clay-deep"
        >
          <Check className="size-3.5" /> On
        </motion.span>
      ) : (
        <Button variant="outline" size="sm" onClick={onAsk}>
          {state === "denied" ? "Retry" : "Allow"}
        </Button>
      )}
    </div>
  );
}

function Permissions({ onNext }: { onNext: () => void }) {
  const [notif, setNotif] = useState<"idle" | "granted" | "denied">("idle");
  const [loc, setLoc] = useState<"idle" | "granted" | "denied">("idle");

  const askNotif = async () => {
    try {
      if (typeof Notification === "undefined") return setNotif("denied");
      const res = await Notification.requestPermission();
      setNotif(res === "granted" ? "granted" : "denied");
    } catch {
      setNotif("denied");
    }
  };

  const askLoc = async () => {
    try {
      await getGpsFix(6000);
      setLocationConsent("granted");
      setLoc("granted");
    } catch {
      setLocationConsent("declined");
      setLoc("denied");
    }
  };

  return (
    <StepBody icon={<BellRing className="size-6" />} title="Stay in the loop">
      <Reveal i={2}>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
          Both are optional, and you can change them anytime in Settings.
        </p>
      </Reveal>
      <Reveal i={3}>
        <div className="mt-5 flex flex-col gap-2.5">
          <PermissionRow
            icon={<BellRing className="size-4" />}
            title="Notifications"
            body="Tee-time reminders and position changes"
            state={notif}
            onAsk={askNotif}
          />
          <PermissionRow
            icon={<MapPin className="size-4" />}
            title="Location"
            body="Confirms you signed your card at the course"
            state={loc}
            onAsk={askLoc}
          />
        </div>
      </Reveal>
      <div className="mt-auto pt-8">
        <Reveal i={4}>
          <Button variant="clay" size="lg" className="w-full" onClick={onNext}>
            Continue
            <ArrowRight className="size-4" />
          </Button>
        </Reveal>
      </div>
    </StepBody>
  );
}

function InstallStep({ onNext }: { onNext: () => void }) {
  const kind = useInstallKind();

  return (
    <StepBody icon={<Smartphone className="size-6" />} title="Keep it one tap away">
      <Reveal i={2}>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
          {kind === "installed"
            ? "You're already running Shimo from your home screen. Perfect."
            : kind === "ios"
              ? "Tap the Share button, then “Add to Home Screen”. It works offline out on the course."
              : "Add Shimo to your home screen. It opens instantly and works offline out on the course."}
        </p>
      </Reveal>
      <Reveal i={3}>
        <div className="mt-7 flex justify-center">
          <motion.div
            className="flex size-24 items-center justify-center rounded-[26px] bg-card shadow-lift"
            initial={{ scale: 0.9, y: 6 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <LogoMark className="size-14" />
          </motion.div>
        </div>
      </Reveal>
      <div className="mt-auto flex flex-col gap-2 pt-8">
        {kind === "native" && (
          <Reveal i={4}>
            <Button
              variant="clay"
              size="lg"
              className="w-full"
              onClick={async () => {
                const ev = window.__shimoInstallEvent;
                if (ev) {
                  await ev.prompt();
                  window.__shimoInstallEvent = null;
                }
                onNext();
              }}
            >
              <Smartphone className="size-4" />
              Add to home screen
            </Button>
          </Reveal>
        )}
        <Reveal i={5}>
          <Button
            variant={kind === "native" ? "ghost" : "clay"}
            size="lg"
            className={cn("w-full", kind === "native" && "text-muted-foreground")}
            onClick={onNext}
          >
            {kind === "native" ? "Maybe later" : "Continue"}
            {kind !== "native" && <ArrowRight className="size-4" />}
          </Button>
        </Reveal>
      </div>
    </StepBody>
  );
}

function Ready({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <Reveal i={0}>
        <motion.div
          className="mt-6 flex size-14 items-center justify-center rounded-2xl bg-clay text-cream"
          initial={{ scale: 0.7, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 16 }}
        >
          <Check className="size-7" />
        </motion.div>
      </Reveal>
      <Reveal i={1}>
        <h1 className="mt-5 font-serif text-[30px] leading-tight text-foreground">
          You&apos;re all set
        </h1>
      </Reveal>
      <Reveal i={2}>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
          Your place on the live board is now yours. When the club starts a
          tournament day you&apos;ll follow it here, and score your own card
          when it&apos;s your turn to play.
        </p>
      </Reveal>
      <div className="mt-auto pt-8">
        <Reveal i={3}>
          <Button variant="clay" size="lg" className="w-full" onClick={onDone}>
            Enter Shimo
            <ArrowRight className="size-4" />
          </Button>
        </Reveal>
      </div>
    </div>
  );
}
